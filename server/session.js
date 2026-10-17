// Game sessions: one per class. Holds players, teams, runs and all socket handlers.
const crypto = require('crypto');
const { QuestionService } = require('./questions');
const CB = require('./combat');
const RUN = require('./run');
const C = require('../shared/content');

const TEAM_STYLES = [
  { name: 'Ember', color: '#ff8a3d' }, { name: 'Frost', color: '#62c8ff' }, { name: 'Thorn', color: '#7fd65b' },
  { name: 'Storm', color: '#b28cff' }, { name: 'Dawn', color: '#ffd256' }, { name: 'Dusk', color: '#ff6f9f' },
  { name: 'Tide', color: '#3fe0c5' }, { name: 'Ash', color: '#cfc6ba' }, { name: 'Moss', color: '#a8c95a' }, { name: 'Iron', color: '#9fb3c8' }
];
const MAX_PLAYERS = 48;
const sessions = new Map();

const now = () => Date.now();
const SPEED = process.env.MATHFALL_FAST === '1' ? 0.12 : 1;
const T = ms => Math.round(ms * SPEED);
const QTE_MS = 10000;          // time to answer a quick-time prompt
const QTE_GRACE = 700;         // network slack on top
const tok = () => crypto.randomBytes(12).toString('hex');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// Teams rank by boss wins, then the ascension and floor they reached.
function teamRank(a, b) { return (b.bossKills - a.bossKills) || ((b.ascNow * 100 + b.floorNow) - (a.ascNow * 100 + a.floorNow)) || (b.bestFloor - a.bestFloor); }

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const c = String(100000 + Math.floor(Math.random() * 900000));
    if (!sessions.has(c)) return c;
  }
  return String(Date.now()).slice(-6);
}

function defaultSettings(s = {}) {
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  return {
    length: ['quick', 'standard', 'long'].includes(s.length) ? s.length : 'quick',
    timer: num(s.timer, 60, 0, 300),
    adaptive: s.adaptive !== false,
    hints: s.hints !== false,
    sound: s.sound !== false,
    teamSize: num(s.teamSize, 4, 1, 6),
    lateJoin: s.lateJoin !== false,
    timeLimit: num(s.timeLimit, 0, 0, 120),
    raid: s.raid !== false,
    raidMinutes: num(s.raidMinutes, 8, 2, 20),
    wrongPause: num(s.wrongPause, 1.5, 0, 6)
  };
}

class Session {
  constructor(io, settings, qconfig) {
    this.io = io;
    this.code = newCode();
    this.hostToken = tok();
    this.hostSockets = new Set();
    this.settings = defaultSettings(settings);
    this.test = null;   // teacher's solo test game: { invincible }
    this.qconfig = qconfig;
    this.qs = new QuestionService({ ...qconfig, hints: this.settings.hints });
    this.state = 'lobby';
    this.players = new Map();
    this.teams = [];
    this.paused = false; this.pausedAt = 0;
    this.createdAt = now(); this.lastActive = now();
    this.qstats = {};
    this.endsAt = 0;
    this.results = null;
    this.hostDirty = true;
    this.watchers = new Map(); // host socket id -> team id
    this.raid = null;
  }

  room(teamId) { return `${this.code}:${teamId}`; }

  // ------------------------------------------------------------ teams
  makeTeam() {
    const style = TEAM_STYLES[this.teams.length % TEAM_STYLES.length];
    const n = Math.floor(this.teams.length / TEAM_STYLES.length);
    const t = { id: 't' + (this.teams.length + 1), name: style.name + (n ? ' ' + (n + 1) : ''), color: style.color, members: [], run: null, history: { runs: 0, bestFloor: 0, bossKills: 0, wipes: 0, bestAsc: 0 } };
    this.teams.push(t);
    return t;
  }
  team(id) { return this.teams.find(t => t.id === id); }
  assignTeam(p) {
    const size = this.settings.teamSize;
    let open = this.teams.filter(t => t.members.length < size);
    let t;
    if (open.length) t = open.sort((a, b) => a.members.length - b.members.length)[0];
    else if (this.state === 'lobby' || !this.teams.length) t = this.makeTeam();
    else t = this.teams.slice().sort((a, b) => a.members.length - b.members.length)[0];
    this.moveToTeam(p, t);
  }
  moveToTeam(p, t) {
    const old = p.teamId && this.team(p.teamId);
    if (old) {
      old.members = old.members.filter(id => id !== p.id);
      if (old.run && old.run.heroes[p.id]) { delete old.run.heroes[p.id]; }
      if (p.socket) p.socket.leave(this.room(old.id));
      this.flush(old);
    }
    p.teamId = t.id;
    if (!t.members.includes(p.id)) t.members.push(p.id);
    if (p.socket) p.socket.join(this.room(t.id));
    if (t.run) this.addHeroIfPossible(t, p);
    this.flush(t);
  }
  balanceTeams() {
    if (this.state !== 'lobby') return;
    const players = [...this.players.values()];
    const size = this.settings.teamSize;
    const count = Math.max(1, Math.ceil(players.length / size));
    while (this.teams.length < count) this.makeTeam();
    this.teams = this.teams.slice(0, count);
    this.teams.forEach(t => { t.members = []; });
    // spread players round-robin, keeping the existing order
    players.forEach((p, i) => { const t = this.teams[i % count]; p.teamId = null; t.members.push(p.id); p.teamId = t.id; });
    for (const p of players) if (p.socket) { for (const t of this.teams) p.socket.leave(this.room(t.id)); p.socket.join(this.room(p.teamId)); }
    this.teams.forEach(t => this.flush(t));
  }
  pruneEmptyTeams() {
    if (this.state !== 'lobby') return;
    this.teams = this.teams.filter(t => t.members.length);
  }

  // ------------------------------------------------------------ players
  addPlayer(name) {
    const p = {
      id: 'p' + (this.players.size + 1) + tok().slice(0, 4), token: tok(), name, socket: null, connected: false, teamId: null,
      cls: null, modified: false, boost: 0, wrongRow: 0, rightRow: 0, pending: null, lastAnswerAt: 0,
      stats: { answered: 0, correct: 0, streak: 0, best: 0, bySkill: {}, wrong: [], modifiedAnswered: 0, time: 0 }, joinedAt: now()
    };
    this.players.set(p.id, p);
    this.assignTeam(p);
    return p;
  }

  trackFor(p) {
    if (!this.qs.hasModified()) return 'main';
    if (p.modified) return 'modified';
    if (this.settings.adaptive && p.boost > 0) return 'modified';
    return 'main';
  }

  // ------------------------------------------------------------ runs
  heroFor(team, p) {
    const H = C.HEROES[p.cls] || C.HEROES.knight;
    const gender = p.gender === 'f' ? 'f' : 'm';
    const skin = p.cls + ':' + gender;
    const same = team.members.map(id => this.players.get(id)).filter(q => q && q.cls === p.cls && (q.gender === 'f' ? 'f' : 'm') === gender);
    const variant = Math.max(0, same.findIndex(q => q.id === p.id)) % 3;
    return {
      id: p.id, name: p.name, cls: p.cls, gender, skin, variant, maxHp: H.hp, hp: H.hp, block: 0, st: {},
      skills: H.skills.map(id => ({ id, lvl: 1 })), items: [], focus: 0, energy: 0, downed: false, acted: false, gold: 0,
      lv: { atk: 0, def: 0, hp: 0 }, free: false, nextFight: null, invincible: !!(this.test && this.test.invincible),
      readyAction: null, lastTarget: null, stats: { dmg: 0, heal: 0, taken: 0, skills: 0 }
    };
  }
  ensureClass(team, p) {
    if (p.cls && C.HEROES[p.cls]) return;
    const taken = new Set(team.members.map(id => this.players.get(id)).filter(Boolean).map(q => q.cls));
    p.cls = C.HERO_ORDER.find(c => !taken.has(c)) || RUN.pick(C.HERO_ORDER);
  }
  startRun(team, asc, keepHeroes) {
    const old = team.run;
    const run = {
      asc: asc || 0, floor: 0, length: this.settings.length, map: RUN.generateMap(this.settings.length), pos: null,
      phase: 'map', votes: {}, voteDeadline: 0, goAt: 0, goNode: null, heroes: {}, combat: null, room: null,
      next: null, outbox: [], seq: team.run ? team.run.seq : 0, startedAt: now(), pendingJoin: []
    };
    team.run = run;
    team.history.runs++;
    for (const id of team.members) {
      const p = this.players.get(id); if (!p) continue;
      this.ensureClass(team, p);
      const prev = keepHeroes && old && old.heroes[p.id];
      // Beating the tower keeps your hero's upgrades, skills and gold for the next climb.
      if (prev) { run.heroes[p.id] = prev; prev.hp = prev.maxHp; prev.downed = false; prev.st = {}; prev.block = 0; prev.readyAction = null; prev.acted = false; }
      else run.heroes[p.id] = this.heroFor(team, p);
      p.pending = null;
    }
    run.seenEvents = [];
    run.map.nodes.forEach(n => { if (n.type === 'boss') n.boss = C.bossForAct(run.asc); });
    this.event(team, { kind: 'system', text: `Act ${run.asc + 1}: ${C.ACT_NAMES[run.asc % C.ACT_NAMES.length]}` });
    this.flush(team);
  }
  addHeroIfPossible(team, p) {
    const run = team.run; if (!run || run.heroes[p.id]) return;
    if (run.phase === 'combat' || (run.room && run.room.type === 'treasure') || (run.room && run.room.type === 'merchant')) {
      if (!run.pendingJoin.includes(p.id)) run.pendingJoin.push(p.id);
      return;
    }
    this.ensureClass(team, p);
    run.heroes[p.id] = this.heroFor(team, p);
  }
  admitPending(team) {
    const run = team.run; if (!run) return;
    for (const id of run.pendingJoin) {
      const p = this.players.get(id);
      if (p && p.teamId === team.id && !run.heroes[id]) { this.ensureClass(team, p); run.heroes[id] = this.heroFor(team, p); }
    }
    run.pendingJoin = [];
  }

  event(team, ev) {
    const run = team.run; if (!run) return;
    ev.seq = ++run.seq;
    run.outbox.push(ev);
  }

  mapOptions(run) {
    if (!run.pos) return run.map.nodes.filter(n => n.row === 0).map(n => n.id);
    const n = run.map.nodes.find(x => x.id === run.pos);
    return n ? n.next : [];
  }

  enterNode(team, nodeId) {
    const run = team.run;
    const node = run.map.nodes.find(n => n.id === nodeId);
    if (!node) return;
    run.pos = node.id; node.visited = true; run.floor = node.row + 1;
    // Difficulty climbs from 1 to 5 over the tower, whatever its height.
    run.depth = 1 + 4 * Math.min(1, node.row / Math.max(1, run.map.rows - 2));
    run.votes = {}; run.voteDeadline = 0; run.goAt = 0; run.goNode = null;
    team.history.bestFloor = Math.max(team.history.bestFloor, run.floor);
    this.admitPending(team);
    const tier = node.row < Math.ceil((run.map.rows - 1) / 2) ? 'normal1' : 'normal2';
    if (node.type === 'enemy') this.startCombat(team, tier);
    else if (node.type === 'elite') this.startCombat(team, 'elite');
    else if (node.type === 'boss') this.startCombat(team, 'boss');
    else if (node.type === 'treasure') this.openRoom(team, RUN.makeTreasureRoom(run, 'treasure'));
    else if (node.type === 'rest') this.openRoom(team, RUN.makeRestRoom(run));
    else if (node.type === 'merchant') this.openRoom(team, RUN.makeMerchantRoom(run));
    else if (node.type === 'unknown') { run.ambushTier = tier; this.openRoom(team, RUN.makeEventRoom(run)); }
    this.flush(team);
  }

  openRoom(team, room) {
    const run = team.run;
    run.phase = 'room'; run.room = room; run.combat = null; room.deadline = 0; room.ready = room.ready || {};
    for (const id of team.members) { const p = this.players.get(id); if (p && p.pending) p.pending = null; }
  }

  startCombat(team, type) {
    const run = team.run;
    run.phase = 'combat'; run.room = null;
    // Enemy health scales with the heroes actually playing (connected) in this team.
    run.activeCount = Math.max(1, team.members.filter(id => { const p = this.players.get(id); return p && p.connected && run.heroes[id]; }).length);
    run.combat = CB.createCombat(run, type);
    CB.beginRound(run, now(), this.settings.timer);
    const bossName = C.ENEMIES[C.bossForAct(run.asc || 0)].name;
    this.event(team, { kind: 'system', text: type === 'boss' ? `${bossName} awakens` : type === 'elite' ? 'An elite foe blocks the way' : 'Monsters!', battle: type });
  }

  // ------------------------------------------------------------ combat flow
  afterHeroAction(team) {
    const run = team.run; const c = run.combat; if (!c) return;
    const out = CB.combatOutcome(run);
    if (run.raidMode && c.raid) { if (this.raid && this.raid.hp <= 0) { this.endRaid(true); return; } }
    if (out === 'won' && c.phase !== 'won') {
      c.phase = 'won';
      this.clearCombatQuestions(team);
      run.next = { time: now() + T(1700), fn: 'win' };
      return;
    }
    this.checkRoundDone(team);
  }
  checkRoundDone(team) {
    const run = team.run; const c = run.combat;
    if (!c || c.phase !== 'player' || run.next) return;
    const waiting = team.members.some(id => {
      const p = this.players.get(id); const h = run.heroes[id];
      return h && p && p.connected && !h.acted;
    });
    if (!waiting) run.next = { time: now() + T(650), fn: 'enemyTurn' };
  }
  clearCombatQuestions(team) {
    for (const id of team.members) {
      const p = this.players.get(id);
      if (p && p.pending && p.pending.intent.kind !== 'event') { p.pending = null; if (p.socket) p.socket.emit('qclose', {}); }
    }
  }
  runStep(team, fn) {
    const run = team.run; const c = run.combat;
    if (fn === 'enemyTurn' && c && c.phase === 'player') {
      // A big move with a quick-time prompt goes first: everyone answers, then it lands.
      if (!c.qteDone) {
        const big = CB.aliveEnemies(c).find(e => e.intent && e.intent.qte && !e.st.freeze && !e.st.stun);
        if (big) { this.startQTE(team, big); this.flush(team); return; }
      }
      c.qteDone = false;
      c.phase = 'enemy'; c.roundEndsAt = 0;
      const evs = CB.enemyTurn(run);
      let total = 350;
      for (const ev of evs) { this.event(team, ev); total += ev.dur || 900; }
      const out = CB.combatOutcome(run);
      if (run.raidMode && this.raid && this.raid.hp <= 0) { run.next = { time: now() + T(total), fn: 'raidCheck' }; }
      else if (out === 'lost') run.next = { time: now() + T(total + 400), fn: 'lose' };
      else if (out === 'won') { c.phase = 'won'; this.clearCombatQuestions(team); run.next = { time: now() + T(total + 900), fn: 'win' }; }
      else run.next = { time: now() + T(total), fn: 'nextRound' };
    } else if (fn === 'nextRound' && c) {
      CB.beginRound(run, now(), this.settings.timer);
      this.event(team, { kind: 'round', round: c.round });
      for (const h of CB.heroList(run)) {
        if (h.readyAction && !h.downed) {
          const ra = h.readyAction; h.readyAction = null;
          const evs = [];
          if (ra.whiff) { CB.whiff(run, h, ra.action, ra.target, evs); evs.forEach(e => this.event(team, e)); continue; }
          let res = CB.heroAction(run, h, ra.action, ra.target, evs);
          if (!res.ok && ra.action !== 'rise') res = CB.heroAction(run, h, 'attack', ra.target, evs);
          evs.forEach(e => this.event(team, e));
          if (CB.combatOutcome(run) === 'won') break;
        } else h.readyAction = null;
      }
      this.afterHeroAction(team);
    } else if (fn === 'win' && c) {
      this.winCombat(team);
    } else if (fn === 'raidCheck') {
      if (this.raid && this.raid.hp <= 0) this.endRaid(true);
    } else if (fn === 'lose' && c && run.raidMode) {
      // In the raid a fallen team regroups instead of losing the run.
      for (const h of CB.heroList(run)) { h.downed = false; h.hp = Math.max(h.hp, Math.round(h.maxHp * 0.5)); h.st = {}; }
      this.event(team, { kind: 'system', text: 'Your team regroups!' });
      run.next = { time: now() + T(1200), fn: 'nextRound' };
    } else if (fn === 'lose' && c) {
      team.history.wipes++;
      this.clearCombatQuestions(team);
      this.openRoom(team, { type: 'defeat', floor: run.floor, ready: {} });
    } else if (fn === 'roomAdvance') {
      this.advanceRoom(team, true);
    } else if (fn === 'go' && run.goNode) {
      this.enterNode(team, run.goNode);
      return;
    }
    this.flush(team);
  }
  winCombat(team) {
    const run = team.run; const c = run.combat;
    const type = c.type;
    const gold = (type === 'boss' ? 80 : type === 'elite' ? RUN.ri(35, 45) : RUN.ri(18, 28)) + (run.ambushBonus || 0);
    run.ambushBonus = 0;
    for (const h of CB.heroList(run)) {
      h.gold += C.hasItem(h, 'lucky_coin') ? Math.round(gold * 1.25) : gold;
      if (h.downed) { h.downed = false; h.hp = Math.round(h.maxHp * 0.25); }
      else h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.1) + (C.hasItem(h, 'bandage_roll') ? 5 : 0));
      h.block = 0; h.st = {}; h.readyAction = null; h.acted = false;
    }
    if (type === 'boss') {
      team.history.bossKills++;
      team.history.bestAsc = Math.max(team.history.bestAsc, run.asc + 1);
      const beat = C.bossForAct(run.asc || 0), next = C.bossForAct((run.asc || 0) + 1);
      this.openRoom(team, { type: 'complete', gold, asc: run.asc, boss: C.ENEMIES[beat].name, nextBoss: C.ENEMIES[next].name, nextAct: C.ACT_NAMES[((run.asc || 0) + 1) % C.ACT_NAMES.length], ready: {}, stats: {} });
    } else {
      this.openRoom(team, { type: 'victory', gold, elite: type === 'elite', ready: {}, stats: {} });
    }
  }
  advanceRoom(team, forced) {
    const run = team.run; const room = run.room; if (!room) return;
    if (room.type === 'victory' && room.elite) { this.openRoom(team, RUN.makeTreasureRoom(run, 'elite')); this.flush(team); return; }
    if (room.type === 'complete') { this.openRoom(team, RUN.makeTreasureRoom(run, 'boss')); this.flush(team); return; }   // the boss's chest, then the next act
    if (room.type === 'raidEnd') return;
    if (room.type === 'event' && room.event === 'ambush' && this.resolveAmbush(team)) return;
    if (room.type === 'defeat') { this.startRun(team, run.asc); return; }
    // anyone who didn't decide on a chest keeps their loadout
    if (room.type === 'treasure') for (const [pid, ch] of Object.entries(room.chests)) {
      const h = run.heroes[pid];
      if (h && !ch.decided) { ch.opened = true; ch.decided = true; h.gold += ch.gold; ch.choice = { gold: ch.gold }; }
    }
    if (room.type === 'treasure' && room.kind === 'boss') { this.startRun(team, run.asc + 1, true); return; }
    run.phase = 'map'; run.room = null;
    this.admitPending(team);
    this.event(team, { kind: 'system', text: 'Choose your path' });
    this.flush(team);
  }
  checkRoomReady(team) {
    const run = team.run; const room = run && run.room; if (!room) return;
    const needed = team.members.filter(id => { const p = this.players.get(id); return p && p.connected && run.heroes[id]; });
    const allReady = needed.every(id => room.ready[id]);
    if (allReady && needed.length) { run.next = { time: now() + T(500), fn: 'roomAdvance' }; }
    else if (!room.deadline && Object.keys(room.ready).length) room.deadline = now() + T(60000);
  }


  // ------------------------------------------------------------ quick-time events
  startQTE(team, e) {
    const run = team.run; const c = run.combat;
    c.phase = 'qte'; c.roundEndsAt = 0;
    c.qte = { enemy: e.id, name: e.intent.label, total: e.intent.qte || 1, i: 0, res: {}, per: {}, endsAt: 0 };
    this.event(team, { kind: 'qte', actor: e.id, name: e.intent.label, total: c.qte.total });
    this.newQTEPrompt(team);
  }
  newQTEPrompt(team) {
    const run = team.run; const c = run.combat; const q = c.qte;
    q.per = {};
    for (const h of CB.aliveHeroes(run)) {
      const p = this.players.get(h.id);
      if (!p || !p.connected) continue;
      const g = C.qteQuestion(run.raidMode ? 2 : 1);
      q.per[h.id] = { q: g.q, a: g.a, answered: false, ok: false, value: '' };
    }
    q.endsAt = now() + T(QTE_MS + QTE_GRACE);
    if (!Object.keys(q.per).length) q.endsAt = now();
  }
  answerQTE(team, p, value) {
    const run = team && team.run; const c = run && run.combat; const q = c && c.qte;
    if (!q || c.phase !== 'qte') return { ok: false };
    const me = q.per[p.id]; if (!me || me.answered) return { ok: false };
    me.answered = true; me.value = String(value).slice(0, 12);
    const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    me.ok = String(value).trim() !== '' && n === me.a;
    p.stats.qte = p.stats.qte || { a: 0, c: 0 }; p.stats.qte.a++; if (me.ok) p.stats.qte.c++;
    if (Object.values(q.per).every(x => x.answered)) this.advanceQTE(team);
    return { ok: true, correct: me.ok, answer: me.a };
  }
  advanceQTE(team) {
    const run = team.run; const c = run.combat; const q = c.qte; if (!q) return;
    const results = {};
    for (const h of CB.heroList(run)) {
      const r = q.per[h.id];
      const ok = !!(r && r.ok);
      (q.res[h.id] = q.res[h.id] || [])[q.i] = ok;
      results[h.id] = ok;
    }
    this.event(team, { kind: 'qteResult', i: q.i, total: q.total, results });
    q.i++;
    if (q.i < q.total) { this.newQTEPrompt(team); q.endsAt += T(900); this.flush(team); return; }
    c.qteRes = q.res; c.qte = null; c.qteDone = true; c.phase = 'player';
    run.next = { time: now() + T(700), fn: 'enemyTurn' };
    this.flush(team);
  }

  // ------------------------------------------------------------ "?" events
  applyEventOption(team, h, evId, opt, correct) {
    const run = team.run;
    const lose = n => { const b = h.hp; h.hp = Math.max(1, h.hp - n); return b - h.hp; };
    const heal = n => { const b = h.hp; h.hp = Math.min(h.maxHp, h.hp + Math.round(n)); return h.hp - b; };
    const key = evId + ':' + opt;
    switch (key) {
      case 'nest:eat': h.maxHp += 6; h.hp += 6; return '+6 Max HP';
      case 'nest:sell': h.gold += 45; return '+45 gold';
      case 'vines:hack': { const l = lose(8); h.nextFight = { ...(h.nextFight || {}), energy: ((h.nextFight || {}).energy || 0) + 4 }; return `−${l} HP · +4 energy next fight`; }
      case 'vines:around': { const g = Math.min(15, h.gold); h.gold -= g; return g ? `−${g} gold` : 'You squeeze through for free'; }
      case 'shrine:pray': if (correct) { const hl = heal(h.maxHp * 0.2); h.gold += 35; return `Blessed! +${hl} HP · +35 gold`; } return 'The shrine stays silent';
      case 'shrine:leave': return 'You bow and move on';
      case 'dealer:bet': if (correct) { h.gold += 30; return 'You win! +30 gold'; } h.gold = Math.max(0, h.gold - 30); return 'The imp cackles. −30 gold';
      case 'dealer:walk': return 'You keep your coins';
      case 'library:study': {
        const l = lose(6);
        const up = h.skills.filter(sk => sk.lvl < 2);
        if (up.length) { const sk = RUN.pick(up); sk.lvl = 2; return `${C.skillName(sk.id, 2)}! −${l} HP`; }
        h.gold += 30; return `Your skills are already mastered: +30 gold · −${l} HP`;
      }
      case 'library:nook': return `+${heal(h.maxHp * 0.15)} HP`;
      case 'mimic:open': if (Math.random() < 0.6) { h.lv.atk++; return 'A whetstone! +1 Attack level'; } return `It bites! −${lose(12)} HP`;
      case 'mimic:leave': return 'Probably wise';
      case 'adventurer:search': if (correct) { h.gold += 50; return 'You disarm the trap: +50 gold'; } return `The trap springs! −${lose(10)} HP`;
      case 'adventurer:respect': return `You feel at peace. +${heal(10)} HP`;
      case 'fountain:deep': h.maxHp = Math.max(20, h.maxHp - 4); h.hp = h.maxHp; return 'Fully healed · −4 Max HP';
      case 'fountain:sip': return `+${heal(h.maxHp * 0.2)} HP`;
      case 'forge:sharpen': { const l = lose(8); h.lv.atk++; return `+1 Attack level · −${l} HP`; }
      case 'forge:armour': h.gold -= 40; h.lv.def++; return '+1 Defence level · −40 gold';
      case 'forge:leave': return 'You move on';
      case 'ambush:fight': return 'Weapons ready!';
      case 'ambush:sneak': return correct ? 'Silent as a shadow' : 'You stepped on a twig…';
    }
    return '';
  }
  resolveEventChoice(team, p, intent, correct) {
    const run = team && team.run; const room = run && run.room; const h = run && run.heroes[p.id];
    if (!room || room.type !== 'event' || room.event !== intent.event || !h || room.choices[p.id]) return '';
    room.choices[p.id] = intent.opt; room.correct[p.id] = !!correct;
    const result = this.applyEventOption(team, h, intent.event, intent.opt, correct);
    room.results[p.id] = result;
    if (C.EVENTS[intent.event].team) { room.ready[p.id] = true; this.checkRoomReady(team); }
    return result;
  }
  resolveAmbush(team) {
    // Team decision: slip past only if nobody chose to fight and every sneak answered right.
    const run = team.run; const room = run.room;
    const ids = Object.keys(run.heroes);
    const allSneaked = ids.every(id => room.choices[id] === 'sneak' && room.correct[id]);
    if (allSneaked) { this.event(team, { kind: 'system', text: 'You slipped past!' }); return false; }
    for (const id of ids) if (room.choices[id] === 'sneak' && !room.correct[id]) { const h = run.heroes[id]; h.hp = Math.max(1, h.hp - 5); }
    if (Object.values(room.choices).includes('fight')) run.ambushBonus = 20;
    this.event(team, { kind: 'system', text: 'Ambush!' });
    this.startCombat(team, run.ambushTier || 'normal1');
    this.flush(team);
    return true;
  }

  // ------------------------------------------------------------ raid boss
  startRaid() {
    if (this.raid || this.state !== 'playing') return;
    for (const t of this.teams) if (t.members.length && !t.run) this.startRun(t, 0);
    const teams = this.teams.filter(t => t.run && t.members.length);
    let heroes = 0, ascSum = 0;
    for (const t of teams) { this.admitPending(t); heroes += Object.keys(t.run.heroes).length; ascSum += t.run.asc || 0; }
    const avgAsc = teams.length ? ascSum / teams.length : 0;
    const maxHp = Math.max(200, Math.round(C.ENEMIES.voidmaw.hp * Math.max(1, heroes) * (1 + 0.15 * avgAsc)));
    this.raid = { hp: maxHp, maxHp, dmg: {}, hits: [], startedAt: now(), endsAt: now() + this.settings.raidMinutes * 60000, over: false, won: false, endAt: 0 };
    this.endsAt = this.raid.endsAt;
    for (const t of teams) {
      const run = t.run;
      for (const id of t.members) { const p = this.players.get(id); if (p && p.pending) { p.pending = null; if (p.socket) p.socket.emit('qclose', {}); } }
      run.next = null; run.goAt = 0; run.goNode = null; run.voteDeadline = 0; run.votes = {};
      for (const h of CB.heroList(run)) {
        h.downed = false; h.hp = Math.max(h.hp, Math.ceil(h.maxHp * 0.8)); h.st = {}; h.block = 0; h.readyAction = null;
        h.raidStart = h.stats.dmg;
      }
      run.phase = 'combat'; run.room = null; run.raidMode = true;
      run.combat = CB.createRaidCombat(run, this.raid, t.id);
      CB.beginRound(run, now(), this.settings.timer);
      this.event(t, { kind: 'system', text: 'The Inferno Dragon, Heart of the Tower, awakens!', battle: 'raid' });
      this.flush(t);
    }
  }
  endRaid(won) {
    const raid = this.raid; if (!raid || raid.over) return;
    raid.over = true; raid.won = won; raid.endAt = now() + T(9000);
    this.endsAt = 0;
    for (const t of this.teams) {
      const run = t.run; if (!run) continue;
      this.clearCombatQuestions(t);
      run.next = null;
      if (run.combat) run.combat.phase = won ? 'won' : 'lost';
      this.event(t, { kind: 'system', text: won ? 'The Inferno Dragon is defeated!' : 'Time is up. The Inferno Dragon survives…' });
      run.phase = 'room'; run.room = { type: 'raidEnd', won, ready: {} };
      this.flush(t);
    }
  }
  raidPublic(team) {
    const raid = this.raid; if (!raid) return null;
    const allies = [];
    for (const t of this.teams) {
      if (t === team || !t.run) continue;
      for (const h of Object.values(t.run.heroes)) if (allies.length < 24) allies.push({ cls: h.cls, skin: h.skin, variant: h.variant, downed: h.downed, color: t.color });
    }
    return { hp: raid.hp, maxHp: raid.maxHp, endsAt: raid.endsAt, over: raid.over, won: raid.won,
      teams: this.teams.filter(t => t.run).map(t => ({ id: t.id, name: t.name, color: t.color, dmg: Math.round(raid.dmg[t.id] || 0) })).sort((a, b) => b.dmg - a.dmg),
      allies };
  }

  // ------------------------------------------------------------ voting
  tallyVotes(team) {
    const run = team.run;
    const voters = team.members.filter(id => { const p = this.players.get(id); return p && p.connected && run.heroes[id]; });
    const counts = {};
    for (const id of voters) if (run.votes[id]) counts[run.votes[id]] = (counts[run.votes[id]] || 0) + 1;
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return;
    const allVoted = voters.every(id => run.votes[id]);
    const [top, n] = entries[0];
    const tie = entries[1] && entries[1][1] === n;
    if ((n > voters.length / 2) || (allVoted && !tie) || voters.length === 1) {
      run.goNode = top; run.goAt = now() + T(voters.length === 1 ? 500 : 1300);
    } else if (allVoted && tie) {
      const tied = entries.filter(e => e[1] === n).map(e => e[0]);
      run.goNode = RUN.pick(tied); run.goAt = now() + T(1600);
    } else if (!run.voteDeadline) run.voteDeadline = now() + T(20000);
  }

  // ------------------------------------------------------------ questions
  serveQuestion(p, intent) {
    const track = this.trackFor(p);
    const served = this.qs.serve(p, track, intent.kind);
    if (!served) return null;
    if (p.boost > 0) p.boost--;
    p.pending = { intent, priv: served.priv, pub: served.pub, answered: false, lockUntil: 0, servedAt: now() };
    return served.pub;
  }
  sendPending(p) {
    if (!p.socket) return;
    if (p.pending && !p.pending.answered) p.socket.emit('q', { ...p.pending.pub, intent: p.pending.intent });
  }

  recordAnswer(p, priv, correct, given) {
    const s = p.stats;
    s.answered++; if (correct) s.correct++;
    s.time += Math.min(120000, now() - (p.pending ? p.pending.servedAt : now()));
    if (priv.track === 'modified') s.modifiedAnswered++;
    if (correct) { s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
    const sk = priv.q.skill || 'General';
    s.bySkill[sk] = s.bySkill[sk] || { a: 0, c: 0 };
    s.bySkill[sk].a++; if (correct) s.bySkill[sk].c++;
    if (!correct && s.wrong.length < 60) s.wrong.push({ q: priv.q.q, given: priv.type === 'mc' ? (p.pending.pub.options[parseInt(given, 10)] || '') : String(given).slice(0, 60), correct: priv.correctText, solution: priv.q.solution || '' });
    const key = priv.key.startsWith('g:') ? priv.key + ':' + priv.q.q : priv.key;
    const qs = this.qstats[key] || (this.qstats[key] = { text: priv.q.q, skill: sk, track: priv.track, asked: 0, correct: 0, gen: priv.key.startsWith('g:') });
    qs.asked++; if (correct) qs.correct++;
    // adaptive difficulty
    if (correct) { p.wrongRow = 0; p.rightRow++; if (p.boost > 0 && p.rightRow >= 2) p.boost = 0; }
    else { p.rightRow = 0; p.wrongRow++; if (this.settings.adaptive && p.wrongRow >= 2 && !p.modified) { p.boost = 4; p.wrongRow = 0; } }
    this.hostDirty = true;
  }

  // ------------------------------------------------------------ emit
  teamPublic(team) {
    const run = team.run;
    const base = { code: this.code, state: this.state, paused: this.paused, now: now(), sound: this.settings.sound, timer: this.settings.timer,
      team: { id: team.id, name: team.name, color: team.color, history: team.history },
      members: team.members.map(id => { const p = this.players.get(id); return p ? { id, name: p.name, cls: p.cls, gender: p.gender, connected: p.connected } : null; }).filter(Boolean) };
    if (this.raid) base.raid = this.raidPublic(team);
    if (!run) return base;
    const order = team.members.filter(id => run.heroes[id]);
    base.run = {
      asc: run.asc, floor: run.floor, rows: run.map.rows, length: run.length, phase: run.phase,
      map: { nodes: run.map.nodes.map(n => ({ id: n.id, row: n.row, type: n.type, x: n.x, y: n.y, next: n.next, visited: !!n.visited, boss: n.boss })), pos: run.pos, options: run.phase === 'map' ? this.mapOptions(run) : [], votes: run.votes, voteDeadline: run.voteDeadline, goNode: run.goNode },
      heroes: order.map(id => {
        const h = run.heroes[id]; const p = this.players.get(id);
        return { id, name: h.name, cls: h.cls, skin: h.skin, variant: h.variant, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, skills: h.skills, items: h.items || [], focus: h.focus, energy: h.energy || 0, downed: h.downed, acted: h.acted, ready: !!h.readyAction, gold: h.gold, lv: h.lv, free: !!h.free, nextFight: h.nextFight,
          connected: !!(p && p.connected), busy: p && p.pending && !p.pending.answered ? (p.pending.intent.action || p.pending.intent.kind) : null };
      }),
      waiting: run.pendingJoin,
      combat: run.combat ? { round: run.combat.round, phase: run.combat.phase, roundEndsAt: run.combat.roundEndsAt, type: run.combat.type, enemies: run.combat.enemies.map(CB.publicEnemy), qte: run.combat.qte ? { total: run.combat.qte.total, i: run.combat.qte.i, endsAt: run.combat.qte.endsAt, name: run.combat.qte.name } : null } : null,
      raidMode: !!run.raidMode,
      room: run.room ? this.publicRoom(run.room) : null
    };
    return base;
  }
  publicRoom(room) {
    const o = { type: room.type, ready: room.ready, deadline: room.deadline || 0 };
    if (room.type === 'treasure') { o.kind = room.kind; o.event = room.event; o.chests = {}; for (const [k, v] of Object.entries(room.chests)) o.chests[k] = { rarity: v.rarity, opened: v.opened, decided: v.decided, choice: v.choice || null }; }
    if (room.type === 'rest') o.choices = room.choices;
    if (room.type === 'event') { o.event = room.event; o.choices = room.choices; o.results = room.results; }
    if (room.type === 'victory' || room.type === 'complete') { o.gold = room.gold; o.elite = room.elite; o.asc = room.asc; o.stats = room.stats || {}; o.boss = room.boss; o.nextBoss = room.nextBoss; o.nextAct = room.nextAct; }
    if (room.type === 'raidEnd') { o.won = room.won; }
    if (room.type === 'defeat') o.floor = room.floor;
    return o;
  }
  youFor(team, p) {
    const run = team.run;
    const you = { id: p.id, name: p.name, cls: p.cls, gender: p.gender, track: this.trackFor(p) === 'modified' ? 'support' : 'main', joining: !!(run && !run.heroes[p.id]), test: this.test };
    if (p.pending) you.pendingQ = p.pending.answered ? null : p.pending.pub.qid;
    const room = run && run.room;
    if (room && room.type === 'treasure' && room.chests[p.id]) { const ch = room.chests[p.id]; you.chest = { rarity: ch.rarity, opened: ch.opened, decided: ch.decided, choice: ch.choice || null, gold: ch.opened ? ch.gold : 0, skill: ch.opened ? ch.skill : null, item: ch.opened ? ch.item : null }; }
    if (room && room.type === 'merchant' && room.stock[p.id]) you.stock = room.stock[p.id];
    const c = run && run.combat;
    if (c && c.phase === 'qte' && c.qte && c.qte.per[p.id]) {
      const me = c.qte.per[p.id];
      you.qte = { key: c.qte.enemy + ':' + c.round + ':' + c.qte.i, q: me.q, i: c.qte.i, total: c.qte.total, endsAt: c.qte.endsAt, answered: me.answered, ok: me.ok, name: c.qte.name };
      if (process.env.MATHFALL_TEST === '1') you.qte._answer = me.a;
    }
    return you;
  }
  flush(team) {
    if (!team) return;
    const pub = this.teamPublic(team);
    const events = team.run ? team.run.outbox.splice(0) : [];
    // The tower map is over half of every update but rarely changes: send it only when it has changed since this
    // device last got it (a device that joins or reconnects gets it again). The client keeps its last copy.
    let mapKey = null, lean = null;
    if (pub.run && pub.run.map) { mapKey = JSON.stringify(pub.run.map); const { map, ...rest } = pub.run; lean = { ...pub, run: rest }; }
    for (const id of team.members) {
      const p = this.players.get(id);
      if (!p || !p.socket || !p.connected) continue;
      const fresh = !mapKey || p.mapSent !== mapKey || p.mapSock !== p.socket.id;
      if (mapKey && fresh) { p.mapSent = mapKey; p.mapSock = p.socket.id; }
      p.socket.emit('state', { ...(fresh ? pub : lean), you: this.youFor(team, p), events });
    }
    for (const [sid, tid] of this.watchers) {
      if (tid !== team.id) continue;
      const s = this.io.sockets.sockets.get(sid);
      if (s) s.emit('watch', { ...pub, events });
    }
    this.hostDirty = true;
  }
  flushAll() { this.teams.forEach(t => this.flush(t)); }

  hostState() {
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, connected: p.connected, teamId: p.teamId, cls: p.cls, skin: p.cls ? p.cls + ':' + (p.gender || 'm') : null, modified: p.modified, support: this.trackFor(p) === 'modified',
      answered: p.stats.answered, correct: p.stats.correct, streak: p.stats.streak, best: p.stats.best, busy: !!(p.pending && !p.pending.answered)
    }));
    const teams = this.teams.map(t => {
      const run = t.run;
      const o = { id: t.id, name: t.name, color: t.color, members: t.members, history: t.history };
      if (run) {
        o.phase = run.phase; o.floor = run.floor; o.rows = run.map.rows; o.asc = run.asc; o.length = run.length; o.boss = C.bossForAct(run.asc || 0);
        o.heroCls = Object.values(run.heroes).map(h => ({ cls: h.cls, skin: h.skin, variant: h.variant, downed: h.downed }));
        o.node = run.pos ? (run.map.nodes.find(n => n.id === run.pos) || {}).type : null;
        o.room = run.room ? run.room.type : null;
        o.heroes = Object.values(run.heroes).map(h => ({ id: h.id, name: h.name, cls: h.cls, skin: h.skin, hp: h.hp, maxHp: h.maxHp, downed: h.downed }));
        if (run.combat) o.combat = { round: run.combat.round, phase: run.combat.phase, type: run.combat.type, enemies: run.combat.enemies.filter(e => !e.dead).map(e => ({ name: e.name, hp: e.hp, maxHp: e.maxHp })) };
      }
      return o;
    });
    const raid = this.raid ? { hp: this.raid.hp, maxHp: this.raid.maxHp, endsAt: this.raid.endsAt, over: this.raid.over, won: this.raid.won, dmg: this.raid.dmg } : null;
    return { code: this.code, state: this.state, settings: this.settings, paused: this.paused, endsAt: this.endsAt, now: now(), raid, questions: this.qs.summary(), players, teams, results: this.state === 'ended' ? this.results : null };
  }
  emitHost(force) {
    if (!force && !this.hostDirty) return;
    this.hostDirty = false;
    const st = this.hostState();
    for (const sid of this.hostSockets) { const s = this.io.sockets.sockets.get(sid); if (s) s.emit('host:state', st); }
  }

  buildResults() {
    const players = [...this.players.values()].map(p => {
      const team = this.team(p.teamId);
      const h = team && team.run && team.run.heroes[p.id];
      return {
        id: p.id, name: p.name, team: team ? team.name : '', cls: p.cls, skin: p.cls ? p.cls + ':' + (p.gender || 'm') : null, modified: p.modified,
        answered: p.stats.answered, correct: p.stats.correct, best: p.stats.best,
        pct: p.stats.answered ? Math.round(100 * p.stats.correct / p.stats.answered) : 0,
        supportAnswered: p.stats.modifiedAnswered,
        avgSec: p.stats.answered ? Math.round(p.stats.time / p.stats.answered / 100) / 10 : 0,
        bySkill: p.stats.bySkill, wrong: p.stats.wrong,
        dmg: h ? h.stats.dmg : 0, heal: h ? h.stats.heal : 0,
        raidDmg: h && h.raidStart != null ? h.stats.dmg - h.raidStart : 0,
        qte: p.stats.qte || null
      };
    });
    const questions = Object.values(this.qstats).map(q => ({ ...q, pct: q.asked ? Math.round(100 * q.correct / q.asked) : 0 }))
      .sort((a, b) => a.pct - b.pct || b.asked - a.asked);
    const skills = {};
    for (const p of this.players.values()) for (const [k, v] of Object.entries(p.stats.bySkill)) { skills[k] = skills[k] || { a: 0, c: 0 }; skills[k].a += v.a; skills[k].c += v.c; }
    const teams = this.teams.map(t => ({ name: t.name, color: t.color, members: t.members.map(id => (this.players.get(id) || {}).name).filter(Boolean), ...t.history, floorNow: t.run ? t.run.floor : 0, ascNow: t.run ? t.run.asc : 0 }));
    const raid = this.raid ? { won: this.raid.won, maxHp: this.raid.maxHp, hp: this.raid.hp, teams: this.teams.map(t => ({ name: t.name, color: t.color, dmg: Math.round(this.raid.dmg[t.id] || 0) })).sort((a, b) => b.dmg - a.dmg) } : null;
    return { players, questions, skills, teams, raid, endedAt: now(), title: this.qs.title };
  }

  end() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.results = this.buildResults();
    for (const p of this.players.values()) {
      if (!p.socket) continue;
      const mine = this.results.players.find(r => r.id === p.id);
      const team = this.team(p.teamId);
      p.socket.emit('ended', { you: mine, raid: this.results.raid, team: team ? { name: team.name, color: team.color, history: team.history } : null,
        podium: this.results.teams.slice().sort(teamRank).slice(0, 3) });
    }
    this.emitHost(true);
  }

  // ------------------------------------------------------------ timers
  tick(t) {
    if (this.state === 'playing' && !this.paused) {
      if (this.raid && this.raid.over) { if (t >= this.raid.endAt) this.end(); }
      else if (this.raid) {
        if (this.raid.hp <= 0) this.endRaid(true);
        else if (t >= this.raid.endsAt) this.endRaid(false);
      } else if (this.endsAt && t >= this.endsAt) {
        if (this.settings.raid) this.startRaid(); else this.end();
      }
    }
    if (this.state !== 'playing' || this.paused) return;
    // Raid: tell every other team when someone lands a hit on the shared boss.
    if (this.raid && this.raid.hits.length && !this.raid.over) {
      const byTeam = {};
      for (const hh of this.raid.hits) byTeam[hh.teamId] = (byTeam[hh.teamId] || 0) + hh.d;
      this.raid.hits = [];
      for (const team of this.teams) {
        if (!team.run || !team.run.raidMode) continue;
        for (const [tid, d] of Object.entries(byTeam)) if (tid !== team.id) { const src = this.team(tid); this.event(team, { kind: 'raidhit', dmg: Math.round(d), color: src ? src.color : '#fff', team: src ? src.name : '' }); }
        this.flush(team);
      }
    }
    for (const team of this.teams) {
      const run = team.run; if (!run) continue;
      if (run.next && t >= run.next.time) { const fn = run.next.fn; run.next = null; this.runStep(team, fn); continue; }
      if (run.combat && run.combat.phase === 'qte' && run.combat.qte && t >= run.combat.qte.endsAt) { this.advanceQTE(team); continue; }
      if (run.phase === 'combat' && run.combat && run.combat.phase === 'player' && run.combat.roundEndsAt && t >= run.combat.roundEndsAt && !run.next) {
        run.next = { time: t, fn: 'enemyTurn' };
      }
      if (run.phase === 'map') {
        if (run.goAt && t >= run.goAt) { run.goAt = 0; this.runStep(team, 'go'); continue; }
        if (run.voteDeadline && t >= run.voteDeadline && !run.goAt) {
          const counts = {};
          for (const v of Object.values(run.votes)) counts[v] = (counts[v] || 0) + 1;
          const best = Object.entries(counts).sort((a, b) => b[1] - a[1]);
          run.voteDeadline = 0;
          if (best.length) { run.goNode = best[0][0]; run.goAt = t + 300; }
        }
      }
      if (run.phase === 'room' && run.room && run.room.deadline && t >= run.room.deadline && !run.next) {
        run.room.deadline = 0; run.next = { time: t, fn: 'roomAdvance' };
      }
    }
  }
  shiftDeadlines(ms) {
    if (this.endsAt) this.endsAt += ms;
    for (const t of this.teams) {
      const run = t.run; if (!run) continue;
      if (run.next) run.next.time += ms;
      if (run.combat && run.combat.roundEndsAt) run.combat.roundEndsAt += ms;
      if (run.voteDeadline) run.voteDeadline += ms;
      if (run.goAt) run.goAt += ms;
      if (run.room && run.room.deadline) run.room.deadline += ms;
      if (run.combat && run.combat.qte) run.combat.qte.endsAt += ms;
    }
    if (this.raid) { this.raid.endsAt += ms; if (this.raid.endAt) this.raid.endAt += ms; }
  }
}

// ================================================================ socket wiring
function attach(io, banks) {
  const getSession = code => sessions.get(String(code || '').trim());

  setInterval(() => {
    const t = now();
    for (const [code, s] of sessions) {
      try { s.tick(t); s.emitHost(false); } catch (e) { console.error('tick error', code, e); }
      const anyone = s.hostSockets.size || [...s.players.values()].some(p => p.connected);
      if (anyone) s.lastActive = t;
      if (t - s.lastActive > 3 * 3600 * 1000) sessions.delete(code);
    }
  }, 200);
  // Host summary refresh for timers (cheap): once a second
  setInterval(() => { for (const s of sessions.values()) if (s.state === 'playing') s.hostDirty = true; }, 1000);

  io.on('connection', socket => {
    let me = null;        // { s, p } for students
    let hosting = null;   // session for hosts
    const reply = (cb, data) => { if (typeof cb === 'function') cb(data); };
    const guard = fn => (...args) => { try { fn(...args); } catch (e) { console.error(e); const cb = args[args.length - 1]; reply(cb, { ok: false, msg: 'Something went wrong. Try again.' }); } };

    // ------------------------------------------------ host
    socket.on('host:create', guard((data, cb) => {
      const qconfig = buildQConfig(data && data.questions, banks);
      const test = new QuestionService(qconfig);
      if (test.isEmpty) return reply(cb, { ok: false, msg: 'Add at least one question set or topic first.' });
      const s = new Session(io, data && data.settings, qconfig);
      if (data && data.test) s.test = { invincible: !!data.test.invincible };
      sessions.set(s.code, s);
      s.hostSockets.add(socket.id); hosting = s;
      reply(cb, { ok: true, code: s.code, hostToken: s.hostToken });
      s.emitHost(true);
    }));
    socket.on('host:resume', guard((data, cb) => {
      const s = getSession(data && data.code);
      if (!s || s.hostToken !== data.hostToken) return reply(cb, { ok: false });
      s.hostSockets.add(socket.id); hosting = s;
      reply(cb, { ok: true, code: s.code });
      s.emitHost(true);
    }));
    const hostOnly = fn => guard((data, cb) => { if (!hosting) return reply(cb, { ok: false, msg: 'Not hosting.' }); fn(hosting, data || {}, cb); hosting.emitHost(true); });

    socket.on('host:settings', hostOnly((s, d, cb) => {
      const prevLen = s.settings.length;
      s.settings = defaultSettings({ ...s.settings, ...d.settings });
      if (s.state !== 'lobby') s.settings.length = prevLen;
      s.qs.hints = s.settings.hints;
      s.flushAll();
      reply(cb, { ok: true });
    }));
    socket.on('host:questions', hostOnly((s, d, cb) => {
      const qconfig = buildQConfig(d.questions, banks);
      const q = new QuestionService({ ...qconfig, hints: s.settings.hints });
      if (q.isEmpty) return reply(cb, { ok: false, msg: 'That selection has no questions.' });
      s.qconfig = qconfig; s.qs = q;
      reply(cb, { ok: true, summary: q.summary() });
    }));
    socket.on('host:move', hostOnly((s, d, cb) => {
      const p = s.players.get(d.pid); let t = s.team(d.teamId);
      if (!p) return reply(cb, { ok: false });
      if (d.teamId === 'new') t = s.makeTeam();
      if (!t) return reply(cb, { ok: false });
      s.moveToTeam(p, t); s.pruneEmptyTeams();
      reply(cb, { ok: true });
    }));
    socket.on('host:balance', hostOnly((s, d, cb) => { s.balanceTeams(); reply(cb, { ok: true }); }));
    socket.on('host:kick', hostOnly((s, d, cb) => {
      const p = s.players.get(d.pid); if (!p) return reply(cb, { ok: false });
      const t = s.team(p.teamId);
      if (t) { t.members = t.members.filter(id => id !== p.id); if (t.run) delete t.run.heroes[p.id]; }
      s.players.delete(p.id);
      if (p.socket) { p.socket.emit('kicked', {}); p.socket.leave(s.room(p.teamId)); }
      s.pruneEmptyTeams();
      if (t) { s.flush(t); if (t.run) { s.checkRoundDone(t); s.checkRoomReady(t); s.tallyVotes(t); } }
      reply(cb, { ok: true });
    }));
    socket.on('host:modified', hostOnly((s, d, cb) => {
      const p = s.players.get(d.pid); if (!p) return reply(cb, { ok: false });
      p.modified = !!d.on; reply(cb, { ok: true });
      const t = s.team(p.teamId); if (t) s.flush(t);
    }));
    const startGame = s => {
      s.pruneEmptyTeams();
      s.state = 'playing';
      s.endsAt = s.settings.timeLimit ? now() + s.settings.timeLimit * 60000 : 0;
      for (const t of s.teams) if (t.members.length) s.startRun(t, 0);
    };
    socket.on('host:start', hostOnly((s, d, cb) => {
      if (s.state !== 'lobby') return reply(cb, { ok: false, msg: 'Already started.' });
      if (!s.players.size) return reply(cb, { ok: false, msg: 'Wait for students to join first.' });
      startGame(s);
      reply(cb, { ok: true });
    }));
    socket.on('host:pause', hostOnly((s, d, cb) => {
      const want = !!d.paused;
      if (want === s.paused) return reply(cb, { ok: true });
      if (want) { s.paused = true; s.pausedAt = now(); }
      else { s.shiftDeadlines(now() - s.pausedAt); s.paused = false; }
      s.flushAll(); reply(cb, { ok: true });
    }));
    socket.on('host:end', hostOnly((s, d, cb) => { s.end(); reply(cb, { ok: true }); }));
    socket.on('host:raid', hostOnly((s, d, cb) => {
      if (s.state !== 'playing') return reply(cb, { ok: false, msg: 'Start the game first.' });
      if (s.raid) return reply(cb, { ok: false, msg: 'The raid has already started.' });
      s.startRaid(); reply(cb, { ok: true });
    }));
    socket.on('host:watch', hostOnly((s, d, cb) => {
      if (d.teamId) { s.watchers.set(socket.id, d.teamId); const t = s.team(d.teamId); if (t) s.flush(t); }
      else s.watchers.delete(socket.id);
      reply(cb, { ok: true });
    }));
    socket.on('host:skipRoom', hostOnly((s, d, cb) => {
      const t = s.team(d.teamId); if (!t || !t.run) return reply(cb, { ok: false });
      if (t.run.phase === 'room') { t.run.next = { time: now(), fn: 'roomAdvance' }; }
      else if (t.run.phase === 'combat' && t.run.combat && t.run.combat.phase === 'player') { t.run.next = { time: now(), fn: 'enemyTurn' }; }
      reply(cb, { ok: true });
    }));
    socket.on('host:time', hostOnly((s, d, cb) => {
      const add = Number(d.minutes) || 0;
      if (s.state === 'playing') s.endsAt = (s.endsAt || now()) + add * 60000;
      reply(cb, { ok: true });
    }));

    // ------------------------------------------------ student
    socket.on('join', guard((data, cb) => {
      const s = getSession(data && data.code);
      if (!s) return reply(cb, { ok: false, msg: 'No game has that code. Check the number on the board.' });
      if (s.state === 'ended') return reply(cb, { ok: false, msg: 'That game has finished.' });
      let p = null;
      if (data.token) p = [...s.players.values()].find(x => x.token === data.token) || null;
      const name = clean(data.name, 18);
      if (!p) {
        if (!name) return reply(cb, { ok: false, msg: 'Type your name.' });
        const same = [...s.players.values()].find(x => x.name.toLowerCase() === name.toLowerCase());
        if (same && same.connected) return reply(cb, { ok: false, msg: 'Someone already has that name. Add your last initial.' });
        if (same) p = same;
      }
      if (!p) {
        if (s.state !== 'lobby' && !s.settings.lateJoin) return reply(cb, { ok: false, msg: 'This game has started and your teacher has locked it.' });
        if (s.players.size >= MAX_PLAYERS) return reply(cb, { ok: false, msg: 'This game is full.' });
        p = s.addPlayer(name);
      }
      if (p.socket && p.socket.id !== socket.id) { try { p.socket.emit('replaced', {}); p.socket.disconnect(true); } catch (e) { /* ignore */ } }
      p.socket = socket; p.connected = true;
      me = { s, p };
      if (p.teamId) socket.join(s.room(p.teamId));
      if (data.cls && C.HEROES[data.cls] && !p.cls) p.cls = data.cls;
      if ((data.gender === 'm' || data.gender === 'f') && !p.gender) p.gender = data.gender;
      reply(cb, { ok: true, playerId: p.id, token: p.token, name: p.name, state: s.state, heroes: C.HERO_ORDER });
      const t = s.team(p.teamId);
      if (t) { if (t.run) s.addHeroIfPossible(t, p); s.flush(t); }
      s.sendPending(p);
      if (s.state === 'ended') socket.emit('ended', {});
    }));

    const student = fn => guard((data, cb) => {
      if (!me) return reply(cb, { ok: false, msg: 'Join a game first.' });
      const { s, p } = me;
      if (!s.players.has(p.id)) return reply(cb, { ok: false, msg: 'You were removed from the game.' });
      const t = s.team(p.teamId);
      fn(s, p, t, data || {}, cb);
    });

    socket.on('pickHero', student((s, p, t, d, cb) => {
      if (!C.HEROES[d.cls]) return reply(cb, { ok: false });
      const run = t && t.run;
      if (run && run.heroes[p.id] && !(run.room && (run.room.type === 'defeat' || run.room.type === 'complete'))) return reply(cb, { ok: false, msg: 'You can change hero when this run ends.' });
      p.cls = d.cls;
      if (d.gender === 'm' || d.gender === 'f') p.gender = d.gender;
      if (run && run.heroes[p.id]) { const h = s.heroFor(t, p); h.gold = run.heroes[p.id].gold; run.heroes[p.id] = h; }
      reply(cb, { ok: true });
      if (s.test && s.state === 'lobby') { startGame(s); s.emitHost(true); }   // solo test game: picking a hero starts the run
      s.flush(t);
    }));

    socket.on('act', student((s, p, t, d, cb) => {
      if (s.paused) return reply(cb, { ok: false, msg: 'Your teacher has paused the game.' });
      const run = t && t.run;
      if (!run || run.phase !== 'combat' || !run.combat) return reply(cb, { ok: false, msg: 'No battle right now.' });
      const c = run.combat; const h = run.heroes[p.id];
      if (!h) return reply(cb, { ok: false, msg: 'You join at the next room.' });
      if (c.phase === 'won' || c.phase === 'lost') return reply(cb, { ok: false, msg: 'The battle is ending.' });
      const action = String(d.action || '');
      const target = d.target ? String(d.target).slice(0, 20) : null;
      let kind;
      if (action === 'focus') {
        if (h.downed) return reply(cb, { ok: false, msg: 'Get back up first.' });
        if (!h.acted && !h.readyAction) return reply(cb, { ok: false, msg: 'Act first, then focus.' });
        if (h.focus >= 3) return reply(cb, { ok: false, msg: 'Focus is full. Use it on your next attack or skill.' });
        kind = 'focus';
      } else if (action === 'rise') {
        if (!h.downed) return reply(cb, { ok: false, msg: 'You are still standing.' });
        kind = 'rise';
      } else if (['attack', 'defend', 'skill0', 'skill1', 'skill2'].includes(action)) {
        if (h.downed) return reply(cb, { ok: false, msg: 'You are knocked out. Answer to get back up.' });
        if (h.acted || h.readyAction) return reply(cb, { ok: false, msg: 'You have acted this round. Answer Focus questions to power up.' });
        if ((action === 'attack' || action === 'defend') && h.free) {
          // A correct Attack or Defend earns the next basic action without a question.
          h.free = false;
          if (c.phase === 'player') {
            const evs = []; CB.heroAction(run, h, action, target, evs); evs.forEach(e => s.event(t, e));
            reply(cb, { ok: true, free: true }); s.afterHeroAction(t); s.flush(t); return;
          }
          h.readyAction = { action, target };
          reply(cb, { ok: true, free: true, queued: true }); s.flush(t); return;
        }
        if (action.startsWith('skill')) { const sk = h.skills[+action.slice(5)]; const def = sk && C.SKILLS[sk.id]; if (!def) return reply(cb, { ok: false, msg: 'No skill in that slot.' }); const cost = C.skillCost(sk.id, h); if ((h.energy || 0) < cost) return reply(cb, { ok: false, msg: `Not enough energy: ${cost} needed, you have ${h.energy || 0}. Attack or Defend to charge up.` }); }
        kind = 'action';
      } else return reply(cb, { ok: false });
      const intent = { kind, action: kind === 'action' ? action : kind, target };
      if (p.pending && p.pending.intent.kind !== 'event') {
        // Same question, new plan: switching action never swaps the question.
        p.pending.intent = intent;
        if (p.pending.answered) {
          if (now() < p.pending.lockUntil) return reply(cb, { ok: false, msg: 'Read the worked answer first.' });
          const pub = s.serveQuestion(p, intent);
          reply(cb, { ok: true, q: { ...pub, intent } }); s.flush(t); return;
        }
        reply(cb, { ok: true, q: { ...p.pending.pub, intent } }); s.flush(t); return;
      }
      const pub = s.serveQuestion(p, intent);
      if (!pub) return reply(cb, { ok: false, msg: 'No questions available.' });
      reply(cb, { ok: true, q: { ...pub, intent } });
      s.flush(t);
    }));

    socket.on('answer', student((s, p, t, d, cb) => {
      const pend = p.pending;
      if (!pend || pend.answered || pend.priv.qid !== d.qid) return reply(cb, { ok: false, stale: true });
      if (s.paused) return reply(cb, { ok: false, msg: 'Your teacher has paused the game.' });
      const t0 = now();
      if (t0 - p.lastAnswerAt < 300) return reply(cb, { ok: false, msg: 'Slow down a little.' });
      p.lastAnswerAt = t0;
      const correct = s.qs.check(pend.priv, d.value);
      s.recordAnswer(p, pend.priv, correct, d.value);
      const intent = pend.intent;
      const run = t && t.run;
      if (!correct) {
        const fb = s.qs.feedback(pend.priv);
        if (intent.kind === 'event') {
          p.pending = null;
          const result = s.resolveEventChoice(t, p, intent, false);
          reply(cb, { ok: true, correct: false, ...fb, closeOnly: true, result }); s.flush(t); return;
        }
        if (intent.kind === 'action' || intent.kind === 'rise') {
          // A wrong answer is a miss: the hero swings and whiffs, and their turn is spent.
          p.pending = null;
          reply(cb, { ok: true, correct: false, ...fb, closeOnly: true, missed: true });
          const c = run && run.combat; const h = run && run.heroes[p.id];
          if (c && h && c.phase === 'player' && !h.acted) {
            const evs = []; CB.whiff(run, h, intent.action, intent.target, evs); evs.forEach(e => s.event(t, e));
            s.afterHeroAction(t);
          } else if (c && h && c.phase !== 'won' && c.phase !== 'lost' && !h.acted && !h.readyAction) {
            h.readyAction = { action: intent.action, target: intent.target, whiff: true };
          }
          s.flush(t); return;
        }
        pend.answered = true; pend.lockUntil = t0 + s.settings.wrongPause * 1000;
        reply(cb, { ok: true, correct: false, ...fb, wait: s.settings.wrongPause });
        s.flush(t);
        return;
      }
      p.pending = null;
      const resp = { ok: true, correct: true, streak: p.stats.streak, solution: pend.priv.q.solution || '' };
      if (intent.kind === 'event') {
        resp.result = s.resolveEventChoice(t, p, intent, true);
        reply(cb, resp); s.flush(t); return;
      }
      const c = run && run.combat; const h = run && run.heroes[p.id];
      if (!c || !h || c.phase === 'won' || c.phase === 'lost') { resp.note = 'The battle ended.'; reply(cb, resp); s.flush(t); return; }
      // Chalk Pouch (first right answer of each fight) and Infinity Pencil (every right answer) top up energy
      const bonus = (C.hasItem(h, 'infinity_pencil') ? 1 : 0) + (C.hasItem(h, 'chalk_pouch') && !h.chalkUsed ? 2 : 0);
      if (C.hasItem(h, 'chalk_pouch')) h.chalkUsed = true;
      if (bonus && (h.energy || 0) < C.ENERGY.max) { h.energy = Math.min(C.ENERGY.max, (h.energy || 0) + bonus); s.event(t, { kind: 'energy', actor: h.id, n: bonus, energy: h.energy }); }
      if (intent.kind === 'focus') {
        h.focus = Math.min(3, h.focus + 1);
        h.energy = Math.min(C.ENERGY.max, (h.energy || 0) + C.ENERGY.focus);
        s.event(t, { kind: 'focus', actor: h.id, focus: h.focus, energy: h.energy });
        reply(cb, resp); s.flush(t); return;
      }
      if (intent.kind === 'action' && (intent.action === 'attack' || intent.action === 'defend')) { h.free = true; resp.free = true; }
      if (c.phase !== 'player') {
        h.readyAction = { action: intent.action, target: intent.target };
        resp.note = 'Ready! It fires at the start of next round.';
        reply(cb, resp); s.flush(t); return;
      }
      const evs = [];
      let res = CB.heroAction(run, h, intent.action, intent.target, evs);
      if (!res.ok && intent.action !== 'rise') res = CB.heroAction(run, h, 'attack', intent.target, evs);
      evs.forEach(e => s.event(t, e));
      reply(cb, resp);
      s.afterHeroAction(t);
      s.flush(t);
    }));

    socket.on('nextQ', student((s, p, t, d, cb) => {
      const pend = p.pending;
      if (!pend) return reply(cb, { ok: false });
      if (!pend.answered) return reply(cb, { ok: true, q: { ...pend.pub, intent: pend.intent } });
      if (now() < pend.lockUntil) return reply(cb, { ok: false, msg: 'Take a moment to read the worked answer.' });
      const run = t && t.run;
      if (pend.intent.kind === 'event' || !run || run.phase !== 'combat') { p.pending = null; return reply(cb, { ok: false }); }
      const pub = s.serveQuestion(p, pend.intent);
      reply(cb, { ok: true, q: { ...pub, intent: pend.intent } });
      s.flush(t);
    }));
    socket.on('dropQ', student((s, p, t, d, cb) => {
      // after a wrong answer the student may walk away; the next action gets a fresh question
      if (p.pending && p.pending.answered) p.pending = null;
      reply(cb, { ok: true }); s.flush(t);
    }));

    socket.on('qte', student((s, p, t, d, cb) => {
      if (s.paused) return reply(cb, { ok: false, msg: 'Your teacher has paused the game.' });
      const r = s.answerQTE(t, p, d.value);
      reply(cb, r); if (t) s.flush(t);
    }));

    socket.on('vote', student((s, p, t, d, cb) => {
      const run = t && t.run;
      if (!run || run.phase !== 'map' || !run.heroes[p.id]) return reply(cb, { ok: false });
      if (run.goAt) return reply(cb, { ok: false, msg: 'Your team is already on the move.' });
      if (!s.mapOptions(run).includes(d.node)) return reply(cb, { ok: false });
      run.votes[p.id] = d.node;
      s.tallyVotes(t);
      reply(cb, { ok: true }); s.flush(t);
    }));

    socket.on('room', student((s, p, t, d, cb) => {
      const run = t && t.run; const room = run && run.room; const h = run && run.heroes[p.id];
      if (!room || !h) return reply(cb, { ok: false });
      const op = String(d.op || '');
      const ok = (extra) => { reply(cb, { ok: true, ...(extra || {}) }); s.flush(t); };
      if (op === 'ready') {
        // leaving without choosing takes the chest's gold
        if (room.type === 'treasure') { const ch = room.chests[p.id]; if (ch && !ch.decided) { ch.opened = true; ch.decided = true; h.gold += ch.gold; ch.choice = { gold: ch.gold }; } }
        room.ready[p.id] = true; s.checkRoomReady(t); return ok();
      }
      if (room.type === 'treasure') {
        // A chest holds a skill, an item and some gold: the hero keeps one of the three.
        const ch = room.chests[p.id]; if (!ch) return reply(cb, { ok: false });
        if (op === 'open' && !ch.opened) { ch.opened = true; return ok(); }
        if (op !== 'take' || !ch.opened || ch.decided) return reply(cb, { ok: false });
        const pickIt = String(d.pick || '');
        if (pickIt === 'skill' && ch.skill) {
          const old = RUN.giveSkill(h, ch.skill, d.slot);
          if (old == null) return reply(cb, { ok: false, msg: 'Choose which skill to replace.' });
          ch.choice = { skill: ch.skill.id, replaced: old || null };
        } else if (pickIt === 'item' && ch.item) {
          if (!RUN.giveItem(h, ch.item)) return reply(cb, { ok: false, msg: 'You already have that item.' });
          ch.choice = { item: ch.item };
        } else if (pickIt === 'gold') { h.gold += ch.gold; ch.choice = { gold: ch.gold }; }
        else return reply(cb, { ok: false });
        ch.decided = true;
        room.ready[p.id] = true; s.checkRoomReady(t);
        return ok();
      }
      if (room.type === 'rest') {
        if (room.choices[p.id]) return reply(cb, { ok: false, msg: 'You have already chosen.' });
        if (op === 'rest') { const before = h.hp; h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.35)); room.choices[p.id] = { rest: h.hp - before }; }
        else if (op === 'meditate') { h.nextFight = { energy: C.ENERGY.max, focus: 1 }; room.choices[p.id] = { meditate: true }; }
        else if (op === 'train' && h.skills[d.slot | 0] && h.skills[d.slot | 0].lvl < 2) { h.skills[d.slot | 0].lvl = 2; room.choices[p.id] = { train: h.skills[d.slot | 0].id }; }
        else return reply(cb, { ok: false });
        room.ready[p.id] = true; s.checkRoomReady(t); return ok();
      }
      if (room.type === 'merchant') {
        const stock = room.stock[p.id]; if (!stock) return reply(cb, { ok: false });
        if (op === 'buy') {
          const kind = d.kind === 'item' ? 'item' : 'skill';
          const it = (kind === 'item' ? stock.items : stock.skills)[d.i | 0];
          if (!it || it.sold) return reply(cb, { ok: false });
          if (h.gold < it.price) return reply(cb, { ok: false, msg: 'Not enough gold.' });
          if (kind === 'item') { if (!RUN.giveItem(h, it.id)) return reply(cb, { ok: false, msg: 'You already have that item.' }); }
          else if (RUN.giveSkill(h, it, d.slot) == null) return reply(cb, { ok: false, msg: 'Choose which skill to replace.' });
          h.gold -= it.price; it.sold = true;
          return ok();
        }
        if (op === 'mend') {
          if (stock.mend.sold) return reply(cb, { ok: false });
          if (h.gold < stock.mend.price) return reply(cb, { ok: false, msg: 'Not enough gold.' });
          h.gold -= stock.mend.price; stock.mend.sold = true; h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.4));
          return ok();
        }
        return reply(cb, { ok: false });
      }
      if ((room.type === 'victory' || room.type === 'complete') && op === 'stat') {
        if (room.stats[p.id]) return reply(cb, { ok: false, msg: 'You have already chosen.' });
        const st = String(d.stat);
        if (!C.STATS[st]) return reply(cb, { ok: false });
        h.lv[st]++;
        if (st === 'hp') { h.maxHp += C.STAT_STEP.hp; h.hp = Math.min(h.maxHp, h.hp + C.STAT_STEP.hp); }
        room.stats[p.id] = st;
        room.ready[p.id] = true; s.checkRoomReady(t);
        return ok();
      }
      if (room.type === 'event' && op === 'choose') {
        const ev = C.EVENTS[room.event]; const opt = ev && ev.options.find(o => o.id === d.opt);
        if (!opt || room.choices[p.id]) return reply(cb, { ok: false });
        if (opt.needGold && h.gold < opt.needGold) return reply(cb, { ok: false, msg: `You need ${opt.needGold} gold.` });
        const intent = { kind: 'event', action: 'event', event: room.event, opt: opt.id };
        if (opt.quiz) {
          if (p.pending && p.pending.intent.kind === 'event' && !p.pending.answered) return reply(cb, { ok: true, q: { ...p.pending.pub, intent: p.pending.intent } });
          const pub = s.serveQuestion(p, intent);
          return reply(cb, { ok: true, q: { ...pub, intent } });
        }
        const result = s.resolveEventChoice(t, p, intent, true);
        return ok({ result });
      }
      return reply(cb, { ok: false });
    }));

    {
      // Shortcut to jump a team into any room type: automated tests (MATHFALL_TEST=1) and the teacher's test games only.
      socket.on('dev:room', student((s, p, t, d, cb) => {
        if (process.env.MATHFALL_TEST !== '1' && !s.test) return reply(cb, { ok: false });
        const run = t && t.run; if (!run) return reply(cb, { ok: false });
        const ty = d.type;
        if (d.asc != null) run.asc = d.asc;
        if (d.floor != null) run.floor = d.floor;
        if (ty === 'boss' || ty === 'elite' || ty === 'normal1' || ty === 'normal2') { s.startCombat(t, ty); }
        else if (ty === 'treasure') s.openRoom(t, RUN.makeTreasureRoom(run, d.kind || 'treasure'));
        else if (ty === 'rest') s.openRoom(t, RUN.makeRestRoom(run));
        else if (ty === 'merchant') { Object.values(run.heroes).forEach(h => { h.gold = 200; }); s.openRoom(t, RUN.makeMerchantRoom(run)); }
        else if (ty === 'shrine' || ty === 'event') { const r = RUN.makeEventRoom(run); if (d.event && C.EVENTS[d.event]) r.event = d.event; else if (ty === 'shrine') r.event = 'shrine'; run.ambushTier = 'normal1'; s.openRoom(t, r); }
        else if (ty === 'raid') { s.startRaid(); return reply(cb, { ok: true }); }
        else if (ty === 'summon' && run.combat) { const e = CB.aliveEnemies(run.combat)[0]; if (e) e.intent = { move: 'raise', type: 'summon', minion: 'thrall', count: 2, label: 'Raise the Dead' }; }
        else if (ty === 'forceqte' && run.combat) { const e = CB.aliveEnemies(run.combat)[0]; if (e) e.intent = { move: 'cataclysm', type: 'attackAll', dmg: 9, label: 'Cataclysm', qte: d.n || 1, warn: 'Quick-time!' }; }
        else if (ty === 'victory' || ty === 'complete' || ty === 'defeat') s.openRoom(t, { type: ty, gold: 24, asc: 0, floor: 3, ready: {}, stats: {} });
        else if (ty === 'end') { s.end(); return reply(cb, { ok: true }); }
        else if (ty === 'bosshalf' && run.combat) { const bz = run.combat.enemies.find(e => e.tier === 'boss'); if (bz) bz.hp = Math.floor(bz.maxHp * 0.5); }
        else if (ty === 'energy') { Object.values(run.heroes).forEach(h => { h.energy = 10; }); }
        else if (ty === 'loadout') {   // { skills: [ids], items: [ids], gold } for the caller's hero
          const h = run.heroes[p.id];
          if (h && Array.isArray(d.skills)) h.skills = d.skills.filter(id => C.SKILLS[id]).slice(0, C.MAX_SKILLS).map(id => ({ id, lvl: 1 }));
          if (h && Array.isArray(d.items)) { h.items = []; d.items.forEach(id => RUN.giveItem(h, id)); }
          if (h && d.gold != null) h.gold = d.gold | 0;
        }
        else if (ty === 'hurt') { Object.values(run.heroes).forEach((h, i) => { h.hp = Math.max(1, Math.round(h.maxHp * (i ? 0.5 : 0.2))); }); }
        s.flush(t); reply(cb, { ok: true });
      }));
    }

    socket.on('disconnect', () => {
      if (hosting) { hosting.hostSockets.delete(socket.id); hosting.watchers.delete(socket.id); }
      if (me) {
        const { s, p } = me;
        if (p.socket === socket) {
          p.connected = false;
          const t = s.team(p.teamId);
          if (t) { s.flush(t); if (t.run) { s.checkRoundDone(t); s.checkRoomReady(t); if (t.run.phase === 'map') s.tallyVotes(t); } }
          s.hostDirty = true;
        }
      }
    });
  });
}

// questions config from the host: { sets: [rawSet], bankIds: [id], gens: [{topic, level}], format }
function buildQConfig(q, banks) {
  q = q || {};
  const sets = [];
  for (const id of (Array.isArray(q.bankIds) ? q.bankIds : [])) { const b = banks.get(String(id)); if (b) sets.push(b); }
  for (const raw of (Array.isArray(q.sets) ? q.sets : []).slice(0, 10)) sets.push(raw);
  return { sets, gens: Array.isArray(q.gens) ? q.gens.slice(0, 12) : [], format: q.format };
}

module.exports = { attach, sessions, Session };

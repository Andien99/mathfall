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
    const same = team.members.map(id => this.players.get(id)).filter(q => q && q.cls === p.cls);
    const variant = Math.max(0, same.findIndex(q => q.id === p.id)) % 3;
    return {
      id: p.id, name: p.name, cls: p.cls, variant, maxHp: H.hp, hp: H.hp, block: 0, st: {},
      skills: H.skills.map(id => ({ id, lvl: 1, cd: 0 })), focus: 0, downed: false, acted: false, gold: 0,
      readyAction: null, lastTarget: null, stats: { dmg: 0, heal: 0, taken: 0, skills: 0 }
    };
  }
  ensureClass(team, p) {
    if (p.cls && C.HEROES[p.cls]) return;
    const taken = new Set(team.members.map(id => this.players.get(id)).filter(Boolean).map(q => q.cls));
    p.cls = C.HERO_ORDER.find(c => !taken.has(c)) || RUN.pick(C.HERO_ORDER);
  }
  startRun(team, asc) {
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
      run.heroes[p.id] = this.heroFor(team, p);
      p.pending = null;
    }
    this.event(team, { kind: 'system', text: asc ? `Deeper into the dungeon. Ascension ${asc}` : 'The descent begins' });
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
    else if (node.type === 'unknown') {
      const ev = RUN.makeEventRoom(run);
      if (ev.event === 'ambush') { this.event(team, { kind: 'system', text: 'Ambush!' }); this.startCombat(team, tier); }
      else this.openRoom(team, ev);
    }
    this.flush(team);
  }

  openRoom(team, room) {
    const run = team.run;
    run.phase = 'room'; run.room = room; run.combat = null; room.deadline = 0; room.ready = room.ready || {};
    for (const id of team.members) { const p = this.players.get(id); if (p && p.pending && p.pending.intent.kind !== 'shrine') p.pending = null; }
  }

  startCombat(team, type) {
    const run = team.run;
    run.phase = 'combat'; run.room = null;
    run.combat = CB.createCombat(run, type);
    CB.beginRound(run, now(), this.settings.timer);
    this.event(team, { kind: 'system', text: type === 'boss' ? 'Gravemaw awakens' : type === 'elite' ? 'An elite foe blocks the way' : 'Monsters!', battle: type });
  }

  // ------------------------------------------------------------ combat flow
  afterHeroAction(team) {
    const run = team.run; const c = run.combat; if (!c) return;
    const out = CB.combatOutcome(run);
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
      if (p && p.pending && p.pending.intent.kind !== 'shrine') { p.pending = null; if (p.socket) p.socket.emit('qclose', {}); }
    }
  }
  runStep(team, fn) {
    const run = team.run; const c = run.combat;
    if (fn === 'enemyTurn' && c && c.phase === 'player') {
      c.phase = 'enemy'; c.roundEndsAt = 0;
      const evs = CB.enemyTurn(run);
      let total = 350;
      for (const ev of evs) { this.event(team, ev); total += ev.dur || 900; }
      const out = CB.combatOutcome(run);
      if (out === 'lost') run.next = { time: now() + T(total + 400), fn: 'lose' };
      else if (out === 'won') { c.phase = 'won'; this.clearCombatQuestions(team); run.next = { time: now() + T(total + 900), fn: 'win' }; }
      else run.next = { time: now() + T(total), fn: 'nextRound' };
    } else if (fn === 'nextRound' && c) {
      CB.beginRound(run, now(), this.settings.timer);
      this.event(team, { kind: 'round', round: c.round });
      for (const h of CB.heroList(run)) {
        if (h.readyAction && !h.downed) {
          const ra = h.readyAction; h.readyAction = null;
          const evs = [];
          let res = CB.heroAction(run, h, ra.action, ra.target, evs);
          if (!res.ok && ra.action !== 'rise') res = CB.heroAction(run, h, 'attack', ra.target, evs);
          evs.forEach(e => this.event(team, e));
          if (CB.combatOutcome(run) === 'won') break;
        } else h.readyAction = null;
      }
      this.afterHeroAction(team);
    } else if (fn === 'win' && c) {
      this.winCombat(team);
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
    const gold = type === 'boss' ? 80 : type === 'elite' ? RUN.ri(35, 45) : RUN.ri(18, 28);
    for (const h of CB.heroList(run)) {
      h.gold += gold;
      if (h.downed) { h.downed = false; h.hp = Math.round(h.maxHp * 0.25); }
      else h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.1));
      h.block = 0; h.st = {}; h.readyAction = null; h.acted = false;
    }
    if (type === 'boss') {
      team.history.bossKills++;
      team.history.bestAsc = Math.max(team.history.bestAsc, run.asc + 1);
      this.openRoom(team, { type: 'complete', gold, asc: run.asc, ready: {} });
    } else {
      this.openRoom(team, { type: 'victory', gold, elite: type === 'elite', ready: {} });
    }
  }
  advanceRoom(team, forced) {
    const run = team.run; const room = run.room; if (!room) return;
    if (room.type === 'victory' && room.elite) { this.openRoom(team, RUN.makeTreasureRoom(run, 'elite')); this.flush(team); return; }
    if (room.type === 'complete') { this.startRun(team, run.asc + 1); return; }
    if (room.type === 'defeat') { this.startRun(team, run.asc); return; }
    // anyone who didn't decide on a chest keeps their loadout
    if (room.type === 'treasure') for (const [pid, ch] of Object.entries(room.chests)) {
      const h = run.heroes[pid];
      if (h && !ch.opened) { ch.opened = true; h.gold += ch.gold; }
      if (h && !ch.decided) { ch.decided = true; }
    }
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
      members: team.members.map(id => { const p = this.players.get(id); return p ? { id, name: p.name, cls: p.cls, connected: p.connected } : null; }).filter(Boolean) };
    if (!run) return base;
    const order = team.members.filter(id => run.heroes[id]);
    base.run = {
      asc: run.asc, floor: run.floor, rows: run.map.rows, length: run.length, phase: run.phase,
      map: { nodes: run.map.nodes.map(n => ({ id: n.id, row: n.row, type: n.type, x: n.x, y: n.y, next: n.next, visited: !!n.visited })), pos: run.pos, options: run.phase === 'map' ? this.mapOptions(run) : [], votes: run.votes, voteDeadline: run.voteDeadline, goNode: run.goNode },
      heroes: order.map(id => {
        const h = run.heroes[id]; const p = this.players.get(id);
        return { id, name: h.name, cls: h.cls, variant: h.variant, hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, skills: h.skills, focus: h.focus, downed: h.downed, acted: h.acted, ready: !!h.readyAction, gold: h.gold,
          connected: !!(p && p.connected), busy: p && p.pending && !p.pending.answered ? (p.pending.intent.action || p.pending.intent.kind) : null };
      }),
      waiting: run.pendingJoin,
      combat: run.combat ? { round: run.combat.round, phase: run.combat.phase, roundEndsAt: run.combat.roundEndsAt, type: run.combat.type, enemies: run.combat.enemies.map(CB.publicEnemy) } : null,
      room: run.room ? this.publicRoom(run.room) : null
    };
    return base;
  }
  publicRoom(room) {
    const o = { type: room.type, ready: room.ready, deadline: room.deadline || 0 };
    if (room.type === 'treasure') { o.kind = room.kind; o.event = room.event; o.chests = {}; for (const [k, v] of Object.entries(room.chests)) o.chests[k] = { rarity: v.rarity, opened: v.opened, decided: v.decided, choice: v.choice || null }; }
    if (room.type === 'rest') o.choices = room.choices;
    if (room.type === 'event') { o.event = room.event; o.results = room.results; }
    if (room.type === 'victory' || room.type === 'complete') { o.gold = room.gold; o.elite = room.elite; o.asc = room.asc; }
    if (room.type === 'defeat') o.floor = room.floor;
    return o;
  }
  youFor(team, p) {
    const run = team.run;
    const you = { id: p.id, name: p.name, cls: p.cls, track: this.trackFor(p) === 'modified' ? 'support' : 'main', joining: !!(run && !run.heroes[p.id]) };
    if (p.pending) you.pendingQ = p.pending.answered ? null : p.pending.pub.qid;
    const room = run && run.room;
    if (room && room.type === 'treasure' && room.chests[p.id]) { const ch = room.chests[p.id]; you.chest = { rarity: ch.rarity, opened: ch.opened, decided: ch.decided, gold: ch.gold, offer: ch.opened ? ch.offer : null }; }
    if (room && room.type === 'merchant' && room.stock[p.id]) you.stock = room.stock[p.id];
    return you;
  }
  flush(team) {
    if (!team) return;
    const pub = this.teamPublic(team);
    const events = team.run ? team.run.outbox.splice(0) : [];
    for (const id of team.members) {
      const p = this.players.get(id);
      if (p && p.socket && p.connected) p.socket.emit('state', { ...pub, you: this.youFor(team, p), events });
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
      id: p.id, name: p.name, connected: p.connected, teamId: p.teamId, cls: p.cls, modified: p.modified, support: this.trackFor(p) === 'modified',
      answered: p.stats.answered, correct: p.stats.correct, streak: p.stats.streak, best: p.stats.best, busy: !!(p.pending && !p.pending.answered)
    }));
    const teams = this.teams.map(t => {
      const run = t.run;
      const o = { id: t.id, name: t.name, color: t.color, members: t.members, history: t.history };
      if (run) {
        o.phase = run.phase; o.floor = run.floor; o.rows = run.map.rows; o.asc = run.asc;
        o.node = run.pos ? (run.map.nodes.find(n => n.id === run.pos) || {}).type : null;
        o.room = run.room ? run.room.type : null;
        o.heroes = Object.values(run.heroes).map(h => ({ id: h.id, name: h.name, cls: h.cls, hp: h.hp, maxHp: h.maxHp, downed: h.downed }));
        if (run.combat) o.combat = { round: run.combat.round, phase: run.combat.phase, type: run.combat.type, enemies: run.combat.enemies.filter(e => !e.dead).map(e => ({ name: e.name, hp: e.hp, maxHp: e.maxHp })) };
      }
      return o;
    });
    return { code: this.code, state: this.state, settings: this.settings, paused: this.paused, endsAt: this.endsAt, now: now(), questions: this.qs.summary(), players, teams, results: this.state === 'ended' ? this.results : null };
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
        id: p.id, name: p.name, team: team ? team.name : '', cls: p.cls, modified: p.modified,
        answered: p.stats.answered, correct: p.stats.correct, best: p.stats.best,
        pct: p.stats.answered ? Math.round(100 * p.stats.correct / p.stats.answered) : 0,
        supportAnswered: p.stats.modifiedAnswered,
        avgSec: p.stats.answered ? Math.round(p.stats.time / p.stats.answered / 100) / 10 : 0,
        bySkill: p.stats.bySkill, wrong: p.stats.wrong,
        dmg: h ? h.stats.dmg : 0, heal: h ? h.stats.heal : 0
      };
    });
    const questions = Object.values(this.qstats).map(q => ({ ...q, pct: q.asked ? Math.round(100 * q.correct / q.asked) : 0 }))
      .sort((a, b) => a.pct - b.pct || b.asked - a.asked);
    const skills = {};
    for (const p of this.players.values()) for (const [k, v] of Object.entries(p.stats.bySkill)) { skills[k] = skills[k] || { a: 0, c: 0 }; skills[k].a += v.a; skills[k].c += v.c; }
    const teams = this.teams.map(t => ({ name: t.name, color: t.color, members: t.members.map(id => (this.players.get(id) || {}).name).filter(Boolean), ...t.history, floorNow: t.run ? t.run.floor : 0, ascNow: t.run ? t.run.asc : 0 }));
    return { players, questions, skills, teams, endedAt: now(), title: this.qs.title };
  }

  end() {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.results = this.buildResults();
    for (const p of this.players.values()) {
      if (!p.socket) continue;
      const mine = this.results.players.find(r => r.id === p.id);
      const team = this.team(p.teamId);
      p.socket.emit('ended', { you: mine, team: team ? { name: team.name, color: team.color, history: team.history } : null,
        podium: this.results.teams.slice().sort(teamRank).slice(0, 3) });
    }
    this.emitHost(true);
  }

  // ------------------------------------------------------------ timers
  tick(t) {
    if (this.state === 'playing' && this.endsAt && t >= this.endsAt && !this.paused) this.end();
    if (this.state !== 'playing' || this.paused) return;
    for (const team of this.teams) {
      const run = team.run; if (!run) continue;
      if (run.next && t >= run.next.time) { const fn = run.next.fn; run.next = null; this.runStep(team, fn); continue; }
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
    }
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
    socket.on('host:start', hostOnly((s, d, cb) => {
      if (s.state !== 'lobby') return reply(cb, { ok: false, msg: 'Already started.' });
      if (!s.players.size) return reply(cb, { ok: false, msg: 'Wait for students to join first.' });
      s.pruneEmptyTeams();
      s.state = 'playing';
      s.endsAt = s.settings.timeLimit ? now() + s.settings.timeLimit * 60000 : 0;
      for (const t of s.teams) if (t.members.length) s.startRun(t, 0);
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
      if (run && run.heroes[p.id]) { const h = s.heroFor(t, p); h.gold = run.heroes[p.id].gold; run.heroes[p.id] = h; }
      reply(cb, { ok: true });
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
      } else if (['attack', 'defend', 'skill0', 'skill1'].includes(action)) {
        if (h.downed) return reply(cb, { ok: false, msg: 'You are knocked out. Answer to get back up.' });
        if (h.acted || h.readyAction) return reply(cb, { ok: false, msg: 'You have acted this round. Answer Focus questions to power up.' });
        if (action.startsWith('skill')) { const sk = h.skills[action === 'skill0' ? 0 : 1]; if (!sk || sk.cd > 0) return reply(cb, { ok: false, msg: 'That skill is recharging.' }); }
        kind = 'action';
      } else return reply(cb, { ok: false });
      const intent = { kind, action: kind === 'action' ? action : kind, target };
      if (p.pending && p.pending.intent.kind !== 'shrine') {
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
        pend.answered = true; pend.lockUntil = t0 + s.settings.wrongPause * 1000;
        reply(cb, { ok: true, correct: false, ...s.qs.feedback(pend.priv), wait: s.settings.wrongPause });
        if (intent.kind === 'shrine' && run && run.room && run.room.type === 'event') {
          run.room.results[p.id] = 'missed'; p.pending = null;
          run.room.ready[p.id] = true; s.checkRoomReady(t);
        }
        s.flush(t);
        return;
      }
      p.pending = null;
      const resp = { ok: true, correct: true, streak: p.stats.streak, solution: pend.priv.q.solution || '' };
      if (intent.kind === 'shrine') {
        if (run && run.room && run.room.type === 'event' && run.heroes[p.id]) {
          const h = run.heroes[p.id];
          h.gold += 35; h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.2));
          run.room.results[p.id] = 'blessed'; run.room.ready[p.id] = true;
          s.checkRoomReady(t);
        }
        reply(cb, resp); s.flush(t); return;
      }
      const c = run && run.combat; const h = run && run.heroes[p.id];
      if (!c || !h || c.phase === 'won' || c.phase === 'lost') { resp.note = 'The battle ended.'; reply(cb, resp); s.flush(t); return; }
      if (intent.kind === 'focus') {
        h.focus = Math.min(3, h.focus + 1);
        s.event(t, { kind: 'focus', actor: h.id, focus: h.focus });
        reply(cb, resp); s.flush(t); return;
      }
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
      if (pend.intent.kind !== 'shrine' && (!run || run.phase !== 'combat')) { p.pending = null; return reply(cb, { ok: false }); }
      const pub = s.serveQuestion(p, pend.intent);
      reply(cb, { ok: true, q: { ...pub, intent: pend.intent } });
      s.flush(t);
    }));
    socket.on('dropQ', student((s, p, t, d, cb) => {
      // after a wrong answer the student may walk away; the next action gets a fresh question
      if (p.pending && p.pending.answered) p.pending = null;
      reply(cb, { ok: true }); s.flush(t);
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
        if (room.type === 'treasure') { const ch = room.chests[p.id]; if (ch) { if (!ch.opened) { ch.opened = true; h.gold += ch.gold; } ch.decided = true; } }
        room.ready[p.id] = true; s.checkRoomReady(t); return ok();
      }
      if (room.type === 'treasure') {
        const ch = room.chests[p.id]; if (!ch) return reply(cb, { ok: false });
        if (op === 'open' && !ch.opened) { ch.opened = true; h.gold += ch.gold; return ok({ offer: ch.offer, gold: ch.gold }); }
        if (op === 'take' && ch.opened && !ch.decided && (d.slot === 0 || d.slot === 1)) {
          const old = h.skills[d.slot];
          h.skills[d.slot] = { id: ch.offer.id, lvl: ch.offer.lvl, cd: 0 };
          ch.decided = true; ch.choice = { took: ch.offer.id, replaced: old.id };
          room.ready[p.id] = true; s.checkRoomReady(t);
          return ok();
        }
        if (op === 'keep' && ch.opened && !ch.decided) { ch.decided = true; h.gold += 10; ch.choice = { kept: true }; room.ready[p.id] = true; s.checkRoomReady(t); return ok(); }
        return reply(cb, { ok: false });
      }
      if (room.type === 'rest') {
        if (room.choices[p.id]) return reply(cb, { ok: false, msg: 'You have already chosen.' });
        if (op === 'rest') { const before = h.hp; h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.35)); room.choices[p.id] = { rest: h.hp - before }; }
        else if (op === 'train' && (d.slot === 0 || d.slot === 1) && h.skills[d.slot] && h.skills[d.slot].lvl < 2) { h.skills[d.slot].lvl = 2; room.choices[p.id] = { train: h.skills[d.slot].id }; }
        else return reply(cb, { ok: false });
        room.ready[p.id] = true; s.checkRoomReady(t); return ok();
      }
      if (room.type === 'merchant') {
        const stock = room.stock[p.id]; if (!stock) return reply(cb, { ok: false });
        if (op === 'buy') {
          const it = stock.items[d.item | 0];
          if (!it || it.sold) return reply(cb, { ok: false });
          if (h.gold < it.price) return reply(cb, { ok: false, msg: 'Not enough gold.' });
          if (!(d.slot === 0 || d.slot === 1)) return reply(cb, { ok: false });
          h.gold -= it.price; it.sold = true;
          h.skills[d.slot] = { id: it.id, lvl: it.lvl, cd: 0 };
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
      if (room.type === 'event' && room.event === 'shrine') {
        if (op === 'pray') {
          if (room.results[p.id]) return reply(cb, { ok: false });
          if (p.pending && p.pending.intent.kind === 'shrine' && !p.pending.answered) return reply(cb, { ok: true, q: { ...p.pending.pub, intent: p.pending.intent } });
          const pub = s.serveQuestion(p, { kind: 'shrine', action: 'shrine' });
          return reply(cb, { ok: true, q: { ...pub, intent: { kind: 'shrine', action: 'shrine' } } });
        }
        return reply(cb, { ok: false });
      }
      return reply(cb, { ok: false });
    }));

    if (process.env.MATHFALL_TEST === '1') {
      // Test-only shortcut to jump a team into any room type.
      socket.on('dev:room', student((s, p, t, d, cb) => {
        const run = t && t.run; if (!run) return reply(cb, { ok: false });
        const ty = d.type;
        if (ty === 'boss' || ty === 'elite' || ty === 'normal1' || ty === 'normal2') { s.startCombat(t, ty); }
        else if (ty === 'treasure') s.openRoom(t, RUN.makeTreasureRoom(run, d.kind || 'treasure'));
        else if (ty === 'rest') s.openRoom(t, RUN.makeRestRoom(run));
        else if (ty === 'merchant') { Object.values(run.heroes).forEach(h => { h.gold = 200; }); s.openRoom(t, RUN.makeMerchantRoom(run)); }
        else if (ty === 'shrine') s.openRoom(t, { type: 'event', event: 'shrine', results: {}, ready: {} });
        else if (ty === 'victory' || ty === 'complete' || ty === 'defeat') s.openRoom(t, { type: ty, gold: 24, asc: 0, floor: 3, ready: {} });
        else if (ty === 'end') { s.end(); return reply(cb, { ok: true }); }
        else if (ty === 'bosshalf' && run.combat) { const bz = run.combat.enemies.find(e => e.tier === 'boss'); if (bz) bz.hp = Math.floor(bz.maxHp * 0.5); }
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

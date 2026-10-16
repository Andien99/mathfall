// End-to-end server test: a teacher and N bot students play full runs over real sockets.
// Run: node test/bots.test.js [players] [teams-size]
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const C = require('../shared/content');

const PLAYERS = +(process.argv[2] || 8);
const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const LIMIT_MS = +(process.env.LIMIT || 300000);

const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, MATHFALL_TEST: '1', MATHFALL_FAST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let srvErr = '';
srv.stderr.on('data', d => { srvErr += d; process.stderr.write('[server] ' + d); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Resolve after 5 s even if a reply never comes (a socket closed mid-call during the reconnect test).
const emit = (s, ev, data) => new Promise(r => { const t = setTimeout(() => r({ ok: false, timeout: true }), 5000); s.emit(ev, data, x => { clearTimeout(t); r(x); }); });

const stats = { answered: 0, wrong: 0, actions: 0, fights: 0, rooms: {}, completes: 0, defeats: 0, swaps: 0, whiffs: 0, free: 0, qte: 0, qteOk: 0, events: {}, statPicks: 0, raid: null, errors: [] };
const RAID_AT = +(process.env.RAID_AT || 45000);

async function main() {
  await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('running')) r(); }));
  const host = io(URL, { transports: ['websocket'] });
  await new Promise(r => host.on('connect', r));
  const created = await emit(host, 'host:create', { settings: { length: 'quick', timer: 6, wrongPause: 0.1, teamSize: 4, raidMinutes: 2 }, questions: { bankIds: ['year-7-algebra-core-skills'], gens: [{ topic: 'integers', level: 2 }], format: 'mix' } });
  if (!created.ok) throw new Error('create failed ' + created.msg);
  const code = created.code;
  let hostState = null;
  host.on('host:state', s => { hostState = s; });

  const bots = [];
  const classes = ['knight', 'mage', 'ranger', 'cleric'];
  for (let i = 0; i < PLAYERS; i++) {
    const s = io(URL, { transports: ['websocket'] });
    await new Promise(r => s.on('connect', r));
    const bot = { s, name: 'Bot' + i, state: null, q: null, busy: false, lastPhaseKey: '' };
    const j = await emit(s, 'join', { code, name: bot.name });
    if (!j.ok) throw new Error('join failed ' + j.msg);
    bot.id = j.playerId; bot.token = j.token;
    await emit(s, 'pickHero', { cls: classes[i % 4] });
    s.on('state', st => { bot.state = st; for (const ev of st.events || []) if (ev.kind === 'system' && ev.battle) stats.fights++; });
    s.on('qclose', () => { bot.q = null; });
    s.on('ended', () => { bot.ended = true; });
    bots.push(bot);
  }
  await sleep(300);
  if (!hostState || hostState.players.length !== PLAYERS) throw new Error('host does not see all players');
  const st = await emit(host, 'host:start', {});
  if (!st.ok) throw new Error('start failed');

  // Reconnect test: bot 0 drops and rejoins with its token mid-game.
  setTimeout(async () => {
    const b = bots[0];
    b.s.disconnect();
    await sleep(400);
    const s = io(URL, { transports: ['websocket'] });
    await new Promise(r => s.on('connect', r));
    b.s = s; b.q = null;
    s.on('state', st => { b.state = st; });
    s.on('qclose', () => { b.q = null; });
    s.on('ended', () => { b.ended = true; });
    const j = await emit(s, 'join', { code, token: b.token });
    if (!j.ok || j.playerId !== b.id) stats.errors.push('reconnect failed'); else stats.reconnected = true;
  }, 4000);

  const t0 = Date.now();
  const done = new Set();
  let raidStarted = false;
  while (Date.now() - t0 < LIMIT_MS && done.size < bots.length) {
    if (!raidStarted && Date.now() - t0 > RAID_AT) { raidStarted = true; const r = await emit(host, 'host:raid', {}); if (!r.ok) stats.errors.push('raid did not start: ' + r.msg); }
    await Promise.all(bots.map(b => step(b, done)));
    for (const b of bots) if (b.ended) done.add(b.name);
    await sleep(60);
  }
  stats.raid = hostState && hostState.raid ? { hp: hostState.raid.hp, maxHp: hostState.raid.maxHp, won: hostState.raid.won, over: hostState.raid.over } : null;
  if (!stats.raid) stats.errors.push('raid never ran');
  for (const b of bots) if (!done.has(b.name)) {
    const r = b.state && b.state.run;
    const me = r && r.heroes.find(h => h.id === b.id);
    console.log('UNFINISHED', b.name, r && r.phase, r && r.room && r.room.type, r && r.combat && r.combat.phase, r && r.combat && r.combat.round, me && JSON.stringify({ acted: me.acted, ready: me.ready, downed: me.downed, busy: me.busy }), 'floor', r && r.floor, 'opts', r && r.map.options, 'votes', r && JSON.stringify(r.map.votes), 'goNode', r && r.map.goNode);
  }
  const res = await emit(host, 'host:end', {});
  await sleep(400);
  const r = hostState && hostState.results;
  console.log(JSON.stringify({ ...stats, finished: done.size, players: PLAYERS, resultsPlayers: r ? r.players.length : 0, teams: r ? r.teams : null }, null, 1));
  if (!r || r.players.length !== PLAYERS) stats.errors.push('results missing players');
  if (stats.answered < PLAYERS * 3) stats.errors.push('too few answers');
  if (!stats.whiffs) stats.errors.push('no whiffs seen');
  if (!stats.free) stats.errors.push('no free actions used');
  if (!stats.statPicks) stats.errors.push('no stat upgrades picked');
  host.close(); bots.forEach(b => b.s.close());
  srv.kill();
  if (stats.errors.length || srvErr.includes('Error')) { console.error('FAILED', stats.errors); process.exit(1); }
  console.log('bot test passed');
}

async function answer(b, q) {
  const wrong = Math.random() < 0.2;
  let value = q._answer;
  if (wrong) value = q.type === 'mc' ? (q._answer + 1) % q.options.length : 'zzz';
  // duplicate submission: only one may count
  const [r1, r2] = await Promise.all([emit(b.s, 'answer', { qid: q.qid, value }), emit(b.s, 'answer', { qid: q.qid, value })]);
  if (r1.ok && r2.ok) stats.errors.push('double answer accepted');
  stats.answered++;
  const r = r1.ok ? r1 : r2;
  if (r.ok && !r.correct) {
    stats.wrong++;
    if (!r.correctText) stats.errors.push('no feedback on wrong answer');
    if (r.missed) { stats.whiffs++; return null; }
    if (r.closeOnly) return null;
    await sleep(150);
    const n = await emit(b.s, 'nextQ', {});
    return n.ok ? n.q : null;
  }
  return null;
}

async function step(b, done) {
  if (b.busy || !b.state) return;
  b.busy = true;
  try {
    const st = b.state; const run = st.run;
    if (st.state === 'ended' || !run) return;
    const me = run.heroes.find(h => h.id === b.id);
    if (st.you && st.you.qte && !st.you.qte.answered && b.qteKey !== st.you.qte.key) {
      b.qteKey = st.you.qte.key;
      const ok = Math.random() < 0.75;
      const r = await emit(b.s, 'qte', { value: ok ? st.you.qte._answer : -1 });
      stats.qte++; if (r.ok && r.correct) stats.qteOk++;
      return;
    }
    if (run.phase === 'map' && run.map.options.length && !run.map.votes[b.id]) {
      const opt = run.map.options[Math.floor(Math.random() * run.map.options.length)];
      await emit(b.s, 'vote', { node: opt });
    } else if (run.phase === 'combat' && me && run.combat && run.combat.phase === 'player') {
      let action = null;
      if (me.downed) action = 'rise';
      else if (!me.acted && !me.ready) {
        const opts = ['attack', 'defend'];
        me.skills.forEach((s, i) => { const d = C.SKILLS[s.id]; if (d && (me.energy || 0) >= d.cost) opts.push('skill' + i); });
        action = opts[Math.floor(Math.random() * opts.length)];
      } else if (me.acted && me.focus < 3 && Math.random() < 0.3) action = 'focus';
      if (action) {
        const enemy = run.combat.enemies.find(e => !e.dead);
        const r = await emit(b.s, 'act', { action, target: enemy && enemy.id });
        if (r.ok && r.free) { stats.free++; stats.actions++; }
        if (r.ok && r.free && me.free !== true) stats.errors.push('free action without a token');
        if (r.ok && r.q) {
          let q = r.q;
          for (let i = 0; i < 4 && q; i++) q = await answer(b, q);
          stats.actions++;
        }
      }
    } else if (run.phase === 'room' && run.room && me) {
      const room = run.room;
      const key = room.type + ':' + run.floor + ':' + run.asc;
      if (room.ready[b.id]) return;
      stats.rooms[room.type] = (stats.rooms[room.type] || 0) + 1;
      if (room.type === 'treasure') {
        const o = await emit(b.s, 'room', { op: 'open' });
        if (o.ok && o.offer && Math.random() < 0.6) { const t = await emit(b.s, 'room', { op: 'take', slot: Math.random() < 0.5 ? 0 : 1 }); if (t.ok) stats.swaps++; }
        else await emit(b.s, 'room', { op: 'keep' });
      } else if (room.type === 'rest') {
        const rr = Math.random(); await emit(b.s, 'room', rr < 0.4 ? { op: 'rest' } : rr < 0.7 ? { op: 'train', slot: 0 } : { op: 'meditate' });
      } else if (room.type === 'merchant') {
        const stock = st.you.stock;
        if (stock && stock.items[0] && me.gold >= stock.items[0].price) await emit(b.s, 'room', { op: 'buy', item: 0, slot: 1 });
        await emit(b.s, 'room', { op: 'ready' });
      } else if (room.type === 'event') {
        const ev = C.EVENTS[room.event];
        stats.events[room.event] = (stats.events[room.event] || 0) + 1;
        if (!room.choices || !room.choices[b.id]) {
          const opts = ev.options.filter(o => !o.needGold || me.gold >= o.needGold);
          const opt = opts[Math.floor(Math.random() * opts.length)];
          const r = await emit(b.s, 'room', { op: 'choose', opt: opt.id });
          if (!r.ok) stats.errors.push('event choose failed ' + room.event + ':' + opt.id + ' ' + r.msg);
          if (r.ok && r.q) await answer(b, r.q);
        }
        if (!ev.team) await emit(b.s, 'room', { op: 'ready' });
        else await sleep(100);
      } else if ((room.type === 'victory' || room.type === 'complete') && room.stats && !room.stats[b.id]) {
        if (room.type === 'complete') stats.completes++;
        const r = await emit(b.s, 'room', { op: 'stat', stat: ['atk', 'def', 'hp'][Math.floor(Math.random() * 3)] });
        // a bot can see the same victory twice before its pick lands; the server rightly refuses the second pick
        if (r.ok) stats.statPicks++; else if (!/already chosen/i.test(r.msg || '')) stats.errors.push('stat pick failed');
      } else if (room.type === 'defeat') {
        stats.defeats++;
        await emit(b.s, 'room', { op: 'ready' });
      } else if (room.type === 'raidEnd') {
        await sleep(200);
      } else {
        await emit(b.s, 'room', { op: 'ready' });
      }
    }
  } catch (e) {
    stats.errors.push(String(e));
  } finally { b.busy = false; }
}

main().catch(e => { console.error(e); srv.kill(); process.exit(1); });

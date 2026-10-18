// End-to-end server test: a teacher and N bot students play full runs over real sockets.
// Run: node test/bots.test.js [players] [teams-size]
// Stress test: STRESS=1 node test/bots.test.js 24 reports reply times, bytes sent to each device and server CPU/memory.
// REAL=1 also uses real game speed and bots that think 4-12 s before answering, like a class.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const C = require('../shared/content');

const PLAYERS = +(process.argv[2] || 8);
const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const LIMIT_MS = +(process.env.LIMIT || 300000);

const STRESS = process.env.STRESS === '1', REAL = process.env.REAL === '1';
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, MATHFALL_TEST: '1', MATHFALL_FAST: REAL ? '0' : '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
// ---- stress measurements
const M = { lat: {}, bytesStudent: 0, msgsStudent: 0, bytesHost: 0, cpu: [], rss: [], biggestState: 0 };
const fs = require('fs');
let lastCpu = null;
const sampler = STRESS ? setInterval(() => {
  try {
    const f = fs.readFileSync(`/proc/${srv.pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const ticks = +f[11] + +f[12], t = Date.now();
    if (lastCpu) M.cpu.push((ticks - lastCpu.ticks) / 100 / ((t - lastCpu.t) / 1000));
    lastCpu = { ticks, t };
    const rss = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${srv.pid}/status`, 'utf8'));
    if (rss) M.rss.push(+rss[1] / 1024);
  } catch (e) { /* server gone */ }
}, 1000) : null;
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const think = () => REAL ? sleep(4000 + Math.random() * 8000) : Promise.resolve();
let srvErr = '';
srv.stderr.on('data', d => { srvErr += d; process.stderr.write('[server] ' + d); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Resolve after 5 s even if a reply never comes (a socket closed mid-call during the reconnect test).
const emit = (s, ev, data) => new Promise(r => { const t0 = Date.now(); const t = setTimeout(() => { (M.lat[ev] = M.lat[ev] || []).push(5000); r({ ok: false, timeout: true }); }, 5000); s.emit(ev, data, x => { clearTimeout(t); (M.lat[ev] = M.lat[ev] || []).push(Date.now() - t0); r(x); }); });

const stats = { loot: {}, bought: 0, answered: 0, wrong: 0, actions: 0, fights: 0, rooms: {}, completes: 0, defeats: 0, swaps: 0, whiffs: 0, free: 0, qte: 0, qteOk: 0, events: {}, statPicks: 0, raid: null, errors: [] };
const RAID_AT = +(process.env.RAID_AT || 45000);

async function main() {
  await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('running')) r(); }));
  const host = io(URL, { transports: ['websocket'] });
  await new Promise(r => host.on('connect', r));
  const created = await emit(host, 'host:create', { settings: REAL ? { length: 'quick', timer: 60, wrongPause: 1.5, teamSize: 4, raidMinutes: 3 } : { length: 'quick', timer: 6, wrongPause: 0.1, teamSize: 4, raidMinutes: 2 }, questions: { bankIds: ['year-7-algebra-core-skills'], gens: [{ topic: 'integers', level: 2 }], format: 'mix' } });
  if (!created.ok) throw new Error('create failed ' + created.msg);
  const code = created.code;
  let hostState = null;
  host.on('host:state', s => { hostState = s; if (STRESS) M.bytesHost += JSON.stringify(s).length; });

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
    // device reports, like a real browser sends for the session report
    bot.tel = setInterval(() => { const t = Date.now(); bot.s.emit('tel', { fps: 50 + (i % 10), rtt: bot.rtt, transport: 'websocket', hidden: false, lowPower: i === 1, lat: [{ ev: 'answer', ms: 40 + i }], errors: i === 2 && !bot.errSent ? ['test error'] : [], info: { ua: 'bot', screen: '1366x768', dpr: 1, cores: 4 } }, () => { bot.rtt = Date.now() - t; }); bot.errSent = true; }, 2000);
    s.on('state', st => {
      if (STRESS) { const n = JSON.stringify(st).length; M.bytesStudent += n; M.msgsStudent++; if (n > M.biggestState) M.biggestState = n; }   // as sent
      if (st.run && !st.run.map && bot.state && bot.state.run) st.run.map = bot.state.run.map;   // the server skips an unchanged map
      bot.state = st; for (const ev of st.events || []) if (ev.kind === 'system' && ev.battle) stats.fights++; });
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
    s.on('state', st => { if (st.run && !st.run.map && b.state && b.state.run) st.run.map = b.state.run.map; b.state = st; });
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
  if (STRESS) {
    const secs = (Date.now() - t0) / 1000;
    const lat = Object.fromEntries(Object.entries(M.lat).filter(([, a]) => a.length >= 5).map(([k, a]) => [k, { n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: Math.max(...a) }]));
    console.log('STRESS ' + JSON.stringify({ players: PLAYERS, mode: REAL ? 'real speed, 4-12 s thinking' : 'fast, instant answers', seconds: Math.round(secs),
      cpuCoreAvg: +(M.cpu.reduce((a, b) => a + b, 0) / Math.max(1, M.cpu.length)).toFixed(3), cpuCoreP95: +pct(M.cpu, 0.95).toFixed(3), cpuCoreMax: +Math.max(0, ...M.cpu).toFixed(3),
      rssStartMB: Math.round(M.rss[0] || 0), rssMaxMB: Math.round(Math.max(0, ...M.rss)), rssEndMB: Math.round(M.rss[M.rss.length - 1] || 0),
      perStudentKBps: +(M.bytesStudent / PLAYERS / secs / 1024).toFixed(2), classKBps: +(M.bytesStudent / secs / 1024).toFixed(1), hostKBps: +(M.bytesHost / secs / 1024).toFixed(1),
      statesPerStudentPerSec: +(M.msgsStudent / PLAYERS / secs).toFixed(2), biggestStateKB: +(M.biggestState / 1024).toFixed(1), latencyMs: lat }, null, 1));
    clearInterval(sampler);
  }
  const res = await emit(host, 'host:end', {});
  await sleep(400);
  const r = hostState && hostState.results;
  // session report
  const rep = await fetch(`${URL}/api/report/${code}?k=${created.hostToken}`).then(x => x.json()).catch(e => ({ error: String(e) }));
  const bad = await fetch(`${URL}/api/report/${code}?k=wrong`).then(x => x.status);
  if (bad !== 404) stats.errors.push('report not protected by the host token');
  if (rep.format !== 'mathfall-session-report') stats.errors.push('no session report: ' + JSON.stringify(rep).slice(0, 200));
  else {
    if (rep.devices.length !== PLAYERS) stats.errors.push('report devices ' + rep.devices.length);
    if (!rep.timeline.length) stats.errors.push('report has no timeline');
    if (!rep.summary.disconnects || !rep.summary.rejoins) stats.errors.push('report missed the reconnect');
    if (!rep.summary.lowPowerDevices.includes('Bot1')) stats.errors.push('report missed low power');
    if (!rep.summary.clientErrors) stats.errors.push('report missed client errors');
    if (!rep.devices.some(d => d.fps && d.pingMs && d.replyMs)) stats.errors.push('report missing device stats');
    if (!rep.events.some(e => e.kind === 'raidStart') || !rep.events.some(e => e.kind === 'end')) stats.errors.push('report missing game events');
    console.log('REPORT summary ' + JSON.stringify(rep.summary));
    if (process.env.REPORT_OUT) require('fs').writeFileSync(process.env.REPORT_OUT, JSON.stringify(rep, null, 1));
  }
  console.log(JSON.stringify({ ...stats, finished: done.size, players: PLAYERS, resultsPlayers: r ? r.players.length : 0, teams: r ? r.teams : null }, null, 1));
  if (!r || r.players.length !== PLAYERS) stats.errors.push('results missing players');
  if (stats.answered < PLAYERS * 3) stats.errors.push('too few answers');
  if (!stats.whiffs) stats.errors.push('no whiffs seen');
  if (!stats.free) stats.errors.push('no free actions used');
  if (!stats.statPicks) stats.errors.push('no stat upgrades picked');
  host.close(); bots.forEach(b => { clearInterval(b.tel); b.s.close(); });
  srv.kill();
  if (stats.errors.length || srvErr.includes('Error')) { console.error('FAILED', stats.errors); process.exit(1); }
  console.log('bot test passed');
}

async function answer(b, q) {
  await think();
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
    if (me && (me.skills.length > C.MAX_SKILLS || me.skills.some(sk => C.SKILLS[sk.id].cls !== me.cls))) stats.errors.push('bad loadout ' + me.cls + ' ' + me.skills.map(x => x.id));
    if (run.phase === 'map' && run.map.options.length && !run.map.votes[b.id]) {
      const opt = run.map.options[Math.floor(Math.random() * run.map.options.length)];
      await emit(b.s, 'vote', { node: opt });
    } else if (run.phase === 'combat' && me && run.combat && run.combat.phase === 'player') {
      let action = null;
      if (me.downed) action = 'rise';
      else if (!me.acted && !me.ready) {
        const opts = ['attack', 'defend'];
        me.skills.forEach((s, i) => { if (C.SKILLS[s.id] && (me.energy || 0) >= C.skillCost(s.id, me)) opts.push('skill' + i); });
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
        await emit(b.s, 'room', { op: 'open' });
        // keep one of the three: a skill (into the free slot, or over a random one), an item, or the gold
        const pickIt = ['skill', 'item', 'gold'][Math.floor(Math.random() * 3)];
        let t = await emit(b.s, 'room', { op: 'take', pick: pickIt, slot: Math.floor(Math.random() * 3) });
        if (!t.ok) t = await emit(b.s, 'room', { op: 'take', pick: 'gold' });
        if (t.ok) { stats.loot[pickIt] = (stats.loot[pickIt] || 0) + 1; if (pickIt === 'skill') stats.swaps++; } else stats.errors.push('chest take failed ' + t.msg);
      } else if (room.type === 'rest') {
        const rr = Math.random(); await emit(b.s, 'room', rr < 0.4 ? { op: 'rest' } : rr < 0.7 ? { op: 'train', slot: 0 } : { op: 'meditate' });
      } else if (room.type === 'merchant') {
        const stock = st.you.stock;
        for (const kind of ['skill', 'item']) {
          const it = stock && (kind === 'item' ? stock.items : stock.skills)[0];
          if (it && !it.sold && me.gold >= it.price) { const r = await emit(b.s, 'room', { op: 'buy', kind, i: 0, slot: 2 }); if (r.ok) { stats.bought++; me.gold -= it.price; } else stats.errors.push('buy failed ' + r.msg); }
        }
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

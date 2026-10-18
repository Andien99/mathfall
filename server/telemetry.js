// Session report: how a game ran (server load, network, every student's device), for feedback after a lesson.
// The teacher downloads it from the live view or the results page (/api/report/:code?k=<hostToken>).
// A one-line summary also goes to the server log every minute, so a crash or redeploy doesn't lose everything.
const os = require('os');
const { monitorEventLoopDelay } = require('perf_hooks');

const now = () => Date.now();
const SAMPLE_MS = 10000;
const LOG_EVERY = 6;            // samples per log line (one a minute)
const MAX_SAMPLES = 1100;       // ~3 h at 10 s
const MAX_EVENTS = 3000;
const MAX_LAT = 600;            // answer/act round trips kept per device
const BUILD = (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 10);

const r1 = x => Math.round(x * 10) / 10;
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const median = a => pct(a, 0.5);
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const packetBytes = d => d == null ? 0 : typeof d === 'string' ? Buffer.byteLength(d) : (d.byteLength || d.length || 0);

// ---------------------------------------------------------------- process-wide sampling
const RES = 10;
const loop = monitorEventLoopDelay({ resolution: RES });
loop.enable();
let lastCpu = process.cpuUsage(), lastAt = now();
function processSample(games) {
  const cpu = process.cpuUsage(), t = now();
  const used = (cpu.user - lastCpu.user + cpu.system - lastCpu.system) / 1000;   // ms of CPU
  const pctCpu = 100 * used / Math.max(1, t - lastAt);
  lastCpu = cpu; lastAt = t;
  const m = process.memoryUsage();
  const ms = v => r1(Math.max(0, v / 1e6 - RES));   // the histogram includes its own 10 ms timer
  const out = { cpu: r1(pctCpu), rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576),
    lagMean: ms(loop.mean), lagP99: ms(loop.percentile(99)), lagMax: ms(loop.max), games };
  loop.reset();
  return out;
}

class Telemetry {
  constructor(session) {
    this.s = session;
    this.t0 = now();
    this.samples = [];
    this.events = [];
    this.dev = new Map();        // player id -> device record
    this.bytesOut = 0; this.bytesIn = 0; this.msgsOut = 0;
    this.hostBytesOut = 0;
    this.lastOut = 0; this.lastIn = 0;
    this.tickMax = 0; this.tickWorst = 0;
    this.n = 0;
    this.startedAt = null; this.endedAt = null;
  }
  sec(t = now()) { return Math.round((t - this.t0) / 100) / 10; }
  event(kind, data) {
    if (this.events.length >= MAX_EVENTS) return;
    this.events.push({ t: this.sec(), kind, ...data });
  }
  devFor(p) {
    let d = this.dev.get(p.id);
    if (!d) {
      d = { name: p.name, joins: 0, disconnects: 0, reconnects: 0, reasons: {}, out: 0, in: 0, transport: null, upgrades: 0,
        fps: [], rtt: [], lat: [], lowPower: false, lowPowerAt: null, hiddenSec: 0, errors: [], info: null, last: null, socketReconnects: 0 };
      this.dev.set(p.id, d);
    }
    d.name = p.name;
    return d;
  }

  // Count bytes on a socket (students and the teacher's screen). Called once per socket.
  track(socket, p) {
    if (!socket || !socket.conn || socket.__mfTel === this) return;
    socket.__mfTel = this;
    const conn = socket.conn;
    const d = p ? this.devFor(p) : null;
    if (d) d.transport = conn.transport && conn.transport.name;
    conn.on('packetCreate', pk => {
      const b = packetBytes(pk && pk.data);
      this.bytesOut += b; this.msgsOut++;
      if (d) d.out += b; else this.hostBytesOut += b;
    });
    conn.on('packet', pk => { const b = packetBytes(pk && pk.data); this.bytesIn += b; if (d) d.in += b; });
    if (d) conn.on('upgrade', tr => { d.transport = tr && tr.name; d.upgrades++; });
  }
  joined(p, socket, rejoin) {
    const d = this.devFor(p);
    d.joins++;
    if (rejoin) d.reconnects++;
    this.track(socket, p);
    this.event(rejoin ? 'rejoin' : 'join', { name: p.name, transport: d.transport });
  }
  left(p, reason) {
    const d = this.devFor(p);
    d.disconnects++;
    const r = str(reason, 40) || 'unknown';
    d.reasons[r] = (d.reasons[r] || 0) + 1;
    this.event('disconnect', { name: p.name, reason: r });
  }

  // A student device's report (every 10 s): frame rate, ping, answer round trips, errors.
  device(p, raw) {
    if (!raw || typeof raw !== 'object') return;
    const d = this.devFor(p);
    const fps = num(raw.fps, 0, 240), rtt = num(raw.rtt, 0, 60000);
    if (fps != null && !raw.hidden) d.fps.push(Math.round(fps));
    if (rtt != null) d.rtt.push(Math.round(rtt));
    if (d.fps.length > MAX_SAMPLES) d.fps.shift();
    if (d.rtt.length > MAX_SAMPLES) d.rtt.shift();
    if (Array.isArray(raw.lat)) for (const x of raw.lat.slice(0, 60)) {
      const ms = num(x && x.ms, 0, 60000); if (ms == null) continue;
      d.lat.push({ ev: str(x.ev, 10), ms: Math.round(ms) }); if (d.lat.length > MAX_LAT) d.lat.shift();
    }
    if (raw.lowPower && !d.lowPower) { d.lowPower = true; d.lowPowerAt = this.sec(); this.event('lowPower', { name: p.name, fps }); }
    d.hiddenSec += num(raw.hiddenSec, 0, 60) || 0;
    if (raw.transport) d.transport = str(raw.transport, 12);
    const sr = num(raw.reconnects, 0, 1000); if (sr != null) d.socketReconnects = sr;
    if (Array.isArray(raw.errors)) for (const e of raw.errors.slice(0, 5)) {
      if (d.errors.length >= 15) break;
      const msg = str(e, 200); d.errors.push({ t: this.sec(), msg }); this.event('clientError', { name: p.name, msg });
    }
    if (raw.info && !d.info) {
      const i = raw.info;
      d.info = { ua: str(i.ua, 200), screen: str(i.screen, 20), dpr: num(i.dpr, 0, 8), cores: num(i.cores, 0, 256), memGB: num(i.mem, 0, 1024), touch: !!i.touch };
    }
    d.last = { fps, rtt, hidden: !!raw.hidden, t: this.sec() };
  }

  tickTime(ms) { if (ms > this.tickMax) this.tickMax = ms; if (ms > this.tickWorst) this.tickWorst = ms; }

  sample(proc) {
    const s = this.s, t = now();
    const players = [...s.players.values()], conn = players.filter(p => p.connected);
    let ws = 0, poll = 0;
    for (const p of conn) { const tr = p.socket && p.socket.conn && p.socket.conn.transport && p.socket.conn.transport.name; if (tr === 'websocket') ws++; else poll++; }
    const fps = [], rtt = []; let hidden = 0;
    for (const p of conn) { const d = this.dev.get(p.id); if (!d || !d.last || this.sec(t) - d.last.t > 25) continue; if (d.last.hidden) hidden++; else if (d.last.fps != null) fps.push(d.last.fps); if (d.last.rtt != null) rtt.push(d.last.rtt); }
    const dt = SAMPLE_MS / 1000;
    const phases = {};
    for (const team of s.teams) { const run = team.run; const k = !run ? 'none' : run.raidMode ? 'raid' : run.phase === 'combat' && run.combat ? (run.combat.type || 'combat') : run.phase === 'room' && run.room ? run.room.type : run.phase; phases[k] = (phases[k] || 0) + 1; }
    const row = {
      t: this.sec(t), state: s.paused ? 'paused' : s.state, players: players.length, connected: conn.length, ws, poll, hidden,
      outKBs: r1((this.bytesOut - this.lastOut) / 1024 / dt), inKBs: r1((this.bytesIn - this.lastIn) / 1024 / dt),
      tickMaxMs: r1(this.tickMax), fpsMed: median(fps), fpsMin: fps.length ? Math.min(...fps) : null, rttMed: median(rtt), rttMax: rtt.length ? Math.max(...rtt) : null,
      phases, ...proc
    };
    this.lastOut = this.bytesOut; this.lastIn = this.bytesIn; this.tickMax = 0;
    if (this.samples.length < MAX_SAMPLES) this.samples.push(row);
    if (++this.n % LOG_EVERY === 0 && conn.length) this.log(row);
  }
  log(row) {
    console.log('[mf-telemetry] ' + JSON.stringify({ code: this.s.code, min: Math.round(row.t / 60), state: row.state, conn: row.connected, poll: row.poll,
      cpu: row.cpu, lagP99: row.lagP99, rssMB: row.rssMB, outKBs: row.outKBs, fpsMed: row.fpsMed, fpsMin: row.fpsMin, rttMax: row.rttMax, tickMaxMs: row.tickMaxMs }));
  }
  final() {
    this.endedAt = now();
    console.log('[mf-telemetry] final ' + JSON.stringify({ code: this.s.code, ...this.report().summary }));
  }

  report() {
    const s = this.s, S = this.samples;
    const col = k => S.map(r => r[k]).filter(v => v != null);
    const playing = S.filter(r => r.state === 'playing');
    const devices = [...this.dev.entries()].map(([id, d]) => {
      const p = s.players.get(id), team = p && s.team(p.teamId);
      const lat = d.lat.map(x => x.ms), ans = d.lat.filter(x => x.ev === 'answer').map(x => x.ms);
      return {
        name: d.name, team: team ? team.name : '', hero: p && p.cls ? p.cls : null, connected: !!(p && p.connected),
        device: d.info, transport: d.transport, upgradedToWebsocket: d.upgrades > 0,
        joins: d.joins, rejoins: d.reconnects, disconnects: d.disconnects, disconnectReasons: d.reasons, socketReconnects: d.socketReconnects,
        fps: d.fps.length ? { median: median(d.fps), p10: pct(d.fps, 0.1), min: Math.min(...d.fps) } : null,
        pingMs: d.rtt.length ? { median: median(d.rtt), p95: pct(d.rtt, 0.95), max: Math.max(...d.rtt) } : null,
        replyMs: lat.length ? { n: lat.length, median: median(lat), p95: pct(lat, 0.95), max: Math.max(...lat), answerP95: pct(ans, 0.95) } : null,
        lowPower: d.lowPower, lowPowerAtSec: d.lowPowerAt, tabAwaySec: Math.round(d.hiddenSec),
        kbSent: Math.round(d.out / 1024), kbReceived: Math.round(d.in / 1024), errors: d.errors
      };
    });
    const allLat = []; for (const d of this.dev.values()) for (const x of d.lat) allLat.push(x.ms);
    const allFps = []; for (const d of this.dev.values()) allFps.push(...d.fps);
    const mins = Math.max(1 / 60, (((this.endedAt || now()) - (this.startedAt || this.t0)) / 60000));
    const slow = devices.filter(d => d.fps).sort((a, b) => a.fps.median - b.fps.median).slice(0, 5).map(d => ({ name: d.name, fpsMedian: d.fps.median, fpsMin: d.fps.min, device: d.device ? d.device.ua : null }));
    const laggy = devices.filter(d => d.pingMs).sort((a, b) => b.pingMs.p95 - a.pingMs.p95).slice(0, 5).map(d => ({ name: d.name, pingP95: d.pingMs.p95, pingMax: d.pingMs.max, transport: d.transport }));
    const max = a => a.length ? Math.max(...a) : null;
    const avg = a => a.length ? r1(a.reduce((x, y) => x + y, 0) / a.length) : null;
    const summary = {
      minutesPlayed: r1(mins), students: s.players.size, teams: s.teams.length, peakConnected: max(col('connected')),
      cpuPctAvg: avg(playing.map(r => r.cpu)), cpuPctPeak: max(col('cpu')),
      rssMBPeak: max(col('rssMB')), eventLoopLagP99Peak: max(col('lagP99')), eventLoopLagMax: max(col('lagMax')), worstTickMs: r1(this.tickWorst),
      kbPerSecPeak: max(col('outKBs')), kbPerSecPerStudentAvg: playing.length ? r1(avg(playing.map(r => r.connected ? r.outKBs / r.connected : 0))) : null,
      replyMsMedian: median(allLat), replyMsP95: pct(allLat, 0.95), replyMsMax: max(allLat),
      fpsMedian: median(allFps), fpsP10: pct(allFps, 0.1),
      disconnects: devices.reduce((a, d) => a + d.disconnects, 0), rejoins: devices.reduce((a, d) => a + d.rejoins, 0),
      pollingDevices: devices.filter(d => d.transport && d.transport !== 'websocket').map(d => d.name),
      lowPowerDevices: devices.filter(d => d.lowPower).map(d => d.name),
      clientErrors: devices.reduce((a, d) => a + d.errors.length, 0),
      otherGamesOnServer: max(col('games')) > 1, slowestDevices: slow, highestPing: laggy
    };
    return {
      format: 'mathfall-session-report', version: 1, generatedAt: new Date().toISOString(), build: BUILD,
      server: { node: process.version, platform: os.platform(), cpus: os.cpus().length, cpuModel: (os.cpus()[0] || {}).model || '', totalMemMB: Math.round(os.totalmem() / 1048576), render: !!process.env.RENDER, region: process.env.RENDER_REGION || null },
      game: { code: s.code, title: s.qs && s.qs.title, state: s.state, test: !!s.test, settings: s.settings,
        createdAt: new Date(this.t0).toISOString(), startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null, endedAt: this.endedAt ? new Date(this.endedAt).toISOString() : null },
      summary,
      notes: 'Times in timeline and events are seconds since the game was created. cpu is % of one core for the whole server process; Render free gives about 10%.',
      timeline: S, events: this.events, devices
    };
  }
}

// Every 10 s: sample the process once, then hand it to every live game.
function start(sessions) {
  setInterval(() => {
    const live = [...sessions.values()].filter(s => s.tel && s.state !== 'ended');
    const proc = processSample(live.length);
    for (const s of live) { try { s.tel.sample(proc); } catch (e) { console.error('telemetry', e); } }
  }, SAMPLE_MS).unref();
}

module.exports = { Telemetry, start };

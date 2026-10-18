// Device report for the teacher's session report: every 10 s this device tells the server its frame rate, ping,
// how long its answers took to come back, whether it dropped to lower detail, and any errors. Nothing here
// affects play; if anything fails it is silently skipped.
const EVERY = 10000;
const errors = [];
const lat = [];
let reconnects = 0, hiddenMs = 0, hiddenSince = document.hidden ? performance.now() : 0, rtt = null, sentInfo = false;

function addError(msg) { if (errors.length < 10) errors.push(String(msg || '').slice(0, 200)); }
addEventListener('error', e => addError((e.message || 'error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
addEventListener('unhandledrejection', e => addError('promise: ' + ((e.reason && (e.reason.message || e.reason)) || '')));
document.addEventListener('visibilitychange', () => {
  const t = performance.now();
  if (document.hidden) hiddenSince = t; else if (hiddenSince) { hiddenMs += t - hiddenSince; hiddenSince = 0; }
});

// Wrap a socket.emit ack so the round trip is recorded: socket.emit('answer', data, timed('answer', res => …))
export function timed(ev, cb) {
  const t0 = performance.now();
  return (...args) => { if (lat.length < 60) lat.push({ ev, ms: Math.round(performance.now() - t0) }); return cb(...args); };
}

export function startTelemetry(socket, scene) {
  socket.io.on('reconnect', () => { reconnects++; });
  setInterval(() => {
    try {
      if (!socket.connected) return;
      const ft = scene && scene.frameTimes;
      const fps = ft && ft.length > 20 && !document.hidden ? 1 / (ft.reduce((a, b) => a + b, 0) / ft.length) : null;
      const t = performance.now();
      if (hiddenSince) { hiddenMs += t - hiddenSince; hiddenSince = t; }
      const d = {
        fps: fps && Math.round(fps), rtt, hidden: document.hidden, lowPower: !!(scene && scene.lowPower),
        transport: socket.io.engine && socket.io.engine.transport && socket.io.engine.transport.name,
        reconnects, hiddenSec: Math.round(hiddenMs / 100) / 10, lat: lat.splice(0), errors: errors.splice(0)
      };
      hiddenMs = 0;
      if (!sentInfo) {
        d.info = { ua: navigator.userAgent, screen: screen.width + 'x' + screen.height, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency || null, mem: navigator.deviceMemory || null, touch: 'ontouchstart' in window };
        sentInfo = true;
      }
      socket.emit('tel', d, () => { rtt = Math.round(performance.now() - t); });
    } catch (e) { /* never get in the way of the game */ }
  }, EVERY);
  socket.on('connect', () => { sentInfo = false; });   // a new device or rejoin sends its details again
}

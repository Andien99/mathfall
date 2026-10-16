// Synthesised sound effects (no audio files). Unlocks on the first tap, as iPads require.
let ctx = null, master = null, enabled = true, noiseBuf = null;
let lastPlay = {};

export function setSound(on) { enabled = !!on; try { localStorage.setItem('mf_sound', on ? '1' : '0'); } catch (e) {} if (master) master.gain.value = on ? 0.5 : 0; }
export function soundOn() { return enabled; }
try { const v = localStorage.getItem('mf_sound'); if (v === '0') enabled = false; } catch (e) {}

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = enabled ? 0.5 : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16;
    master.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlockAudio, { passive: true }));

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { freq = 1200, q = 1, vol = 0.3, type = 'bandpass', slide = 1, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide !== 1) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

const SFX = {
  slash: () => { noise(0.16, { freq: 2600, q: 0.8, vol: 0.35, slide: 0.4 }); tone(320, 0.08, { type: 'triangle', vol: 0.08, slide: 0.6 }); },
  heavy: () => { noise(0.25, { freq: 1600, q: 0.7, vol: 0.45, slide: 0.3 }); tone(140, 0.2, { type: 'sawtooth', vol: 0.12, slide: 0.5 }); },
  whirl: () => { noise(0.45, { freq: 900, q: 2, vol: 0.3, slide: 3 }); },
  hit: () => { noise(0.08, { freq: 900, q: 1, vol: 0.4, type: 'lowpass' }); tone(110, 0.1, { type: 'sine', vol: 0.3, slide: 0.5 }); },
  stomp: () => { noise(0.12, { freq: 260, q: 0.7, vol: 0.4, type: 'lowpass' }); tone(55, 0.14, { type: 'sine', vol: 0.35, slide: 0.6 }); },   // hooves, earth spikes
  hitBig: () => { noise(0.18, { freq: 700, q: 0.8, vol: 0.55, type: 'lowpass' }); tone(80, 0.22, { type: 'sine', vol: 0.45, slide: 0.45 }); },
  hurt: () => { tone(220, 0.14, { type: 'square', vol: 0.08, slide: 0.6 }); noise(0.1, { freq: 600, vol: 0.3, type: 'lowpass' }); },
  block: () => { tone(880, 0.18, { type: 'triangle', vol: 0.18, slide: 0.98 }); tone(1320, 0.12, { type: 'sine', vol: 0.08 }); },
  shield: () => { tone(520, 0.3, { type: 'triangle', vol: 0.14, slide: 1.5 }); tone(780, 0.3, { type: 'sine', vol: 0.08, slide: 1.5, delay: 0.05 }); },
  heal: () => { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.12, delay: i * 0.06 })); },
  cast: () => { tone(300, 0.35, { type: 'triangle', vol: 0.12, slide: 2.5 }); noise(0.3, { freq: 3000, q: 4, vol: 0.08, slide: 0.5 }); },
  bow: () => { tone(180, 0.08, { type: 'triangle', vol: 0.18, slide: 1.8 }); noise(0.12, { freq: 4000, q: 2, vol: 0.12, slide: 0.3, delay: 0.03 }); },
  zap: () => { noise(0.3, { freq: 5000, q: 0.5, vol: 0.35, slide: 0.2 }); tone(90, 0.25, { type: 'sawtooth', vol: 0.12 }); },
  burn: () => { noise(0.25, { freq: 1500, q: 0.6, vol: 0.18, slide: 0.6 }); },
  poison: () => { tone(260, 0.18, { type: 'sine', vol: 0.1, slide: 0.7 }); tone(200, 0.16, { type: 'sine', vol: 0.08, slide: 0.7, delay: 0.08 }); },
  ice: () => { [1800, 2400, 1500].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.04 })); },
  focus: () => { tone(990, 0.2, { type: 'sine', vol: 0.12, slide: 1.5 }); },
  enemyWind: () => { noise(0.2, { freq: 400, q: 1, vol: 0.12, slide: 2 }); },
  twinkle: () => { tone(880, 0.5, { type: 'sine', vol: 0.06, slide: 1.8 }); setTimeout(() => tone(1320, 0.3, { type: 'triangle', vol: 0.04 }), 180); },
  charge: () => { tone(110, 0.6, { type: 'sawtooth', vol: 0.12, slide: 2 }); },
  roar: () => { noise(0.8, { freq: 300, q: 0.6, vol: 0.5, type: 'lowpass', slide: 0.5 }); tone(70, 0.8, { type: 'sawtooth', vol: 0.2, slide: 0.7 }); },
  hex: () => { tone(400, 0.3, { type: 'square', vol: 0.06, slide: 0.5 }); },
  defeat: () => { noise(0.4, { freq: 2000, q: 0.5, vol: 0.18, slide: 0.2 }); tone(330, 0.3, { type: 'triangle', vol: 0.08, slide: 0.4 }); },
  correct: () => { tone(784, 0.14, { type: 'triangle', vol: 0.2 }); tone(1175, 0.24, { type: 'triangle', vol: 0.18, delay: 0.09 }); },
  wrong: () => { tone(260, 0.22, { type: 'sine', vol: 0.16, slide: 0.85 }); },
  click: () => { tone(1200, 0.04, { type: 'sine', vol: 0.06 }); },
  open: () => { tone(400, 0.12, { type: 'triangle', vol: 0.12, slide: 1.4 }); [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.12, delay: 0.12 + i * 0.07 })); },
  coin: () => { tone(1568, 0.08, { type: 'square', vol: 0.06 }); tone(2093, 0.18, { type: 'square', vol: 0.05, delay: 0.07 }); },
  victory: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i === 3 ? 0.6 : 0.18, { type: 'triangle', vol: 0.16, delay: i * 0.12 })); },
  lose: () => { [392, 330, 262].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.22 })); },
  vote: () => { tone(660, 0.08, { type: 'sine', vol: 0.1 }); },
  banner: () => { noise(0.5, { freq: 300, q: 0.5, vol: 0.15, type: 'lowpass', slide: 2 }); },
  whoosh: () => { noise(0.22, { freq: 1200, q: 0.6, vol: 0.22, slide: 2.2 }); }
};

export function sfx(name) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t = performance.now();
  if (lastPlay[name] && t - lastPlay[name] < 45) return;
  lastPlay[name] = t;
  try { (SFX[name] || SFX.click)(); } catch (e) { /* ignore */ }
}

// Builds Mathfall's 8-bit sound effects with jsfxr (the JavaScript port of sfxr, the classic
// retro game sound tool) and writes them to public/sfx/<name>.wav (8-bit, 22050 Hz, mono).
//
//   npm install          (jsfxr is a dev dependency)
//   node tools/build_sfx.js            build every sound
//   node tools/build_sfx.js coin hit   build only these
//
// Each sound is either one sfxr patch (fx) or several layered/sequenced patches (mix), so the
// jingles (victory, chest, heal…) are tunes played on sfxr square/sine voices like an NES.
// Times are in seconds and pitches in Hz or note names; everything else uses sfxr's own
// slider ranges (slide, dslide, duty, vib, arp, repeat, phaser, lpf, hpf: see jsfxr's README).
// Paste fx({...}).b58 output into https://sfxr.me/#<code> to hear and tweak a patch.
'use strict';
const fs = require('fs');
const path = require('path');
const { Params, SoundEffect, convert, waveforms: W } = require('jsfxr');

const OUT = path.join(__dirname, '..', 'public', 'sfx');
const RATE = 22050;               // output sample rate (sfxr renders at 44100; we average pairs)
const inv = convert.sliders_inverse;

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function hz(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G]#?)(\d)$/.exec(n);
  return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
}

// One sfxr patch, in friendly units.
function fx(o) {
  const p = new Params();
  p.wave_type = { square: W.SQUARE, saw: W.SAWTOOTH, sine: W.SINE, noise: W.NOISE }[o.wave || 'square'];
  p.p_base_freq = inv.p_base_freq(hz(o.freq || 440));
  if (o.limit) p.p_freq_limit = inv.p_freq_limit(hz(o.limit));
  p.p_env_attack = inv.p_env_attack((o.attack || 0) * 44100);
  p.p_env_sustain = inv.p_env_sustain((o.sustain == null ? 0.05 : o.sustain) * 44100);
  p.p_env_decay = inv.p_env_decay((o.decay == null ? 0.1 : o.decay) * 44100);
  p.p_env_punch = o.punch || 0;
  p.p_freq_ramp = o.slide || 0;
  p.p_freq_dramp = o.dslide || 0;
  p.p_duty = o.duty == null ? 0 : o.duty;          // 0 = 50% square, 0.5 = 25%, 0.75 = 12.5%
  p.p_duty_ramp = o.dutyRamp || 0;
  p.p_vib_strength = o.vib || 0;
  p.p_vib_speed = o.vibSpeed || 0;
  p.p_arp_mod = o.arp || 0;
  p.p_arp_speed = o.arpSpeed || 0;
  p.p_repeat_speed = o.repeat || 0;
  p.p_pha_offset = o.phaser || 0;
  p.p_pha_ramp = o.phaserRamp || 0;
  p.p_lpf_freq = o.lpf == null ? 1 : o.lpf;
  p.p_lpf_ramp = o.lpfRamp || 0;
  p.p_lpf_resonance = o.res || 0;
  p.p_hpf_freq = o.hpf || 0;
  p.p_hpf_ramp = o.hpfRamp || 0;
  p.sound_vol = 0.5;
  p.sample_rate = 44100;
  p.sample_size = 16;
  return { parts: [{ at: 0, gain: o.gain == null ? 1 : o.gain, p }] };
}
// Layer several patches: [[startTime, patch], …].
function mix(list) {
  return { parts: list.flatMap(([at, s]) => s.parts.map(q => ({ ...q, at: q.at + at }))) };
}
// A tune: notes [[note, beats], …] on one voice (null = rest). base = patch shared by every note.
function tune(notes, beat, base) {
  let t = 0; const list = [];
  for (const [n, beats] of notes) {
    if (n) list.push([t, fx({ ...base, freq: n, sustain: Math.max(0.01, beat * beats * (base.hold || 0.55)), decay: base.decay == null ? beat * beats * 0.6 : base.decay })]);
    t += beat * beats;
  }
  return mix(list);
}

const lead = { wave: 'square', duty: 0.5, punch: 0.25 };              // 25% pulse, bright
const lead2 = { wave: 'square', duty: 0.75, punch: 0.15 };            // 12.5% pulse, thin
const bass = { wave: 'sine', punch: 0.1 };                            // stands in for the NES triangle

const SOUNDS = {
  // ---- interface ----
  click:  fx({ freq: 1400, duty: 0.5, sustain: 0.012, decay: 0.03, gain: 0.8 }),
  vote:   mix([[0, fx({ freq: 'E5', duty: 0.5, sustain: 0.03, decay: 0.04 })], [0.05, fx({ freq: 'B5', duty: 0.5, sustain: 0.03, decay: 0.08 })]]),
  coin:   mix([[0, fx({ freq: 'B5', duty: 0.5, sustain: 0.06, decay: 0.02, punch: 0.3 })], [0.07, fx({ freq: 'E6', duty: 0.5, sustain: 0.12, decay: 0.25, punch: 0.3 })]]),
  correct: tune([['C6', 1], ['E6', 1], ['G6', 1], ['C7', 2.5]], 0.055, { ...lead, decay: 0.12 }),
  wrong:  mix([[0, fx({ freq: 'D#3', duty: 0, sustain: 0.1, decay: 0.05, vib: 0.3, vibSpeed: 0.6 })],
               [0.14, fx({ freq: 'A#2', duty: 0, sustain: 0.18, decay: 0.12, vib: 0.3, vibSpeed: 0.6, slide: -0.1 })]]),
  banner: mix([[0, fx({ wave: 'noise', freq: 600, sustain: 0.05, decay: 0.3, slide: 0.15, lpf: 0.5, gain: 0.45 })],
               [0.02, tune([['G3', 1], [null, 0.5], ['C4', 3]], 0.09, { ...lead, decay: 0.25 })],
               [0.02, tune([['G2', 1], [null, 0.5], ['C3', 3]], 0.09, { ...bass, decay: 0.3 })]]),
  open:   mix([[0, fx({ freq: 300, duty: 0.3, sustain: 0.04, decay: 0.08, slide: 0.35 })],
               [0.1, tune([['A5', 1], ['C#6', 1], ['E6', 1], ['A6', 4]], 0.07, { ...lead, decay: 0.3, vib: 0.08, vibSpeed: 0.55 })],
               [0.1, tune([['A4', 3], ['E5', 4]], 0.07, { ...lead2, decay: 0.3, gain: 0.5 })]]),
  victory: mix([[0, tune([['G5', 1], ['G5', 1], ['G5', 1], ['D#5', 3], ['F5', 3], ['G5', 2], ['F5', 1], ['G5', 6]], 0.09, { ...lead, vib: 0.06, vibSpeed: 0.5 })],
                [0, tune([['D#4', 3], ['D#4', 3], ['F4', 3], ['D4', 3], ['D#4', 6]], 0.09, { ...lead2, gain: 0.45 })],
                [0, tune([['C3', 3], ['G#2', 3], ['A#2', 3], ['G2', 3], ['C3', 6]], 0.09, bass)]]),
  lose:   mix([[0, tune([['G4', 2], ['F#4', 2], ['F4', 2], ['E4', 6]], 0.14, { ...lead, vib: 0.2, vibSpeed: 0.45, hold: 0.7 })],
               [0, tune([['C3', 6], ['C2', 6]], 0.14, bass)]]),

  // ---- hero attacks ----
  slash:  mix([[0, fx({ wave: 'noise', freq: 2200, sustain: 0.03, decay: 0.12, slide: -0.25, hpf: 0.2, punch: 0.4 })],
               [0, fx({ freq: 900, duty: 0.6, sustain: 0.01, decay: 0.06, slide: -0.5, gain: 0.35 })]]),
  heavy:  mix([[0, fx({ wave: 'noise', freq: 1200, sustain: 0.05, decay: 0.2, slide: -0.2, punch: 0.5 })],
               [0, fx({ freq: 220, duty: 0, sustain: 0.04, decay: 0.16, slide: -0.4, gain: 0.6 })]]),
  whirl:  fx({ wave: 'noise', freq: 500, sustain: 0.18, decay: 0.2, slide: 0.18, phaser: 0.35, phaserRamp: -0.2, lpf: 0.6, gain: 0.8 }),
  whoosh: fx({ wave: 'noise', freq: 700, sustain: 0.06, decay: 0.15, slide: 0.3, hpf: 0.15, gain: 0.8 }),
  bow:    mix([[0, fx({ freq: 300, duty: 0.5, sustain: 0.01, decay: 0.04, slide: 0.5, gain: 0.5 })],
               [0.02, fx({ wave: 'noise', freq: 3500, sustain: 0.02, decay: 0.08, slide: -0.3, hpf: 0.35 })]]),
  cast:   fx({ freq: 350, duty: 0.4, dutyRamp: 0.3, sustain: 0.12, decay: 0.18, slide: 0.22, vib: 0.25, vibSpeed: 0.6, phaser: 0.2 }),
  zap:    mix([[0, fx({ wave: 'saw', freq: 1800, limit: 120, sustain: 0.08, decay: 0.15, slide: -0.35, repeat: 0.62, punch: 0.3 })],
               [0, fx({ wave: 'noise', freq: 5000, sustain: 0.05, decay: 0.2, slide: -0.2, gain: 0.6 })]]),
  burn:   fx({ wave: 'noise', freq: 900, sustain: 0.1, decay: 0.22, slide: -0.05, lpf: 0.55, repeat: 0.55, punch: 0.4, gain: 0.8 }),
  poison: mix([[0, fx({ freq: 260, duty: 0, sustain: 0.03, decay: 0.07, slide: 0.35 })],
               [0.09, fx({ freq: 200, duty: 0, sustain: 0.03, decay: 0.07, slide: 0.35 })],
               [0.18, fx({ freq: 160, duty: 0, sustain: 0.03, decay: 0.1, slide: 0.3 })]]),
  ice:    tune([['E7', 1], ['B6', 1], ['G7', 1], ['D7', 2]], 0.04, { ...lead2, decay: 0.12, punch: 0.4 }),
  heal:   mix([[0, tune([['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['E6', 1], ['G6', 3]], 0.05, { ...lead2, decay: 0.15, vib: 0.15, vibSpeed: 0.6 })]]),
  shield: mix([[0, fx({ freq: 260, duty: 0.5, sustain: 0.15, decay: 0.15, slide: 0.18, phaser: 0.3, phaserRamp: 0.1 })],
               [0.04, fx({ freq: 520, duty: 0.75, sustain: 0.12, decay: 0.2, slide: 0.15, gain: 0.5 })]]),
  focus:  fx({ freq: 'A5', duty: 0.6, sustain: 0.1, decay: 0.18, arp: 0.35, arpSpeed: 0.55, vib: 0.15, vibSpeed: 0.6 }),
  twinkle: mix([[0, fx({ freq: 'E7', duty: 0.75, sustain: 0.02, decay: 0.12, arp: -0.25, arpSpeed: 0.7 })],
                [0.08, fx({ freq: 'B7', duty: 0.75, sustain: 0.02, decay: 0.18, gain: 0.7 })]]),
  charge: fx({ freq: 110, duty: 0.2, dutyRamp: 0.2, sustain: 0.45, decay: 0.15, slide: 0.12, vib: 0.3, vibSpeed: 0.7 }),
  rise:   fx({ freq: 300, duty: 0.5, sustain: 0.3, decay: 0.15, slide: 0.17, vib: 0.2, vibSpeed: 0.75 }),

  // ---- impacts ----
  hit:    mix([[0, fx({ wave: 'noise', freq: 1100, sustain: 0.02, decay: 0.08, slide: -0.3, punch: 0.5 })],
               [0, fx({ freq: 330, duty: 0.2, sustain: 0.01, decay: 0.08, slide: -0.45, gain: 0.6 })]]),
  hitBig: mix([[0, fx({ wave: 'noise', freq: 500, sustain: 0.06, decay: 0.25, slide: -0.15, punch: 0.6 })],
               [0, fx({ freq: 180, duty: 0, sustain: 0.03, decay: 0.18, slide: -0.4, gain: 0.7 })]]),
  stomp:  mix([[0, fx({ wave: 'noise', freq: 220, sustain: 0.03, decay: 0.14, slide: -0.2, lpf: 0.5, punch: 0.6 })],
               [0, fx({ freq: 90, duty: 0, sustain: 0.03, decay: 0.12, slide: -0.3, gain: 0.7 })]]),
  crush:  fx({ wave: 'noise', freq: 420, sustain: 0.06, decay: 0.2, slide: -0.1, repeat: 0.5, punch: 0.5, lpf: 0.7 }),
  hurt:   mix([[0, fx({ freq: 500, duty: 0, sustain: 0.02, decay: 0.15, slide: -0.4, vib: 0.4, vibSpeed: 0.7 })],
               [0, fx({ wave: 'noise', freq: 700, sustain: 0.02, decay: 0.08, lpf: 0.6, gain: 0.5 })]]),
  block:  mix([[0, fx({ freq: 'A6', duty: 0.75, sustain: 0.02, decay: 0.15, punch: 0.6, arp: -0.4, arpSpeed: 0.8 })],
               [0, fx({ wave: 'noise', freq: 4000, sustain: 0.01, decay: 0.05, hpf: 0.4, gain: 0.5 })]]),
  boom:   mix([[0, fx({ wave: 'noise', freq: 260, sustain: 0.25, decay: 0.75, slide: -0.06, punch: 0.7, repeat: 0 })],
               [0, fx({ freq: 110, duty: 0, sustain: 0.08, decay: 0.4, slide: -0.25, gain: 0.7 })]]),
  fall:   mix([[0, fx({ freq: 1500, duty: 0.5, sustain: 0.45, decay: 0.2, slide: -0.1, vib: 0.15, vibSpeed: 0.7, gain: 0.5 })],
               [0, fx({ wave: 'noise', freq: 300, attack: 0.25, sustain: 0.3, decay: 0.1, slide: 0.08, lpf: 0.6 })]]),

  // ---- enemies ----
  enemyWind: fx({ wave: 'noise', freq: 250, attack: 0.08, sustain: 0.06, decay: 0.08, slide: 0.25, lpf: 0.55, gain: 0.7 }),
  roar:   mix([[0, fx({ wave: 'noise', freq: 180, attack: 0.05, sustain: 0.45, decay: 0.3, slide: -0.03, vib: 0.5, vibSpeed: 0.55, punch: 0.3 })],
               [0, fx({ wave: 'saw', freq: 90, attack: 0.05, sustain: 0.4, decay: 0.3, slide: -0.04, vib: 0.4, vibSpeed: 0.5, gain: 0.55 })]]),
  hex:    fx({ freq: 600, duty: 0.3, sustain: 0.15, decay: 0.15, slide: -0.15, vib: 0.5, vibSpeed: 0.55, phaser: 0.3 }),
  defeat: mix([[0, fx({ freq: 700, duty: 0.4, sustain: 0.05, decay: 0.2, slide: -0.3, repeat: 0.6 })],
               [0, fx({ wave: 'noise', freq: 1500, sustain: 0.04, decay: 0.25, slide: -0.2, gain: 0.6 })]])
};

// How loud each sound plays in the game (target RMS level; the builder works out the gain).
const LEVEL = { click: 0.05, vote: 0.08, coin: 0.12, correct: 0.15, wrong: 0.12, banner: 0.16, open: 0.15,
  victory: 0.17, lose: 0.15, twinkle: 0.07, focus: 0.1, heal: 0.13, shield: 0.12, ice: 0.11, poison: 0.1,
  charge: 0.1, rise: 0.09, hex: 0.1, cast: 0.12, enemyWind: 0.1, hit: 0.2, hitBig: 0.24, boom: 0.28,
  roar: 0.22, stomp: 0.2, crush: 0.18, defeat: 0.15, fall: 0.15 };
const DEFAULT_LEVEL = 0.16;

// ---------- render ----------
function render(sound) {
  const parts = sound.parts.map(q => ({ ...q, data: new SoundEffect(q.p).getRawBuffer().normalized }));
  const len = Math.max(...parts.map(q => Math.round(q.at * 44100) + q.data.length));
  const buf = new Float32Array(len);
  for (const q of parts) {
    const o = Math.round(q.at * 44100);
    for (let i = 0; i < q.data.length; i++) buf[o + i] += q.data[i] * q.gain;
  }
  // 44100 -> 22050 (average pairs), trim the silent tail, peak-normalise, short fade-out.
  const out = new Float32Array(Math.ceil(len / 2));
  for (let i = 0; i < out.length; i++) out[i] = ((buf[2 * i] || 0) + (buf[2 * i + 1] || 0)) / 2;
  let end = out.length; while (end > 1 && Math.abs(out[end - 1]) < 0.004) end--;
  const a = out.subarray(0, end);
  let peak = 0; for (const v of a) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.9 / peak : 1, fade = Math.min(a.length, 220);
  for (let i = 0; i < a.length; i++) a[i] *= k * (i > a.length - fade ? (a.length - i) / fade : 1);
  return a;
}
function wav8(a) {                // unsigned 8-bit PCM, mono
  const b = Buffer.alloc(44 + a.length);
  b.write('RIFF', 0); b.writeUInt32LE(36 + a.length, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(a.length, 40);
  for (let i = 0; i < a.length; i++) b[44 + i] = Math.max(0, Math.min(255, Math.round(a[i] * 127 + 128)));
  return b;
}

fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
let total = 0;
const manPath = path.join(OUT, 'manifest.json');
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(manPath, 'utf8')); } catch (e) {}
for (const [name, sound] of Object.entries(SOUNDS)) {
  if (only.length && !only.includes(name)) continue;
  const a = render(sound), file = wav8(a);
  fs.writeFileSync(path.join(OUT, name + '.wav'), file);
  total += file.length;
  let rms = 0; for (const v of a) rms += v * v; rms = Math.sqrt(rms / a.length);
  manifest[name] = +Math.min(1, (LEVEL[name] || DEFAULT_LEVEL) / rms).toFixed(3);
  console.log(`${name.padEnd(10)} ${(a.length / RATE).toFixed(2)} s  ${(file.length / 1024).toFixed(1)} KB`);
}
console.log(`total ${(total / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), OUT)}`);
// manifest.json: { name: gain } for every built sound (audio.js loads this list).
for (const k of Object.keys(manifest)) if (!SOUNDS[k]) delete manifest[k];
fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1) + '\n');
module.exports = { SOUNDS, fx, mix, tune };

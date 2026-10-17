// Battle scene renderer: pixel layer at native resolution, modern lighting on top.
import * as SP from './sprites.js';
import { paintDungeon, fogTexture, THEMES } from './dungeon.js';
import { Sprite, Mask } from './pixel.js';
import { sfx } from './audio.js';

const C = window.MF_Content;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;
const now = () => performance.now();

const STATUS_COL = { burn: '#ff8a3c', poison: '#8fe05a', weak: '#c7a2ff', vuln: '#ff6b8a', chill: '#8fe3ff', freeze: '#dff8ff', str: '#ff9a7a', taunt: '#ffd36b',
  mark: '#ff6b6b', stun: '#ffe08a', regen: '#9dffb0', steady: '#c8d4e8', thorns: '#ffe08a', frost: '#a8f0ff', unbreak: '#ffd36b', divine: '#fff6c8', surge: '#9fd8ff' };
// short labels for the status chips under health bars
const STATUS_SHORT = { burn: 'B', poison: 'P', str: 'S', mark: 'Mk', regen: '+', thorns: 'Th', weak: 'We', vuln: 'Vu', chill: 'Ch', freeze: 'Fr', taunt: 'Ta', stun: 'St', steady: 'Ir', frost: 'Fa', unbreak: 'Ub', divine: 'Dv', surge: 'Su' };
// colour of the glow and numbers for each support effect
const SUP_COL = { heal: '#9dffb0', heal_party: '#9dffb0', revive: '#9dffb0', revive_party: '#ffe27a', bless_party: '#ffe9a0', aegis: '#ffe9a0', buff_party: '#ff9a7a', empower: '#ff9a7a', rally_party: '#ffc08a',
  taunt: '#ffd36b', counter: '#ffe08a', unbreakable: '#ffd36b', surge: '#9fd8ff', shield_ice: '#a8f0ff', smoke: '#c8c4d8', ward: '#ffe9a0', divine: '#fff6c8', shield_self: '#c8d4e8' };
const SUPPORT = ['defend', 'shield_party', ...Object.keys(SUP_COL)];
// Champion's Combo cross-slash impacts: the blades' directions (degrees) for the 1st, 2nd and 3rd slash
const CROSS_ANGLES = [[38, -58], [-36, 62], [-4, 52, -72]];
// which projectile a skill's effect fires
// how dark the background goes while a legendary skill plays (it used to dim everything by 0.42; now only the
// background, twice as strongly)
const DARK_A = 0.84;
const projKind = fx => ({ mark: 'proj_arrow', multishot: 'proj_arrow', ricochet: 'proj_arrow', missiles: 'proj_arcane' }[fx] || fx);
// the Minotaur's Ground Slam: PixelLab earth spikes that burst out of the floor (public/art/fx)
const SPIKES = [0, 1, 2].map(i => { const im = new Image(); im.src = '/art/fx/earth_spike_' + i + '.png'; return im; });
// PixelLab effect sprite sheets (public/art/fx, made with create_vfx): the alternative pixel-art look for the Meteor's rock
// and explosion and Earthshatter's flaming blade and fire columns. On by default; ?vfx=code shows the older code-drawn shapes instead.
const FX_SHEET = (src, w, h, cols, n, fps, ax, ay, loop) => { const img = new Image(); img.src = '/art/fx/' + src; return { img, w, h, cols, n, fps, ax, ay, loop }; };
const PFX = {
  rock: FX_SHEET('meteor_fly.png', 160, 160, 3, 8, 12, 80, 80, true),
  boom: FX_SHEET('meteor_impact.png', 192, 160, 4, 12, 14, 96, 142, false),
  geyser: FX_SHEET('fire_column.png', 40, 100, 4, 10, 12, 20, 96, false),
  blade: FX_SHEET('flame_blade.png', 58, 156, 4, 8, 12, 16, 52, true)   // anchored on the sword tip (made round the knight's hold frame)
};
const PIXEL_FX = (() => { try { return new URLSearchParams(location.search).get('vfx') !== 'code'; } catch (e) { return true; } })();
const STATUS_ABBR = { burn: 'Burn', poison: 'Poison', weak: 'Weak', vuln: 'Vulnerable', chill: 'Chilled', freeze: 'Frozen', str: 'Strength', taunt: 'Taunt',
  mark: 'Marked', stun: 'Stunned', regen: 'Mending', steady: 'Iron Skin', thorns: 'Riposte', frost: 'Frost Armour', unbreak: 'Unbreakable', divine: 'Shielded', surge: 'Mana Surge' };

export class BattleScene {
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.nat = document.createElement('canvas');
    this.nctx = this.nat.getContext('2d');
    this.actors = new Map();
    this.particles = [];
    this.glows = [];
    this.numbers = [];
    this.projectiles = [];
    this.arcs = [];
    this.queue = [];
    this.playing = false;
    this.mode = 'battle';
    this.theme = 'halls';
    this.myId = opts.myId || null;
    this.onBanner = opts.onBanner || (() => {});
    this.onAnimDone = opts.onAnimDone || (() => {});
    this.onAfter = opts.onAfter || (() => {});
    this.shake = 0; this.shakeT = 0;
    this.trails = []; this.cam = null; this.stars = []; this.rings = []; this.ribbons = []; this.auras = [];
    this.zaps = []; this.ripples = []; this.residue = []; this.xhits = []; this.slivers = []; this.bigArcs = [];   // Champion's Combo: blade aura, ground ripples, leftover crackle
    this.pixelFx = PIXEL_FX;
    this.mets = [];   // Meteor: hand flame, spark, the rock, its explosion and the fire it leaves
    this.cracks = []; this.spikes = []; this.ghosts = [];
    this.slowmo = 1;   // <1 plays everything in slow motion (used by the /dev/lab.html animation lab)
    this.freezeUntil = 0;
    this.flash = 0;
    this.target = null; this.allyTarget = null;
    this.room = null;
    this.props = [];
    this.fog = fogTexture();
    this.t0 = now();
    this.stage = { x: 0, y: 0, w: 1, h: 1 };
    this.lowPower = false;
    this._raf = this._raf.bind(this);
    this.frameTimes = [];
    requestAnimationFrame(this._raf);
  }

  // ------------------------------------------------------------ layout
  resize(cssW, cssH, stageCss) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.25 : 2);
    const Wd = Math.max(1, Math.round(cssW * dpr)), Hd = Math.max(1, Math.round(cssH * dpr));
    const s = Math.max(1, Math.floor(Math.min(Hd / 206, Wd / 340)));
    this.dpr = dpr; this.s = s;
    this.W = Math.ceil(Wd / s); this.H = Math.ceil(Hd / s);
    this.cv.width = Wd; this.cv.height = Hd;
    this.cv.style.width = cssW + 'px'; this.cv.style.height = cssH + 'px';
    this.nat.width = this.W; this.nat.height = this.H;
    this.cssW = cssW; this.cssH = cssH;
    const st = stageCss || { x: 0, y: 0, w: cssW, h: cssH };
    this.stage = { x: st.x * dpr / s, y: st.y * dpr / s, w: st.w * dpr / s, h: st.h * dpr / s };
    this.paint();
    this.layout();
  }
  // where the fighters are on screen (CSS px): top of the tallest head to the lowest feet
  actorBounds() {
    let top = 1e9, bottom = -1e9;
    for (const a of this.actors.values()) {
      if (a.gone) continue;
      const h = a.type === 'hero' ? 56 : ({ s: 40, m: 60, l: 90, xl: 128 })[a.size] || 50;
      top = Math.min(top, a.y - h); bottom = Math.max(bottom, a.y + 14);
    }
    if (bottom < 0) return null;
    const k = this.s / this.dpr;
    return { top: top * k, bottom: bottom * k };
  }
  // Victory: every hero plays their PixelLab victory animation once (a little staggered), then holds the final pose.
  set victory(on) {
    if (!!on === !!this._victory) return;
    this._victory = !!on;
    clearTimeout(this._vicT);
    if (on) this._startVictory(Date.now()); else { this._victoryPoses(false); if (this.cam && this.cam.hold) this.cam = null; }
  }
  _startVictory(since) {   // wait for the last blow to finish (at most 3.5 s) before the heroes celebrate
    if (!this._victory) return;
    if (this.busyCount > 0 && Date.now() - since < 3500) { this._vicT = setTimeout(() => this._startVictory(since), 150); return; }
    this._victoryPoses(true);
  }
  _victoryPoses(on) {
    const heroes = [...this.actors.values()].filter(a => a.type === 'hero').sort((a, b) => a.order - b.order);
    heroes.forEach((A, i) => {
      if (A.anim && A.anim.d && A.anim.d.loop) A.anim = null;
      const an = on && !A.downed && SP.heroAnim(A.skin || A.cls, 'victory');
      if (!an) return;
      const at = []; let acc = 0; for (const [, ms] of an.timeline) { at.push(acc); acc += ms; }
      A.anim = { d: an, t0: now() + 250 + i * 180, speed: 1, at, total: acc };
    });
    if (on) this.victoryAt = now();
  }
  get victory() { return !!this._victory; }
  // phones: zoom in on the party while they celebrate (the rewards appear when it eases back out)
  // (z = zoom, tx/ty = where on screen the party's centre is placed, as fractions of the screen). It holds until
  // the victory ends; calling it again eases from the current framing to the new one.
  focusHeroes(z, tx, ty) {
    const hs = [...this.actors.values()].filter(a => a.type === 'hero');
    if (!hs.length) return;
    const cx = hs.reduce((s, a) => s + a.x, 0) / hs.length, cy = hs.reduce((s, a) => s + a.y, 0) / hs.length;
    const c = this.cam && this.cam.hold ? this.cam : null, t = now();
    const cur = c ? this._camNow(c, t) : null;
    this.cam = { x: cx, y: cy - 20, t0: c ? c.t0 : t, dur: 1e9, z, tx, ty, hold: true, vig: 0.35,
      tr: c ? t : 0, z0: cur ? cur.z : 1, tx0: cur ? cur.tx : tx, ty0: cur ? cur.ty : ty };
  }
  _camNow(c, t) {
    if (!c.tr) return { z: c.z, tx: c.tx, ty: c.ty };
    const p = Math.min(1, (t - c.tr) / 450), e = p * p * (3 - 2 * p);
    return { z: c.z0 + (c.z - c.z0) * e, tx: c.tx0 + (c.tx - c.tx0) * e, ty: c.ty0 + (c.ty - c.ty0) * e };
  }
  setTheme(theme) { if (theme !== this.theme) { this.theme = theme; this.paint(); } }
  paint() {
    if (!this.W) return;
    const stageBottom = this.stage.y + this.stage.h;
    const frac = Math.max(0.3, Math.min(0.44, (stageBottom - 82) / this.H));
    const key = [this.W, this.H, this.s, this.cv.width, this.cv.height, this.theme, frac.toFixed(3)].join(':');
    if (key === this._paintKey) return;
    this._paintKey = key;
    const d = paintDungeon(this.W, this.H, this.theme, 11, frac);
    this.bgNative = d.bg; this.fgNative = d.fg;
    this.lights = d.lights; this.torches = d.torches; this.crystals = d.crystals; this.floorTop = d.floorTop;
    // upscale caches at display resolution
    const up = (src, blur) => {
      const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(src, 0, 0, this.W * this.s, this.H * this.s);
      return c;
    };
    this.bgUp = up(this.bgNative); this.fgUp = up(this.fgNative);
    // depth of field: soften the back wall slightly (HD-2D look)
    try {
      const b = document.createElement('canvas'); b.width = this.cv.width; b.height = this.cv.height;
      const bx = b.getContext('2d');
      bx.filter = `blur(${Math.max(1, this.s * 0.55)}px)`;
      bx.drawImage(this.bgUp, 0, 0);
      bx.filter = 'none';
      const wallH = this.floorTop * this.s;
      const g = bx.createLinearGradient(0, wallH * 0.6, 0, wallH + this.s * 4);
      // keep the floor crisp: copy it back on top
      bx.save(); bx.beginPath(); bx.rect(0, wallH * 0.92, b.width, b.height); bx.clip(); bx.drawImage(this.bgUp, 0, 0); bx.restore();
      if (bx.filter !== undefined) this.bgUp = b;
    } catch (e) { /* filters unsupported */ }
  }

  stagePoint(fx, fy) { return [this.stage.x + this.stage.w * fx, this.stage.y + this.stage.h * fy]; }

  layout() {
    if (!this.W) return;
    const ft = this.floorTop;
    const bottom = Math.min(this.H - 6, this.stage.y + this.stage.h - 4);
    const span = Math.max(30, bottom - ft - 14);
    const heroes = [...this.actors.values()].filter(a => a.type === 'hero');
    const enemies = [...this.actors.values()].filter(a => a.type === 'enemy' && !a.gone);
    const hx = this.stage.x + this.stage.w * 0.70;
    const k = clamp(span / 70, 0.7, 1.5);
    const FORM = {
      1: [[0, 0.55]], 2: [[8, 0.25], [-12, 0.78]], 3: [[10, 0.1], [-14, 0.5], [12, 0.92]],
      4: [[8, 0.04], [-16, 0.36], [16, 0.68], [-8, 1.0]], 5: [[8, 0.0], [-18, 0.25], [18, 0.5], [-12, 0.75], [10, 1.0]]
    };
    // a short, wide battle area (portrait phones): two rows side by side instead of one tall column, so heroes don't overlap
    const FLAT = { 1: [[0, 0.6]], 2: [[-14, 0.35], [24, 0.85]], 3: [[-18, 0.15], [26, 0.15], [4, 1.0]],
      4: [[-26, 0.05], [20, 0.05], [0, 1.0], [46, 1.0]], 5: [[-26, 0.05], [20, 0.05], [-30, 1.0], [8, 1.0], [46, 1.0]] };
    const HS = (span < 100 ? FLAT : FORM)[Math.min(5, Math.max(1, heroes.length))];
    heroes.sort((a, b) => a.order - b.order).forEach((a, i) => {
      const [dx, fy] = HS[i % HS.length];
      a.x = Math.round(hx + dx * k * 1.3); a.y = Math.round(ft + 14 + span * fy * 0.9);
    });
    const ex = this.stage.x + this.stage.w * 0.28;
    const boss = enemies.find(e => e.size === 'xl');
    const smalls = enemies.filter(e => e.size !== 'xl');
    if (boss) { boss.x = Math.round(ex - 4); boss.y = Math.round(ft + 14 + span * 0.78); }
    const ES = smalls.length === 1 ? [[0, 0.6]] : smalls.length === 2 ? [[22, 0.25], [-24, 0.85]] : [[30, 0.18], [-36, 0.48], [26, 0.98]];
    smalls.forEach((e, i) => {
      if (boss && e.kind === 'shard') { // crystals float above the boss's back
        e.x = Math.round(boss.x - 52 + i * 46); e.y = Math.round(boss.y - 70 - (i % 2) * 14);
        return;
      }
      if (boss) { // minions stand in front of the boss
        e.x = Math.round(boss.x + 64 + (i % 2) * 22); e.y = Math.round(boss.y - 26 + i * 30);
        return;
      }
      const [dx, fy] = ES[i % ES.length];
      e.x = Math.round(ex + dx * k * 1.15 + (e.size === 'l' ? -6 : 0)); e.y = Math.round(ft + 14 + span * fy * 0.9);
    });
    for (const a of this.actors.values()) { if (a.homeX == null || !a.busy) { a.homeX = a.x; a.homeY = a.y; } else { a.homeX = a.x; a.homeY = a.y; } }
    // room props
    this.props = [];
    if (this.room) {
      const pt = [this.stage.x + this.stage.w * 0.3, ft + 12 + span * 0.55];
      if (this.room.type === 'rest') this.props.push({ kind: 'fire', x: pt[0], y: pt[1] });
      if (this.room.type === 'merchant') this.props.push({ kind: 'merchant', x: pt[0], y: pt[1] });
      if (this.room.type === 'event') this.props.push({ kind: 'shrine', x: pt[0], y: pt[1] });
      if (this.room.type === 'treasure' && this.room.chests) {
        const ids = Object.keys(this.room.chests);
        ids.forEach((id, i) => {
          const ch = this.room.chests[id];
          const n = ids.length;
          const cx = this.stage.x + this.stage.w * (0.14 + 0.32 * (n === 1 ? 0.5 : i / (n - 1)));
          const cy = ft + 14 + span * (0.3 + 0.5 * ((i % 2) ? 0.8 : 0.2));
          this.props.push({ kind: 'chest', id, x: cx, y: cy, rarity: ch.rarity, opened: ch.opened, mine: id === this.myId, openT: this.chestOpenT && this.chestOpenT[id] });
        });
      }
    }
  }

  // ------------------------------------------------------------ state
  // hero list and enemy list come from the server snapshot (displayed values update at impact time)
  sync(run, opts = {}) {
    const seen = new Set();
    const heroes = run ? run.heroes : [];
    heroes.forEach((h, i) => {
      seen.add(h.id);
      let a = this.actors.get(h.id);
      if (!a) {
        a = { id: h.id, type: 'hero', order: i, name: h.name, cls: h.cls, variant: h.variant, x: 0, y: 0, ox: 0, oy: 0, pose: null, poseUntil: 0, flashUntil: 0, alpha: 1, phase: Math.random() * 1000 };
        this.actors.set(h.id, a); this.needLayout = true; a.fresh = true;
      }
      a.order = i; a.name = h.name; a.cls = h.cls; a.skin = h.skin || h.cls; a.variant = h.variant;
      a.connected = h.connected; a.acted = h.acted || h.ready; a.busy = h.busy; a.focus = h.focus;
      if (!this.playing || opts.force || a.fresh) { Object.assign(a, { hp: h.hp, maxHp: h.maxHp, block: h.block, st: h.st, downed: h.downed }); a.fresh = false; }
      else a.maxHp = h.maxHp;
    });
    const combat = run && run.combat;
    const enemies = combat ? combat.enemies : [];
    enemies.forEach(e => {
      seen.add(e.id);
      let a = this.actors.get(e.id);
      if (!a) {
        a = { id: e.id, type: 'enemy', kind: e.kind, size: e.size, tier: e.tier, name: e.name, x: 0, y: 0, ox: 0, oy: 0, pose: null, poseUntil: 0, flashUntil: 0, alpha: e.dead ? 0 : 1, phase: Math.random() * 1000, gone: e.dead };
        if (opts.spawnFx && !e.dead) { a.alpha = 0; a.spawnAt = now(); }
        this.actors.set(e.id, a); this.needLayout = true; a.fresh = true;
      }
      a.intent = e.intent;
      if (!this.playing || opts.force || a.fresh) {
        a.fresh = false;
        Object.assign(a, { hp: e.hp, maxHp: e.maxHp, block: e.block, st: e.st });
        if (e.dead && !a.gone && !a.dying) { a.gone = true; a.alpha = 0; this.needLayout = true; }
        if (!e.dead && a.gone) { a.gone = false; a.alpha = 1; this.needLayout = true; }
      }
    });
    for (const [id, a] of this.actors) if (!seen.has(id)) { this.actors.delete(id); this.needLayout = true; }
    if (this.needLayout) { this.needLayout = false; this.layout(); }
  }
  setRoom(room) {
    const prev = this.room;
    this.room = room;
    if (room && room.type === 'treasure' && prev && prev.type === 'treasure' && prev.chests) {
      this.chestOpenT = this.chestOpenT || {};
      for (const id of Object.keys(room.chests)) if (room.chests[id].opened && !(prev.chests[id] && prev.chests[id].opened)) this.chestOpenT[id] = now();
    }
    if (!room || room.type !== 'treasure') this.chestOpenT = {};
    this.layout();
  }

  // ------------------------------------------------------------ events
  play(events) {
    for (const ev of events) this.queue.push(ev);
    if (!this.playing) this._next();
  }
  get busyCount() { return this.queue.length + (this.playing ? 1 : 0); }
  // Hold back new animations briefly (while a student's question card closes) so they
  // see their own hero act instead of it playing behind the card.
  hold(ms) { this.holdUntil = Math.max(this.holdUntil || 0, now() + ms); }
  release() {
    this.holdUntil = 0;
    if (this._holdT) { clearTimeout(this._holdT); this._holdT = null; this._next(); }
  }
  _next() {
    if (this.queue.length && now() < (this.holdUntil || 0)) {
      this.playing = true;
      clearTimeout(this._holdT);
      this._holdT = setTimeout(() => { this._holdT = null; this._next(); }, this.holdUntil - now());
      return;
    }
    const ev = this.queue.shift();
    if (!ev) { this.playing = false; this.onAnimDone(); return; }
    this.playing = true;
    const speed = (this.queue.length > 4 ? 2.4 : this.queue.length > 1 ? 1.6 : 1) * (this.slowmo || 1);
    let dur = 0;
    try { dur = this._animate(ev, speed); } catch (e) { console.error(e); dur = 0; }
    setTimeout(() => this._next(), Math.max(0, dur));
  }
  pos(id) { const a = this.actors.get(id); return a ? { x: a.x + a.ox, y: a.y + a.oy, a } : null; }
  _applyAfter(ev, ids) {
    for (const [id, snap] of Object.entries(ev.after || {})) {
      if (ids && !ids.includes(id)) continue;
      const a = this.actors.get(id); if (!a) continue;
      const wasDown = a.downed;
      a.hp = snap.hp; a.maxHp = snap.maxHp; a.block = snap.block; a.st = snap.st;
      if ('downed' in snap) { a.downed = snap.downed; if (snap.downed && !wasDown) { this.pose(a, 'hurt', 300); } }
      if (snap.dead && !a.gone && !a.dying) this._die(a);
    }
    this.onAfter(ev);
  }
  pose(a, p, ms) { if (a.anim && p !== 'hurt') return; a.pose = p; a.poseUntil = now() + ms; }   // a hand-animated move owns the sprite while it plays
  _die(a) {
    a.dying = now();
    // pixel dissolve: sample the current frame
    try {
      const fr = this.frameFor(a);
      const x = fr.getContext('2d').getImageData(0, 0, fr.width, fr.height).data;
      const info = a.type === 'enemy' ? SP.enemyInfo(a.kind) : { ax: SP.ANCHOR_X, ay: SP.ANCHOR_Y };
      const step = a.size === 'xl' ? 2 : 1;
      let n = 0;
      for (let yy = 0; yy < fr.height; yy += step) for (let xx = 0; xx < fr.width; xx += step) {
        const k = (yy * fr.width + xx) * 4;
        if (x[k + 3] < 200 || Math.random() < 0.35) continue;
        if (n++ > 900) break;
        this.particles.push({ x: a.x - info.ax + xx, y: a.y - info.ay + yy, vx: (Math.random() - 0.5) * 18, vy: -10 - Math.random() * 28, g: -6, life: 0.7 + Math.random() * 0.8, t: 0, c: `rgb(${x[k]},${x[k + 1]},${x[k + 2]})`, fade: true });
      }
    } catch (e) { /* ignore */ }
    this.glows.push({ x: a.x, y: a.y - 14, r: 50, color: '#ffffff', t: 0, life: 0.5, a: 0.5 });
    sfx('defeat');
    setTimeout(() => { a.gone = true; a.dying = 0; this.layout(); }, 650);
  }

  // Returns duration in ms before the next event may start.
  _animate(ev, sp) {
    const T = ms => ms / sp;
    if (ev.kind === 'system') { this.onBanner(ev.text, ev.battle ? 'battle' : 'info'); return T(ev.battle ? 900 : 300); }
    if (ev.kind === 'round') { this.onBanner('Round ' + ev.round, 'round'); return T(450); }
    if (ev.kind === 'focus') {
      const p = this.pos(ev.actor); if (p) { this.burst(p.x, p.y - 26, '#9fb6ff', 14, 22); this.glows.push({ x: p.x, y: p.y - 22, r: 30, color: '#8fa6ff', t: 0, life: 0.5, a: 0.6 }); this.number(p.x, p.y - 40, 'Focus ' + '✦'.repeat(ev.focus), '#b8c8ff', 0.8); sfx('focus'); }
      if (p && ev.energy != null) { const a = this.actors.get(ev.actor); if (a) a.energy = ev.energy; }
      return 0;
    }
    if (ev.kind === 'energy') {   // Chalk Pouch / Infinity Pencil
      const p = this.pos(ev.actor); if (p) this.number(p.x + 6, p.y - 62, '+' + ev.n + ' energy', '#ffd84a', 0.75);
      const a = this.actors.get(ev.actor); if (a && ev.energy != null) a.energy = ev.energy;
      return 0;
    }
    if (ev.kind === 'tick' && ev.fx === 'regen') {   // Prayer of Mending / Renewal
      const tg = ev.targets[0]; const p = this.pos(tg.id); if (!p) return 0;
      this.column(p.x, p.y, '#9dffb0'); sfx('heal');
      setTimeout(() => { if (tg.heal) this.number(p.x, p.y - 40, '+' + tg.heal, '#8dff9e', 1); this._applyAfter(ev); }, T(200));
      return T(ev.dur || 500);
    }
    if (ev.kind === 'tick') {
      const tg = ev.targets[0]; const p = this.pos(tg.id); if (!p) return 0;
      const colr = ev.fx === 'burn' ? '#ff8a3c' : '#8fe05a';
      this.burst(p.x, p.y - 14, colr, 18, 16, ev.fx === 'burn' ? -30 : -12);
      this.glows.push({ x: p.x, y: p.y - 14, r: 34, color: colr, t: 0, life: 0.4, a: 0.5 });
      setTimeout(() => { this.number(p.x, p.y - 34, tg.dmg, colr, 1); this.flashActor(p.a); if (tg.dmg > 0) this.hitShake(p.a, 2); this._applyAfter(ev); }, T(220));
      sfx(ev.fx === 'burn' ? 'burn' : 'poison');
      return T(ev.dur || 500);
    }
    if (ev.kind === 'qte') {
      const E = this.actors.get(ev.actor);
      this.onBanner('Quick time! ' + (ev.total > 1 ? ev.total + ' strikes incoming' : ev.name), 'warn');
      if (E) { this.pose(E, 'windup', 1600); this.glows.push({ x: E.x, y: E.y - 30, r: 90, color: '#ff4a2a', t: 0, life: 1.4, a: 0.6 }); }
      this.shake = 3; this.shakeT = now(); sfx('charge');
      return T(300);
    }
    if (ev.kind === 'qteResult') {
      for (const [id, ok] of Object.entries(ev.results || {})) {
        const p = this.pos(id); if (!p || (p.a && p.a.downed)) continue;
        this.number(p.x, p.y - 58, ok ? 'Ready!' : 'Too slow', ok ? '#9fffe0' : '#ff9a8a', 0.8);
      }
      return 0;
    }
    if (ev.kind === 'raidhit') {
      const boss = [...this.actors.values()].find(a => a.type === 'enemy' && a.size === 'xl' && !a.gone);
      if (boss) {
        const jx = (Math.random() - 0.5) * 50, jy = -30 - Math.random() * 40;
        this.arc(boss.x + jx, boss.y + jy, 12, ev.color || '#fff');
        this.number(boss.x + jx, boss.y + jy - 8, '-' + ev.dmg, ev.color || '#ddd', 0.7);
        if (!boss.hshake || now() - boss.hshake.t0 > 260) boss.hshake = { t0: now(), amp: 1.5 };
      }
      return 0;
    }
    if (ev.kind === 'hero' && ev.whiff) return this._whiffAnim(ev, T);
    if (ev.kind === 'hero') {   // legendary skills: the background darkens for the whole move
      const d = this._heroAnim(ev, T);
      if (ev.rarity === 'legendary') this.darkFor(d);
      return d;
    }
    if (ev.kind === 'enemy') return this._enemyAnim(ev, T);
    this._applyAfter(ev);
    return 0;
  }

  // Which hand-animated move (if any) plays before a support skill, defend or big spell.
  // Each class has a defend plus one "big move" every party/area skill maps onto.
  _preAnimName(A, fx) {
    const has = n => SP.heroAnim(A.skin || A.cls, n);
    // cleric: reading the book + staff glow + circular swing for guard, heals and blessings
    if (A.cls === 'cleric' && ['defend', 'heal', 'heal_party', 'revive', 'bless_party', 'ward', 'empower', 'revive_party'].includes(fx) && has('chant')) return 'chant';
    if (fx === 'defend' || fx === 'shield_self' || fx === 'shield_ice') return 'defend';
    const big = { knight: 'rally', mage: 'channel', ranger: 'volley', cleric: 'pray' }[A.cls];
    if (SUPPORT.includes(fx)) return A.cls === 'ranger' ? null : big;
    if (['volley', 'starfall', 'meteor', 'nova_ice', 'venom', 'lightning', 'flamewave', 'arrowrain', 'phantom', 'missiles', 'timestop', 'radiance', 'quake', 'pillar', 'dragon'].includes(fx)) return big;
    return null;
  }
  _heroAnim(ev, T) {
    const A = this.actors.get(ev.actor); if (!A) { this._applyAfter(ev); return 0; }
    const fx = ev.fx || 'slash';
    if (fx === 'meteor') { const own = SP.heroAnim(A.skin || A.cls, 'meteor'); if (own && own.meteor) return this._meteorAnim(A, ev, T, own); }
    if (fx === 'quake') { const own = SP.heroAnim(A.skin || A.cls, 'quake'); if (own && own.quake) return this._quakeAnim(A, ev, T, own); }
    if (!ev._pre) {
      const nm = this._preAnimName(A, fx), pre = nm && SP.heroAnim(A.skin || A.cls, nm);
      if (pre) {   // play the move, then run the usual effects from its hit frame
        ev._pre = true;
        const at = []; let acc = 0; for (const [, ms] of pre.timeline) { at.push(acc); acc += ms; }
        A.anim = { d: pre, t0: now(), speed: T(1000) / 1000, at, total: acc };
        setTimeout(() => { A.anim = null; }, T(acc + 60));
        this._moveFx(A, pre, at, T, fx);
        if (nm !== 'defend') this.cam = { x: A.x - 30, y: A.y - 36, t0: now(), dur: T(acc + 400), z: pre.zoom || 1.06 };
        const hitAt = at[pre.hit] != null ? at[pre.hit] : acc * 0.6;
        if (nm === 'rally') sfx('roar');
        setTimeout(() => this._heroAnim(ev, T), T(hitAt));
        return T(Math.max(acc, hitAt + 1100) + 150);
      }
    }
    // enemy records: hits, and status-only ones (Hunter's Mark, Venom Storm)
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const enemyIds = [...new Set(tgt.map(t => t.id))];
    const first = tgt[0] && this.actors.get(tgt[0].id);
    const melee = ['slash', 'smite', 'slash_heavy', 'slash_wide', 'shadow', 'whirl'].includes(fx);
    const support = SUPPORT.includes(fx);
    if (ev.name && ev.act !== 'attack' && ev.act !== 'defend') this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    if (ev.energy > 0) setTimeout(() => this.number(A.x + 6, A.y - 62, '+' + ev.energy + ' energy', '#ffd84a', 0.75), T(450));
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';

    if (support) {
      this.pose(A, ['defend', 'taunt', 'counter', 'unbreakable', 'shield_self', 'shield_ice'].includes(fx) ? 'defend' : 'cast0', T(650));
      sfx(fx.includes('heal') || fx.includes('revive') || fx === 'bless_party' ? 'heal' : fx === 'surge' ? 'cast' : 'shield');
      const colr = SUP_COL[fx] || '#7fc8ff';
      this.glows.push({ x: A.x, y: A.y - 20, r: 40, color: colr, t: 0, life: 0.6, a: 0.6 });
      if (fx === 'surge') { this.rune(A.x, A.y, colr); this.ring(A.x, A.y - 18, colr); }
      setTimeout(() => {
        for (const t of ev.targets) {
          const p = this.pos(t.id); if (!p) continue;
          if (fx === 'smoke') this.cloud(p.x, p.y - 14, '#c8c4d8');
          if (fx === 'divine') { this.glows.push({ x: p.x, y: p.y - 20, r: 34, color: '#fff6c8', t: 0, life: 0.9, a: 0.9, ring: true, grow: 8 }); this.burst(p.x, p.y - 24, '#fff6c8', 14, 30); }
          if (t.cleansed) this.number(p.x, p.y - 68, 'Cleansed', '#d8fff0', 0.8);
          if (t.heal || t.revived) { this.column(p.x, p.y, '#9dffb0'); this.number(p.x, p.y - 44, '+' + (t.heal || 0), '#8dff9e', 1.1); }
          if (t.block) { this.shield(p.x, p.y, colr); this.number(p.x + (t.heal ? 10 : 0), p.y - (t.heal ? 30 : 44), '+' + t.block + ' block', '#8fd0ff', 0.95); }
          if (t.status) for (const s of t.status) { this.number(p.x, p.y - 56, STATUS_ABBR[s] || s, STATUS_COL[s] || '#fff', 0.8); this.column(p.x, p.y, STATUS_COL[s] || '#fff'); }
          if (t.revived) { this.pose(p.a, 'victory', T(600)); this.glows.push({ x: p.x, y: p.y - 20, r: 60, color: '#ffe9a0', t: 0, life: 0.8, a: 0.8 }); }
        }
        this._applyAfter(ev);
      }, T(320));
      return T(ev.dur || 900);
    }

    // offence
    const home = { x: A.x, y: A.y };
    if (fx === 'combo' && first) return this._combo(A, ev, tgt, rc, T, home);
    if (['missiles', 'multishot', 'ricochet', 'phantom'].includes(fx) && first) return this._multiShot(A, ev, tgt, fx, rc, T);
    if (fx === 'quake') {   // Earthshatter: the floor cracks out from the knight, rock spikes burst up under every enemy
      this.shake = 6; this.shakeT = now(); this.flash = 0.2; sfx('stomp');
      const ens = enemyIds.map(id => this.actors.get(id)).filter(Boolean);
      for (const e of ens) this._crack(A.x - 12, A.y + 3, e.x + 6, e.y + 3, T(260), T(1300));
      setTimeout(() => { for (const e of ens) { this._spike(e.x, e.y + 1, 1.5, 420); this._spike(e.x - 10, e.y, 0.9, 380); this._spike(e.x + 9, e.y + 2, 0.8, 360); } this.impact(ev, tgt, fx, rc); }, T(320));
      return T(1150);
    }
    if (fx === 'pillar' && first) {   // Judgement / Wrath of Heaven: a column of light from the sky
      setTimeout(() => { for (const id of enemyIds) { const e = this.actors.get(id); if (e && !e.gone) { this.skyStrike(e); this.glows.push({ x: e.x, y: e.y - 40, r: 70, color: '#fff2a8', t: 0, life: 0.6, a: 0.8, tall: true }); } } }, T(120));
      setTimeout(() => this.impact(ev, tgt, fx, rc), T(300));
      return T(1050);
    }
    if (fx === 'dragon' && first) {   // Dragon's Wrath: a huge fireball from the mage's staff
      const hand = { x: A.x - 16, y: A.y - 30 };
      this.pose(A, 'cast1', T(500)); sfx('burn');
      this.projectile(hand, { x: first.x, y: first.y - 16 }, 'meteor', T(320));
      setTimeout(() => this.impact(ev, tgt, 'proj_fire', rc), T(330));
      return T(1100);
    }
    const bigMove = melee && first && fx !== 'whirl' && ((fx === 'slash_heavy' && SP.heroAnim(A.skin || A.cls, 'power')) || SP.heroAnim(A.skin || A.cls, ['slash_heavy', 'slash_wide', 'shadow'].includes(fx) ? 'slash' : fx));   // knight: slash, cleric: smite
    if (bigMove) return this._bigSlash(A, first, ev, tgt, fx, rc, bigMove, T, home);
    if (melee && first && fx !== 'whirl') {
      const dest = { x: first.x + (first.size === 'xl' ? 46 : first.size === 'l' ? 26 : 20), y: first.y + 2 };
      this.pose(A, 'windup', T(170));
      this.move(A, -3, 0, T(120));
      setTimeout(() => { this.move(A, dest.x - home.x, dest.y - home.y, T(150), true); }, T(150));
      setTimeout(() => { this.pose(A, 'swing1', T(80)); sfx(fx === 'slash_heavy' || fx === 'dragon' ? 'heavy' : 'slash'); }, T(300));
      setTimeout(() => {
        this.pose(A, 'swing2', T(260));
        this.impact(ev, tgt, fx, rc);
      }, T(380));
      setTimeout(() => { this.move(A, 0, 0, T(220), true); }, T(720));
      return T(Math.max(ev.dur || 1000, 980));
    }
    if (fx === 'whirl') {
      this.pose(A, 'windup', T(150)); sfx('whirl');
      const ens = enemyIds.map(id => this.actors.get(id)).filter(Boolean);
      const xs = ens.map(e => e.x);
      const minX = Math.min(...xs, home.x - 60);
      setTimeout(() => { this.pose(A, 'swing1', T(420)); this.move(A, minX - 10 - home.x, 0, T(420), true); }, T(150));
      ens.forEach((e, i) => setTimeout(() => this.arc(e.x, e.y - 18, 16, '#d0f0ff'), T(220 + i * 90)));
      setTimeout(() => this.impact(ev, tgt, fx, rc), T(420));
      setTimeout(() => { this.pose(A, 'swing2', T(200)); this.move(A, 0, 0, T(260), true); }, T(640));
      return T(1100);
    }
    // ranged & spells
    const shootAnim = first && ((['proj_arrow', 'proj_poison', 'proj_firearrow', 'mark'].includes(fx) && SP.heroAnim(A.skin || A.cls, 'shoot'))
      || ((fx === 'proj_arcane' || fx === 'proj_fire' || fx === 'proj_ice') && SP.heroAnim(A.skin || A.cls, 'cast')));
    if (shootAnim) return this._bigSlash(A, first, ev, tgt, fx, rc, shootAnim, T, home);
    const castPose = A.cls === 'ranger' && (fx === 'proj_arrow' || fx === 'proj_poison' || fx === 'volley') ? 'windup' : (ev.act === 'attack' ? 'swing1' : 'cast0');
    this.pose(A, castPose, T(420));
    const hand = { x: A.x - 14, y: A.y - 26 };
    const projColor = { proj_arcane: '#b8a6ff', proj_fire: '#ff8a3c', proj_ice: '#9fe8ff', proj_poison: '#9cff6b', proj_arrow: '#efe6d0', lightning: '#fff27a' }[fx] || rc;
    this.glows.push({ x: hand.x, y: hand.y, r: 26, color: projColor, t: 0, life: 0.5, a: 0.7 });
    this.rune(A.x, A.y, projColor);
    sfx(fx === 'proj_arrow' || fx === 'proj_poison' || fx === 'volley' ? 'bow' : fx === 'lightning' ? 'zap' : 'cast');
    if ((fx.startsWith('proj_') || fx === 'mark') && first) {
      setTimeout(() => { if (A.cls === 'ranger') this.pose(A, 'swing2', T(300)); else this.pose(A, 'cast1', T(300)); this.projectile(hand, { x: first.x, y: first.y - 16 }, projKind(fx), T(240)); }, T(200));
      setTimeout(() => this.impact(ev, tgt, fx, rc), T(450));
      return T(Math.max(ev.dur || 900, 900));
    }
    if (fx === 'lightning') {
      setTimeout(() => {
        this.pose(A, 'cast1', T(300));
        let from = hand;
        for (const t of tgt) { const e = this.actors.get(t.id); if (!e) continue; this.bolt(from, { x: e.x, y: e.y - 16 }); from = { x: e.x, y: e.y - 16 }; }
        this.flash = 0.35;
        this.impact(ev, tgt, fx, rc);
      }, T(260));
      return T(950);
    }
    if (['volley', 'starfall', 'meteor', 'nova_ice', 'venom', 'flamewave', 'arrowrain', 'timestop', 'radiance'].includes(fx)) {
      // area skills; multi-wave ones (Arrow Rain, Starfall) land one wave at a time
      const ens = enemyIds.map(id => this.actors.get(id)).filter(Boolean);
      const waves = Math.max(1, ...tgt.map(t => (t.wave || 0) + 1)), gap = 340;
      if (fx === 'timestop') { this.flash = 0.55; this.glows.push({ x: A.x - 60, y: A.y - 30, r: 30, grow: 200, color: '#cfe8ff', t: 0, life: 0.9, a: 0.8, ring: true }); sfx('ice'); }
      for (let w = 0; w < waves; w++) setTimeout(() => {
        this.pose(A, A.cls === 'ranger' ? 'swing2' : 'cast1', T(400));
        for (const e of ens) {
          if (fx === 'volley') for (let k = 0; k < 3; k++) this.projectile({ x: hand.x - 10 - k * 4, y: -10 }, { x: e.x + (k - 1) * 5, y: e.y - 10 }, 'proj_arrow', T(220 + k * 40));
          if (fx === 'arrowrain') for (let k = 0; k < 4; k++) this.projectile({ x: e.x + 14 - k * 7, y: -12 - k * 6 }, { x: e.x + (k - 1.5) * 5, y: e.y - 8 }, 'proj_arrow', T(200 + k * 35));
          if (fx === 'meteor') this.projectile({ x: e.x + 60, y: -20 }, { x: e.x, y: e.y - 10 }, 'meteor', T(300));
          if (fx === 'flamewave') this.projectile({ x: hand.x, y: hand.y + 10 }, { x: e.x, y: e.y - 8 }, 'proj_fire', T(260));
          if (fx === 'starfall') for (let k = 0; k < (waves > 1 ? 2 : 3); k++) this.projectile({ x: e.x + 30 - k * 10, y: -10 - k * 20 }, { x: e.x, y: e.y - 14 }, 'star', T(220 + k * 110));
          if (fx === 'nova_ice' || fx === 'timestop') this.ring(e.x, e.y - 12, fx === 'timestop' ? '#ffffff' : '#bff6ff');
          if (fx === 'venom') this.cloud(e.x, e.y - 12, '#9cff6b');
          if (fx === 'radiance') this.ring(e.x, e.y - 12, '#fff0a8');
        }
        if (fx === 'radiance') for (const t of ev.targets) if (t.heal) { const p = this.pos(t.id); if (p) this.column(p.x, p.y, '#fff0a8'); }
      }, T(220 + w * gap));
      const landAt = fx === 'starfall' ? 560 : 520;
      for (let w = 0; w < waves; w++) {
        const list = waves > 1 ? ev.targets.filter(t => (t.wave || 0) === w || (t.wave == null && w === waves - 1)) : null;
        setTimeout(() => this.impact(ev, tgt, fx, rc, list, w < waves - 1), T(landAt + w * gap));
      }
      return T((fx === 'starfall' ? 1200 : 1000) + (waves - 1) * gap);
    }
    // generic
    setTimeout(() => this.impact(ev, tgt, fx, rc), T(300));
    return T(900);
  }

  // Hand-animated special move (PixelLab frames): dash in, raise the sword, slash down.
  // The camera eases in on the hero and the screen edges darken while it plays.
  _bigSlash(A, first, ev, tgt, fx, rc, anim, T, home) {
    const tl = anim.timeline;
    const at = []; let acc = 0; for (const [, ms] of tl) { at.push(acc); acc += ms; }
    const total = acc;
    const speed = T(1000) / 1000;
    const cast = !!anim.cast;   // casters stay put (cleric smite); fighters dash in
    const dest = cast ? home : { x: first.x + (first.size === 'xl' ? 46 : first.size === 'l' ? 26 : 20) + (anim.dash || 0), y: first.y + 2 };
    A.anim = { d: anim, t0: now(), speed, at, total };
    if (!cast) {
      const d0 = anim.dashAt ? at[anim.dashAt] : 0;   // power strike: powers up in place first, then dashes
      const dashMs = at[Math.min(tl.length - 1, anim.dashFrames || 4)] - d0;
      setTimeout(() => { this.move(A, dest.x - home.x, dest.y - home.y, T(Math.max(120, dashMs)), true); sfx('whirl'); }, T(d0));
    } else if (anim.release == null) sfx('cast');
    this.cam = cast ? { x: (home.x * 0.6 + first.x * 0.4), y: home.y - 34, t0: now(), dur: T(total + 260), z: anim.zoom || 1.1 }
                    : { x: (dest.x + first.x) / 2 - 6, y: dest.y - 30, t0: now(), dur: T(total + 260), z: 1.14 };
    if (anim.strike != null) setTimeout(() => {
      for (const t of tgt) { const e = this.actors.get(t.id); if (e && !e.gone) this.skyStrike(e); }
    }, T(at[anim.strike]));
    let hitAt = at[anim.hit] != null ? at[anim.hit] : total * 0.75;
    if (anim.release != null) {   // archers: the arrow leaves the bow on the release frame and the hit lands when it arrives
      const [mx, my] = anim.muzzle || [-24, -26];
      const from = { x: home.x + mx, y: home.y + my }, to = { x: first.x, y: first.y - 16 };
      const fly = Math.max(140, Math.abs(to.x - from.x) * 1.1);
      hitAt = at[anim.release] + fly;
      let star = null;
      if (anim.charge != null) setTimeout(() => {   // a star of light gathers at the arrow tip while the ranger holds aim
        const kind = { proj_fire: 'fire', proj_ice: 'ice', proj_arcane: 'arcane' }[fx] || 'star';
        star = { kind, x: from.x, y: from.y, t0: now(), grow: T(at[anim.release] - at[anim.charge]),
          color: { fire: '#ff8a3c', ice: '#9fe8ff', arcane: '#a08aff' }[kind] || (fx === 'proj_poison' ? '#9cff6b' : '#ffe9a0') };
        this.stars.push(star); sfx(kind === 'star' ? 'twinkle' : kind === 'fire' ? 'burn' : 'cast');
      }, T(at[anim.charge]));
      setTimeout(() => { if (star) { star.done = true; this.burst(from.x, from.y, star.color, 14, 50, 0); this.glows.push({ x: from.x, y: from.y, r: 30, color: star.color, t: 0, life: 0.3, a: 0.9 }); } this.projectile(from, to, fx, T(fly)); sfx('bow'); this.glows.push({ x: from.x, y: from.y, r: 18, color: fx === 'proj_poison' ? '#9cff6b' : '#fff2c0', t: 0, life: 0.25, a: 0.8 }); }, T(at[anim.release]));
    }
    if (anim.aura) {   // powering up: a flame aura that grows until the dash
      const [f0, f1] = anim.aura;
      setTimeout(() => { this.auras.push({ follow: A, t0: performance.now(), until: performance.now() + T(at[f1] - at[f0]) }); sfx('burn'); }, T(at[f0]));
    }
    if (anim.upswing != null) setTimeout(() => {   // rising slash: orange crescent sweeping up, fire sparks thrown up and out
      this.trails.push({ x: A.x + A.ox - 10, y: A.y + A.oy - 26, r: 40, t0: now(), life: T(520), up: true, color: 'fire' });
      const p = { x: A.x + A.ox - 34, y: A.y + A.oy - 20 };
      for (let i = 0; i < 34; i++) { const a = -Math.PI * (0.15 + Math.random() * 0.75), v = 80 + Math.random() * 120; this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v - 30, vy: Math.sin(a) * v, g: 140, life: 0.6 + Math.random() * 0.5, t: 0, c: ['#ff6a2a', '#ffb347', '#ffd25a', '#fff6c8'][i % 4], streak: 3 + (i % 3), drag: 0.9 }); }
      this.glows.push({ x: p.x, y: p.y, r: 60, color: '#ff7a2a', t: 0, life: 0.45, a: 1 });
      sfx('heavy');
    }, T(at[anim.upswing]));
    if (anim.trail != null) setTimeout(() => {
      this.trails.push({ x: A.x + A.ox - 4, y: A.y + A.oy - 32, r: 38, t0: now(), life: T(460) });
      sfx(fx === 'slash_heavy' || fx === 'dragon' ? 'heavy' : 'slash');
    }, T(at[anim.trail]));
    setTimeout(() => { this.impact(ev, tgt, fx, rc); this.shake = Math.max(this.shake, 4); this.shakeT = now(); }, T(hitAt));
    setTimeout(() => { A.anim = null; if (!cast) this.move(A, 0, 0, T(240), true); }, T(total + 60));
    return T(Math.max(ev.dur || 1000, Math.max(total, hitAt) + 320));
  }
  // where the staff / arrow tip is right now (from the per-frame 'tips' the builder measured)
  _tipAt(a) {
    const m = a.anim; if (!m || !m.d.tips) return null;
    const el = (now() - m.t0) / m.speed;
    let i = 0; while (i + 1 < m.at.length && el >= m.at[i + 1]) i++;
    const tp = m.d.tips[m.d.timeline[i][0]]; if (!tp) return null;
    return { x: a.x + a.ox + tp[0], y: a.y + a.oy + tp[1] };
  }
  // charge-ups that follow the tip: a growing orb or star, a shrinking ring, and a light trail while it swings
  _moveFx(A, anim, at, T, fx) {
    const col = { defend: '#7fc8ff', heal: '#ffe27a', heal_party: '#ffe27a', revive: '#ffe27a', bless_party: '#fff0b8', volley: '#ffe9a0' }[fx] || '#ffe27a';
    if (anim.charge != null && anim.tips) {
      const end = anim.chargeTo != null ? anim.chargeTo : anim.hit;
      const grow = T(at[end] - at[anim.charge]);
      let st = null;
      setTimeout(() => {
        st = { kind: anim.ring ? 'star' : 'orb', follow: A, x: A.x, y: A.y, t0: now(), grow, color: col };
        this.stars.push(st); sfx(anim.ring ? 'twinkle' : 'cast');
        if (anim.ring) this.rings.push({ follow: A, t0: now(), dur: grow, color: '#ffe27a' });
      }, T(at[anim.charge]));
      setTimeout(() => {
        if (!st) return; st.done = true;
        this.burst(st.x, st.y, col, 18, 50, 0); this.glows.push({ x: st.x, y: st.y, r: 34, color: col, t: 0, life: 0.35, a: 0.9 });
        if (anim.ring) { this.projectile({ x: st.x, y: st.y }, { x: st.x - 30, y: -40 }, 'proj_arrow', T(240)); sfx('bow'); }   // the volley's arrow shoots up out of sight
      }, T(at[end]));
    }
    if (anim.swing && anim.tips) {
      const [a0, a1] = anim.swing;
      setTimeout(() => this.ribbons.push({ follow: A, pts: [], color: col, until: now() + T(at[Math.min(a1 + 1, at.length - 1)] - at[a0]) + T(80) }), T(at[a0]));
    }
  }
  _animAt(a, t) {
    const m = a.anim; if (!m) return null;
    const el = (t - m.t0) / m.speed;
    if (el < 0) return null;
    let f;
    if (el >= m.total && m.d.loop) {   // held pose (victory): cycle the loop frames for as long as the anim stays set
      const L = m.d.loop, tot = L.reduce((s, x) => s + x[1], 0);
      let r = (el - m.total) % tot, i = 0; while (r >= L[i][1]) { r -= L[i][1]; i++; }
      f = L[i][0];
    } else {
      if (el >= m.total + 60) return null;
      let i = 0; while (i + 1 < m.at.length && el >= m.at[i + 1]) i++;
      f = m.d.timeline[i][0];
    }
    const v = (a.variant || 0) % m.d.frames.length;
    return { fr: m.d.frames[v][f], wh: m.d.whites[v][f], ax: m.d.ax, ay: m.d.ay };
  }
  // Shows the hits and heals of a hero action. list: just these records (one arrow of a volley, one wave of
  // Arrow Rain); hold: don't apply the after-state yet because more hits are still on their way.
  impact(ev, tgt, fx, rc, list, hold) {
    let big = false;
    const seen = {};
    for (const t of list || ev.targets) {
      const p = this.pos(t.id); if (!p) continue;
      const k = seen[t.id] = (seen[t.id] || 0) + 1, dy = (k - 1) * 11;   // repeat hits on one target stack upwards
      if (t.dmg != null && !t.shatter) {
        const colr = { slash_heavy: '#ff9a3c', slash_wide: '#ffd0a0', proj_fire: '#ff8a3c', proj_firearrow: '#ff8a3c', flamewave: '#ff8a3c', proj_arcane: '#b8a6ff', missiles: '#b8a6ff', meteor: '#ff6a3d', proj_ice: '#bff6ff', nova_ice: '#bff6ff', timestop: '#cfe8ff', proj_poison: '#9cff6b', venom: '#9cff6b', phantom: '#a8ffe0', lightning: '#fff27a', shadow: '#c6a0ff', dragon: '#ff5030', starfall: '#fff0a8', radiance: '#fff0a8', pillar: '#fff2a8', quake: '#e0a060', combo: '#ffb347', xslash: '#9fd8ff', ricochet: '#fff2c0' }[fx] || '#ffffff';
        this.hitSparks(p.x, p.y - 16, colr, t.dmg, fx === 'slash' || fx === 'slash_heavy');
        this.elementHit(p.x, p.y - 16, { proj_firearrow: 'proj_fire', flamewave: 'proj_fire', missiles: 'proj_arcane', timestop: 'proj_ice' }[fx] || fx);
        this.glows.push({ x: p.x, y: p.y - 16, r: 34 + Math.min(40, t.dmg * 1.5), color: colr, t: 0, life: 0.35, a: 0.8 });
        if (['slash', 'slash_heavy', 'slash_wide', 'shadow'].includes(fx)) this.arc(p.x, p.y - 18, fx === 'slash_heavy' ? 20 : 15, colr === '#ffffff' ? '#e8f4ff' : colr);
        if (t.splash) this.burst(p.x, p.y - 12, '#ff8a3c', 24, 50);
        if (t.dmg > 0) { this.flashActor(p.a); this.pose(p.a, 'hurt', 260); this.hitShake(p.a, t.dmg); }
        if (t.blocked) this.number(p.x + 12, p.y - 28, 'Blocked ' + t.blocked, '#9fb6d8', 0.75);
        if (t.sundered) this.number(p.x + 10, p.y - 26, 'Armour broken', '#ff9a7a', 0.75);
        this.number(p.x, p.y - 38 - dy, t.dmg, t.crit ? '#ffb347' : t.finisher ? '#ffd25a' : '#ffffff', t.dmg >= 15 ? 1.45 : 1.15, true);
        if (t.dmg >= 14 || t.killed) big = true;
      } else if (t.status && p.a.type === 'enemy') {   // a status without a hit: Hunter's Mark, Venom Storm
        this.burst(p.x, p.y - 14, STATUS_COL[t.status[0]] || '#fff', 14, 26);
      }
      if (t.status && p.a.type === 'enemy') {
        for (const s of t.status) this.number(p.x - 4, p.y - 52 - dy, STATUS_ABBR[s] || s, STATUS_COL[s] || '#fff', 0.78);
        if (t.status.includes('mark')) this.ring(p.x, p.y - 14, '#ff6b6b');
      }
      if (t.heal) { this.number(p.x, p.y - 44, '+' + t.heal, '#8dff9e', 1); this.column(p.x, p.y, '#9dffb0'); }
    }
    if ((list || ev.targets).some(t => t.shatter)) for (const t of (list || ev.targets).filter(t => t.shatter)) { const p = this.pos(t.id); if (p) this.burst(p.x, p.y - 10, '#ffc24a', 30, 40); }
    this.freezeUntil = now() + (big ? 90 : 55);
    if (big) { this.shake = Math.max(this.shake, 3); this.shakeT = now(); }
    sfx(big ? 'hitBig' : 'hit');
    if (!hold) this._applyAfter(ev);
  }

  // Several projectiles, one per target record: Arcane Missiles, Twin Shot, Phantom Volley, Ricochet (which bounces
  // from each target to the next). Each hit lands as its own projectile arrives.
  _multiShot(A, ev, tgt, fx, rc, T) {
    const hand = { x: A.x - 14, y: A.y - 26 };
    const kind = fx === 'missiles' ? 'proj_arcane' : fx === 'phantom' ? 'phantom' : 'proj_arrow';
    const gap = fx === 'phantom' ? 110 : fx === 'missiles' ? 150 : fx === 'ricochet' ? 0 : 190;
    this.pose(A, A.cls === 'ranger' ? 'windup' : 'cast0', T(300));
    this.glows.push({ x: hand.x, y: hand.y, r: 26, color: kind === 'proj_arcane' ? '#b8a6ff' : kind === 'phantom' ? '#a8ffe0' : '#efe6d0', t: 0, life: 0.5, a: 0.7 });
    if (kind === 'proj_arcane') this.rune(A.x, A.y, '#b8a6ff');
    const last = {}; tgt.forEach((t, i) => { last[t.id] = i; });
    let at = 200, end = 0, from = hand;
    tgt.forEach((t, i) => {
      const e = this.actors.get(t.id); if (!e) return;
      const to = { x: e.x + (Math.random() - 0.5) * 6, y: e.y - 16 + (Math.random() - 0.5) * 6 };
      const src = fx === 'ricochet' ? from : { x: hand.x + (Math.random() - 0.5) * 6, y: hand.y + (Math.random() - 0.5) * 6 };
      const fly = Math.max(140, Math.hypot(to.x - src.x, to.y - src.y) * (kind === 'proj_arcane' ? 1.5 : 1.0));
      const shoot = at;
      setTimeout(() => { if (fx !== 'ricochet' || i === 0) this.pose(A, A.cls === 'ranger' ? (i % 2 ? 'swing1' : 'swing2') : 'cast1', T(160)); this.projectile(src, to, kind, T(fly)); sfx(kind === 'proj_arcane' ? 'cast' : 'bow'); }, T(shoot));
      setTimeout(() => { this.impact(ev, tgt, fx, rc, [t], true); if (last[t.id] === i) this._applyAfter(ev, [t.id]); if (fx === 'ricochet') this.burst(to.x, to.y, '#fff2c0', 10, 40); }, T(shoot + fly));
      end = Math.max(end, shoot + fly);
      at += fx === 'ricochet' ? fly : gap;
      from = to;
    });
    setTimeout(() => { const rest = ev.targets.filter(t => !tgt.includes(t) && t.heal); if (rest.length) this.impact(ev, [], fx, rc, rest, true); this._applyAfter(ev); }, T(end + 80));
    return T(end + 420);
  }

  // where a blade meets an enemy: the middle of its body (higher up on big ones)
  _hitPoint(e) {
    const p = this.pos(e.id) || { x: e.x, y: e.y };
    const info = SP.enemyInfo(e.kind);
    return { x: p.x + 2, y: p.y - Math.min(54, Math.max(12, info.ay * 0.36)) };
  }
  // Cross-slash impact (Champion's Combo): long thin blue blades of light crossing at the point of contact, a white
  // flare where they meet, and blue sparks that burst out and linger as residue. angles: the blades' directions (deg).
  crossHit(x, y, angles, T = ms => ms) {
    const t0 = now();
    angles.forEach((deg, i) => {
      const long = 95 + Math.random() * 35, short = 45 + Math.random() * 25;
      this.xhits.push({ kind: 'blade', x, y, a: deg * Math.PI / 180, l1: i % 2 ? short : long, l2: i % 2 ? long : short, w: 5.5 - i * 0.7, t0: t0 + i * T(30), life: T(620) });
    });
    this.xhits.push({ kind: 'flare', x, y, t0, life: T(360) });
    for (let k = 0; k < 8; k++) this.xhits.push({ kind: 'blade', x, y, a: Math.random() * Math.PI * 2, l1: 12 + Math.random() * 18, l2: 0, w: 1.8, t0, life: T(260) });
    for (let k = 0; k < 24; k++) {   // sparks flung out, slowing down, then drifting and twinkling a while
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 200;
      this.slivers.push({ x: x + Math.cos(a) * 5, y: y + Math.sin(a) * 5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, len: 8 + Math.random() * 12, t0, last: t0, life: T(600 + Math.random() * 600) });
    }
    for (let k = 0; k < 14; k++) this.slivers.push({ x: x + (Math.random() - 0.5) * 44, y: y + (Math.random() - 0.5) * 34, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 16, len: 2.5 + Math.random() * 2.5, t0: t0 + T(100 + Math.random() * 200), last: t0, life: T(900 + Math.random() * 700), twinkle: true });
    sfx('zap');
  }
  drawXHits(ctx, t, sx, sy) {
    if (!this.xhits.length && !this.slivers.length) return;
    const s = this.s;
    const lens = (x0, y0, x1, y1, w, col) => {   // a thin pointed blade from (x0,y0) to (x1,y1), widest a third of the way along
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const mx = x0 + dx * 0.38, my = y0 + dy * 0.38;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx + nx * w, my + ny * w, x1, y1);
      ctx.quadraticCurveTo(mx - nx * w, my - ny * w, x0, y0);
      ctx.fillStyle = col; ctx.fill();
    };
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = this.xhits.length - 1; i >= 0; i--) {
      const h = this.xhits[i], age = t - h.t0;
      if (age > h.life) { this.xhits.splice(i, 1); continue; }
      if (age < 0) continue;
      const k = age / h.life, X = h.x * s + sx, Y = h.y * s + sy;
      if (h.kind === 'flare') {
        const r = (5 + 15 * Math.min(1, k / 0.25)) * s, a = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
        g.addColorStop(0, hexA('#ffffff', 0.95 * a)); g.addColorStop(0.2, hexA('#c8f0ff', 0.7 * a)); g.addColorStop(0.55, hexA('#3a8aff', 0.28 * a)); g.addColorStop(1, hexA('#1a4aff', 0));
        ctx.fillStyle = g; ctx.fillRect(X - r, Y - r, r * 2, r * 2);
        continue;
      }
      const grow = Math.min(1, k / 0.12), ease = 1 - Math.pow(1 - grow, 3);   // shoots out fast, holds, then thins away
      const thin = k < 0.3 ? 1 : Math.max(0, 1 - (k - 0.3) / 0.7);
      const ca = Math.cos(h.a), sa = Math.sin(h.a);
      const x0 = X - ca * h.l2 * ease * s, y0 = Y - sa * h.l2 * ease * s, x1 = X + ca * h.l1 * ease * s, y1 = Y + sa * h.l1 * ease * s;
      const w = h.w * s * (0.3 + 0.7 * thin);
      ctx.shadowColor = '#4aa8ff'; ctx.shadowBlur = s * 10 * thin;
      lens(x0, y0, x1, y1, w * 2.6, hexA('#2a6aff', 0.35 * thin));
      ctx.shadowBlur = 0;
      lens(x0, y0, x1, y1, w * 1.5, hexA('#7fc8ff', 0.75 * thin));
      lens(x0, y0, x1, y1, w * 0.55, hexA('#ffffff', thin));
    }
    for (let i = this.slivers.length - 1; i >= 0; i--) {
      const p = this.slivers[i], age = t - p.t0;
      if (age > p.life) { this.slivers.splice(i, 1); continue; }
      const dt = Math.max(0, Math.min(0.05, (t - p.last) / 1000)); p.last = t;
      if (age < 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.04, dt); p.vy *= Math.pow(0.04, dt);
      const k = age / p.life, a = (1 - k) * (p.twinkle ? 0.5 + 0.5 * Math.sin(age / 35 + i) : 1);
      const sp = Math.hypot(p.vx, p.vy) || 1, L = p.twinkle ? p.len : Math.max(1.5, p.len * Math.min(1, sp / 60));
      const X = p.x * s + sx, Y = p.y * s + sy, ux = p.twinkle ? 0 : p.vx / sp, uy = p.twinkle ? 1 : p.vy / sp;
      if (p.twinkle) { lens(X - L * s, Y, X + L * s, Y, 0.9 * s, hexA('#bfe8ff', a)); lens(X, Y - L * s, X, Y + L * s, 0.9 * s, hexA('#bfe8ff', a)); lens(X - L * 0.4 * s, Y, X + L * 0.4 * s, Y, 1.6 * s, hexA('#ffffff', a * 0.8)); continue; }
      lens(X - ux * L * s, Y - uy * L * s, X + ux * L * 0.4 * s, Y + uy * L * 0.4 * s, 1.8 * s, hexA('#4aa8ff', 0.85 * a));
      lens(X - ux * L * 0.7 * s, Y - uy * L * 0.7 * s, X + ux * L * 0.35 * s, Y + uy * L * 0.35 * s, 0.8 * s, hexA('#ffffff', a));
    }
    ctx.restore();
  }

  // Champion's Combo finisher: a giant electric slash arc, an oval about 226 px tall (four times the knight) that sweeps
  // from above the screen, over the knight, down through the enemy and into the floor. Its colour bends along the
  // curve (a conic gradient that follows the sweep): white-hot at the leading tip, through cyan and blue to nothing at
  // the tail. Current crackles along it, bolts fork off its outer edge and sparks fly from the tip while it sweeps.
  bigArc(tx, ty, T = ms => ms) {
    const Rx = 132, Ry = 144;   // the sweep runs from -1.45 rad (top, just right of centre) to -3.75 rad (low left)
    this.bigArcs.push({ cx: tx - 6 + Rx, cy: ty - 36, Rx, Ry, a0: -1.45, a1: -3.75, W: 32, t0: now(), life: T(950) });
  }
  drawBigArcs(ctx, t, sx, sy) {
    if (!this.bigArcs.length) return;
    const s = this.s, TAU = Math.PI * 2;
    const eo = x => 1 - Math.pow(1 - x, 3), ei = x => x * x;
    const thick = v => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(v, 2.6))), 0.8);   // v: 1 at the tip, 0 at the tail
    for (let i = this.bigArcs.length - 1; i >= 0; i--) {
      const b = this.bigArcs[i], k = (t - b.t0) / b.life;
      if (k >= 1) { this.bigArcs.splice(i, 1); continue; }
      if (k < 0) continue;
      const span = b.a1 - b.a0;                                                  // negative: the blade sweeps anticlockwise
      const head = b.a0 + span * eo(Math.min(1, k / 0.18));                     // the tip races round fast...
      const tail = b.a0 + span * ei(Math.min(1, Math.max(0, (k - 0.1) / 0.8))); // ...and the tail follows it in
      const len = tail - head; if (len < 0.03) continue;
      const fade = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55);
      const R = b.Rx * s, Wd = b.W * s, N = 56;
      ctx.save();
      ctx.translate(b.cx * s + sx, b.cy * s + sy); ctx.scale(1, b.Ry / b.Rx);   // draw the oval as a circle
      ctx.globalCompositeOperation = 'lighter';
      const at = u => head + len * u;                                            // u: 0 at the tip, 1 at the tail
      const crescent = (wk, jit) => {
        ctx.beginPath();
        for (let j = 0; j <= N; j++) { const u = j / N, a = at(u), r = R + (Math.random() - 0.5) * jit * s; j ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        for (let j = N; j >= 0; j--) { const u = j / N, a = at(u), r = R - Wd * wk * thick(1 - u); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath();
      };
      const bend = (stops) => {   // a gradient that bends round the arc: offsets are fractions of the arc's length
        if (ctx.createConicGradient) { const g = ctx.createConicGradient(head, 0, 0); for (const [f, c] of stops) g.addColorStop(Math.min(0.999, f * len / TAU), c); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; }
        const g = ctx.createLinearGradient(Math.cos(head) * R, Math.sin(head) * R, Math.cos(tail) * R, Math.sin(tail) * R);   // older browsers
        for (const [f, c] of stops) g.addColorStop(Math.min(1, f), c); return g;
      };
      const a = fade;
      // 1. wide blue glow  2. the body  3. the white-hot cutting edge
      ctx.shadowColor = '#3a7aff'; ctx.shadowBlur = 26 * s * a;
      crescent(1.6, 0); ctx.fillStyle = bend([[0, `rgba(140,210,255,${0.32 * a})`], [0.3, `rgba(60,140,255,${0.24 * a})`], [0.8, `rgba(30,60,220,${0.1 * a})`], [1, 'rgba(20,30,160,0)']]); ctx.fill();
      ctx.shadowBlur = 0;
      crescent(1, 3); ctx.fillStyle = bend([[0, `rgba(255,255,255,${a})`], [0.07, `rgba(225,248,255,${a})`], [0.25, `rgba(120,210,255,${0.9 * a})`], [0.6, `rgba(50,120,255,${0.6 * a})`], [1, 'rgba(30,40,180,0)']]); ctx.fill();
      crescent(0.24, 1.5); ctx.fillStyle = bend([[0, `rgba(255,255,255,${a})`], [0.4, `rgba(220,246,255,${0.85 * a})`], [0.85, 'rgba(160,220,255,0)']]); ctx.fill();
      // current running along the blade
      ctx.lineJoin = 'round'; ctx.shadowColor = '#6fc8ff'; ctx.shadowBlur = 10 * s * a;
      for (let q = 0; q < 3; q++) {
        const rf = 0.15 + Math.random() * 0.6, until = 0.55 + Math.random() * 0.35;
        ctx.beginPath();
        for (let j = 0; j <= 28; j++) { const u = until * j / 28, ang = at(u), r = R - Wd * thick(1 - u) * rf + (Math.random() - 0.5) * 7 * s; j ? ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); }
        ctx.strokeStyle = q ? `rgba(160,225,255,${0.8 * a})` : `rgba(255,255,255,${0.95 * a})`; ctx.lineWidth = (q ? 1.1 : 1.7) * s; ctx.stroke();
      }
      // bolts forking off the outer edge
      for (let q = 0; q < 7; q++) {
        const u = Math.random() * 0.75, ang = at(u), r0 = R + 1 * s, reach = (10 + Math.random() * 26) * s;
        let x = Math.cos(ang) * r0, y = Math.sin(ang) * r0; ctx.beginPath(); ctx.moveTo(x, y);
        const dir = ang + (Math.random() - 0.5) * 0.9;
        for (let n = 1; n <= 4; n++) { x += Math.cos(dir) * reach / 4 + (Math.random() - 0.5) * 6 * s; y += Math.sin(dir) * reach / 4 + (Math.random() - 0.5) * 6 * s; ctx.lineTo(x, y); }
        ctx.strokeStyle = `rgba(190,235,255,${0.75 * a * (1 - u)})`; ctx.lineWidth = 1 * s; ctx.stroke();
      }
      ctx.restore();
      // sparks thrown from the tip while it sweeps
      if (k < 0.22) for (let q = 0; q < 5; q++) {
        const hx = b.cx + Math.cos(head) * b.Rx, hy = b.cy + Math.sin(head) * b.Ry, tang = head - Math.PI / 2, v = 60 + Math.random() * 120;
        this.particles.push({ x: hx, y: hy, vx: Math.cos(tang) * v * 0.6 + (Math.random() - 0.5) * 60, vy: Math.sin(tang) * v * 0.6 + (Math.random() - 0.5) * 60, g: 60, life: 0.35 + Math.random() * 0.35, t: 0, c: Math.random() < 0.5 ? '#ffffff' : '#9fe8ff', streak: 3, drag: 0.92 });
      }
    }
  }

  // a jagged line from a to b (for bolts)
  _zig(a, b, n, j) { const pts = [a]; for (let i = 1; i < n; i++) pts.push({ x: lerp(a.x, b.x, i / n) + (Math.random() - 0.5) * j, y: lerp(a.y, b.y, i / n) + (Math.random() - 0.5) * j }); pts.push(b); return pts; }

  // Meteor with its PixelLab animation (anims.meteor): the mage floats up, thrusts the flame in her hand out at the enemy
  // (pointAt), crushes it (crushAt) and pauses, then opens her hand on a tiny spark (openAt) that sits a moment and shoots
  // up off the screen (sparkAt). She turns her back on the enemy, staff pointed at the ground (turnAt), and a giant meteor
  // streaks in from the top right behind her and lands on the middle of the enemies (hit): fireball, shockwave, cracks,
  // rubble and fire left burning on the floor. Then she turns back and floats down (downAt).
  _meteorAnim(A, ev, T, anim) {
    const M = anim.meteor;
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const ens = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const flame = M.flame || '#ff8a3c';
    const palm = () => {   // where her flame hand is on the current frame (M.hands: [from frame, [x, y]] from the feet)
      const m = A.anim, el = m ? (now() - m.t0) / m.speed : 0;
      let f = 0; if (m) while (f + 1 < m.at.length && el >= m.at[f + 1]) f++;
      let h = M.hands[0][1]; for (const [k, xy] of M.hands) if (f >= k) h = xy;
      return { x: A.x + A.ox + h[0], y: A.y + A.oy + h[1] };
    };
    const at0 = now();
    A.anim = { d: anim, t0: at0, speed: T(1000) / 1000, at, total: acc };
    const when = (f, fn, extra = 0) => setTimeout(fn, T(at[f] + extra));
    // where it lands: the middle of the enemies, on the floor
    const xs = ens.map(e => e.x), cx = ens.length ? xs.reduce((a, b) => a + b, 0) / xs.length : A.x - 160;
    const cy = ens.length ? ens.reduce((a, e) => a + e.y, 0) / ens.length : A.y;
    const spread = ens.length ? Math.max(56, (Math.max(...xs) - Math.min(...xs)) / 2 + 40) : 60;
    // close-up on the mage until she turns away, then the camera eases out so the meteor and the enemies fit
    this.cam = { x: A.x - 4, y: A.y - 58, t0: at0, dur: T(at[M.turnAt] + 260), z: 1.12 };
    // 1. she rises off the floor on a ring of light
    this.move(A, 0, -(M.lift || 30), T(at[2] + 120));
    this.rune(A.x, A.y, flame); this.burst(A.x, A.y - 2, '#d8c8b0', 10, 24, 20); sfx('cast');
    this.mets.push({ kind: 'hand', follow: palm, color: flame, t0: at0, life: T(at[M.crushAt]) });
    // 2. she thrusts the flame out at the enemy: it flares and throws a few embers their way
    when(M.pointAt, () => {
      const p = palm();
      this.glows.push({ x: p.x, y: p.y - 4, r: 34, color: flame, t: 0, life: 0.4, a: 0.9 });
      for (let i = 0; i < 12; i++) this.particles.push({ x: p.x, y: p.y - 4, vx: -60 - Math.random() * 90, vy: (Math.random() - 0.5) * 50, g: -20, life: 0.4 + Math.random() * 0.3, t: 0, c: i % 3 ? flame : '#fff6c8', streak: 2, drag: 0.88 });
      sfx('burn');
    });
    // 3. she crushes the flame: embers squeeze out between her fingers, a puff of smoke, light leaking from the fist
    when(M.crushAt, () => {
      const p = palm();
      for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, v = 50 + Math.random() * 90; this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 60, life: 0.35 + Math.random() * 0.35, t: 0, c: Math.random() < 0.3 ? '#ffffff' : i % 2 ? flame : '#ffd25a', streak: 2 + (i % 3), drag: 0.85 }); }
      for (let i = 0; i < 7; i++) this.particles.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y - 2, vx: (Math.random() - 0.5) * 10, vy: -14 - Math.random() * 12, g: 0, life: 0.7 + Math.random() * 0.4, t: 0, c: '#5a5060', blob: 1, fade: true });
      this.glows.push({ x: p.x, y: p.y, r: 30, color: flame, t: 0, life: 0.3, a: 0.9 });
      this.mets.push({ kind: 'fist', follow: palm, color: flame, t0: now(), life: T(at[M.openAt] - at[M.crushAt]) });
      sfx('crush');
    });
    // 4. she opens her hand on a tiny spark, which shoots up and out of the top of the screen
    when(M.openAt, () => {
      this.mets.push({ kind: 'spark', follow: palm, color: flame, t0: now(), hold: T(at[M.sparkAt] - at[M.openAt]), fly: T(420), life: T(at[M.sparkAt] - at[M.openAt] + 420), pts: [] });
      sfx('twinkle');
    });
    when(M.sparkAt, () => sfx('rise'));
    // 5. she turns her back on the enemy, staff pointed at the ground: a swish of her cloak
    when(M.turnAt, () => {
      for (let i = 0; i < 10; i++) this.particles.push({ x: A.x + A.ox + (Math.random() - 0.5) * 20, y: A.y + A.oy - 10 - Math.random() * 30, vx: 40 + Math.random() * 40, vy: (Math.random() - 0.5) * 20, g: 0, life: 0.3 + Math.random() * 0.2, t: 0, c: Math.random() < 0.5 ? '#8a7aa8' : '#cfc4e0', fade: true });
      sfx('whoosh');
    });
    // 6. the meteor: its shadow and a burning ring mark the spot, the sky glows red, and it streaks in from the top right
    const fallFrom = at[M.turnAt] + 120, fall = at[anim.hit] - fallFrom;
    setTimeout(() => {
      this.mets.push({ kind: 'mark', x: cx, y: cy, w: spread, t0: now(), life: T(fall + 120) });
      this.mets.push({ kind: 'rock', from: { x: cx + 330, y: cy - 470 }, to: { x: cx, y: cy - 10 }, R: 72, t0: now(), life: T(fall), rot: Math.random() * 6,
        cracks: Array.from({ length: 6 }, () => { let a = Math.random() * Math.PI * 2, r = 0.1 + Math.random() * 0.3; const pts = []; for (let j = 0; j < 4; j++) { pts.push([Math.cos(a) * r, Math.sin(a) * r]); a += (Math.random() - 0.5) * 0.9; r += 0.18 + Math.random() * 0.15; } return pts; }) });
      sfx('fall');
    }, T(fallFrom));
    // 7. impact
    when(anim.hit, () => {
      this.mets.push({ kind: 'boom', x: cx, y: cy, w: spread, t0: now(), life: T(1100) });
      this.mets.push({ kind: 'burn', x: cx, y: cy, w: spread, t0: now(), life: T(1700) });
      this.shake = Math.max(this.shake, 12); this.shakeT = now(); this.flash = Math.max(this.flash || 0, 0.22); this.freezeUntil = now() + 150;
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4, L = spread * (0.7 + Math.random() * 0.6); this._crack(Math.round(cx), Math.round(cy + 1), Math.round(cx + Math.cos(a) * L), Math.round(cy + 1 + Math.sin(a) * L * 0.25), T(160), T(1900)); }
      const lp = this.lowPower ? 0.5 : 1;
      for (let i = 0; i < 34 * lp; i++) { const a = -Math.PI * (0.08 + Math.random() * 0.84), v = 90 + Math.random() * 170; this.particles.push({ x: cx + (Math.random() - 0.5) * 20, y: cy - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 380, life: 0.8 + Math.random() * 0.6, t: 0, c: ['#3a2418', '#5a3a24', '#7a4a2a', '#ff8a3c'][i % 4], cube: 2 + (i % 2), spin: Math.random() * 6, fade: true }); }
      for (let i = 0; i < 70 * lp; i++) { const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 200; this.particles.push({ x: cx, y: cy - 14, vx: Math.cos(a) * v * 1.4, vy: Math.sin(a) * v * 0.8 - 40, g: 90, life: 0.5 + Math.random() * 0.6, t: 0, c: ['#ffffff', '#fff6c8', '#ffd25a', '#ffb347', '#ff6a2a'][i % 5], streak: 3 + (i % 4), drag: 0.9 }); }
      for (let i = 0; i < 26 * lp; i++) this.particles.push({ x: cx + (Math.random() - 0.5) * spread * 1.6, y: cy - Math.random() * 30, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 25, g: -6, life: 1.2 + Math.random() * 0.9, t: 0, c: Math.random() < 0.5 ? '#3a3040' : '#54485a', blob: 1 + Math.random() * 2, fade: true });
      this.impact(ev, tgt, 'meteor', rc);
      sfx('boom');
    });
    // 8. she turns back and floats down, and the flame lights up in her hand again
    when(M.downAt, () => this.move(A, 0, 0, T(acc - at[M.downAt])));
    setTimeout(() => { const p = palm(); this.glows.push({ x: p.x, y: p.y, r: 18, color: flame, t: 0, life: 0.35, a: 0.8 }); this.burst(p.x, p.y, flame, 8, 20); }, T(at[M.downAt] + 40));
    setTimeout(() => { A.anim = null; this.move(A, 0, 0, T(120)); }, T(acc + 60));
    return T(acc + 450);
  }
  // Earthshatter with its own animation (anims.quake, frames from the combo): the knight crouches and leaps up and
  // forward at 70 degrees (jumpAt), holds the sword up in the air while a flame aura makes the blade look twice as long
  // (holdAt), spins down into the floor at the nearest enemy inside a wheel of fire (spinAt) and lands in the
  // downward-strike pose (hit): fire erupts from the ground in a wave across the whole enemy side, hitting every enemy.
  _quakeAnim(A, ev, T, anim) {
    const Q = anim.quake;
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const ens = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const t0 = now();
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    const when = (f, fn, extra = 0) => setTimeout(fn, T(at[f] + extra));
    // where he lands: in front of the nearest enemy (the one furthest right)
    const near = ens.length ? ens.reduce((a, e) => (e.x > a.x ? e : a)) : null;
    const land = near ? { x: near.x + (near.size === 'xl' ? 46 : near.size === 'l' ? 26 : 20) + 14, y: near.y + 2 } : { x: A.x - 90, y: A.y };
    // the raised sword and its doubled flame reach ~135px above his feet, so a hero standing high up the screen first
    // steps forward and down to a launch spot low enough for the leap to fit on screen
    const HEAD = 135, floor = this.stage.y + this.stage.h - 8;
    const launch = { x: A.x - 16, y: Math.min(floor, Math.max(A.y, HEAD + 40)) };
    const rise = Math.max(30, Math.min(74, launch.y - HEAD));
    const apex = { x: launch.x - A.x - rise / Math.tan(70 * Math.PI / 180), y: launch.y - A.y - rise };   // 70 degrees up and towards the enemy
    const left = ens.length ? Math.min(...ens.map(e => e.x)) : land.x - 60, gy = ens.length ? ens.reduce((a, e) => a + e.y, 0) / ens.length : land.y;
    this.cam = { x: (A.x + left) / 2, y: launch.y - 60, t0, dur: T(acc + 380), z: 1.05 };
    this.move(A, launch.x - A.x, launch.y - A.y, T(at[Q.jumpAt] - 10));   // crouched, he slides into the launch spot
    sfx('whirl');
    // 1. the leap
    when(Q.jumpAt, () => { this.move(A, apex.x, apex.y, T(at[Q.holdAt[0]] - at[Q.jumpAt])); this.burst(A.x, A.y, '#d8c8b0', 14, 30, 30); sfx('whoosh'); });
    // 2. the flaming blade, held up in the air (it floats a little)
    when(Q.holdAt[0], () => {
      const holdMs = at[Q.spinAt] - at[Q.holdAt[0]];
      this.mets.push({ kind: 'fblade', follow: A, len: Q.blade || 28, t0: now(), life: T(holdMs + 200), hold: T(holdMs) });
      this.move(A, apex.x, apex.y - 4, T(holdMs));
      sfx('burn'); sfx('charge');
    });
    // 3. the spin dive: the sprite turns over twice inside a wheel of fire on the way down
    when(Q.spinAt, () => {
      const ms = T(at[anim.hit] - at[Q.spinAt]);
      A.spin = { t0: now(), dur: ms, turns: 2 };
      this.move(A, land.x - A.x, land.y - A.y, ms, true, true);
      this.mets.push({ kind: 'wheel', follow: A, t0: now(), life: ms + T(60) });
      sfx('whirl');
    });
    // 4. impact: a fire burst where he lands, then flames erupt from the ground in a wave across the enemies
    when(anim.hit, () => {
      A.spin = null;
      this.shake = Math.max(this.shake, 11); this.shakeT = now(); this.flash = Math.max(this.flash || 0, 0.15); this.freezeUntil = now() + 130;
      const ox = land.x - 18, oy = land.y;
      this.glows.push({ x: ox, y: oy - 10, r: 70, color: '#ff7a2a', t: 0, life: 0.5, a: 1 });
      for (let j = 0; j < 3; j++) this.mets.push({ kind: 'fring', x: ox, y: oy + 1, t0: now() + T(j * 120), life: T(700), r1: 80 + j * 35 });
      for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6 - 0.5) * 2.4, L = 50 + Math.random() * 70; this._crack(Math.round(ox), Math.round(oy + 1), Math.round(ox + Math.cos(a) * L), Math.round(oy + 1 + Math.sin(a) * L * 0.22), T(220), T(1800)); }
      for (let i = 0; i < 26; i++) { const a = -Math.PI * (0.1 + Math.random() * 0.8), v = 80 + Math.random() * 140; this.particles.push({ x: ox + (Math.random() - 0.5) * 16, y: oy - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 360, life: 0.7 + Math.random() * 0.5, t: 0, c: ['#3a2418', '#5a3a24', '#7a4a2a', '#ff8a3c'][i % 4], cube: 2 + (i % 2), spin: Math.random() * 6, fade: true }); }
      // the eruptions: one big column under every enemy, smaller ones in between, the wave rolling away from him
      const spots = ens.map(e => ({ x: e.x, y: e.y + 1, big: true }));
      const from = Math.min(left - 30, ox - 40), to = ox - 20;
      for (let x = to; x >= from; x -= this.pixelFx ? 28 : 18) spots.push({ x: x + (Math.random() - 0.5) * 8, y: gy + (Math.random() - 0.5) * 18, big: false });
      for (const sp of spots) {
        const d = Math.max(0, ox - sp.x);
        this.mets.push({ kind: 'geyser', x: sp.x, y: sp.y, h: sp.big ? 78 + Math.random() * 18 : 34 + Math.random() * 22, w: sp.big ? 15 : 9, t0: now() + T(40 + d * 2.2), life: T(sp.big ? 700 : 520) });
      }
      this.mets.push({ kind: 'burn', x: (from + to) / 2, y: gy, w: (to - from) / 2 + 10, t0: now() + T(200), life: T(1500) });
      setTimeout(() => this.impact(ev, tgt, 'quake', rc), T(140));
      sfx('boom'); sfx('stomp');
    });
    setTimeout(() => { A.anim = null; this.move(A, 0, 0, T(320)); }, T(acc + 40));
    return T(acc + 520);
  }
  // the PixelLab sprite versions of the meteor, its explosion and the fire columns, drawn crisp on the pixel layer
  drawPixelFx(n, t) {
    const frame = (S, age, scale, x, y) => {
      if (!S.img.complete || !S.img.naturalWidth) return false;
      let f = Math.floor(age / 1000 * S.fps); if (S.loop) f %= S.n; else if (f >= S.n) return false;
      const sx = (f % S.cols) * S.w, sy = Math.floor(f / S.cols) * S.h;
      n.drawImage(S.img, sx, sy, S.w, S.h, Math.round(x - S.ax * scale), Math.round(y - S.ay * scale), S.w * scale, S.h * scale);
      return true;
    };
    for (const m of this.mets) {
      const age = t - m.t0; if (age < 0 || age > m.life) continue;
      if (m.kind === 'rock') { const e = Math.pow(age / m.life, 1.6); frame(PFX.rock, age, 2, lerp(m.from.x, m.to.x, e), lerp(m.from.y, m.to.y, e)); }
      else if (m.kind === 'boom') frame(PFX.boom, age * 0.9, m.w > 70 ? 2 : 1, m.x, m.y + 2);
      else if (m.kind === 'geyser') frame(PFX.geyser, age * 1.15, 1, m.x, m.y + 2);
      else if (m.kind === 'fblade' && age < m.hold) {   // the blade on fire while he holds it up (not once he starts to spin)
        const tip = this._tipAt(m.follow); if (!tip) continue;
        n.globalAlpha = Math.min(1, age / 160); frame(PFX.blade, age, 1, tip.x, tip.y); n.globalAlpha = 1;
      }
    }
  }
  drawMeteors(ctx, t, sx, sy) {
    if (!this.mets.length) return;
    const s = this.s, TAU = Math.PI * 2, X = x => x * s + sx, Y = y => y * s + sy;
    const glow = (x, y, r, col, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, a)); g.addColorStop(0.4, hexA(col, a * 0.35)); g.addColorStop(1, hexA(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    const eo = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    ctx.save();
    for (let i = this.mets.length - 1; i >= 0; i--) {
      const m = this.mets[i], age = t - m.t0;
      if (age > m.life) { this.mets.splice(i, 1); continue; }
      if (age < 0) continue;
      const k = age / m.life;
      ctx.globalCompositeOperation = 'lighter';
      if (m.kind === 'hand') {   // the flame in her palm, burning brighter just before she crushes it
        const p = m.follow(), fl = 0.85 + 0.15 * Math.sin(t / 37) * Math.sin(t / 91);
        glow(X(p.x), Y(p.y - 4), (12 + 6 * k) * s * fl, m.color, 0.55 + 0.3 * k);
        if (Math.random() < 0.5) this.particles.push({ x: p.x + (Math.random() - 0.5) * 4, y: p.y - 6, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 20, g: 0, life: 0.4, t: 0, c: Math.random() < 0.5 ? m.color : '#ffd25a', fade: true });
      } else if (m.kind === 'fist') {   // light squeezing out between the fingers, dying down
        const p = m.follow(), a = 1 - k * 0.7, pulse = 0.7 + 0.3 * Math.sin(t / 45);
        glow(X(p.x), Y(p.y), 10 * s * pulse, m.color, 0.6 * a);
        ctx.strokeStyle = hexA('#fff2c0', 0.7 * a); ctx.lineWidth = Math.max(1, s * 0.7);
        const seed = Math.floor(t / 70);
        for (let j = 0; j < 4; j++) { const ang = ((seed * 7 + j * 13) % 20) / 20 * TAU, L = (5 + ((seed + j * 3) % 5) * 2) * s; ctx.beginPath(); ctx.moveTo(X(p.x) + Math.cos(ang) * 2 * s, Y(p.y) + Math.sin(ang) * 2 * s); ctx.lineTo(X(p.x) + Math.cos(ang) * L, Y(p.y) + Math.sin(ang) * L); ctx.stroke(); }
      } else if (m.kind === 'spark') {   // a tiny spark in the open palm, then it shoots up out of the screen
        let x, y, big = 1;
        if (age < m.hold) { const p = m.follow(); x = p.x; y = p.y - 3 - Math.min(4, age / m.hold * 8); m.last = { x, y }; }
        else {
          const f = (age - m.hold) / m.fly, o = m.last || m.follow(), e = f * f;
          x = o.x - 18 * e + Math.sin(f * 9) * 3; y = o.y - (o.y + 60) * e; big = 1 + f * 0.6;
          m.pts.push({ x, y, t });
          if (Math.random() < 0.7) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, g: 30, life: 0.35, t: 0, c: Math.random() < 0.5 ? '#fff6c8' : m.color, fade: true });
        }
        m.pts = m.pts.filter(q => t - q.t < 260);
        for (let j = 1; j < m.pts.length; j++) {
          const a0 = m.pts[j - 1], a1 = m.pts[j], fa = 1 - (t - a1.t) / 260;
          ctx.strokeStyle = hexA(m.color, 0.55 * fa); ctx.lineWidth = s * 3 * fa; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(X(a0.x), Y(a0.y)); ctx.lineTo(X(a1.x), Y(a1.y)); ctx.stroke();
          ctx.strokeStyle = hexA('#ffffff', 0.8 * fa); ctx.lineWidth = s * 1.2 * fa;
          ctx.beginPath(); ctx.moveTo(X(a0.x), Y(a0.y)); ctx.lineTo(X(a1.x), Y(a1.y)); ctx.stroke();
        }
        const tw = 0.7 + 0.3 * Math.sin(t / 30), L = (3 + 2.5 * tw) * s * big;
        glow(X(x), Y(y), 9 * s * big, m.color, 0.8);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1, s * 0.7);
        ctx.beginPath(); ctx.moveTo(X(x) - L, Y(y)); ctx.lineTo(X(x) + L, Y(y)); ctx.moveTo(X(x), Y(y) - L); ctx.lineTo(X(x), Y(y) + L); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(X(x) - s, Y(y) - s, 2 * s, 2 * s);
      } else if (m.kind === 'mark') {   // the landing spot: a darkening shadow and a burning ring on the floor
        const e = k * k, x = X(m.x), y = Y(m.y), rx = (m.w * (0.5 + 0.7 * e)) * s;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(10,4,4,${0.15 + 0.45 * e})`; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.26, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = hexA('#ff6a2a', (0.35 + 0.45 * e) * (0.75 + 0.25 * Math.sin(t / 50))); ctx.lineWidth = Math.max(1.5, s * 1.4);
        ctx.beginPath(); ctx.ellipse(x, y, m.w * 1.15 * s, m.w * 0.3 * s, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y, m.w * 1.15 * s * (1 - 0.35 * ((t / 600) % 1)), m.w * 0.3 * s * (1 - 0.35 * ((t / 600) % 1)), 0, 0, TAU); ctx.stroke();
        // the sky turns red as it comes in
        const sg = ctx.createLinearGradient(0, 0, 0, this.cv.height * 0.6); sg.addColorStop(0, `rgba(255,70,20,${0.3 * e})`); sg.addColorStop(1, 'rgba(255,70,20,0)');
        ctx.fillStyle = sg; ctx.fillRect(0, 0, this.cv.width, this.cv.height * 0.6);
      } else if (m.kind === 'rock') {   // the meteor: a burning rock with a long fiery tail
        const e = Math.pow(k, 1.6), px = lerp(m.from.x, m.to.x, e), py = lerp(m.from.y, m.to.y, e);
        if (this.pixelFx) { glow(X(px), Y(py), m.R * 3 * s, '#ff5a1a', 0.45); if (Math.random() < 0.8) this.particles.push({ x: px + 30 + Math.random() * 30, y: py - 30 - Math.random() * 30, vx: 60 + Math.random() * 40, vy: -60 - Math.random() * 40, g: 20, life: 0.3, t: 0, c: Math.random() < 0.5 ? '#ffd25a' : '#ff8a3c', streak: 2, drag: 0.9 }); continue; }
        const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y, D = Math.hypot(dx, dy), ux = dx / D, uy = dy / D, nx = -uy, ny = ux;
        const x = X(px), y = Y(py), R = m.R * s, Lt = R * (4 + 3 * k);
        glow(x, y, R * 3.4, '#ff5a1a', 0.55);
        const tail = (w, col0, col1, wob) => {   // a flame shape: round at the rock, tapering away behind it
          const tx = x - ux * Lt, ty = y - uy * Lt, wb = Math.sin(t / 40) * R * wob;
          const g = ctx.createLinearGradient(x, y, tx, ty); g.addColorStop(0, col0); g.addColorStop(1, col1);
          ctx.beginPath(); ctx.moveTo(x + nx * R * w, y + ny * R * w);
          ctx.quadraticCurveTo(x - ux * Lt * 0.5 + nx * (R * w * 0.8 + wb), y - uy * Lt * 0.5 + ny * (R * w * 0.8 + wb), tx, ty);
          ctx.quadraticCurveTo(x - ux * Lt * 0.5 - nx * (R * w * 0.8 - wb), y - uy * Lt * 0.5 - ny * (R * w * 0.8 - wb), x - nx * R * w, y - ny * R * w);
          ctx.arc(x, y, R * w, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
          ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        };
        tail(1.45, 'rgba(255,60,20,0.55)', 'rgba(120,20,10,0)', 0.25);
        tail(1.12, 'rgba(255,140,40,0.85)', 'rgba(255,60,20,0)', 0.18);
        tail(0.75, 'rgba(255,230,150,0.95)', 'rgba(255,140,40,0)', 0.1);
        // the rock itself, with glowing cracks, and a white-hot front where it cuts through the air
        ctx.globalCompositeOperation = 'source-over';
        const rg = ctx.createRadialGradient(x + ux * R * 0.3, y + uy * R * 0.3, R * 0.1, x, y, R * 0.85);
        rg.addColorStop(0, '#8a3a18'); rg.addColorStop(0.6, '#4a1c10'); rg.addColorStop(1, '#22100a');
        ctx.fillStyle = rg; ctx.beginPath();
        for (let j = 0; j <= 14; j++) { const a = j / 14 * TAU, r = R * (0.78 + 0.07 * Math.sin(a * 3 + m.rot)); j ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        const rot = m.rot + age * 0.004, cr = Math.cos(rot), sr = Math.sin(rot);
        ctx.strokeStyle = 'rgba(255,170,60,0.9)'; ctx.lineWidth = Math.max(1, s * 1.1); ctx.lineJoin = 'round';
        for (const c of m.cracks) { ctx.beginPath(); c.forEach(([u, v], j) => { const qx = x + (u * cr - v * sr) * R * 0.8, qy = y + (u * sr + v * cr) * R * 0.8; j ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }); ctx.stroke(); }
        const fa = Math.atan2(uy, ux);
        ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 12 * s;
        ctx.strokeStyle = 'rgba(255,245,210,0.95)'; ctx.lineWidth = R * 0.22;
        ctx.beginPath(); ctx.arc(x, y, R * 0.8, fa - 1.2, fa + 1.2); ctx.stroke();
        ctx.shadowBlur = 0;
        // embers and smoke shed behind it
        for (let j = 0; j < 4; j++) { const a = Math.random() * TAU, r = m.R * 0.8; this.particles.push({ x: px + Math.cos(a) * r, y: py + Math.sin(a) * r, vx: -ux * (60 + Math.random() * 80) + (Math.random() - 0.5) * 40, vy: -uy * (60 + Math.random() * 80) + (Math.random() - 0.5) * 40, g: 20, life: 0.3 + Math.random() * 0.35, t: 0, c: ['#ffd25a', '#ff8a3c', '#ff5a1a', '#fff6c8'][j], streak: 2, drag: 0.9 }); }
        if (Math.random() < 0.5) this.particles.push({ x: px - ux * m.R * 2, y: py - uy * m.R * 2, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, g: -5, life: 0.8, t: 0, c: '#3a2a30', blob: 2, fade: true });
      } else if (m.kind === 'boom') {   // the explosion: a dome of fire, a tall flash, and two shockwaves over the floor
        const x = X(m.x), y = Y(m.y), W = m.w * s;
        const rf = (14 + m.w * 1.25 * eo(k / 0.3)) * s, af = k < 0.2 ? 1 : Math.max(0, 1 - (k - 0.2) / 0.6);
        glow(x, y - rf * 0.35, rf * 1.6, '#ff5a1a', 0.5 * af * af);
        if (this.pixelFx) continue;
        const g = ctx.createRadialGradient(x, y - rf * 0.3, 0, x, y - rf * 0.3, rf);
        g.addColorStop(0, `rgba(255,255,240,${af})`); g.addColorStop(0.25, `rgba(255,230,140,${0.95 * af})`); g.addColorStop(0.55, `rgba(255,140,40,${0.8 * af})`); g.addColorStop(0.85, `rgba(220,50,20,${0.45 * af})`); g.addColorStop(1, 'rgba(120,20,10,0)');
        ctx.save(); ctx.translate(x, y - rf * 0.3); ctx.scale(1.25, 0.95); ctx.translate(-x, -(y - rf * 0.3)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - rf * 0.3, rf, 0, TAU); ctx.fill(); ctx.restore();
        if (k < 0.4) { const ca = 1 - k / 0.4; ctx.save(); ctx.translate(x, y - 60 * s); ctx.scale(0.35, 2.4); glow(0, 0, 50 * s, '#fff2c0', 0.8 * ca); ctx.restore(); }
        for (const [d, col, wd] of [[0, '#ffb347', 5], [0.12, '#ffffff', 2]]) {
          const q = (k - d) / 0.65; if (q < 0 || q > 1) continue;
          const r = (10 + W / s * 1.7 * eo(q)) * s;
          ctx.strokeStyle = hexA(col, 0.9 * (1 - q)); ctx.lineWidth = Math.max(1.5, s * wd * (1 - q));
          ctx.beginPath(); ctx.ellipse(x, y + s, r, r * 0.26, 0, 0, TAU); ctx.stroke();
        }
      } else if (m.kind === 'fblade') {   // a flame aura round the raised sword that makes the blade look twice as long
        const tip = this._tipAt(m.follow); if (!tip) continue;
        const L = m.len, g0 = Math.min(1, age / (m.life * 0.5)), fl = 0.85 + 0.15 * Math.sin(t / 31) * Math.sin(t / 73);
        const x = X(tip.x), yTop = Y(tip.y - L * g0 * fl), yBot = Y(tip.y + L), fade = k > 0.85 ? (1 - k) / 0.15 : 1;
        glow(x, Y(tip.y), (26 + 22 * g0) * s, '#ff6a1a', 0.55 * fade);
        if (this.pixelFx) continue;
        const flame = (w, c0, c1) => {   // a tall tapering tongue of fire along the blade and beyond its tip
          const ww = w * s * (0.6 + 0.4 * g0), wob = Math.sin(t / 45) * 2 * s;
          const g = ctx.createLinearGradient(0, yBot, 0, yTop); g.addColorStop(0, c0); g.addColorStop(1, c1);
          ctx.beginPath(); ctx.moveTo(x - ww, yBot); ctx.quadraticCurveTo(x - ww * 1.1, (yBot + yTop) / 2, x + wob, yTop);
          ctx.quadraticCurveTo(x + ww * 1.1, (yBot + yTop) / 2, x + ww, yBot); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        };
        flame(9, `rgba(255,70,20,${0.55 * fade})`, 'rgba(255,40,10,0)');
        flame(5.5, `rgba(255,160,50,${0.85 * fade})`, 'rgba(255,90,30,0)');
        flame(2.4, `rgba(255,245,200,${0.95 * fade})`, 'rgba(255,200,90,0)');
        if (Math.random() < 0.9) this.particles.push({ x: tip.x + (Math.random() - 0.5) * 8, y: tip.y + Math.random() * L - L * g0 * 0.5, vx: (Math.random() - 0.5) * 16, vy: -40 - Math.random() * 50, g: 0, life: 0.35 + Math.random() * 0.3, t: 0, c: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', blob: Math.random() < 0.3 ? 1 : 0, fade: true });
      } else if (m.kind === 'wheel') {   // the spin: a ring of fire round the tumbling knight
        const a = m.follow, cx = X(a.x + a.ox), cy = Y(a.y + a.oy - 24), rot = -age / 60, R = 30 * s;
        ctx.lineCap = 'round';
        for (const [w, col, al] of [[9, '#ff5a1a', 0.45], [5, '#ffb347', 0.8], [2, '#fff2c8', 0.95]]) {
          ctx.strokeStyle = hexA(col, al); ctx.lineWidth = w * s;
          ctx.beginPath(); ctx.arc(cx, cy, R, rot, rot + 2.6); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, R, rot + Math.PI, rot + Math.PI + 2.6); ctx.stroke();
        }
        glow(cx, cy, R * 1.8, '#ff6a1a', 0.5);
        for (let j = 0; j < 3; j++) { const q = rot + Math.random() * 6.28; this.particles.push({ x: a.x + a.ox + Math.cos(q) * 30, y: a.y + a.oy - 24 + Math.sin(q) * 30, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, g: 40, life: 0.35, t: 0, c: Math.random() < 0.5 ? '#ffd25a' : '#ff6a2a', streak: 2, drag: 0.9 }); }
      } else if (m.kind === 'fring') {   // a ring of fire racing out over the floor
        const e = eo(k), r = (8 + m.r1 * e) * s, a = 1 - k;
        ctx.strokeStyle = hexA('#ff8a3c', 0.9 * a); ctx.lineWidth = Math.max(1.5, s * 5 * a);
        ctx.beginPath(); ctx.ellipse(X(m.x), Y(m.y), r, r * 0.24, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = hexA('#fff2c8', 0.7 * a); ctx.lineWidth = Math.max(1, s * 1.6 * a);
        ctx.beginPath(); ctx.ellipse(X(m.x), Y(m.y), r * 0.97, r * 0.23, 0, 0, TAU); ctx.stroke();
      } else if (m.kind === 'geyser') {   // a column of fire bursting up out of the floor
        if (!m.fired) { m.fired = true; for (let j = 0; j < (m.w > 10 ? 14 : 6); j++) { const a = -Math.PI * (0.25 + Math.random() * 0.5), v = 60 + Math.random() * 110; this.particles.push({ x: m.x + (Math.random() - 0.5) * m.w, y: m.y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 220, life: 0.5 + Math.random() * 0.4, t: 0, c: ['#ffd25a', '#ff8a3c', '#ff5a1a', '#fff6c8', '#5a3a24'][j % 5], streak: j % 5 === 4 ? 0 : 3, cube: j % 5 === 4 ? 2 : 0, spin: 1, drag: 0.92 }); } if (m.w > 10) sfx('burn'); }
        const up = eo(Math.min(1, k / 0.22)), a = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55);
        const x = X(m.x), y = Y(m.y), H = m.h * s * up * (0.92 + 0.08 * Math.sin(t / 40 + m.x)), W = m.w * s;
        glow(x, y - H * 0.4, W * 3.2, '#ff5a1a', 0.5 * a);
        if (this.pixelFx) continue;
        const col = (w, c0, c1) => { const g = ctx.createLinearGradient(0, y, 0, y - H); g.addColorStop(0, c0); g.addColorStop(1, c1);
          ctx.beginPath(); ctx.moveTo(x - W * w, y); ctx.quadraticCurveTo(x - W * w * 0.9, y - H * 0.55, x + Math.sin(t / 50 + m.x) * W * 0.3, y - H);
          ctx.quadraticCurveTo(x + W * w * 0.9, y - H * 0.55, x + W * w, y); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); };
        col(1.25, `rgba(255,60,20,${0.6 * a})`, 'rgba(200,30,10,0)');
        col(0.8, `rgba(255,150,40,${0.9 * a})`, 'rgba(255,80,20,0)');
        col(0.38, `rgba(255,245,200,${a})`, 'rgba(255,190,80,0)');
        ctx.fillStyle = hexA('#fff2c8', 0.8 * a); ctx.beginPath(); ctx.ellipse(x, y, W * 1.3, W * 0.35, 0, 0, TAU); ctx.fill();
        if (Math.random() < 0.6 * a) this.particles.push({ x: m.x + (Math.random() - 0.5) * m.w, y: m.y - Math.random() * m.h * up, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 60, g: 0, life: 0.4, t: 0, c: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', fade: true });
      } else if (m.kind === 'burn') {   // fire left burning on the floor, dying down
        const left = 1 - k;
        glow(X(m.x), Y(m.y - 6), m.w * 1.3 * s, '#ff6a2a', 0.35 * left);
        const n = Math.round((this.lowPower ? 2 : 4) * left + 0.5);
        for (let j = 0; j < n; j++) { const fx = m.x + (Math.random() - 0.5) * m.w * 2, fy = m.y + (Math.random() - 0.5) * 8; this.particles.push({ x: fx, y: fy, vx: (Math.random() - 0.5) * 8, vy: -25 - Math.random() * 35, g: -10, life: 0.35 + Math.random() * 0.35, t: 0, c: ['#ff6a2a', '#ffb347', '#ffd25a'][j % 3], blob: Math.random() < 0.35 ? 1 : 0, fade: true }); }
      }
    }
    ctx.restore();
  }

  // Champion's Combo with its PixelLab animation (anims.combo): dash in, three slashes (slashAt), lift the sword and
  // hold it up while a big electric aura charges round the blade (holdAt), a downward slash that throws a slash arc
  // twice the hero's height onto the enemy (arcAt), and the finisher lands (hit) leaving electric ripples behind.
  _comboAnim(A, ev, tgt, rc, T, home, anim) {
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    const firstE = this.actors.get(tgt[0].id);
    const reach = e => ({ x: e.x + (e.size === 'xl' ? 46 : e.size === 'l' ? 26 : 20) + (anim.dash || 0), y: e.y + 2 });
    const d0 = reach(firstE);
    this.pose(A, 'windup', T(140)); sfx('whirl');
    this.move(A, d0.x - home.x, d0.y - home.y, T(160), true);
    const st = 170, total = st + acc;
    setTimeout(() => { A.anim = { d: anim, t0: now(), speed: T(1000) / 1000, at, total: acc }; }, T(st));
    this.cam = { x: (d0.x + firstE.x) / 2 - 4, y: d0.y - 44, t0: now(), dur: T(total + 500), z: 1.1 };
    const slashes = tgt.filter(t => !t.finisher), fin = tgt.find(t => t.finisher);
    const marks = anim.slashAt || [];
    slashes.forEach((t, i) => {
      const idx = marks[Math.min(i, marks.length - 1)]; if (idx == null) return;
      setTimeout(() => {
        const e = this.actors.get(t.id);
        if (e && e !== firstE && !e.gone) { const d = reach(e); this.move(A, d.x - home.x, d.y - home.y, T(90), true); }
        sfx('slash');
      }, T(st + at[idx] - 50));
      setTimeout(() => {
        const e = this.actors.get(t.id) || firstE, c = this._hitPoint(e);
        this.crossHit(c.x, c.y, CROSS_ANGLES[i % CROSS_ANGLES.length], T);
        this.impact(ev, tgt, 'xslash', rc, [t], true);
        this.shake = Math.max(this.shake, 3); this.shakeT = now(); this.freezeUntil = now() + 70;
      }, T(st + at[idx] + 20));
    });
    // the charge: aura round the blade, the screen dims, lightning drops from the sky into the sword
    const [h0, h1] = anim.holdAt || [0, 0];
    // he hops back to charge (as the rise frames step back), then lunges in again with the downward slash
    const backAt = Math.max(0, h0 - 5), inAt = Math.max(h1 + 1, (anim.arcAt != null ? anim.arcAt : anim.hit) - 1);
    setTimeout(() => this.move(A, d0.x + 24 - home.x, d0.y - home.y, T(260), true), T(st + at[backAt]));
    setTimeout(() => { this.move(A, d0.x - 4 - home.x, d0.y - home.y, T(90), true); sfx('whirl'); }, T(st + at[inAt]));
    const holdMs = at[h1] + anim.timeline[h1][1] - at[h0];
    setTimeout(() => {
      this.zaps.push({ follow: A, t0: performance.now(), until: performance.now() + T(holdMs + 120), len: anim.blade || 26 });
      this.darkFor(T(holdMs + 500));
      sfx('charge');
      [0, 0.45, 0.8].forEach((f, j) => setTimeout(() => {
        const tip = this._tipAt(A); if (!tip) return;
        this.arcs.push({ bolt: this._zig({ x: tip.x + (Math.random() - 0.5) * 30, y: -8 }, tip, 10, 12), color: '#bff6ff', w: 2 + (j === 2 ? 1 : 0), t: 0, life: 0.22 });
        this.glows.push({ x: tip.x, y: tip.y, r: 30 + j * 10, color: '#9fe8ff', t: 0, life: 0.3, a: 0.9 });
        this.flash = Math.max(this.flash || 0, 0.12 + j * 0.06); sfx('zap');
      }, T(holdMs * f)));
    }, T(st + at[h0]));
    // the giant arc: an electric oval about four times the knight's height, from above the screen down through the
    // enemy into the floor. The close-up eases out just before it so more of it fits on screen.
    const target = fin ? this.actors.get(fin.id) || firstE : firstE;
    const arcIdx = anim.arcAt != null ? anim.arcAt : anim.hit;
    setTimeout(() => { if (this.cam) this.cam.dur = Math.min(this.cam.dur, now() - this.cam.t0 + T(300)); }, T(st + at[arcIdx] - 220));
    setTimeout(() => {
      const tx = (target && !target.gone ? target : firstE);
      this.bigArc(tx.x, tx.y, T);
      sfx('heavy'); sfx('zap');
    }, T(st + at[arcIdx]));
    // the finisher lands: number, flash, ripples and leftover crackle on the ground
    setTimeout(() => {
      const tx = (target && !target.gone ? target : firstE);
      if (fin) this.impact(ev, tgt, 'lightning', rc, [fin], true);
      this.shake = Math.max(this.shake, 8); this.shakeT = now(); this.flash = 0.1; this.freezeUntil = now() + 170;
      this.glows.push({ x: tx.x, y: tx.y - 30, r: 70, color: '#7fd8ff', t: 0, life: 0.45, a: 0.7, tall: true });
      this.burst(tx.x, tx.y - 18, '#bff6ff', 40, 70);
      for (let j = 0; j < 3; j++) this.ripples.push({ x: tx.x, y: tx.y + 1, t0: performance.now() + T(j * 170), life: T(800), r0: 6, r1: 44 + j * 10 });
      this.residue.push({ x: tx.x, y: tx.y, w: 46, t0: performance.now(), until: performance.now() + T(1500) });
      sfx('hitBig'); sfx('zap');
    }, T(st + at[anim.hit]));
    setTimeout(() => { A.anim = null; this._applyAfter(ev); this.move(A, 0, 0, T(260), true); }, T(total + 60));
    return T(total + 650);
  }

  // Champion's Combo: dash in, three quick slashes (the slash animation's swing, sped up), then the flaming Power
  // Strike rising finisher. Each blow lands with its own number.
  _combo(A, ev, tgt, rc, T, home) {
    const skin = A.skin || A.cls;
    const own = SP.heroAnim(skin, 'combo'); if (own) return this._comboAnim(A, ev, tgt, rc, T, home, own);
    const slash = SP.heroAnim(skin, 'slash'), power = SP.heroAnim(skin, 'power');
    const reach = e => ({ x: e.x + (e.size === 'xl' ? 46 : e.size === 'l' ? 26 : 20), y: e.y + 2 });
    const sub = (an, from, total) => {   // part of a hand-made move, squeezed into total ms
      const tl = an.timeline.slice(from), sum = tl.reduce((a, x) => a + x[1], 0), k = total ? total / sum : 1;
      const d = { ...an, timeline: tl.map(([f, ms]) => [f, ms * k]) };
      const at = []; let acc = 0; for (const [, ms] of d.timeline) { at.push(acc); acc += ms; }
      return { d, at, total: acc };
    };
    const play = s => { A.anim = { d: s.d, t0: now(), speed: T(1000) / 1000, at: s.at, total: s.total }; };
    const firstE = this.actors.get(tgt[0].id);
    const d0 = reach(firstE);
    this.pose(A, 'windup', T(160)); sfx('whirl');
    setTimeout(() => this.move(A, d0.x - home.x, d0.y - home.y, T(150), true), T(60));
    this.cam = { x: (d0.x + firstE.x) / 2 - 6, y: d0.y - 30, t0: now(), dur: T(2600), z: 1.16 };
    const slashes = tgt.filter(t => !t.finisher), fin = tgt.find(t => t.finisher);
    let t0 = 240;
    slashes.forEach((t, i) => {
      const at = t0 + i * 300;
      setTimeout(() => {
        const e = this.actors.get(t.id);
        if (e && e !== firstE) { const d = reach(e); this.move(A, d.x - home.x, d.y - home.y, T(90), true); }
        if (slash) play(sub(slash, slash.dashFrames || 3, 270)); else this.pose(A, i % 2 ? 'swing1' : 'swing2', T(220));
        this.trails.push({ x: A.x + A.ox - 4, y: A.y + A.oy - 30 + (i - 1) * 6, r: 34, t0: now(), life: T(300), up: i === 1 });
        sfx('slash');
      }, T(at));
      setTimeout(() => { this.impact(ev, tgt, 'slash', rc, [t], true); this.shake = Math.max(this.shake, 2); this.shakeT = now(); }, T(at + 170));
    });
    let end = t0 + slashes.length * 300;
    if (fin) {
      const fAt = end + 40;
      const start = power ? Math.max(0, (power.dashAt || 2) - 2) : 0;
      const ps = power ? sub(power, start, 0) : null;
      const hitIdx = power ? Math.max(0, (power.hit || 0) - start) : 0;
      const finHit = fAt + (ps ? (ps.at[hitIdx] || ps.total * 0.7) : 300);
      setTimeout(() => {
        const e = this.actors.get(fin.id);
        if (e) { const d = reach(e); this.move(A, d.x - home.x, d.y - home.y, T(90), true); }
        if (ps) play(ps); else this.pose(A, 'windup', T(260));
        this.auras.push({ follow: A, t0: performance.now(), until: performance.now() + T(finHit - fAt) }); sfx('burn');
      }, T(fAt));
      setTimeout(() => {
        if (!ps) this.pose(A, 'swing2', T(300));
        this.trails.push({ x: A.x + A.ox - 10, y: A.y + A.oy - 26, r: 42, t0: now(), life: T(520), up: true, color: 'fire' });
        const p = { x: A.x + A.ox - 34, y: A.y + A.oy - 20 };
        for (let i = 0; i < 34; i++) { const a = -Math.PI * (0.15 + Math.random() * 0.75), v = 80 + Math.random() * 120; this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * v - 30, vy: Math.sin(a) * v, g: 140, life: 0.6 + Math.random() * 0.5, t: 0, c: ['#ff6a2a', '#ffb347', '#ffd25a', '#fff6c8'][i % 4], streak: 3 + (i % 3), drag: 0.9 }); }
        this.impact(ev, tgt, 'slash_heavy', rc, [fin], true);
        this.shake = Math.max(this.shake, 7); this.shakeT = now(); this.flash = 0.35; this.freezeUntil = now() + 140; sfx('heavy');
      }, T(finHit));
      end = finHit + 320;
    }
    setTimeout(() => { A.anim = null; this._applyAfter(ev); this.move(A, 0, 0, T(260), true); }, T(end));
    return T(end + 500);
  }

  // what a hero's gear and buffs did when an enemy hit them
  _react(h, E) {
    const p = this.pos(h.id); if (!p) return;
    if (h.shielded) { this.number(p.x, p.y - 46, 'Shielded!', '#fff6c8', 1); this.glows.push({ x: p.x, y: p.y - 20, r: 30, color: '#fff6c8', t: 0, life: 0.5, a: 0.8, ring: true }); }
    if (h.potion) setTimeout(() => { this.column(p.x, p.y, '#ff8a9a'); this.number(p.x + 8, p.y - 58, 'Potion +' + h.potion, '#8dff9e', 0.9); sfx('heal'); }, 280);
    if (h.plume) setTimeout(() => { this.glows.push({ x: p.x, y: p.y - 20, r: 60, color: '#ff9a3c', t: 0, life: 0.9, a: 0.9 }); this.burst(p.x, p.y - 20, '#ffb347', 36, 50); this.number(p.x, p.y - 60, 'Phoenix Plume!', '#ffb347', 1); this.pose(p.a, 'victory', 600); sfx('heal'); }, 300);
    if (h.thorns || h.chilled) {
      const e = this.actors.get(h.attacker) || E;
      setTimeout(() => {
        const q = e && this.pos(e.id); if (!q) return;
        if (h.thorns) { this.arc(q.x, q.y - 18, 14, '#ffe08a'); this.burst(q.x, q.y - 18, '#ffe08a', 12, 30); this.number(q.x, q.y - 40, h.thorns, '#ffe08a', 1, true); this.flashActor(e); }
        if (h.chilled) { this.number(q.x, q.y - 54, 'Chilled', '#8fe3ff', 0.8); this.burst(q.x, q.y - 16, '#bff6ff', 12, 24); }
      }, 160);
    }
  }

  _whiffAnim(ev, T) {
    const A = this.actors.get(ev.actor); if (!A) { this._applyAfter(ev); return 0; }
    const tg = ev.targets[0] && this.actors.get(ev.targets[0].id);
    if (ev.act === 'rise') {
      this.pose(A, 'hurt', T(500)); this.number(A.x, A.y - 46, 'Stumbled', '#c8b8e8', 0.9); sfx('wrong');
      this._applyAfter(ev); return T(700);
    }
    if (ev.act === 'defend') {
      this.pose(A, 'hurt', T(400)); this.number(A.x, A.y - 46, 'Fumbled!', '#c8b8e8', 0.95); sfx('wrong');
      this._applyAfter(ev); return T(700);
    }
    this.pose(A, 'windup', T(180));
    if (tg) setTimeout(() => { this.move(A, (tg.x - A.x) * 0.35, (tg.y - A.y) * 0.3, T(160), true); }, T(160));
    setTimeout(() => {
      this.pose(A, 'swing2', T(260));
      this.arc(A.x - 22, A.y - 22, 14, '#c8c0e0', true);
      const p = tg ? { x: tg.x, y: tg.y } : { x: A.x - 40, y: A.y };
      this.number(p.x, p.y - 46, 'MISS', '#d8d0f0', 1.2, true);
      for (let i = 0; i < 6; i++) this.particles.push({ x: A.x - 20, y: A.y - 20, vx: -10 - Math.random() * 20, vy: -6 - Math.random() * 10, g: 30, life: 0.4, t: 0, c: '#b8b0d0' });
      sfx('whoosh');
    }, T(340));
    setTimeout(() => this.move(A, 0, 0, T(220), true), T(620));
    setTimeout(() => this._applyAfter(ev), T(500));
    return T(900);
  }

  _enemyAnim(ev, T) {
    const E = this.actors.get(ev.actor); if (!E) { this._applyAfter(ev); return 0; }
    if (ev.act === 'frozen') {
      const stun = ev.fx === 'stun', col = stun ? '#ffe08a' : '#dff8ff';
      this.burst(E.x, E.y - 16, col, 24, 30); this.number(E.x, E.y - 40, stun ? 'Stunned' : 'Frozen', col, 1); sfx(stun ? 'twinkle' : 'ice');
      this._applyAfter(ev); return T(600);
    }
    const type = ev.type;
    if (ev.warn) this.onBanner(ev.warn, 'warn');
    if (type === 'attack') {
      const hits = ev.targets;
      const firstT = hits[0] && this.actors.get(hits[0].id);
      this.pose(E, 'windup', T(260));
      this.glows.push({ x: E.x, y: E.y - 20, r: 34, color: '#ff5a4a', t: 0, life: 0.4, a: 0.4 });
      sfx('enemyWind');
      const reach = E.size === 'xl' ? 0 : 1;
      if (firstT && reach) setTimeout(() => this.move(E, firstT.x - E.x - (E.size === 'l' ? 30 : 22), firstT.y - E.y, T(160), true), T(240));
      if (E.size === 'xl') setTimeout(() => this.move(E, 18, 0, T(140), true), T(240));
      hits.forEach((h, i) => {
        setTimeout(() => {
          this.pose(E, 'attack', T(200));
          const p = this.pos(h.id); if (!p) return;
          this.burst(p.x, p.y - 18, h.blocked && !h.dmg ? '#8fd0ff' : '#ff6a5a', 18, 30);
          this.arc(p.x - 2, p.y - 20, 14, '#ffd0c8', true);
          if (h.blocked) { this.shield(p.x, p.y, '#7fc8ff'); this.number(p.x - 10, p.y - 30, 'Blocked ' + h.blocked, '#8fd0ff', 0.8); sfx('block'); }
          if (h.dmg > 0) { this.flashActor(p.a); this.pose(p.a, 'hurt', 300); this.knock(p.a, 4); this.number(p.x, p.y - 42, h.dmg, '#ff7a6a', h.dmg >= 12 ? 1.35 : 1.1, true); sfx('hurt'); }
          if (h.status) for (const s of h.status) this.number(p.x, p.y - 54, STATUS_ABBR[s] || s, STATUS_COL[s] || '#fff', 0.78);
          this._react(h, E);
          if (h.dmg >= 12) { this.shake = 3; this.shakeT = now(); }
          this.freezeUntil = now() + 60;
          this._applyAfter(ev, [h.id, E.id]);
          if (i === hits.length - 1) this._applyAfter(ev);
        }, T(420 + i * 200));
      });
      setTimeout(() => this.move(E, 0, 0, T(240), true), T(560 + (hits.length - 1) * 200));
      if (!hits.length) this._applyAfter(ev);
      return T(Math.max(ev.dur || 1100, 900 + (hits.length - 1) * 200));
    }
    if (type === 'attackAll' && E.kind === 'minotaur' && ev.act === 'breath' && SP.enemySeqLen('minotaur', 'slam')) return this._minoSlam(E, ev, T);
    if (type === 'attackAll' && E.kind === 'minotaur' && ev.act === 'tailstorm' && SP.enemySeqLen('minotaur', 'run')) return this._minoCharge(E, ev, T);
    if (type === 'attackAll') {
      const big = E.kind === 'wyrm' || E.kind === 'minotaur' || E.kind === 'voidmaw';
      this.pose(E, big ? 'roar' : 'windup', T(500));
      sfx(big ? 'roar' : 'enemyWind');
      this.glows.push({ x: E.x, y: E.y - 30, r: 80, color: ev.shards ? '#ff7a3a' : '#ffc24a', t: 0, life: 0.8, a: 0.55 });
      setTimeout(() => {
        this.pose(E, 'attack', T(400));
        for (const h of ev.targets) {
          const p = this.pos(h.id); if (!p || h.shatter) continue;
          for (let k = 0; k < 4; k++) this.projectile({ x: E.x + 30, y: E.y - 40 + k * 4 }, { x: p.x + (k - 2) * 3, y: p.y - 18 }, 'crystal', 220 + k * 40);
        }
      }, T(420));
      setTimeout(() => {
        for (const h of ev.targets) {
          const p = this.pos(h.id); if (!p) continue;
          if (h.shatter) { this.burst(p.x, p.y - 10, '#ffc24a', 40, 44); continue; }
          if (h.dodged) { this.move(p.a, 10, -10, T(120), true); setTimeout(() => this.move(p.a, 0, 0, T(200), true), T(180)); this.number(p.x, p.y - 46, 'Dodged!', '#9fffe0', 1.1, true); this.arc(p.x - 12, p.y - 18, 12, '#9fffe0'); continue; }
          this.burst(p.x, p.y - 18, '#ffc24a', 16, 28);
          if (h.blocked) this.shield(p.x, p.y, '#7fc8ff');
          if (h.dmg > 0) { this.flashActor(p.a); this.pose(p.a, 'hurt', 320); this.knock(p.a, 4); this.number(p.x, p.y - 42, h.dmg, '#ff7a6a', 1.2, true); }
          this._react(h, E);
        }
        this.shake = ev.shards ? 6 : 4; this.shakeT = now(); this.flash = ev.shards ? 0.5 : 0.2;
        sfx('hitBig');
        this._applyAfter(ev);
      }, T(720));
      return T(1250);
    }
    if (type === 'block' || type === 'charge') {
      this.pose(E, type === 'charge' ? (E.kind === 'sentinel' ? 'windup' : 'roar') : 'idle1', T(600));
      this.shield(E.x, E.y, type === 'charge' ? '#ff6a4a' : '#9fb6d8', E.size);
      if (type === 'charge') { this.glows.push({ x: E.x, y: E.y - 24, r: 70, color: '#ff4a2a', t: 0, life: 1, a: 0.6 }); sfx('charge'); }
      else sfx('block');
      const b = ev.targets.find(t => t.block);
      if (b) this.number(E.x, E.y - (E.size === 'xl' ? 70 : 44), '+' + b.block + ' block', '#b8c8e0', 0.9);
      setTimeout(() => this._applyAfter(ev), T(300));
      return T(800);
    }
    if (type === 'debuff') {
      this.pose(E, 'attack', T(400));
      const h = ev.targets[0]; const p = h && this.pos(h.id);
      if (p) { this.projectile({ x: E.x + 12, y: E.y - 26 }, { x: p.x, y: p.y - 18 }, 'hex', T(300)); setTimeout(() => { this.cloud(p.x, p.y - 16, '#b46bff'); for (const s of h.status || []) this.number(p.x, p.y - 46, STATUS_ABBR[s] || s, STATUS_COL[s], 0.9); this._applyAfter(ev); }, T(330)); }
      else this._applyAfter(ev);
      sfx('hex');
      return T(850);
    }
    if (type === 'heal') {
      this.pose(E, 'attack', T(400));
      const h = ev.targets[0]; const p = h && this.pos(h.id);
      if (p) setTimeout(() => { this.column(p.x, p.y, '#b46bff'); this.number(p.x, p.y - 40, '+' + h.heal, '#d0a8ff', 1); this._applyAfter(ev); }, T(300));
      else this._applyAfter(ev);
      sfx('heal');
      return T(800);
    }
    if (type === 'summon') {
      this.pose(E, 'roar', T(800)); sfx('roar');
      this.shake = 5; this.shakeT = now(); this.flash = 0.3;
      setTimeout(() => {
        this.onSpawn && this.onSpawn(ev);
        for (const t of ev.targets) { const p = this.pos(t.id); if (p) { this.burst(p.x, p.y - 10, '#ffc24a', 40, 30); this.glows.push({ x: p.x, y: p.y - 12, r: 50, color: '#ffc24a', t: 0, life: 0.7, a: 0.8 }); } }
        this._applyAfter(ev);
      }, T(500));
      return T(1100);
    }
    this._applyAfter(ev);
    return T(500);
  }

  // ------------------------------------------------------------ effect helpers
  // ---- The Minotaur's hand-animated attacks ------------------------------------------------------------
  // a hero takes one of his blows: numbers, flash, knock-back (a small hop up), sparks; or dodges (quick-time)
  _minoHit(h, ev, E, opts = {}) {
    const p = this.pos(h.id); if (!p) return;
    if (h.dodged) { this.number(p.x, p.y - 46, 'Dodged!', '#9fffe0', 1.1, true); this.arc(p.x - 12, p.y - 18, 12, '#9fffe0'); return; }
    if (h.blocked) { this.shield(p.x, p.y, '#7fc8ff'); this.number(p.x - 10, p.y - 30, 'Blocked ' + h.blocked, '#8fd0ff', 0.8); }
    if (h.dmg > 0) {
      this.flashActor(p.a); this.pose(p.a, 'hurt', 360);
      this.move(p.a, opts.dx || 0, -(opts.up || 10), 110, true); setTimeout(() => this.move(p.a, 0, 0, 220, true), 120);
      this.number(p.x, p.y - 42, h.dmg, '#ff7a6a', h.dmg >= 10 ? 1.35 : 1.2, true); sfx('hurt');
    }
    this.burst(p.x, p.y - 16, opts.color || '#c8a070', 18, 40);
    this._react(h, E);
    this.shake = Math.max(this.shake, opts.shake || 5); this.shakeT = now(); this.freezeUntil = now() + 50;
    this._applyAfter(ev, [h.id, E.id]);
  }
  // a jagged crack in the floor from (x0,y0) to (x1,y1), growing over grow ms, with a couple of side branches
  _crack(x0, y0, x1, y1, grow, life) {
    const pts = [[x0, y0]]; const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.round(len / 5));
    for (let i = 1; i < n; i++) { const k = i / n; pts.push([Math.round(x0 + (x1 - x0) * k + (Math.random() - 0.5) * 3), Math.round(y0 + (y1 - y0) * k + (i % 2 ? 1 : -1) * (1 + Math.random() * 3))]); }   // zig-zag
    pts.push([x1, y1]);
    const branches = [];
    for (let b = 0; b < 3; b++) {
      const at = 2 + Math.floor(Math.random() * (pts.length - 4)); const [bx, by] = pts[at]; const dir = Math.random() < 0.5 ? -1 : 1;
      const bl = 4 + Math.floor(Math.random() * 6); const bp = [[bx, by]];
      for (let j = 1; j <= bl; j++) bp.push([bx + j * 2, by + dir * j + Math.round((Math.random() - 0.5) * 2)]);
      branches.push({ at: at / pts.length, pts: bp });
    }
    const rubble = pts.filter((_, i) => i % 3 === 1).map(([x, y]) => [x + Math.round((Math.random() - 0.5) * 4), y + (Math.random() < 0.5 ? -2 : 2), Math.random() < 0.5 ? 2 : 1]);
    this.cracks.push({ pts, branches, rubble, t0: now(), grow, life });
  }
  drawCracks(n, t) {
    const line = (pts, upto, col, dy, w = 1, every = 1) => {
      n.fillStyle = col;
      for (let i = 1; i < pts.length && i <= upto; i++) {
        if (i % every) continue;
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
        for (let s = 0; s <= steps; s++) n.fillRect(Math.round(ax + (bx - ax) * s / steps), Math.round(ay + (by - ay) * s / steps) + dy, w, w);
      }
    };
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i]; const el = t - c.t0;
      if (el > c.life) { this.cracks.splice(i, 1); continue; }
      const g = Math.min(1, el / c.grow), upto = Math.ceil(g * (c.pts.length - 1));
      n.globalAlpha = el > c.life - 500 ? Math.max(0, (c.life - el) / 500) : 1;
      line(c.pts, upto, '#3a2a22', -1, 1); line(c.pts, upto, '#0a0503', 0, 2);   // a broken lip, then the deep dark fissure
      line(c.pts, upto, '#ff7a2a', 0, 1, 2);                                        // molten light deep inside, in places
      for (const b of c.branches) if (g >= b.at) { line(b.pts, b.pts.length, '#0a0503', 0, 1); }
      n.fillStyle = '#5a463a';
      for (const [x, y, sz] of c.rubble) if (upto >= 2) n.fillRect(x, y, sz, sz);
      n.globalAlpha = 1;
    }
  }
  // an earth spike bursts out of the floor at (x, y): rises, holds, sinks back
  _spike(x, y, scale, hold = 300) { this.spikes.push({ x, y, scale, img: SPIKES[Math.floor(Math.random() * SPIKES.length)], t0: now(), rise: 120, hold, sink: 300, flip: Math.random() < 0.5 }); }
  drawSpikes(n, t) {
    this.spikes.sort((a, b) => a.y - b.y);
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i]; const el = t - s.t0;
      if (el > s.rise + s.hold + s.sink) { this.spikes.splice(i, 1); continue; }
      if (!s.img.complete || !s.img.naturalWidth) continue;
      const r = el < s.rise ? 1 - Math.pow(1 - el / s.rise, 3) : el < s.rise + s.hold ? 1 : 1 - (el - s.rise - s.hold) / s.sink;
      const w = Math.round(s.img.naturalWidth * s.scale), h = Math.round(s.img.naturalHeight * s.scale), vis = Math.max(1, Math.round(h * r));
      n.save();
      if (s.flip) { n.translate(Math.round(s.x) * 2, 0); n.scale(-1, 1); }
      n.drawImage(s.img, 0, 0, s.img.naturalWidth, s.img.naturalHeight * (vis / h), Math.round(s.x - w / 2), Math.round(s.y - vis), w, vis);   // the tip comes up first
      n.restore();
    }
  }
  // Ground Slam: fists up, he slams the floor, cracks race to each hero and earth spikes erupt along them
  _minoSlam(E, ev, T) {
    const tg = ev.targets.filter(h => !h.shatter && this.pos(h.id));
    const fx = E.x + 34, fy = E.y + 1;   // where his fists hit the floor
    this.pose(E, 'windup', T(560)); sfx('enemyWind');
    this.glows.push({ x: E.x, y: E.y - 50, r: 70, color: '#ff8a3a', t: 0, life: 0.6, a: 0.45 });
    const n = SP.enemySeqLen('minotaur', 'slam'), fms = T(70);
    setTimeout(() => { E.seq = { name: 'slam', n, ms: fms, t0: now(), until: now() + T(2600), loop: false }; }, T(560));
    const impact = T(560) + fms * 3;
    let last = impact;
    setTimeout(() => {
      sfx('hitBig'); this.shake = 9; this.shakeT = now(); this.flash = 0.3; this.freezeUntil = now() + 70;
      this.burst(fx, fy - 4, '#8a6a4a', 30, 60, 60); this.burst(fx, fy - 6, '#d0b080', 16, 46, 60);
      this.glows.push({ x: fx, y: fy - 6, r: 60, color: '#ff7a2a', t: 0, life: 0.5, a: 0.8 });
      for (let k = -2; k <= 2; k++) this._spike(fx + k * 7, fy + Math.abs(k), 0.45 - Math.abs(k) * 0.06, 180);   // a ring of small spikes around the fists
    }, impact);
    tg.forEach((h, idx) => {
      const p = this.pos(h.id);
      const ex = p.x - 6, ey = p.y + 1, dist = Math.hypot(ex - fx, ey - fy), m = Math.max(3, Math.round(dist / 20)), step = T(55);
      setTimeout(() => this._crack(fx, fy, ex, ey, step * m, T(2300)), impact + idx * T(40));
      for (let j = 1; j < m; j++) {
        const k = j / m, sx = fx + (ex - fx) * k, sy = fy + (ey - fy) * k;
        setTimeout(() => {   // spikes come up in pairs, growing as they near the hero
          this._spike(sx - 4 + (Math.random() - 0.5) * 3, sy - 1, 0.75 + 0.5 * k, 380); this._spike(sx + 5, sy + 1, 0.6 + 0.4 * k, 330);
          this.burst(sx, sy - 2, '#7a5a40', 8, 30, 60); if (j % 2) sfx('stomp');
        }, impact + idx * T(40) + j * step);
      }
      const hitAt = impact + idx * T(40) + m * step;
      if (h.dodged) setTimeout(() => { this.move(p.a, 10, -18, T(110), true); setTimeout(() => this.move(p.a, 0, 0, T(220), true), T(260)); }, hitAt - T(90));
      setTimeout(() => {   // the biggest spike bursts up right under the hero
        this._spike(ex, ey + 1, h.dodged ? 1.1 : 1.7, 560); this._spike(ex - 9, ey, 1.0, 460); this._spike(ex + 8, ey + 2, 0.9, 420);
        this.burst(ex, ey - 4, '#8a6a4a', 16, 50, 60);
        this._minoHit(h, ev, E, { up: 22, color: '#c8a070', shake: 7 });
      }, hitAt);
      last = Math.max(last, hitAt);
    });
    setTimeout(() => { E.seq = null; this._applyAfter(ev); }, last + T(520));
    return last + T(700);
  }
  // Stampede: head down, he charges through the whole party, off the right edge, and back in from the left
  _minoCharge(E, ev, T) {
    const tg = ev.targets.filter(h => !h.shatter && this.pos(h.id));
    const ys = tg.map(h => this.pos(h.id).y); const lane = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : E.y;
    const dy = Math.round(lane - E.y) + 4, n = SP.enemySeqLen('minotaur', 'run');
    this.pose(E, 'attack', T(700)); sfx('roar');
    for (let k = 0; k < 2; k++) setTimeout(() => { this.burst(E.x - 18, E.y - 2, '#8a7058', 10, 26, 40); sfx('stomp'); }, T(220 + k * 260));   // pawing the ground
    const go = T(700), out = (this.W + 90) - E.x, d1 = T(820), back = T(900);
    let dustT = null;
    setTimeout(() => {
      E.seq = { name: 'run', n, ms: T(60), t0: now(), until: now() + d1 + back + T(60), loop: true };
      this.move(E, out, dy, d1, true, true); sfx('whirl');
      let gi = 0;
      dustT = setInterval(() => {
        if (gi++ % 2 === 0) { const info = SP.enemyInfo('minotaur'); this.ghosts.push({ img: this.tinted(this.frameFor(E, true), '#ffb070'), x: Math.round(E.x + E.ox - info.ax), y: Math.round(E.y + E.oy - info.ay), t0: now(), life: 260 }); }
        this.particles.push({ x: E.x + E.ox - 22, y: E.y + E.oy - 2, vx: -20 - Math.random() * 30, vy: -10 - Math.random() * 14, g: 20, life: 0.5 + Math.random() * 0.3, t: 0, c: ['#6a5a48', '#8a7058', '#a08870'][Math.floor(Math.random() * 3)] });
      }, 30);
    }, go);
    // he reaches each hero in turn (they are hit as he passes, left to right)
    for (const h of tg) {
      const p = this.pos(h.id); const f = clamp((p.x - 26 - E.x) / out, 0, 1); const at = go + f * d1;
      if (h.dodged) setTimeout(() => { this.move(p.a, 4, -24, T(120), true); setTimeout(() => this.move(p.a, 0, 0, T(240), true), T(300)); }, at - T(140));
      setTimeout(() => { this._minoHit(h, ev, E, { up: 18, dx: 14, color: '#ffb070', shake: 7 }); if (!h.dodged) sfx('hitBig'); }, at);
    }
    // off the right edge... and back in from the left
    setTimeout(() => {
      E.tween = null; E.ox = -(E.x + 90); E.oy = dy;
      this.move(E, 0, 0, back, true, true);
    }, go + d1);
    setTimeout(() => { clearInterval(dustT); E.seq = null; this.pose(E, 'idle0', T(100)); this._applyAfter(ev); }, go + d1 + back + T(40));
    return go + d1 + back + T(300);
  }
  move(a, dx, dy, ms, absolute, linear) {
    const from = { x: a.ox, y: a.oy };
    a.tween = { from, to: { x: dx, y: dy }, t0: now(), ms: Math.max(1, ms), linear };
  }
  knock(a, dx) { a.knock = { dx, t0: now() }; }
  // enemies shudder side to side when they take damage (bigger hits shake harder)
  hitShake(a, dmg = 5) { if (a && a.type === 'enemy') a.hshake = { t0: now(), amp: Math.min(9, 4.5 + dmg / 4) }; }
  flashActor(a) { if (a) a.flashUntil = now() + 110; }
  burst(x, y, color, n = 16, speed = 30, gy = 30) {
    if (this.lowPower) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - speed * 0.3, g: gy, life: 0.35 + Math.random() * 0.45, t: 0, c: color, spark: Math.random() < 0.5 });
    }
  }
  // impact sparks for every attack: long streaks that fly well out; the knight's blows also throw tumbling cubes
  hitSparks(x, y, color, dmg = 6, cubes = false) {
    const lp = this.lowPower ? 0.5 : 1;
    const n = Math.round((22 + Math.min(26, dmg * 1.5)) * lp);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = 70 + Math.random() * 110;
      this.particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 40, g: 120, life: 0.45 + Math.random() * 0.45, t: 0,
        c: Math.random() < 0.35 ? '#ffffff' : color, streak: 3 + Math.round(Math.random() * 3), drag: 0.9 });
    }
    if (cubes) for (let i = 0; i < Math.round(12 * lp); i++) {
      const ang = -Math.PI * (0.1 + Math.random() * 0.8), v = 60 + Math.random() * 90;   // mostly upward and out
      this.particles.push({ x: x + (Math.random() - 0.5) * 8, y, vx: Math.cos(ang) * v + 25, vy: Math.sin(ang) * v, g: 260, life: 0.7 + Math.random() * 0.4, t: 0,
        c: ['#e8f4ff', '#9fc8ff', '#ffffff', '#6a8cc8'][i % 4], cube: 2 + (i % 2), spin: Math.random() * 6, fade: true });
    }
  }
  column(x, y, color) {
    this.glows.push({ x, y: y - 20, r: 40, color, t: 0, life: 0.8, a: 0.6, tall: true });
    for (let i = 0; i < 18; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 16, y: y - Math.random() * 10, vx: 0, vy: -20 - Math.random() * 30, g: 0, life: 0.6 + Math.random() * 0.6, t: 0, c: color, plus: Math.random() < 0.4 });
  }
  shield(x, y, color, size) { this.glows.push({ x, y: y - 20, r: size === 'xl' ? 70 : 34, color, t: 0, life: 0.7, a: 0.5, ring: true }); }
  ring(x, y, color) { this.glows.push({ x, y, r: 10, grow: 46, color, t: 0, life: 0.6, a: 0.9, ring: true }); this.burst(x, y, color, 20, 40, 0); }
  cloud(x, y, color) { for (let i = 0; i < 16; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 12, vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 8, g: 0, life: 0.8 + Math.random() * 0.5, t: 0, c: color, blob: 1 + Math.random() * 2 }); this.glows.push({ x, y, r: 36, color, t: 0, life: 0.8, a: 0.5 }); }
  rune(x, y, color) { this.glows.push({ x, y: y - 1, r: 22, color, t: 0, life: 0.7, a: 0.7, rune: true }); }
  arc(x, y, r, color, reverse) { this.arcs.push({ x, y, r, color, t: 0, life: 0.22, reverse }); }
  bolt(a, b) {
    const pts = [a]; const n = 7;
    for (let i = 1; i < n; i++) pts.push({ x: lerp(a.x, b.x, i / n) + (Math.random() - 0.5) * 10, y: lerp(a.y, b.y, i / n) + (Math.random() - 0.5) * 10 });
    pts.push(b);
    this.arcs.push({ bolt: pts, color: '#fff27a', t: 0, life: 0.3 });
    this.glows.push({ x: b.x, y: b.y, r: 50, color: '#fff27a', t: 0, life: 0.4, a: 0.9 });
  }
  // a spell forming at a staff tip: fireball / ice crystal / arcane orb, growing with g (0..1)
  drawCharge(n, st, g, x, y, t) {
    const el = (t - st.t0) / 1000, R = 1 + g * 4;
    const disc = (r, c) => { n.fillStyle = c; const ri = Math.round(r); for (let dy = -ri; dy <= ri; dy++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy))); n.fillRect(x - w, y + dy, w * 2 + 1, 1); } };
    if (st.kind === 'fire') {
      const fl = Math.sin(el * 40) * 0.6;
      disc(R + 1.5 + fl, '#c8401a'); disc(R + 0.5 + fl, '#ff7a2a'); disc(R * 0.6, '#ffc24a'); disc(Math.max(0.5, R * 0.25), '#fff6c8');
      for (let k = 0; k < 3; k++) { const hx = x - 2 + k * 2 + Math.round(Math.sin(el * 30 + k) * 1); n.fillStyle = '#ff9a3c'; n.fillRect(hx, y - Math.round(R + 2 + (k % 2) * 2 + fl), 1, 2); }
      if (Math.random() < 0.6) this.particles.push({ x: x + (Math.random() - 0.5) * R * 2, y: y - R, vx: (Math.random() - 0.5) * 10, vy: -25 - Math.random() * 25, g: 0, life: 0.5, t: 0, c: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', fade: true });
    } else if (st.kind === 'ice') {
      // a spinning crystal: diamond core plus four spikes, shards drawn in from around it
      const sp = Math.round(R + 2), rot = Math.floor(el * 8) % 2;
      n.fillStyle = '#5ac8f0';
      for (let j = 1; j <= sp; j++) { if (rot) { n.fillRect(x - j, y, 1, 1); n.fillRect(x + j, y, 1, 1); n.fillRect(x, y - j - 1, 1, 1); n.fillRect(x, y + j + 1, 1, 1); } else { const d = Math.round(j * 0.75); n.fillRect(x - d, y - d, 1, 1); n.fillRect(x + d, y - d, 1, 1); n.fillRect(x - d, y + d, 1, 1); n.fillRect(x + d, y + d, 1, 1); } }
      disc(R * 0.8, '#9fe8ff'); disc(Math.max(0.5, R * 0.4), '#ffffff');
      if (Math.random() < 0.7) { const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 6; this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3.5, vy: -Math.sin(a) * d * 3.5, g: 0, life: 0.26, t: 0, c: Math.random() < 0.5 ? '#e8ffff' : '#8fe3ff', fade: true }); }
    } else if (st.kind === 'orb') {   // soft holy light gathering at a staff tip
      const pulse = Math.sin(el * 12) * 0.5;
      disc(R + 2 + pulse, st.color); disc(R * 0.65 + 0.5, '#ffffff');
      if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 6; this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, g: 0, life: 0.3, t: 0, c: st.color, plus: Math.random() < 0.3, fade: true }); }
    } else {   // arcane: violet orb with two motes orbiting it, sparks spiralling in
      disc(R + 1, '#4a3aa8'); disc(R, '#7a6aff'); disc(Math.max(0.5, R * 0.45), '#e0d8ff');
      for (let k = 0; k < 2; k++) { const a = el * 9 + k * Math.PI, o = R + 3; n.fillStyle = '#d8ceff'; n.fillRect(Math.round(x + Math.cos(a) * o), Math.round(y + Math.sin(a) * o * 0.6), 2, 2); }
      if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, d = 14; this.particles.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * 40 - Math.sin(a) * 25, vy: -Math.sin(a) * 40 + Math.cos(a) * 25, g: 0, life: 0.32, t: 0, c: '#b8a6ff', plus: Math.random() < 0.3, fade: true }); }
    }
  }
  // element-specific extras on impact (on top of the shared hit sparks)
  elementHit(x, y, fx) {
    if (fx === 'proj_fire') {
      this.glows.push({ x, y, r: 60, color: '#ff7a2a', t: 0, life: 0.45, a: 1 });
      this.glows.push({ x, y, r: 16, grow: 30, color: '#ffb347', t: 0, life: 0.35, a: 0.9, ring: true });
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: -40, life: 0.6 + Math.random() * 0.5, t: 0, c: ['#ff6a2a', '#ffb347', '#ffd25a', '#fff6c8'][i % 4], blob: Math.random() < 0.4 ? 1 : 0, fade: true }); }
      this.shake = Math.max(this.shake, 3); this.shakeT = now();
    } else if (fx === 'proj_ice') {
      this.glows.push({ x, y, r: 12, grow: 34, color: '#bff6ff', t: 0, life: 0.45, a: 1, ring: true });
      this.glows.push({ x, y, r: 40, color: '#8fe3ff', t: 0, life: 0.4, a: 0.8 });
      for (let i = 0; i < 16; i++) { const a = -Math.PI * Math.random(), v = 50 + Math.random() * 80; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 240, life: 0.6 + Math.random() * 0.3, t: 0, c: ['#ffffff', '#bff6ff', '#5ac8f0'][i % 3], cube: 2, spin: Math.random() * 6, fade: true }); }
      for (let i = 0; i < 10; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 24, vx: 0, vy: -6, g: 0, life: 0.5 + Math.random() * 0.3, t: 0, c: '#e8ffff', plus: true, fade: true });
    } else if (fx === 'proj_arcane') {
      this.glows.push({ x, y, r: 10, grow: 30, color: '#a08aff', t: 0, life: 0.4, a: 1, ring: true });
      this.glows.push({ x, y, r: 44, color: '#7a6aff', t: 0, life: 0.4, a: 0.85 });
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, v = 60; this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 0.45, t: 0, c: i % 2 ? '#e0d8ff' : '#9a8aff', plus: i % 3 === 0, drag: 0.85, fade: true }); }
    }
  }
  // yellow lightning from the top of the screen onto an enemy (cleric smite)
  skyStrike(e) {
    const top = { x: e.x + (Math.random() - 0.5) * 30, y: -6 }, hit = { x: e.x, y: e.y - 6 };
    const zig = (a, b, n, j) => { const pts = [a]; for (let i = 1; i < n; i++) pts.push({ x: lerp(a.x, b.x, i / n) + (Math.random() - 0.5) * j, y: lerp(a.y, b.y, i / n) + (Math.random() - 0.5) * 4 }); pts.push(b); return pts; };
    const main = zig(top, hit, 12, 16);
    this.arcs.push({ bolt: main, color: '#ffe23a', w: 3, t: 0, life: 0.32 });
    setTimeout(() => this.arcs.push({ bolt: zig(top, hit, 12, 18), color: '#fff27a', w: 2, t: 0, life: 0.22 }), 70);
    for (let b = 0; b < 2; b++) {   // forks
      const from = main[3 + b * 4] || main[4];
      this.arcs.push({ bolt: zig(from, { x: from.x + (b ? 18 : -18), y: from.y + 22 }, 4, 8), color: '#ffd23a', w: 1, t: 0, life: 0.25 });
    }
    this.glows.push({ x: hit.x, y: hit.y - 20, r: 56, color: '#ffe46a', t: 0, life: 0.3, a: 0.9, tall: true });
    this.glows.push({ x: hit.x, y: hit.y, r: 26, color: '#fff6c0', t: 0, life: 0.25, a: 0.9, ring: true, grow: 18 });
    this.burst(hit.x, hit.y - 4, '#ffe23a', 26, 46);
    this.flash = Math.max(this.flash || 0, 0.28);
    this.shake = Math.max(this.shake, 4); this.shakeT = now();
    sfx('zap');
  }
  projectile(from, to, kind, ms) {
    this.projectiles.push({ from, to, kind, t0: now(), ms: Math.max(60, ms), arc: kind === 'proj_arrow' ? -10 : kind === 'crystal' ? -6 : 0 });
  }
  number(x, y, text, color, size = 1, pop) { this.numbers.push({ x, y, text: String(text), color, size, t: 0, life: 1.1, pop }); }

  // ------------------------------------------------------------ targeting
  hitTest(cssX, cssY) {
    const x = cssX * this.dpr / this.s, y = cssY * this.dpr / this.s;
    let best = null, bd = 1e9;
    for (const a of this.actors.values()) {
      if (a.gone) continue;
      const hgt = a.type === 'hero' ? 46 : a.size === 'xl' ? 80 : a.size === 'l' ? 60 : a.kind === 'slime' ? 22 : 40;
      const wid = a.type === 'hero' ? 14 : a.size === 'xl' ? 60 : a.size === 'l' ? 22 : 16;
      if (x > a.x - wid && x < a.x + wid && y > a.y - hgt && y < a.y + 4) {
        const d = Math.abs(x - a.x) + Math.abs(y - (a.y - hgt / 2)) * 0.5;
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }
  cssPos(id, dy = 0) { const a = this.actors.get(id); if (!a) return null; return { x: (a.x + a.ox) * this.s / this.dpr, y: (a.y + a.oy + dy) * this.s / this.dpr }; }

  // ------------------------------------------------------------ drawing
  frameFor(a, white) {
    const t = now();
    let p = a.pose && t < a.poseUntil ? a.pose : null;
    if (a.type === 'hero') {
      const an = this._animAt(a, t); if (an) return white ? an.wh : an.fr;
      if (!p) p = a.downed ? 'down' : (this.victory && !a.anim ? 'victory' : 'idle' + Math.floor(((t + a.phase) / 260) % 4));
      if (a.downed && p !== 'hurt') p = 'down';
      return white ? SP.heroWhite(a.skin || a.cls, a.variant, p) : SP.heroFrame(a.skin || a.cls, a.variant, p);
    }
    if (!p && a.seq) {   // a hand-animated move (slam, run): plays once and holds the last frame, or loops
      if (t >= a.seq.until) a.seq = null;
      else { const i = Math.max(0, Math.floor((t - a.seq.t0) / a.seq.ms)); p = a.seq.name + (a.seq.loop ? i % a.seq.n : Math.min(i, a.seq.n - 1)); }
    }
    if (!p) p = 'idle' + Math.floor(((t + a.phase) / (a.kind === 'slime' ? 200 : 280)) % 4);
    if (a.intent && a.intent.type === 'charge' && !p.startsWith('hurt') && a.kind === 'sentinel') p = 'charge';
    return SP.enemyFrame(a.kind, p, white);
  }

  _raf() {
    requestAnimationFrame(this._raf);
    if (!this.W || document.hidden) return;
    const t = now();
    const dt = Math.min(0.05, (t - (this.lastT || t)) / 1000); this.lastT = t;
    // adaptive quality
    this.frameTimes.push(dt); if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (!this.lowPower && this.frameTimes.length === 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / 90;
      if (avg > 0.034) { this.lowPower = true; this.onLowPower && this.onLowPower(); }
    }
    const frozen = t < this.freezeUntil;
    const sdt = frozen ? 0 : dt * (this.slowmo || 1);
    this.draw(t, sdt);
  }

  draw(t, dt) {
    const ctx = this.ctx, n = this.nctx, s = this.s, W = this.W, H = this.H;
    const time = (t - this.t0) / 1000;
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      const k = Math.max(0, 1 - (t - this.shakeT) / 320);
      if (k <= 0) this.shake = 0;
      sx = Math.round((Math.random() - 0.5) * this.shake * k) * s; sy = Math.round((Math.random() - 0.5) * this.shake * k) * s;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07050c'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    ctx.drawImage(this.bgUp, sx, sy);
    const dk = this._darkNow(t);   // legendary skills: the background (not the fighters or the effects) dims
    if (dk) { ctx.fillStyle = `rgba(4,5,18,${dk})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }

    // ---- native dynamic layer
    n.clearRect(0, 0, W, H);
    n.imageSmoothingEnabled = false;
    // torches
    for (const tc of this.torches) {
      const f = Math.floor(time * 10 + tc.x) % 4;
      const hgt = [5, 6, 5, 7][f], wob = [0, 1, 0, -1][f];
      n.fillStyle = '#ff7a2a'; n.fillRect(tc.x - 2, tc.y - hgt + 3, 4, hgt - 1);
      n.fillStyle = '#ffc24a'; n.fillRect(tc.x - 1 + (wob > 0 ? 1 : 0), tc.y - hgt + 2, 2, hgt - 2);
      n.fillStyle = '#fff6c8'; n.fillRect(tc.x - 1 + wob * 0.5, tc.y - 1, 2, 2);
      n.fillStyle = '#ffd25a'; n.fillRect(tc.x + wob, tc.y - hgt, 1, 2);
    }
    // crystal glints
    for (const c of this.crystals) {
      const g = (Math.sin(time * 2 + c.x) + 1) / 2;
      if (g > 0.92) { n.fillStyle = '#ffffff'; n.fillRect(Math.round(c.x - 1), Math.round(c.y - c.size * 0.4), 1, 1); }
    }
    // room props
    for (const p of this.props) this.drawProp(n, p, time);
    // raid: the other teams fight in the background
    if (this.raid && this.raid.allies && this.raid.allies.length) {
      const al = this.raid.allies;
      const ft = this.floorTop;
      const cols = Math.min(8, al.length);
      n.save();
      al.forEach((h, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const x = Math.round(this.stage.x + this.stage.w * (0.5 + 0.44 * (cols === 1 ? 0.5 : col / (cols - 1))) + (row % 2) * 9);
        const y = Math.round(ft + 4 + row * 10);
        const ph = (time * 1000 + i * 977) % 3200;
        const pose = h.downed ? 'down' : ph < 260 ? 'windup' : ph < 520 ? 'swing1' : 'idle' + Math.floor((time * 4 + i) % 4);
        const fr = SP.heroFrame(h.skin || h.cls, h.variant, pose);
        n.globalAlpha = 0.32;
        n.drawImage(fr, x - SP.ANCHOR_X, y - SP.ANCHOR_Y);
        n.globalAlpha = 0.5; n.fillStyle = h.color; n.fillRect(x - 3, y + 1, 6, 1);
      });
      n.restore();
      n.globalAlpha = 1;
    }
    this.drawCracks(n, t);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {   // after-images (the Minotaur's charge)
      const g = this.ghosts[i]; const k = (t - g.t0) / g.life;
      if (k >= 1) { this.ghosts.splice(i, 1); continue; }
      n.globalAlpha = 0.38 * (1 - k); n.drawImage(g.img, g.x, g.y); n.globalAlpha = 1;
    }
    // actors sorted by depth
    const list = [...this.actors.values()].filter(a => !a.gone).sort((a, b) => (a.y + (a.type === 'enemy' ? -0.5 : 0)) - (b.y));
    for (const a of list) {
      if (a.tween) {
        const k = clamp((t - a.tween.t0) / a.tween.ms, 0, 1); const e = a.tween.linear ? k : ease(k);
        a.ox = lerp(a.tween.from.x, a.tween.to.x, e); a.oy = lerp(a.tween.from.y, a.tween.to.y, e);
        if (k >= 1) a.tween = null;
      }
      let kx = 0;
      if (a.knock) { const k = (t - a.knock.t0) / 220; if (k > 1) a.knock = null; else kx = a.knock.dx * Math.sin(k * Math.PI); }
      if (a.hshake) { const k = (t - a.hshake.t0) / (560 / (this.slowmo || 1)); if (k > 1) a.hshake = null; else kx += Math.round(a.hshake.amp * Math.pow(1 - k, 0.7) * Math.sin(k * Math.PI * 14)); }   // 7 side-to-side wobbles over ~0.56 s
      const fr = this.frameFor(a);
      const anf = a.type === 'hero' ? this._animAt(a, t) : null;
      const info = a.type === 'enemy' ? SP.enemyInfo(a.kind) : anf ? { ax: anf.ax, ay: anf.ay } : { ax: SP.ANCHOR_X, ay: SP.ANCHOR_Y };
      let x = Math.round(a.x + a.ox + kx - info.ax), y = Math.round(a.y + a.oy - info.ay);
      if (a.kind === 'shard') y += Math.round(Math.sin(time * 2 + a.phase) * 2);
      // shadow
      n.globalAlpha = 0.45 * (a.alpha == null ? 1 : a.alpha);
      n.fillStyle = '#05030a';
      const shw = a.type === 'hero' ? 9 : a.size === 'xl' ? 50 : a.size === 'l' ? 18 : 12;
      n.beginPath(); n.ellipse(Math.round(a.x + a.ox + kx), Math.round(a.y + a.oy) - 1, shw, Math.max(2, shw * 0.28), 0, 0, Math.PI * 2); n.fill();
      let alpha = a.alpha == null ? 1 : a.alpha;
      if (a.spawnAt) { alpha = clamp((t - a.spawnAt) / 500, 0, 1); a.alpha = alpha; if (alpha >= 1) a.spawnAt = 0; }
      if (a.dying) alpha = Math.max(0, 1 - (t - a.dying) / 300);
      if (a.type === 'hero' && !a.connected && !this.victory) alpha *= 0.55;   // everyone celebrates at full colour
      n.globalAlpha = alpha;
      const spun = a.spin && t < a.spin.t0 + a.spin.dur;
      if (spun) {   // Earthshatter's dive: the sprite (and its outline) turns over round the middle of the body
        const k = Math.max(0, (t - a.spin.t0) / a.spin.dur), cxp = Math.round(a.x + a.ox + kx), cyp = Math.round(a.y + a.oy - 24);
        n.save(); n.translate(cxp, cyp); n.rotate(-k * a.spin.turns * Math.PI * 2); n.translate(-cxp, -cyp);
      }
      // my hero: cyan rim glow (drawn as offset white silhouettes)
      if (a.id === this.myId || a.id === this.allyTarget) {
        const wf = this.frameFor(a, true);
        n.globalAlpha = alpha * (0.55 + 0.25 * Math.sin(time * 4));
        const tint = this.tinted(wf, a.id === this.allyTarget ? '#9dffb0' : '#6fe0ff');
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) n.drawImage(tint, x + ox, y + oy);
        n.globalAlpha = alpha;
      }
      n.drawImage(fr, x, y);
      if (t < a.flashUntil) { n.globalAlpha = 0.85; n.drawImage(this.frameFor(a, true), x, y); }
      // frozen overlay
      if (a.st && a.st.freeze) { n.globalAlpha = 0.45; n.drawImage(this.tinted(this.frameFor(a, true), '#bff6ff'), x, y); }
      if (spun) n.restore();
      n.globalAlpha = 1;
    }
    this.drawSpikes(n, t);
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt; if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; if (p.drag) { const d = Math.pow(p.drag, dt * 10); p.vx *= d; p.vy *= d; } p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      n.globalAlpha = p.fade ? k : Math.min(1, k * 1.6);
      n.fillStyle = p.c;
      if (p.streak) {   // a short line along the direction of travel, thicker while fresh
        const sp = Math.hypot(p.vx, p.vy) || 1, L = p.streak * Math.min(1, sp / 60);
        const w = k > 0.5 ? 2 : 1;
        for (let j = 0; j <= L; j++) n.fillRect(Math.round(p.x - p.vx / sp * j), Math.round(p.y - p.vy / sp * j), w, w);
      }
      else if (p.cube) {   // tumbling cube: alternates square / diamond as it spins
        const c = p.cube, ph = Math.floor((p.t * 14 + p.spin)) % 2, px = Math.round(p.x), py = Math.round(p.y);
        if (ph) { n.fillRect(px - 1, py - 1, c + 1, c + 1); n.fillStyle = '#2a3a5a'; n.fillRect(px - 1, py + c - 1, c + 1, 1); }
        else { n.fillRect(px, py - 1, c - 1, c + 1); n.fillRect(px - 1, py, c + 1, c - 1); }
      }
      else if (p.plus) { n.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1); n.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3); }
      else if (p.blob) { const r = Math.round(p.blob + (1 - k) * 2); n.fillRect(Math.round(p.x) - r, Math.round(p.y) - r, r * 2, r * 2); }
      else n.fillRect(Math.round(p.x), Math.round(p.y), p.spark && k > 0.5 ? 2 : 1, 1);
    }
    n.globalAlpha = 1;
    if (this.pixelFx) this.drawPixelFx(n, t);
    for (const z of this.zaps) {   // electricity crackling round the raised blade, stronger as it charges
      if (t > z.until) continue;
      const k = Math.min(1, (t - z.t0) / (z.until - z.t0));
      const tip = this._tipAt(z.follow); if (!tip) continue;
      const L = z.len || 26;
      for (const side of [-1, 1]) {   // live current running up and down both edges of the blade
        const off = 2 + Math.random() * (2 + 3 * k);
        this.arcs.push({ bolt: this._zig({ x: tip.x + side * off, y: tip.y - 3 }, { x: tip.x + side * (off * 0.6), y: tip.y + L + 2 }, 6, 3 + 3 * k), color: Math.random() < 0.5 ? '#ffffff' : '#9fe8ff', w: 1, t: 0, life: 0.05 });
      }
      for (let j = 0; j < 2 + Math.floor(k * 4); j++) {
        if (Math.random() > 0.6 + 0.4 * k) continue;
        const along = Math.random(), sx0 = tip.x + (Math.random() - 0.5) * 2, sy0 = tip.y + along * L;
        const side = Math.random() < 0.5 ? -1 : 1, reach = 8 + Math.random() * (12 + 22 * k);
        this.arcs.push({ bolt: this._zig({ x: sx0, y: sy0 }, { x: sx0 + side * reach, y: sy0 + (Math.random() - 0.6) * reach }, 4, 5), color: Math.random() < 0.4 ? '#ffffff' : Math.random() < 0.5 ? '#bff6ff' : '#6fc8ff', w: 1, t: 0, life: 0.07 + Math.random() * 0.08 });
      }
      if (Math.random() < 0.6) this.particles.push({ x: tip.x + (Math.random() - 0.5) * 6, y: tip.y + Math.random() * L, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, g: 0, life: 0.3 + Math.random() * 0.3, t: 0, c: Math.random() < 0.5 ? '#bff6ff' : '#ffffff', plus: Math.random() < 0.3, fade: true });
    }
    for (let i = this.residue.length - 1; i >= 0; i--) {   // electric residue left on the ground after the finisher
      const r = this.residue[i];
      if (t > r.until) { this.residue.splice(i, 1); continue; }
      if (t < r.t0) continue;
      const left = 1 - (t - r.t0) / (r.until - r.t0);
      if (Math.random() < 0.15 + 0.6 * left) {
        const x0 = r.x + (Math.random() - 0.5) * r.w, y0 = r.y + (Math.random() - 0.5) * 6;
        const x1 = x0 + (Math.random() - 0.5) * 16, y1 = y0 - 4 - Math.random() * (8 + 22 * left);
        this.arcs.push({ bolt: this._zig({ x: x0, y: y0 }, { x: x1, y: y1 }, 3, 4), color: Math.random() < 0.5 ? '#bff6ff' : '#6fc8ff', w: 1, t: 0, life: 0.06 + Math.random() * 0.07 });
      }
      if (Math.random() < 0.5 * left) this.particles.push({ x: r.x + (Math.random() - 0.5) * r.w, y: r.y - Math.random() * 3, vx: (Math.random() - 0.5) * 12, vy: -10 - Math.random() * 25, g: 30, life: 0.3, t: 0, c: '#bff6ff', fade: true });
    }
    for (const au of this.auras) {   // flame licks rising from the aura
      const k = Math.min(1, (t - au.t0) / (au.until - au.t0)); if (t > au.until) continue;
      const n = 1 + Math.floor(k * 3);
      for (let j = 0; j < n; j++) { const ax = au.follow.x + au.follow.ox + (Math.random() - 0.5) * (22 + 20 * k), ay = au.follow.y + au.follow.oy - Math.random() * 10; this.particles.push({ x: ax, y: ay, vx: (Math.random() - 0.5) * 8, vy: -30 - Math.random() * 40 * (0.5 + k), g: 0, life: 0.45 + Math.random() * 0.3, t: 0, c: Math.random() < 0.5 ? '#ff8a2a' : '#ffc24a', blob: Math.random() < 0.3 ? 1 : 0, fade: true }); }
    }
    // charge stars (ranger arrow tip): grow, twinkle between + and x shapes
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const st = this.stars[i];
      if (st.done) { this.stars.splice(i, 1); continue; }
      if (st.follow) { const tp = this._tipAt(st.follow); if (tp) { st.x = tp.x; st.y = tp.y; } }
      const g = Math.min(1, (t - st.t0) / st.grow), arm = Math.round(1 + g * 5), x = Math.round(st.x), y = Math.round(st.y);
      if (st.kind !== 'star') { this.drawCharge(n, st, g, x, y, t); continue; }
      const diag = Math.floor((t - st.t0) / 90) % 2 === 1, pulse = 0.75 + 0.25 * Math.sin((t - st.t0) / 40);
      n.globalAlpha = pulse; n.fillStyle = st.color;
      for (let j = 1; j <= arm; j++) {
        if (diag) { const d = Math.round(j * 0.7); n.fillRect(x - d, y - d, 1, 1); n.fillRect(x + d, y - d, 1, 1); n.fillRect(x - d, y + d, 1, 1); n.fillRect(x + d, y + d, 1, 1); }
        else { n.fillRect(x - j, y, 1, 1); n.fillRect(x + j, y, 1, 1); n.fillRect(x, y - j, 1, 1); n.fillRect(x, y + j, 1, 1); }
      }
      n.fillStyle = '#ffffff'; n.fillRect(x - 1, y - 1, 3, 3);
      n.globalAlpha = 1;
      if (Math.random() < 0.35) this.particles.push({ x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 18, vx: 0, vy: 0, g: 0, life: 0.25, t: 0, c: st.color, plus: true, fade: true });
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const k = (t - pr.t0) / pr.ms;
      if (k >= 1) { this.projectiles.splice(i, 1); if (pr.kind === 'meteor' || pr.kind === 'star') this.burst(pr.to.x, pr.to.y, pr.kind === 'meteor' ? '#ff8a3c' : '#fff0a8', 26, 40); continue; }
      const x = lerp(pr.from.x, pr.to.x, k), y = lerp(pr.from.y, pr.to.y, k) + Math.sin(k * Math.PI) * pr.arc;
      this.drawProjectile(n, pr, x, y, k);
    }
    // arcs (slashes, bolts)
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt; if (a.t >= a.life) { this.arcs.splice(i, 1); continue; }
      const k = a.t / a.life;
      n.globalAlpha = 1 - k;
      n.fillStyle = a.color;
      if (a.bolt) {
        const w = a.w || 1;
        for (let j = 0; j < a.bolt.length - 1; j++) {
          const p0 = a.bolt[j], p1 = a.bolt[j + 1];
          for (let o = -(w >> 1); o <= (w >> 1); o++) this.pxLine(n, { x: p0.x + o, y: p0.y }, { x: p1.x + o, y: p1.y }, o === 0 && w > 1 ? '#ffffff' : (w > 1 ? a.color : (j % 2 ? '#ffffff' : a.color)));
        }
      } else {
        const start = a.reverse ? Math.PI * 0.15 : Math.PI * 1.1, sweep = Math.PI * 0.9 * Math.min(1, k * 2.2) * (a.reverse ? 1 : 1);
        for (let th = 0; th < sweep; th += 0.05) {
          const ang = start + th;
          const rr = a.r * (0.85 + 0.15 * Math.sin(th * 3));
          const px = Math.round(a.x + Math.cos(ang) * rr * 0.6), py = Math.round(a.y + Math.sin(ang) * rr);
          const w = th > sweep * 0.3 && th < sweep * 0.85 ? 2 : 1;
          n.fillStyle = '#ffffff'; n.fillRect(px, py, w, w);
          n.fillStyle = a.color; n.fillRect(px + 1, py + 1, 1, 1);
        }
      }
      n.globalAlpha = 1;
    }
    ctx.drawImage(this.nat, 0, 0, W, H, sx, sy, W * s, H * s);
    ctx.drawImage(this.fgUp, sx, sy);

    // ---- display-resolution post: lights, fog, shafts, vignette
    this.post(ctx, time, sx, sy);
    this.drawTrails(ctx, t, sx, sy);
    this.drawXHits(ctx, t, sx, sy);
    this.drawBigArcs(ctx, t, sx, sy);
    this.drawMeteors(ctx, t, sx, sy);
    this.drawOverlays(ctx, t, sx, sy);
    this.applyCam(ctx, t);
  }
  // sword after-image: a bright crescent along the downward slash path (overhead -> low in front)
  drawTrails(ctx, t, sx, sy) {
    if (!this.trails.length) return;
    const s = this.s;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i], k = (t - tr.t0) / tr.life;
      if (k >= 1) { this.trails.splice(i, 1); continue; }
      const grow = Math.min(1, k * 5);                      // the arc sweeps in fast, then fades
      const fade = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
      const cx = tr.x * s + sx, cy = tr.y * s + sy, R = tr.r * s;
      const up = !!tr.up;
      const a0 = up ? 2.55 : -1.45, a1 = up ? a0 + 2.2 * grow : a0 - 2.15 * grow;   // down-slash: behind head -> low front; up-slash: low front -> overhead
      const cols = tr.color === 'fire' ? [[0.34, '255,90,30', 0.3], [0.2, '255,170,60', 0.55], [0.08, '255,240,190', 0.95]]
        : tr.color === 'electric' ? [[0.4, '60,130,255', 0.4], [0.26, '120,210,255', 0.62], [0.12, '210,245,255', 0.9], [0.05, '255,255,255', 1]]
        : [[0.34, '150,200,255', 0.22], [0.2, '200,232,255', 0.45], [0.08, '255,255,255', 0.9]];
      for (const [w, col, al] of cols) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1, !up);
        ctx.arc(cx - R * w * 0.5, cy, R * (1 - w), a1, a0, up);
        ctx.closePath();
        ctx.fillStyle = `rgba(${col},${al * fade})`; ctx.fill();
      }
    }
    ctx.restore();
  }
  // dim the background for ms (extends a dim already running). DARK_A: how dark at full strength.
  darkFor(ms) {
    const t = now();
    if (this.darken && t < this.darken.until) this.darken.until = Math.max(this.darken.until, t + ms);
    else this.darken = { t0: t, until: t + ms };
  }
  _darkNow(t) {
    const d = this.darken; if (!d) return 0;
    if (t > d.until) { this.darken = null; return 0; }
    const el = t - d.t0, left = d.until - t;
    return DARK_A * Math.max(0, Math.min(1, el / 220, left / 320));
  }
  // camera punch-in on the hero doing a big move, with the screen edges darkened
  applyCam(ctx, t) {
    const c = this.cam; if (!c) return;
    const el = t - c.t0;
    if (el >= c.dur) { this.cam = null; return; }
    const ease = x => x * x * (3 - 2 * x);
    const k = el < 200 ? ease(el / 200) : el > c.dur - 260 ? ease(Math.max(0, (c.dur - el) / 260)) : 1;
    const Wd = this.cv.width, Hd = this.cv.height, s = this.s;
    const cn = c.hold ? this._camNow(c, t) : c;
    const z = 1 + (cn.z - 1) * k;
    let fx = Math.max(Wd * 0.2, Math.min(Wd * 0.8, c.x * s)), fy = Math.max(Hd * 0.25, Math.min(Hd * 0.75, c.y * s));
    let ox = fx, oy = fy;   // where the focus point lands on screen (moves to tx/ty for a held framing)
    if (c.hold) { fx = c.x * s; fy = c.y * s; ox = fx + (cn.tx * Wd - fx) * k; oy = fy + (cn.ty * Hd - fy) * k; }
    if (!this._zc || this._zc.width !== Wd || this._zc.height !== Hd) { this._zc = document.createElement('canvas'); this._zc.width = Wd; this._zc.height = Hd; }
    const zx = this._zc.getContext('2d'); zx.clearRect(0, 0, Wd, Hd); zx.drawImage(this.cv, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._zc, ox - fx * z, oy - fy * z, Wd * z, Hd * z);
    const vg = ctx.createRadialGradient(fx, fy, Math.min(Wd, Hd) * 0.22, fx, fy, Math.max(Wd, Hd) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(2,0,6,${(c.vig != null ? c.vig : 0.62) * k})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, Wd, Hd);
  }

  tinted(src, colr) {
    this._tint = this._tint || new Map();
    const key = src.__id || (src.__id = Math.random().toString(36).slice(2));
    const k = key + colr;
    if (this._tint.has(k)) return this._tint.get(k);
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = colr; x.fillRect(0, 0, c.width, c.height);
    this._tint.set(k, c);
    return c;
  }
  pxLine(n, a, b, colr) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    n.fillStyle = colr;
    for (let i = 0; i <= steps; i++) n.fillRect(Math.round(lerp(a.x, b.x, i / steps)), Math.round(lerp(a.y, b.y, i / steps)), 1, 1);
  }
  drawProjectile(n, pr, x, y, k) {
    const rx = Math.round(x), ry = Math.round(y);
    const ang = Math.atan2(pr.to.y - pr.from.y, pr.to.x - pr.from.x);
    const tail = (len, colr) => { n.fillStyle = colr; for (let i = 1; i < len; i++) n.fillRect(Math.round(x - Math.cos(ang) * i), Math.round(y - Math.sin(ang) * i), 1, 1); };
    switch (pr.kind) {
      case 'proj_arrow': tail(9, '#c9a46a'); n.fillStyle = '#ffffff'; n.fillRect(rx, ry, 2, 1); break;
      case 'proj_fire': case 'meteor': {
        const r = pr.kind === 'meteor' ? 5 : 4;
        n.fillStyle = '#ff6a2a'; n.fillRect(rx - r, ry - r + 1, r * 2, r * 2 - 2); n.fillRect(rx - r + 1, ry - r, r * 2 - 2, r * 2);
        n.fillStyle = '#ffc24a'; n.fillRect(rx - r + 1, ry - r + 1, r * 2 - 2, r * 2 - 2);
        n.fillStyle = '#fff6c8'; n.fillRect(rx - 1, ry - 1, 2, 2);
        if (Math.random() < 0.9) this.particles.push({ x, y, vx: -Math.cos(ang) * 20 + (Math.random() - 0.5) * 10, vy: -Math.sin(ang) * 20 - 10, g: -10, life: 0.35, t: 0, c: Math.random() < 0.5 ? '#ff8a3c' : '#ffc24a' });
        break;
      }
      case 'proj_ice': tail(10, '#5ac8f0'); n.fillStyle = '#9fe8ff'; n.fillRect(rx - 4, ry - 1, 7, 3); n.fillStyle = '#e8ffff'; n.fillRect(rx - 5, ry, 8, 1); n.fillRect(rx - 1, ry - 2, 2, 5);
        if (Math.random() < 0.7) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, g: 0, life: 0.3, t: 0, c: '#e8ffff', plus: Math.random() < 0.3, fade: true }); break;
      case 'proj_poison': tail(8, '#c9a46a'); n.fillStyle = '#9cff6b'; n.fillRect(rx, ry - 1, 2, 3); if (Math.random() < 0.5) this.particles.push({ x, y, vx: 0, vy: 6, g: 20, life: 0.4, t: 0, c: '#9cff6b' }); break;
      case 'proj_arcane': n.fillStyle = '#4a3aa8'; n.fillRect(rx - 3, ry - 2, 6, 4); n.fillRect(rx - 2, ry - 3, 4, 6); n.fillStyle = '#7a6aff'; n.fillRect(rx - 2, ry - 2, 4, 4); n.fillStyle = '#e0d8ff'; n.fillRect(rx - 1, ry - 1, 2, 2); this.particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, g: 0, life: 0.3, t: 0, c: '#b8a6ff' }); break;
      case 'star': n.fillStyle = '#fff0a8'; n.fillRect(rx - 2, ry, 5, 1); n.fillRect(rx, ry - 2, 1, 5); n.fillStyle = '#ffffff'; n.fillRect(rx, ry, 1, 1); tail(6, '#ffe27a'); break;
      case 'proj_firearrow': tail(9, '#c9a46a'); n.fillStyle = '#ff8a3c'; n.fillRect(rx - 1, ry - 1, 3, 3); n.fillStyle = '#fff6c8'; n.fillRect(rx, ry, 1, 1);
        if (Math.random() < 0.8) this.particles.push({ x, y, vx: -Math.cos(ang) * 16 + (Math.random() - 0.5) * 8, vy: -Math.sin(ang) * 16 - 8, g: -10, life: 0.3, t: 0, c: Math.random() < 0.5 ? '#ff8a3c' : '#ffc24a' }); break;
      case 'phantom': tail(10, '#3fc8a0'); n.fillStyle = '#c8fff0'; n.fillRect(rx, ry, 2, 1); n.fillStyle = '#7affd8'; n.fillRect(rx - 1, ry - 1, 1, 3);
        if (Math.random() < 0.6) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6, g: 0, life: 0.4, t: 0, c: '#a8ffe0', fade: true }); break;
      case 'crystal': n.fillStyle = '#ffc24a'; n.fillRect(rx - 1, ry - 1, 3, 2); n.fillStyle = '#fff6c8'; n.fillRect(rx, ry - 1, 1, 1); tail(4, '#e07a24'); break;
      case 'hex': n.fillStyle = '#b46bff'; n.fillRect(rx - 2, ry - 2, 4, 4); n.fillStyle = '#f0d8ff'; n.fillRect(rx - 1, ry - 1, 2, 2); break;
      default: n.fillStyle = '#ffffff'; n.fillRect(rx - 1, ry - 1, 3, 3);
    }
  }
  drawProp(n, p, time) {
    if (p.kind === 'fire') {
      n.fillStyle = '#3a2620'; n.fillRect(p.x - 8, p.y - 2, 16, 3); n.fillStyle = '#5a3a2a'; n.fillRect(p.x - 6, p.y - 4, 4, 3); n.fillRect(p.x + 2, p.y - 4, 4, 3);
      for (let i = 0; i < 6; i++) {
        const h = 6 + Math.sin(time * 9 + i * 1.7) * 3 + (i % 3) * 2;
        const x = p.x - 5 + i * 2;
        n.fillStyle = '#ff6a2a'; n.fillRect(x, p.y - 3 - h, 2, h);
        n.fillStyle = '#ffc24a'; n.fillRect(x, p.y - 3 - h * 0.6, 2, h * 0.6);
      }
      n.fillStyle = '#fff6c8'; n.fillRect(p.x - 1, p.y - 6, 2, 3);
      if (Math.random() < 0.3) this.particles.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y - 10, vx: (Math.random() - 0.5) * 6, vy: -20 - Math.random() * 15, g: 0, life: 0.9, t: 0, c: '#ffb347' });
    } else if (p.kind === 'chest') {
      const fr = SP.chestFrame(p.rarity, p.opened);
      const bounce = !p.opened ? Math.round(Math.max(0, Math.sin(time * 3 + p.x)) * (p.mine ? 2 : 0)) : 0;
      n.drawImage(fr, Math.round(p.x - 20), Math.round(p.y - 32 - bounce));
      if (p.opened && p.openT && performance.now() - p.openT < 900 && !p._burst) { p._burst = true; this.burst(p.x, p.y - 18, C.RARITY[p.rarity].color, 40, 45); }
    } else if (p.kind === 'merchant') {
      const fr = SP.enemyFrame('goblin', 'idle' + Math.floor(time * 3.5 % 4));
      n.drawImage(fr, Math.round(p.x - 30), Math.round(p.y - 57));
      // pack + lantern
      n.fillStyle = '#6a4a2f'; n.fillRect(Math.round(p.x - 14), Math.round(p.y - 34), 10, 14); n.fillStyle = '#8a6a3f'; n.fillRect(Math.round(p.x - 13), Math.round(p.y - 33), 8, 3);
      n.fillStyle = '#ffd25a'; n.fillRect(Math.round(p.x + 9), Math.round(p.y - 26), 3, 4); n.fillStyle = '#fff6c8'; n.fillRect(Math.round(p.x + 10), Math.round(p.y - 25), 1, 2);
    } else if (p.kind === 'shrine') {
      n.fillStyle = '#4a4458'; n.fillRect(p.x - 9, p.y - 10, 18, 10); n.fillStyle = '#5f5870'; n.fillRect(p.x - 9, p.y - 11, 18, 2); n.fillStyle = '#2a2638'; n.fillRect(p.x - 9, p.y - 1, 18, 1);
      const fr = SP.enemyFrame('shard', 'idle' + Math.floor(time * 2 % 4));
      n.drawImage(fr, Math.round(p.x - 15), Math.round(p.y - 52 + Math.sin(time * 2) * 2));
    }
  }

  post(ctx, time, sx, sy) {
    const s = this.s, Wd = this.cv.width, Hd = this.cv.height;
    const T = THEMES[this.theme] || THEMES.halls;
    // dark ambient grade at the top
    let g = ctx.createLinearGradient(0, 0, 0, Hd);
    g.addColorStop(0, 'rgba(6,4,16,0.62)'); g.addColorStop(0.42, 'rgba(10,8,24,0.18)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(4,2,10,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd);
    // additive lights
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      let a = L.a;
      if (L.kind === 'torch') a *= 0.82 + 0.18 * Math.sin(time * 13 + L.phase) * Math.sin(time * 7.3 + L.phase * 2);
      if (L.kind === 'crystal') a *= 0.75 + 0.25 * Math.sin(time * 1.6 + L.phase);
      const x = L.x * s + sx, y = L.y * s + sy, r = L.r * s;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(L.color, a * 0.55)); rg.addColorStop(0.35, hexA(L.color, a * 0.2)); rg.addColorStop(1, hexA(L.color, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // light shafts from the ceiling
    if (!this.lowPower) {
      for (let i = 0; i < 3; i++) {
        const x0 = (0.22 + i * 0.27) * Wd + Math.sin(time * 0.3 + i) * 10 * s;
        const w = (40 + i * 14) * s, slant = 70 * s;
        const a = 0.05 + 0.025 * Math.sin(time * 0.7 + i * 2);
        const lg = ctx.createLinearGradient(0, 0, 0, Hd * 0.85);
        lg.addColorStop(0, `rgba(255,236,200,${a * 1.6})`); lg.addColorStop(1, 'rgba(255,236,200,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w + slant, Hd * 0.85); ctx.lineTo(x0 + slant * 0.6, Hd * 0.85); ctx.closePath(); ctx.fill();
      }
    }
    // effect glows
    const dt = (1 / 60) * (this.slowmo || 1);
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const G = this.glows[i];
      G.t += dt; if (G.t >= G.life) { this.glows.splice(i, 1); continue; }
      const k = G.t / G.life;
      const a = G.a * (1 - k);
      const r = (G.r + (G.grow || 0) * k) * s;
      const x = G.x * s + sx, y = G.y * s + sy;
      if (G.ring) {
        ctx.strokeStyle = hexA(G.color, a); ctx.lineWidth = Math.max(2, s * 1.5);
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r * (G.grow ? 0.4 : 1), 0, 0, Math.PI * 2); ctx.stroke();
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(G.color, a * 0.3)); rg.addColorStop(1, hexA(G.color, 0));
        ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else if (G.rune) {
        ctx.strokeStyle = hexA(G.color, a); ctx.lineWidth = Math.max(1, s);
        ctx.beginPath(); ctx.ellipse(x, y, r * (0.6 + k * 0.4), r * 0.25 * (0.6 + k * 0.4), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.75 * (0.6 + k * 0.4), r * 0.18 * (0.6 + k * 0.4), 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, hexA(G.color, a * 0.8)); rg.addColorStop(0.4, hexA(G.color, a * 0.3)); rg.addColorStop(1, hexA(G.color, 0));
        ctx.fillStyle = rg;
        if (G.tall) { ctx.save(); ctx.translate(x, y); ctx.scale(0.6, 1.8); ctx.translate(-x, -y); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
        else ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    // shrinking charge ring (ranger volley): a circle closing in on the arrow tip
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const rg = this.rings[i], k = (performance.now() - rg.t0) / rg.dur;
      if (k >= 1) { this.rings.splice(i, 1); continue; }
      const tp = this._tipAt(rg.follow) || { x: rg.follow.x, y: rg.follow.y - 40 };
      const r = (4 + 40 * (1 - k) * (1 - k)) * s, x = tp.x * s + sx, y = tp.y * s + sy;
      ctx.strokeStyle = hexA(rg.color, 0.35 + 0.6 * k); ctx.lineWidth = Math.max(2, s * (1.2 + k));
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
    // light ribbon following a swinging staff tip
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const rb = this.ribbons[i], tnow = performance.now();
      if (tnow < rb.until) { const tp = this._tipAt(rb.follow); if (tp) rb.pts.push({ x: tp.x, y: tp.y, t: tnow }); }
      rb.pts = rb.pts.filter(p => tnow - p.t < 380);
      if (!rb.pts.length && tnow >= rb.until) { this.ribbons.splice(i, 1); continue; }
      for (let j = 1; j < rb.pts.length; j++) {
        const p0 = rb.pts[j - 1], p1 = rb.pts[j], a = 1 - (tnow - p1.t) / 380;
        ctx.strokeStyle = hexA(rb.color, 0.8 * a); ctx.lineWidth = Math.max(2, s * 3 * a); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p0.x * s + sx, p0.y * s + sy); ctx.lineTo(p1.x * s + sx, p1.y * s + sy); ctx.stroke();
      }
    }
    // Champion's Combo: a big electric glow wrapped round the raised blade, flickering, growing as it charges
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i], tnow = performance.now();
      if (tnow > z.until + 120) { this.zaps.splice(i, 1); continue; }
      const tip = this._tipAt(z.follow); if (!tip) continue;
      const k = Math.min(1, (tnow - z.t0) / (z.until - z.t0)), L = z.len || 26;
      const fl = 0.8 + 0.2 * Math.sin(tnow / 23) * Math.sin(tnow / 61);
      const x = tip.x * s + sx, y = (tip.y + L * 0.5) * s + sy, r = (24 + 32 * k) * s * fl;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [rr, col, al] of [[2.3, '#1f5aff', 0.3], [1.5, '#4aa8ff', 0.45], [0.9, '#9fe8ff', 0.6], [0.4, '#ffffff', 0.85]]) {
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * rr);
        g2.addColorStop(0, hexA(col, al * (0.55 + 0.45 * k))); g2.addColorStop(0.55, hexA(col, al * 0.35 * (0.55 + 0.45 * k))); g2.addColorStop(1, hexA(col, 0));
        ctx.save(); ctx.translate(x, y); ctx.scale(0.5, 1.45); ctx.translate(-x, -y); ctx.fillStyle = g2; ctx.fillRect(x - r * rr, y - r * rr, r * rr * 2, r * rr * 2); ctx.restore();
      }
      // the blade itself burns white-hot
      ctx.lineCap = 'round'; ctx.shadowColor = '#7fd8ff'; ctx.shadowBlur = s * (8 + 14 * k);
      ctx.strokeStyle = hexA('#eafcff', 0.55 + 0.45 * k * fl); ctx.lineWidth = s * (2.2 + 2.2 * k);
      ctx.beginPath(); ctx.moveTo(x, (tip.y + 1) * s + sy); ctx.lineTo(x, (tip.y + L) * s + sy); ctx.stroke();
      ctx.restore();
    }
    // electric ripples spreading over the floor where the finisher landed
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i], tnow = performance.now(), k = (tnow - rp.t0) / rp.life;
      if (k >= 1) { this.ripples.splice(i, 1); continue; }
      if (k < 0) continue;
      const e = 1 - Math.pow(1 - k, 2), rx = (rp.r0 + (rp.r1 - rp.r0) * e) * s, x = rp.x * s + sx, y = rp.y * s + sy;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hexA('#7fd8ff', 0.85 * (1 - k)); ctx.lineWidth = Math.max(1.5, s * (3 * (1 - k) + 0.8));
      ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = hexA('#ffffff', 0.6 * (1 - k)); ctx.lineWidth = Math.max(1, s * (1.2 * (1 - k)));
      ctx.beginPath(); ctx.ellipse(x, y, rx * 0.97, rx * 0.29, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // power-up aura (knight power strike): a flickering flame glow around the hero that grows
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const au = this.auras[i], tnow = performance.now(), k = (tnow - au.t0) / (au.until - au.t0);
      if (k >= 1.25) { this.auras.splice(i, 1); continue; }
      const a = au.follow, g = Math.min(1, k), fade = k > 1 ? 1 - (k - 1) / 0.25 : 1;
      const x = (a.x + a.ox) * s + sx, y = (a.y + a.oy - 24) * s + sy, r = (18 + 26 * g + Math.sin(tnow / 40) * 2) * s;
      const rg2 = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      rg2.addColorStop(0, hexA('#ffb347', 0.25 * fade)); rg2.addColorStop(0.6, hexA('#ff7a2a', 0.35 * fade * (0.6 + g * 0.4))); rg2.addColorStop(1, hexA('#ff4a1a', 0));
      ctx.save(); ctx.translate(x, y); ctx.scale(0.8, 1.25); ctx.translate(-x, -y); ctx.fillStyle = rg2; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
    }
    // charge-star glow
    for (const st of this.stars) {
      const g = Math.min(1, (performance.now() - st.t0) / st.grow), r = (8 + g * 22) * s;
      const x = st.x * s + sx, y = st.y * s + sy;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(st.color, 0.75)); rg.addColorStop(1, hexA(st.color, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // projectile glows
    for (const pr of this.projectiles) {
      const k = (performance.now() - pr.t0) / pr.ms;
      const x = lerp(pr.from.x, pr.to.x, k) * s + sx, y = (lerp(pr.from.y, pr.to.y, k) + Math.sin(k * Math.PI) * pr.arc) * s + sy;
      const colr = { proj_fire: '#ff7a2a', meteor: '#ff6a2a', proj_ice: '#8fe3ff', proj_poison: '#9cff6b', proj_arcane: '#8a7aff', star: '#fff0a8', crystal: '#ffc24a', hex: '#b46bff' }[pr.kind];
      if (!colr) continue;
      const r = (pr.kind === 'meteor' ? 30 : 16) * s;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(colr, 0.7)); rg.addColorStop(1, hexA(colr, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // campfire light
    for (const p of this.props) if (p.kind === 'fire' || p.kind === 'shrine' || (p.kind === 'chest' && p.opened)) {
      const colr = p.kind === 'fire' ? '#ff9a3c' : p.kind === 'shrine' ? '#ffc24a' : (C.RARITY[p.rarity] || {}).color || '#fff';
      const x = p.x * s + sx, y = (p.y - 12) * s + sy, r = (p.kind === 'fire' ? 110 : 60) * s * (0.92 + 0.08 * Math.sin(time * 11));
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, hexA(colr, 0.5)); rg.addColorStop(1, hexA(colr, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    // fog drifting over the floor
    if (!this.lowPower) {
      const fy = (this.floorTop - 6) * s + sy, fh = 34 * s;
      ctx.globalAlpha = 0.22;
      const off = (time * 6 * s) % Wd;
      ctx.drawImage(this.tintedFog(T.fog), -off, fy, Wd, fh);
      ctx.drawImage(this.tintedFog(T.fog), Wd - off, fy, Wd, fh);
      ctx.globalAlpha = 0.12;
      const off2 = (time * 3 * s) % Wd;
      ctx.drawImage(this.tintedFog(T.fog), off2 - Wd, Hd - 60 * s, Wd, 60 * s);
      ctx.drawImage(this.tintedFog(T.fog), off2, Hd - 60 * s, Wd, 60 * s);
      ctx.globalAlpha = 1;
    }
    // floating motes
    this.motes = this.motes || Array.from({ length: 40 }, (_, i) => ({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, p: Math.random() * 6, warm: Math.random() < 0.6 }));
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      m.y -= m.v * dt * 3; if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      const x = (m.x + Math.sin(time * 0.5 + m.p) * 0.01) * Wd, y = m.y * Hd;
      const a = 0.35 + 0.35 * Math.sin(time * 2 + m.p);
      ctx.fillStyle = m.warm ? `rgba(255,190,110,${a})` : `rgba(150,200,255,${a})`;
      ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, s * 0.6), Math.max(1, s * 0.6));
    }
    ctx.globalCompositeOperation = 'source-over';
    // vignette
    const vg = ctx.createRadialGradient(Wd / 2, Hd * 0.55, Math.min(Wd, Hd) * 0.35, Wd / 2, Hd * 0.55, Math.max(Wd, Hd) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(3,1,8,0.72)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, Wd, Hd);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,250,235,${this.flash})`; ctx.fillRect(0, 0, Wd, Hd); this.flash = Math.max(0, this.flash - 0.04); }
    if (this.dim) { ctx.fillStyle = `rgba(4,2,10,${this.dim})`; ctx.fillRect(0, 0, Wd, Hd); }
  }
  tintedFog(rgb) {
    const key = rgb.join(',');
    this._fog = this._fog || {};
    if (this._fog[key]) return this._fog[key];
    const c = document.createElement('canvas'); c.width = this.fog.width; c.height = this.fog.height;
    const x = c.getContext('2d'); x.drawImage(this.fog, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = `rgb(${rgb[0] + 60},${rgb[1] + 60},${rgb[2] + 70})`; x.fillRect(0, 0, c.width, c.height);
    this._fog[key] = c; return c;
  }

  // HP bars, intents, names, damage numbers (display resolution)
  drawOverlays(ctx, t, sx, sy) {
    const s = this.s, d = this.dpr;
    const fs = px => Math.round(px * d);
    const inBattle = this.mode === 'battle';
    for (const a of this.actors.values()) {
      if (a.gone || (a.dying && t - a.dying > 200)) continue;
      const x = (a.x + a.ox) * s + sx, yFoot = (a.y + a.oy) * s + sy;
      if (a.type === 'enemy' && inBattle) {
        const info = SP.enemyInfo(a.kind);
        const w = Math.max(fs(70), (a.size === 'xl' ? 90 : a.size === 'l' ? 46 : 32) * s);
        const by = yFoot + fs(6);
        this.bar(ctx, x - w / 2, by, w, fs(6), a.hp / a.maxHp, '#ff4f7a', '#ff9ab5', a.block);
        ctx.font = `600 ${fs(12)}px "Alegreya Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        this.text(ctx, `${a.hp}/${a.maxHp}`, x, by + fs(8), '#f2eaff', fs(12));
        this.statusRow(ctx, a.st, x - w / 2, by - fs(18));
        // intent
        if (a.intent && !a.dying) {
          if (a.size === 'xl') this.intent(ctx, a, x + 62 * s, (a.y + a.oy - 70) * s + sy);
          else this.intent(ctx, a, x, (a.y + a.oy - info.ay + (a.kind === 'slime' ? 18 : 8)) * s + sy - fs(30));
        }
        if (this.target === a.id) {
          const bob = Math.sin(t / 180) * fs(3);
          const ty = (a.y + a.oy - info.ay + (a.kind === 'slime' ? 18 : 6)) * s + sy - fs(48) + bob;
          ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.moveTo(x - fs(8), ty); ctx.lineTo(x + fs(8), ty); ctx.lineTo(x, ty + fs(10)); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = fs(1.5); ctx.stroke();
        }
      }
      if (a.type === 'hero') {
        const w = fs(46);
        const by = yFoot + fs(4);
        this.bar(ctx, x - w / 2, by, w, fs(4), a.hp / a.maxHp, a.downed ? '#6a6a7a' : '#5ae08a', '#b8ffd0', a.block);
        ctx.font = `700 ${fs(12)}px "Alegreya Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const mine = a.id === this.myId;
        this.text(ctx, (mine ? '▸ ' : '') + a.name, x, by + fs(6), mine ? '#8fe9ff' : '#e9e2f6', fs(12));
        if (inBattle) {
          const top = (a.y + a.oy - 52) * s + sy;
          if (a.busy && !a.acted) this.badge(ctx, x, top, '…', '#c8c0e0');
          else if (a.acted) this.badge(ctx, x, top, '✓', '#8dff9e');
          if (a.focus) { ctx.font = `700 ${fs(12)}px sans-serif`; this.text(ctx, '✦'.repeat(a.focus), x + fs(16), top - fs(6), '#b8c8ff', fs(12)); }
          this.statusRow(ctx, a.st, x - w / 2, by - fs(16));
        }
      }
    }
    // damage numbers
    const dt = 1 / 60;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const nb = this.numbers[i];
      nb.t += dt; if (nb.t >= nb.life) { this.numbers.splice(i, 1); continue; }
      const k = nb.t / nb.life;
      const scale = nb.pop ? (k < 0.12 ? lerp(1.9, 1, k / 0.12) : 1) : 1;
      const x = nb.x * s + sx, y = nb.y * s + sy - ease(k) * fs(22);
      const size = fs(22 * nb.size * scale);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.font = `italic 900 ${size}px "Alegreya Sans", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.18); ctx.strokeStyle = 'rgba(14,8,24,0.92)';
      ctx.strokeText(nb.text, x, y);
      const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, nb.color); g.addColorStop(1, shade(nb.color));
      ctx.fillStyle = g; ctx.fillText(nb.text, x, y);
      ctx.globalAlpha = 1;
    }
  }
  bar(ctx, x, y, w, h, frac, c1, c2, block) {
    const d = this.dpr;
    ctx.fillStyle = 'rgba(10,6,18,0.85)'; ctx.fillRect(x - d, y - d, w + 2 * d, h + 2 * d);
    ctx.fillStyle = '#2a2236'; ctx.fillRect(x, y, w, h);
    const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, c2); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h);
    if (block > 0) {
      const r = Math.round(9 * d);
      const bx = x - r - 2 * d, by = y + h / 2;
      ctx.fillStyle = '#3f7ad8'; ctx.strokeStyle = '#cfe6ff'; ctx.lineWidth = d * 1.2;
      ctx.beginPath(); ctx.moveTo(bx - r * 0.8, by - r * 0.8); ctx.lineTo(bx + r * 0.8, by - r * 0.8); ctx.lineTo(bx + r * 0.8, by + r * 0.1); ctx.lineTo(bx, by + r); ctx.lineTo(bx - r * 0.8, by + r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = `800 ${Math.round(11 * d)}px "Alegreya Sans", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText(block, bx, by - d);
    }
  }
  text(ctx, str, x, y, colr, size) {
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.22); ctx.strokeStyle = 'rgba(8,5,16,0.9)';
    ctx.strokeText(str, x, y); ctx.fillStyle = colr; ctx.fillText(str, x, y);
  }
  badge(ctx, x, y, str, colr) {
    const d = this.dpr, r = 9 * d;
    ctx.fillStyle = 'rgba(12,8,24,0.85)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colr; ctx.lineWidth = d * 1.4; ctx.stroke();
    ctx.font = `800 ${Math.round(12 * d)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = colr; ctx.fillText(str, x, y + d * 0.5);
  }
  statusRow(ctx, st, x, y) {
    if (!st) return;
    const d = this.dpr; let i = 0;
    for (const [k, v] of Object.entries(st)) {
      const c = STATUS_COL[k] || '#fff';
      const bx = x + i * 26 * d;
      ctx.fillStyle = 'rgba(10,6,18,0.85)'; ctx.fillRect(bx, y, 24 * d, 14 * d);
      ctx.fillStyle = c; ctx.fillRect(bx, y, 3 * d, 14 * d);
      ctx.font = `800 ${Math.round(11 * d)}px "Alegreya Sans", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const sh = STATUS_SHORT[k] || (STATUS_ABBR[k] || k).slice(0, 2);
      const label = v.v != null ? sh + v.v : sh + (v.t > 1 && v.t < 50 ? v.t : '');
      ctx.fillStyle = c; ctx.fillText(label, bx + 5 * d, y + 7.5 * d);
      i++;
    }
  }
  intent(ctx, a, x, y) {
    const d = this.dpr, it = a.intent;
    const fs = px => Math.round(px * d);
    let icon = 'attack', label = '', colr = '#ffd0c8';
    const str = a.st && a.st.str ? a.st.str.v : 0;
    const adj = v => Math.round((v + str) * (a.st && a.st.weak ? 0.75 : 1) * (a.st && a.st.chill ? 0.5 : 1));
    if (it.type === 'attack') { label = adj(it.dmg) + (it.hits > 1 ? '×' + it.hits : ''); }
    else if (it.type === 'attackAll') { icon = 'volley'; const shards = it.perShard ? [...this.actors.values()].filter(e => e.kind === 'shard' && !e.gone && !e.dying).length : 0; label = adj(it.dmg + (it.perShard || 0) * shards) + ' all'; colr = '#ffb08a'; }
    else if (it.type === 'block') { icon = 'defend'; label = '+' + it.block; colr = '#b8d8ff'; }
    else if (it.type === 'debuff') { icon = 'dagger'; label = STATUS_ABBR[it.status] || 'Curse'; colr = '#d8b8ff'; }
    else if (it.type === 'heal') { icon = 'heal'; label = '+' + it.heal; colr = '#b8ffc8'; }
    else if (it.type === 'charge') { icon = 'battle_cry'; label = (a.kind === 'wyrm' || a.kind === 'minotaur') ? 'Storm next!' : 'Big hit next!'; colr = '#ff8a6a'; }
    else if (it.type === 'summon') { icon = 'starfall'; label = 'Summon'; colr = '#ffd27a'; }
    if (a.st && a.st.freeze) { icon = 'frost_nova'; label = 'Frozen'; colr = '#dff8ff'; }
    else if (a.st && a.st.stun) { icon = 'pinning'; label = 'Stunned'; colr = '#ffe08a'; }
    // target
    let tname = '';
    if ((it.type === 'attack' || it.type === 'debuff') && it.target) {
      const taunt = [...this.actors.values()].find(h => h.type === 'hero' && !h.downed && h.st && h.st.taunt);
      const tg = taunt || this.actors.get(it.target);
      if (tg) tname = tg.id === this.myId ? 'you' : tg.name;
    }
    if (it.type === 'charge' && it.warn) tname = '';
    const img = SP.iconCanvas(icon);
    const isz = fs(20);
    ctx.font = `800 ${fs(15)}px "Alegreya Sans", sans-serif`;
    const tw = ctx.measureText(label).width;
    ctx.font = `600 ${fs(12)}px "Alegreya Sans", sans-serif`;
    const nw = tname ? ctx.measureText('→ ' + tname).width : 0;
    const w = isz + fs(6) + tw + (tname ? fs(6) + nw : 0) + fs(12);
    const h = fs(26);
    const bx = x - w / 2, by = y - h / 2;
    const mine = tname === 'you';
    ctx.fillStyle = mine ? 'rgba(90,16,24,0.88)' : 'rgba(14,10,26,0.82)';
    roundRect(ctx, bx, by, w, h, fs(6)); ctx.fill();
    ctx.strokeStyle = mine ? '#ff6a6a' : 'rgba(200,190,230,0.35)'; ctx.lineWidth = d; ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, bx + fs(6), by + (h - isz) / 2, isz, isz);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `800 ${fs(15)}px "Alegreya Sans", sans-serif`;
    ctx.fillStyle = colr; ctx.fillText(label, bx + fs(6) + isz + fs(4), by + h / 2 + d * 0.5);
    if (tname) { ctx.font = `600 ${fs(12)}px "Alegreya Sans", sans-serif`; ctx.fillStyle = mine ? '#ffd0d0' : '#cfc6e6'; ctx.fillText('→ ' + tname, bx + fs(10) + isz + tw + fs(2), by + h / 2 + d); }
  }
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function hexA(h, a) { h = h.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${Math.max(0, Math.min(1, a))})`; }
function shade(h) { h = h.replace('#', ''); const f = v => Math.round(parseInt(v, 16) * 0.62).toString(16).padStart(2, '0'); return '#' + f(h.slice(0, 2)) + f(h.slice(2, 4)) + f(h.slice(4, 6)); }

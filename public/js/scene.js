// Battle scene renderer: pixel layer at native resolution, modern lighting on top.
import * as SP from './sprites.js';
import { paintDungeon, fogTexture, THEMES, INFERNO_ART, infernoReady } from './dungeon.js';
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
const SUP_COL = { heal: '#9dffb0', heal_party: '#9dffb0', revive: '#9dffb0', revive_party: '#ffe27a', bless_party: '#ffe9a0', buff_party: '#ff9a7a', empower: '#ff9a7a', rally_party: '#ffc08a',
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
  blade: FX_SHEET('flame_blade.png', 58, 156, 4, 8, 12, 16, 52, true),   // anchored on the sword tip (made round the knight's hold frame)
  vortex: FX_SHEET('fire_vortex.png', 85, 85, 1, 1, 1, 42.5, 42.5, true),   // one image, spun in code (Earthshatter's dive)
  // the burning greatsword in Earthshatter's wind-up pose, one per knight, anchored on the feet (made round each wind-up frame)
  gsf: FX_SHEET('knight_greatsword_fire.png', 97, 103, 4, 8, 12, 45, 94, true),
  gsfF: FX_SHEET('knight_f_greatsword_fire.png', 93, 78, 4, 8, 12, 42, 73, true),
  // Starfall (ranger): the charge on the arrowhead, the star arrow (points right; rotated in code), the burst in the sky, the impact
  sCharge: FX_SHEET('starfall_charge.png', 48, 48, 3, 8, 12, 24, 24, true),
  sArrow: FX_SHEET('starfall_arrow.png', 64, 24, 3, 6, 10, 32, 12, true),
  sBurst: FX_SHEET('starfall_burst.png', 96, 96, 4, 10, 12, 48, 48, false),
  sImpact: FX_SHEET('starfall_impact.png', 64, 56, 4, 12, 14, 32, 44, false),
  // Phantom Volley (ranger): the spectral charge on the arrowhead, the ghost arrow (points right, anchored on its tip; rotated
  // in code) and the spectral impact that breaks into blue-violet wisps
  pCharge: FX_SHEET('phantom_charge.png', 48, 48, 3, 8, 10, 24, 24, true),
  pArrow: FX_SHEET('phantom_arrow.png', 64, 24, 3, 6, 10, 60, 12, true),
  pImpact: FX_SHEET('phantom_impact.png', 64, 56, 4, 12, 16, 32, 38, false),
  // Wrath of Heaven (cleric): halo above the head, holy aura round the body, the mark on the ground, the pillar of light, the impact, the sigil left behind
  wHalo: FX_SHEET('wrath_halo.png', 48, 24, 3, 8, 12, 24, 12, true),
  wAura: FX_SHEET('wrath_aura.png', 64, 96, 3, 8, 12, 32, 88, true),
  wMark: FX_SHEET('wrath_mark_wide.png', 192, 96, 3, 8, 8, 96, 51, true),   // ring ~180 x 70: stretched a little to the enemy field
  wPillar: FX_SHEET('wrath_pillar_wide.png', 192, 256, 4, 14, 14, 96, 239, false),   // beam ~150 wide; drawn as additive light over the enemy field
  wImpact: FX_SHEET('wrath_impact.png', 128, 80, 4, 12, 15, 64, 67, false),
  wAfter: FX_SHEET('wrath_after_wide.png', 192, 96, 4, 12, 12, 96, 48, false),
  wRingIn: FX_SHEET('wrath_ring_inner.png', 128, 128, 1, 1, 1, 64, 64, true),   // top-down rune circles (create_image_pro), spun in code
  wRingOut: FX_SHEET('wrath_ring_outer.png', 128, 128, 1, 1, 1, 64, 64, true),
  // Dragon's Wrath (mage): the spectral dragon's head (2 frames, open and shut, facing left, anchored on the mouth), the two
  // eyes in the dark, the claw sweep, the molten blast (anchored on its ground line) and one flame spike (tools/build_dragon_wrath.py)
  dHead: FX_SHEET('dragon_head.png', 160, 128, 2, 2, 1, 32, 66, true),
  dEyes: FX_SHEET('dragon_eyes.png', 160, 64, 4, 15, 12, 80, 32, false),
  dClaws: FX_SHEET('dragon_claws.png', 200, 160, 4, 10, 12, 100, 85, false),
  dBlast: FX_SHEET('dragon_blast.png', 103, 116, 4, 12, 12, 51, 76, false),
  dSpike: FX_SHEET('dragon_spike.png', 48, 96, 3, 8, 13, 24, 92, false),
  // Resurrection (cleric): the angel's wings (15 frames: 0-9 unfolding, 10-13 a slow beat, 14 the fullest spread) and
  // body on the same 192x160 canvas, anchored on the middle of the body; the portal (anchored on the ring's centre);
  // three loose feathers (tools/build_resurrection.py)
  rWings: FX_SHEET('res_wings.png', 192, 160, 5, 15, 1, 96, 86, true),
  rBody: FX_SHEET('res_body.png', 192, 160, 1, 1, 1, 96, 86, true),
  rPortal: FX_SHEET('res_portal.png', 180, 144, 4, 16, 12, 90, 38, true),
  rFeather: FX_SHEET('res_feathers.png', 16, 16, 3, 3, 1, 8, 8, true),
  // Time Stop (mage): the clock rune over the staff (0-3 forming, 5-13 loop), the clock face and the toothed ring round it
  // (top-down, spun and squashed onto the floor in code; the hands are drawn in code), the freeze shockwave, the ice
  // crystals round each frozen enemy (the full set behind it, the lower part again in front) and the shatter
  // (tools/build_time_stop.py)
  tsRune: FX_SHEET('ts_rune.png', 64, 64, 4, 14, 12, 32, 32, false),
  tsClock: FX_SHEET('ts_clock.png', 128, 128, 1, 1, 1, 64, 64, true),
  tsGear: FX_SHEET('ts_gear.png', 128, 128, 1, 1, 1, 64, 64, true),
  tsWave: FX_SHEET('ts_wave.png', 192, 64, 4, 10, 11, 96, 32, false),
  tsCrys: FX_SHEET('ts_crystals.png', 80, 56, 4, 10, 12, 40, 49, false),
  tsCrysF: FX_SHEET('ts_crystals_front.png', 80, 56, 4, 10, 12, 40, 49, false),
  tsShatter: FX_SHEET('ts_shatter.png', 96, 96, 4, 12, 16, 48, 48, false),
  // Deadeye (ranger): the lock-on reticle (0-5 spin in and lock, 6-11 pulsing loop), the charge on the arrowhead, the
  // emerald arrow (points right, anchored on its head; rotated in code) and the critical hit starburst (tools/build_deadeye_divine.py)
  deMark: FX_SHEET('de_mark.png', 48, 48, 4, 12, 16, 24, 24, false),
  deCharge: FX_SHEET('de_charge.png', 48, 48, 3, 8, 12, 24, 24, true),
  deArrow: FX_SHEET('de_arrow.png', 64, 24, 3, 6, 12, 58, 12, true),
  deCrit: FX_SHEET('de_crit.png', 96, 96, 4, 12, 16, 48, 48, false),
  // Divine Shield (cleric): the golden dome round a hero (0-5 forming, 6-13 shimmer loop; anchored on the feet), the
  // purifying beam, the holy star on the staff tip and the cleanse symbols that rise off a purified hero
  dsDome: FX_SHEET('ds_dome.png', 132, 100, 4, 14, 12, 66, 83, false),
  dsPurify: FX_SHEET('ds_purify.png', 64, 112, 4, 12, 14, 32, 104, false),
  dsStar: FX_SHEET('ds_star.png', 48, 48, 3, 8, 10, 24, 24, true),
  dsCleanse: FX_SHEET('ds_cleanse.png', 48, 64, 4, 10, 12, 24, 58, false)
};
// Time Stop: the top of the staff in the held Channel frames, from the feet (px), by hero skin
const TS_TIP = { 'mage:f': [-4, -82], 'mage:m': [-11, -92] };
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
    infernoReady.then(() => { if (this.theme === 'inferno') { this._paintKey = null; this.paint(); } });   // the raid cavern's art arrives after the page opens
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
    const pool = this.theme === 'inferno' ? this.bossSpot(Math.round(this.H * frac)) : null;   // the raid: the dragon's rock stands in a lava pool
    const key = [this.W, this.H, this.s, this.cv.width, this.cv.height, this.theme, frac.toFixed(3), pool ? pool.x + ',' + pool.y : ''].join(':');
    if (key === this._paintKey) return;
    this._paintKey = key;
    const d = paintDungeon(this.W, this.H, this.theme, 11, frac, { pool });
    this.bgNative = d.bg; this.fgNative = d.fg;
    this.pool = d.pool || null; this.hot = d.hot || null; this.infernoOn = !!d.pool; this._lip = null;
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

  // where an xl boss's feet go (layout puts it there; the raid cavern paints its lava pool round it)
  bossSpot(ft = this.floorTop) {
    const bottom = Math.min(this.H - 6, this.stage.y + this.stage.h - 4);
    const span = Math.max(30, bottom - ft - 14);
    return { x: Math.round(this.stage.x + this.stage.w * 0.28 - 4), y: Math.round(ft + 14 + span * 0.78) };
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
    if (boss) { const b = this.bossSpot(ft); boss.x = b.x; boss.y = b.y; }
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
    let fx = ev.fx || 'slash';
    if (fx === 'deadeye') {   // its own move on the Shoot animation; with ?vfx=code (or no animation) one plain arrow per enemy
      const own = this.pixelFx && SP.heroAnim(A.skin || A.cls, 'shoot');
      if (own && own.release != null && own.charge != null) return this._deadeyeAnim(A, ev, T, own);
      fx = 'multishot';
    }
    if (ev.skill === 'divine_shield' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'chant'); if (own && own.tips) return this._divineAnim(A, ev, T, own); }
    if (fx === 'meteor') { const own = SP.heroAnim(A.skin || A.cls, 'meteor'); if (own && own.meteor) return this._meteorAnim(A, ev, T, own); }
    if (fx === 'quake') { const own = SP.heroAnim(A.skin || A.cls, 'quake'); if (own && own.quake) return this._quakeAnim(A, ev, T, own); }
    if (ev.skill === 'resurrection' && this.pixelFx) return this._resurrectAnim(A, ev, T);
    if (ev.skill === 'wrath_of_heaven' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'chant'); if (own) return this._wrathAnim(A, ev, T, own); }
    if (fx === 'phantom' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'leap') || SP.heroAnim(A.skin || A.cls, 'shoot'); if (own && own.release != null && own.charge != null) return this._phantomAnim(A, ev, T, own); }
    if (fx === 'starfall' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'volley'); if (own && own.charge != null) return this._starfallAnim(A, ev, T, own); }
    if (ev.skill === 'dragons_wrath' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'cast'); if (own && own.muzzle) return this._dragonAnim(A, ev, T, own); }
    if (fx === 'timestop' && this.pixelFx) { const own = SP.heroAnim(A.skin || A.cls, 'channel'); if (own) return this._timeStopAnim(A, ev, T, own); }
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
      const dest = { x: first.x + this.reachDX(first), y: first.y + 2 };
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
    const dest = cast ? home : { x: first.x + this.reachDX(first) + (anim.dash || 0), y: first.y + 2 };
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
  // How high an actor is off the floor right now (px). setLift eases it from where it is to 'to' over 'ms':
  // 'out' rises fast and slows at the top (a jump), 'in' starts slow and speeds up (a fall).
  _liftOf(a, t = now()) {
    const L = a.liftT; if (!L) return a.lift || 0;
    const k = clamp((t - L.t0) / L.ms, 0, 1), e = L.ease === 'in' ? k * k : L.ease === 'out' ? 1 - (1 - k) * (1 - k) : k;
    a.lift = lerp(L.from, L.to, e); if (k >= 1) a.liftT = null;
    return a.lift;
  }
  // How far the sprite is leaned (radians, round the middle of the body); setTilt eases it like setLift.
  _tiltOf(a, t = now()) {
    const L = a.tiltT; if (!L) return a.tilt || 0;
    const k = clamp((t - L.t0) / L.ms, 0, 1), e = 1 - (1 - k) * (1 - k);
    a.tilt = lerp(L.from, L.to, e); if (k >= 1) a.tiltT = null;
    return a.tilt;
  }
  setTilt(a, to, ms) { a.tiltT = { t0: now(), from: this._tiltOf(a), to, ms: Math.max(1, ms) }; }
  setLift(a, to, ms, ease) { a.liftT = { t0: now(), from: this._liftOf(a), to, ms: Math.max(1, ms), ease }; }
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
        const colr = { slash_heavy: '#ff9a3c', slash_wide: '#ffd0a0', proj_fire: '#ff8a3c', proj_firearrow: '#ff8a3c', flamewave: '#ff8a3c', proj_arcane: '#b8a6ff', missiles: '#b8a6ff', meteor: '#ff6a3d', proj_ice: '#bff6ff', nova_ice: '#bff6ff', timestop: '#cfe8ff', proj_poison: '#9cff6b', venom: '#9cff6b', phantom: '#a8ffe0', lightning: '#fff27a', shadow: '#c6a0ff', dragon: '#ff5030', starfall: '#fff0a8', radiance: '#fff0a8', pillar: '#fff2a8', quake: '#e0a060', combo: '#ffb347', xslash: '#9fd8ff', ricochet: '#fff2c0', deadeye: '#8fffd8' }[fx] || '#ffffff';
        this.hitSparks(p.x, p.y - 16, colr, t.dmg, fx === 'slash' || fx === 'slash_heavy');
        this.elementHit(p.x, p.y - 16, { proj_firearrow: 'proj_fire', flamewave: 'proj_fire', missiles: 'proj_arcane', timestop: 'proj_ice' }[fx] || fx);
        if (fx !== 'phantom' || !this.pixelFx) this.glows.push({ x: p.x, y: p.y - 16, r: 34 + Math.min(40, t.dmg * 1.5), color: colr, t: 0, life: 0.35, a: 0.8 });   // Phantom Volley: its own small flashes
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
    // where he lands: on the nearest enemy (the one furthest right)
    const near = ens.length ? ens.reduce((a, e) => (e.x > a.x ? e : a)) : null;
    const land = near ? { x: near.x + 4, y: near.y + 1 } : { x: A.x - 120, y: A.y };
    // the peak sits on a 45 degree line up from the enemy, as high as the screen allows (the burning greatsword over his
    // shoulder has to stay on screen): 50-100px above it. He runs up to a launch spot and leaps to it at 70 degrees.
    const TOPROOM = 86, k70 = 1 / Math.tan(70 * Math.PI / 180);   // the wind-up pose and its flames reach ~82px above the feet
    const drop = Math.max(50, Math.min(100, land.y - TOPROOM));
    const peak = { x: land.x + drop, y: land.y - drop };
    const rise = Math.max(40, A.y - peak.y);
    const launch = { x: peak.x + rise * k70, y: peak.y + rise };
    const apex = { x: peak.x - A.x, y: peak.y - A.y };
    const left = ens.length ? Math.min(...ens.map(e => e.x)) : land.x - 60, gy = ens.length ? ens.reduce((a, e) => a + e.y, 0) / ens.length : land.y;
    this.cam = { x: (A.x + left) / 2, y: (peak.y + land.y) / 2, t0, dur: T(acc + 380), z: 1.04, vig: 0.15 };   // light vignette: he leaps to the top edge
    this.move(A, launch.x - A.x, launch.y - A.y, T(at[Q.jumpAt] - 10));   // the run-up (crouched)
    sfx('whirl');
    // 1. the leap
    when(Q.jumpAt, () => { this.move(A, apex.x, apex.y, T(at[Q.spinAt] - at[Q.jumpAt])); this.burst(launch.x, launch.y, '#d8c8b0', 14, 30, 30); sfx('whoosh'); });   // rising all through the charge, slowing at the top
    // 2. the blade bursts into flame as he rises
    when(Q.holdAt[0], () => {
      const holdMs = at[Q.spinAt] - at[Q.holdAt[0]];
      this.mets.push({ kind: 'fblade', follow: A, len: Q.blade || 28, t0: now(), life: T(holdMs + 200), hold: T(holdMs) });
      sfx('burn'); sfx('charge');
    });
    // 3. the spin dive: straight down a 45 degree line onto the enemy, turning over inside a spinning ball of fire
    when(Q.spinAt, () => {
      const ms = T(at[anim.hit] - at[Q.spinAt]);
      A.spin = { t0: now(), dur: ms, turns: 2.5 };
      this.move(A, land.x - A.x, land.y - A.y, ms, true, true);
      this.mets.push({ kind: 'wheel', follow: A, t0: now(), life: ms + T(60) });
      sfx('whirl');
    });
    // 4. impact: a fire burst where he lands, then flames erupt from the ground in a wave across the enemies
    when(anim.hit, () => {
      A.spin = null;
      this.shake = Math.max(this.shake, 11); this.shakeT = now(); this.flash = Math.max(this.flash || 0, 0.15); this.freezeUntil = now() + 130;
      const ox = land.x - 8, oy = land.y;
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
    const frameXY = (S, age, sx, sy, x, y) => {   // a frame stretched to sx by sy (the Wrath of Heaven circle, pillar and sigil cover the whole enemy side)
      if (!S.img.complete || !S.img.naturalWidth) return;
      let f = Math.floor(age / 1000 * S.fps); if (S.loop) f %= S.n; else if (f >= S.n) return;
      n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(x - S.ax * sx), Math.round(y - S.ay * sy), Math.round(S.w * sx), Math.round(S.h * sy));
    };
    for (const m of this.mets) {
      const age = t - m.t0; if (age < 0 || age > m.life) continue;
      if (m.kind === 'rock') { const e = Math.pow(age / m.life, 1.6); frame(PFX.rock, age, 2, lerp(m.from.x, m.to.x, e), lerp(m.from.y, m.to.y, e)); }
      else if (m.kind === 'boom') frame(PFX.boom, age * 0.9, m.w > 70 ? 2 : 1, m.x, m.y + 2);
      else if (m.kind === 'geyser') frame(PFX.geyser, age * 1.15, 1, m.x, m.y + 2);
      else if (m.kind === 'wheel' && PFX.vortex.img.complete && PFX.vortex.img.naturalWidth) {   // he dives inside a spinning ball of fire
        const a = m.follow, cx = Math.round(a.x + a.ox), cy = Math.round(a.y + a.oy - 24), k = age / m.life;
        const sc = Math.min(1, age / 90) * (k > 0.85 ? 1 - (k - 0.85) / 0.3 : 1);
        n.save(); n.translate(cx, cy); n.rotate(-age / 1000 * Math.PI * 2 * 3.2); n.scale(sc * 2, sc * 2);   // 170px across
        n.drawImage(PFX.vortex.img, -42.5, -42.5); n.restore();
      }
      else if (m.kind === 'whalo') frame(PFX.wHalo, age, 1, m.follow.x + m.follow.ox - 2, m.follow.y + m.follow.oy - 66);
      else if (m.kind === 'waura') frame(PFX.wAura, age, 1, m.follow.x + m.follow.ox, m.follow.y + m.follow.oy);
      else if (m.kind === 'wmark') { n.globalAlpha = Math.min(1, 0.35 + age / m.life); frameXY(PFX.wMark, age * (1 + age / m.life), m.sx, m.sy, m.x, m.y); n.globalAlpha = 1; }   // pulses faster and brighter
      else if (m.kind === 'wpillar') {   // as wide as the enemy field; slams down, holds (its shimmer frames looped), then retracts
        const fd = 1000 / 14, f = age < m.slam ? Math.floor(age / fd) : age < m.hold ? 2 + Math.floor((age - m.slam) / fd) % 8 : Math.min(13, 10 + Math.floor((age - m.hold) / fd));
        n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = 0.42; frameXY(PFX.wPillar, (f + 0.5) * fd, m.sx, 1, m.x, m.y); n.restore();
      }
      else if (m.kind === 'wring') {   // a rune circle spun flat on the ground: rotate, then squash into perspective
        const S = [PFX.wRingIn, PFX.wMark, PFX.wRingOut][m.ring]; if (!S.img.complete || !S.img.naturalWidth) continue;
        const k = age / m.life, appear = Math.min(1, age / 260), e = 1 - Math.pow(1 - appear, 3);
        const spin = m.dir * (age / 1000) * (0.7 + 0.5 * k) * (m.ring === 1 ? 1 : 1.3);
        n.save(); n.translate(Math.round(m.x), Math.round(m.y)); n.scale(1, m.q); n.rotate(spin);
        n.globalAlpha = e * Math.min(1, 0.55 + 0.6 * k) * (m.fade ? clamp((m.life - age) / m.fade, 0, 1) : 1);   // fade: fade out over the last ms instead of vanishing
        const D = m.w * (0.7 + 0.3 * e);
        if (m.ring === 1) {   // the middle circle is the perspective ellipse: undo its squash so it spins round
          const f = Math.floor(age / 1000 * S.fps * (1 + k)) % S.n; n.scale(D / 180, D / 180 * 180 / 70);
          n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, -S.ax, -S.ay, S.w, S.h);
        } else { const r = D / S.w; n.scale(r, r); n.drawImage(S.img, -S.w / 2, -S.h / 2); }
        n.restore();
      }   // as wide as the enemy field; the enemies show through it
      else if (m.kind === 'wimpact') frame(PFX.wImpact, age, 1, m.x, m.y);
      // ---- Time Stop
      else if (m.kind === 'tsrune') {   // forms (0-3), then hovers on its loop (5-13) over the staff
        const S = PFX.tsRune; if (!S.img.complete || !S.img.naturalWidth) continue;
        let f = Math.floor(age / 1000 * S.fps); if (f > 4) f = 5 + (f - 5) % 9;
        const p = m.at(), fade = clamp((m.life - age) / 160, 0, 1);
        n.save(); n.globalAlpha = fade; n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(p.x - S.ax), Math.round(p.y - S.ay), S.w, S.h);
        n.globalCompositeOperation = 'lighter'; n.globalAlpha = fade * (0.18 + 0.12 * Math.sin(t / 90));
        n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(p.x - S.ax), Math.round(p.y - S.ay), S.w, S.h); n.restore();
      }
      else if (m.kind === 'tsgather') {   // blue energy spiralling in to the rune
        const p = m.at(), env = Math.min(1, age / 200);
        for (let j = 0; j < (this.lowPower ? 1 : 2); j++) {
          if (Math.random() > 0.8 * env) continue;
          const qd = Math.random() * Math.PI * 2, r = 26 + Math.random() * 22, v = 2.4;
          this.particles.push({ x: p.x + Math.cos(qd) * r, y: p.y + Math.sin(qd) * r * 0.8, vx: -Math.sin(qd) * r * 1.4 - Math.cos(qd) * r * v, vy: Math.cos(qd) * r * 1.1 - Math.sin(qd) * r * 0.8 * v, g: 0, life: 0.36, t: 0, c: ['#ffffff', '#bfe6ff', '#6fc8ff', '#b8a6ff'][Math.floor(Math.random() * 4)], streak: 2, drag: 0.94 });
        }
      }
      else if (m.kind === 'tscrys') this._drawTsCrystals(n, m, t, PFX.tsCrysF);   // the lower part again, in front: the enemy stands encased
      else if (m.kind === 'tsmotes') {   // drift in, then hang perfectly still and twinkle until time resumes
        const k = ease(clamp(age / (m.tS - m.t0), 0, 1));
        if (!m.blown) for (const p of m.pts) {
          const x = Math.round(p.x + p.dx * k), y = Math.round(p.y + p.dy * k);
          n.globalAlpha = Math.min(1, age / 200) * (0.55 + 0.45 * Math.sin(t / 160 + p.ph));
          n.fillStyle = p.c;
          if (p.plus) { n.fillRect(x - 1, y, 3, 1); n.fillRect(x, y - 1, 1, 3); } else n.fillRect(x, y, 1, 1);
        }
        n.globalAlpha = 1;
        if (t >= m.tR && !m.blown) {   // time resumes: they fly off
          m.blown = true;
          for (const p of m.pts) { const x = p.x + p.dx, y = p.y + p.dy, dx = x - m.cx, dy = y - m.cy, r = Math.hypot(dx, dy) || 1; this.particles.push({ x, y, vx: dx / r * (80 + Math.random() * 70), vy: dy / r * 60 - 20, g: 30, life: 0.4 + Math.random() * 0.3, t: 0, c: p.c, streak: 3, drag: 0.9 }); }
        }
      }
      else if (m.kind === 'tsshatter') { n.save(); n.globalCompositeOperation = 'lighter'; frame(PFX.tsShatter, age, m.sc, m.x, m.y); n.restore(); n.globalAlpha = 1; }
      // ---- Resurrection
      else if (m.kind === 'rhalo') frame(PFX.wHalo, age, 1, m.follow.x + m.follow.ox - 2, m.follow.y + m.follow.oy - m.dy);   // over the kneeling cleric's head
      else if (m.kind === 'rmotes') {   // golden motes floating up off the floor and gathering round the fallen hero
        const env = Math.min(1, age / 250, (m.life - age) / 300);
        if (Math.random() < 0.9 * env * (this.lowPower ? 0.5 : 1)) {
          const q = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14, dx = Math.cos(q) * r;
          this.particles.push({ x: m.x + dx, y: m.y + Math.sin(q) * r * 0.3, vx: -dx * 0.9, vy: -22 - Math.random() * 22, g: 0, life: 0.7 + Math.random() * 0.5, t: 0,
            c: ['#ffe27a', '#fff2c0', '#ffc24a'][Math.floor(Math.random() * 3)], plus: Math.random() < 0.25, fade: true });
        }
      }
      else if (m.kind === 'rportal') {   // opens out of a sliver of light, swirls, then closes back to nothing
        const S = PFX.rPortal, op = ease(clamp(age / m.open, 0, 1)), cl = clamp((m.life - age) / m.close, 0, 1), k = op * ease(cl);
        if (k > 0.01) { n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = Math.min(1, 0.4 + k);
          frameXY(S, age, 0.15 + 0.85 * k, 0.05 + 0.95 * k, m.x, m.y); n.restore(); }
      }
      else if (m.kind === 'rangel') this._drawAngel(n, m, t);
      else if (m.kind === 'rspirit') {   // a golden copy of the hero, standing, rising out of the body and sinking back in
        const F = m.follow, wf = SP.heroWhite(F.skin || F.cls, F.variant, 'idle0'); if (!wf) continue;
        const rise = age < m.up ? ease(age / m.up) : age < m.hold ? 1 : 1 - easeIn(clamp((age - m.hold) / (m.life - m.hold), 0, 1));
        const x = Math.round(F.x + F.ox - SP.ANCHOR_X), y = Math.round(F.y + F.oy - SP.ANCHOR_Y - 22 * rise);
        const al = Math.min(1, age / 180) * (0.75 + 0.2 * Math.sin(t / 70));
        n.save(); n.globalCompositeOperation = 'lighter';
        n.globalAlpha = al * 0.3; const rim = this.tinted(wf, '#fff6c8');
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) n.drawImage(rim, x + ox, y + oy);
        n.globalAlpha = al * 0.42; n.drawImage(this.tinted(wf, '#e8a83a'), x, y);
        n.restore();
        if (Math.random() < 0.6) this.particles.push({ x: x + SP.ANCHOR_X + (Math.random() - 0.5) * 16, y: y + SP.ANCHOR_Y - Math.random() * 46, vx: 0, vy: -10 - Math.random() * 14, g: 0, life: 0.5, t: 0, c: Math.random() < 0.5 ? '#fff2c0' : '#ffd86a', fade: true });
      }
      else if (m.kind === 'rorbit') {   // sacred symbols circling the fallen hero's chest
        const F = m.follow, cx = F.x + F.ox, cy = F.y + F.oy - 22, env = Math.min(1, age / 300, (m.life - age) / 250);
        for (let i = 0; i < 6; i++) {
          const q = age / 520 + i * Math.PI / 3, x = Math.round(cx + Math.cos(q) * 17), y = Math.round(cy + Math.sin(q) * 6 + Math.sin(age / 200 + i) * 2);
          n.globalAlpha = env * (Math.sin(q) > 0 ? 1 : 0.45);
          n.fillStyle = i % 2 ? '#ffe27a' : '#fff6c8';
          if (i % 3 === 0) { n.fillRect(x, y - 2, 1, 5); n.fillRect(x - 1, y - 1, 3, 1); }           // a small cross
          else if (i % 3 === 1) { n.fillRect(x, y - 1, 1, 3); n.fillRect(x - 1, y, 3, 1); }          // a twinkle
          else { n.fillRect(x, y - 1, 1, 1); n.fillRect(x - 1, y, 1, 1); n.fillRect(x + 1, y, 1, 1); n.fillRect(x, y + 1, 1, 1); }   // a diamond
        }
        n.globalAlpha = 1;
      }
      else if (m.kind === 'rfeather') {   // drifts down, swaying and turning over as it goes
        const S = PFX.rFeather; if (!S.img.complete || !S.img.naturalWidth) continue;
        const s = age / 1000, sw = Math.sin(s * 3 + m.ph);
        const x = m.x + m.vx * s * Math.exp(-s * 2) + sw * m.sway, y = m.y + m.vy * s * Math.exp(-s * 2) + m.fall * s * s * 0.6 + m.fall * s;
        n.save(); n.globalAlpha = Math.min(1, age / 150, (m.life - age) / 400);
        n.translate(Math.round(x), Math.round(y)); n.rotate(sw * 0.6); if (Math.cos(s * 3 + m.ph) < 0) n.scale(-1, 1);
        n.drawImage(S.img, m.idx * 16, 0, 16, 16, -8, -8, 16, 16);
        n.globalCompositeOperation = 'lighter'; n.globalAlpha *= 0.45; n.drawImage(this.tinted(S.img, '#fff2c0'), m.idx * 16, 0, 16, 16, -8, -8, 16, 16); n.restore();   // luminous
      }
      else if (m.kind === 'wafter') frameXY(PFX.wAfter, age, m.sx, m.sy, m.x, m.y);
      else if (m.kind === 'pcharge') {   // Phantom Volley: spirit motes spiral in round the arrow; the charge orb once the bow is drawn
        if (age >= m.orb) frame(PFX.pCharge, age - m.orb, 1, m.x, m.y);
        if (age < m.life - 40 && Math.random() < (age >= m.orb ? 0.85 : 0.5) * (this.lowPower ? 0.5 : 1)) {
          const q = Math.random() * Math.PI * 2, r = 9 + Math.random() * 13, cq = Math.cos(q), sq = Math.sin(q);
          this.particles.push({ x: m.x + cq * r, y: m.y + sq * r, vx: (-cq * 1.7 - sq * 2.4) * r, vy: (-sq * 1.7 + cq * 2.4) * r, g: 0, life: 0.32, t: 0,
            c: ['#7affd8', '#c8fff0', '#a8c8ff', '#b48cff'][Math.floor(Math.random() * 4)], plus: Math.random() < 0.2, fade: true });
        }
      }
      else if (m.kind === 'pimpact') frame(PFX.pImpact, age, 1, m.x, m.y);
      else if (m.kind === 'parrow') {   // a ghost arrow: thin luminous trail (cyan to violet), two after-images, the arrow
        const k = Math.min(1, age / m.life), P = this._pvAt(m, k);
        m.pts.push({ x: P.x, y: P.y, t }); while (m.pts.length > 2 && t - m.pts[0].t > 140) m.pts.shift();
        for (let j = 1; j < m.pts.length; j++) { const q = j / m.pts.length; n.globalAlpha = m.a * (0.25 + 0.75 * q); this.pxLine(n, m.pts[j - 1], m.pts[j], q > 0.65 ? '#7affd8' : q > 0.3 ? '#8fb8ff' : '#9a7aff'); }
        const S = PFX.pArrow;
        if (S.img.complete && S.img.naturalWidth) {
          const f = Math.floor(age / 1000 * S.fps) % S.n;
          for (const [lag, al] of [[60, 0.2], [30, 0.4], [0, 1]]) {
            if (lag && age < lag) continue;
            const Q = lag ? this._pvAt(m, Math.max(0, (age - lag) / m.life)) : P;
            n.save(); n.globalAlpha = m.a * al; if (lag) n.globalCompositeOperation = 'lighter';
            n.translate(Math.round(Q.x), Math.round(Q.y)); n.rotate(Math.atan2(Q.dy, Q.dx));
            n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, -S.ax, -S.ay, S.w, S.h); n.restore();
          }
        }
        n.globalAlpha = 1;
        if (Math.random() < 0.5) this.particles.push({ x: P.x, y: P.y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10 - 4, g: 0, life: 0.3 + Math.random() * 0.25, t: 0, c: Math.random() < 0.5 ? '#9a7aff' : '#a8ffe0', fade: true });
      }
      else if (m.kind === 'scharge') { const tip = this._tipAt(m.follow); if (tip) frame(PFX.sCharge, age, 1, tip.x, tip.y); }
      else if (m.kind === 'sburst') frame(PFX.sBurst, age, 1, m.x, m.y);
      else if (m.kind === 'simpact') frame(PFX.sImpact, age, 1, m.x, m.y);
      else if (m.kind === 'sarrow' || m.kind === 'sdrop') {   // a star arrow in flight: turned along its path, stardust left behind
        const k = Math.min(1, age / m.life);
        let x, y, dx, dy;
        if (m.kind === 'sarrow') { const u = 1 - k; x = u * u * m.from.x + 2 * u * k * m.ctrl.x + k * k * m.to.x; y = u * u * m.from.y + 2 * u * k * m.ctrl.y + k * k * m.to.y; dx = 2 * u * (m.ctrl.x - m.from.x) + 2 * k * (m.to.x - m.ctrl.x); dy = 2 * u * (m.ctrl.y - m.from.y) + 2 * k * (m.to.y - m.ctrl.y); }
        else { const e = k * k; x = lerp(m.from.x, m.to.x, e); y = lerp(m.from.y, m.to.y, e); dx = m.to.x - m.from.x; dy = m.to.y - m.from.y; }
        const S = PFX.sArrow;
        if (S.img.complete && S.img.naturalWidth) {
          const f = Math.floor(age / 1000 * S.fps) % S.n;
          n.save(); n.translate(Math.round(x), Math.round(y)); n.rotate(Math.atan2(dy, dx));
          n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, -S.ax - 10, -S.ay, S.w, S.h); n.restore();
        }
        const cols = ['#bfe8ff', '#8fb8ff', '#b48cff', '#ffe08a', '#ffffff'];
        for (let j = 0; j < (m.kind === 'sarrow' ? 3 : 2); j++) this.particles.push({ x: x + (Math.random() - 0.5) * 4, y: y + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14 + 6, g: 0, life: 0.45 + Math.random() * 0.4, t: 0, c: cols[Math.floor(Math.random() * cols.length)], plus: Math.random() < 0.3, fade: true });
      }
      // ---- Deadeye
      else if (m.kind === 'demark') {   // spins in and locks (0-5), then pulses (6-11) on the enemy until its arrow lands
        const S = PFX.deMark; if (!S.img.complete || !S.img.naturalWidth) continue;
        const f0 = Math.floor(age / 1000 * S.fps), f = f0 < 6 ? f0 : 6 + (f0 - 6) % 6, p = this._hitPoint(m.follow);
        const sx = (f % S.cols) * S.w, sy = Math.floor(f / S.cols) * S.h, dx = Math.round(p.x - S.ax), dy = Math.round(p.y - S.ay);
        n.drawImage(S.img, sx, sy, S.w, S.h, dx, dy, S.w, S.h);
        n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = 0.6; n.drawImage(S.img, sx, sy, S.w, S.h, dx, dy, S.w, S.h); n.restore();   // brighter, so the thin lines read over any enemy
      }
      else if (m.kind === 'desight') {   // a flickering dashed sight line from the bow to the reticle
        const p = this._hitPoint(m.follow), L = Math.hypot(p.x - m.from.x, p.y - m.from.y), N = Math.max(2, Math.floor(L / 6)), sh = Math.floor(age / 50) % 2;
        n.globalAlpha = (0.35 + 0.25 * Math.sin(age / 40)) * Math.min(1, age / 120);
        for (let j = sh; j < N - 1; j += 2) { const a = j / N, b = (j + 1) / N; this.pxLine(n, { x: lerp(m.from.x, p.x, a), y: lerp(m.from.y, p.y, a) }, { x: lerp(m.from.x, p.x, b), y: lerp(m.from.y, p.y, b) }, j % 4 ? '#3fbf8f' : '#8fffd8'); }
        n.globalAlpha = 1;
      }
      else if (m.kind === 'decharge') {   // energy gathering on the arrowhead, streaks spiralling in
        frame(PFX.deCharge, age, 1, m.x, m.y);
        if (age < m.life - 40 && Math.random() < 0.8 * (this.lowPower ? 0.5 : 1)) {
          const q = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14, cq = Math.cos(q), sq = Math.sin(q);
          this.particles.push({ x: m.x + cq * r, y: m.y + sq * r, vx: (-cq * 2.2 - sq * 1.6) * r, vy: (-sq * 2.2 + cq * 1.6) * r, g: 0, life: 0.3, t: 0, c: ['#8fffd8', '#3fbf8f', '#ffffff'][Math.floor(Math.random() * 3)], streak: 2 });
        }
      }
      else if (m.kind === 'dearrow') {   // the emerald arrow: a mint trail, then the arrow turned along its path
        const k = Math.min(1, age / m.life), P = this._pvAt(m, k);
        m.pts.push({ x: P.x, y: P.y, t }); while (m.pts.length > 2 && t - m.pts[0].t > 110) m.pts.shift();
        for (let j = 1; j < m.pts.length; j++) { const q = j / m.pts.length; n.globalAlpha = 0.3 + 0.7 * q; this.pxLine(n, m.pts[j - 1], m.pts[j], q > 0.6 ? '#8fffd8' : '#2ea87a'); }
        n.globalAlpha = 1;
        const S = PFX.deArrow;
        if (S.img.complete && S.img.naturalWidth) {
          const f = Math.floor(age / 1000 * S.fps) % S.n;
          n.save(); n.translate(Math.round(P.x), Math.round(P.y)); n.rotate(Math.atan2(P.dy, P.dx));
          n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, -S.ax, -S.ay, S.w, S.h); n.restore();
        }
      }
      else if (m.kind === 'decrit') frame(PFX.deCrit, age, 1, m.x, m.y);
      // ---- Divine Shield
      else if (m.kind === 'dsstar') { const tp = this._tipAt(m.follow); if (tp) { m.last = tp; frame(PFX.dsStar, age, 1, tp.x, tp.y); } else if (m.last) frame(PFX.dsStar, age, 1, m.last.x, m.last.y); }
      else if (m.kind === 'dsbolt') {   // a mote of holy light flying from the staff to a hero, sparkles trailing
        const k = Math.min(1, age / m.life), P = this._pvAt(m, ease(k));
        m.pts.push({ x: P.x, y: P.y, t }); while (m.pts.length > 2 && t - m.pts[0].t > 160) m.pts.shift();
        for (let j = 1; j < m.pts.length; j++) { const q = j / m.pts.length; n.globalAlpha = 0.25 + 0.75 * q; this.pxLine(n, m.pts[j - 1], m.pts[j], q > 0.6 ? '#fff6c8' : '#f6c453'); }
        n.globalAlpha = 1; n.fillStyle = '#ffffff'; n.fillRect(Math.round(P.x) - 1, Math.round(P.y) - 1, 3, 3);
        n.fillStyle = '#ffe27a'; n.fillRect(Math.round(P.x) - 2, Math.round(P.y), 5, 1); n.fillRect(Math.round(P.x), Math.round(P.y) - 2, 1, 5);
        if (Math.random() < 0.7) this.particles.push({ x: P.x, y: P.y, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14 + 8, g: 10, life: 0.4 + Math.random() * 0.3, t: 0, c: Math.random() < 0.5 ? '#fff6c8' : '#ffd86a', plus: Math.random() < 0.3, fade: true });
      }
      else if (m.kind === 'dspurify') { n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = 0.38; frame(PFX.dsPurify, age, 1, m.x, m.y + 1); n.restore(); }
      else if (m.kind === 'dscleanse') frame(PFX.dsCleanse, age, 1, m.x, m.y + 28);
      else if (m.kind === 'dhead' && this._dheadPose(m, t).front) this._drawDragonHead(n, m, t);
      else if (m.kind === 'dclaws') { n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = 0.9; frame(PFX.dClaws, age, m.sc, m.x, m.y); n.restore(); }
      else if (m.kind === 'dblast') frame(PFX.dBlast, age, m.sc, m.x, m.y);
      else if (m.kind === 'dspike') frame(PFX.dSpike, age, m.sc, m.x, m.y);
      else if (m.kind === 'fblade' && age < m.hold) {   // the blade on fire while he holds it up (not once he starts to spin)
        const A = m.follow, girl = String(A.skin || '').endsWith(':f');
        if (A.cls === 'knight') { n.globalAlpha = Math.min(1, age / 160); frame(girl ? PFX.gsfF : PFX.gsf, age, 1, A.x + A.ox, A.y + A.oy); n.globalAlpha = 1; continue; }
        const tip = this._tipAt(m.follow); if (!tip) continue;
        // the fire's base (30px below its anchor) sits on the crossguard, m.len px below the tip
        n.globalAlpha = Math.min(1, age / 160); frame(PFX.blade, age, 1, tip.x, tip.y + (m.len - 30)); n.globalAlpha = 1;
      }
    }
  }
  // Starfall with PixelLab effects (public/art/fx/starfall_*): the ranger's Volley animation draws and aims straight up
  // while celestial energy gathers on the arrowhead (charge), looses the arrow (hit), which curves up over the enemies
  // trailing stardust and bursts into a star. Then luminous arrows rain down at different angles, one per hit in each of
  // the skill's waves (plus a few strays), each landing in a star-shaped flash that fades into tiny stars.
  _starfallAnim(A, ev, T, anim) {
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && t.dmg != null);
    const ens = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const t0 = now();
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    setTimeout(() => { A.anim = null; }, T(acc + 60));
    this.cam = { x: A.x - 30, y: A.y - 40, t0, dur: T(at[anim.hit] + 320), z: 1.06 };
    const when = (f, fn) => setTimeout(fn, T(at[f]));
    // 1. cast: energy gathers on the arrowhead while the bow is drawn and held
    when(anim.charge, () => { this.mets.push({ kind: 'scharge', follow: A, t0: now(), life: T(at[anim.hit] - at[anim.charge] + 40) }); sfx('twinkle'); sfx('charge'); });
    // 2. launch: the arrow curves up to a point above the enemies
    const cx = ens.length ? ens.reduce((a, e) => a + e.x, 0) / ens.length : A.x - 150;
    const sky = { x: cx, y: Math.max(28, (ens.length ? Math.min(...ens.map(e => e.y)) : A.y) - 115) };
    const fly = 520;
    when(anim.hit, () => {
      const tip = this._tipAt(A) || { x: A.x, y: A.y - 80 };
      this.mets.push({ kind: 'sarrow', from: tip, ctrl: { x: (tip.x + sky.x) / 2 + 30, y: Math.min(tip.y, sky.y) - 60 }, to: sky, t0: now(), life: T(fly) });
      this.glows.push({ x: tip.x, y: tip.y, r: 24, color: '#bfe0ff', t: 0, life: 0.3, a: 0.9 });
      sfx('bow'); sfx('rise');
    });
    // 3. the arrow bursts into a star
    const burstAt = at[anim.hit] + fly;
    setTimeout(() => {
      this.mets.push({ kind: 'sburst', x: sky.x, y: sky.y, t0: now(), life: T(860) });
      this.glows.push({ x: sky.x, y: sky.y, r: 70, color: '#bfe0ff', t: 0, life: 0.5, a: 0.9 });
      this.flash = Math.max(this.flash || 0, 0.08); sfx('twinkle'); sfx('zap');
    }, T(burstAt));
    // 4. starfall: each wave, one arrow per hit (from somewhere in the burst, so they come in at different angles) and a
    // few strays that land between the enemies
    const waves = Math.max(1, ...tgt.map(t => (t.wave || 0) + 1)), gap = 300, drop = 280;
    let end = burstAt;
    for (let w = 0; w < waves; w++) {
      const recs = tgt.filter(t => (t.wave || 0) === w), start = burstAt + 160 + w * gap;
      const shots = recs.map(r => ({ rec: r, e: this.actors.get(r.id) })).filter(s => s.e);
      for (let k = 0; k < 2; k++) shots.push({ stray: true, e: ens[Math.floor(Math.random() * ens.length)] });
      shots.forEach((s, j) => {
        if (!s.e) return;
        const from = { x: sky.x + (Math.random() - 0.5) * 110, y: sky.y + (Math.random() - 0.5) * 24 };
        const to = { x: s.e.x + (s.stray ? (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 20) : (Math.random() - 0.5) * 10), y: s.e.y + (s.stray ? (Math.random() - 0.5) * 14 : 0) - 1 };
        const t1 = start + j * 45;
        setTimeout(() => this.mets.push({ kind: 'sdrop', from, to, t0: now(), life: T(drop) }), T(t1));
        setTimeout(() => {
          this.mets.push({ kind: 'simpact', x: to.x, y: to.y, t0: now(), life: T(860) });
          this.glows.push({ x: to.x, y: to.y - 6, r: 30, color: '#bfe0ff', t: 0, life: 0.3, a: 0.9 });
          if (s.rec) { this.impact(ev, tgt, 'starfall', rc, [s.rec], true); this.shake = Math.max(this.shake, 3); this.shakeT = now(); }
          else sfx('twinkle');
        }, T(t1 + drop));
        end = Math.max(end, t1 + drop);
      });
    }
    setTimeout(() => this._applyAfter(ev), T(end + 80));
    return T(Math.max(acc, end + 700));
  }
  // a ghost arrow's point and heading along its curve (quadratic bezier from -> ctrl -> to)
  _pvAt(m, k) {
    const u = 1 - k;
    return { x: u * u * m.from.x + 2 * u * k * m.ctrl.x + k * k * m.to.x, y: u * u * m.from.y + 2 * u * k * m.ctrl.y + k * k * m.to.y,
      dx: 2 * u * (m.ctrl.x - m.from.x) + 2 * k * (m.to.x - m.ctrl.x), dy: 2 * u * (m.ctrl.y - m.from.y) + 2 * k * (m.to.y - m.ctrl.y) };
  }
  // Phantom Volley with PixelLab effects (public/art/fx/phantom_*), built on the ranger's Shoot animation:
  // 1. Phantom draw: the draw plays twice as fast while cyan after-images of the arms and bow trail behind (the sprite's
  //    own silhouette, so only the moving parts show), and spirit motes spiral in round the arrowhead; at full draw the
  //    spectral charge glows on the tip.
  // 2. Rapid release: up to three arrows, release - recoil - redraw, each with a sharp cyan flash at the bow.
  // 3. Spectral duplication: halfway to the enemies each arrow flashes and splits into phantom copies (one per hit it
  //    carries, plus a stray or two) that fan out on different curves, staggered so they trail after-images.
  // 4. Phantom barrage: each copy strikes with a small cyan flash and spectral burst (its own damage number and Poison).
  // 5. Spirit dissipation: the arrows vanish into blue-violet wisps, their trails break into drifting motes, and the
  //    ranger recoils back to idle.
  _phantomAnim(A, ev, T, shoot) {
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const ens = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    if (!ens.length) { this._applyAfter(ev); return T(600); }
    // the timeline: the draw (or, with the leap animation, the spring up into the air), a held full draw, then
    // release / recoil / redraw for each arrow, then the recoil to idle (or the drop and landing)
    const LP = shoot.leap, nShots = 24;   // arrows loosed in the rapid release (the hits are spread across them)
    const tl = [], relIdx = []; let holdIdx, fallIdx = -1, landIdx = -1;
    if (LP) {
      for (const [f, ms] of shoot.timeline) if (f < LP.aim) tl.push([f, ms]);
      holdIdx = tl.length; tl.push([LP.aim, 600]);
      for (let i = 0; i < nShots; i++) { relIdx.push(tl.length); tl.push([LP.loose, 30], [LP.redraw, 25]); if (i < nShots - 1) tl.push([LP.aim, 25]); }
      tl.push([LP.aim, 120]);
      for (const [f, ms] of shoot.timeline) if (f > LP.redraw) { if (f === LP.fallAt) fallIdx = tl.length; if (f === LP.landAt) landIdx = tl.length; tl.push([f, ms]); }
    } else {
      const frs = shoot.timeline.map(x => x[0]), C0 = shoot.charge, R0 = shoot.release, R1 = frs.includes(R0 + 1) ? R0 + 1 : R0;
      for (const f of frs) if (f < C0) tl.push([f, 38]);
      holdIdx = tl.length; tl.push([C0, 640]);
      for (let i = 0; i < nShots; i++) { relIdx.push(tl.length); tl.push([R0, 25], [R1, 25]); if (i < nShots - 1) tl.push([C0, 30]); }
      const tail = shoot.timeline.filter(x => x[0] > R1);
      if (tail.length) for (const x of tail) tl.push([x[0], x[1]]); else tl.push([R1, 220]);
    }
    const anim = Object.assign({}, shoot, { timeline: tl });
    const at = []; let acc = 0; for (const [, ms] of tl) { at.push(acc); acc += ms; }
    const t0 = now(), lastRel = at[relIdx[nShots - 1]];
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    setTimeout(() => { if (A.anim && A.anim.d === anim) A.anim = null; }, T(acc + 60));
    // the leap: from 'jumpAt' she springs up (fast, easing out at the top) and leans forward so the drawn arrow points
    // 45 degrees down at the enemies; she hangs there for the whole barrage, then drops and lands
    const H = LP ? LP.height : 0, TILT = LP ? -(45 - LP.aimDeg) * Math.PI / 180 : 0;
    if (LP) {
      const j = tl.findIndex(x => x[0] === LP.jumpAt), up = at[holdIdx] - at[j];
      setTimeout(() => { this.setLift(A, H, T(up + 60), 'out'); this.setTilt(A, TILT, T(up + 60)); sfx('whoosh'); this.burst(A.x + A.ox, A.y + A.oy - 2, '#a8ffe0', 10, 40, 0); }, T(at[j]));
      setTimeout(() => { this.setLift(A, 0, T(at[landIdx] - at[fallIdx]), 'in'); this.setTilt(A, 0, T(at[landIdx] - at[fallIdx])); }, T(at[fallIdx]));
      setTimeout(() => { this.burst(A.x + A.ox, A.y + A.oy - 1, '#a8c8ff', 12, 36, 0); this.shake = Math.max(this.shake, 2); this.shakeT = now(); sfx('stomp'); }, T(at[landIdx]));
      setTimeout(() => { A.lift = 0; A.liftT = null; A.tilt = 0; A.tiltT = null; }, T(acc + 80));
    }
    this.cam = { x: A.x - 50, y: A.y - 38 - H * 0.6, t0, dur: T(at[relIdx[0]] + 160), z: 1.07 };
    // where the arrow tip is at full draw: the muzzle (px from the feet) turned with her lean round the middle of her body
    const [mx, my] = shoot.muzzle || [-30, -40];
    const cs = Math.cos(TILT), sn = Math.sin(TILT), qy = my + 30;
    const tip = { x: A.x + A.ox + mx * cs - qy * sn, y: A.y + A.oy - H - 30 + mx * sn + qy * cs };
    // 1. phantom draw: after-images of the moving arms and bow (cyan silhouettes behind the sprite) through the draw and
    // every rapid release
    const ghost = (ga = 0.55) => {
      if (!A.anim || A.anim.d !== anim) return;
      const an = this._animAt(A, now()); if (!an) return;
      const lift = this._liftOf(A), rot = this._tiltOf(A), fx0 = A.x + A.ox, fy0 = A.y + A.oy - lift;
      this.ghosts.push({ img: this.tinted(an.wh, '#7affd8'), x: Math.round(fx0 - an.ax), y: Math.round(fy0 - an.ay), rot, px: Math.round(fx0), py: Math.round(fy0 - 30), t0: now(), life: T(230), a: ga, add: true });
    };
    for (let ms = 0; ms < at[holdIdx] + 80; ms += LP ? 55 : 40) setTimeout(() => ghost(LP ? 0.3 : 0.55), T(ms));   // lighter while she springs up
    for (let ms = at[relIdx[0]]; ms < lastRel + 170; ms += 35) setTimeout(ghost, T(ms));
    if (LP) setTimeout(() => this.mets.push({ kind: 'pcharge', x: tip.x, y: tip.y, t0: now(), orb: T(140), life: T(lastRel - at[holdIdx] + 60) }), T(at[holdIdx]));
    else this.mets.push({ kind: 'pcharge', x: tip.x, y: tip.y, t0, orb: T(at[holdIdx]), life: T(lastRel + 60) });
    sfx('charge');
    setTimeout(() => { sfx('twinkle'); this.glows.push({ x: tip.x, y: tip.y, r: 16, color: '#7affd8', t: 0, life: 0.35, a: 0.8 }); }, T(at[holdIdx]));
    // which records each arrow carries (round robin), and where it splits: about halfway, a little above the line
    const groups = Array.from({ length: nShots }, () => []);
    tgt.forEach((r, i) => groups[Math.floor(i * nShots / tgt.length) % nShots].push(r));
    const cx = ens.reduce((a, e) => a + e.x, 0) / ens.length, topY = Math.min(...ens.map(e => e.y)) - 30;
    const last = {}; tgt.forEach((t, i) => { last[t.id] = i; });
    let end = 0;
    groups.forEach((recs, i) => {
      const rel = at[relIdx[i]];
      // the arrows climb to split points well above the enemies, so the copies always have room to fan down onto them
      // leaping: they fly straight down the 45-degree line and split partway to the enemies' height
      const s45 = LP ? clamp((topY + 18 - tip.y) * (0.45 + (i % 4) * 0.06), 22, 80) : 0;
      const split = LP ? { x: tip.x - s45 + (i % 3 - 1) * 2, y: tip.y + s45 }
        : { x: lerp(tip.x, cx, 0.55) + (i - (nShots - 1) / 2) * 3, y: Math.max(22, Math.min(tip.y, topY) - 40 - (i % 4) * 7) };
      const fly1 = LP ? clamp(Math.hypot(split.x - tip.x, split.y - tip.y) * 1.6, 70, 140) : clamp(Math.hypot(split.x - tip.x, split.y - tip.y) * 1.3, 130, 210);
      // 2. rapid release: a sharp cyan flash at the bow and the arrow away
      setTimeout(() => {
        this.glows.push({ x: tip.x, y: tip.y, r: 26, color: '#c8fff0', t: 0, life: 0.18, a: 1 });
        this.burst(tip.x, tip.y, '#7affd8', 8, 46, 0);
        this.mets.push({ kind: 'parrow', from: tip, ctrl: LP ? { x: (tip.x + split.x) / 2, y: (tip.y + split.y) / 2 } : { x: lerp(tip.x, split.x, 0.35), y: tip.y - 6 }, to: split, t0: now(), life: T(fly1), a: 1, pts: [] });
        if (i % 3 === 0) sfx('bow'); if (i === 0) sfx('whoosh');
      }, T(rel));
      // 3. spectral duplication: a flash, then the copies fan out on their own curves, staggered
      const sAt = rel + fly1;
      setTimeout(() => {
        this.glows.push({ x: split.x, y: split.y, r: 8, grow: 22, color: '#7affd8', t: 0, life: 0.28, a: 0.9, ring: true });
        this.glows.push({ x: split.x, y: split.y, r: 22, color: '#c8fff0', t: 0, life: 0.2, a: 0.9 });
        if (i % 4 === 0) sfx('twinkle');
      }, T(sAt));
      const shots = recs.map(r => ({ rec: r, e: this.actors.get(r.id) })).filter(c => c.e);
      const strays = Math.max(0, (this.lowPower ? 1 : 2) - shots.length);   // every arrow splits into two copies (one on low-power devices)
      for (let k = 0; k < strays; k++) shots.splice(1 + k * 2, 0, { e: ens[Math.floor(Math.random() * ens.length)] });
      shots.forEach((c, j) => {
        const hp = this._hitPoint(c.e);
        const to = c.rec ? { x: hp.x + (Math.random() - 0.5) * 8, y: hp.y + (Math.random() - 0.5) * 8 }
          : { x: c.e.x + (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 20), y: c.e.y - 1 + (Math.random() - 0.5) * 8 };
        const d = Math.hypot(to.x - split.x, to.y - split.y), side = (j % 2 ? 1 : -1) * (8 + Math.random() * 20);
        const ctrl = LP ? { x: split.x - d * 0.3 + side * 0.5, y: Math.min(split.y + d * 0.3, (split.y + to.y) / 2 + 10) + side * 0.3 }
          : { x: (split.x + to.x) / 2 + side * (to.y - split.y) / Math.max(1, d), y: (split.y + to.y) / 2 - side * (to.x - split.x) / Math.max(1, d) - 8 };
        const fly2 = clamp(d * 1.25, 180, 300), go = sAt + j * 30;
        let met = null;
        setTimeout(() => { met = { kind: 'parrow', from: split, ctrl, to, t0: now(), life: T(fly2), a: j === 0 ? 1 : c.rec ? 0.8 : 0.6, pts: [] }; this.mets.push(met); }, T(go));
        // 4. phantom barrage: a small cyan flash and spectral burst on each strike
        setTimeout(() => {
          this.mets.push({ kind: 'pimpact', x: to.x, y: to.y + (c.rec ? 12 : 4), t0: now(), life: T(760) });
          // 5. spirit dissipation: blue-violet wisps rise off the strike and the trail breaks into drifting motes
          const lp = this.lowPower ? 0.5 : 1;
          for (let q = 0; q < 10 * lp; q++) this.particles.push({ x: to.x + (Math.random() - 0.5) * 8, y: to.y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 34, vy: -18 - Math.random() * 34, g: -8, life: 0.5 + Math.random() * 0.5, t: 0, c: ['#7affd8', '#a8c8ff', '#9a7aff', '#c8fff0', '#b48cff'][q % 5], plus: q % 4 === 0, fade: true, drag: 0.94 });
          if (met) met.pts.forEach((p, q) => { if (q % 2 && Math.random() < 0.8 * lp) this.particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 14, g: -4, life: 0.4 + Math.random() * 0.4, t: 0, c: q / met.pts.length > 0.5 ? '#7affd8' : '#9a7aff', fade: true }); });
          if (c.rec) {
            this.impact(ev, tgt, 'phantom', rc, [c.rec], true);
            this.shake = Math.max(this.shake, 2); this.shakeT = now();
            if (last[c.rec.id] === tgt.indexOf(c.rec)) this._applyAfter(ev, [c.rec.id]);
          }
        }, T(go + fly2));
        end = Math.max(end, go + fly2);
      });
    });
    setTimeout(() => { const rest = ev.targets.filter(t => !tgt.includes(t) && t.heal); if (rest.length) this.impact(ev, [], 'phantom', rc, rest, true); this._applyAfter(ev); }, T(end + 80));
    return T(Math.max(acc, end + 650));
  }
  // Deadeye with PixelLab effects (public/art/fx/de_*), on the ranger's Shoot animation, in four beats:
  // 1. Focus: the ranger draws slowly while an emerald reticle spins in and locks on to every enemy, one after another,
  //    each joined to the bow by a flickering sight line.
  // 2. Charge: the full draw is held while emerald energy gathers on the arrowhead and her outline glows green.
  // 3. Release: one arrow per enemy, release - recoil - redraw, each a fast emerald bolt with a mint trail.
  // 4. Impact: each arrow lands dead centre on its reticle: a critical starburst, a "CRIT" tag and its damage number,
  //    with a short hit-stop; the motes drift off and the ranger recoils back to idle.
  _deadeyeAnim(A, ev, T, shoot) {
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && t.dmg != null);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const shots = tgt.map(r => ({ rec: r, e: this.actors.get(r.id) })).filter(c => c.e);
    if (!shots.length) { this._applyAfter(ev); return T(600); }
    const LOCK0 = 260, LOCK = 170;   // when the first reticle appears, the gap between locks
    const CHARGE = 620 + Math.max(0, 3 - shots.length) * 220;   // the held charge: longer against one or two enemies, so the move keeps its weight
    const frs = shoot.timeline.map(x => x[0]), C0 = shoot.charge, R0 = shoot.release, R1 = frs.includes(R0 + 1) ? R0 + 1 : R0;
    const tl = [];
    for (const f of frs) if (f < C0) tl.push([f, 75]);   // a slow, steady draw
    const drawn = tl.reduce((a, x) => a + x[1], 0);
    const lockEnd = LOCK0 + (shots.length - 1) * LOCK + 380;   // the last reticle has locked
    const holdIdx = tl.length; tl.push([C0, Math.max(300, lockEnd - drawn) + CHARGE]);
    const relIdx = [];
    shots.forEach((c, i) => { relIdx.push(tl.length); tl.push([R0, 45], [R1, 60]); if (i < shots.length - 1) tl.push([C0, 70]); });
    const tail = shoot.timeline.filter(x => x[0] > R1);
    if (tail.length) for (const x of tail) tl.push([x[0], x[1]]); else tl.push([R1, 220]);
    const anim = Object.assign({}, shoot, { timeline: tl });
    const at = []; let acc = 0; for (const [, ms] of tl) { at.push(acc); acc += ms; }
    const t0 = now();
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    setTimeout(() => { if (A.anim && A.anim.d === anim) A.anim = null; }, T(acc + 60));
    this.cam = { x: A.x - 50, y: A.y - 36, t0, dur: T(at[relIdx[0]] + 120), z: 1.07 };
    const [mx, my] = shoot.muzzle || [-30, -40];
    const tip = { x: A.x + A.ox + mx, y: A.y + A.oy + my };
    const when = (ms, fn) => setTimeout(fn, T(ms));
    sfx('charge');
    // 1. focus: a reticle locks on to each enemy in turn (spin in, snap, then pulse until its arrow lands)
    const lands = [];
    shots.forEach((c, i) => {
      const rel = at[relIdx[i]], to = this._hitPoint(c.e);
      const fly = clamp(Math.hypot(to.x - tip.x, to.y - tip.y) * 0.85, 150, 260);
      lands.push(rel + fly);
      const lk = LOCK0 + i * LOCK;
      when(lk, () => {
        this.mets.push({ kind: 'demark', follow: c.e, t0: now(), life: T(rel + fly - lk) });
        this.mets.push({ kind: 'desight', from: tip, follow: c.e, t0: now() + T(330), life: T(rel - lk - 330) });
        sfx('whoosh');
      });
      when(lk + 330, () => { const p = this._hitPoint(c.e); this.glows.push({ x: p.x, y: p.y, r: 22, color: '#8fffd8', t: 0, life: 0.25, a: 0.8 }); sfx('twinkle'); });   // the lock-on snap
    });
    // 2. charge: energy gathers on the arrowhead and her outline burns emerald while the draw is held
    when(at[holdIdx], () => {
      this.mets.push({ kind: 'decharge', x: tip.x, y: tip.y, t0: now(), life: T(at[relIdx[shots.length - 1]] - at[holdIdx] + 40) });
      A.chronoRim = { t0: now(), until: now() + T(at[relIdx[shots.length - 1]] - at[holdIdx] + 120), color: '#3fdc9a' };
      sfx('charge');
    });
    // 3. release: one arrow per enemy; 4. impact: a critical hit on each
    const last = {}; tgt.forEach((t, i) => { last[t.id] = i; });
    shots.forEach((c, i) => {
      const rel = at[relIdx[i]], fly = lands[i] - rel;
      when(rel, () => {
        const to = this._hitPoint(c.e);
        this.glows.push({ x: tip.x, y: tip.y, r: 26, color: '#c8fff0', t: 0, life: 0.18, a: 1 });
        this.burst(tip.x, tip.y, '#8fffd8', 8, 46, 0);
        this.mets.push({ kind: 'dearrow', from: tip, ctrl: { x: lerp(tip.x, to.x, 0.5), y: Math.min(tip.y, to.y) - 8 }, to, t0: now(), life: T(fly), pts: [] });
        sfx('bow'); if (i === 0) sfx('whoosh');
      });
      when(rel + fly, () => {
        const p = this._hitPoint(c.e);
        this.mets.push({ kind: 'decrit', x: p.x, y: p.y, t0: now(), life: T(800) });
        this.number(p.x, p.y - 34, 'CRIT', '#8fffd8', 0.95, true);
        this.flash = Math.max(this.flash || 0, i ? 0.05 : 0.1); this.shake = Math.max(this.shake, 5); this.shakeT = now(); this.freezeUntil = now() + 80;
        const lp = this.lowPower ? 0.5 : 1;
        for (let q = 0; q < 12 * lp; q++) this.particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 90 - 20, g: 90, life: 0.4 + Math.random() * 0.4, t: 0, c: ['#8fffd8', '#3fbf8f', '#ffffff', '#ffd25a'][q % 4], streak: q % 3 ? 2 : 0, plus: q % 3 === 0, drag: 0.92 });
        this.impact(ev, tgt, 'deadeye', rc, [c.rec], true);
        sfx('hitBig');
        if (last[c.rec.id] === tgt.indexOf(c.rec)) this._applyAfter(ev, [c.rec.id]);
      });
    });
    const end = Math.max(...lands);
    when(end + 80, () => this._applyAfter(ev));
    return T(Math.max(acc, end + 700));
  }
  // Divine Shield with PixelLab effects (public/art/fx/ds_*), on the cleric's Chant animation, in five beats:
  // 1. Cast: the cleric raises the staff and chants; a holy star burns on its tip, golden motes rise and the robes glow.
  // 2. Shield forms: as the staff sweeps round, a mote of light flies from it to every hero and a golden dome rises out of
  //    a ring of light on the floor and closes over each of them.
  // 3. Protection: the domes close with a flare and shimmer.
  // 4. Purify: a beam of light rises through every hero; on a hero who loses Weak or Vulnerable the dark motes burn off and
  //    golden crosses and a shield emblem float up ("Cleansed").
  // 5. Shield remains: the domes dim to a gentle shimmer and stay up for the rest of the round (drawn with the hero while
  //    the Divine Shield status lasts; a blocked hit makes the dome flare).
  _divineAnim(A, ev, T, anim) {
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const heroes = ev.targets.map(t => ({ rec: t, h: this.actors.get(t.id) })).filter(c => c.h && c.h.type === 'hero' && !c.h.downed);
    const t0 = now(), C0 = anim.charge != null ? anim.charge : 2, hitAt = at[anim.hit];
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    setTimeout(() => { if (A.anim && A.anim.d === anim) A.anim = null; }, T(acc + 60));
    this.cam = { x: A.x - 10, y: A.y - 40, t0, dur: T(hitAt + 200), z: 1.06 };
    const when = (ms, fn) => setTimeout(fn, T(ms));
    // 1. cast
    when(at[C0], () => {
      this.mets.push({ kind: 'dsstar', follow: A, t0: now(), life: T(hitAt - at[C0] + 160) });
      A.holy = { t0: now(), until: now() + T(hitAt - at[C0] + 400) };
      sfx('cast'); sfx('twinkle');
    });
    when(at[C0] + 60, () => { const lp = this.lowPower ? 0.5 : 1; for (let q = 0; q < 22 * lp; q++) this.particles.push({ x: A.x + (Math.random() - 0.5) * 40, y: A.y - Math.random() * 10, vx: (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 30, g: -6, life: 0.9 + Math.random() * 0.8, t: 0, c: ['#ffe27a', '#fff6c8', '#f6c453'][q % 3], plus: q % 4 === 0, fade: true }); });
    // 2. shield forms: motes of light fly from the staff to every hero, nearest first
    const order = heroes.slice().sort((a, b) => Math.abs(a.h.x - A.x) + Math.abs(a.h.y - A.y) - Math.abs(b.h.x - A.x) - Math.abs(b.h.y - A.y));
    let formed = hitAt;
    order.forEach((c, i) => {
      const go = hitAt + i * 90, fly = c.h === A ? 120 : clamp(Math.hypot(c.h.x - A.x, c.h.y - A.y) * 1.6, 160, 300);
      when(go, () => {
        const tp = this._tipAt(A) || { x: A.x - 14, y: A.y - 70 };
        this.mets.push({ kind: 'dsbolt', from: { x: tp.x, y: tp.y }, ctrl: { x: (tp.x + c.h.x) / 2, y: Math.min(tp.y, c.h.y - 60) - 24 }, to: { x: c.h.x, y: c.h.y - 30 }, t0: now(), life: T(fly), pts: [] });
        if (i === 0) { this.glows.push({ x: tp.x, y: tp.y, r: 40, color: '#ffe9a0', t: 0, life: 0.35, a: 0.9 }); sfx('zap'); }
      });
      when(go + fly, () => {
        c.h.dome = { t0: now(), bright: now() + T(2600) };
        this.glows.push({ x: c.h.x, y: c.h.y - 2, r: 46, color: '#ffd86a', t: 0, life: 0.45, a: 0.7 });
        this.mets.push({ kind: 'dsring', x: c.h.x, y: c.h.y, t0: now(), life: T(600) });
        sfx('shield');
      });
      // 3. protection: the dome closes with a flare
      when(go + fly + 470, () => { this.glows.push({ x: c.h.x, y: c.h.y - 34, r: 50, color: '#fff2c0', t: 0, life: 0.35, a: 0.75 }); if (c.h === A) sfx('twinkle'); });
      formed = Math.max(formed, go + fly + 470);
    });
    // 4. purify: a beam through every hero; the cleansed shed their dark motes and the crosses rise
    order.forEach((c, i) => when(formed + 120 + i * 80, () => {
      this.mets.push({ kind: 'dspurify', x: c.h.x, y: c.h.y, t0: now(), life: T(900) });
      if (i === 0) sfx('heal');
      if (c.rec.cleansed) {
        this.mets.push({ kind: 'dscleanse', x: c.h.x, y: c.h.y - 30, t0: now() + T(150), life: T(900) });
        const lp = this.lowPower ? 0.5 : 1;
        for (let q = 0; q < 14 * lp; q++) this.particles.push({ x: c.h.x + (Math.random() - 0.5) * 22, y: c.h.y - 6 - Math.random() * 40, vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 30, g: -10, life: 0.6 + Math.random() * 0.5, t: 0, c: ['#6a3a9a', '#9a5ad0', '#c7a2ff', '#3a2050'][q % 4], fade: true, blob: q % 5 === 0 ? 1 : 0 });
        this.number(c.h.x, c.h.y - 82, 'Cleansed', '#d8fff0', 0.8);
      }
    }));
    const done = formed + 120 + order.length * 80 + 500;
    // 5. shield remains: the after-state gives every hero the status, and the domes settle to a steady shimmer
    when(done, () => { this._applyAfter(ev); for (const c of order) if (c.h.dome) c.h.dome.bright = Math.min(c.h.dome.bright, now() + T(500)); });
    return T(Math.max(acc, done) + 400);
  }
  // Wrath of Heaven with PixelLab effects (public/art/fx/wrath_*): the cleric's Chant animation raises the staff and holds
  // it (divine invocation: a golden halo above the head, holy symbols spiralling round the body, the robes glowing).
  // Heaven's mark: three golden rune circles appear one by one over the whole enemy side (inner, middle, outer) and turn
  // in alternating directions, pulsing brighter. Divine judgment: as the staff sweeps forward a column of white-gold light
  // as wide as the enemy side crashes down and holds while it strikes every enemy four times (a radiant burst, golden
  // shockwave and damage number each time), and the party is healed. Afterglow: the pillar pulls back up into the sky,
  // leaving a holy sigil on the ground that dissolves into golden sparkles.
  _wrathAnim(A, ev, T, anim) {
    const at = []; let acc = 0; for (const [, ms] of anim.timeline) { at.push(acc); acc += ms; }
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const ens = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const waves = Math.max(1, ...tgt.map(t => (t.wave || 0) + 1));
    const t0 = now(), hitAt = at[anim.hit], LAND = 150, GAP = 330, SLAM = 143, RETRACT = 290;
    const hold = LAND + (waves - 1) * GAP + 520;          // the pillar stays down until after the last strike
    const PILLAR = hold + RETRACT;
    const total = Math.max(acc, hitAt + PILLAR) + 700;
    // the whole enemy side: the circles, the pillar and the sigil are sized to cover every enemy
    const xs = ens.map(e => e.x), ys = ens.map(e => e.y), big = ens.some(e => e.size === 'xl') ? 80 : ens.some(e => e.size === 'l') ? 40 : 0;
    const field = ens.length ? { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 + 1, w: Math.max(...xs) - Math.min(...xs) + 64 + big, h: Math.max(...ys) - Math.min(...ys) + 26, bottom: Math.max(...ys) + 2 } : null;
    A.anim = { d: anim, t0, speed: T(1000) / 1000, at, total: acc };
    setTimeout(() => { A.anim = null; }, T(acc + 60));
    this.cam = { x: A.x - 40, y: A.y - 44, t0, dur: T(hitAt - 60), z: 1.06 };
    const when = (ms, fn) => setTimeout(fn, T(ms));
    // 1. divine invocation, while the staff goes up and is held
    when(at[2], () => {
      this.mets.push({ kind: 'whalo', follow: A, t0: now(), life: T(hitAt + 500 - at[2]) });
      this.mets.push({ kind: 'waura', follow: A, t0: now(), life: T(hitAt + 300 - at[2]) });
      A.holy = { t0: now(), until: now() + T(hitAt + 300 - at[2]) };
      sfx('heal'); sfx('cast');
    });
    // 2. heaven's mark: inner, middle and outer circles appear one by one and turn in alternating directions
    if (field) {
      const q = Math.max(0.32, Math.min(0.6, field.h / field.w)), until = hitAt + LAND + (waves - 1) * GAP + 200;
      [2, 1, 0].forEach((i, j) => when(at[3] + j * 260, () => {   // outer first, closing in
        this.mets.push({ kind: 'wring', ring: i, x: field.cx, y: field.cy, w: field.w * [0.5, 1, 1.42][i], q, dir: i % 2 ? -1 : 1, t0: now(), life: T(until - at[3] - j * 260) });
        this.glows.push({ x: field.cx, y: field.cy, r: field.w * [0.25, 0.5, 0.7][i], color: '#ffd86a', t: 0, life: 0.35, a: 0.6 });
        sfx(i === 0 ? 'charge' : 'twinkle');
      }));
    }
    // 3. divine judgment: the pillar crashes down as the staff sweeps forward, and holds
    when(hitAt, () => { if (field) this.mets.push({ kind: 'wpillar', x: field.cx, y: field.bottom, sx: field.w / 150, w: field.w, hold: T(hold), slam: T(SLAM), t0: now(), life: T(PILLAR) }); sfx('zap'); });
    // 4. the strikes: every enemy is hit once per wave while the pillar holds
    for (let w = 0; w < waves; w++) when(hitAt + LAND + w * GAP, () => {
      const list = tgt.filter(t => (t.wave || 0) === w);
      for (const t of list) { const e = this.actors.get(t.id); if (e) this.mets.push({ kind: 'wimpact', x: e.x, y: e.y + 2, t0: now(), life: T(800) }); }
      this.flash = Math.max(this.flash || 0, w ? 0.07 : 0.16); this.shake = Math.max(this.shake, w ? 4 : 7); this.shakeT = now(); this.freezeUntil = now() + (w ? 60 : 120);
      this.impact(ev, tgt, 'pillar', rc, w ? list : [...list, ...ev.targets.filter(t => t.heal != null)], true);
      if (w) sfx('hitBig');
    });
    // 5. afterglow: as the pillar retracts, a holy sigil is left on the ground and dissolves into golden sparkles
    when(hitAt + hold - 150, () => { if (field) this.mets.push({ kind: 'wafter', x: field.cx, y: field.cy, sx: field.w / 180, sy: field.h / 70, t0: now(), life: T(1000) }); sfx('twinkle'); });
    when(hitAt + LAND + (waves - 1) * GAP + 200, () => this._applyAfter(ev));
    return T(total);
  }
  // Resurrection with PixelLab art (public/art/fx/res_*), in six beats:
  // 1. Sacred invocation: the cleric kneels beside the fallen ally, a golden halo above her head, rune circles light
  //    up under her and under the fallen, and golden motes float up round the body.
  // 2. Heavenly descent: a portal opens in the sky above the fallen and the angel (face hidden by light) slowly sinks
  //    out of it, wings folded, then unfolds them symmetrically.
  // 3. Angelic blessing: she hovers, wings beating slowly, a beam of warm light from her hand to the fallen hero's
  //    chest, feathers drifting down and sacred symbols circling the body. The rest of the party is healed.
  // 4. Soul restoration: the body turns translucent, a golden spirit rises out of it and sinks back in; three pulses
  //    race out over the floor, the body brighter with each, and a halo forms on the ground beneath it.
  // 5. Resurrection: the hero rises to their feet in a golden aura, flashes white and throws off golden sparks; the
  //    angel spreads her wings to their fullest and starts to rise towards the portal.
  // 6. Heavenly departure: she dissolves into golden sparks and feathers, the wings last, leaving a glow round the
  //    revived hero; the portal closes, the runes fade and the cleric walks back to her place.
  // With nobody down the angel still descends over the party, blesses everyone and leaves (beats 4-5 are skipped).
  _resurrectAnim(A, ev, T) {
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    const isHero = id => { const a = this.actors.get(id); return !!a && a.type === 'hero'; };
    const fallenT = ev.targets.filter(t => t.revived && isHero(t.id));
    const fallen = fallenT.map(t => this.actors.get(t.id));
    const fallenIds = fallen.map(a => a.id);
    const others = ev.targets.filter(t => !t.revived && isHero(t.id));
    const party = [...this.actors.values()].filter(a => a.type === 'hero' && !a.gone);
    const focus = fallen.length ? fallen : party;
    const fx = focus.reduce((s, a) => s + a.x, 0) / focus.length, fy = focus.reduce((s, a) => s + a.y, 0) / focus.length;
    const lp = this.lowPower ? 0.5 : 1;
    // where everything sits: the angel's hover point (her waist), the portal above her, the cleric's kneeling spot
    const hx = clamp(Math.round(fx - 52), 78, this.W - 78), hy = Math.round(Math.max(72, fy - 78));   // hovering just in front of the fallen, over the open floor
    const py = Math.round(Math.max(10, hy - 82));
    const first = fallen[0];
    const kneel = first && first !== A ? { x: first.x + 24, y: first.y + 1 } : { x: A.x, y: A.y };
    // the timeline (ms at 1x)
    const KNEEL = 280, PORTAL = 900, APPEAR = 1100, HOVER = 2100, UNFOLD = 2050, SPREAD = 2450,
      BEAM = 2600, PARTY = 3000, SOUL = 3650, PULSE = 4600, RISE = 4850, FULL = 4850, ASCEND = 5200,
      BODY_GO = 5650, WINGS_GO = 5900, CLOSE = 6300, HOME = 6000, END = 6900;
    const t0 = now(), at = ms => t0 + T(ms), when = (ms, fn) => setTimeout(fn, T(ms));
    this.cam = { x: hx, y: Math.round((py + fy) / 2) + 10, t0, dur: T(END - 200), z: 1.04 };
    // 1. sacred invocation
    if (kneel.x !== A.x || kneel.y !== A.y) this.move(A, kneel.x - A.x, kneel.y - A.y, T(KNEEL), true);
    when(KNEEL, () => {
      this.pose(A, 'sit', T(HOME - KNEEL));
      A.holy = { t0: now(), until: at(SOUL) };
      this.mets.push({ kind: 'rhalo', follow: A, dy: 54, t0: now(), life: T(SOUL + 300 - KNEEL) });
      this.mets.push({ kind: 'wring', ring: 0, x: kneel.x, y: kneel.y, w: 34, q: 0.32, dir: 1, fade: T(300), t0: now(), life: T(CLOSE + 100 - KNEEL) });
      sfx('heal'); sfx('cast');
    });
    when(KNEEL + 170, () => {
      for (const F of focus) {
        if (fallen.length) this.mets.push({ kind: 'wring', ring: 2, x: F.x, y: F.y + 1, w: 54, q: 0.3, dir: -1, fade: T(300), t0: now(), life: T(CLOSE + 100 - KNEEL - 170) });
        this.mets.push({ kind: 'rmotes', x: F.x, y: F.y, t0: now(), life: T(SOUL - KNEEL - 170) });
      }
      sfx('twinkle');
    });
    // 2. heavenly descent
    when(PORTAL, () => {
      this.mets.push({ kind: 'rportal', x: hx, y: py, open: T(380), close: T(400), t0: now(), life: T(CLOSE + 400 - PORTAL) });
      this.mets.push({ kind: 'rshaft', x: hx, y0: py + 4, y1: Math.max(...focus.map(a => a.y)) + 4, w0: 52, w1: 66, t0: now(), life: T(BODY_GO + 200 - PORTAL) });
      sfx('charge'); sfx('twinkle');
    });
    const angel = { kind: 'rangel', hx, hy, py, sy0: py + 24, t0: at(APPEAR), life: T(WINGS_GO + 700 - APPEAR),
      tA: at(APPEAR), tH: at(HOVER), tU: at(UNFOLD), tUe: at(SPREAD), tFull: at(FULL), tAsc: at(ASCEND), tAe: at(ASCEND + 1400),
      tBd: at(BODY_GO), tWd: at(WINGS_GO), bd: T(350), wd: T(650), bodyGone: false, wingsGone: false, T };
    when(APPEAR, () => { this.mets.push(angel); sfx('heal'); });
    when(UNFOLD, () => sfx('whoosh'));
    // 3. angelic blessing
    const hand = F => () => { const P = this._angelAt(angel, now()), side = F.x < P.x ? -1 : 1; return { x: P.x + side * 22, y: P.y - 15 }; };
    when(SPREAD, () => { for (let i = 0; i < 8 * lp + 2; i++) this._resFeather(hx + (Math.random() - 0.5) * 120, hy - 30 + (Math.random() - 0.5) * 40, T); });
    when(BEAM, () => {
      for (const F of (fallen.length ? fallen : [])) {
        this.mets.push({ kind: 'rbeam', from: hand(F), to: F, t0: now(), life: T(PULSE + 150 - BEAM) });
        this.mets.push({ kind: 'rorbit', follow: F, t0: now(), life: T(PULSE + 200 - BEAM) });
      }
      sfx('heal'); sfx('charge');
    });
    for (let i = 1; i <= 4; i++) when(SPREAD + i * 280, () => { for (let j = 0; j < 3 * lp + 1; j++) this._resFeather(hx + (Math.random() - 0.5) * 130, hy - 20 + (Math.random() - 0.5) * 30, T); });
    when(PARTY, () => {   // the rest of the party: a softer light and their heals
      for (const t of others) {
        const p = this.pos(t.id); if (!p) continue;
        if (t.heal > 0) { this.column(p.x, p.y, '#ffe9a0'); this.number(p.x, p.y - 44, '+' + t.heal, '#8dff9e', 1.1); }
        this.glows.push({ x: p.x, y: p.y - 22, r: 30, color: '#ffe9a0', t: 0, life: 0.9, a: 0.5 });
      }
      this._applyAfter(ev, Object.keys(ev.after || {}).filter(id => !fallenIds.includes(id)));
      if (others.some(t => t.heal > 0)) sfx('heal');
    });
    // 4. soul restoration
    if (fallen.length) {
      when(SOUL, () => {
        for (const F of fallen) {
          F.ghost = { t0: now(), until: at(RISE), a: 0.42 };
          F.radiant = { t0: now(), until: at(RISE + 1000), pulses: [] };
          this.mets.push({ kind: 'rspirit', follow: F, t0: now(), life: T(PULSE - SOUL + 40), up: T(500), hold: T(650) });
        }
        sfx('rise');
      });
      for (let j = 0; j < 3; j++) when(PULSE + j * 120, () => {
        for (const F of fallen) {
          F.radiant && F.radiant.pulses.push(now());
          this.mets.push({ kind: 'rpulse', x: F.x, y: F.y + 1, r1: 60 + j * 18, t0: now(), life: T(650) });
          if (j === 0) this.mets.push({ kind: 'wring', ring: 0, x: F.x, y: F.y + 1, w: 26, q: 0.3, dir: 1, fade: T(400), t0: now(), life: T(CLOSE + 150 - PULSE) });
        }
        this.flash = Math.max(this.flash || 0, j ? 0.05 : 0.12);
        sfx(j ? 'twinkle' : 'heal');
      });
      // 5. resurrection
      when(RISE, () => {
        this._applyAfter(ev, fallenIds);
        for (const t of fallenT) {
          const F = this.actors.get(t.id); if (!F) continue;
          F.ghost = null;
          this.pose(F, 'sit', T(460));
          F.flashUntil = now() + T(190);
          F.radiant = { t0: F.radiant ? F.radiant.t0 : now(), until: at(RISE + 1100), pulses: [now()] };
          this.number(F.x, F.y - 48, '+' + (t.heal || 0), '#8dff9e', 1.25, true);
          this.number(F.x, F.y - 64, 'Revived!', '#ffe27a', 0.9);
          for (let i = 0; i < 40 * lp; i++) { const q = Math.random() * Math.PI * 2, v = 30 + Math.random() * 70; this.particles.push({ x: F.x + Math.cos(q) * 4, y: F.y - 22 + Math.sin(q) * 10, vx: Math.cos(q) * v, vy: Math.sin(q) * v * 0.7 - 30, g: 40, life: 0.6 + Math.random() * 0.6, t: 0, c: ['#ffffff', '#fff2c0', '#ffe27a', '#ffc24a'][i % 4], plus: i % 5 === 0, drag: 0.92, fade: true }); }
          this.glows.push({ x: F.x, y: F.y - 24, r: 46, color: '#fff2c0', t: 0, life: 0.5, a: 0.9 });
        }
        sfx('correct'); sfx('heal');
      });
    }
    when(FULL, () => sfx('whoosh'));
    // 6. heavenly departure (the dissolve itself runs in drawPixelFx as the angel's clock passes tBd / tWd)
    when(BODY_GO, () => sfx('rise'));
    when(WINGS_GO, () => {
      for (const F of focus) this.glows.push({ x: F.x, y: F.y - 24, r: 40, color: '#ffe9a0', t: 0, life: 1.3, a: 0.45 });
      sfx('twinkle');
    });
    when(HOME, () => { A.pose = null; this.move(A, 0, 0, T(320)); });
    when(CLOSE, () => sfx('twinkle'));
    when(RISE + 150, () => this._applyAfter(ev));
    return T(END);
  }
  // where the angel is at time t: her waist on screen, the wing frame, and how solid her body and wings are
  _angelAt(m, t) {
    let y, f;
    if (t < m.tH) y = lerp(m.sy0, m.hy, ease(clamp((t - m.tA) / (m.tH - m.tA), 0, 1)));
    else y = m.hy + Math.sin((t - m.tH) / 380) * 1.5;
    if (t > m.tAsc) y -= (m.hy - m.py) * 0.9 * easeIn(clamp((t - m.tAsc) / (m.tAe - m.tAsc), 0, 1));   // rising back towards the portal
    if (t < m.tU) f = 0;
    else if (t < m.tUe) f = Math.min(9, Math.floor((t - m.tU) / (m.tUe - m.tU) * 10));
    else if (t < m.tFull) f = 10 + Math.floor((t - m.tUe) / 190) % 4;
    else f = 14;
    const a = clamp((t - m.tA) / 320, 0, 1);
    const ba = a * clamp(1 - (t - m.tBd) / m.bd, 0, 1), wa = a * clamp(1 - (t - m.tWd) / m.wd, 0, 1);
    return { x: m.hx, y: Math.round(y), f, a, ba, wa };
  }
  _drawAngel(n, m, t) {
    const W = PFX.rWings, B = PFX.rBody;
    if (!W.img.complete || !W.img.naturalWidth || !B.img.complete || !B.img.naturalWidth) return;
    const P = this._angelAt(m, t), lp = this.lowPower ? 0.5 : 1;
    const wx = Math.round(P.x - W.ax), wy = P.y - W.ay;
    const sx = (P.f % W.cols) * W.w, sy = Math.floor(P.f / W.cols) * W.h;
    const glowA = 0.05 + 0.03 * Math.sin(t / 110);
    if (P.wa > 0) {   // the wings, behind her
      n.globalAlpha = P.wa; n.drawImage(W.img, sx, sy, W.w, W.h, wx, wy, W.w, W.h);
      n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = P.wa * glowA;
      n.drawImage(this.tinted(W.img, '#ffe9a0'), sx, sy, W.w, W.h, wx, wy, W.w, W.h); n.restore();
    }
    if (P.ba > 0) {
      n.globalAlpha = P.ba; n.drawImage(B.img, wx, wy);
      n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = P.ba * (glowA + (t > m.tBd ? 0.5 * (1 - P.ba) : 0));
      n.drawImage(this.tinted(B.img, '#fff2c0'), wx, wy); n.restore();
    }
    n.globalAlpha = 1;
    // the dissolve: her body bursts into golden sparks first, then the wings into feathers and light
    const spark = (pts, count, cols, up) => {
      for (let i = 0; i < count && pts.length; i++) {
        const p = pts[Math.floor(Math.random() * pts.length)];
        const bright = p[2] + p[3] + p[4] > 560;
        this.particles.push({ x: P.x + p[0], y: P.y + p[1], vx: (Math.random() - 0.5) * 24 + p[0] * 0.3, vy: -up * (0.5 + Math.random()) + p[1] * 0.1, g: -8, life: 0.6 + Math.random() * 0.8, t: 0,
          c: bright ? cols[Math.floor(Math.random() * cols.length)] : `rgb(${p[2]},${p[3]},${p[4]})`, plus: i % 9 === 0, drag: 0.94, fade: true });
      }
    };
    if (!m.bodyGone && t >= m.tBd) {
      m.bodyGone = true;
      spark(this._resPts(B, 0), Math.round(170 * lp), ['#ffffff', '#fff6c8', '#ffe27a', '#ffc24a'], 34);
      this.glows.push({ x: P.x, y: P.y - 20, r: 50, color: '#fff2c0', t: 0, life: 0.5, a: 0.7 });
    }
    if (!m.wingsGone && t >= m.tWd) {
      m.wingsGone = true;
      const pts = this._resPts(W, P.f);
      spark(pts, Math.round(150 * lp), ['#ffffff', '#fff6c8', '#ffe9a0'], 18);
      for (let i = 0; i < 22 * lp && pts.length; i++) { const p = pts[Math.floor(Math.random() * pts.length)]; this._resFeather(P.x + p[0], P.y + p[1], m.T, true); }
    }
  }
  _resPts(S, f) {   // opaque pixels of one frame of a sheet, relative to its anchor (for the dissolve)
    this._rp = this._rp || {};
    const key = S.img.src + f; if (this._rp[key]) return this._rp[key];
    if (!S.img.complete || !S.img.naturalWidth) return [];
    const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
    const x = c.getContext('2d'); x.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, 0, 0, S.w, S.h);
    const d = x.getImageData(0, 0, S.w, S.h).data, pts = [];
    for (let i = 0; i < S.w * S.h; i++) if (d[i * 4 + 3] > 100) pts.push([i % S.w - S.ax, Math.floor(i / S.w) - S.ay, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    return (this._rp[key] = pts);
  }
  // one luminous feather drifting down, swaying side to side
  _resFeather(x, y, T, burst) {
    const q = Math.random() * Math.PI * 2, v = burst ? 20 + Math.random() * 40 : 0;
    this.mets.push({ kind: 'rfeather', x, y, vx: Math.cos(q) * v, vy: Math.sin(q) * v * 0.6 - (burst ? 18 : 0), fall: 9 + Math.random() * 8, sway: 5 + Math.random() * 6,
      ph: Math.random() * 6.3, idx: Math.floor(Math.random() * 3), t0: now(), life: T(1400 + Math.random() * 900) });
  }
  // Dragon's Wrath with PixelLab art (public/art/fx/dragon_*), on the mage's Cast animation re-timed into five beats:
  // 1. Awakening: she braces (the wide-stance frame, held) while red-orange energy gathers in her hand, embers rise off
  //    the floor, her silhouette burns, and two enormous dragon eyes open in the dark behind her.
  // 2. Manifestation: she points the staff and a translucent dragon's head forms out of swirling flame behind her
  //    (the raid dragon's head), then rears back, fire gathering in its open jaws.
  // 3. Wrathful strike: it lunges at the target, flaming claws sweeping across ahead of it with a trail of embers.
  // 4. Infernal impact: the jaws snap shut on the target: a molten blast, a ring of flame spikes, a shockwave, the enemy
  //    flashing red. 5. It dissolves into spiralling embers and crimson smoke, leaving scorched, glowing cracks.
  _dragonAnim(A, ev, T, cast) {
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => !t.shatter && isEnemy(t.id) && (t.dmg != null || t.status));
    const E = tgt[0] && this.actors.get(tgt[0].id);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    // the Cast frames re-timed: brace (3, held) → point (4, 5 held) → release (6) → follow-through (7, held)
    const tl = [[0, 80], [1, 90], [2, 100], [3, 1050], [4, 80], [5, 1250], [6, 260], [7, 1100]];
    const d = Object.assign({}, cast, { timeline: tl, loop: null });
    const at = []; let acc = 0; for (const [, ms] of tl) { at.push(acc); acc += ms; }
    const t0 = now(), sp = T(1000) / 1000;
    A.anim = { d, t0, speed: sp, at, total: acc };
    const met = SP.heroAnim(A.skin || A.cls, 'meteor'), hand0 = (met && met.meteor && met.meteor.hands[0][1]) || [22, -38];
    const hand = () => ({ x: A.x + A.ox + hand0[0], y: A.y + A.oy + hand0[1] });
    const when = (ms, fn) => setTimeout(fn, T(ms));
    const lp = this.lowPower ? 0.5 : 1;
    // where the head sits behind her (anchored on its mouth, the rest of it behind her back) and where it bites
    const home = { x: Math.min(A.x - 4, this.W - 146), y: Math.max(64, A.y - 60) };   // the whole head (and its rear-back) stays on screen
    const bite = E ? { x: E.x + 8, y: E.y - ({ xl: 38, l: 24 }[E.size] || 14) } : { x: A.x - 130, y: A.y - 16 };
    const BRACE = at[4], STRIKE = at[6], BITE = at[7], GONE = BITE + 260;
    this.cam = { x: A.x + 18, y: A.y - 58, t0, dur: T(STRIKE + 120), z: 1.07 };
    // 1. awakening
    this.mets.push({ kind: 'daura', follow: A, hand, t0, life: T(BRACE + 200) });
    A.fiery = { t0, until: t0 + T(BITE + 300) };
    this.rune(A.x, A.y, '#ff5030'); sfx('charge');
    when(330, () => { const sc = this.W < 260 ? 1.05 : 1.4; this.mets.push({ kind: 'deyes', x: Math.min(A.x + 14, this.W - 70 * sc), y: Math.max(36, A.y - 92), sc, t0: now(), life: T(1250) }); sfx('enemyWind'); });
    // 2. manifestation: the head forms out of swirling flame, rears back, fire gathers in its jaws
    const head = { kind: 'dhead', home, bite, t0: t0 + T(BRACE), tE: t0 + T(BRACE + 650), tD: t0 + T(BRACE + 1080), tS: t0 + T(STRIKE), tB: t0 + T(BITE), tX: t0 + T(GONE), life: T(GONE + 720 - BRACE) };
    when(BRACE, () => {
      this.mets.push(head);
      this.mets.push({ kind: 'dorb', follow: A, mz: cast.muzzle, t0: now(), life: T(STRIKE - BRACE + 60) });
      const c = { x: home.x + 60, y: home.y - 18 };
      for (let i = 0; i < 46 * lp; i++) {   // flames swirling in to where the head forms
        const q = Math.random() * Math.PI * 2, r = 46 + Math.random() * 40, v = 2.2 + Math.random();
        this.particles.push({ x: c.x + Math.cos(q) * r, y: c.y + Math.sin(q) * r * 0.7, vx: (-Math.sin(q) * r * 1.6 - Math.cos(q) * r * v), vy: (Math.cos(q) * r * 1.1 - Math.sin(q) * r * 0.7 * v), g: -10, life: 0.45 + Math.random() * 0.3, t: 0, c: ['#ff5030', '#ff8a3c', '#ffd25a', '#fff2c0'][i % 4], streak: 3, drag: 0.9 });
      }
      sfx('burn'); sfx('roar');
    });
    when(BRACE + 700, () => sfx('charge'));
    // 3. the lunge: claws sweep across ahead of it, embers streaming behind
    when(STRIKE - 60, () => {
      if (E) this.mets.push({ kind: 'dclaws', x: bite.x - 4, y: bite.y + 2, sc: 1.15, t0: now(), life: T(840) });
      sfx('whoosh'); sfx('slash');
    });
    when(STRIKE, () => {
      const steps = 8;
      for (let i = 0; i < steps; i++) setTimeout(() => {   // jagged red energy torn off along its path
        const P = this._dheadPose(head, now()), mo = this._dheadAt(P, 30, 66);
        for (let j = 0; j < 4 * lp; j++) this.particles.push({ x: mo.x + 20 + Math.random() * 60, y: mo.y - 30 + Math.random() * 60, vx: 40 + Math.random() * 60, vy: (Math.random() - 0.5) * 40, g: 20, life: 0.4 + Math.random() * 0.4, t: 0, c: ['#ff3a1a', '#ff8a3c', '#ffd25a'][j % 3], streak: 3, drag: 0.9 });
        if (Math.random() < 0.6) this.arcs.push({ bolt: this._zig({ x: mo.x + 10, y: mo.y + (Math.random() - 0.5) * 30 }, { x: mo.x + 40 + Math.random() * 40, y: mo.y + (Math.random() - 0.5) * 40 }, 4, 8), color: Math.random() < 0.5 ? '#ff5030' : '#ffb347', w: 1, t: 0, life: 0.12 });
      }, T(i * (BITE - STRIKE) / steps));
    });
    // 4. the jaws snap shut on the target
    when(BITE, () => {   // the snap
      const mo = { x: bite.x - 6, y: bite.y };
      this.glows.push({ x: mo.x, y: mo.y, r: 40, color: '#ffd25a', t: 0, life: 0.2, a: 1 });
      for (let i = 0; i < 18 * lp; i++) { const q = Math.random() * Math.PI * 2, v = 60 + Math.random() * 90; this.particles.push({ x: mo.x, y: mo.y, vx: Math.cos(q) * v, vy: Math.sin(q) * v, g: 60, life: 0.25 + Math.random() * 0.2, t: 0, c: Math.random() < 0.4 ? '#ffffff' : '#ffb347', streak: 3, drag: 0.85 }); }
      if (E) E.redUntil = now() + T(420);
      this.shake = Math.max(this.shake, 5); this.shakeT = now(); this.freezeUntil = now() + 70;
      sfx('crush');
    });
    when(BITE + 90, () => {   // and the jaws erupt
      const gx = E ? E.x : bite.x, gy = E ? E.y + 1 : A.y;
      this.shake = Math.max(this.shake, 12); this.shakeT = now(); this.flash = Math.max(this.flash || 0, 0.22); this.freezeUntil = now() + 140;
      this.mets.push({ kind: 'dblast', x: gx, y: gy, sc: E && E.size === 'xl' ? 2 : 1.6, t0: now(), life: T(1000) });
      for (let j = 0; j < 2; j++) this.mets.push({ kind: 'fring', x: gx, y: gy + 1, t0: now() + T(j * 110), life: T(650), r1: 70 + j * 40 });
      const N = 9;   // flame spikes erupting in a ring round the target
      for (let i = 0; i < N; i++) {
        const q = (i / N) * Math.PI * 2 + Math.random() * 0.3, R = 26 + Math.random() * 14 + (E && E.size === 'xl' ? 24 : 0);
        this.mets.push({ kind: 'dspike', x: gx + Math.cos(q) * R, y: gy + Math.sin(q) * R * 0.28, sc: 0.8 + Math.random() * 0.5, t0: now() + T(40 + i * 28), life: T(640) });
      }
      for (let i = 0; i < 7; i++) { const q = (i / 7) * Math.PI * 2 + Math.random() * 0.5, L = 40 + Math.random() * 40; this._crack(Math.round(gx), Math.round(gy + 1), Math.round(gx + Math.cos(q) * L), Math.round(gy + 1 + Math.sin(q) * L * 0.25), T(180), T(1900)); }
      for (let i = 0; i < 60 * lp; i++) { const q = Math.random() * Math.PI * 2, v = 60 + Math.random() * 190; this.particles.push({ x: gx, y: gy - 16, vx: Math.cos(q) * v * 1.4, vy: Math.sin(q) * v * 0.8 - 50, g: 140, life: 0.5 + Math.random() * 0.6, t: 0, c: ['#ffffff', '#fff2c0', '#ffd25a', '#ff8a3c', '#ff3a1a'][i % 5], streak: 3 + (i % 4), drag: 0.9 }); }
      this.mets.push({ kind: 'burn', x: gx, y: gy, w: 40, t0: now() + T(250), life: T(1500) });
      if (E) this.hitShake(E, 12);
      this.impact(ev, tgt, 'dragon', rc);
      sfx('boom');
    });
    // 5. it dissolves into spiralling embers and crimson smoke
    when(GONE, () => {
      const P = this._dheadPose(head, now()), pts = this._dheadPts(), c = this._dheadAt(P, 70, 50);
      for (let i = 0; i < Math.min(pts.length, 130 * lp); i++) {
        const [px, py] = pts[Math.floor(Math.random() * pts.length)], q = this._dheadAt(P, px, py);
        const dx = q.x - c.x, dy = q.y - c.y, r = Math.hypot(dx, dy) || 1, sw = 50 + Math.random() * 40;
        this.particles.push({ x: q.x, y: q.y, vx: -dy / r * sw + dx / r * 20, vy: dx / r * sw * 0.6 - 30 - Math.random() * 30, g: -20, life: 0.6 + Math.random() * 0.8, t: 0, c: ['#ff3a1a', '#ff6a2a', '#ffb347', '#ffd25a', '#8a1a14'][i % 5], drag: 0.94, fade: true, plus: i % 9 === 0 });
      }
      for (let i = 0; i < 16 * lp; i++) this.particles.push({ x: c.x + (Math.random() - 0.5) * 90, y: c.y + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 16, g: -4, life: 1 + Math.random() * 0.9, t: 0, c: Math.random() < 0.5 ? '#5a1418' : '#3a0e14', blob: 1 + Math.random() * 2.5, fade: true });
      sfx('rise');
    });
    setTimeout(() => { A.anim = null; A.fiery = null; }, T(acc + 40));
    return T(acc + 350);
  }
  // where the spectral head is at time t: { x, y (its mouth), sc, rot, a, closed, front }
  _dheadPose(m, t) {
    const H = m.home, B = m.bite, back = { x: H.x + 16, y: H.y - 6 };
    if (t < m.tE) {   // forming out of the flames, rising into place
      const k = ease(clamp((t - m.t0) / (m.tE - m.t0), 0, 1));
      return { x: H.x + 10 * (1 - k), y: H.y + 22 * (1 - k), sc: 0.55 + 0.35 * k, rot: 0.06 * (1 - k), a: 0.7 * k, closed: false, front: false };
    }
    if (t < m.tS) {   // rearing back, then trembling with the fire gathered in its jaws
      const k = ease(clamp((t - m.tE) / (m.tD - m.tE), 0, 1)), tr = t > m.tD ? Math.sin(t / 21) : 0;
      return { x: lerp(H.x, back.x, k) + tr, y: lerp(H.y, back.y, k), sc: 0.9 + 0.06 * k, rot: 0.24 * k + 0.02 * tr, a: 0.7, closed: false, front: false };
    }
    if (t < m.tB) {   // the lunge: accelerating, nose dropping to bite
      const k = (t - m.tS) / (m.tB - m.tS), e = k * k;
      return { x: lerp(back.x, B.x, e), y: lerp(back.y, B.y, e) - Math.sin(k * Math.PI) * 16, sc: lerp(0.96, 1.25, e), rot: lerp(0.24, -0.12, e), a: 0.86, closed: false, front: true };
    }
    if (t < m.tX) {   // jaws shut on the target
      const k = (t - m.tB) / (m.tX - m.tB);
      return { x: B.x + Math.sin(t / 17) * (1 - k) * 2, y: B.y, sc: 1.25 + 0.07 * (1 - k), rot: -0.12, a: 0.86, closed: true, front: true };
    }
    const k = clamp((t - m.tX) / (m.t0 + m.life - m.tX), 0, 1);   // dissolving
    return { x: B.x + 4 * k, y: B.y - 8 * k, sc: 1.25 + 0.12 * k, rot: -0.12 + 0.05 * k, a: 0.86 * Math.pow(1 - k, 1.4), closed: true, front: true };
  }
  _dheadAt(P, px, py) {   // a point of the head image (frame pixels) on screen
    const c = Math.cos(P.rot), s = Math.sin(P.rot), x = (px - 32) * P.sc, y = (py - 66) * P.sc;
    return { x: P.x + x * c - y * s, y: P.y + x * s + y * c };
  }
  _dheadPts() {   // opaque pixels of the head (for the dissolve)
    if (this._dPts) return this._dPts;
    const img = PFX.dHead.img; if (!img.complete || !img.naturalWidth) return [[60, 50]];
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 128;
    const g = cv.getContext('2d'); g.drawImage(img, -160, 0);
    const d = g.getImageData(0, 0, 160, 128).data, pts = [];
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 160; x += 2) if (d[(y * 160 + x) * 4 + 3] > 128) pts.push([x, y]);
    return (this._dPts = pts.length ? pts : [[60, 50]]);
  }
  _drawDragonHead(n, m, t) {
    const S = PFX.dHead; if (!S.img.complete || !S.img.naturalWidth) return;
    const P = this._dheadPose(m, t); if (P.a <= 0.01) return;
    n.save(); n.translate(Math.round(P.x), Math.round(P.y)); n.rotate(P.rot); n.scale(P.sc, P.sc);
    const sx = P.closed ? 160 : 0;
    n.globalAlpha = P.a; n.drawImage(S.img, sx, 0, 160, 128, -32, -66, 160, 128);
    n.globalCompositeOperation = 'lighter'; n.globalAlpha = P.a * (0.22 + 0.1 * Math.sin(t / 55));   // spectral glow
    n.drawImage(S.img, sx, 0, 160, 128, -32, -66, 160, 128);
    n.restore();
  }
  // Time Stop (mage legendary), after Andy's concept sheet, on the Channel animation re-timed into four beats.
  // 1. Channel: the staff goes up and is held; a clock rune with an hourglass forms over its tip while blue energy spirals
  //    into it and the mage's outline glows. 2. Time freeze: the rune flares and sends a streak of light down into the
  //    middle of the enemies, a great clock face opens on the floor under them with its hands racing round, a shockwave of
  //    time magic runs out over the floor, and as it passes each enemy, ice crystals burst up round it and it stops dead,
  //    turned to blue crystal, while the room drains of colour and its torches stop flickering. 3. Frozen state: the hands
  //    have slowed to a stop and only tremble, motes of light hang still in the air. 4. Release: the hands spin, time
  //    resumes and the frozen enemies shatter one after another (the damage lands, and Frozen), the clock breaks into
  //    shards of light, the rune dissolves and the colour comes back.
  _timeStopAnim(A, ev, T, ch) {
    const isEnemy = id => { const a = this.actors.get(id); return !!a && a.type === 'enemy'; };
    const tgt = ev.targets.filter(t => isEnemy(t.id));
    const foes = [...new Set(tgt.map(t => t.id))].map(id => this.actors.get(id)).filter(Boolean);
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';
    if (ev.name) this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    // the Channel frames re-timed: raise (0-3) → staff up and held (4, 5) → lower (6, 7)
    const tl = [[0, 70], [1, 80], [2, 80], [3, 90], [4, 260], [5, 2900], [6, 110], [7, 260]];
    const d = Object.assign({}, ch, { timeline: tl, loop: null });
    const at = []; let acc = 0; for (const [, ms] of tl) { at.push(acc); acc += ms; }
    const t0 = now(), sp = T(1000) / 1000;
    A.anim = { d, t0, speed: sp, at, total: acc };
    const when = (ms, fn) => setTimeout(fn, T(ms));
    const lp = this.lowPower ? 0.5 : 1;
    const tipD = TS_TIP[SP.skinKey(A.skin || A.cls)] || [-6, -86];
    const tip = () => ({ x: A.x + A.ox + tipD[0], y: A.y + A.oy + tipD[1] });
    const runeAt = () => { const p = tip(); return { x: p.x, y: Math.max(26, p.y - 20) }; };
    // the enemy side: where the clock opens and how big it is
    const xs = foes.map(e => e.x), ys = foes.map(e => e.y), big = foes.some(e => e.size === 'xl') ? 70 : foes.some(e => e.size === 'l') ? 30 : 0;
    const field = foes.length ? { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 + 2, w: Math.min(this.W * 0.62, Math.max(...xs) - Math.min(...xs) + 76 + big) }
      : { cx: A.x - 120, cy: A.y, w: 110 };
    field.w = Math.max(96, field.w);
    const q = 0.44;   // the floor clock's squash: flatter than this and its numerals smear
    const RAISE = at[4], FREEZE = 1250, SETTLE = FREEZE + 950, RELEASE = 3000, BREAK = RELEASE + 230, END = Math.max(acc, BREAK + 900);
    this.cam = { x: A.x - 10, y: A.y - 54, t0, dur: T(FREEZE + 60), z: 1.08 };
    // 1. channel: the rune forms over the staff, energy spirals into it, her outline glows blue
    when(RAISE - 20, () => {
      this.mets.push({ kind: 'tsrune', at: runeAt, t0: now(), life: T(BREAK - RAISE + 20) });
      this.mets.push({ kind: 'tsgather', at: runeAt, t0: now(), life: T(FREEZE - RAISE - 40) });
      A.chronoRim = { t0: now(), until: now() + T(BREAK - RAISE + 200) };
      this.rune(A.x, A.y, '#6fc8ff'); sfx('charge'); sfx('twinkle');
    });
    when(RAISE + 520, () => sfx('charge'));
    // 2. time freeze
    when(FREEZE - 140, () => {   // the rune flares and a streak of light drops into the middle of the enemies
      const r = runeAt();
      this.glows.push({ x: r.x, y: r.y, r: 40, color: '#bfe6ff', t: 0, life: 0.35, a: 1 });
      for (let i = 0; i < 3; i++) this.arcs.push({ bolt: this._zig(r, { x: field.cx + (Math.random() - 0.5) * 10, y: field.cy - 6 }, 9, 10), color: i ? '#6fc8ff' : '#ffffff', w: i ? 1 : 2, t: 0, life: 0.2 });
      sfx('zap');
    });
    const clock = { kind: 'tsclock', x: field.cx, y: field.cy, w: field.w * 1.08, q, t0: t0 + T(FREEZE), tS: t0 + T(SETTLE), tR: t0 + T(RELEASE), tB: t0 + T(BREAK), life: T(BREAK - FREEZE + 520) };
    when(FREEZE, () => {
      this.mets.push(clock);
      this.mets.push({ kind: 'tswave', x: field.cx, y: field.cy, sx: field.w * 2.2 / 176, t0: now(), life: T(1000) });
      this.glows.push({ x: field.cx, y: field.cy - 8, r: field.w * 0.6, color: '#6fc8ff', t: 0, life: 0.5, a: 0.7 });
      this.chrono = { t0: now(), stopAt: now() + T(320), until: now() + T(BREAK - FREEZE + 120) };
      this.flash = 0.28; this.flashC = '200,232,255';
      this.shake = Math.max(this.shake, 5); this.shakeT = now();
      this.cam = { x: (field.cx + A.x) / 2 - 10, y: Math.min(field.cy, A.y) - 34, t0: now(), dur: T(BREAK - FREEZE + 500), z: 1.05 };
      // motes of light that drift in, then hang perfectly still until time resumes
      const pts = [];
      for (let i = 0; i < 34 * lp; i++) pts.push({ x: field.cx + (Math.random() - 0.5) * field.w * 1.3, y: field.cy - 6 - Math.random() * 70, dx: (Math.random() - 0.5) * 16, dy: (Math.random() - 0.5) * 10, c: ['#ffffff', '#bfe6ff', '#6fc8ff', '#b8a6ff'][i % 4], ph: Math.random() * 6, plus: i % 5 === 0 });
      this.mets.push({ kind: 'tsmotes', pts, cx: field.cx, cy: field.cy - 20, t0: now(), tS: now() + T(380), tR: t0 + T(BREAK), life: T(BREAK - FREEZE + 150) });
      sfx('ice'); sfx('whoosh');
    });
    // each enemy freezes as the shockwave reaches it
    const reach = 88 * field.w * 2.2 / 176;   // the wave's half-width at its widest (px)
    const order = foes.slice().sort((a, b) => Math.abs(a.x - field.cx) - Math.abs(b.x - field.cx));   // they shatter from the middle out
    const breakAt = E => BREAK + order.indexOf(E) * 90;
    foes.forEach(E => {
      const dt = 60 + Math.min(1, Math.abs(E.x - field.cx) / reach) * 560;
      when(FREEZE + dt, () => {
        const sc = E.size === 'xl' ? 2 : 1;
        E.tstop = { t0: now(), until: t0 + T(breakAt(E) + 40) };
        this.mets.push({ kind: 'tscrys', follow: E, sc, t0: now(), life: T(breakAt(E) - FREEZE - dt) });
        const hy = E.y - ({ xl: 40, l: 24 }[E.size] || 14);
        this.glows.push({ x: E.x, y: hy, r: 30 * sc, color: '#bfe6ff', t: 0, life: 0.3, a: 0.9 });
        for (let i = 0; i < 16 * lp; i++) { const qd = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60; this.particles.push({ x: E.x + Math.cos(qd) * 8 * sc, y: E.y - 2, vx: Math.cos(qd) * v, vy: -20 - Math.random() * 50, g: 120, life: 0.35 + Math.random() * 0.3, t: 0, c: ['#ffffff', '#bfe6ff', '#6fc8ff'][i % 3], streak: 2, drag: 0.88 }); }
        this.freezeUntil = now() + 50;
        sfx('ice');
      });
    });
    // 3. frozen state: everything still; the clock ticks
    when(SETTLE + 150, () => sfx('click'));
    when(SETTLE + 650, () => sfx('click'));
    // 4. release: the hands spin, the rune and the clock flare, then everything frozen shatters
    when(RELEASE, () => {
      const r = runeAt();
      this.glows.push({ x: r.x, y: r.y, r: 46, color: '#ffffff', t: 0, life: 0.3, a: 1 });
      this.glows.push({ x: field.cx, y: field.cy - 4, r: field.w * 0.55, color: '#bfe6ff', t: 0, life: 0.35, a: 0.8 });
      sfx('whirl'); sfx('charge');
    });
    order.forEach(E => when(breakAt(E), () => {
      const sc = E.size === 'xl' ? 2 : E.size === 'l' ? 1.5 : 1, hy = E.y - ({ xl: 40, l: 24 }[E.size] || 14);
      E.tstop = null;
      this.mets.push({ kind: 'tsshatter', x: E.x, y: hy, sc: E.size === 'xl' ? 2 : 1, t0: now(), life: T(800) });
      for (let j = 0; j < 22 * lp * sc; j++) {   // the crystal coat breaks off in tumbling chunks
        const qd = Math.random() * Math.PI * 2, v = 50 + Math.random() * 110;
        this.particles.push({ x: E.x + (Math.random() - 0.5) * 16 * sc, y: hy + (Math.random() - 0.5) * 20 * sc, vx: Math.cos(qd) * v, vy: Math.sin(qd) * v * 0.7 - 60, g: 260, life: 0.5 + Math.random() * 0.5, t: 0, c: ['#dff4ff', '#8fd0ff', '#4a8cff', '#2a4aa8'][j % 4], cube: 1 + (j % 3), spin: Math.random() * 4, drag: 0.92 });
      }
      this.impact(ev, tgt, 'timestop', rc, tgt.filter(t => t.id === E.id), true);
      this.shake = Math.max(this.shake, 7); this.shakeT = now();
      sfx('crush');
    }));
    when(BREAK, () => {   // the clock breaks into shards of light, the motes fly off, the colour comes back
      this.flash = 0.3; this.flashC = '210,236,255';
      for (let i = 0; i < 70 * lp; i++) {
        const qd = Math.random() * Math.PI * 2, R = field.w * 0.46, x = field.cx + Math.cos(qd) * R, y = field.cy + Math.sin(qd) * R * q;
        this.particles.push({ x, y, vx: Math.cos(qd) * (60 + Math.random() * 80), vy: Math.sin(qd) * 30 - 40 - Math.random() * 50, g: 90, life: 0.45 + Math.random() * 0.5, t: 0, c: ['#ffffff', '#bfe6ff', '#6fc8ff', '#b8a6ff'][i % 4], streak: 3, drag: 0.9 });
      }
      const r = runeAt();
      this.mets.push({ kind: 'tsshatter', x: r.x, y: r.y, sc: 1, t0: now(), life: T(700) });
      sfx('boom'); sfx('ice');
    });
    when(BREAK + order.length * 90 + 60, () => { const rest = ev.targets.filter(t => !isEnemy(t.id)); if (rest.length) this.impact(ev, [], 'timestop', rc, rest, true); this._applyAfter(ev); });
    setTimeout(() => { A.anim = null; A.chronoRim = null; }, T(acc + 40));
    return T(END + 300);
  }
  // the clock's hands: minute-hand angle at time t (they race round, slow to a stop, tremble, then spin on release)
  _tsHands(m, t) {
    const s = t - m.t0, SET = m.tS - m.t0, v0 = 0.04;   // radians per ms at the start
    let a;
    if (t < m.tS) { const k = s / SET; a = v0 * SET * (1 - Math.pow(1 - k, 3)) / 3; }
    else a = v0 * SET / 3;
    if (t >= m.tS && t < m.tR) a += Math.sin(t / 23) * 0.012;   // stopped, trembling
    if (t >= m.tR) { const r = t - m.tR; a += 0.00004 * r * r; }   // time resumes with a lurch
    return a - Math.PI / 2 - 0.4;
  }
  _drawTsClock(n, m, t) {
    const F = PFX.tsClock, G = PFX.tsGear; if (!F.img.complete || !F.img.naturalWidth) return;
    const age = t - m.t0, open = ease(clamp(age / 320, 0, 1));
    const brk = t > m.tB ? clamp((t - m.tB) / 380, 0, 1) : 0;
    const a = this._tsHands(m, t), D = m.w * (0.62 + 0.38 * open) * (1 + 0.12 * brk);
    const glow = t >= m.tR && t < m.tB ? 0.35 : 0;
    n.save(); n.globalCompositeOperation = 'lighter';
    n.imageSmoothingEnabled = true;   // its 1px lines break up if squashed into perspective by nearest-neighbour sampling
    n.translate(Math.round(m.x), Math.round(m.y)); n.scale(1, m.q);
    n.globalAlpha = open * (1 - brk) * (0.42 + glow);   // the toothed ring turns the other way round the face
    n.save(); n.rotate(-a * 0.12); n.scale(D * 1.24 / 128, D * 1.24 / 128); n.drawImage(G.img, -64, -64); n.restore();
    n.globalAlpha = Math.min(1, open * (1 - brk) * (0.95 + glow + 0.1 * Math.sin(t / 140)));
    n.save(); n.rotate(a * 0.02); n.scale(D / 128, D / 128); n.drawImage(F.img, -64, -64); n.restore();
    // the hands, drawn flat on the face (the squash puts them into the floor's perspective)
    const hand = (ang, len, w, col) => { n.save(); n.rotate(ang); n.fillStyle = col; n.fillRect(-2, -w / 2, len + 2, w); n.restore(); };
    n.globalAlpha = open * (1 - brk);
    hand(a / 12 + 1.1, D * 0.24, 3, '#6fc8ff'); hand(a, D * 0.36, 2, '#dff4ff');
    hand(a / 12 + 1.1, D * 0.24, 1, '#ffffff'); n.fillStyle = '#ffffff'; n.fillRect(-2, -2, 4, 4);
    n.restore();
  }
  // effects drawn behind the fighters (pixel layer)
  drawBehindFx(n, t) {
    for (const m of this.mets) {
      const age = t - m.t0; if (age < 0 || age > m.life) continue;
      if (m.kind === 'deyes') {
        const S = PFX.dEyes; if (!S.img.complete || !S.img.naturalWidth) continue;
        const f = Math.min(S.n - 1, Math.floor(age / 1000 * S.fps));
        n.globalAlpha = 0.9; n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(m.x - S.ax * m.sc), Math.round(m.y - S.ay * m.sc), S.w * m.sc, S.h * m.sc); n.globalAlpha = 1;
      }
      else if (m.kind === 'dhead' && !this._dheadPose(m, t).front) this._drawDragonHead(n, m, t);
      // ---- Time Stop: the clock on the floor, the shockwave over it, the crystals behind each frozen enemy
      else if (m.kind === 'tsclock') this._drawTsClock(n, m, t);
      else if (m.kind === 'tswave') {
        const S = PFX.tsWave; if (!S.img.complete || !S.img.naturalWidth) continue;
        const f = Math.floor(age / 1000 * S.fps); if (f >= S.n) continue;
        n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = 0.8;
        n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(m.x - S.ax * m.sx), Math.round(m.y - S.ay * m.sx * 0.8), Math.round(S.w * m.sx), Math.round(S.h * m.sx * 0.8));
        n.restore();
      }
      else if (m.kind === 'tscrys') this._drawTsCrystals(n, m, t, PFX.tsCrys);
    }
  }
  _drawTsCrystals(n, m, t, S) {
    if (!S.img.complete || !S.img.naturalWidth) return;
    const age = t - m.t0, f = Math.min(S.n - 1, Math.floor(age / 1000 * S.fps)), E = m.follow;
    n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(E.x - S.ax * m.sc), Math.round(E.y + 3 - S.ay * m.sc), S.w * m.sc, S.h * m.sc);
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
        if (this.pixelFx) { glow(cx, cy, R * 2.2, '#ff4a1a', 0.55); for (let j = 0; j < 3; j++) { const q = Math.random() * 6.28; this.particles.push({ x: a.x + a.ox + Math.cos(q) * 38, y: a.y + a.oy - 24 + Math.sin(q) * 38, vx: 40 + Math.random() * 40, vy: -40 - Math.random() * 30, g: 40, life: 0.35, t: 0, c: Math.random() < 0.5 ? '#ffb347' : '#e8301a', streak: 2, drag: 0.9 }); } continue; }
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
      } else if (m.kind === 'wpillar') { const a = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1, r = Math.max(50, m.w * 0.75); ctx.save(); ctx.translate(X(m.x), Y(m.y - 60)); ctx.scale(0.75, 2.4); glow(0, 0, r * s, '#fff2c0', 0.4 * a); ctx.restore(); glow(X(m.x), Y(m.y), r * 1.2 * s, '#ffe08a', 0.35 * a);
      } else if (m.kind === 'wmark') { glow(X(m.x), Y(m.y), (26 + 18 * k) * s * (m.sx || 1) * 0.8, '#ffd86a', 0.25 + 0.45 * k);
      } else if (m.kind === 'wring') { ctx.save(); ctx.translate(X(m.x), Y(m.y)); ctx.scale(1, m.q); glow(0, 0, m.w * 0.55 * s, '#ffd86a', (0.12 + 0.2 * k) * Math.min(1, age / 260) * (m.fade ? clamp((m.life - age) / m.fade, 0, 1) : 1)); ctx.restore();
      } else if (m.kind === 'whalo') { const a = m.follow; glow(X(a.x + a.ox - 2), Y(a.y + a.oy - 66), 22 * s, '#ffe9a0', 0.55); glow(X(a.x + a.ox), Y(a.y + a.oy - 28), 40 * s, '#ffd86a', 0.25);
      } else if (m.kind === 'demark') { const p = this._hitPoint(m.follow); glow(X(p.x), Y(p.y), 18 * s, '#3fdc9a', 0.25 + 0.1 * Math.sin(age / 70));
      } else if (m.kind === 'decharge') { glow(X(m.x), Y(m.y), (10 + 18 * Math.min(1, k * 2) + 3 * Math.sin(age / 50)) * s, '#5affc0', 0.45 + 0.3 * Math.min(1, k * 2));
      } else if (m.kind === 'dearrow') { const P = this._pvAt(m, Math.min(1, age / m.life)); glow(X(P.x), Y(P.y), 16 * s, '#5affc0', 0.6);
      } else if (m.kind === 'decrit') { if (k < 0.35) glow(X(m.x), Y(m.y), 44 * s * (0.6 + k), '#c8fff0', 0.7 * (1 - k / 0.35));
      } else if (m.kind === 'dsstar') { const tp = this._tipAt(m.follow) || m.last; if (tp) glow(X(tp.x), Y(tp.y), (18 + 14 * Math.min(1, k * 1.6)) * s * (0.92 + 0.08 * Math.sin(t / 60)), '#ffd86a', 0.75);
      } else if (m.kind === 'dsbolt') { const P = this._pvAt(m, ease(Math.min(1, age / m.life))); glow(X(P.x), Y(P.y), 16 * s, '#ffe9a0', 0.7);
      } else if (m.kind === 'dsring') { const e = eo(k), r = (10 + 34 * e) * s; ctx.strokeStyle = hexA('#ffe27a', 0.8 * (1 - k)); ctx.lineWidth = Math.max(1, 3 * s * (1 - k)); ctx.beginPath(); ctx.ellipse(X(m.x), Y(m.y), r, r * 0.26, 0, 0, TAU); ctx.stroke();
      } else if (m.kind === 'dspurify') { const a = k < 0.2 ? k / 0.2 : Math.max(0, 1 - (k - 0.2) / 0.8); ctx.save(); ctx.translate(X(m.x), Y(m.y - 40)); ctx.scale(0.45, 1.8); glow(0, 0, 34 * s, '#fff2c0', 0.4 * a); ctx.restore();
      } else if (m.kind === 'pcharge') { const g0 = Math.min(1, age / Math.max(1, m.orb)); glow(X(m.x), Y(m.y), (8 + 16 * g0 + (age > m.orb ? 3 * Math.sin(age / 60) : 0)) * s, '#7affd8', 0.35 + 0.35 * g0);
      } else if (m.kind === 'parrow') { const P = this._pvAt(m, Math.min(1, age / m.life)); glow(X(P.x), Y(P.y), 15 * s, '#7affd8', 0.55 * m.a);
      } else if (m.kind === 'pimpact') { if (k < 0.3) glow(X(m.x), Y(m.y - 12), 16 * s, '#a8ffe0', 0.5 * (1 - k / 0.3)); else glow(X(m.x), Y(m.y - 16), 18 * s, '#9a7aff', 0.25 * (1 - k));
      } else if (m.kind === 'scharge') { const tip = this._tipAt(m.follow); if (tip) glow(X(tip.x), Y(tip.y), (16 + 14 * Math.min(1, k * 1.5)) * s, '#9fd0ff', 0.7);
      } else if (m.kind === 'sarrow' || m.kind === 'sdrop') { const kk = Math.min(1, age / m.life); let x, y; if (m.kind === 'sarrow') { const u = 1 - kk; x = u * u * m.from.x + 2 * u * kk * m.ctrl.x + kk * kk * m.to.x; y = u * u * m.from.y + 2 * u * kk * m.ctrl.y + kk * kk * m.to.y; } else { x = lerp(m.from.x, m.to.x, kk * kk); y = lerp(m.from.y, m.to.y, kk * kk); } glow(X(x), Y(y), 18 * s, '#a8c8ff', 0.6);
      } else if (m.kind === 'daura') {   // Dragon's Wrath: the mage's fiery aura, embers rising off the floor, energy pulled into her hand
        const a = m.follow, env = Math.min(1, k * 6, (1 - k) * 5), hx = m.hand(), lp = this.lowPower ? 0.5 : 1;
        glow(X(a.x + a.ox), Y(a.y + a.oy - 26), 44 * s * (0.9 + 0.1 * Math.sin(t / 70)), '#ff4a1a', 0.2 * env);
        glow(X(hx.x), Y(hx.y), (10 + 12 * k) * s, '#ff7a2a', 0.8 * env);
        if (Math.random() < 0.9 * env * lp) this.particles.push({ x: a.x + (Math.random() - 0.5) * 70, y: a.y + 2 + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 10, vy: -28 - Math.random() * 40, g: -12, life: 0.7 + Math.random() * 0.7, t: 0, c: ['#ff5030', '#ff8a3c', '#ffd25a'][Math.floor(Math.random() * 3)], fade: true });
        if (Math.random() < 0.8 * env * lp) { const q = Math.random() * TAU, r = 22 + Math.random() * 16; this.particles.push({ x: hx.x + Math.cos(q) * r, y: hx.y + Math.sin(q) * r, vx: -Math.cos(q) * r * 3.2, vy: -Math.sin(q) * r * 3.2, g: 0, life: 0.3, t: 0, c: Math.random() < 0.4 ? '#fff2c0' : '#ff7a2a', streak: 2 }); }
      } else if (m.kind === 'deyes') {   // a red haze round the eyes in the dark
        const env = Math.min(1, k * 4, (1 - k) * 3);
        glow(X(m.x - 34 * m.sc), Y(m.y), 26 * s * m.sc, '#ff3a1a', 0.55 * env); glow(X(m.x + 34 * m.sc), Y(m.y), 26 * s * m.sc, '#ff3a1a', 0.55 * env);
        glow(X(m.x), Y(m.y), 90 * s * m.sc, '#a01810', 0.3 * env);
      } else if (m.kind === 'dhead') {   // the dragon's own light, and the fire gathering in its jaws while it draws back
        const P = this._dheadPose(m, t), c = this._dheadAt(P, 70, 40), mo = this._dheadAt(P, 30, 66);
        glow(X(c.x), Y(c.y), 92 * s * P.sc, '#ff4a1a', 0.32 * P.a);
        if (t > m.tE && t < m.tB) { const g = Math.min(1, (t - m.tE) / (m.tS - m.tE)); glow(X(mo.x), Y(mo.y), (8 + 22 * g) * s * (0.9 + 0.1 * Math.sin(t / 30)), '#ffd25a', 0.5 + 0.4 * g); }
      } else if (m.kind === 'dorb') {   // the staff tip burning brighter as the dragon forms
        const a = m.follow, mz = { x: a.x + a.ox + m.mz[0], y: a.y + a.oy + m.mz[1] }, env = Math.min(1, age / 200, (1 - k) * 8);
        glow(X(mz.x), Y(mz.y), (8 + 16 * k) * s * (0.85 + 0.15 * Math.sin(t / 33)), '#ff6a2a', 0.85 * env);
        if (Math.random() < 0.7 * env) { const q = Math.random() * TAU, r = 14 + Math.random() * 12; this.particles.push({ x: mz.x + Math.cos(q) * r, y: mz.y + Math.sin(q) * r, vx: -Math.cos(q) * r * 4, vy: -Math.sin(q) * r * 4, g: 0, life: 0.22, t: 0, c: Math.random() < 0.4 ? '#fff6c8' : '#ff8a3c', streak: 2 }); }
      } else if (m.kind === 'dclaws') { glow(X(m.x), Y(m.y), 70 * s * m.sc, '#ff3a1a', 0.5 * (1 - k));
      } else if (m.kind === 'dblast') { glow(X(m.x), Y(m.y - 30), 110 * s, '#ff5a1a', 0.75 * Math.max(0, 1 - k * 1.3)); glow(X(m.x), Y(m.y - 20), 46 * s, '#fff2c0', 0.8 * Math.max(0, 1 - k * 3));
      } else if (m.kind === 'dspike') { glow(X(m.x), Y(m.y - 30 * m.sc), 22 * s * m.sc, '#ff5a1a', 0.45 * (1 - k));
      // ---- Resurrection: the light around the pixel art
      } else if (m.kind === 'rhalo') { const a = m.follow; glow(X(a.x + a.ox - 2), Y(a.y + a.oy - m.dy), 20 * s, '#ffe9a0', 0.55 * Math.min(1, age / 200, (m.life - age) / 300));
      } else if (m.kind === 'rportal') {
        const op = eo(age / m.open), cl = Math.max(0, Math.min(1, (m.life - age) / m.close)), kk = op * eo(cl);
        ctx.save(); ctx.translate(X(m.x), Y(m.y)); ctx.scale(1, 0.32); glow(0, 0, 90 * s * kk, '#fff2c0', 0.35 * kk); ctx.restore();
        glow(X(m.x), Y(m.y), 22 * s * kk, '#ffffff', 0.35 * kk);
      } else if (m.kind === 'rshaft') {   // a soft cone of light from the portal down to the floor
        const a = Math.min(1, age / 400, (m.life - age) / 500) * (0.85 + 0.15 * Math.sin(t / 160));
        const y0 = Y(m.y0), y1 = Y(m.y1), x = X(m.x);
        const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, hexA('#fff2c0', 0.2 * a)); g.addColorStop(0.6, hexA('#ffe08a', 0.08 * a)); g.addColorStop(1, hexA('#ffe08a', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - m.w0 * s, y0); ctx.lineTo(x + m.w0 * s, y0); ctx.lineTo(x + m.w1 * s, y1); ctx.lineTo(x - m.w1 * s, y1); ctx.closePath(); ctx.fill();
        const g2 = ctx.createLinearGradient(0, y0, 0, y1); g2.addColorStop(0, hexA('#ffffff', 0.1 * a)); g2.addColorStop(1, hexA('#fff2c0', 0));
        ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x - m.w0 * 0.35 * s, y0); ctx.lineTo(x + m.w0 * 0.35 * s, y0); ctx.lineTo(x + m.w1 * 0.4 * s, y1); ctx.lineTo(x - m.w1 * 0.4 * s, y1); ctx.closePath(); ctx.fill();
      } else if (m.kind === 'rangel') {   // the light she gives off, and the burst of light round her head
        const P = this._angelAt(m, t), a = Math.max(P.ba, P.wa * 0.7);
        if (a > 0) { glow(X(P.x), Y(P.y - 18), 80 * s, '#ffe9a0', 0.12 * a); glow(X(P.x), Y(P.y - 48), 20 * s * (0.9 + 0.1 * Math.sin(t / 90)), '#ffffff', 0.35 * P.ba); }
      } else if (m.kind === 'rbeam') {   // warm golden-white light from her hand to the fallen hero's chest
        const fr = m.from(), F = m.to, to = { x: F.x + F.ox, y: F.y + F.oy - 22 };
        const a = Math.min(1, age / 220, (m.life - age) / 260), fl = 0.85 + 0.15 * Math.sin(t / 37) * Math.sin(t / 83);
        const line = (w, col, al) => { ctx.strokeStyle = hexA(col, al * a * fl); ctx.lineWidth = w * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X(fr.x), Y(fr.y)); ctx.lineTo(X(to.x), Y(to.y)); ctx.stroke(); };
        line(9, '#ffd86a', 0.18); line(4.5, '#ffe9a0', 0.4); line(1.6, '#ffffff', 0.9);
        glow(X(fr.x), Y(fr.y), 12 * s, '#ffffff', 0.7 * a); glow(X(to.x), Y(to.y), 18 * s * fl, '#fff2c0', 0.45 * a);
        if (Math.random() < 0.7 * a) { const u = Math.random(); this.particles.push({ x: lerp(fr.x, to.x, u), y: lerp(fr.y, to.y, u), vx: (to.x - fr.x) * 0.8, vy: (to.y - fr.y) * 0.8, g: 0, life: 0.25, t: 0, c: Math.random() < 0.5 ? '#ffffff' : '#ffe27a', plus: Math.random() < 0.3, fade: true }); }
      } else if (m.kind === 'rpulse') {   // a ring of light racing out over the floor
        const e = eo(k), r = (6 + m.r1 * e) * s, a = 1 - k;
        ctx.strokeStyle = hexA('#ffd86a', 0.8 * a); ctx.lineWidth = Math.max(1.5, s * 4 * a);
        ctx.beginPath(); ctx.ellipse(X(m.x), Y(m.y), r, r * 0.26, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = hexA('#ffffff', 0.75 * a); ctx.lineWidth = Math.max(1, s * 1.4 * a);
        ctx.beginPath(); ctx.ellipse(X(m.x), Y(m.y), r * 0.96, r * 0.25, 0, 0, TAU); ctx.stroke();
        if (k < 0.3) glow(X(m.x), Y(m.y - 10), 30 * s, '#fff2c0', 0.6 * (1 - k / 0.3));
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
    const reach = e => ({ x: e.x + this.reachDX(e) + (anim.dash || 0), y: e.y + 2 });
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
    const reach = e => ({ x: e.x + this.reachDX(e), y: e.y + 2 });
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

  // Divine Shield's dome round a hero: it forms (frames 0-5) when the skill's light reaches them, shimmers brightly while
  // the move plays, then stays up dimmer for as long as the Divine Shield status lasts. A blocked hit makes it flare.
  _drawDome(n, a, t, kx) {
    const S = PFX.dsDome, d = a.dome, on = a.st && a.st.divine && !a.downed;
    if (!S.img.complete || !S.img.naturalWidth || (!on && !(d && t < d.bright))) { if (!on && d && t >= d.bright) a.dome = null; return; }
    const age = d ? t - d.t0 : 1e6, f0 = Math.floor(age / 1000 * S.fps), f = f0 < 6 ? f0 : 6 + Math.floor((f0 - 6) / 1.5) % 8;
    let al = d && t < d.bright ? 0.95 : 0.36 + 0.07 * Math.sin(t / 300);   // dimmer once the move is over, so a shielded party stays readable
    if (a.domeFlash && t - a.domeFlash < 450) al = Math.min(1, al + 0.45 * (1 - (t - a.domeFlash) / 450));
    n.globalAlpha = al * (a.alpha == null ? 1 : a.alpha);
    n.drawImage(S.img, (f % S.cols) * S.w, Math.floor(f / S.cols) * S.h, S.w, S.h, Math.round(a.x + a.ox + kx - S.ax), Math.round(a.y + a.oy - S.ay), S.w, S.h);
    n.globalAlpha = 1;
  }
  // what a hero's gear and buffs did when an enemy hit them
  _react(h, E) {
    const p = this.pos(h.id); if (!p) return;
    if (h.shielded && p.a) p.a.domeFlash = now();
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
      if (E.size === 'xl' && !this.inLava(E)) setTimeout(() => this.move(E, 18, 0, T(140), true), T(240));   // the raid dragon's rock stays in its lava pool: it leans in instead
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
          if (E.kind === 'voidmaw') { for (let k = 0; k < 3; k++) this.projectile({ x: E.x + 8, y: E.y - 118 }, { x: p.x + (k - 1) * 4, y: p.y - 18 }, 'proj_fire', 260 + k * 60); continue; }   // the dragon breathes fireballs from its jaws
          for (let k = 0; k < 4; k++) this.projectile({ x: E.x + 30, y: E.y - 40 + k * 4 }, { x: p.x + (k - 2) * 3, y: p.y - 18 }, 'crystal', 220 + k * 40);
        }
      }, T(420));
      setTimeout(() => {
        for (const h of ev.targets) {
          const p = this.pos(h.id); if (!p) continue;
          if (h.shatter) { this.burst(p.x, p.y - 10, '#ffc24a', 40, 44); continue; }
          if (h.dodged) { this.move(p.a, 10, -10, T(120), true); setTimeout(() => this.move(p.a, 0, 0, T(200), true), T(180)); this.number(p.x, p.y - 46, 'Dodged!', '#9fffe0', 1.1, true); this.arc(p.x - 12, p.y - 18, 12, '#9fffe0'); continue; }
          this.burst(p.x, p.y - 18, E.kind === 'voidmaw' ? '#ff7a2a' : '#ffc24a', 16, 28);
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
  // ------------------------------------------------------------ the raid cavern (theme 'inferno')
  inLava(a) { return !!(this.infernoOn && a && a.kind === 'voidmaw'); }
  // how far in front of an enemy a melee hero stops (the raid dragon: on the shore, past the lava)
  reachDX(e) { return this.inLava(e) ? 58 : e.size === 'xl' ? 46 : e.size === 'l' ? 26 : 20; }
  // the lava pool (scrolling PixelLab lava through the pool mask), bubbles, the lava falls' flow, rising embers
  drawInfernoBack(n, t, time) {
    const P = this.pool, lava = INFERNO_ART.lava;
    if (P && lava) {
      const b = P.box;
      if (!this._poolBuf || this._poolBuf.width !== b.w || this._poolBuf.height !== b.h) { this._poolBuf = document.createElement('canvas'); this._poolBuf.width = b.w; this._poolBuf.height = b.h; }
      const c = this._poolBuf.getContext('2d'); c.imageSmoothingEnabled = false;
      c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, b.w, b.h);
      const off = Math.floor(time * 5) % lava.width, vy = Math.round((b.h - lava.height) / 2);
      for (let x = -off; x < b.w; x += lava.width) c.drawImage(lava, x, vy);
      if (lava.height < b.h) for (let x = -off; x < b.w; x += lava.width) { c.drawImage(lava, x, vy - lava.height); c.drawImage(lava, x, vy + lava.height); }
      // a slow pulse of heat across the surface
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.08 + 0.06 * Math.sin(time * 1.7);
      c.fillStyle = '#ff9a3c'; c.fillRect(0, 0, b.w, b.h); c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-in'; c.drawImage(P.mask, -b.x, -b.y);
      c.globalCompositeOperation = 'source-over';
      n.drawImage(this._poolBuf, b.x, b.y);
      // bubbles: a bright point swells, bursts into a ring and throws up a droplet
      this._bubbles = this._bubbles || [];
      if (!this.lowPower && Math.random() < 0.06) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.85;
        const bx = Math.round(P.cx + Math.cos(a) * P.rx * r), by = Math.round(P.cy + Math.sin(a) * P.ry * r);
        if (Math.abs(bx - P.footX) > 46 || by > P.surf + 2) this._bubbles.push({ x: bx, y: by, t0: t });
      }
      for (let i = this._bubbles.length - 1; i >= 0; i--) {
        const B = this._bubbles[i], k = (t - B.t0) / 700;
        if (k >= 1) { this._bubbles.splice(i, 1); continue; }
        if (k < 0.45) { n.fillStyle = '#fff2b0'; n.fillRect(B.x, B.y, 1, 1); if (k > 0.2) { n.fillStyle = '#ffc24a'; n.fillRect(B.x - 1, B.y, 3, 1); n.fillRect(B.x, B.y - 1, 1, 1); } }
        else {
          const r = 1 + Math.round((k - 0.45) * 6);
          n.globalAlpha = 1 - k; n.fillStyle = '#ffd060';
          n.fillRect(B.x - r, B.y, 1, 1); n.fillRect(B.x + r, B.y, 1, 1); n.fillRect(B.x, B.y - Math.max(1, r >> 1), 1, 1);
          n.globalAlpha = 1;
          if (!B.pop) { B.pop = 1; this.particles.push({ x: B.x, y: B.y - 1, vx: (Math.random() - 0.5) * 14, vy: -26 - Math.random() * 14, g: 90, life: 0.45, t: 0, c: '#ffc24a' }); }
        }
      }
    }
    // the lava falls run downwards
    if (this.hot && !this.lowPower) {
      const h = this.hot; n.fillStyle = '#fff2b0';
      for (let i = 0; i < h.length; i += 2) { const x = h[i], y = h[i + 1]; if (Math.sin(y * 0.42 - time * 9 + (x % 4) * 1.3) > 0.82) n.fillRect(x, y, 1, 1); }
    }
    // embers drift up off the pool and the floor cracks
    if (!this.lowPower && Math.random() < 0.35) {
      const fromPool = P && Math.random() < 0.55;
      const x = fromPool ? P.cx + (Math.random() - 0.5) * P.rx * 1.6 : Math.random() * this.W;
      const y = fromPool ? P.cy + (Math.random() - 0.5) * P.ry : this.floorTop + 6 + Math.random() * (this.H - this.floorTop - 10);
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: -10 - Math.random() * 16, g: -3, life: 1.6 + Math.random() * 1.6, t: 0, c: ['#ffc24a', '#ff8a3c', '#ff5a2a', '#fff2b0'][Math.floor(Math.random() * 4)], fade: true });
    }
  }
  // drawn just after the dragon: the front of the pool over the bottom of its rock, so the rock rises out of
  // the lava, then the lava glowing where it touches the rock and small wavelets running away from it
  drawLavaLip(n, t, time, a, ax) {
    const P = this.pool; if (!P || !this._poolBuf) return;
    if (!this._lip) {   // how wide the rock is at the lava line (from the idle frame)
      const fr = SP.enemyFrame('voidmaw', 'idle0'), info = SP.enemyInfo('voidmaw');
      const row = info.ay - (P.footY - P.surf);
      let l = 0, r = 0;
      try {
        const d = fr.getContext('2d').getImageData(0, row, fr.width, 1).data;
        let x0 = -1, x1 = -1; for (let x = 0; x < fr.width; x++) if (d[x * 4 + 3] > 100) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 >= 0) { l = x0 - info.ax; r = x1 - info.ax; }
      } catch (e) { l = -66; r = 41; }
      this._lip = { l: l || -66, r: r || 41 };
    }
    const b = P.box, L = this._lip;
    const x0 = Math.max(b.x, Math.round(ax + L.l - 6)), x1 = Math.min(b.x + b.w, Math.round(ax + L.r + 7));
    const y0 = P.surf, y1 = b.y + b.h;
    // the lava's glow on the foot of the rock, fading upwards
    const info = SP.enemyInfo('voidmaw'), glow = this.tinted(this.frameFor(a, true), '#ff7a2a');
    const fx = Math.round(ax - info.ax), fy = Math.round(a.y + a.oy - info.ay);
    n.save(); n.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) { const r0 = info.ay - 4 - (k + 1) * 4; n.globalAlpha = (0.26 - k * 0.04) * (0.85 + 0.15 * Math.sin(time * 2.3 + 1)); n.drawImage(glow, 0, r0, glow.width, 4, fx, fy + r0, glow.width, 4); }
    n.restore();
    // column by column, so the lava line laps gently instead of cutting straight across the rock
    for (let x = x0; x < x1; x++) {
      const yy = y0 + (Math.sin(x * 0.35 + time * 2.2) > 0.55 ? -1 : 0) + (Math.sin(x * 0.13 - time * 1.3) > 0.65 ? 1 : 0);
      if (y1 > yy) n.drawImage(this._poolBuf, x - b.x, yy - b.y, 1, y1 - yy, x, yy, 1, y1 - yy);
      if (x < ax + L.l - 1 || x > ax + L.r + 1) continue;
      const f = Math.sin(time * 6 + x * 0.9) * 0.5 + 0.5;   // the lava glowing against the rock, flickering
      n.globalAlpha = 0.35 + 0.5 * f; n.fillStyle = f > 0.85 ? '#fff2b0' : f > 0.4 ? '#ffc24a' : '#ff8a3c'; n.fillRect(x, yy, 1, 1);
      n.globalAlpha = 1;
    }
    // wavelets spreading out from both sides of the rock
    for (let k = 0; k < 2; k++) {
      const d = (time * 9 + k * 13) % 26, al = 1 - d / 26;
      n.globalAlpha = 0.8 * al; n.fillStyle = '#ffd060';
      n.fillRect(Math.round(ax + L.l - 3 - d), y0 + 1 + (d > 13 ? 1 : 0), 3, 1);
      n.fillRect(Math.round(ax + L.r + 1 + d * 0.6), y0 + 1 + (d > 13 ? 1 : 0), 3, 1);
    }
    n.globalAlpha = 1;
    if (!this.lowPower && Math.random() < 0.05) this.particles.push({ x: ax + L.l + Math.random() * (L.r - L.l), y: y0, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 8, g: -2, life: 1.2, t: 0, c: '#5f4b4b', blob: 1, fade: true });   // a wisp of smoke off the hot rock
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
  hitShake(a, dmg = 5) { if (a && a.type === 'enemy') a.hshake = { t0: now(), amp: Math.min(this.inLava(a) ? 4 : 9, 4.5 + dmg / 4) }; }   // the dragon's rock only rocks a little in its pool
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
    let t = now();
    if (a.tstop && t >= a.tstop.t0 && t < a.tstop.until) t = a.tstop.t0;   // Time Stop: held on the frame it was frozen in
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
    const dk = this._darkNow(t); this._dk = dk;   // legendary skills: the background (not the fighters or the effects) dims
    if (dk) { ctx.fillStyle = `rgba(4,5,18,${dk})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    const chr = this._chronoNow(t);   // Time Stop: the room drains of colour and turns cold blue (the fighters keep theirs)
    if (chr) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${0.85 * chr})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.globalCompositeOperation = 'color'; ctx.fillStyle = `rgba(60,110,230,${0.45 * chr})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.restore();
    }

    // ---- native dynamic layer
    n.clearRect(0, 0, W, H);
    n.imageSmoothingEnabled = false;
    // Time Stop: the room's torches and props stop dead too
    const rt = this.chrono && t >= this.chrono.stopAt ? (this.chrono.stopAt - this.t0) / 1000 : time;
    // torches
    for (const tc of this.torches) {
      const f = Math.floor(rt * 10 + tc.x) % 4;
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
    for (const p of this.props) this.drawProp(n, p, rt);
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
    if (this.infernoOn) this.drawInfernoBack(n, t, time);
    this.drawCracks(n, t);
    for (let i = this.ghosts.length - 1; i >= 0; i--) {   // after-images (the Minotaur's charge)
      const g = this.ghosts[i]; const k = (t - g.t0) / g.life;
      if (k >= 1) { this.ghosts.splice(i, 1); continue; }
      n.globalAlpha = (g.a || 0.38) * (1 - k); if (g.add) n.globalCompositeOperation = 'lighter';
      if (g.rot) { n.save(); n.translate(g.px, g.py); n.rotate(g.rot); n.translate(-g.px, -g.py); n.drawImage(g.img, g.x, g.y); n.restore(); }
      else n.drawImage(g.img, g.x, g.y);
      n.globalAlpha = 1; n.globalCompositeOperation = 'source-over';
    }
    if (this.pixelFx) this.drawBehindFx(n, t);   // Dragon's Wrath: the eyes and the dragon while it is still behind the mage
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
      const lift = this._liftOf(a, t);   // in the air (the ranger's Phantom Volley leap): the sprite rises, its shadow stays on the floor
      let x = Math.round(a.x + a.ox + kx - info.ax), y = Math.round(a.y + a.oy - lift - info.ay);
      if (a.kind === 'shard') y += Math.round(Math.sin(time * 2 + a.phase) * 2);
      // shadow (not for the raid dragon's rock: it stands in lava)
      const inLava = this.infernoOn && a.kind === 'voidmaw';
      n.globalAlpha = inLava ? 0 : 0.45 * (a.alpha == null ? 1 : a.alpha);
      n.fillStyle = '#05030a';
      let shw = a.type === 'hero' ? 9 : a.size === 'xl' ? 50 : a.size === 'l' ? 18 : 12;
      if (lift) { const q = 1 / (1 + lift / 40); n.globalAlpha *= q; shw = Math.max(4, shw * q); }
      n.beginPath(); n.ellipse(Math.round(a.x + a.ox + kx), Math.round(a.y + a.oy) - 1, shw, Math.max(2, shw * 0.28), 0, 0, Math.PI * 2); n.fill();
      let alpha = a.alpha == null ? 1 : a.alpha;
      if (a.spawnAt) { alpha = clamp((t - a.spawnAt) / 500, 0, 1); a.alpha = alpha; if (alpha >= 1) a.spawnAt = 0; }
      if (a.dying) alpha = Math.max(0, 1 - (t - a.dying) / 300);
      if (a.ghost && t < a.ghost.until) alpha *= lerp(1, a.ghost.a, Math.min(1, (t - a.ghost.t0) / 300));   // Resurrection: the fallen body turns translucent
      if (a.type === 'hero' && !a.connected && !this.victory) alpha *= 0.55;   // everyone celebrates at full colour
      n.globalAlpha = alpha;
      const spun = a.spin && t < a.spin.t0 + a.spin.dur;
      const tilt = !spun ? this._tiltOf(a, t) : 0;
      if (tilt) { const px = Math.round(a.x + a.ox + kx), py = Math.round(a.y + a.oy - lift - 30); n.save(); n.translate(px, py); n.rotate(tilt); n.translate(-px, -py); }
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
      if (a.holy && t < a.holy.until) { const k = (t - a.holy.t0) / (a.holy.until - a.holy.t0); n.globalAlpha = alpha * (0.18 + 0.14 * Math.sin(t / 90)) * Math.min(1, k * 4, (1 - k) * 4); n.drawImage(this.tinted(this.frameFor(a, true), '#ffe9a0'), x, y); n.globalAlpha = alpha; }   // Wrath of Heaven: the robes glow
      if (a.radiant && t < a.radiant.until) {   // Resurrection: a golden glow over the body, brighter with every pulse
        const r = a.radiant, env = Math.min(1, (t - r.t0) / 300, (r.until - t) / 400);
        let g = 0.12; for (const p of r.pulses) if (t > p) g += 0.35 * Math.exp(-(t - p) / 180);
        n.save(); n.globalCompositeOperation = 'lighter'; n.globalAlpha = env * Math.min(0.9, g);   // full strength even while the body is see-through
        n.drawImage(this.tinted(this.frameFor(a, true), '#ffd86a'), x, y); n.restore(); n.globalAlpha = alpha;
      }
      if (a.fiery && t < a.fiery.until) {   // Dragon's Wrath: the mage's silhouette burns with red-orange light
        const k = (t - a.fiery.t0) / (a.fiery.until - a.fiery.t0), env = Math.min(1, k * 5, (1 - k) * 6), wf = this.frameFor(a, true);
        n.globalAlpha = alpha * env * (0.75 + 0.25 * Math.sin(t / 60)); const rim = this.tinted(wf, '#ff4a1a');
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) n.drawImage(rim, x + ox, y + oy);
        n.globalAlpha = alpha; n.drawImage(fr, x, y);   // the sprite back on top: only a burning outline shows
        n.globalAlpha = alpha * env * (0.1 + 0.06 * Math.sin(t / 45)); n.drawImage(this.tinted(wf, '#ff9a4a'), x, y); n.globalAlpha = alpha;
      }
      if (a.chronoRim && t < a.chronoRim.until) {   // Time Stop: the mage's outline glows blue while she channels
        const k = (t - a.chronoRim.t0) / (a.chronoRim.until - a.chronoRim.t0), env = Math.min(1, k * 6, (1 - k) * 6), wf = this.frameFor(a, true);
        n.globalAlpha = alpha * env * (0.7 + 0.3 * Math.sin(t / 70)); const rim = this.tinted(wf, a.chronoRim.color || '#4aa8ff');   // Deadeye uses it in emerald
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) n.drawImage(rim, x + ox, y + oy);
        n.globalAlpha = alpha; n.drawImage(fr, x, y);
        n.globalAlpha = alpha * env * 0.12; n.drawImage(this.tinted(wf, a.chronoRim.color ? '#c8fff0' : '#bfe6ff'), x, y); n.globalAlpha = alpha;
      }
      if (a.tstop && t >= a.tstop.t0 && t < a.tstop.until) {   // Time Stop: frozen mid-move and turned to blue crystal
        const wf = this.frameFor(a, true), el = t - a.tstop.t0, k = Math.min(1, el / 160);
        n.globalAlpha = alpha * k * 0.62; n.drawImage(this.tinted(wf, '#2f6fe0'), x, y);
        n.save(); n.globalCompositeOperation = 'lighter';
        n.globalAlpha = alpha * k * (0.2 + 0.06 * Math.sin(t / 200)); n.drawImage(this.tinted(wf, '#9fdcff'), x, y);
        const g = ((el + a.phase) % 1500) / 1500;   // a glint of light sliding down the crystal now and then
        if (g < 0.4) {
          const by = Math.round(y + (g / 0.4) * (wf.height + 8) - 8);
          n.save(); n.beginPath(); n.rect(x, by, wf.width, 2); n.clip();
          n.globalAlpha = alpha * 0.32 * Math.sin(g / 0.4 * Math.PI); n.drawImage(this.tinted(wf, '#ffffff'), x, y); n.restore();
        }
        n.restore();
        n.globalAlpha = alpha * k * 0.9; const rim = this.tinted(wf, '#dff4ff');
        n.save(); n.globalCompositeOperation = 'destination-over';   // a pale rim round the outside only
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) n.drawImage(rim, x + ox, y + oy);
        n.restore(); n.globalAlpha = alpha;
      }
      if (a.redUntil && t < a.redUntil) { n.globalAlpha = 0.8 * Math.min(1, (a.redUntil - t) / 120); n.drawImage(this.tinted(this.frameFor(a, true), '#ff3a20'), x, y); n.globalAlpha = alpha; }
      // frozen overlay
      if (a.st && a.st.freeze) { n.globalAlpha = 0.45; n.drawImage(this.tinted(this.frameFor(a, true), '#bff6ff'), x, y); }
      if (spun || tilt) n.restore();
      n.globalAlpha = 1;
      if (this.pixelFx && a.type === 'hero') this._drawDome(n, a, t, kx);
      if (inLava) this.drawLavaLip(n, t, time, a, x + info.ax);
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
  _chronoNow(t) {
    const c = this.chrono; if (!c) return 0;
    if (t > c.until) { this.chrono = null; return 0; }
    return Math.max(0, Math.min(1, (t - c.t0) / 300, (c.until - t) / 350));
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
    const ease = 1 - 0.8 * (this._dk || 0) / DARK_A;   // during a legendary move the background is already dark: lighten the grade so a hero leaping high isn't greyed out
    g.addColorStop(0, `rgba(6,4,16,${0.62 * ease})`); g.addColorStop(0.42, `rgba(10,8,24,${0.18 * ease})`); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(4,2,10,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd);
    // additive lights
    ctx.globalCompositeOperation = 'lighter';
    const lightK = 1 - 0.75 * (this._dk || 0) / DARK_A;   // the room's lights dim with a legendary darkening
    for (const L of this.lights) {
      let a = L.a * lightK;
      if (L.kind === 'torch') a *= 0.82 + 0.18 * Math.sin(time * 13 + L.phase) * Math.sin(time * 7.3 + L.phase * 2);
      if (L.kind === 'crystal') a *= 0.75 + 0.25 * Math.sin(time * 1.6 + L.phase);
      if (L.kind === 'lava') a *= 0.8 + 0.2 * Math.sin(time * 2.3 + L.phase) * Math.sin(time * 1.1 + L.phase * 3);
      const x = L.x * s + sx, y = L.y * s + sy, r = L.r * s;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(L.color, a * 0.55)); rg.addColorStop(0.35, hexA(L.color, a * 0.2)); rg.addColorStop(1, hexA(L.color, 0));
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // the lava cavern: heat glowing up from below instead of daylight from the ceiling
    if (this.infernoOn) {
      const hg = ctx.createLinearGradient(0, Hd, 0, Hd * 0.35);
      hg.addColorStop(0, `rgba(255,80,30,${0.1 * lightK})`); hg.addColorStop(1, 'rgba(255,80,30,0)');
      ctx.fillStyle = hg; ctx.fillRect(0, 0, Wd, Hd);
    }
    // light shafts from the ceiling
    if (!this.lowPower && !this.infernoOn) {
      for (let i = 0; i < 3; i++) {
        const x0 = (0.22 + i * 0.27) * Wd + Math.sin(time * 0.3 + i) * 10 * s;
        const w = (40 + i * 14) * s, slant = 70 * s;
        const a = (0.05 + 0.025 * Math.sin(time * 0.7 + i * 2)) * (1 - (this._dk || 0) / DARK_A * 0.85);   // the shafts dim with a legendary darkening
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
    if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashC || '255,250,235'},${this.flash})`; ctx.fillRect(0, 0, Wd, Hd); this.flash = Math.max(0, this.flash - 0.04); if (!this.flash) this.flashC = null; }
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

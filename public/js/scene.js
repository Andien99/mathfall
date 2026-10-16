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

const STATUS_COL = { burn: '#ff8a3c', poison: '#8fe05a', weak: '#c7a2ff', vuln: '#ff6b8a', chill: '#8fe3ff', freeze: '#dff8ff', str: '#ff9a7a', taunt: '#ffd36b' };
const STATUS_ABBR = { burn: 'Burn', poison: 'Poison', weak: 'Weak', vuln: 'Vulnerable', chill: 'Chilled', freeze: 'Frozen', str: 'Strength', taunt: 'Taunt' };

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
    this.trails = []; this.cam = null;
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
    const HS = FORM[Math.min(5, Math.max(1, heroes.length))];
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
      if (boss && e.kind === 'shard') { // crystals float above the wyrm's back
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
    const speed = this.queue.length > 4 ? 2.4 : this.queue.length > 1 ? 1.6 : 1;
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
  pose(a, p, ms) { a.pose = p; a.poseUntil = now() + ms; }
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
    if (ev.kind === 'tick') {
      const tg = ev.targets[0]; const p = this.pos(tg.id); if (!p) return 0;
      const colr = ev.fx === 'burn' ? '#ff8a3c' : '#8fe05a';
      this.burst(p.x, p.y - 14, colr, 18, 16, ev.fx === 'burn' ? -30 : -12);
      this.glows.push({ x: p.x, y: p.y - 14, r: 34, color: colr, t: 0, life: 0.4, a: 0.5 });
      setTimeout(() => { this.number(p.x, p.y - 34, tg.dmg, colr, 1); this.flashActor(p.a); this._applyAfter(ev); }, T(220));
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
      }
      return 0;
    }
    if (ev.kind === 'hero' && ev.whiff) return this._whiffAnim(ev, T);
    if (ev.kind === 'hero') return this._heroAnim(ev, T);
    if (ev.kind === 'enemy') return this._enemyAnim(ev, T);
    this._applyAfter(ev);
    return 0;
  }

  _heroAnim(ev, T) {
    const A = this.actors.get(ev.actor); if (!A) { this._applyAfter(ev); return 0; }
    const fx = ev.fx || 'slash';
    const tgt = ev.targets.filter(t => t.dmg != null && !t.shatter);
    const enemyIds = tgt.map(t => t.id);
    const first = tgt[0] && this.actors.get(tgt[0].id);
    const melee = ['slash', 'smite', 'slash_heavy', 'shadow', 'dragon', 'whirl'].includes(fx);
    const support = ['defend', 'shield_party', 'taunt', 'aegis', 'heal', 'heal_party', 'bless_party', 'revive', 'buff_party'].includes(fx);
    if (ev.name && ev.act !== 'attack' && ev.act !== 'defend') this.onBanner(ev.name, 'skill', ev.rarity);
    if (ev.focus) this.number(A.x, A.y - 48, 'Focused ×' + (1 + 0.3 * ev.focus).toFixed(1), '#b8c8ff', 0.8);
    if (ev.energy > 0) setTimeout(() => this.number(A.x + 6, A.y - 62, '+' + ev.energy + ' energy', '#ffd84a', 0.75), T(450));
    const rc = (ev.rarity && C.RARITY[ev.rarity]) ? C.RARITY[ev.rarity].color : '#ffffff';

    if (support) {
      this.pose(A, fx === 'defend' || fx === 'taunt' ? 'defend' : 'cast0', T(650));
      sfx(fx.includes('heal') || fx === 'bless_party' || fx === 'revive' ? 'heal' : 'shield');
      const colr = fx.includes('heal') || fx === 'revive' ? '#9dffb0' : fx === 'bless_party' || fx === 'aegis' ? '#ffe9a0' : fx === 'buff_party' ? '#ff9a7a' : fx === 'taunt' ? '#ffd36b' : '#7fc8ff';
      this.glows.push({ x: A.x, y: A.y - 20, r: 40, color: colr, t: 0, life: 0.6, a: 0.6 });
      setTimeout(() => {
        for (const t of ev.targets) {
          const p = this.pos(t.id); if (!p) continue;
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
    const bigMove = melee && first && fx !== 'whirl' && SP.heroAnim(A.skin || A.cls, 'slash');
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
    const castPose = A.cls === 'ranger' && (fx === 'proj_arrow' || fx === 'proj_poison' || fx === 'volley') ? 'windup' : (ev.act === 'attack' ? 'swing1' : 'cast0');
    this.pose(A, castPose, T(420));
    const hand = { x: A.x - 14, y: A.y - 26 };
    const projColor = { proj_arcane: '#b8a6ff', proj_fire: '#ff8a3c', proj_ice: '#9fe8ff', proj_poison: '#9cff6b', proj_arrow: '#efe6d0', lightning: '#fff27a' }[fx] || rc;
    this.glows.push({ x: hand.x, y: hand.y, r: 26, color: projColor, t: 0, life: 0.5, a: 0.7 });
    this.rune(A.x, A.y, projColor);
    sfx(fx === 'proj_arrow' || fx === 'proj_poison' || fx === 'volley' ? 'bow' : fx === 'lightning' ? 'zap' : 'cast');
    if (fx.startsWith('proj_') && first) {
      setTimeout(() => { if (A.cls === 'ranger') this.pose(A, 'swing2', T(300)); else this.pose(A, 'cast1', T(300)); this.projectile(hand, { x: first.x, y: first.y - 16 }, fx, T(240)); }, T(200));
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
    if (fx === 'volley' || fx === 'starfall' || fx === 'meteor' || fx === 'nova_ice' || fx === 'venom') {
      const ens = enemyIds.map(id => this.actors.get(id)).filter(Boolean);
      setTimeout(() => {
        this.pose(A, A.cls === 'ranger' ? 'swing2' : 'cast1', T(400));
        for (const e of ens) {
          if (fx === 'volley') for (let k = 0; k < 3; k++) this.projectile({ x: hand.x - 10 - k * 4, y: -10 }, { x: e.x + (k - 1) * 5, y: e.y - 10 }, 'proj_arrow', T(220 + k * 40));
          if (fx === 'meteor') this.projectile({ x: e.x + 60, y: -20 }, { x: e.x, y: e.y - 10 }, 'meteor', T(300));
          if (fx === 'starfall') for (let k = 0; k < 3; k++) this.projectile({ x: e.x + 30 - k * 10, y: -10 - k * 20 }, { x: e.x, y: e.y - 14 }, 'star', T(220 + k * 110));
          if (fx === 'nova_ice') this.ring(e.x, e.y - 12, '#bff6ff');
          if (fx === 'venom') this.cloud(e.x, e.y - 12, '#9cff6b');
        }
      }, T(220));
      setTimeout(() => this.impact(ev, tgt, fx, rc), T(fx === 'starfall' ? 560 : 520));
      return T(fx === 'starfall' ? 1200 : 1000);
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
    const dest = { x: first.x + (first.size === 'xl' ? 46 : first.size === 'l' ? 26 : 20) + (anim.dash || 0), y: first.y + 2 };
    A.anim = { d: anim, t0: now(), speed, at, total };
    const dashMs = at[Math.min(tl.length - 1, anim.dashFrames || 4)];
    this.move(A, dest.x - home.x, dest.y - home.y, T(Math.max(120, dashMs)), true);
    sfx('whirl');
    this.cam = { x: (dest.x + first.x) / 2 - 6, y: dest.y - 30, t0: now(), dur: T(total + 260), z: 1.14 };
    const hitAt = at[anim.hit] != null ? at[anim.hit] : total * 0.75;
    if (anim.trail != null) setTimeout(() => {
      this.trails.push({ x: A.x + A.ox - 4, y: A.y + A.oy - 32, r: 38, t0: now(), life: T(460) });
      sfx(fx === 'slash_heavy' || fx === 'dragon' ? 'heavy' : 'slash');
    }, T(at[anim.trail]));
    setTimeout(() => { this.impact(ev, tgt, fx, rc); this.shake = Math.max(this.shake, 4); this.shakeT = now(); }, T(hitAt));
    setTimeout(() => { A.anim = null; this.move(A, 0, 0, T(240), true); }, T(total + 60));
    return T(Math.max(ev.dur || 1000, total + 320));
  }
  _animAt(a, t) {
    const m = a.anim; if (!m) return null;
    const el = (t - m.t0) / m.speed;
    if (el >= m.total + 60) return null;
    let i = 0; while (i + 1 < m.at.length && el >= m.at[i + 1]) i++;
    const f = m.d.timeline[i][0], v = (a.variant || 0) % m.d.frames.length;
    return { fr: m.d.frames[v][f], wh: m.d.whites[v][f], ax: m.d.ax, ay: m.d.ay };
  }
  impact(ev, tgt, fx, rc) {
    let big = false;
    const ids = Object.keys(ev.after || {});
    for (const t of ev.targets) {
      const p = this.pos(t.id); if (!p) continue;
      if (t.dmg != null && !t.shatter) {
        const colr = { proj_fire: '#ff8a3c', meteor: '#ff6a3d', proj_ice: '#bff6ff', nova_ice: '#bff6ff', proj_poison: '#9cff6b', venom: '#9cff6b', lightning: '#fff27a', shadow: '#c6a0ff', dragon: '#ff5030', starfall: '#fff0a8' }[fx] || '#ffffff';
        this.burst(p.x, p.y - 16, colr, 14 + Math.min(30, t.dmg), 34);
        this.glows.push({ x: p.x, y: p.y - 16, r: 34 + Math.min(40, t.dmg * 1.5), color: colr, t: 0, life: 0.35, a: 0.8 });
        if (['slash', 'slash_heavy', 'smite', 'shadow', 'dragon'].includes(fx)) this.arc(p.x, p.y - 18, fx === 'slash_heavy' || fx === 'dragon' ? 20 : 15, colr === '#ffffff' ? '#e8f4ff' : colr);
        if (t.dmg > 0) { this.flashActor(p.a); this.pose(p.a, 'hurt', 260); this.knock(p.a, -4); }
        if (t.blocked) this.number(p.x + 12, p.y - 28, 'Blocked ' + t.blocked, '#9fb6d8', 0.75);
        this.number(p.x, p.y - 38, t.dmg, t.crit ? '#ffb347' : '#ffffff', t.dmg >= 15 ? 1.45 : 1.15, true);
        if (t.status) for (const s of t.status) this.number(p.x - 4, p.y - 52, STATUS_ABBR[s] || s, STATUS_COL[s] || '#fff', 0.78);
        if (t.dmg >= 14 || t.killed) big = true;
      }
      if (t.heal) { this.number(p.x, p.y - 44, '+' + t.heal, '#8dff9e', 1); this.column(p.x, p.y, '#9dffb0'); }
    }
    if (ev.targets.some(t => t.shatter)) for (const t of ev.targets.filter(t => t.shatter)) { const p = this.pos(t.id); if (p) this.burst(p.x, p.y - 10, '#ffc24a', 30, 40); }
    this.freezeUntil = now() + (big ? 90 : 55);
    if (big) { this.shake = Math.max(this.shake, 3); this.shakeT = now(); }
    sfx(big ? 'hitBig' : 'hit');
    this._applyAfter(ev);
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
      this.burst(E.x, E.y - 16, '#dff8ff', 24, 30); this.number(E.x, E.y - 40, 'Frozen', '#dff8ff', 1); sfx('ice');
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
    if (type === 'attackAll') {
      const big = E.kind === 'wyrm' || E.kind === 'voidmaw';
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
  move(a, dx, dy, ms, absolute) {
    const from = { x: a.ox, y: a.oy };
    a.tween = { from, to: { x: dx, y: dy }, t0: now(), ms: Math.max(1, ms) };
  }
  knock(a, dx) { a.knock = { dx, t0: now() }; }
  flashActor(a) { if (a) a.flashUntil = now() + 110; }
  burst(x, y, color, n = 16, speed = 30, gy = 30) {
    if (this.lowPower) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - speed * 0.3, g: gy, life: 0.35 + Math.random() * 0.45, t: 0, c: color, spark: Math.random() < 0.5 });
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
      if (!p) p = a.downed ? 'down' : (this.victory ? 'victory' : 'idle' + Math.floor(((t + a.phase) / 260) % 4));
      if (a.downed && p !== 'hurt') p = 'down';
      return white ? SP.heroWhite(a.skin || a.cls, a.variant, p) : SP.heroFrame(a.skin || a.cls, a.variant, p);
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
    const sdt = frozen ? 0 : dt;
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
    // actors sorted by depth
    const list = [...this.actors.values()].filter(a => !a.gone).sort((a, b) => (a.y + (a.type === 'enemy' ? -0.5 : 0)) - (b.y));
    for (const a of list) {
      if (a.tween) {
        const k = clamp((t - a.tween.t0) / a.tween.ms, 0, 1); const e = ease(k);
        a.ox = lerp(a.tween.from.x, a.tween.to.x, e); a.oy = lerp(a.tween.from.y, a.tween.to.y, e);
        if (k >= 1) a.tween = null;
      }
      let kx = 0;
      if (a.knock) { const k = (t - a.knock.t0) / 220; if (k > 1) a.knock = null; else kx = a.knock.dx * Math.sin(k * Math.PI); }
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
      if (a.type === 'hero' && !a.connected) alpha *= 0.55;
      n.globalAlpha = alpha;
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
      n.globalAlpha = 1;
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += dt; if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      n.globalAlpha = p.fade ? k : Math.min(1, k * 1.6);
      n.fillStyle = p.c;
      if (p.plus) { n.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1); n.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3); }
      else if (p.blob) { const r = Math.round(p.blob + (1 - k) * 2); n.fillRect(Math.round(p.x) - r, Math.round(p.y) - r, r * 2, r * 2); }
      else n.fillRect(Math.round(p.x), Math.round(p.y), p.spark && k > 0.5 ? 2 : 1, 1);
    }
    n.globalAlpha = 1;
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
        for (let j = 0; j < a.bolt.length - 1; j++) this.pxLine(n, a.bolt[j], a.bolt[j + 1], j % 2 ? '#ffffff' : a.color);
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
      const a0 = -1.45, a1 = a0 - 2.15 * grow;               // from just behind the head, round the front, down low
      for (const [w, col, al] of [[0.34, '150,200,255', 0.22], [0.2, '200,232,255', 0.45], [0.08, '255,255,255', 0.9]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1, true);
        ctx.arc(cx - R * w * 0.5, cy, R * (1 - w), a1, a0, false);
        ctx.closePath();
        ctx.fillStyle = `rgba(${col},${al * fade})`; ctx.fill();
      }
    }
    ctx.restore();
  }
  // camera punch-in on the hero doing a big move, with the screen edges darkened
  applyCam(ctx, t) {
    const c = this.cam; if (!c) return;
    const el = t - c.t0;
    if (el >= c.dur) { this.cam = null; return; }
    const ease = x => x * x * (3 - 2 * x);
    const k = el < 200 ? ease(el / 200) : el > c.dur - 260 ? ease(Math.max(0, (c.dur - el) / 260)) : 1;
    const Wd = this.cv.width, Hd = this.cv.height, s = this.s;
    const z = 1 + (c.z - 1) * k;
    const fx = Math.max(Wd * 0.2, Math.min(Wd * 0.8, c.x * s)), fy = Math.max(Hd * 0.25, Math.min(Hd * 0.75, c.y * s));
    if (!this._zc || this._zc.width !== Wd || this._zc.height !== Hd) { this._zc = document.createElement('canvas'); this._zc.width = Wd; this._zc.height = Hd; }
    const zx = this._zc.getContext('2d'); zx.clearRect(0, 0, Wd, Hd); zx.drawImage(this.cv, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._zc, fx - fx * z, fy - fy * z, Wd * z, Hd * z);
    const vg = ctx.createRadialGradient(fx, fy, Math.min(Wd, Hd) * 0.22, fx, fy, Math.max(Wd, Hd) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(2,0,6,${0.62 * k})`);
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
        const r = pr.kind === 'meteor' ? 5 : 3;
        n.fillStyle = '#ff6a2a'; n.fillRect(rx - r, ry - r + 1, r * 2, r * 2 - 2); n.fillRect(rx - r + 1, ry - r, r * 2 - 2, r * 2);
        n.fillStyle = '#ffc24a'; n.fillRect(rx - r + 1, ry - r + 1, r * 2 - 2, r * 2 - 2);
        n.fillStyle = '#fff6c8'; n.fillRect(rx - 1, ry - 1, 2, 2);
        if (Math.random() < 0.9) this.particles.push({ x, y, vx: -Math.cos(ang) * 20 + (Math.random() - 0.5) * 10, vy: -Math.sin(ang) * 20 - 10, g: -10, life: 0.35, t: 0, c: Math.random() < 0.5 ? '#ff8a3c' : '#ffc24a' });
        break;
      }
      case 'proj_ice': tail(6, '#5ac8f0'); n.fillStyle = '#e8ffff'; n.fillRect(rx - 2, ry, 4, 1); n.fillRect(rx, ry - 1, 2, 3); break;
      case 'proj_poison': tail(8, '#c9a46a'); n.fillStyle = '#9cff6b'; n.fillRect(rx, ry - 1, 2, 3); if (Math.random() < 0.5) this.particles.push({ x, y, vx: 0, vy: 6, g: 20, life: 0.4, t: 0, c: '#9cff6b' }); break;
      case 'proj_arcane': n.fillStyle = '#7a6aff'; n.fillRect(rx - 2, ry - 2, 4, 4); n.fillStyle = '#e0d8ff'; n.fillRect(rx - 1, ry - 1, 2, 2); this.particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, g: 0, life: 0.3, t: 0, c: '#b8a6ff' }); break;
      case 'star': n.fillStyle = '#fff0a8'; n.fillRect(rx - 2, ry, 5, 1); n.fillRect(rx, ry - 2, 1, 5); n.fillStyle = '#ffffff'; n.fillRect(rx, ry, 1, 1); tail(6, '#ffe27a'); break;
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
    const dt = 1 / 60;
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
      const label = k === 'poison' || k === 'burn' || k === 'str' ? (STATUS_ABBR[k][0] + v.v) : (STATUS_ABBR[k].slice(0, 2) + (v.t > 1 ? v.t : ''));
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
    else if (it.type === 'charge') { icon = 'battle_cry'; label = a.kind === 'wyrm' ? 'Storm next!' : 'Big hit next!'; colr = '#ff8a6a'; }
    else if (it.type === 'summon') { icon = 'starfall'; label = 'Summon'; colr = '#ffd27a'; }
    if (a.st && a.st.freeze) { icon = 'frost_nova'; label = 'Frozen'; colr = '#dff8ff'; }
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

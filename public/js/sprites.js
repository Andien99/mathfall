// Mathfall sprite set, built procedurally from a pixel rig.
// Heroes face left, enemies are drawn facing left and mirrored so they face right.
import { Sprite, Mask, ramp, shift, limb, col, rng } from './pixel.js';

// ------------------------------------------------------------------ palettes
const P = {
  skin: ['#ffe2c6', '#f2bf98', '#d48f72', '#a3605a'],
  skin2: ['#f1c8a0', '#d39a70', '#a86b52', '#774544'],
  skin3: ['#c99872', '#9c6a4c', '#714736', '#4a2c2c'],
  steel: ['#e9f0f6', '#a9b8c8', '#6f7f99', '#434a69'],
  steelDark: ['#9aa8ba', '#66728a', '#434b65', '#2a2c45'],
  gold: ['#fff2a8', '#f2c14e', '#c4822f', '#86502a'],
  leather: ['#c98d5a', '#8f5a3a', '#643a2c', '#41232a'],
  wood: ['#c99a62', '#93643f', '#68412f', '#432636'],
  boot: ['#8c6a5a', '#5a3d3a', '#3e2732', '#26172a'],
  white: ['#ffffff', '#e4e2f0', '#b3b0cc', '#7d789e'],
  bone: ['#fffbe8', '#e3d9b9', '#b3a383', '#7a6a5e'],
  iron: ['#8d8fa6', '#5d5f78', '#3e3e57', '#26253a']
};
const R = (h, o) => ramp(h, o);

const HERO_LOOKS = {
  knight: [
    { cape: R('#c8323f'), trim: P.gold, armor: P.steel, under: R('#3d4f86'), shield: R('#2f5fb8'), plume: R('#e0414f'), hair: R('#7a4a2e'), skin: P.skin, eye: '#3c6fd1' },
    { cape: R('#2f6fd6'), trim: P.gold, armor: P.steel, under: R('#7a2f3f'), shield: R('#b8322f'), plume: R('#f2f0ff'), hair: R('#2d2430'), skin: P.skin2, eye: '#4a3020' },
    { cape: R('#2f9d6a'), trim: R('#e3e8ee'), armor: R('#b8a991'), under: R('#3a3150'), shield: R('#3f7a4e'), plume: R('#f2c14e'), hair: R('#e3c27a'), skin: P.skin3, eye: '#2c6b3f' }
  ],
  mage: [
    { robe: R('#3b3fb0'), robe2: R('#6a3fb8'), trim: P.gold, hat: R('#4a2f9e'), hair: R('#e7e9f6', { k: 0.7 }), orb: '#7ff3ff', skin: P.skin, eye: '#7a3fd1' },
    { robe: R('#a8283a'), robe2: R('#d5582c'), trim: P.gold, hat: R('#7a1f30'), hair: R('#ffb36b', { k: 0.8 }), orb: '#ffcf5a', skin: P.skin2, eye: '#b8301f' },
    { robe: R('#1f6f7a'), robe2: R('#2f9d8a'), trim: R('#e3e8ee'), hat: R('#1d4d5a'), hair: R('#3a2a4a'), orb: '#b6ff7a', skin: P.skin3, eye: '#2a8a6a' }
  ],
  ranger: [
    { cloak: R('#3f8a4a'), tunic: R('#9a6a3a'), pants: R('#5a4a3f'), hair: R('#c0582f'), skin: P.skin, eye: '#3a8a3a', fletch: '#f2f0ff' },
    { cloak: R('#2f7f8a'), tunic: R('#6a5a8a'), pants: R('#3f3a50'), hair: R('#f2d27a'), skin: P.skin2, eye: '#2f6fa0', fletch: '#ff6b6b' },
    { cloak: R('#8a5a2f'), tunic: R('#3f6a3f'), pants: R('#4a3a30'), hair: R('#2a2028'), skin: P.skin3, eye: '#5a3a20', fletch: '#7ff3ff' }
  ],
  cleric: [
    { robe: P.white, sash: R('#3f7ad8'), trim: P.gold, hair: R('#f6d27a'), skin: P.skin, eye: '#3f7ad8', staff: P.gold, gem: '#5ad8ff' },
    { robe: R('#efe4ff', { k: 0.8 }), sash: R('#c8406a'), trim: P.gold, hair: R('#8a4a2f'), skin: P.skin2, eye: '#6a3f2f', staff: P.gold, gem: '#ff6b8a' },
    { robe: R('#fff3d6', { k: 0.8 }), sash: R('#2f9d6a'), trim: R('#e3e8ee'), hair: R('#2a2430'), skin: P.skin3, eye: '#2f6a4a', staff: R('#e3e8ee'), gem: '#7affb0' }
  ]
};

export const SPRITE_W = 84, SPRITE_H = 76, ANCHOR_X = 46, ANCHOR_Y = 72;

// ------------------------------------------------------------------ poses
// angles: 0 = down, + = forward (left). arm: [upper, elbowBend]; leg: [thigh, knee]
const BASE = { dx: 0, dy: 0, lean: 4, head: [0, 0], n: [14, 38], f: [-6, 24], nl: [12, 6], fl: [-10, 8], w: 150, sway: 0, eyes: 'open', shield: 'side', squash: 0 };
function pose(o) { return { ...BASE, ...o }; }

const POSES = {
  common: {
    idle0: pose({}),
    idle1: pose({ dy: 0, sway: 1, n: [14, 40], w: 152 }),
    idle2: pose({ dy: 1, sway: 2, n: [13, 42], f: [-5, 26], w: 154 }),
    idle3: pose({ dy: 1, sway: 1, n: [13, 40], w: 152 }),
    hurt: pose({ dx: 2, lean: -14, head: [1, -1], n: [-20, 40], f: [-30, 30], nl: [20, 10], fl: [-18, 14], w: 200, eyes: 'hurt', sway: 3 }),
    down: pose({ dy: 7, lean: 32, head: [-1, 2], n: [40, 10], f: [10, 10], nl: [85, 105], fl: [-25, 120], w: 60, eyes: 'closed', sway: -1 }),
    victory: pose({ dy: -1, lean: -4, n: [168, -8], f: [-24, 40], w: 180, eyes: 'happy', sway: 2 }),
    defend: pose({ lean: 8, n: [-10, 70], f: [70, 30], w: 210, shield: 'front', eyes: 'determined', nl: [18, 14], fl: [-16, 18], dy: 1 }),
    windup: pose({ dx: 2, lean: -10, n: [165, 30], f: [-20, 30], w: 200, eyes: 'determined', nl: [6, 10], fl: [-18, 16] }),
    swing1: pose({ dx: -2, lean: 16, n: [108, 6], f: [-30, 40], w: 100, eyes: 'determined', nl: [32, 12], fl: [-24, 16], sway: 3 }),
    swing2: pose({ dx: -3, lean: 22, n: [48, 10], f: [-36, 46], w: 40, eyes: 'determined', nl: [36, 16], fl: [-26, 18], sway: 4 }),
    cast0: pose({ lean: -4, n: [150, 10], f: [40, 70], w: 180, eyes: 'determined' }),
    cast1: pose({ dx: -1, lean: 10, n: [100, 4], f: [-10, 60], w: 112, eyes: 'determined', nl: [24, 10] })
  },
  ranger: {
    idle0: pose({ n: [30, 30], w: 180 }), idle1: pose({ n: [30, 32], w: 180, sway: 1 }), idle2: pose({ dy: 1, n: [28, 34], w: 180, sway: 2 }), idle3: pose({ dy: 1, n: [29, 32], w: 180, sway: 1 }),
    windup: pose({ lean: 2, n: [92, 0], f: [86, 120], w: 180, eyes: 'determined', draw: 1, nl: [20, 8], fl: [-16, 12] }),
    swing1: pose({ lean: 4, n: [92, 0], f: [70, 150], w: 180, eyes: 'determined', draw: 2, nl: [20, 8], fl: [-16, 12] }),
    swing2: pose({ lean: 0, n: [92, 0], f: [-40, 30], w: 180, eyes: 'determined', draw: 0, nl: [20, 8], fl: [-16, 12] }),
    cast0: pose({ lean: -2, n: [130, 10], f: [80, 120], w: 200, eyes: 'determined', draw: 1 }),
    cast1: pose({ lean: 4, n: [95, 0], f: [-30, 30], w: 180, eyes: 'determined', draw: 0 }),
    victory: pose({ dy: -1, lean: -4, n: [165, 0], f: [-24, 40], w: 180, eyes: 'happy', sway: 2 }),
    defend: pose({ lean: 10, n: [60, 70], f: [50, 80], w: 200, eyes: 'determined', nl: [18, 14], fl: [-16, 18], dy: 1 }),
    down: pose({ dy: 7, lean: 32, head: [-1, 2], n: [40, 10], f: [10, 10], nl: [85, 105], fl: [-25, 120], w: 100, eyes: 'closed', sway: -1 })
  },
  mage: {
    idle0: pose({ n: [18, 40], w: 178 }), idle1: pose({ n: [18, 42], w: 178, sway: 1 }), idle2: pose({ dy: 1, n: [17, 44], w: 178, sway: 2 }), idle3: pose({ dy: 1, n: [17, 42], w: 178, sway: 1 }),
    windup: pose({ lean: -8, n: [150, 10], f: [60, 70], w: 175, eyes: 'determined' }),
    swing1: pose({ dx: -1, lean: 12, n: [100, 4], f: [-10, 60], w: 112, eyes: 'determined', nl: [24, 10] }),
    swing2: pose({ dx: -1, lean: 14, n: [92, 0], f: [-20, 50], w: 100, eyes: 'determined', nl: [24, 10] }),
    defend: pose({ lean: 6, n: [70, 60], f: [60, 70], w: 120, eyes: 'determined', dy: 1 })
  },
  cleric: {
    idle0: pose({ n: [16, 40], w: 176 }), idle1: pose({ n: [16, 42], w: 176, sway: 1 }), idle2: pose({ dy: 1, n: [15, 44], w: 176, sway: 2 }), idle3: pose({ dy: 1, n: [15, 42], w: 176, sway: 1 }),
    windup: pose({ dx: 1, lean: -8, n: [160, 20], f: [-10, 30], w: 190, eyes: 'determined' }),
    swing1: pose({ dx: -2, lean: 16, n: [100, 6], f: [-30, 40], w: 100, eyes: 'determined', nl: [30, 12] }),
    swing2: pose({ dx: -3, lean: 20, n: [52, 10], f: [-36, 46], w: 50, eyes: 'determined', nl: [34, 14] }),
    defend: pose({ lean: 4, n: [80, 60], f: [70, 60], w: 178, eyes: 'determined', dy: 1 })
  }
};
POSES.knight = {};
export const HERO_POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory'];
function getPose(cls, name) { return (POSES[cls] && POSES[cls][name]) || POSES.common[name] || POSES.common.idle0; }

// ------------------------------------------------------------------ hero drawing
function drawHero(cls, look, ps) {
  const S = new Sprite(SPRITE_W, SPRITE_H);
  const ax = ANCHOR_X + ps.dx, ay = ANCHOR_Y;
  const hip = [ax, ay - 17 + ps.dy];
  const lr = ps.lean * Math.PI / 180;
  const neck = [hip[0] - Math.sin(lr) * 13, hip[1] - Math.cos(lr) * 13];
  const head = [neck[0] - 1 + ps.head[0], neck[1] - 8 + ps.head[1]];
  const shN = [neck[0] - 1.5, neck[1] + 2.5], shF = [neck[0] + 4, neck[1] + 1.5];
  const hipN = [hip[0] - 2, hip[1]], hipF = [hip[0] + 3, hip[1] - 0.5];
  const robe = cls === 'mage' || cls === 'cleric';

  const armPts = (sh, a) => { const el = limb(sh[0], sh[1], a[0], 6.5); const ha = limb(el[0], el[1], a[0] + a[1], 6); return { el, ha, fa: a[0] + a[1] }; };
  const legPts = (hp, l) => { const kn = limb(hp[0], hp[1], l[0], 8); const an = limb(kn[0], kn[1], l[0] - l[1], 8); return { kn, an: [an[0], Math.min(an[1], ay - 2)] }; };
  const nA = armPts(shN, ps.n), fA = armPts(shF, ps.f);
  const nL = legPts(hipN, ps.nl), fL = legPts(hipF, ps.fl);

  const m = () => new Mask(SPRITE_W, SPRITE_H);
  const L = look;
  const sleeve = cls === 'knight' ? ['#c9d4e2', '#8e9cb4', '#5f6b88', '#3c4260'] : cls === 'mage' ? L.robe : cls === 'ranger' ? L.tunic : L.robe;
  const legCol = cls === 'knight' ? L.armor : cls === 'ranger' ? L.pants : (L.robe2 || L.robe);
  const glove = cls === 'knight' ? P.steelDark : cls === 'ranger' ? P.leather : L.skin;

  // weapon geometry
  const wA = ps.w;
  const weapon = () => {
    const [hx, hy] = nA.ha;
    if (cls === 'knight') { // sword
      const tip = limb(hx, hy, wA, 19), pom = limb(hx, hy, wA + 180, 4);
      const perp = (wA + 90) * Math.PI / 180;
      const px = -Math.sin(perp), py = Math.cos(perp);
      const blade = m().poly([[hx + px * 1.4, hy + py * 1.4], [tip[0] + px * 0.4, tip[1] + py * 0.4], [tip[0] - px * 0.4, tip[1] - py * 0.4], [hx - px * 1.4, hy - py * 1.4]]);
      const base = limb(hx, hy, wA, 1.5);
      S.stamp(blade, ['#ffffff', '#d7e3ef', '#8fa3bd', '#56607e'], { r: 1, light: [-0.3, -0.95] });
      // edge glint
      for (let t = 0.2; t < 0.9; t += 0.1) S.dot(hx + (tip[0] - hx) * t + px * 0.5, hy + (tip[1] - hy) * t + py * 0.5, '#ffffff');
      const guard = m().capsule(base[0] + px * 4, base[1] + py * 4, base[0] - px * 4, base[1] - py * 4, 1.1);
      S.stamp(guard, L.trim, { r: 1 });
      S.stamp(m().capsule(hx, hy, pom[0], pom[1], 1.1), P.leather, { r: 1 });
      S.stamp(m().circle(pom[0], pom[1], 1.5), L.trim, { r: 1 });
    } else if (cls === 'mage' || cls === 'cleric') { // staff
      const top = limb(hx, hy, wA, 20), bot = limb(hx, hy, wA + 180, 9);
      S.stamp(m().capsule(bot[0], bot[1], top[0], top[1], 1.1), cls === 'mage' ? P.wood : L.staff, { r: 1 });
      if (cls === 'mage') {
        const prong = m();
        const a1 = limb(top[0], top[1], wA - 40, 4), a2 = limb(top[0], top[1], wA + 40, 4);
        prong.capsule(top[0], top[1], a1[0], a1[1], 0.8).capsule(top[0], top[1], a2[0], a2[1], 0.8);
        S.stamp(prong, L.trim, { r: 1 });
        const orb = limb(top[0], top[1], wA, 2.5);
        S.stamp(m().circle(orb[0], orb[1], 2.6), ramp(L.orb, { k: 1.3 }), { r: 1 });
        S.dot(orb[0] - 1, orb[1] - 1, '#ffffff');
      } else {
        const c = limb(top[0], top[1], wA, 3);
        const ring = m().circle(c[0], c[1], 4).sub(m().circle(c[0], c[1], 2.2));
        S.stamp(ring, L.staff, { r: 1 });
        S.stamp(m().circle(c[0], c[1], 1.4), ramp(L.gem), { r: 1 });
        for (let k = 0; k < 4; k++) { const sp = limb(c[0], c[1], wA + k * 90 + 45, 5.2); S.dot(sp[0], sp[1], L.staff[0]); }
      }
    } else if (cls === 'ranger') { // bow
      const bowM = m();
      const bowA = wA; // bow facing direction
      const pts = [];
      for (let k = -60; k <= 60; k += 6) pts.push(limb(hx, hy, bowA + 90 + k * 1.0, 0)); // placeholder
      // arc: a semicircle bulging forward
      const ca = (bowA - 90) * Math.PI / 180;
      const cx = hx + Math.sin(ca) * 4, cy = hy - Math.cos(ca) * 4;
      let prev = null;
      const ends = [];
      for (let k = -62; k <= 62; k += 4) {
        const a = (bowA - 90 + k) * Math.PI / 180;
        const p = [cx - Math.sin(a) * 13, cy + Math.cos(a) * 13];
        if (prev) bowM.capsule(prev[0], prev[1], p[0], p[1], Math.abs(k) < 30 ? 1.2 : 0.8);
        prev = p;
        if (k === -62 || k === 62) ends.push(p);
      }
      S.stamp(bowM, P.wood, { r: 1 });
      // string, pulled when drawing
      const pull = ps.draw === 2 ? 9 : ps.draw === 1 ? 6 : 0;
      const sx = fA.ha[0], sy = fA.ha[1];
      if (pull && ends.length === 2) { S.line(ends[0][0], ends[0][1], sx, sy, '#efe6d0'); S.line(ends[1][0], ends[1][1], sx, sy, '#efe6d0'); }
      else if (ends.length === 2) S.line(ends[0][0], ends[0][1], ends[1][0], ends[1][1], '#d9cfb4');
      if (pull) { // arrow
        const tip = limb(sx, sy, bowA - 0, 0);
        const ah = [hx - 6, hy];
        S.line(sx, sy, ah[0], ah[1], '#c9a46a');
        S.dot(ah[0], ah[1], '#e9f0f6'); S.dot(ah[0] - 1, ah[1], '#a9b8c8');
        S.dot(sx + 1, sy - 1, L.fletch); S.dot(sx + 1, sy + 1, L.fletch);
      }
    }
  };
  const shield = () => {
    if (cls !== 'knight') return;
    const [hx, hy] = fA.ha;
    const front = ps.shield === 'front';
    const cx = front ? hx - 3 : hx + 1, cy = hy - 3;
    const sm = m().poly([[cx - 6, cy - 7], [cx + 6, cy - 7], [cx + 6, cy + 1], [cx, cy + 9], [cx - 6, cy + 1]]);
    S.stamp(sm, L.shield, { r: 2 });
    // gold rim
    const rim = sm.clone().sub(m().poly([[cx - 4.6, cy - 5.8], [cx + 4.6, cy - 5.8], [cx + 4.6, cy + 0.6], [cx, cy + 7], [cx - 4.6, cy + 0.6]]));
    S.stamp(rim, L.trim, { r: 1, sel: false });
    // emblem: a small star
    S.dots([[cx, cy - 4], [cx - 1, cy - 2], [cx, cy - 2], [cx + 1, cy - 2], [cx, cy - 1], [cx, cy]], L.trim[0]);
    S.dot(cx, cy + 1, L.trim[1]);
  };

  // ---- far side
  if (cls === 'knight' || cls === 'ranger') { // cape / cloak behind
    const c = cls === 'knight' ? L.cape : L.cloak;
    const sw = ps.sway;
    const capeM = m().poly([[shN[0] + 1, neck[1]], [shF[0] + 3, neck[1] + 1], [hip[0] + 11 + sw, ay - 6], [hip[0] + 6 + sw * 0.5, ay - 3], [hip[0] + 1, ay - 8]]);
    S.stamp(capeM, c, { r: 3, dither: true });
  }
  if (cls === 'mage' || cls === 'cleric') { // long hair falls behind
    const hm = m().poly([[head[0] + 1, head[1] - 4], [head[0] + 8, head[1] - 1], [neck[0] + 7 + ps.sway * 0.5, neck[1] + (cls === 'mage' ? 12 : 4)], [neck[0] + 2, neck[1] + (cls === 'mage' ? 10 : 3)]]);
    if (cls === 'mage') S.stamp(hm, L.hair, { r: 2 });
  }
  if (cls === 'ranger') { // quiver
    const q = m().poly([[shF[0] + 1, shF[1] - 3], [shF[0] + 5, shF[1] - 2], [hip[0] + 6, hip[1] - 2], [hip[0] + 3, hip[1] - 3]]);
    S.stamp(q, P.leather, { r: 1 });
    S.dots([[shF[0] + 1, shF[1] - 5], [shF[0] + 3, shF[1] - 5], [shF[0] + 2, shF[1] - 6]], L.fletch);
  }
  // far arm
  if (cls === 'knight' && ps.shield !== 'front') shield();
  S.stamp(m().capsule(shF[0], shF[1], fA.el[0], fA.el[1], 2.1, 1.9).capsule(fA.el[0], fA.el[1], fA.ha[0], fA.ha[1], 1.9, 1.6), sleeve.map(c => shift(c, -0.07)), { r: 1 });
  S.stamp(m().circle(fA.ha[0], fA.ha[1], 1.7), glove.map(c => shift(c, -0.06)), { r: 1 });
  // far leg
  const legM = (lp, hp, w0) => m().capsule(hp[0], hp[1], lp.kn[0], lp.kn[1], w0, w0 - 0.3).capsule(lp.kn[0], lp.kn[1], lp.an[0], lp.an[1], w0 - 0.3, w0 - 0.6);
  const bootM = lp => m().ellipse(lp.an[0] - 1.6, lp.an[1] + 0.2, 3.1, 1.9).capsule(lp.an[0], lp.an[1] - 2, lp.an[0], lp.an[1], 2);
  if (!robe) {
    S.stamp(legM(fL, hipF, 2.6), legCol.map(c => shift(c, -0.08)), { r: 1 });
    S.stamp(bootM(fL), cls === 'knight' ? P.steelDark : P.boot, { r: 1 });
  } else S.stamp(bootM(fL), P.boot, { r: 1 });

  // ---- near leg + torso
  if (!robe) {
    S.stamp(legM(nL, hipN, 2.7), legCol, { r: 1 });
    S.stamp(bootM(nL), cls === 'knight' ? P.steel : P.boot, { r: 1 });
    if (cls === 'knight') { S.stamp(m().circle(nL.kn[0], nL.kn[1], 1.8), P.steel, { r: 1 }); }
  } else {
    S.stamp(bootM(nL), P.boot, { r: 1 });
    const sw = ps.sway * 0.6;
    const skirt = m().poly([[hip[0] - 5.5, hip[1] - 3], [hip[0] + 5, hip[1] - 3], [hip[0] + 8 + sw, ay - 3], [hip[0] + 2, ay - 2], [hip[0] - 8 + sw * 0.4, ay - 3]]);
    S.stamp(skirt, L.robe2 || L.robe, { r: 3, dither: true });
    // hem trim
    for (let x = Math.round(hip[0] - 8 + sw * 0.4); x <= Math.round(hip[0] + 8 + sw); x++) { if (skirt.get(x, ay - 3)) S.dot(x, ay - 3, L.trim[1]); if (skirt.get(x, ay - 4)) S.dot(x, ay - 4, L.trim[2]); }
  }
  const torso = m().poly([[neck[0] - 5.5, neck[1] + 1], [neck[0] + 5.5, neck[1] + 0.5], [hip[0] + 5, hip[1] + 1], [hip[0] - 5, hip[1] + 1]]).ellipse((neck[0] + hip[0]) / 2 - 1, (neck[1] + hip[1]) / 2, 5.5, 6.5);
  const body = cls === 'knight' ? L.armor : cls === 'ranger' ? L.tunic : L.robe;
  S.stamp(torso, body, { r: 3 });
  // torso details
  const mid = [(neck[0] + hip[0]) / 2, (neck[1] + hip[1]) / 2];
  if (cls === 'knight') {
    S.stamp(m().ellipse(mid[0] - 1.5, mid[1] - 2, 3.4, 3.2), P.steel, { r: 2, sel: true, selK: 0.75 });
    S.hline(hip[0] - 5, hip[0] + 5, Math.round(hip[1] - 1), L.trim[2]);
    S.hline(hip[0] - 4, hip[0] + 4, Math.round(hip[1] - 2), P.leather[1]);
    S.dot(hip[0] - 1, Math.round(hip[1] - 2), L.trim[0]);
    // tabard strip
    const tab = m().poly([[mid[0] - 2.5, mid[1] + 2], [mid[0] + 1.5, mid[1] + 2], [hip[0] + 1.5, hip[1] + 4], [hip[0] - 3, hip[1] + 4]]);
    S.stamp(tab, L.cape, { r: 1 });
    // pauldron
    S.stamp(m().ellipse(shN[0] + 0.5, shN[1] - 0.5, 3.6, 2.6), P.steel, { r: 2 });
  } else if (cls === 'mage') {
    S.vline(Math.round(mid[0] - 1), Math.round(neck[1] + 2), Math.round(hip[1] + 1), L.trim[1]);
    S.hline(hip[0] - 5, hip[0] + 5, Math.round(hip[1] - 2), L.trim[2]);
    S.hline(hip[0] - 4, hip[0] + 4, Math.round(hip[1] - 3), L.trim[1]);
    S.stamp(m().ellipse(neck[0] + 0.5, neck[1] + 2.5, 5.5, 2.3), L.robe2, { r: 1 }); // collar
  } else if (cls === 'ranger') {
    S.hline(hip[0] - 5, hip[0] + 5, Math.round(hip[1] - 2), P.leather[2]);
    S.hline(hip[0] - 4, hip[0] + 4, Math.round(hip[1] - 3), P.leather[1]);
    S.dot(hip[0] - 1, Math.round(hip[1] - 3), P.gold[1]);
    // strap
    S.line(shF[0] + 1, shF[1], hip[0] - 3, hip[1] - 4, P.leather[2]);
    // hood mantle over shoulders
    S.stamp(m().ellipse(neck[0] + 1, neck[1] + 2.5, 6.5, 3.2), L.cloak, { r: 2 });
  } else if (cls === 'cleric') {
    const sash = m().poly([[mid[0] - 3, neck[1] + 3], [mid[0] + 0, neck[1] + 3], [hip[0] + 1, hip[1] + 6], [hip[0] - 2, hip[1] + 6]]);
    S.stamp(sash, L.sash, { r: 1 });
    S.hline(hip[0] - 5, hip[0] + 5, Math.round(hip[1] - 2), L.trim[1]);
    S.stamp(m().ellipse(neck[0] + 0.5, neck[1] + 2.5, 6, 2.6), L.trim, { r: 1 }); // gold mantle
    S.dot(mid[0] - 2, neck[1] + 5, L.gem);
  }

  // ---- head
  S.stamp(m().capsule(neck[0], neck[1] + 1, neck[0], neck[1] - 2, 2), L.skin, { r: 1 });
  const headM = m().ellipse(head[0], head[1], 7.4, 6.8).ellipse(head[0] - 1.8, head[1] + 3.2, 4.8, 3.6);
  S.stamp(headM, L.skin, { r: 3, bias: 0.05 });
  // ear
  S.stamp(m().ellipse(head[0] + 3.2, head[1] + 1.5, 1.3, 1.8), L.skin, { r: 1 });
  // face
  const ex = Math.round(head[0] - 4.2), ex2 = Math.round(head[0] + 0.6), ey = Math.round(head[1] + 1);
  const eyeDark = '#26183a';
  if (ps.eyes === 'closed') { S.hline(ex - 1, ex, ey + 1, eyeDark); S.hline(ex2, ex2 + 1, ey + 1, eyeDark); }
  else if (ps.eyes === 'hurt') { S.dots([[ex - 1, ey], [ex, ey + 1], [ex - 1, ey + 2]], eyeDark); S.dots([[ex2 + 1, ey], [ex2, ey + 1], [ex2 + 1, ey + 2]], eyeDark); S.dot(head[0] - 2, head[1] + 4, '#8a3040'); }
  else if (ps.eyes === 'happy') { S.dots([[ex - 1, ey + 1], [ex, ey], [ex + 1, ey + 1]], eyeDark); S.dots([[ex2 - 1, ey + 1], [ex2, ey], [ex2 + 1, ey + 1]], eyeDark); S.dot(head[0] - 2, head[1] + 4, '#c0485a'); S.dot(head[0] - 3, head[1] + 4, '#c0485a'); }
  else {
    S.vline(ex, ey, ey + 1, eyeDark); S.dot(ex, ey + 1, L.eye); S.dot(ex, ey, eyeDark);
    S.vline(ex2, ey, ey + 1, eyeDark); S.dot(ex2, ey + 1, L.eye);
    S.dot(ex - 1, ey, eyeDark);
    if (ps.eyes === 'determined') { S.dot(ex - 1, ey - 1, eyeDark); S.dot(ex, ey - 1, eyeDark); S.dot(ex2, ey - 1, eyeDark); S.dot(ex2 + 1, ey - 2, eyeDark); }
  }
  S.dot(head[0] - 5, head[1] + 3, shift(L.skin[1], -0.02, 0.15, -10)); // blush

  // ---- hair & headgear
  const hx = head[0], hy = head[1];
  if (cls === 'knight') {
    const helm = m().ellipse(hx + 0.3, hy - 1, 8, 7.6).and(m().rect(0, 0, SPRITE_W, hy - 1).add(m().rect(hx + 0.5, 0, SPRITE_W, SPRITE_H)));
    helm.sub(m().rect(0, hy + 5.5, SPRITE_W, SPRITE_H));
    // cheek guard on the back of the face
    helm.add(m().poly([[hx + 0.5, hy - 1], [hx + 3, hy - 1], [hx + 2, hy + 6], [hx + 0.5, hy + 5]]));
    S.stamp(helm, L.armor, { r: 3 });
    S.hline(hx - 7, hx + 1, Math.round(hy - 2), L.trim[1]); // brow band
    S.hline(hx - 6, hx + 0, Math.round(hy - 3), L.trim[2]);
    S.dot(hx - 3, Math.round(hy - 2), L.trim[0]);
    const plume = m().poly([[hx - 1, hy - 7], [hx + 3, hy - 9.5], [hx + 10 + ps.sway, hy - 7], [hx + 13 + ps.sway * 1.5, hy - 1], [hx + 6, hy - 5]]);
    S.stamp(plume, L.plume, { r: 2 });
    S.dots([[hx - 6, hy - 1], [hx - 5, hy - 1], [hx - 7, hy]], L.hair[1]);
  } else if (cls === 'mage') {
    const brimY = hy - 4.5;
    S.stamp(m().ellipse(hx - 0.5, hy - 2, 7.6, 4.6).and(m().rect(0, 0, SPRITE_W, hy - 0.5)), L.hair, { r: 2 }); // fringe
    const brim = m().ellipse(hx + 0.5, brimY, 11.5, 2.6);
    const cone = m().poly([[hx - 6, brimY], [hx + 7, brimY], [hx + 6, hy - 13], [hx + 10 + ps.sway * 0.5, hy - 19], [hx + 1, hy - 14]]);
    S.stamp(cone, L.hat, { r: 2 });
    S.stamp(brim, L.hat, { r: 2 });
    S.hline(hx - 5, hx + 6, Math.round(brimY - 1.5), L.trim[1]);
    S.hline(hx - 4, hx + 5, Math.round(brimY - 2.5), L.trim[2]);
    S.dot(hx + 10 + ps.sway * 0.5, hy - 19, L.trim[0]);
  } else if (cls === 'ranger') {
    const hood = m().ellipse(hx + 0.8, hy - 0.5, 8.6, 8).poly([[hx + 4, hy - 6], [hx + 13 + ps.sway, hy + 2], [hx + 5, hy + 6]]);
    hood.sub(m().ellipse(hx - 4, hy + 2.5, 5.3, 5.2));
    S.stamp(hood, L.cloak, { r: 3 });
    S.stamp(m().ellipse(hx - 4.2, hy - 2.2, 3.4, 1.6), L.hair, { r: 1, sel: false }); // fringe
  } else if (cls === 'cleric') {
    const hair = m().ellipse(hx + 0.6, hy - 2, 8, 6).and(m().rect(0, 0, SPRITE_W, hy - 0.5).add(m().rect(hx + 1.5, 0, SPRITE_W, hy + 5)));
    hair.add(m().ellipse(hx + 4, hy + 3, 3, 4));
    S.stamp(hair, L.hair, { r: 2 });
    S.hline(hx - 7, hx + 3, Math.round(hy - 2), L.trim[1]);
    S.dot(hx - 5, Math.round(hy - 3), L.gem); S.dot(hx - 5, Math.round(hy - 2), L.trim[0]);
  }

  // ---- near arm + weapon
  const weaponBehind = cls === 'ranger';
  if (weaponBehind) weapon();
  if (cls === 'knight' && ps.shield === 'front') shield();
  S.stamp(m().capsule(shN[0], shN[1], nA.el[0], nA.el[1], 2.3, 2).capsule(nA.el[0], nA.el[1], nA.ha[0], nA.ha[1], 2, 1.7), sleeve, { r: 1 });
  if (cls === 'mage' || cls === 'cleric') { // wide sleeve cuff
    S.stamp(m().ellipse(nA.ha[0] * 0.6 + nA.el[0] * 0.4, nA.ha[1] * 0.6 + nA.el[1] * 0.4, 2.6, 2.6), L.robe2 || L.trim, { r: 1 });
  }
  if (!weaponBehind) weapon();
  S.stamp(m().circle(nA.ha[0], nA.ha[1], 1.8), glove, { r: 1 });

  S.outline({ k: 0.55 });
  return S;
}

// ------------------------------------------------------------------ enemies
function drawSlime(ps, look) {
  const S = new Sprite(64, 52);
  const cx = 32, base = 48;
  const sq = ps.squash || 0;
  const rx = 15 + sq * 3, ry = 12 - sq * 2.5;
  const cy = base - ry + 1 - (ps.jump || 0);
  const body = new Mask(64, 52).ellipse(cx, cy, rx, ry).rect(cx - rx + 2, cy, rx * 2 - 4, ry - 1);
  body.sub(new Mask(64, 52).rect(0, base + 1 - (ps.jump || 0), 64, 10));
  S.stamp(body, look.body, { r: 4, dither: true });
  // core
  S.stamp(new Mask(64, 52).ellipse(cx + 3, cy + 3, rx * 0.45, ry * 0.4), look.core, { r: 2, sel: false });
  // bubbles & highlight
  S.dots([[cx - 9, cy - 6], [cx - 8, cy - 7], [cx - 7, cy - 7], [cx - 10, cy - 4]], '#f3fff6');
  S.dots([[cx + 7, cy + 2], [cx - 4, cy + 6]], look.body[0]);
  // eyes look right (towards heroes once mirrored, so draw them on the left)
  const ey = Math.round(cy - 2 + (ps.hurt ? 1 : 0));
  const eye = (x) => {
    if (ps.hurt) { S.dots([[x - 1, ey], [x, ey + 1], [x + 1, ey]], '#1a1430'); return; }
    S.stamp(new Mask(64, 52).ellipse(x, ey, 2.2, 2.8), ['#ffffff', '#f2f6ff', '#c6cce8', '#8a90b8'], { r: 1, sel: false });
    S.dot(x - 1, ey, '#1a1430'); S.dot(x - 1, ey + 1, '#1a1430'); S.dot(x, ey + 1, '#1a1430');
  };
  eye(cx - 7); eye(cx - 1);
  if (ps.mouth) { S.hline(cx - 6, cx - 2, ey + 5, '#1a1430'); S.dot(cx - 4, ey + 6, '#c03050'); }
  S.outline({ k: 0.5 });
  return S.flipX();
}

function drawGoblin(ps, look, hexer) {
  const S = new Sprite(64, 60);
  const ax = 34 + (ps.dx || 0), ay = 57;
  const hip = [ax, ay - 12 + (ps.dy || 0)];
  const lean = (ps.lean || 6) * Math.PI / 180;
  const neck = [hip[0] - Math.sin(lean) * 9, hip[1] - Math.cos(lean) * 9];
  const head = [neck[0] - 2, neck[1] - 6];
  const m = () => new Mask(64, 60);
  const arm = (sh, a, b) => { const el = limb(sh[0], sh[1], a, 5); const ha = limb(el[0], el[1], a + b, 5); return { el, ha }; };
  const nA = arm([neck[0] - 1, neck[1] + 2], ps.n ? ps.n[0] : 20, ps.n ? ps.n[1] : 50);
  const fA = arm([neck[0] + 3, neck[1] + 1.5], ps.f ? ps.f[0] : (hexer ? -28 : -10), ps.f ? ps.f[1] : (hexer ? 40 : 30));
  const leg = (hp, a, k) => { const kn = limb(hp[0], hp[1], a, 6); const an = limb(kn[0], kn[1], a - k, 6); return { kn, an: [an[0], Math.min(an[1], ay - 1)] }; };
  const nL = leg([hip[0] - 2, hip[1]], ps.nl ? ps.nl[0] : 18, 10), fL = leg([hip[0] + 2, hip[1]], ps.fl ? ps.fl[0] : -14, 12);
  const skin = look.skin;
  if (hexer) { // cloak behind
    S.stamp(m().poly([[neck[0] - 4, neck[1]], [neck[0] + 6, neck[1]], [hip[0] + 8, ay - 2], [hip[0] - 7, ay - 2]]), look.cloth, { r: 3, dither: true });
  }
  S.stamp(m().capsule(neck[0] + 3, neck[1] + 1.5, fA.el[0], fA.el[1], 1.6).capsule(fA.el[0], fA.el[1], fA.ha[0], fA.ha[1], 1.5, 1.3), skin.map(c => shift(c, -0.08)), { r: 1 });
  S.stamp(m().capsule(hip[0] + 2, hip[1], fL.kn[0], fL.kn[1], 2).capsule(fL.kn[0], fL.kn[1], fL.an[0], fL.an[1], 1.7), skin.map(c => shift(c, -0.08)), { r: 1 });
  S.stamp(m().ellipse(fL.an[0] - 1.5, fL.an[1], 2.6, 1.6), P.boot, { r: 1 });
  S.stamp(m().capsule(hip[0] - 2, hip[1], nL.kn[0], nL.kn[1], 2.1).capsule(nL.kn[0], nL.kn[1], nL.an[0], nL.an[1], 1.8), skin, { r: 1 });
  S.stamp(m().ellipse(nL.an[0] - 1.5, nL.an[1], 2.7, 1.6), P.boot, { r: 1 });
  // body
  const torso = m().poly([[neck[0] - 4, neck[1] + 1], [neck[0] + 4.5, neck[1] + 1], [hip[0] + 5, hip[1] + 1], [hip[0] - 5, hip[1] + 1]]).ellipse(hip[0] - 1, hip[1] - 3, 5.5, 4.5);
  S.stamp(torso, hexer ? look.cloth : look.vest, { r: 2 });
  S.hline(hip[0] - 5, hip[0] + 5, Math.round(hip[1]), P.leather[2]);
  if (!hexer) S.dots([[neck[0] - 1, neck[1] + 3], [neck[0] - 1, neck[1] + 5]], P.gold[1]);
  // head: big ears
  const earL = m().poly([[head[0] + 2, head[1] - 1], [head[0] + 13, head[1] - 6], [head[0] + 4, head[1] + 3]]);
  S.stamp(earL, skin, { r: 1 });
  const hm = m().ellipse(head[0], head[1], 6.2, 5.6).ellipse(head[0] - 3, head[1] + 2.5, 3.6, 2.8);
  S.stamp(hm, skin, { r: 2 });
  S.stamp(m().ellipse(head[0] - 6.5, head[1] + 1.5, 2.2, 1.7), skin, { r: 1 }); // nose
  const ey = Math.round(head[1]);
  if (ps.hurt) { S.dots([[head[0] - 4, ey], [head[0] - 3, ey + 1], [head[0] - 4, ey + 2]], '#1a1020'); }
  else { S.dot(head[0] - 4, ey, '#ffde3a'); S.dot(head[0] - 3, ey, '#d02020'); S.dot(head[0] - 4, ey + 1, '#8a1a1a'); S.dot(head[0], ey, '#ffde3a'); S.dot(head[0] + 1, ey, '#d02020'); }
  S.hline(head[0] - 6, head[0] - 3, ey + 4, '#3a1a20'); S.dot(head[0] - 5, ey + 5, '#fff2d0');
  if (hexer) {
    const hood = m().ellipse(head[0] + 1, head[1] - 1.5, 7, 6).poly([[head[0] - 2, head[1] - 6], [head[0] + 6, head[1] - 12], [head[0] + 6, head[1] - 3]]);
    hood.sub(m().ellipse(head[0] - 3.5, head[1] + 2, 4.6, 4.6));
    S.stamp(hood, look.cloth, { r: 2 });
    // skull staff in far hand
    const top = limb(fA.ha[0] + 2, fA.ha[1], 196, 25), bot = limb(fA.ha[0] + 2, fA.ha[1], 16, 6);
    S.stamp(m().capsule(bot[0], bot[1], top[0], top[1], 1), P.wood, { r: 1 });
    S.stamp(m().circle(top[0], top[1] - 1, 2.6), P.bone, { r: 1 });
    S.dots([[top[0] - 1, top[1] - 1], [top[0] + 1, top[1] - 1]], '#b46bff');
  } else {
    S.stamp(m().ellipse(head[0] + 1, head[1] - 4, 5.5, 2.4).and(m().rect(0, 0, 64, head[1] - 3)), look.cap, { r: 1 });
  }
  // near arm with dagger / claw
  S.stamp(m().capsule(neck[0] - 1, neck[1] + 2, nA.el[0], nA.el[1], 1.7).capsule(nA.el[0], nA.el[1], nA.ha[0], nA.ha[1], 1.6, 1.4), skin, { r: 1 });
  if (!hexer) {
    const wa = ps.w == null ? 150 : ps.w;
    const tip = limb(nA.ha[0], nA.ha[1], wa, 9);
    S.stamp(m().capsule(nA.ha[0], nA.ha[1], tip[0], tip[1], 1.1, 0.4), ['#ffffff', '#c9d2dd', '#7f8aa0', '#4a4f68'], { r: 1 });
    S.stamp(m().circle(nA.ha[0], nA.ha[1], 1.5), P.leather, { r: 1 });
  } else {
    S.stamp(m().circle(nA.ha[0], nA.ha[1], 2.2), ['#f0d8ff', '#b46bff', '#7a3fd1', '#4a2a8a'], { r: 1 });
  }
  S.outline({ k: 0.5 });
  return S.flipX();
}

function drawSkeleton(ps) {
  const S = new Sprite(64, 66);
  const ax = 34 + (ps.dx || 0), ay = 63;
  const hip = [ax, ay - 16 + (ps.dy || 0)];
  const lean = (ps.lean || 4) * Math.PI / 180;
  const neck = [hip[0] - Math.sin(lean) * 13, hip[1] - Math.cos(lean) * 13];
  const head = [neck[0] - 1, neck[1] - 6];
  const m = () => new Mask(64, 66);
  const bone = P.bone;
  const arm = (sh, a, b) => { const el = limb(sh[0], sh[1], a, 6.5); const ha = limb(el[0], el[1], a + b, 6); return { el, ha }; };
  const nA = arm([neck[0] - 2, neck[1] + 2], ps.n ? ps.n[0] : 24, ps.n ? ps.n[1] : 40);
  const fA = arm([neck[0] + 3, neck[1] + 2], ps.f ? ps.f[0] : 30, ps.f ? ps.f[1] : 40);
  const leg = (hp, a, k) => { const kn = limb(hp[0], hp[1], a, 8); const an = limb(kn[0], kn[1], a - k, 8); return { kn, an: [an[0], Math.min(an[1], ay - 1)] }; };
  const nL = leg([hip[0] - 2, hip[1]], ps.nl ? ps.nl[0] : 14, 8), fL = leg([hip[0] + 2, hip[1]], ps.fl ? ps.fl[0] : -12, 10);
  // shield on far arm (round, wooden, battered)
  const sc = [fA.ha[0] - 2, fA.ha[1] - 2];
  S.stamp(m().circle(sc[0], sc[1], 6.5), P.wood, { r: 2, dither: true });
  S.stamp(m().circle(sc[0], sc[1], 6.5).sub(m().circle(sc[0], sc[1], 5.2)), P.iron, { r: 1, sel: false });
  S.stamp(m().circle(sc[0], sc[1], 1.6), P.iron, { r: 1 });
  const thin = (a, b, r) => m().capsule(a[0], a[1], b[0], b[1], r);
  S.stamp(thin([hip[0] + 2, hip[1]], fL.kn, 1.2).add(thin(fL.kn, fL.an, 1.1)), bone.map(c => shift(c, -0.1)), { r: 1 });
  S.stamp(m().ellipse(fL.an[0] - 1.5, fL.an[1], 2.4, 1.2), bone.map(c => shift(c, -0.1)), { r: 1 });
  // pelvis + spine + ribs
  S.stamp(m().ellipse(hip[0], hip[1] - 1, 4.2, 2.4), bone, { r: 1 });
  S.stamp(thin(hip, neck, 1), bone, { r: 1 });
  const ribs = m();
  for (let k = 0; k < 4; k++) { const y = neck[1] + 3 + k * 2.2; const x = neck[0] + (hip[0] - neck[0]) * (k / 5); ribs.capsule(x - 4.5 + k * 0.5, y + 1, x + 3.5 - k * 0.4, y, 0.8); }
  S.stamp(ribs, bone, { r: 1 });
  S.stamp(thin([hip[0] - 2, hip[1]], nL.kn, 1.3).add(thin(nL.kn, nL.an, 1.2)), bone, { r: 1 });
  S.stamp(m().ellipse(nL.an[0] - 1.5, nL.an[1], 2.5, 1.3), bone, { r: 1 });
  // tattered loincloth
  S.stamp(m().poly([[hip[0] - 4, hip[1] - 1], [hip[0] + 4, hip[1] - 1], [hip[0] + 3, hip[1] + 6], [hip[0] + 1, hip[1] + 4], [hip[0] - 1, hip[1] + 7], [hip[0] - 3, hip[1] + 4]]), R('#5a3a5a'), { r: 1 });
  // skull
  const sk = m().ellipse(head[0], head[1], 5.6, 5.2).ellipse(head[0] - 2, head[1] + 3.5, 3.2, 2.4);
  S.stamp(sk, bone, { r: 2 });
  const glow = ps.hurt ? '#ffffff' : '#7ff3ff';
  S.dots([[head[0] - 3, head[1]], [head[0] - 2, head[1]], [head[0] - 3, head[1] + 1]], '#1a1020');
  S.dots([[head[0] + 1, head[1]], [head[0] + 1, head[1] + 1]], '#1a1020');
  S.dot(head[0] - 3, head[1], glow); S.dot(head[0] + 1, head[1], glow);
  S.hline(head[0] - 4, head[0] - 1, Math.round(head[1] + 4), '#4a3a3a');
  S.dots([[head[0] - 3, head[1] + 4], [head[0] - 1, head[1] + 4]], bone[1]);
  // rusty helm
  S.stamp(m().ellipse(head[0] + 0.5, head[1] - 2.5, 6.2, 3.8).and(m().rect(0, 0, 64, head[1] - 1.5)), P.iron, { r: 2 });
  // near arm + sword
  S.stamp(thin([neck[0] - 2, neck[1] + 2], nA.el, 1.2).add(thin(nA.el, nA.ha, 1.1)), bone, { r: 1 });
  const wa = ps.w == null ? 160 : ps.w;
  const tip = limb(nA.ha[0], nA.ha[1], wa, 16);
  S.stamp(m().capsule(nA.ha[0], nA.ha[1], tip[0], tip[1], 1.4, 0.7), ['#d8c9b0', '#a08f7a', '#7a5f4f', '#4f3a3a'], { r: 1 });
  const g = limb(nA.ha[0], nA.ha[1], wa, 1.5);
  const perp = (wa + 90) * Math.PI / 180;
  S.stamp(m().capsule(g[0] - Math.sin(perp) * 3, g[1] + Math.cos(perp) * 3, g[0] + Math.sin(perp) * 3, g[1] - Math.cos(perp) * 3, 0.9), P.iron, { r: 1 });
  S.outline({ k: 0.5 });
  return S.flipX();
}

function drawSentinel(ps) {
  const W = 96, H = 92;
  const S = new Sprite(W, H);
  const ax = 50 + (ps.dx || 0), ay = 89;
  const hip = [ax, ay - 25 + (ps.dy || 0)];
  const lean = (ps.lean || 6) * Math.PI / 180;
  const neck = [hip[0] - Math.sin(lean) * 20, hip[1] - Math.cos(lean) * 20];
  const head = [neck[0] - 1, neck[1] - 7];
  const m = () => new Mask(W, H);
  const arm = (sh, a, b) => { const el = limb(sh[0], sh[1], a, 10); const ha = limb(el[0], el[1], a + b, 9); return { el, ha }; };
  const nA = arm([neck[0] - 3, neck[1] + 4], ps.n ? ps.n[0] : 20, ps.n ? ps.n[1] : 50);
  const fA = arm([neck[0] + 6, neck[1] + 3], ps.f ? ps.f[0] : 40, ps.f ? ps.f[1] : 40);
  const leg = (hp, a, k) => { const kn = limb(hp[0], hp[1], a, 12); const an = limb(kn[0], kn[1], a - k, 12); return { kn, an: [an[0], Math.min(an[1], ay - 2)] }; };
  const nL = leg([hip[0] - 4, hip[1]], ps.nl ? ps.nl[0] : 14, 8), fL = leg([hip[0] + 4, hip[1]], ps.fl ? ps.fl[0] : -10, 10);
  const iron = R('#5f6680'), ironD = R('#454b63');
  const glowC = ps.charge ? '#ff5a2a' : '#ffb347';
  // tower shield (far arm)
  const sc = [fA.ha[0] - 6, fA.ha[1] - 6];
  const shield = m().poly([[sc[0] - 10, sc[1] - 16], [sc[0] + 8, sc[1] - 16], [sc[0] + 9, sc[1] + 12], [sc[0] - 1, sc[1] + 19], [sc[0] - 11, sc[1] + 12]]);
  S.stamp(shield, R('#4a3f5a'), { r: 3, dither: true });
  S.stamp(shield.clone().sub(m().poly([[sc[0] - 8, sc[1] - 14], [sc[0] + 6, sc[1] - 14], [sc[0] + 7, sc[1] + 11], [sc[0] - 1, sc[1] + 16.5], [sc[0] - 9, sc[1] + 11]])), iron, { r: 1, sel: false });
  S.stamp(m().circle(sc[0] - 1, sc[1] - 2, 3.5), ['#ffe0a0', glowC, '#c04a20', '#6a2018'], { r: 1 });
  // legs
  const legShape = (hp, L, r) => m().capsule(hp[0], hp[1], L.kn[0], L.kn[1], r, r - 0.6).capsule(L.kn[0], L.kn[1], L.an[0], L.an[1], r - 0.6, r - 1);
  S.stamp(legShape([hip[0] + 4, hip[1]], fL, 4.4), ironD, { r: 2 });
  S.stamp(m().ellipse(fL.an[0] - 2, fL.an[1], 5, 2.6), ironD, { r: 1 });
  S.stamp(legShape([hip[0] - 4, hip[1]], nL, 4.6), iron, { r: 2 });
  S.stamp(m().ellipse(nL.an[0] - 2, nL.an[1], 5.4, 2.8), iron, { r: 1 });
  S.stamp(m().circle(nL.kn[0], nL.kn[1], 3), iron, { r: 2 });
  // body
  const torso = m().poly([[neck[0] - 10, neck[1] + 2], [neck[0] + 10, neck[1] + 1], [hip[0] + 8, hip[1] + 2], [hip[0] - 8, hip[1] + 2]]).ellipse((neck[0] + hip[0]) / 2 - 1, (neck[1] + hip[1]) / 2, 10, 11);
  S.stamp(torso, iron, { r: 4, dither: true });
  const mid = [(neck[0] + hip[0]) / 2, (neck[1] + hip[1]) / 2];
  S.stamp(m().ellipse(mid[0] - 2, mid[1] - 3, 5, 5), iron, { r: 2, selK: 0.7 });
  S.stamp(m().circle(mid[0] - 2, mid[1] - 2, 1.8), ['#fff0c0', glowC, '#c04a20', '#6a2018'], { r: 1, sel: false });
  S.hline(hip[0] - 8, hip[0] + 8, Math.round(hip[1] - 1), '#2a2638');
  S.stamp(m().poly([[hip[0] - 8, hip[1]], [hip[0] + 8, hip[1]], [hip[0] + 9, hip[1] + 7], [hip[0] - 9, hip[1] + 7]]), R('#6a2f3a'), { r: 2 });
  // pauldrons
  S.stamp(m().ellipse(neck[0] + 7, neck[1] + 3, 6, 4.5), ironD, { r: 2 });
  // helm
  const hm = m().ellipse(head[0], head[1], 8.5, 8).rect(head[0] - 7, head[1], 14, 7);
  S.stamp(hm, iron, { r: 3 });
  const slitY = Math.round(head[1] + 1);
  S.hline(head[0] - 7, head[0] + 1, slitY, '#160c18'); S.hline(head[0] - 7, head[0] + 1, slitY + 1, '#160c18');
  S.hline(head[0] - 6, head[0] - 1, slitY, glowC); S.dot(head[0] - 5, slitY, '#fff0c0');
  // horns
  S.stamp(m().poly([[head[0] + 2, head[1] - 6], [head[0] + 12, head[1] - 15], [head[0] + 6, head[1] - 4]]), P.bone, { r: 1 });
  // near arm + maul
  S.stamp(m().capsule(neck[0] - 3, neck[1] + 4, nA.el[0], nA.el[1], 3.6, 3.2).capsule(nA.el[0], nA.el[1], nA.ha[0], nA.ha[1], 3.2, 2.8), iron, { r: 2 });
  S.stamp(m().ellipse(neck[0] - 4, neck[1] + 3, 6.5, 5), iron, { r: 2 });
  const wa = ps.w == null ? 160 : ps.w;
  const top = limb(nA.ha[0], nA.ha[1], wa, 22), bot = limb(nA.ha[0], nA.ha[1], wa + 180, 5);
  S.stamp(m().capsule(bot[0], bot[1], top[0], top[1], 1.5), P.wood, { r: 1 });
  const hd = limb(nA.ha[0], nA.ha[1], wa, 23);
  const perp = (wa + 90) * Math.PI / 180;
  const px = -Math.sin(perp) * 6, py = Math.cos(perp) * 6;
  const head2 = m().capsule(hd[0] + px, hd[1] + py, hd[0] - px, hd[1] - py, 4.5);
  S.stamp(head2, ironD, { r: 2 });
  S.stamp(m().circle(nA.ha[0], nA.ha[1], 3.2), iron, { r: 1 });
  S.outline({ k: 0.5 });
  return S.flipX();
}

function drawWyrm(ps) {
  const W = 168, H = 120;
  const S = new Sprite(W, H);
  const m = () => new Mask(W, H);
  const ground = 116;
  const bx = 92 + (ps.dx || 0), by = 74 + (ps.dy || 0);
  const scale = R('#2f6a6a', { k: 1 }), belly = R('#c9b27a'), dark = R('#244a52');
  const crystal = ['#fff6c8', '#ffc24a', '#e07a24', '#8a3a24'];
  const breathe = ps.breathe || 0;
  // tail (behind, curling back to the right of the sprite before mirroring = left after mirroring... we draw facing left)
  const tail = m();
  let tx = bx + 26, ty = by + 10;
  for (let i = 0; i < 18; i++) {
    const a = i / 18;
    const nx = bx + 26 + i * 3.4, ny = by + 8 + Math.sin(a * 3.2 + (ps.tail || 0)) * 8 + a * 14;
    tail.capsule(tx, ty, nx, ny, 9 * (1 - a) + 1.5, 9 * (1 - (i + 1) / 18) + 1.5);
    tx = nx; ty = ny;
  }
  S.stamp(tail, scale, { r: 4, dither: true });
  // far legs
  const leg = (hx, hy, a, k, r) => { const kn = limb(hx, hy, a, 16); const an = limb(kn[0], kn[1], a - k, 15); return m().capsule(hx, hy, kn[0], kn[1], r, r - 1.5).capsule(kn[0], kn[1], an[0], Math.min(an[1], ground - 3), r - 1.5, r - 2.5).ellipse(an[0] - 4, Math.min(an[1], ground - 3) + 1, 6, 3); };
  S.stamp(leg(bx + 22, by + 10, -12 + (ps.legs || 0), 20, 7), dark, { r: 3 });
  S.stamp(leg(bx - 18, by + 8, 18 - (ps.legs || 0), 26, 7), dark, { r: 3 });
  // body
  const body = m().ellipse(bx, by, 34 + breathe, 22 + breathe * 0.5).ellipse(bx - 18, by - 6, 18, 16);
  S.stamp(body, scale, { r: 5, dither: true });
  const bel = m().ellipse(bx - 4, by + 12, 26, 9).and(body);
  S.stamp(bel, belly, { r: 3, sel: false });
  for (let k = -3; k <= 3; k++) S.hline(bx - 4 + k * 7 - 3, bx - 4 + k * 7 + 3, by + 12 + Math.abs(k) * 0, belly[2]);
  // back crystals
  const crystals = [[bx - 14, by - 22, 14, -8], [bx - 2, by - 22, 18, 4], [bx + 12, by - 18, 13, 10], [bx + 24, by - 12, 10, 18], [bx - 26, by - 14, 10, -16]];
  for (const [cx, cy, h, tilt] of crystals) {
    const tip = limb(cx, cy, 180 + tilt, h + (ps.glow || 0) * 0);
    const cm = m().poly([[cx - 4, cy + 3], [cx + 4, cy + 3], [tip[0] + 1, tip[1]], [tip[0] - 1, tip[1]]]);
    S.stamp(cm, crystal, { r: 2, light: [-0.8, -0.5] });
    S.line(cx - 1, cy + 1, tip[0], tip[1] + 2, '#fff6c8');
  }
  // near legs
  S.stamp(leg(bx + 14, by + 14, -6 + (ps.legs || 0) * 0.5, 22, 8), scale, { r: 3 });
  S.stamp(leg(bx - 24, by + 10, 26 - (ps.legs || 0), 30, 8.5), scale, { r: 3 });
  // claws
  // neck + head
  const nk = [bx - 34, by - 12 + (ps.headDy || 0)];
  const hd = [bx - 50 + (ps.headDx || 0), by - 22 + (ps.headDy || 0)];
  S.stamp(m().capsule(bx - 20, by - 6, nk[0], nk[1], 13, 10).capsule(nk[0], nk[1], hd[0] + 6, hd[1] + 2, 10, 9), scale, { r: 4, dither: true });
  const jaw = ps.jaw || 0;
  // lower jaw
  const lj = m().poly([[hd[0] + 6, hd[1] + 4], [hd[0] - 18, hd[1] + 6 + jaw * 1.2], [hd[0] - 20, hd[1] + 9 + jaw * 1.4], [hd[0] + 4, hd[1] + 11]]);
  S.stamp(lj, dark, { r: 2 });
  // mouth interior
  if (jaw > 2) S.stamp(m().poly([[hd[0] + 2, hd[1] + 3], [hd[0] - 17, hd[1] + 3], [hd[0] - 17, hd[1] + 5 + jaw], [hd[0] + 2, hd[1] + 7]]), R('#8a2a3a'), { r: 1, sel: false });
  // upper head / snout
  const up = m().ellipse(hd[0], hd[1] - 1, 12, 8).poly([[hd[0] - 4, hd[1] - 6], [hd[0] - 23, hd[1] - 1], [hd[0] - 22, hd[1] + 4], [hd[0] - 2, hd[1] + 4]]);
  S.stamp(up, scale, { r: 3, dither: true });
  // teeth
  for (let k = 0; k < 6; k++) { const x = hd[0] - 19 + k * 3.5; S.vline(x, hd[1] + 4, hd[1] + 5 + (k % 2), '#fffbe8'); if (jaw > 2) S.vline(x + 1.5, hd[1] + 5 + jaw, hd[1] + 3 + jaw, '#e3d9b9'); }
  // horns & crest crystals
  S.stamp(m().poly([[hd[0] + 4, hd[1] - 6], [hd[0] + 20, hd[1] - 18], [hd[0] + 9, hd[1] - 3]]), P.bone, { r: 1 });
  const hc = limb(hd[0] - 2, hd[1] - 7, 190, 9);
  S.stamp(m().poly([[hd[0] - 5, hd[1] - 6], [hd[0] + 1, hd[1] - 7], [hc[0], hc[1]]]), crystal, { r: 1 });
  // eye
  const ex = Math.round(hd[0] - 6), ey = Math.round(hd[1] - 3);
  S.hline(ex - 2, ex + 2, ey, '#160c18'); S.hline(ex - 1, ex + 2, ey + 1, '#160c18');
  S.hline(ex - 1, ex + 1, ey, ps.rage ? '#ff4a2a' : '#ffd84a'); S.dot(ex - 1, ey, '#ffffff');
  S.hline(ex - 3, ex + 3, ey - 2, dark[2]);
  // nostril
  S.dot(hd[0] - 21, hd[1] - 1, '#160c18');
  S.outline({ k: 0.5 });
  return S.flipX();
}

function drawShard(ps) {
  const S = new Sprite(30, 40);
  const m = () => new Mask(30, 40);
  const crystal = ['#fff6c8', '#ffc24a', '#e07a24', '#8a3a24'];
  const y = 18 + (ps.dy || 0);
  S.stamp(m().poly([[15, y - 16], [21, y - 2], [15, y + 12], [9, y - 2]]), crystal, { r: 2, light: [-0.8, -0.5] });
  S.stamp(m().poly([[8, y - 6], [11, y + 2], [8, y + 9], [5, y + 2]]), crystal, { r: 1 });
  S.stamp(m().poly([[22, y - 4], [25, y + 3], [22, y + 8], [19, y + 3]]), crystal, { r: 1 });
  S.line(14, y - 12, 13, y + 6, '#fffbe8');
  if (ps.hurt) S.tint('#ffffff', 0.5);
  S.outline({ k: 0.4 });
  return S;
}

// ------------------------------------------------------------------ enemy poses
const ENEMY_DEF = {
  slime: { w: 64, h: 52, ax: 32, ay: 49, draw: (ps) => drawSlime(ps, { body: R('#3fb58a', { k: 1.1 }), core: R('#2a7a6a') }), poses: {
    idle0: {}, idle1: { squash: 0.3 }, idle2: { squash: 0.5 }, idle3: { squash: 0.2 }, windup: { squash: 0.9 }, attack: { squash: -0.6, jump: 4, mouth: 1 }, hurt: { squash: 0.6, hurt: 1 } } },
  goblin: { w: 64, h: 60, ax: 30, ay: 57, draw: (ps) => drawGoblin(ps, { skin: R('#7fb04a'), vest: R('#8a5a3a'), cap: R('#a83a2f') }), poses: {
    idle0: {}, idle1: { dy: 1 }, idle2: { dy: 1, n: [22, 54] }, idle3: { n: [22, 52] }, windup: { lean: -8, n: [160, 20], w: 200, dx: 2 }, attack: { lean: 18, n: [100, 0], w: 100, dx: -3, nl: [34, 0] }, hurt: { lean: -14, dx: 2, hurt: 1, n: [-20, 40], w: 200 } } },
  hexer: { w: 64, h: 60, ax: 30, ay: 57, draw: (ps) => drawGoblin(ps, { skin: R('#8ab05a'), cloth: R('#4a3a7a'), cap: R('#4a3a7a') }, true), poses: {
    idle0: {}, idle1: { dy: 1 }, idle2: { dy: 1 }, idle3: {}, windup: { n: [140, 20], lean: -6 }, attack: { n: [95, 0], lean: 10, dx: -2 }, hurt: { lean: -14, dx: 2, hurt: 1 } } },
  skeleton: { w: 64, h: 66, ax: 30, ay: 63, draw: drawSkeleton, poses: {
    idle0: {}, idle1: { dy: 1 }, idle2: { dy: 1, n: [26, 44] }, idle3: { n: [26, 42] }, windup: { lean: -10, n: [165, 20], w: 210, dx: 2 }, attack: { lean: 18, n: [100, 0], w: 95, dx: -4, nl: [32, 4] }, hurt: { lean: -16, dx: 3, hurt: 1, n: [-10, 30], w: 210 } } },
  sentinel: { w: 96, h: 92, ax: 46, ay: 89, draw: drawSentinel, poses: {
    idle0: {}, idle1: { dy: 1 }, idle2: { dy: 1 }, idle3: {}, windup: { lean: -10, n: [170, 10], w: 190, dx: 3, charge: 1 }, attack: { lean: 20, n: [80, 10], w: 70, dx: -5, nl: [30, 4] }, hurt: { lean: -12, dx: 3 }, charge: { lean: -6, n: [175, 0], w: 180, charge: 1, dy: 1 } } },
  wyrm: { w: 168, h: 120, ax: 76, ay: 116, draw: drawWyrm, poses: {
    idle0: {}, idle1: { breathe: 1, tail: 0.5 }, idle2: { breathe: 2, tail: 1, headDy: 1 }, idle3: { breathe: 1, tail: 0.5 },
    windup: { headDx: 8, headDy: -6, jaw: 2, legs: 4, rage: 1 }, attack: { headDx: -10, headDy: 4, jaw: 9, legs: -6, rage: 1 },
    roar: { headDx: 2, headDy: -8, jaw: 11, rage: 1, breathe: 2 }, hurt: { headDx: 6, headDy: -3, jaw: 4, dx: 3 }, tail: { tail: 2.2, headDx: 4, legs: 6 } } },
  // The raid boss: Andy's red dragon (public/art/voidmaw.png, built by tools/build_dragon.py).
  // The drawn fallback below is only used if that sheet is missing.
  voidmaw: { w: 176, h: 156, ax: 88, ay: 154, draw: (ps) => { const S = drawWyrm(ps); S.tint('#a8301a', 0.4); return S; }, poses: null },
  shard: { w: 30, h: 40, ax: 15, ay: 38, draw: drawShard, poses: { idle0: { dy: 0 }, idle1: { dy: -1 }, idle2: { dy: -2 }, idle3: { dy: -1 }, windup: { dy: -3 }, attack: { dy: 1 }, hurt: { hurt: 1 } } }
};
ENEMY_DEF.voidmaw.poses = ENEMY_DEF.wyrm.poses;
// The first act's boss: Andy's minotaur (public/art/minotaur.png, built by tools/build_minotaur.py).
// The drawn fallback is only used if that sheet is missing.
ENEMY_DEF.minotaur = { w: 150, h: 136, ax: 72, ay: 132, draw: (ps) => { const S = drawWyrm(ps); S.tint('#6a4a30', 0.5); return S; }, poses: ENEMY_DEF.wyrm.poses };
// Act bosses and minions built from existing rigs: scaled up, recoloured, crowned.
Object.assign(ENEMY_DEF, {
  colossus: { w: 192, h: 184, ax: 92, ay: 178, base: 'sentinel', scale: 2, tint: ['#d0612a', 0.28], poses: ENEMY_DEF.sentinel.poses },
  hollowking: { w: 128, h: 132, ax: 60, ay: 126, base: 'skeleton', scale: 2, tint: ['#6a3aa8', 0.32], crown: true, poses: ENEMY_DEF.skeleton.poses },
  thrall: { w: 64, h: 66, ax: 30, ay: 63, base: 'skeleton', scale: 1, tint: ['#5a8a6a', 0.35], poses: ENEMY_DEF.skeleton.poses }
});
function derivedFrame(d, poseName, white) {
  const src = enemyFrame(d.base, poseName, false);
  const k = d.scale || 1;
  // crown on the king: find the top of the skull and draw a small gold crown above it
  let base = src;
  if (d.crown) {
    const c0 = document.createElement('canvas'); c0.width = src.width; c0.height = src.height + 6;
    const x0 = c0.getContext('2d'); x0.drawImage(src, 0, 6);
    const data = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    let top = -1, minX = 1e9, maxX = -1;
    for (let y = 0; y < src.height && top < 0; y++) for (let x = 0; x < src.width; x++) if (data[(y * src.width + x) * 4 + 3] > 0) { top = y; break; }
    if (top >= 0) for (let x = 0; x < src.width; x++) if (data[(top + 2) * src.width * 4 + x * 4 + 3] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    if (maxX > 0) {
      const cx = Math.round((minX + maxX) / 2), y = top + 6;
      x0.fillStyle = '#7a4a10'; x0.fillRect(cx - 5, y - 3, 11, 3);
      x0.fillStyle = '#ffd24a'; x0.fillRect(cx - 4, y - 3, 9, 2); x0.fillRect(cx - 4, y - 6, 1, 3); x0.fillRect(cx, y - 7, 1, 4); x0.fillRect(cx + 4, y - 6, 1, 3);
      x0.fillStyle = '#ff4a6a'; x0.fillRect(cx, y - 2, 1, 1);
    }
    base = c0;
  }
  const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const srcDef = ENEMY_DEF[d.base];
  // keep the feet on the anchor
  const dx = Math.round(d.ax - srcDef.ax * k), dy = Math.round(d.ay - (srcDef.ay + (d.crown ? 6 : 0)) * k);
  x.drawImage(base, dx, dy, base.width * k, base.height * k);
  x.globalCompositeOperation = 'source-atop';
  if (d.tint && !white) { x.globalAlpha = d.tint[1]; x.fillStyle = d.tint[0]; x.fillRect(0, 0, c.width, c.height); }
  if (white) { x.globalAlpha = 1; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
  return c;
}
export function enemySeqLen(kind, name) { const d = ENEMY_DEF[kind]; return (d && d.seqs && d.seqs[name]) || 0; }
export function enemyInfo(kind) { const d = ENEMY_DEF[kind] || ENEMY_DEF.slime; return { w: d.w, h: d.h, ax: d.ax, ay: d.ay }; }

// ------------------------------------------------------------------ chests
function drawChest(rarity, open) {
  const S = new Sprite(40, 34);
  const m = () => new Mask(40, 34);
  const mats = {
    common: { wood: P.wood, band: P.iron, lock: P.gold },
    rare: { wood: R('#4a2f7a'), band: R('#c0a0ff', { k: 0.8 }), lock: R('#ff7ad0') },
    legendary: { wood: R('#a8501f'), band: P.gold, lock: R('#ffffff', { k: 0.6 }) }
  }[rarity] || { wood: P.wood, band: P.iron, lock: P.gold };
  const base = m().rect(6, 16, 28, 14);
  S.stamp(base, mats.wood, { r: 3, dither: true });
  S.stamp(m().rect(6, 16, 28, 2).rect(6, 28, 28, 2).rect(10, 16, 2, 14).rect(28, 16, 2, 14), mats.band, { r: 1 });
  if (open) {
    // lid tilted back, glowing interior
    S.stamp(m().rect(7, 14, 26, 3), ['#fff6c8', '#ffd25a', '#e0902a', '#8a4a24'], { r: 1, sel: false });
    const lid = m().poly([[7, 14], [33, 14], [31, 3], [9, 3]]);
    S.stamp(lid, mats.wood, { r: 2 });
    S.stamp(m().rect(9, 3, 22, 2).rect(18, 3, 4, 11), mats.band, { r: 1 });
  } else {
    const lid = m().ellipse(20, 16, 14, 7).and(m().rect(0, 0, 40, 17)).rect(6, 13, 28, 4);
    S.stamp(lid, mats.wood, { r: 3, dither: true });
    S.stamp(m().rect(10, 9, 2, 8).rect(28, 9, 2, 8).ellipse(20, 16, 14, 7).sub(m().ellipse(20, 16, 12.5, 5.5)).and(m().rect(0, 0, 40, 17)), mats.band, { r: 1, sel: false });
    S.stamp(m().rect(18, 14, 4, 5), mats.lock, { r: 1 });
    S.dot(20, 17, '#1a1020');
  }
  S.outline({ k: 0.5 });
  return S;
}

// ------------------------------------------------------------------ icons (18x18)
const ICON = 18;
function iconSprite(fn) { const S = new Sprite(ICON, ICON); fn(S, () => new Mask(ICON, ICON)); S.outline({ k: 0.45 }); return S; }
const blade = ['#ffffff', '#d7e3ef', '#8fa3bd', '#56607e'];
const fire = ['#fff6a8', '#ffb347', '#ff6a2a', '#a8261f'];
const ice = ['#ffffff', '#b8f2ff', '#5ac8f0', '#2a6aa8'];
const green = ['#e8ffb8', '#9ce05a', '#4aa83a', '#24603a'];
const holy = ['#ffffff', '#fff2a8', '#f2c14e', '#b8762f'];
const violet = ['#f2dcff', '#c08aff', '#7a4ad8', '#40287a'];
const ICONS = {
  attack: (S, m) => { S.stamp(m().poly([[3, 14], [13, 3], [15, 4], [5, 15]]), blade, { r: 1 }); S.stamp(m().capsule(3, 11, 7, 15, 1), P.gold, { r: 1 }); S.stamp(m().capsule(2, 15, 3, 16, 1), P.leather, { r: 1 }); },
  defend: (S, m) => { S.stamp(m().poly([[3, 3], [15, 3], [15, 9], [9, 16], [3, 9]]), R('#3f7ad8'), { r: 2 }); S.stamp(m().poly([[3, 3], [15, 3], [15, 9], [9, 16], [3, 9]]).sub(m().poly([[5, 5], [13, 5], [13, 9], [9, 13.5], [5, 9]])), P.gold, { r: 1, sel: false }); S.dots([[9, 6], [8, 8], [9, 8], [10, 8], [9, 10]], '#fff2a8'); },
  sword_heavy: (S, m) => { S.stamp(m().poly([[2, 14], [12, 2], [16, 3], [5, 16]]), blade, { r: 1 }); S.stamp(m().capsule(2, 10, 8, 16, 1.2), fire, { r: 1 }); S.dots([[14, 1], [16, 6], [11, 1]], '#ffb347'); },
  shield_wall: (S, m) => { S.stamp(m().poly([[1, 4], [9, 4], [9, 9], [5, 14], [1, 9]]), R('#3f7ad8'), { r: 1 }); S.stamp(m().poly([[8, 3], [17, 3], [17, 9], [12.5, 15], [8, 9]]), R('#5aa8ff'), { r: 1 }); S.stamp(m().rect(0, 15, 18, 2), P.gold, { r: 1 }); },
  fireball: (S, m) => { S.stamp(m().circle(11, 11, 5.5).poly([[7, 7], [1, 2], [9, 6]]).poly([[8, 13], [2, 11], [8, 10]]), fire, { r: 2 }); S.stamp(m().circle(11.5, 10.5, 2.4), ['#ffffff', '#fff6a8', '#ffd25a', '#ffb347'], { r: 1, sel: false }); },
  ice_shard: (S, m) => { S.stamp(m().poly([[2, 16], [12, 3], [16, 2], [15, 6], [4, 17]]), ice, { r: 1 }); S.line(5, 14, 13, 4, '#ffffff'); },
  poison_arrow: (S, m) => { S.line(2, 16, 14, 4, '#c99a62'); S.stamp(m().poly([[12, 2], [17, 1], [16, 6]]), blade, { r: 1 }); S.dots([[2, 13], [5, 16], [3, 14]], '#f2f0ff'); S.stamp(m().circle(5, 6, 2.4).poly([[5, 2], [3.5, 5], [6.5, 5]]), green, { r: 1 }); },
  volley: (S, m) => { for (const o of [0, 4, 8]) { S.line(1 + o, 16, 9 + o, 2, '#c99a62'); S.dots([[9 + o, 2], [10 + o, 1], [8 + o, 1]], '#d7e3ef'); } },
  heal: (S, m) => { S.stamp(m().rect(7, 2, 4, 14).rect(2, 7, 14, 4), ['#ffffff', '#9dffb0', '#3fc86a', '#1f7a4a'], { r: 1 }); },
  blessing: (S, m) => { S.stamp(m().circle(9, 9, 6).sub(m().circle(9, 9, 3.5)), holy, { r: 1 }); for (let k = 0; k < 8; k++) { const p = limb(9, 9, k * 45, 8); S.dot(p[0], p[1], '#fff2a8'); } S.stamp(m().circle(9, 9, 2), ['#ffffff', '#ffffff', '#fff2a8', '#f2c14e'], { r: 1, sel: false }); },
  whirlwind: (S, m) => { for (let r = 2; r < 8; r += 2) S.stamp(m().circle(9, 9, r + 1).sub(m().circle(9, 9, r)).sub(m().rect(9, 0, 9, 9 - r)), ['#ffffff', '#d0f0ff', '#8ac8e8', '#4a8ab8'], { r: 1, sel: false }); S.stamp(m().poly([[2, 14], [12, 4], [14, 5], [4, 16]]), blade, { r: 1 }); },
  taunt: (S, m) => { S.stamp(m().poly([[3, 3], [15, 3], [15, 9], [9, 16], [3, 9]]), P.gold, { r: 2 }); S.dots([[7, 6], [7, 7], [11, 6], [11, 7]], '#4a2a1a'); S.hline(6, 12, 11, '#4a2a1a'); S.dots([[6, 10], [12, 10]], '#4a2a1a'); },
  lightning: (S, m) => { S.stamp(m().poly([[11, 1], [4, 10], [8, 10], [6, 17], [14, 7], [10, 7], [13, 1]]), ['#ffffff', '#fff27a', '#f2c14e', '#a8762f'], { r: 1 }); },
  sanctuary: (S, m) => { S.stamp(m().poly([[9, 1], [17, 8], [15, 8], [15, 16], [3, 16], [3, 8], [1, 8]]), holy, { r: 2 }); S.stamp(m().rect(8, 9, 2, 6).rect(6, 11, 6, 2), ['#ffffff', '#9dffb0', '#3fc86a', '#1f7a4a'], { r: 1, sel: false }); },
  dagger: (S, m) => { S.stamp(m().poly([[4, 13], [13, 2], [15, 3], [6, 15]]), violet, { r: 1 }); S.stamp(m().capsule(3, 11, 7, 15, 1), P.iron, { r: 1 }); S.dots([[14, 7], [10, 2], [16, 1]], '#c08aff'); },
  battle_cry: (S, m) => { S.stamp(m().poly([[2, 7], [7, 7], [14, 2], [14, 16], [7, 11], [2, 11]]), R('#ff8a5a'), { r: 1 }); S.dots([[16, 5], [17, 9], [16, 13]], '#ffffff'); },
  frost_nova: (S, m) => { for (let k = 0; k < 6; k++) { const p = limb(9, 9, k * 60, 8); S.stamp(m().capsule(9, 9, p[0], p[1], 1.2, 0.6), ice, { r: 1 }); } S.stamp(m().circle(9, 9, 2.6), ice, { r: 1 }); },
  meteor: (S, m) => { S.stamp(m().circle(12, 12, 4.8), R('#6a4a3a'), { r: 2 }); S.stamp(m().poly([[9, 8], [1, 1], [4, 1], [11, 7]]).poly([[8, 11], [0, 6], [2, 4], [9, 9]]), fire, { r: 1 }); S.dots([[11, 11], [13, 13]], '#ffb347'); },
  phoenix: (S, m) => { S.stamp(m().poly([[9, 2], [12, 8], [17, 6], [12, 13], [9, 17], [6, 13], [1, 6], [6, 8]]), fire, { r: 2 }); S.dot(9, 9, '#ffffff'); },
  venom_storm: (S, m) => { S.stamp(m().circle(6, 11, 4).circle(12, 7, 4.5).circle(12, 13, 3.4), green, { r: 2 }); S.dots([[5, 10], [11, 6], [12, 12]], '#ffffff'); },
  starfall: (S, m) => { const star = (x, y, r) => S.stamp(m().poly([[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]]), holy, { r: 1 }); star(11, 7, 6); star(4, 13, 3.5); S.dots([[15, 15], [2, 3]], '#ffffff'); },
  aegis: (S, m) => { S.stamp(m().poly([[9, 1], [16, 4], [15, 11], [9, 17], [3, 11], [2, 4]]), holy, { r: 2 }); S.stamp(m().poly([[9, 4], [13, 6], [12.5, 10.5], [9, 14], [5.5, 10.5], [5, 6]]), R('#3f7ad8'), { r: 1, sel: false }); S.dot(9, 8, '#ffffff'); },
  dragon: (S, m) => { S.stamp(m().poly([[1, 9], [9, 3], [17, 4], [13, 8], [17, 11], [9, 12], [5, 16]]), R('#c83a2f'), { r: 2 }); S.dots([[11, 6]], '#fff27a'); S.stamp(m().poly([[13, 4], [16, 0], [15, 5]]), P.bone, { r: 1 }); },
  focus: (S, m) => { S.stamp(m().poly([[9, 1], [11, 7], [17, 9], [11, 11], [9, 17], [7, 11], [1, 9], [7, 7]]), ['#ffffff', '#b8f2ff', '#7a8aff', '#3a3fa8'], { r: 1 }); },
  rise: (S, m) => { S.stamp(m().poly([[9, 1], [15, 9], [11, 9], [11, 16], [7, 16], [7, 9], [3, 9]]), holy, { r: 1 }); },
  gold: (S, m) => { S.stamp(m().circle(9, 9, 6.5), P.gold, { r: 2 }); S.stamp(m().circle(9, 9, 6.5).sub(m().circle(9, 9, 5)), P.gold.map(c => shift(c, -0.1)), { r: 1, sel: false }); S.vline(9, 5, 13, '#a8622a'); },
  heart: (S, m) => { S.stamp(m().circle(6, 7, 4).circle(12, 7, 4).poly([[2, 8], [16, 8], [9, 16]]), R('#e0414f'), { r: 2 }); S.dot(5, 5, '#ffffff'); }
};

// ---- icons for the class skill pools and the items (same 18x18 style)
const steel = P.steel, earth = R('#9a6a3a'), teal = ['#e8fff8', '#a8ffe0', '#3fc8a0', '#1f6a6a'], red = R('#d8343f'), energyY = ['#fffbe0', '#ffe27a', '#e0a82a', '#8a5a1a'];
const arrowIcon = (S, m, x1, y1, x2, y2, head = blade, shaft = '#c99a62') => {
  S.line(x1, y1, x2, y2, shaft);
  const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
  S.stamp(m().poly([[x2 + c * 2, y2 + s * 2], [x2 - c * 3 - s * 2.4, y2 - s * 3 + c * 2.4], [x2 - c * 3 + s * 2.4, y2 - s * 3 - c * 2.4]]), head, { r: 1 });
  S.dots([[x1 - s, y1 + c], [x1 + s, y1 - c]], '#f2f0ff');
};
const shieldShape = (m, x, y, w, h) => m().poly([[x, y], [x + w, y], [x + w, y + h * 0.55], [x + w / 2, y + h], [x, y + h * 0.55]]);
const starPts = (x, y, r, k = 0.38) => { const pts = []; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r * k : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } return pts; };
const flameShape = (m, cx, cy, r) => m().circle(cx, cy + r * 0.3, r * 0.8).poly([[cx - r * 0.8, cy + r * 0.2], [cx, cy - r * 1.4], [cx + r * 0.8, cy + r * 0.2]]);
Object.assign(ICONS, {
  // knight
  shield_bash: (S, m) => { S.stamp(shieldShape(m, 1, 3, 9, 12), R('#3f7ad8'), { r: 2 }); S.stamp(m().poly(starPts(13.5, 8, 4.5)), ['#ffffff', '#fff2a8', '#ffb347', '#a8622a'], { r: 1 }); S.dots([[11, 3], [16, 13], [12, 15]], '#ffe27a'); },
  cleave: (S, m) => { S.stamp(m().circle(9, 10, 8).sub(m().circle(9, 12, 7)).and(m().rect(0, 0, 18, 11)), ['#ffffff', '#ffd0a0', '#ff8a4a', '#a8402a'], { r: 1 }); S.stamp(m().poly([[4, 16], [12, 6], [14, 7], [6, 17]]), blade, { r: 1 }); },
  iron_skin: (S, m) => { S.stamp(m().poly([[3, 3], [7, 2], [9, 4], [11, 2], [15, 3], [16, 8], [13, 16], [5, 16], [2, 8]]), steel, { r: 2 }); S.dots([[5, 6], [13, 6], [6, 12], [12, 12]], '#434a69'); S.vline(9, 6, 14, '#6f7f99'); },
  rally: (S, m) => { S.vline(3, 1, 17, '#8f5a3a'); S.vline(4, 1, 17, '#643a2c'); S.stamp(m().poly([[5, 2], [16, 3], [13, 6.5], [16, 10], [5, 10]]), red, { r: 1 }); S.stamp(m().rect(5, 2, 11, 1.5), P.gold, { r: 1, sel: false }); S.dots([[9, 5], [10, 6], [9, 7], [8, 6]], '#fff2a8'); },
  pommel: (S, m) => { S.stamp(m().poly([[8, 9], [15, 2], [16, 3], [9, 10]]), blade, { r: 1 }); S.stamp(m().capsule(5, 9, 10, 14, 1), P.gold, { r: 1 }); S.stamp(m().circle(5, 13, 3.4), P.gold, { r: 1 }); S.dots([[1, 13], [2, 16], [5, 17], [1, 10]], '#ffffff'); },
  sunder: (S, m) => { S.stamp(shieldShape(m, 2, 2, 14, 15).sub(m().poly([[8, 0], [10, 0], [8, 7], [11, 10], [8, 18], [7, 18], [9, 10], [6, 7]])), R('#7a7f99'), { r: 2 }); S.dots([[16, 1], [17, 4], [15, 16], [1, 16]], '#ff9a7a'); },
  shield_slam: (S, m) => { for (let k = 0; k < 8; k++) { const p = limb(9, 9, k * 45 + 22, 8.5); S.line(9, 9, p[0], p[1], '#ffb347'); } S.stamp(shieldShape(m, 4, 3, 10, 13), R('#5aa8ff'), { r: 2 }); S.stamp(m().circle(9, 8, 1.6), P.gold, { r: 1, sel: false }); },
  riposte: (S, m) => { S.stamp(m().poly([[2, 15], [14, 2], [16, 3], [4, 16]]), blade, { r: 1 }); S.stamp(m().poly([[16, 15], [4, 2], [2, 3], [14, 16]]), blade, { r: 1 }); S.stamp(m().poly(starPts(9, 9, 4)), ['#ffffff', '#fff2a8', '#ffd25a', '#c4822f'], { r: 1, sel: false }); },
  unbreakable: (S, m) => { S.stamp(shieldShape(m, 2, 1, 14, 16), holy, { r: 2 }); S.stamp(m().circle(7, 7.5, 2.3).circle(11, 7.5, 2.3).poly([[4.8, 8.4], [13.2, 8.4], [9, 13]]), R('#e0414f'), { r: 1, sel: false }); S.dot(6, 6, '#ffffff'); },
  earthshatter: (S, m) => { S.stamp(m().rect(0, 13, 18, 5), earth, { r: 1 }); S.stamp(m().poly([[2, 13], [5, 5], [7, 13]]).poly([[7, 13], [10, 1], [13, 13]]).poly([[12, 13], [15, 7], [17, 13]]), R('#a89a8a'), { r: 1 }); S.line(3, 15, 9, 17, '#2a1a10'); S.line(11, 14, 16, 16, '#2a1a10'); },
  combo: (S, m) => { for (const [o, c] of [[0, '#ffffff'], [4, '#d7e3ef'], [8, '#d7e3ef']]) S.line(1 + o, 7 - o * 0.4, 6 + o, 1 - o * 0.4 + 0.5, c); S.stamp(m().poly([[3, 17], [15, 5], [17, 6], [5, 18]]), fire, { r: 1 }); S.dots([[12, 3], [16, 9], [9, 6]], '#ffb347'); },
  // mage
  missiles: (S, m) => { for (const [x, y] of [[13, 4], [14, 10], [9, 14]]) { S.line(x - 7, y + 3, x, y, '#7a6aff'); S.stamp(m().circle(x, y, 2.3), violet, { r: 1 }); S.dot(x, y - 1, '#ffffff'); } },
  spark: (S, m) => { S.stamp(m().poly(starPts(9, 9, 8, 0.28)), ['#ffffff', '#fff27a', '#f2c14e', '#a8762f'], { r: 1 }); S.dots([[3, 3], [15, 15], [15, 3]], '#fff27a'); },
  frost_armour: (S, m) => { S.stamp(shieldShape(m, 2, 2, 14, 15), ice, { r: 2 }); S.line(9, 4, 9, 13, '#ffffff'); S.line(5, 6, 13, 11, '#ffffff'); S.line(13, 6, 5, 11, '#ffffff'); },
  kindle: (S, m) => { S.stamp(m().capsule(3, 14, 15, 14, 2), P.wood, { r: 1 }); S.stamp(flameShape(m, 9, 7, 4.5), fire, { r: 2 }); S.stamp(flameShape(m, 9, 9, 2), ['#ffffff', '#fff6a8', '#ffd25a', '#ffb347'], { r: 1, sel: false }); },
  flame_wave: (S, m) => { const pts = [[0, 17]]; for (let x = 0; x <= 18; x += 2) pts.push([x, 9 + Math.sin(x * 0.7) * 3 - (x % 4 ? 2 : 0)]); pts.push([18, 17]); S.stamp(m().poly(pts), fire, { r: 2 }); S.dots([[4, 5], [10, 3], [15, 5]], '#ffb347'); },
  frostbite: (S, m) => { for (const x of [3, 8, 13]) S.stamp(m().poly([[x, 0], [x + 4, 0], [x + 2, 8]]), ice, { r: 1 }); for (const x of [5, 10]) S.stamp(m().poly([[x, 18], [x + 4, 18], [x + 2, 10]]), ice, { r: 1 }); },
  mana_surge: (S, m) => { S.stamp(m().circle(9, 9, 7).sub(m().circle(9, 9, 5)).sub(m().rect(9, 0, 9, 7)), ['#ffffff', '#9fd8ff', '#3a8ad8', '#1a3a7a'], { r: 1 }); S.stamp(m().poly([[9, 3], [13, 7], [10.5, 7], [10.5, 12], [7.5, 12], [7.5, 7], [5, 7]]), ['#ffffff', '#cfe8ff', '#7ab8ff', '#3a6ad8'], { r: 1 }); },
  combust: (S, m) => { S.stamp(m().poly(starPts(9, 9, 8.5, 0.5)), fire, { r: 2 }); S.stamp(m().circle(9, 9, 3), ['#ffffff', '#fff6a8', '#ffd25a', '#ffb347'], { r: 1, sel: false }); },
  blizzard: (S, m) => { S.stamp(m().circle(6, 6, 4).circle(11, 5, 4.5).circle(14, 8, 3).rect(4, 6, 12, 4), ['#ffffff', '#e8f4ff', '#a8c8e8', '#5a7aa8'], { r: 2 }); S.dots([[4, 13], [8, 15], [12, 13], [15, 16], [6, 17], [10, 12]], '#bff6ff'); },
  time_stop: (S, m) => { S.stamp(m().rect(3, 1, 12, 2).rect(3, 15, 12, 2), P.gold, { r: 1 }); S.stamp(m().poly([[4, 3], [14, 3], [10, 9], [14, 15], [4, 15], [8, 9]]), ['#ffffff', '#e8f4ff', '#a8c8e8', '#5a7aa8'], { r: 1 }); S.stamp(m().poly([[6, 15], [12, 15], [9, 11]]).poly([[6, 4], [12, 4], [9, 7]]), ice, { r: 1, sel: false }); },
  // ranger
  aimed_shot: (S, m) => { S.stamp(m().circle(9, 9, 7).sub(m().circle(9, 9, 5.6)), R('#e0414f'), { r: 1 }); S.hline(1, 6, 9, '#e0414f'); S.hline(12, 17, 9, '#e0414f'); S.vline(9, 1, 6, '#e0414f'); S.vline(9, 12, 17, '#e0414f'); S.dot(9, 9, '#ffffff'); },
  twin_shot: (S, m) => { arrowIcon(S, m, 1, 9, 15, 2); arrowIcon(S, m, 3, 16, 17, 9); },
  mark: (S, m) => { S.stamp(m().circle(9, 9, 8), R('#e0414f'), { r: 2 }); S.stamp(m().circle(9, 9, 5.5), P.white, { r: 1, sel: false }); S.stamp(m().circle(9, 9, 3), R('#e0414f'), { r: 1, sel: false }); S.dot(9, 9, '#ffffff'); },
  smoke: (S, m) => { S.stamp(m().circle(6, 11, 4.5).circle(11, 8, 5).circle(13, 13, 4).circle(5, 5, 2.5), ['#ffffff', '#d8d4e8', '#9a96b0', '#5a5670'], { r: 2 }); S.stamp(m().circle(14, 3, 2.4), R('#3a3a4a'), { r: 1 }); S.dot(15, 1, '#ffb347'); },
  fire_arrow: (S, m) => { arrowIcon(S, m, 2, 16, 13, 5, fire); S.stamp(flameShape(m, 14, 4, 2.6), fire, { r: 1, sel: false }); S.dots([[16, 7], [11, 2]], '#ffd25a'); },
  crippling: (S, m) => { arrowIcon(S, m, 2, 16, 15, 3); S.dots([[13, 8], [13, 10], [12, 12], [16, 7], [16, 10]], '#c08aff'); },
  pinning: (S, m) => { S.stamp(m().rect(0, 14, 18, 4), earth, { r: 1 }); arrowIcon(S, m, 9, 1, 9, 13); for (const [x, y] of [[3, 8], [15, 8]]) S.stamp(m().poly(starPts(x, y, 2.6)), holy, { r: 1 }); },
  arrow_rain: (S, m) => { for (const [x, y] of [[3, 2], [8, 6], [13, 1], [5, 10], [11, 11], [16, 8]]) { S.vline(x, y, y + 4, '#c99a62'); S.dots([[x, y + 5], [x - 1, y + 4], [x + 1, y + 4]], '#d7e3ef'); } },
  ricochet: (S, m) => { S.line(1, 4, 6, 15, '#fff2c0'); S.line(6, 15, 11, 4, '#fff2c0'); arrowIcon(S, m, 11, 4, 16, 14, blade, '#fff2c0'); S.dots([[6, 16], [11, 3]], '#ffe27a'); },
  phantom: (S, m) => { arrowIcon(S, m, 1, 12, 14, 2, teal, '#7affd8'); arrowIcon(S, m, 3, 17, 17, 8, teal, '#7affd8'); S.dots([[4, 5], [9, 16], [16, 15]], '#c8fff0'); },
  deadeye: (S, m) => { S.stamp(m().ellipse(9, 9, 8, 4.6), P.white, { r: 2 }); S.stamp(m().circle(9, 9, 3.4), R('#e0414f'), { r: 1, sel: false }); S.stamp(m().circle(9, 9, 1.5), ['#1a1020', '#1a1020', '#1a1020', '#1a1020'], { r: 1, sel: false }); S.dot(8, 8, '#ffffff'); S.vline(9, 0, 3, '#e0414f'); S.vline(9, 15, 17, '#e0414f'); },
  // cleric
  holy_smite: (S, m) => { S.stamp(m().capsule(3, 16, 9, 9, 1), P.wood, { r: 1 }); S.stamp(m().circle(11, 7, 4.5), holy, { r: 2 }); S.dots([[11, 1], [17, 7], [15, 2], [16, 12]], '#fff2a8'); },
  purify: (S, m) => { S.stamp(m().circle(9, 11, 5.5).poly([[3.8, 10], [9, 1], [14.2, 10]]), ['#ffffff', '#d8fff0', '#7ad8c8', '#2a7a8a'], { r: 2 }); S.dots([[7, 9], [7, 10], [8, 8]], '#ffffff'); S.dots([[15, 2], [16, 3], [15, 4], [14, 3]], '#ffffff'); },
  ward: (S, m) => { S.stamp(m().circle(9, 9, 8.5).sub(m().circle(9, 9, 7.3)), holy, { r: 1, sel: false }); S.stamp(shieldShape(m, 5, 4, 8, 10), holy, { r: 2 }); S.dot(9, 7, '#ffffff'); },
  mending: (S, m) => { S.stamp(m().circle(6, 7, 4).circle(12, 7, 4).poly([[2, 8], [16, 8], [9, 16]]), R('#3fc86a'), { r: 2 }); S.stamp(m().rect(8, 5, 2, 6).rect(6, 7, 6, 2), P.white, { r: 1, sel: false }); },
  radiance: (S, m) => { for (let k = 0; k < 8; k++) { const p = limb(9, 9, k * 45, 8.5); S.line(9, 9, p[0], p[1], '#ffe27a'); } S.stamp(m().circle(9, 9, 4.5), holy, { r: 2 }); },
  empower: (S, m) => { S.stamp(m().poly([[9, 1], [16, 9], [12, 9], [12, 17], [6, 17], [6, 9], [2, 9]]), R('#ff7a5a'), { r: 1 }); S.dots([[2, 3], [16, 3], [1, 14], [17, 15]], '#fff2a8'); },
  judgement: (S, m) => { S.vline(9, 2, 16, '#c4822f'); S.hline(3, 15, 4, '#f2c14e'); S.stamp(m().rect(6, 15, 7, 2), P.gold, { r: 1 }); for (const x of [4, 14]) { S.line(x, 4, x - 2, 10, '#c4822f'); S.line(x, 4, x + 2, 10, '#c4822f'); S.stamp(m().ellipse(x, 10.5, 3, 1.4), P.gold, { r: 1 }); } S.stamp(m().circle(9, 2, 1.5), holy, { r: 1 }); },
  renewal: (S, m) => { S.line(9, 17, 9, 8, '#4aa83a'); S.stamp(m().ellipse(5, 7, 4.5, 2.6, 1, -0.5).ellipse(13, 5, 4.5, 2.6, 1, 0.5), green, { r: 1 }); S.dots([[3, 13], [15, 12], [14, 15]], '#b6ffcf'); },
  sacred_flame: (S, m) => { S.stamp(flameShape(m, 9, 9, 6.5), holy, { r: 2 }); S.stamp(flameShape(m, 9, 12, 2.6), ['#ffffff', '#ffffff', '#fff6c8', '#fff2a8'], { r: 1, sel: false }); },
  resurrection: (S, m) => { S.stamp(m().ellipse(9, 5, 4, 4.5).sub(m().ellipse(9, 5.5, 2, 2.6)).rect(2, 8, 14, 3).rect(7.5, 9, 3, 9), holy, { r: 1 }); S.dots([[1, 2], [17, 3], [16, 15], [2, 15]], '#fff6c8'); },
  divine_shield: (S, m) => { S.stamp(m().circle(9, 12, 8.5).sub(m().circle(9, 12, 7)).and(m().rect(0, 0, 18, 15)), ['#ffffff', '#fff6c8', '#ffe27a', '#c4822f'], { r: 1, sel: false }); S.stamp(m().rect(0, 14, 18, 2), P.gold, { r: 1 }); S.stamp(m().circle(9, 10, 2.2).rect(7.5, 11, 3, 3), P.white, { r: 1, sel: false }); S.dots([[4, 6], [14, 5]], '#ffffff'); },
  wrath: (S, m) => { S.stamp(m().rect(6, 0, 6, 15), ['#ffffff', '#fff6c8', '#ffe27a', '#e0a82a'], { r: 2 }); S.stamp(m().ellipse(9, 15, 8, 2.6), holy, { r: 1 }); S.vline(9, 0, 13, '#ffffff'); S.dots([[2, 11], [16, 10], [3, 6], [15, 4]], '#fff2a8'); },
  // items
  lucky_coin: (S, m) => { S.stamp(m().circle(9, 9, 7), P.gold, { r: 2 }); S.stamp(m().circle(9, 7, 1.8).circle(7, 9.5, 1.8).circle(11, 9.5, 1.8), green, { r: 1, sel: false }); S.vline(9, 10, 13, '#24603a'); },
  whetstone: (S, m) => { S.stamp(m().poly([[1, 11], [13, 5], [17, 8], [5, 15]]), R('#8a8fa6'), { r: 2 }); S.line(4, 11, 13, 7, '#e8eef6'); S.dots([[15, 2], [16, 4], [13, 1]], '#ffffff'); },
  energy_crystal: (S, m) => { S.stamp(m().poly([[9, 1], [14, 6], [12, 16], [6, 16], [4, 6]]), energyY, { r: 1 }); S.line(9, 2, 9, 15, '#fffbe0'); S.dots([[16, 3], [2, 12]], '#ffe27a'); },
  boots: (S, m) => { S.stamp(m().poly([[5, 1], [11, 1], [11, 11], [16, 13], [16, 17], [4, 17], [4, 11]]), P.leather, { r: 2 }); S.stamp(m().rect(4, 15, 13, 2), R('#3e2732'), { r: 1, sel: false }); S.hline(5, 10, 3, '#c98d5a'); },
  chalk: (S, m) => { S.stamp(m().poly([[3, 13], [12, 4], [15, 7], [6, 16]]), P.white, { r: 1 }); S.dots([[2, 16], [1, 13], [4, 17], [16, 2], [14, 1]], '#e4e2f0'); },
  bandage: (S, m) => { S.stamp(m().ellipse(8, 9, 6, 6), ['#ffffff', '#f2ece0', '#d8cdb8', '#9a8a70'], { r: 2 }); S.stamp(m().circle(8, 9, 2), R('#c8b89a'), { r: 1, sel: false }); S.stamp(m().rect(13, 10, 5, 4), ['#ffffff', '#f2ece0', '#d8cdb8', '#9a8a70'], { r: 1 }); S.dots([[15, 11], [16, 12]], '#e0414f'); },
  thorned_mail: (S, m) => { const sp = [[1, 4, 4, 6], [17, 4, 14, 6], [0, 11, 4, 11], [18, 11, 14, 11], [9, 0, 9, 4], [4, 17, 6, 14], [14, 17, 12, 14]]; for (const [x, y, bx, by] of sp) { const dx = by - y, dy = x - bx, l = Math.hypot(dx, dy) || 1; S.stamp(m().poly([[x, y], [bx + dx / l * 2, by + dy / l * 2], [bx - dx / l * 2, by - dy / l * 2]]), R('#9aa0b8'), { r: 1 }); } S.stamp(m().poly([[4, 4], [14, 4], [15, 9], [12, 15], [6, 15], [3, 9]]), steel, { r: 2 }); S.dots([[7, 7], [11, 7], [9, 11]], '#434a69'); },
  focus_lens: (S, m) => { S.stamp(m().capsule(11, 11, 16, 16, 1.4), P.wood, { r: 1 }); S.stamp(m().circle(7, 7, 6), P.gold, { r: 1 }); S.stamp(m().circle(7, 7, 4.4), ['#ffffff', '#b8f2ff', '#7a8aff', '#3a3fa8'], { r: 2, sel: false }); S.dots([[5, 5], [6, 4]], '#ffffff'); },
  satchel: (S, m) => { S.stamp(m().circle(9, 4, 4).sub(m().circle(9, 4, 2.6)).and(m().rect(0, 0, 18, 5)), P.leather, { r: 1 }); S.stamp(m().rect(2, 5, 14, 11), P.leather, { r: 2 }); S.stamp(m().rect(8, 7, 2, 7).rect(6, 9.5, 6, 2), ['#ffffff', '#9dffb0', '#3fc86a', '#1f7a4a'], { r: 1, sel: false }); },
  fang: (S, m) => { S.stamp(m().poly([[4, 2], [14, 2], [13, 6], [10, 17], [8, 11], [5, 6]]), P.bone, { r: 2 }); S.dots([[10, 15], [9, 16]], '#e0414f'); S.vline(9, 3, 9, '#fffbe8'); },
  potion: (S, m) => { S.stamp(m().rect(7, 1, 4, 4), P.wood, { r: 1 }); S.stamp(m().circle(9, 11, 6).rect(7, 4, 4, 4), ['#ffffff', '#d8e4f2', '#9aaac8', '#5a6a8a'], { r: 2 }); S.stamp(m().circle(9, 11.5, 4.5).and(m().rect(0, 9, 18, 9)), R('#e0414f'), { r: 1, sel: false }); S.dots([[6, 9], [7, 8]], '#ffffff'); },
  belt: (S, m) => { S.stamp(m().rect(0, 6, 18, 6), P.leather, { r: 1 }); S.stamp(m().rect(6, 4, 7, 10).sub(m().rect(8, 6, 3, 6)), P.gold, { r: 1 }); S.hline(9, 13, 9, '#c4822f'); },
  plume: (S, m) => { S.stamp(m().poly([[3, 17], [6, 9], [11, 2], [16, 1], [14, 7], [9, 13]]), fire, { r: 2 }); S.line(3, 17, 14, 3, '#fff6a8'); S.dots([[16, 4], [12, 1]], '#ffd25a'); },
  crown: (S, m) => { S.stamp(m().poly([[1, 6], [5, 10], [9, 3], [13, 10], [17, 6], [15, 15], [3, 15]]), P.gold, { r: 2 }); S.dots([[9, 10]], '#e0414f'); S.dots([[5, 12], [13, 12]], '#5aa8ff'); S.dots([[1, 5], [9, 2], [17, 5]], '#ffffff'); },
  pencil: (S, m) => { S.stamp(m().poly([[13, 1], [17, 5], [7, 15], [3, 11]]), energyY, { r: 1 }); S.stamp(m().poly([[13, 1], [17, 5], [15.5, 6.5], [11.5, 2.5]]), R('#ff8ab0'), { r: 1, sel: false }); S.stamp(m().poly([[3, 11], [7, 15], [1, 17]]), ['#ffe8c8', '#e8c8a0', '#c8a070', '#8a6a4a'], { r: 1, sel: false }); S.dot(1, 17, '#2a2030'); }
});

// ------------------------------------------------------------------ cache & public API
const cache = new Map();
function cached(key, make) { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); }

// Optional hand-made art. If /art/manifest.json exists, its sprite sheets replace the
// generated frames for the characters it lists. See README "Replacing the art".
//   { "heroes": { "knight": { "sheet": "knight.png", "frame": [84, 76], "variants": 1,
//       "poses": { "idle0": [col, row], "idle1": [1, 0], ... } } },
//     "enemies": { "slime": { "sheet": "slime.png", "frame": [64, 52], "poses": { ... } } } }
// Frames must use the same size and foot anchor as the generated ones (heroes 84x76, feet at 46,72).
// "portrait": [x, y, w, h] picks the face out of the idle0 frame for HUD portraits.
// The knight ships this way: public/art/knight.png is built by tools/build_knight.py.
const artPortrait = {};
const artPoses = new Set();
const artAnims = {};
// heroAnim(skin, 'slash') -> { frames[variant][i], whites, ax, ay, timeline: [[frame, ms], ...], hit, trail } or null
export function heroAnim(skin, name) { const a = artAnims[skinKey(skin)]; return (a && a[name]) || null; }
// Hero art is keyed by skin = 'class:gender' (e.g. 'mage:f'). A bare class means the boy version.
export const skinKey = k => (k && k.includes(':')) ? k : (k || 'knight') + ':m';
const baseCls = k => skinKey(k).split(':')[0];
export function hasPose(cls, pose) { return artPoses.has(skinKey(cls) + ':' + pose); }
async function loadArtOverrides() {
  let man;
  try { const r = await fetch('/art/manifest.json', { cache: 'no-cache' }); if (!r.ok) return 0; man = await r.json(); } catch (e) { return 0; }
  const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/art/' + src; });
  let n = 0;
  const crop = (im, fw, fh, col, row) => { const c = document.createElement('canvas'); c.width = fw; c.height = fh; c.getContext('2d').drawImage(im, col * fw, row * fh, fw, fh, 0, 0, fw, fh); return c; };
  const white = src => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); return c; };
  for (const [cls, d] of Object.entries(man.heroes || {})) {
    const im = await load(d.sheet); if (!im) continue;
    const [fw, fh] = d.frame || [SPRITE_W, SPRITE_H];
    if (d.portrait) artPortrait[cls] = d.portrait;
    for (let v = 0; v < 3; v++) for (const [pose, [c, r]] of Object.entries(d.poses || {})) {
      const row = r + (d.variants > 1 ? (v % d.variants) * (d.variantRows || 1) : 0);
      const fr = crop(im, fw, fh, c, row);
      cache.set(`h:${cls}:${v}:${pose}`, fr); cache.set(`hw:${cls}:${v}:${pose}`, white(fr)); n++; artPoses.add(cls + ':' + pose);
    }
  }
  // big one-off moves (e.g. the knight's slash): their own sheet, frame size and foot anchor
  // special-move sheets load in the background (they are only needed once a fight starts)
  for (const [skin, d] of Object.entries(man.heroes || {})) for (const [name, an] of Object.entries(d.anims || {})) load(an.sheet).then(im => {
    if (!im) return;
    const [fw, fh] = an.frame;
    const rows = an.variants || 1;
    const fr = [], wh = [];
    for (let v = 0; v < 3; v++) {
      fr.push([]); wh.push([]);
      for (let i = 0; i < an.frames; i++) { const c = crop(im, fw, fh, i, v % rows); fr[v].push(c); wh[v].push(white(c)); }
    }
    (artAnims[skin] = artAnims[skin] || {})[name] = { ...an, frames: fr, whites: wh, ax: an.anchor[0], ay: an.anchor[1], timeline: an.timeline, hit: an.hit, trail: an.trail == null ? null : an.trail, dash: an.dash || 0, dashFrames: an.dashFrames || 4 };
  });
  for (const [kind, d] of Object.entries(man.enemies || {})) {
    const im = await load(d.sheet); if (!im) continue;
    const def = ENEMY_DEF[kind]; if (!def) continue;
    const [fw, fh] = d.frame || [def.w, def.h];
    if (d.anchor) { def.w = fw; def.h = fh; def.ax = d.anchor[0]; def.ay = d.anchor[1]; }   // PixelLab art brings its own frame size
    if (d.seqs) def.seqs = d.seqs;   // hand-animated move sequences (e.g. the minotaur's slam0..6, run0..7)
    for (const [pose, [c, r]] of Object.entries(d.poses || {})) {
      const fr = crop(im, fw, fh, c, r);
      cache.set(`e:${kind}:${pose}:0`, fr); cache.set(`e:${kind}:${pose}:1`, white(fr)); n++;
    }
  }
  return n;
}

export function heroFrame(skin, variant, poseName) {
  skin = skinKey(skin); const cls = baseCls(skin);
  return cached(`h:${skin}:${variant}:${poseName}`, () => {
    const look = (HERO_LOOKS[cls] || HERO_LOOKS.knight)[variant % 3];
    const s = drawHero(cls, look, getPose(cls, poseName));
    if (poseName === 'down') s.tint('#5a5470', 0.35);
    return s.toCanvas();
  });
}
export function heroWhite(skin, variant, poseName) {
  skin = skinKey(skin); const cls = baseCls(skin);
  return cached(`hw:${skin}:${variant}:${poseName}`, () => {
    const look = (HERO_LOOKS[cls] || HERO_LOOKS.knight)[variant % 3];
    return drawHero(cls, look, getPose(cls, poseName)).tint('#ffffff', 1).toCanvas();
  });
}
export function enemyFrame(kind, poseName, white) {
  return cached(`e:${kind}:${poseName}:${white ? 1 : 0}`, () => {
    const d = ENEMY_DEF[kind] || ENEMY_DEF.slime;
    if (d.base) return derivedFrame(d, d.poses[poseName] ? poseName : 'idle0', white);
    const ps = d.poses[poseName] || d.poses.idle0;
    const s = d.draw(ps);
    if (white) s.tint('#ffffff', 1);
    return s.toCanvas();
  });
}
export function enemySprite(kind, poseName) {
  const d = ENEMY_DEF[kind] || ENEMY_DEF.slime;
  return d.draw(d.poses[poseName] || d.poses.idle0);
}
export function chestFrame(rarity, open) { return cached(`c:${rarity}:${open ? 1 : 0}`, () => drawChest(rarity, open).toCanvas()); }
export function iconCanvas(name) { return cached(`i:${name}`, () => iconSprite(ICONS[name] || ICONS.focus).toCanvas()); }
export function iconURL(name, scale = 3) {
  return cached(`iu:${name}:${scale}`, () => {
    const src = iconCanvas(name);
    const c = document.createElement('canvas'); c.width = ICON * scale; c.height = ICON * scale;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  });
}
// Head-and-shoulders portrait for HUD panels.
export function portraitURL(skin, variant, mood = 'open', scale = 3) {
  skin = skinKey(skin); const cls = baseCls(skin);
  return cached(`p:${skin}:${variant}:${mood}:${scale}`, () => {
    if (artPortrait[skin]) {
      const [px, py, pw, ph] = artPortrait[skin];
      const c = document.createElement('canvas'); c.width = pw * scale; c.height = ph * scale;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      if (mood === 'closed') x.filter = 'grayscale(0.8) brightness(0.7)';
      x.drawImage(heroFrame(skin, variant, 'idle0'), px, py, pw, ph, 0, 0, c.width, c.height);
      return c.toDataURL();
    }
    const look = (HERO_LOOKS[cls] || HERO_LOOKS.knight)[variant % 3];
    const pz = { ...getPose(cls, 'idle0'), eyes: mood };
    const s = drawHero(cls, look, pz);
    const crop = { x: ANCHOR_X - 17, y: ANCHOR_Y - 57, w: 30, h: 30 };
    const c = document.createElement('canvas'); c.width = crop.w * scale; c.height = crop.h * scale;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(s.toCanvas(), crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    return c.toDataURL();
  });
}
export function heroFullURL(skin, variant, poseName = 'idle0', scale = 3) {
  skin = skinKey(skin);
  return cached(`hf:${skin}:${variant}:${poseName}:${scale}`, () => {
    const src = heroFrame(skin, variant, poseName);
    const c = document.createElement('canvas'); c.width = SPRITE_W * scale; c.height = SPRITE_H * scale;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  });
}
// A round badge for a boss on the tower map: head and shoulders cut from its idle frame, centred on the face and
// filling the circle. The crop is found from the sprite's own pixels, so new boss art lines up by itself.
// BADGE_FACE pins the crop for the current boss art: [face x, face y, crop size, frame width] in sprite pixels. It
// only applies while the art keeps that frame width; new art falls back to the automatic crop.
const BADGE_FACE = { minotaur: [85, 40, 64, 150], colossus: [94, 44, 70, 177], hollowking: [79, 38, 54, 154], voidmaw: [96, 42, 62, 176] };
export function bossBadgeURL(kind) {
  return cached(`bb:${kind}`, () => {
    const fr = enemyFrame(kind, 'idle0');
    const w = fr.width, hh = fr.height, d = fr.getContext('2d').getImageData(0, 0, w, hh).data;
    const op = (x, y) => d[(y * w + x) * 4 + 3] > 60;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (op(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return enemyPortraitURL(kind, 1);
    const pin = BADGE_FACE[kind] && BADGE_FACE[kind][3] === w ? BADGE_FACE[kind] : null;
    let side, cx, top;
    if (pin) { side = pin[2]; cx = pin[0]; top = Math.round(pin[1] - side / 2); }
    else {
      side = Math.max(16, Math.round(Math.min(x1 - x0 + 1, y1 - y0 + 1) * 0.6));   // head and shoulders
      // centre on the bulk of the top of the sprite (the head), not on raised weapons or wings at the edges
      const cols = new Array(w).fill(0);
      for (let y = y0; y < Math.min(hh, y0 + side); y++) for (let x = x0; x <= x1; x++) if (op(x, y)) cols[x]++;
      let best = x0, bestSum = -1; const win = Math.max(4, Math.round(side * 0.45));
      for (let x = x0; x <= x1 - win + 1; x++) { let sum = 0; for (let k = 0; k < win; k++) sum += cols[x + k]; if (sum > bestSum) { bestSum = sum; best = x; } }
      cx = best + win / 2; top = Math.round(y0 - side * 0.05);
    }
    const K = 4, px = side * K;   // drawn at 4x so the pixels stay crisp when the map scales it down
    const c = document.createElement('canvas'); c.width = c.height = px;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const g = x.createRadialGradient(px / 2, px / 2, px * 0.1, px / 2, px / 2, px / 2);
    g.addColorStop(0, '#6a3e28'); g.addColorStop(1, '#25130c');
    x.beginPath(); x.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); x.fillStyle = g; x.fill(); x.save(); x.clip();
    x.drawImage(fr, Math.round(cx - side / 2), top, side, side, 0, 0, px, px);
    x.restore();
    return c.toDataURL();
  });
}
export function enemyPortraitURL(kind, scale = 2) {
  return cached(`ep:${kind}:${scale}`, () => {
    const src = enemyFrame(kind, 'idle0');
    const c = document.createElement('canvas'); c.width = src.width * scale; c.height = src.height * scale;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL();
  });
}
export const ICON_NAMES = Object.keys(ICONS);
export const ENEMY_POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'hurt'];

// Hand-made art loads before anything draws: every module that imports this one waits for it.
export const artFrames = await loadArtOverrides();

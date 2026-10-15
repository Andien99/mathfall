// Procedural dungeon backdrops, painted at native pixel resolution.
import { Sprite, Mask, ramp, shift, col, rng } from './pixel.js';

export const THEMES = {
  halls: { wall: '#3d3650', wall2: '#332d45', mortar: '#15121d', floor: '#4b4258', floor2: '#3f3750', moss: '#3d4a3a', crystal: ['#fff6c8', '#ffc24a', '#e07a24', '#8a3a24'], crystalGlow: '#ffb347', torch: '#ff9a3c', door: '#ffcf7a', recess: '#0f0c18', back: '#2b2f5a', fog: [70, 64, 110] },
  crypt: { wall: '#34424a', wall2: '#2b373f', mortar: '#10161a', floor: '#3f4b4f', floor2: '#344044', moss: '#3a5a40', crystal: ['#e8ffff', '#7ff3ff', '#2fb0d0', '#1f5a7a'], crystalGlow: '#5ae0ff', torch: '#ff9a3c', door: '#9ff0ff', recess: '#0a1014', back: '#1f4a5a', fog: [60, 90, 100] },
  lair: { wall: '#4a3632', wall2: '#3c2b29', mortar: '#160d0e', floor: '#56403a', floor2: '#47332f', moss: '#4a3a2a', crystal: ['#fff6c8', '#ffc24a', '#e07a24', '#8a3a24'], crystalGlow: '#ffa040', torch: '#ff8a3c', door: '#ffb050', recess: '#140a0a', back: '#5a2a1f', fog: [110, 70, 60] }
};

function lerpHex(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function scaleC(c, k) {
  const r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255, a = c >>> 24;
  return ((a << 24) | (Math.min(255, b * k) << 16) | (Math.min(255, g * k) << 8) | Math.min(255, r * k)) >>> 0;
}

// Crystal cluster: returns light info
function crystalCluster(S, x, y, size, pal, R, light = [-0.8, -0.5]) {
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const h = size * (0.5 + R() * 0.7) * (i === 0 ? 1.3 : 1);
    const w = Math.max(2, h * 0.28);
    const tilt = (R() - 0.5) * 0.9 + (i - n / 2) * 0.25;
    const bx = x + (i - n / 2) * w * 1.1, by = y;
    const tx = bx + Math.sin(tilt) * h, ty = by - Math.cos(tilt) * h;
    const m = new Mask(S.w, S.h).poly([[bx - w, by], [bx + w, by], [tx + w * 0.25, ty + w * 0.6], [tx, ty], [tx - w * 0.25, ty + w * 0.6]]);
    S.stamp(m, pal, { r: 2, light, sel: true, selK: 0.6 });
    S.line(bx - w * 0.3, by - 1, tx - 0.3, ty + 2, pal[0]);
  }
  return { x, y: y - size * 0.6, r: size * 3.2 };
}

export function paintDungeon(W, H, theme = 'halls', seed = 7, floorTopFrac = 0.46) {
  const T = THEMES[theme] || THEMES.halls;
  const R = rng(seed * 9973 + W * 7 + H);
  const S = new Sprite(W, H);
  const F = new Sprite(W, H); // foreground
  const floorTop = Math.round(H * floorTopFrac);
  const lights = [];
  const torches = [];
  const crystals = [];

  // ---------------- back wall bricks
  const bw = 15, bh = 7;
  const wallC = [col(T.wall), col(T.wall2), col(shift(T.wall, 0.03)), col(shift(T.wall2, -0.03))];
  const mortar = col(T.mortar);
  for (let y = 0; y < floorTop; y++) for (let x = 0; x < W; x++) S.px[y * W + x] = mortar;
  for (let row = 0; row * (bh + 1) < floorTop; row++) {
    const y0 = row * (bh + 1);
    const off = (row % 2) * Math.floor(bw / 2) - 4;
    for (let bx = off; bx < W; bx += bw + 1) {
      const base = wallC[Math.floor(R() * wallC.length)];
      const chip = R();
      for (let y = y0; y < Math.min(y0 + bh, floorTop); y++) for (let x = Math.max(0, bx); x < Math.min(W, bx + bw); x++) {
        let c = base;
        if (y === y0) c = scaleC(base, 1.16);
        else if (y === y0 + bh - 1) c = scaleC(base, 0.78);
        else if (x === bx) c = scaleC(base, 1.07);
        else if (x === bx + bw - 1) c = scaleC(base, 0.86);
        if (R() < 0.05) c = scaleC(c, 0.88);
        S.px[y * W + x] = c;
      }
      if (chip < 0.12) { // crack
        let cx = bx + 3 + Math.floor(R() * (bw - 6)), cy = y0 + 1;
        for (let k = 0; k < bh - 2; k++) { S.set(cx, cy + k, scaleC(base, 0.6)); if (R() < 0.4) cx += R() < 0.5 ? -1 : 1; }
      }
      if (chip > 0.93) for (let k = 0; k < 4; k++) S.set(bx + 2 + Math.floor(R() * (bw - 4)), y0 + 1 + Math.floor(R() * (bh - 2)), scaleC(base, 0.7));
    }
  }
  // moss creeping up from the wall base
  for (let x = 0; x < W; x++) {
    const h = Math.floor((Math.sin(x * 0.07 + seed) * 0.5 + 0.5) * 10 * R() + R() * 3);
    for (let k = 0; k < h; k++) if (R() < 0.55 - k * 0.05) S.set(x, floorTop - 10 - k, col(shift(T.moss, -0.04 * (k % 2))));
  }

  // ---------------- arches & pillars
  const archXs = [];
  const nArch = Math.max(2, Math.round(W / 150));
  for (let i = 0; i < nArch; i++) archXs.push(Math.round((i + 0.5) * W / nArch));
  const archTop = Math.round(floorTop * 0.18);
  const doorIdx = Math.floor(nArch / 2) - (nArch % 2 ? 0 : 1);
  archXs.forEach((ax, i) => {
    const aw = Math.min(46, W / nArch * 0.42);
    const top = archTop + (i === doorIdx ? -4 : 6);
    const bottom = floorTop - 9;
    const recess = new Mask(W, H).rect(ax - aw / 2, top + aw / 2, aw, bottom - top - aw / 2).ellipse(ax, top + aw / 2, aw / 2, aw / 2);
    // recess with depth gradient
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (recess.a[y * W + x]) {
      const t = (y - top) / (bottom - top);
      S.px[y * W + x] = col(lerpHex(T.recess, T.back, Math.max(0, t * t * 0.55)));
    }
    if (i === doorIdx) {
      // stairs up to a glowing door
      const steps = 7;
      for (let s = 0; s < steps; s++) {
        const y = bottom - (s + 1) * 4;
        const half = aw / 2 - 2 - s * 1.6;
        const m = new Mask(W, H).rect(ax - half, y, half * 2, 4).and(recess);
        S.stamp(m, ramp(lerpHex(T.floor2, T.recess, s / steps * 0.6)), { r: 1, flat: false, sel: false });
        S.hline(ax - half, ax + half, y, col(shift(T.floor, 0.06 - s * 0.02)));
      }
      const dw = Math.max(8, aw * 0.32), dh = Math.max(12, aw * 0.5);
      const dy = bottom - steps * 4 - dh;
      const door = new Mask(W, H).rect(ax - dw / 2, dy + dw / 2, dw, dh - dw / 2).ellipse(ax, dy + dw / 2, dw / 2, dw / 2);
      S.fill(door, col(T.door));
      S.fill(new Mask(W, H).rect(ax - dw / 2 + 2, dy + dw / 2 + 1, dw - 4, dh - dw / 2 - 1).ellipse(ax, dy + dw / 2 + 1, dw / 2 - 2, dw / 2 - 2), col(shift(T.door, 0.12)));
      lights.push({ x: ax, y: dy + dh * 0.5, r: aw * 1.6, color: T.door, kind: 'door', a: 0.55 });
    } else {
      // a faint far window glow
      lights.push({ x: ax, y: top + aw * 0.6, r: aw * 0.9, color: shift(T.back, 0.25), kind: 'window', a: 0.25 });
    }
    // voussoir ring
    const ring = new Mask(W, H).ellipse(ax, top + aw / 2, aw / 2 + 4, aw / 2 + 4).rect(ax - aw / 2 - 4, top + aw / 2, aw + 8, bottom - top - aw / 2).sub(recess);
    ring.and(new Mask(W, H).rect(0, 0, W, bottom));
    S.stamp(ring, ramp(shift(T.wall, 0.06)), { r: 2, sel: true, selK: 0.5, dither: true });
    // keystone
    S.stamp(new Mask(W, H).poly([[ax - 3, top - 4], [ax + 3, top - 4], [ax + 2, top + 3], [ax - 2, top + 3]]), ramp(shift(T.wall, 0.12)), { r: 1 });
  });
  // pillars between arches with torches
  const pillarXs = [];
  for (let i = 0; i <= nArch; i++) pillarXs.push(Math.round(i * W / nArch));
  pillarXs.forEach((px, i) => {
    const pw = 14;
    const shaft = new Mask(W, H).rect(px - pw / 2, 0, pw, floorTop - 6);
    S.stamp(shaft, ramp(shift(T.wall, 0.1)), { r: 3, light: [-1, 0], dither: true });
    for (let x = px - pw / 2 + 3; x < px + pw / 2 - 2; x += 3) S.vline(x, 4, floorTop - 12, scaleC(col(shift(T.wall, 0.06)), 0.85));
    const cap = new Mask(W, H).rect(px - pw / 2 - 3, archTop - 6, pw + 6, 5);
    S.stamp(cap, ramp(shift(T.wall, 0.15)), { r: 1 });
    const baseM = new Mask(W, H).rect(px - pw / 2 - 3, floorTop - 12, pw + 6, 6);
    S.stamp(baseM, ramp(shift(T.wall, 0.12)), { r: 1 });
    // sconce + torch
    const ty = Math.round(floorTop * 0.52);
    if (px > 8 && px < W - 8) {
      S.stamp(new Mask(W, H).rect(px - 2, ty, 4, 3).rect(px - 3, ty + 3, 6, 1), ramp('#5d5f78'), { r: 1 });
      S.stamp(new Mask(W, H).rect(px - 1, ty - 5, 2, 6), ramp('#7a4f30'), { r: 1, sel: false });
      torches.push({ x: px, y: ty - 6 });
      lights.push({ x: px, y: ty - 8, r: 70, color: T.torch, kind: 'torch', a: 0.75, phase: R() * 10 });
    }
  });

  // ---------------- balustrade along the wall base
  const bTop = floorTop - 9;
  const rail = new Mask(W, H).rect(0, bTop, W, 2).rect(0, floorTop - 2, W, 2);
  for (let x = 2; x < W; x += 6) {
    if (R() < 0.08) continue; // broken baluster
    rail.rect(x, bTop + 2, 2, 5).rect(x - 0.5, bTop + 4, 3, 1.5);
  }
  // gaps in the rail
  for (let k = 0; k < Math.round(W / 220); k++) { const gx = Math.floor(R() * W); rail.sub(new Mask(W, H).rect(gx, bTop, 6 + R() * 8, 3)); }
  S.stamp(rail, ramp(shift(T.wall, 0.16)), { r: 1, sel: true, selK: 0.5 });

  // ---------------- floor flagstones in perspective
  const floorBase = [col(T.floor), col(T.floor2), col(shift(T.floor, -0.04)), col(shift(T.floor2, 0.03))];
  let y = floorTop;
  let rowI = 0;
  const cx = W * 0.5;
  while (y < H) {
    const rh = Math.round(4 + rowI * 1.5 + rowI * rowI * 0.12);
    const depth = Math.min(1, (y - floorTop) / Math.max(1, H - floorTop));
    const shade = 0.62 + 0.38 * depth;
    const sw = Math.round(rh * 3.1 + 6);
    const off = (rowI % 2) * Math.round(sw / 2) - Math.floor(R() * sw);
    for (let bx = off; bx < W; bx += sw) {
      const w = sw - 1 - Math.floor(R() * 2);
      const base = scaleC(floorBase[Math.floor(R() * floorBase.length)], shade);
      for (let yy = y; yy < Math.min(H, y + rh - 1); yy++) {
        // perspective skew: joints lean away from centre
        const skew = Math.round(((bx + w / 2) - cx) / W * (yy - y) * 0.6);
        for (let x = bx + skew; x < bx + w + skew; x++) {
          if (x < 0 || x >= W) continue;
          let c = base;
          if (yy === y) c = scaleC(base, 1.18);
          else if (x === bx + skew) c = scaleC(base, 1.06);
          if (R() < 0.04) c = scaleC(c, 0.9);
          S.px[yy * W + x] = c;
        }
      }
      if (R() < 0.15) { let kx = bx + 2 + Math.floor(R() * (w - 4)); for (let k = 1; k < rh - 2; k++) { S.set(kx, y + k, scaleC(base, 0.65)); if (R() < 0.45) kx += R() < 0.5 ? -1 : 1; } }
    }
    // joint line
    for (let x = 0; x < W; x++) S.set(x, y + rh - 1, scaleC(mortar, 1.3 + depth * 0.4));
    y += rh; rowI++;
  }
  // floor shadow at the wall base
  for (let k = 0; k < 6; k++) for (let x = 0; x < W; x++) { const i = (floorTop + k) * W + x; if (i < S.px.length) S.px[i] = scaleC(S.px[i], 0.6 + k * 0.07); }

  // ---------------- props
  const propR = R;
  // crystals near the wall base, avoiding the centre stage
  const spots = [0.04, 0.22, 0.47, 0.78, 0.96].map(f => f * W);
  spots.forEach((sx, i) => {
    if (propR() < 0.25) return;
    const size = 5 + propR() * 6;
    const L = crystalCluster(S, sx + (propR() - 0.5) * 20, floorTop - 1 + propR() * 3, size, T.crystal, propR);
    lights.push({ x: L.x, y: L.y, r: L.r * 2.2, color: T.crystalGlow, kind: 'crystal', a: 0.5, phase: propR() * 10 });
    crystals.push({ x: L.x, y: L.y, size });
  });
  // rubble & bones
  for (let k = 0; k < Math.round(W / 40); k++) {
    const rx = propR() * W, ry = floorTop + 3 + propR() * 6;
    const m = new Mask(W, H);
    for (let j = 0; j < 3; j++) m.ellipse(rx + (propR() - 0.5) * 6, ry + (propR() - 0.5) * 2, 1.5 + propR() * 2.2, 1 + propR() * 1.4);
    S.stamp(m, ramp(shift(T.wall, 0.08)), { r: 1, sel: true });
  }
  for (let k = 0; k < Math.round(W / 120); k++) {
    const bx = propR() * W, by = floorTop + 10 + propR() * (H - floorTop - 20);
    S.line(bx, by, bx + 4, by - 1, col('#d9cfb4')); S.set(bx - 1, by, col('#efe6d0')); S.set(bx + 5, by - 1, col('#efe6d0'));
  }

  // ---------------- foreground: hanging roots top corners, rocks bottom corners
  const dark = ['#2a2433', '#1a1622', '#110e17', '#0a080e'];
  const root = (x0, dir) => {
    const m = new Mask(W, H);
    let x = x0, yy = -2, w = 4 + propR() * 3;
    for (let k = 0; k < 14 + propR() * 10; k++) {
      const nx = x + dir * (1 + propR() * 3), ny = yy + 2 + propR() * 3;
      m.capsule(x, yy, nx, ny, w, Math.max(0.8, w - 0.35));
      x = nx; yy = ny; w = Math.max(0.8, w - 0.35);
      if (propR() < 0.18) { let bx2 = x, by2 = yy, bw2 = w * 0.7; for (let j = 0; j < 5; j++) { const nx2 = bx2 - dir * (1 + propR() * 2), ny2 = by2 + 2 + propR() * 2; m.capsule(bx2, by2, nx2, ny2, bw2, Math.max(0.6, bw2 - 0.3)); bx2 = nx2; by2 = ny2; bw2 = Math.max(0.6, bw2 - 0.3); } }
    }
    F.stamp(m, dark, { r: 2, light: [-0.4, -0.9] });
  };
  root(4, 1); root(18 + propR() * 10, 1); root(W - 4, -1); root(W - 20 - propR() * 10, -1);
  const rock = (x0, y0, r) => { const m = new Mask(W, H); for (let j = 0; j < 4; j++) m.ellipse(x0 + (propR() - 0.5) * r, y0 + (propR() - 0.3) * r * 0.3, r * (0.5 + propR() * 0.5), r * (0.35 + propR() * 0.3)); F.stamp(m, dark, { r: 3 }); };
  rock(-4, H + 2, 26); rock(W + 4, H + 2, 30);
  const fgc = crystalCluster(F, W * 0.035, H - 4, 13, T.crystal, propR);
  lights.push({ x: fgc.x, y: fgc.y, r: 80, color: T.crystalGlow, kind: 'crystal', a: 0.55, phase: 2 });
  crystals.push({ x: fgc.x, y: fgc.y, size: 13, fg: true });
  F.outline({ k: 0.3 });

  return { bg: S.toCanvas(), fg: F.toCanvas(), lights, torches, crystals, floorTop };
}

// Soft tileable noise texture for fog, drawn at small size and stretched.
export function fogTexture(w = 256, h = 64, seed = 3) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const R = rng(seed);
  const grid = [];
  const gx = 16, gy = 6;
  for (let j = 0; j <= gy; j++) { grid.push([]); for (let i = 0; i <= gx; i++) grid[j].push(R()); }
  for (let j = 0; j <= gy; j++) grid[j][gx] = grid[j][0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / w * gx, fy = y / h * gy;
    const i = Math.floor(fx), jj = Math.floor(fy);
    const tx = fx - i, ty = fy - jj;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = grid[jj][i], b = grid[jj][i + 1], c2 = grid[Math.min(gy, jj + 1)][i], d = grid[Math.min(gy, jj + 1)][i + 1];
    const v = a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
    const edge = Math.sin(Math.PI * y / h);
    const k = (y * w + x) * 4;
    img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * v * edge);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

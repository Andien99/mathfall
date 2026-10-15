// Pixel-art raster toolkit: hard-edged shapes, directional shading, selective outlines.
// Everything is drawn into integer pixel grids with no anti-aliasing.

// ---------------------------------------------------------------- colour
export function hex(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function pack(r, g, b, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255); }
export function unpack(c) { return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255]; }
export function col(h, a = 255) { const [r, g, b] = hex(h); return pack(r, g, b, a); }

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
// Shift a colour: dl lightness, ds saturation, dh hue (towards warm for highlights, cool for shadows).
export function shift(h, dl, ds = 0, dh = 0) {
  const [r, g, b] = hex(h); let [H, S, L] = rgb2hsl(r, g, b);
  H += dh; S = Math.max(0, Math.min(1, S + ds)); L = Math.max(0, Math.min(1, L + dl));
  const [R, G, B] = hsl2rgb(H, S, L);
  return '#' + [R, G, B].map(v => v.toString(16).padStart(2, '0')).join('');
}
// Four-step ramp with hue shifting: [highlight, base, shade, deep]
export function ramp(base, opts = {}) {
  const k = opts.k || 1;
  const warm = opts.warm == null ? 1 : opts.warm;
  return [
    opts.hi || shift(base, 0.13 * k, -0.02, -8 * warm),
    base,
    opts.mid || shift(base, -0.12 * k, 0.04, 10 * warm),
    opts.dark || shift(base, -0.24 * k, 0.06, 18 * warm)
  ];
}

// ---------------------------------------------------------------- masks
export class Mask {
  constructor(w, h) { this.w = w; this.h = h; this.a = new Uint8Array(w * h); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { x |= 0; y |= 0; return this.in(x, y) ? this.a[y * this.w + x] : 0; }
  set(x, y, v = 1) { x = Math.round(x); y = Math.round(y); if (this.in(x, y)) this.a[y * this.w + x] = v; }
  rect(x, y, w, h, v = 1) { for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.set(i, j, v); return this; }
  ellipse(cx, cy, rx, ry, v = 1, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const R = Math.ceil(Math.max(rx, ry)) + 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const u = dx * c + dy * s, w = -dx * s + dy * c;
      if ((u * u) / (rx * rx) + (w * w) / (ry * ry) <= 1) this.set(x, y, v);
    }
    return this;
  }
  circle(cx, cy, r, v = 1) { return this.ellipse(cx, cy, r, r, v); }
  poly(pts, v = 1) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5; const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + (yc - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, v);
    }
    return this;
  }
  // tapered thick segment
  capsule(x1, y1, x2, y2, r1, r2 = r1, v = 1) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r1 + (r2 - r1) * t, v);
    }
    return this;
  }
  line(x1, y1, x2, y2, v = 1) {
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.set(x1, y1, v); if (x1 === x2 && y1 === y2) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x1 += sx; } if (e2 <= dx) { err += dx; y1 += sy; } }
    return this;
  }
  sub(other) { for (let i = 0; i < this.a.length; i++) if (other.a[i]) this.a[i] = 0; return this; }
  and(other) { for (let i = 0; i < this.a.length; i++) if (!other.a[i]) this.a[i] = 0; return this; }
  add(other) { for (let i = 0; i < this.a.length; i++) if (other.a[i]) this.a[i] = 1; return this; }
  count() { let n = 0; for (const v of this.a) n += v ? 1 : 0; return n; }
  clone() { const m = new Mask(this.w, this.h); m.a.set(this.a); return m; }
}

// ordered dither threshold
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

// ---------------------------------------------------------------- sprites
export class Sprite {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint32Array(w * h); }
  mask(fn) { const m = new Mask(this.w, this.h); fn(m); return m; }
  get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.px[y * this.w + x] : 0; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = typeof c === 'string' ? col(c) : c; }
  dot(x, y, c) { this.set(x, y, c); }
  dots(list, c) { for (const [x, y] of list) this.set(x, y, c); }
  hline(x1, x2, y, c) { for (let x = Math.round(Math.min(x1, x2)); x <= Math.round(Math.max(x1, x2)); x++) this.set(x, y, c); }
  vline(x, y1, y2, c) { for (let y = Math.round(Math.min(y1, y2)); y <= Math.round(Math.max(y1, y2)); y++) this.set(x, y, c); }
  line(x1, y1, x2, y2, c) { const m = new Mask(this.w, this.h).line(x1, y1, x2, y2); this.fill(m, c); }
  fill(mask, c) { const v = typeof c === 'string' ? col(c) : c; for (let i = 0; i < mask.a.length; i++) if (mask.a[i]) this.px[i] = v; }

  // Paint a mask with a 4-colour ramp, lit from the upper left.
  // opts: r (sampling radius), sel (darken pixels under the new part's edge), dither, light [lx, ly], flat
  stamp(mask, rampHex, opts = {}) {
    const R = opts.r || 2;
    const [lx, ly] = opts.light || [-0.62, -0.78];
    const cols = rampHex.map(h => col(h));
    const w = this.w, h = this.h, a = mask.a;
    if (opts.sel !== false) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (a[i] || !this.px[i]) continue;
        if (mask.get(x - 1, y) || mask.get(x + 1, y) || mask.get(x, y - 1) || mask.get(x, y + 1)) this.px[i] = darken(this.px[i], opts.selK || 0.55);
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!a[i]) continue;
      if (opts.flat) { this.px[i] = cols[1]; continue; }
      let nx = 0, ny = 0, n = 0;
      for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
        if (ox * ox + oy * oy > R * R + 0.5) continue;
        n++;
        if (mask.get(x + ox, y + oy)) { nx += ox; ny += oy; }
      }
      // (nx, ny) points into the shape; the surface faces the other way
      const mag = Math.hypot(nx, ny);
      let shade = 0;
      if (mag > 0.01) shade = (-(nx * lx + ny * ly) / mag) * Math.min(1, mag / (R * 1.6));
      shade += (opts.bias || 0);
      let t = shade;
      if (opts.dither) t += (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 0.22;
      let ci = t > 0.42 ? 0 : t > -0.18 ? 1 : t > -0.5 ? 2 : 3;
      if (opts.noHi && ci === 0) ci = 1;
      this.px[i] = cols[ci];
    }
    return this;
  }

  // Coloured outline around the whole sprite.
  outline(opts = {}) {
    const w = this.w, h = this.h; const src = this.px.slice();
    const base = hex(opts.color || '#140c1c');
    const k = opts.k == null ? 0.5 : opts.k;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (src[i]) continue;
      let nb = 0;
      const tryN = (xx, yy) => { if (!nb && xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] && ((src[yy * w + xx] >>> 24) > 200)) nb = src[yy * w + xx]; };
      tryN(x + 1, y); tryN(x - 1, y); tryN(x, y + 1); tryN(x, y - 1);
      if (!nb && opts.diag) { tryN(x + 1, y + 1); tryN(x - 1, y - 1); tryN(x + 1, y - 1); tryN(x - 1, y + 1); }
      if (!nb) continue;
      const [r, g, b] = unpack(nb);
      this.px[i] = pack(base[0] * (1 - k) + r * 0.3 * k, base[1] * (1 - k) + g * 0.3 * k, base[2] * (1 - k) + b * 0.3 * k);
    }
    return this;
  }

  // Replace every opaque pixel with one colour (hit flashes, silhouettes).
  tint(c, amt = 1) {
    const [r, g, b] = hex(c);
    for (let i = 0; i < this.px.length; i++) {
      const v = this.px[i]; if (!v) continue;
      const [R, G, B, A] = unpack(v);
      this.px[i] = pack(R + (r - R) * amt, G + (g - G) * amt, B + (b - B) * amt, A);
    }
    return this;
  }
  flipX() { const o = new Sprite(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.px[y * this.w + (this.w - 1 - x)] = this.px[y * this.w + x]; return o; }
  clone() { const o = new Sprite(this.w, this.h); o.px.set(this.px); return o; }
  draw(other, ox = 0, oy = 0) {
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) { const v = other.px[y * other.w + x]; if (v) this.set(x + ox, y + oy, v); }
    return this;
  }
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.px[y * this.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  toCanvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.px);
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

export function darken(c, k) {
  const [r, g, b, a] = unpack(c);
  // cool the shadow slightly
  return pack(r * k * 0.95, g * k * 0.97, Math.min(255, b * k * 1.08 + 4), a);
}

// rotate a point around an origin; angle 0 = straight down, positive = towards the front (left)
export function limb(x, y, angleDeg, len) {
  const a = angleDeg * Math.PI / 180;
  return [x - Math.sin(a) * len, y + Math.cos(a) * len];
}

// Seeded random for stable procedural art.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

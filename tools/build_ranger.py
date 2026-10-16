"""Builds the ranger and cleric sheets (14 poses x 3 colour variants) from Andy's sprites.

Run: python3 tools/build_ranger.py   (needs Pillow)
  ranger:m  tools/art-src/ranger_base.png    -> public/art/ranger.png
  ranger:f  tools/art-src/ranger_f_base.png  -> public/art/ranger_f.png
  cleric:f  tools/art-src/cleric_f_base.png  -> public/art/cleric.png
  cleric:m  tools/art-src/cleric_m_base.png  -> public/art/cleric_m.png
These heroes hold their weapon, so every pose moves the whole sprite: lean, recoil, crouch,
kneel. The idle loop comes from PixelLab when tools/art-src/<sheet>_idle.png exists
(4 frames of 84x76, played 0-1-2-1 so it loops without a jump).
"""
import os
from PIL import Image
from build_knight import lean, shift_rows, paste_clip, darken, update_manifest, FW, FH, AX, AY, OUT_DIR
from heroart import hue_shift, load_idle, shrink_frame, ART_SRC

POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory', 'sit']
GREEN = dict(lo=0.17, hi=0.48, smin=0.12, lmax=0.7)
# scale: shrinks the finished frames about the feet so every hero stands about 55px tall (knight-sized)
CONFIGS = {
    'knight:f': dict(src='knight_f_base.png', sheet='knight_f', variants=[0, 0.38, -0.30], tint=dict(lo=0.52, hi=0.80, smin=0.22, lmax=0.62)),  # blue, crimson, emerald cape
    'ranger:m': dict(src='ranger_base.png', sheet='ranger', variants=[0, -0.24, 0.30], tint=GREEN),            # green, autumn red, river blue
    'ranger:f': dict(src='ranger_f_base.png', sheet='ranger_f', variants=[0, -0.24, 0.30], tint=GREEN, scale=0.95),
    'cleric:f': dict(src='cleric_f_base.png', sheet='cleric', variants=[0, 0.62, 0.36], tint=dict(lo=0.93, hi=0.04, smin=0.25, lmax=0.7, wrap=True), scale=0.85),  # red, blue, green cape
    'cleric:m': dict(src='cleric_m_base.png', sheet='cleric_m', variants=[0, 0.16, -0.12], tint=dict(lo=0.55, hi=0.75, smin=0.12, lmax=0.8), scale=0.93),           # blue, violet, teal robe
}

def anchor_x(im):
    """Feet centre: the median x of the opaque pixels in the bottom fifth."""
    W, H = im.size
    xs = sorted(x for y in range(int(H * 0.8), H) for x in range(W) if im.getpixel((x, y))[3])
    return xs[len(xs) // 2]

def face_box(im):
    """Where the face is: skin-coloured pixels in the top half, as a 22x22 crop around them."""
    W, H = im.size
    pts = []
    for y in range(int(H * 0.5)):
        for x in range(W):
            r, g, b, a = im.getpixel((x, y))
            if a and r > g > b and r - b > 45 and r > 110 and g > 70: pts.append((x, y))
    if not pts: return (W // 2 - 11, 0, 22, 22)
    xs = sorted(p[0] for p in pts); ys = sorted(p[1] for p in pts)
    cx, cy = xs[len(xs) // 2], ys[len(ys) // 2]
    return (cx - 11, max(0, cy - 12), 22, 22)

def build_one(key):
    cfg = CONFIGS[key]
    base = Image.open(os.path.join(ART_SRC, cfg['src'])).convert('RGBA')
    W, H = base.size
    ground = max(y for y in range(H) for x in range(W) if base.getpixel((x, y))[3]) + 1
    OX, OY = AX - anchor_x(base), AY - ground
    pivot = int(H * 0.72)
    def frame(body, dx=0, dy=0, lean_px=0, upper=None):
        b = body
        if lean_px: b = lean(b, pivot, lean_px)
        if upper: b = shift_rows(b, *upper)
        f = Image.new('RGBA', (FW, FH)); paste_clip(f, b, (OX + dx, OY + dy)); return f
    def kneel(body, dark):
        a, c = int(H * 0.68), int(H * 0.82); knee = c - a
        k = Image.new('RGBA', body.size)
        k.alpha_composite(body.crop((0, c, W, H)), (0, c)); k.alpha_composite(lean(body.crop((0, 0, W, a)), a, -2), (0, knee))
        f = Image.new('RGBA', (FW, FH)); paste_clip(f, k, (OX, OY))
        return darken(f) if dark else f
    t = cfg['tint']
    shade = lambda im, hs: hue_shift(im, t['lo'], t['hi'], hs, t['smin'], t['lmax'], t.get('wrap', False))
    idles = load_idle(cfg['sheet'])
    up1, up2 = int(H * 0.46), int(H * 0.64)
    sheet = Image.new('RGBA', (FW * len(POSES), FH * len(cfg['variants'])))
    for vi, hs in enumerate(cfg['variants']):
        body = shade(base, hs)
        P = {}
        if idles:
            for i in range(4): P['idle%d' % i] = shade(idles[i], hs)
        else:
            P['idle0'] = frame(body); P['idle1'] = frame(body, upper=(up1, 0, 1)); P['idle2'] = frame(body, upper=(up2, 0, 1)); P['idle3'] = P['idle1']
        P['windup'] = frame(body, lean_px=2, dx=1)
        P['swing1'] = frame(body, lean_px=3, dx=3)
        P['swing2'] = frame(body, lean_px=1, dx=1)
        P['cast0'] = frame(body, lean_px=2, upper=(up2, 0, -1))
        P['cast1'] = frame(body, lean_px=-2, dx=-1)
        P['defend'] = frame(body, upper=(int(H * 0.68), 0, 2), lean_px=1)
        P['hurt'] = frame(body, lean_px=3, dx=2)
        P['down'] = kneel(body, True)
        P['victory'] = frame(body, dy=-1, upper=(up1, 0, -1))
        P['sit'] = kneel(body, False)
        sc = cfg.get('scale', 1)
        for pi, name in enumerate(POSES): sheet.alpha_composite(shrink_frame(P[name], sc, AX, AY), (pi * FW, vi * FH))
    sheet.save(os.path.join(OUT_DIR, cfg['sheet'] + '.png'))
    px, py, pw, ph = face_box(base)
    sc = cfg.get('scale', 1)
    if sc < 1:   # move the portrait crop to where the face ends up after the shrink
        fx, fy = OX + px + pw / 2, OY + py + ph / 2
        px = round(AX + (fx - AX) * sc - pw / 2) - OX; py = max(-OY, round(AY + (fy - AY) * sc - ph / 2) - OY)
    update_manifest(key, {
        'sheet': cfg['sheet'] + '.png', 'frame': [FW, FH], 'variants': len(cfg['variants']), 'variantRows': 1,
        'poses': {n: [i, 0] for i, n in enumerate(POSES)}, 'portrait': [OX + px, OY + py, pw, ph]
    })
    print('wrote', cfg['sheet'] + '.png', 'size', base.size, 'anchor', (OX, OY), 'idle from PixelLab' if idles else 'idle drawn')

if __name__ == '__main__':
    for k in CONFIGS: build_one(k)

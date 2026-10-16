"""Builds public/art/ranger.png (14 poses x 3 colour variants) from Andy's ranger sprite.

Run: python3 tools/build_ranger.py   (needs Pillow)
Sources:
  tools/art-src/ranger_base.png  the ranger at native size (62x56, facing left, bow drawn)
  tools/art-src/ranger_idle.png  optional: a 4-frame idle strip made with PixelLab's
                                 animate_image (frames 72x64, the base sits at (5, 6))
The idle frames come from PixelLab; the other poses lean, recoil, crouch and kneel the
whole sprite (the bow is held, so it moves with the body).
"""
import os
from PIL import Image
from build_knight import lean, shift_rows, paste_clip, darken, recolour, update_manifest, FW, FH, AX, AY, OUT_DIR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'ranger_base.png')
IDLE = os.path.join(ROOT, 'tools', 'art-src', 'ranger_idle.png')
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory', 'sit']

BASE = Image.open(SRC).convert('RGBA')
W, H = BASE.size
GROUND = max(y for y in range(H) for x in range(W) if BASE.getpixel((x, y))[3]) + 1
OX, OY = AX - 36, AY - GROUND        # body centre over the anchor (the bow reaches out left)

def idle_frames():
    """PixelLab idle frames, cropped back to the base's box so they line up exactly."""
    if not os.path.exists(IDLE): return None
    strip = Image.open(IDLE).convert('RGBA')
    fw = strip.width // 4
    out = []
    for i in range(4):
        f = strip.crop((i * fw, 0, (i + 1) * fw, strip.height))
        out.append(f.crop((5, 6, 5 + W, 6 + H)))
    return out

def frame(body, dx=0, dy=0, lean_px=0, upper=None):
    b = body
    if lean_px: b = lean(b, 40, lean_px)
    if upper: b = shift_rows(b, *upper)
    f = Image.new('RGBA', (FW, FH))
    paste_clip(f, b, (OX + dx, OY + dy))
    return f

def kneel(body, dark):
    knee = 8
    up = body.crop((0, 0, W, 38)); feet = body.crop((0, 46, W, H))
    k = Image.new('RGBA', body.size)
    k.alpha_composite(feet, (0, 46)); k.alpha_composite(lean(up, 38, -2), (0, knee))
    f = Image.new('RGBA', (FW, FH)); paste_clip(f, k, (OX, OY))
    return darken(f) if dark else f

def make_poses(body, idles):
    P = {}
    if idles:
        for i in range(4): P['idle%d' % i] = frame(idles[i])
    else:
        P['idle0'] = frame(body); P['idle1'] = frame(body, upper=(26, 0, 1)); P['idle2'] = frame(body, upper=(36, 0, 1)); P['idle3'] = frame(body, upper=(26, 0, 1))
    P['windup'] = frame(body, lean_px=2, dx=1)
    P['swing1'] = frame(body, lean_px=3, dx=3)              # recoil as the arrow flies
    P['swing2'] = frame(body, lean_px=1, dx=1)
    P['cast0'] = frame(body, lean_px=2, upper=(30, 0, -1))
    P['cast1'] = frame(body, lean_px=-2, dx=-1)
    P['defend'] = frame(body, upper=(38, 0, 2), lean_px=1)
    P['hurt'] = frame(body, lean_px=3, dx=2)
    P['down'] = kneel(body, True)
    P['victory'] = frame(body, dy=-1, upper=(26, 0, -1))
    P['sit'] = kneel(body, False)
    return P

VARIANTS = [0, -0.24, 0.30]          # forest green (original), autumn red, river blue

def recolour_green(im, shift):
    """Re-hue the greens (cloak, tunic); leave skin, hair, wood and leather alone."""
    if not shift: return im
    import colorsys
    out = im.copy(); p = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if not a: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s > 0.12 and 0.17 < h < 0.48 and l < 0.7:
                r2, g2, b2 = colorsys.hls_to_rgb((h + shift) % 1, l, s)
                p[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out

def build():
    idles = idle_frames()
    sheet = Image.new('RGBA', (FW * len(POSES), FH * len(VARIANTS)))
    for vi, hs in enumerate(VARIANTS):
        body = recolour_green(BASE, hs)
        idl = [recolour_green(f, hs) for f in idles] if idles else None
        P = make_poses(body, idl)
        for pi, name in enumerate(POSES):
            sheet.alpha_composite(P[name], (pi * FW, vi * FH))
    sheet.save(os.path.join(OUT_DIR, 'ranger.png'))
    update_manifest('ranger', {
        'sheet': 'ranger.png', 'frame': [FW, FH], 'variants': len(VARIANTS), 'variantRows': 1,
        'poses': {n: [i, 0] for i, n in enumerate(POSES)},
        'portrait': [OX + 26, OY + 1, 22, 22]
    })
    print('wrote ranger.png', sheet.size, 'idle from PixelLab' if idles else 'idle generated')

if __name__ == '__main__':
    build()

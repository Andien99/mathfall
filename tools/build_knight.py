"""Builds public/art/knight.png (14 poses x 3 colour variants) from Andy's knight sprite.

Run: python3 tools/build_knight.py   (needs Pillow)
The source is tools/art-src/knight_base.png at native resolution (64x55, facing left).
Every pose is made from the original pixels: the sword is cut out and re-angled around
the grip (RotSprite-style, so the blade stays crisp), and the body is shifted, leaned or
laid down. Frames are 84x76 with the feet at (46, 72), the same rig as the other heroes.
"""
import colorsys, json, math, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'knight_base.png')
OUT_DIR = os.path.join(ROOT, 'public', 'art')
FW, FH, AX, AY = 84, 76, 46, 72
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory', 'sit']

base = Image.open(SRC).convert('RGBA')
BW, BH = base.size
GROUND = max(y for y in range(BH) for x in range(BW) if base.getpixel((x, y))[3]) + 1
OX, OY = AX - 40, AY - GROUND          # where the base image sits inside a frame

# ---- the sword: everything near the line from the tip to the guard
TIP, GUARD = (0.5, 12.5), (26.0, 28.5)
GRIP = (28.5, 30.0)                     # pivot: the hands
def in_blade(x, y):
    dx, dy = GUARD[0] - TIP[0], GUARD[1] - TIP[1]
    L2 = dx * dx + dy * dy
    t = ((x + .5 - TIP[0]) * dx + (y + .5 - TIP[1]) * dy) / L2
    if t < -0.08 or t > 1.0: return False
    px, py = TIP[0] + t * dx, TIP[1] + t * dy
    d = math.hypot(x + .5 - px, y + .5 - py)
    return d <= 3.2 + 1.3 * t

blade = Image.new('RGBA', base.size)
body = base.copy()
for y in range(BH):
    for x in range(BW):
        c = base.getpixel((x, y))
        if c[3] and (in_blade(x, y) or (x <= 24 and y <= 32)):
            blade.putpixel((x, y), c); body.putpixel((x, y), (0, 0, 0, 0))

# ---- RotSprite-lite: scale2x three times, rotate with nearest neighbour, sample back down
def scale2x(im):
    w, h = im.size; s = im.load(); out = Image.new('RGBA', (w * 2, h * 2)); o = out.load()
    g = lambda x, y: s[min(max(x, 0), w - 1), min(max(y, 0), h - 1)]
    for y in range(h):
        for x in range(w):
            P = s[x, y]; A, B, C, D = g(x, y - 1), g(x + 1, y), g(x - 1, y), g(x, y + 1)
            e0 = C if (C == A and C != D and A != B) else P
            e1 = A if (A == B and A != C and B != D) else P
            e2 = D if (D == C and D != B and C != A) else P
            e3 = B if (B == D and B != A and D != C) else P
            o[2 * x, 2 * y], o[2 * x + 1, 2 * y], o[2 * x, 2 * y + 1], o[2 * x + 1, 2 * y + 1] = e0, e1, e2, e3
    return out

BLADE8 = scale2x(scale2x(scale2x(blade)))
def rotated_blade(deg):
    """Blade turned by deg (positive = clockwise on screen) around the grip, at native size."""
    big = BLADE8.rotate(-deg, resample=Image.NEAREST, center=(GRIP[0] * 8, GRIP[1] * 8), expand=False)
    # rotate keeps the canvas, so give it room: paste onto a padded canvas first
    return big

def blade_layer(deg):
    pad = 40
    canvas = Image.new('RGBA', ((BW + 2 * pad) * 8, (BH + 2 * pad) * 8))
    canvas.paste(BLADE8, (pad * 8, pad * 8))
    cx, cy = (GRIP[0] + pad) * 8, (GRIP[1] + pad) * 8
    r = canvas.rotate(-deg, resample=Image.NEAREST, center=(cx, cy))
    small = Image.new('RGBA', (BW + 2 * pad, BH + 2 * pad)); sp = small.load(); rp = r.load()
    for y in range(small.height):
        for x in range(small.width):
            sp[x, y] = rp[x * 8 + 4, y * 8 + 4]
    return small, pad

# ---- helpers on whole layers
def shift_rows(im, y_max, dx, dy):
    """Move rows above y_max by (dx, dy); rows below stay. Used for breathing and leaning."""
    out = Image.new('RGBA', im.size)
    top = im.crop((0, 0, im.width, y_max)); bot = im.crop((0, y_max, im.width, im.height))
    out.alpha_composite(bot, (0, y_max)); out.alpha_composite(top, (dx, dy))
    return out

def lean(im, pivot_y, amount):
    """Shear: each row above pivot_y moves by amount * (pivot_y - y) / pivot_y pixels."""
    out = Image.new('RGBA', im.size); s = im.load(); o = out.load()
    for y in range(im.height):
        off = round(amount * max(0, pivot_y - y) / pivot_y)
        for x in range(im.width):
            if s[x, y][3] and 0 <= x + off < im.width: o[x + off, y] = s[x, y]
    return out

def frame(body_img, blade_deg=0, body_dx=0, body_dy=0, blade_behind=False, blade_dx=0, blade_dy=0, upper=None, lean_px=0):
    f = Image.new('RGBA', (FW, FH))
    b = body_img
    if lean_px: b = lean(b, 40, lean_px)
    if upper: b = shift_rows(b, upper[0], upper[1], upper[2])
    bl, pad = blade_layer(blade_deg)
    gx, gy = blade_dx, blade_dy
    if upper: gx += upper[1]; gy += upper[2]
    if lean_px: gx += round(lean_px * (40 - GRIP[1]) / 40)
    bpos = (OX + body_dx + gx - pad, OY + body_dy + gy - pad)
    if blade_behind: f.alpha_composite(bl, bpos) if False else paste_clip(f, bl, bpos)
    paste_clip(f, b, (OX + body_dx, OY + body_dy))
    if not blade_behind: paste_clip(f, bl, bpos)
    return f

def paste_clip(dst, src, pos):
    x0, y0 = pos
    sx, sy = max(0, -x0), max(0, -y0)
    crop = src.crop((sx, sy, src.width, src.height))
    dst.alpha_composite(crop, (max(0, x0), max(0, y0))) if crop.width and crop.height else None

def darken(im, k=0.62, tint=(90, 84, 112)):
    out = im.copy(); p = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a: p[x, y] = (int(r * k + tint[0] * (1 - k) * .5), int(g * k + tint[1] * (1 - k) * .5), int(b * k + tint[2] * (1 - k) * .5), a)
    return out

def down_frame(dark=True):
    # Down on one knee, slumped forward, sword planted point-first in the ground.
    knee = 9
    up = body.crop((0, 0, BW, 38)); feet = body.crop((0, 46, BW, BH))
    k = Image.new('RGBA', base.size)
    k.alpha_composite(feet, (0, 46))
    k.alpha_composite(lean(up, 38, -3), (0, knee - 1))
    f = Image.new('RGBA', (FW, FH))
    bl, pad = blade_layer(-58)
    paste_clip(f, bl, (OX - pad - 3, OY - pad + knee - 1))
    paste_clip(f, k, (OX, OY))
    return darken(f) if dark else f

def make_poses(body_img):
    P = {}
    P['idle0'] = frame(body_img)
    P['idle1'] = frame(body_img, upper=(24, 0, 1))
    P['idle2'] = frame(body_img, upper=(34, 0, 1), blade_deg=1)
    P['idle3'] = frame(body_img, upper=(24, 0, 1))
    P['windup'] = frame(body_img, blade_deg=50, body_dx=2, lean_px=3)
    P['swing1'] = frame(body_img, blade_deg=-38, body_dx=-2, lean_px=-2)
    P['swing2'] = frame(body_img, blade_deg=-78, body_dx=-3, lean_px=-3, upper=(34, 0, 1))
    P['cast0'] = frame(body_img, blade_deg=59, lean_px=1)
    P['cast1'] = frame(body_img, blade_deg=-28, body_dx=-1, lean_px=-1)
    P['defend'] = frame(body_img, blade_deg=48, upper=(36, 0, 2), blade_dx=-1)
    P['hurt'] = frame(body_img, blade_deg=14, body_dx=2, lean_px=3)
    P['down'] = None
    P['victory'] = frame(body_img, blade_deg=62, body_dy=-1, upper=(24, 0, -1))
    return P

# ---- colour variants: re-hue the cloth (cape, trousers), never the sword or the skin
def recolour(im, hue_shift):
    if not hue_shift: return im
    out = im.copy(); p = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if not a: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s > 0.22 and 0.52 < h < 0.80 and l < 0.62:
                h = (h + hue_shift) % 1
                r2, g2, b2 = colorsys.hls_to_rgb(h, l, s)
                p[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out

VARIANTS = [0, 0.38, -0.30]            # blue (original), crimson, emerald

def load_idle_strip():
    path = os.path.join(ROOT, 'tools', 'art-src', 'knight_idle.png')
    if not os.path.exists(path): return None
    strip = Image.open(path).convert('RGBA')
    return [strip.crop((i * FW, 0, (i + 1) * FW, FH)) for i in range(4)]

def update_manifest(cls, entry):
    man_path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    old = man.setdefault('heroes', {}).get(cls) or {}
    if 'anims' in old: entry = dict(entry, anims=old['anims'])   # keep special moves built by build_attack.py
    man['heroes'][cls] = entry
    json.dump(man, open(man_path, 'w'), indent=1)

def build():
    global body
    orig_body = body
    sheet = Image.new('RGBA', (FW * len(POSES), FH * len(VARIANTS)))
    for vi, hs in enumerate(VARIANTS):
        body = recolour(orig_body, hs)
        P = make_poses(body)
        idles = load_idle_strip()
        if idles:
            for i in range(4): P['idle%d' % i] = recolour(idles[i], hs)
        P['down'] = down_frame()
        P['sit'] = down_frame(dark=False)
        for pi, name in enumerate(POSES):
            sheet.alpha_composite(P[name], (pi * FW, vi * FH))
    body = orig_body
    os.makedirs(OUT_DIR, exist_ok=True)
    sheet.save(os.path.join(OUT_DIR, 'knight.png'))
    entry = {
        'sheet': 'knight.png', 'frame': [FW, FH], 'variants': len(VARIANTS), 'variantRows': 1,
        'poses': {n: [i, 0] for i, n in enumerate(POSES)},
        'portrait': [OX + 25, OY - 2, 26, 26]
    }
    # one knight for now: boys and girls share it until a second knight sprite exists
    update_manifest('knight:m', entry)
    print('wrote knight.png', sheet.size)

if __name__ == '__main__':
    build()

"""Builds public/art/mage.png (14 poses x 3 colour variants) from Andy's mage sprite.

Run: python3 tools/build_mage.py   (needs Pillow)
The source is tools/art-src/mage_base.png at native resolution (66x66): the hooded mage
facing left with a flame in her raised hand, and her staff drawn separately on the left.
The staff is put in her free hand and re-angled around the grip for each pose; the flame
flickers, grows for spells and goes out when she is knocked down.
"""
import os
from PIL import Image
from build_knight import scale2x, lean, shift_rows, paste_clip, darken, recolour, update_manifest, FW, FH, AX, AY, OUT_DIR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'mage_base.png')
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory', 'sit']

src = Image.open(SRC).convert('RGBA')
W, H = src.size
GROUND = 62
OX, OY = AX - 39, AY - GROUND
HAND = (32.5, 36.5)                      # her free hand, where the staff is held
STAFF_GRIP = (13.5, 36.5)                # the matching point on the loose staff

def split():
    body = Image.new('RGBA', src.size); staff = Image.new('RGBA', src.size); flame = Image.new('RGBA', src.size); hand = Image.new('RGBA', src.size)
    for y in range(H):
        for x in range(W):
            c = src.getpixel((x, y))
            if not c[3]: continue
            if x < 20:
                if y <= 60: staff.putpixel((x, y), c)
                continue
            if x >= 47 and y <= 22: flame.putpixel((x, y), c); continue
            body.putpixel((x, y), c)
            r, g, b, _ = c
            if 29 <= x <= 36 and 26 <= y <= 41 and r > 140 and r > g > b: hand.putpixel((x, y), c)
    return body, staff, flame, hand

BODY, STAFF, FLAME, HAND_PX = split()
STAFF8 = scale2x(scale2x(scale2x(STAFF)))
FLAME_BOX = FLAME.getbbox()

def staff_layer(deg):
    """Staff turned by deg (clockwise) around its grip, positioned so the grip is in her hand."""
    pad = 40
    canvas = Image.new('RGBA', ((W + 2 * pad) * 8, (H + 2 * pad) * 8))
    canvas.paste(STAFF8, (pad * 8, pad * 8))
    r = canvas.rotate(-deg, resample=Image.NEAREST, center=((STAFF_GRIP[0] + pad) * 8, (STAFF_GRIP[1] + pad) * 8))
    small = Image.new('RGBA', (W + 2 * pad, H + 2 * pad)); sp = small.load(); rp = r.load()
    for y in range(small.height):
        for x in range(small.width):
            sp[x, y] = rp[x * 8 + 4, y * 8 + 4]
    # move the grip onto the hand
    dx, dy = round(HAND[0] - STAFF_GRIP[0]), round(HAND[1] - STAFF_GRIP[1])
    return small, -pad + dx, -pad + dy

def flame_layer(scale=1.0, lift=0, trim=0):
    """The flame, scaled from its base so it stays sitting on her palm."""
    if scale <= 0: return Image.new('RGBA', src.size)
    x0, y0, x1, y1 = FLAME_BOX
    f = FLAME.crop((x0, y0 + trim, x1, y1))
    if scale != 1.0:
        f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.NEAREST)
    out = Image.new('RGBA', src.size)
    cx = (x0 + x1) / 2
    out.alpha_composite(f, (max(0, round(cx - f.width / 2)), max(0, y1 - f.height - lift)))
    return out

def gem_glow(staff_img, k):
    """Brighten the blue gem on the staff for spells."""
    if not k: return staff_img
    out = staff_img.copy(); p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a and b > 120 and b > r + 30:
                p[x, y] = (min(255, int(r + 90 * k)), min(255, int(g + 90 * k)), 255, a)
    return out

def frame(body, staff_deg=0, flame_scale=1.0, flame_lift=0, flame_trim=0, dx=0, dy=0, upper=None, lean_px=0, gem=0, staff_dy=0):
    b = body
    hand = HAND_PX
    fl = flame_layer(flame_scale, flame_lift, flame_trim)
    layer = Image.new('RGBA', src.size); layer.alpha_composite(b); layer.alpha_composite(fl)
    if lean_px: layer = lean(layer, 44, lean_px); hand = lean(hand, 44, lean_px)
    if upper: layer = shift_rows(layer, *upper); hand = shift_rows(hand, *upper)
    st, sx, sy = staff_layer(staff_deg)
    st = gem_glow(st, gem)
    hx = (upper[1] if upper else 0) + (round(lean_px * (44 - HAND[1]) / 44) if lean_px else 0)
    hy = (upper[2] if upper else 0)
    f = Image.new('RGBA', (FW, FH))
    paste_clip(f, layer, (OX + dx, OY + dy))
    paste_clip(f, st, (OX + dx + sx + hx, OY + dy + sy + hy + staff_dy))
    paste_clip(f, hand, (OX + dx, OY + dy))          # fingers over the staff
    return f

def kneel_frame(dark):
    knee = 8
    up = BODY.crop((0, 0, W, 44)); feet = BODY.crop((0, 52, W, H))
    k = Image.new('RGBA', src.size)
    k.alpha_composite(feet, (0, 52))
    k.alpha_composite(lean(up, 44, -2), (0, knee))
    f = Image.new('RGBA', (FW, FH))
    if dark:
        st, sx, sy = staff_layer(-84)                     # dropped flat in front of her
        bb = st.getbbox(); st = st.crop(bb)
        paste_clip(f, st, (OX + 4, AY - st.height + 1))
    else:
        st, sx, sy = staff_layer(8)                       # planted beside her
        paste_clip(f, st, (OX + sx, OY + sy + knee - 2))
        k.alpha_composite(flame_layer(0.7), (0, knee + 2))
    paste_clip(f, k, (OX, OY))
    if not dark:
        paste_clip(f, HAND_PX, (OX, OY + knee))
    return darken(f) if dark else f

def make_poses(body):
    P = {}
    P['idle0'] = frame(body)
    P['idle1'] = frame(body, flame_lift=1, upper=(26, 0, 1))
    P['idle2'] = frame(body, flame_trim=2, upper=(36, 0, 1), gem=0.3)
    P['idle3'] = frame(body, flame_lift=1, flame_scale=1.1, upper=(26, 0, 1))
    P['windup'] = frame(body, staff_deg=18, flame_scale=1.25, lean_px=2, dx=1, gem=0.6)
    P['swing1'] = frame(body, staff_deg=-30, lean_px=-2, dx=-1, gem=1)
    P['swing2'] = frame(body, staff_deg=-42, lean_px=-3, dx=-2, flame_scale=0.8, gem=0.5)
    P['cast0'] = frame(body, staff_deg=6, flame_scale=1.6, flame_lift=1, lean_px=1, gem=0.6)
    P['cast1'] = frame(body, staff_deg=-24, flame_scale=1.3, flame_lift=2, lean_px=-2, dx=-1, gem=1)
    P['defend'] = frame(body, staff_deg=12, flame_scale=0.7, upper=(40, 0, 2), gem=0.8)
    P['hurt'] = frame(body, staff_deg=10, flame_scale=0.6, lean_px=3, dx=2)
    P['down'] = kneel_frame(True)
    P['victory'] = frame(body, staff_deg=4, staff_dy=-3, flame_scale=1.6, flame_lift=2, dy=-1, upper=(26, 0, -1), gem=1)
    P['sit'] = kneel_frame(False)
    return P

VARIANTS = [0, -0.17, 0.22]           # violet (original), midnight blue, crimson

def build():
    global BODY
    orig = BODY
    sheet = Image.new('RGBA', (FW * len(POSES), FH * len(VARIANTS)))
    for vi, hs in enumerate(VARIANTS):
        BODY = recolour(orig, hs)
        P = make_poses(BODY)
        for pi, name in enumerate(POSES):
            sheet.alpha_composite(P[name], (pi * FW, vi * FH))
    BODY = orig
    sheet.save(os.path.join(OUT_DIR, 'mage.png'))
    update_manifest('mage', {
        'sheet': 'mage.png', 'frame': [FW, FH], 'variants': len(VARIANTS), 'variantRows': 1,
        'poses': {n: [i, 0] for i, n in enumerate(POSES)},
        'portrait': [OX + 26, OY + 7, 22, 22]
    })
    print('wrote mage.png', sheet.size)

if __name__ == '__main__':
    build()

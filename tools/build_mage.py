"""Builds the mage sheets (14 poses x 3 colour variants) from Andy's mage sprites.

Run: python3 tools/build_mage.py   (needs Pillow)
Two mages, each drawn facing left with a flame in the raised hand and the staff drawn
separately beside them:
  mage:f  tools/art-src/mage_base.png        -> public/art/mage.png    (violet cloak, orange fire)
  mage:m  tools/art-src/mage_m_raw_base.png  -> public/art/mage_m.png  (dark cloak, blue fire)
The staff is put in the free hand and re-angled around the grip for each pose; the flame
grows for spells and goes out when the mage is knocked down. If tools/art-src/<sheet>_idle.png
exists (a PixelLab idle loop, 4 frames of 84x76) it replaces the drawn idle, so the fire
flickers for real.
"""
import os
from PIL import Image
from build_knight import scale2x, lean, shift_rows, paste_clip, darken, update_manifest, FW, FH, AX, AY, OUT_DIR
from heroart import hue_shift, load_idle, ART_SRC

POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'swing1', 'swing2', 'cast0', 'cast1', 'defend', 'hurt', 'down', 'victory', 'sit']

CONFIGS = {
    'mage:f': dict(src='mage_base.png', sheet='mage', ground=62, cx=39, hand=(32.5, 36.5), grip=(13.5, 36.5),
                   staff_x=20, staff_ymax=60, flame=lambda x, y: x >= 47 and y <= 22, hand_box=(29, 36, 26, 41),
                   kneel=(44, 52), portrait=(26, 7, 22, 22),
                   variants=[0, -0.17, 0.22], tint=dict(lo=0.52, hi=0.80, smin=0.22, lmax=0.62)),        # violet, midnight, crimson cloak
    'mage:m': dict(src='mage_m_raw_base.png', sheet='mage_m', ground=54, cx=34, hand=(23.5, 33.5), grip=(8.5, 33.5),
                   staff_x=14, staff_ymax=53, flame=lambda x, y: x >= 43 and y <= 17, hand_box=None,
                   kneel=(38, 46), portrait=(23, 1, 22, 22),
                   variants=[0, 0.2, -0.27], tint=dict(lo=0.45, hi=0.70, smin=0.3, lmax=0.95)),        # blue, violet, green fire
}

def setup(cfg):
    g = globals()
    src = Image.open(os.path.join(ART_SRC, cfg['src'])).convert('RGBA')
    W, H = src.size
    body = Image.new('RGBA', src.size); staff = Image.new('RGBA', src.size); flame = Image.new('RGBA', src.size); hand = Image.new('RGBA', src.size)
    for y in range(H):
        for x in range(W):
            c = src.getpixel((x, y))
            if not c[3]: continue
            if x < cfg['staff_x']:
                if y <= cfg['staff_ymax']: staff.putpixel((x, y), c)
                continue
            if cfg['flame'](x, y): flame.putpixel((x, y), c); continue
            body.putpixel((x, y), c)
            hb = cfg['hand_box']
            r, gg, b, _ = c
            if hb and hb[0] <= x <= hb[1] and hb[2] <= y <= hb[3] and r > 140 and r > gg > b: hand.putpixel((x, y), c)
    g.update(src=src, W=W, H=H, BODY=body, STAFF=staff, FLAME=flame, HAND_PX=hand, STAFF8=scale2x(scale2x(scale2x(staff))),
             FLAME_BOX=flame.getbbox(), HAND=cfg['hand'], STAFF_GRIP=cfg['grip'], OX=AX - cfg['cx'], OY=AY - cfg['ground'],
             KNEEL=cfg['kneel'], PIVOT=int(H * 0.7))

def staff_layer(deg):
    """Staff turned by deg (clockwise) around its grip, positioned so the grip is in the hand."""
    pad = 40
    canvas = Image.new('RGBA', ((W + 2 * pad) * 8, (H + 2 * pad) * 8))
    canvas.paste(STAFF8, (pad * 8, pad * 8))
    r = canvas.rotate(-deg, resample=Image.NEAREST, center=((STAFF_GRIP[0] + pad) * 8, (STAFF_GRIP[1] + pad) * 8))
    small = Image.new('RGBA', (W + 2 * pad, H + 2 * pad)); sp = small.load(); rp = r.load()
    for y in range(small.height):
        for x in range(small.width):
            sp[x, y] = rp[x * 8 + 4, y * 8 + 4]
    dx, dy = round(HAND[0] - STAFF_GRIP[0]), round(HAND[1] - STAFF_GRIP[1])
    return small, -pad + dx, -pad + dy

def flame_layer(scale=1.0, lift=0, trim=0):
    """The flame, scaled from its base so it stays sitting on the palm."""
    if scale <= 0 or not FLAME_BOX: return Image.new('RGBA', src.size)
    x0, y0, x1, y1 = FLAME_BOX
    f = FLAME.crop((x0, y0 + trim, x1, y1))
    if scale != 1.0:
        f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.NEAREST)
    out = Image.new('RGBA', src.size)
    cx = (x0 + x1) / 2
    out.alpha_composite(f, (max(0, round(cx - f.width / 2)), max(0, y1 - f.height - lift)))
    return out

def gem_glow(staff_img, k):
    """Brighten the gem on the staff for spells."""
    if not k: return staff_img
    out = staff_img.copy(); p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a and b > 120 and b > r + 30:
                p[x, y] = (min(255, int(r + 90 * k)), min(255, int(g + 90 * k)), 255, a)
    return out

def frame(body, staff_deg=0, flame_scale=1.0, flame_lift=0, flame_trim=0, dx=0, dy=0, upper=None, lean_px=0, gem=0, staff_dy=0):
    hand = HAND_PX
    layer = Image.new('RGBA', src.size); layer.alpha_composite(body); layer.alpha_composite(flame_layer(flame_scale, flame_lift, flame_trim))
    if lean_px: layer = lean(layer, PIVOT, lean_px); hand = lean(hand, PIVOT, lean_px)
    if upper: layer = shift_rows(layer, *upper); hand = shift_rows(hand, *upper)
    st, sx, sy = staff_layer(staff_deg)
    st = gem_glow(st, gem)
    hx = (upper[1] if upper else 0) + (round(lean_px * (PIVOT - HAND[1]) / PIVOT) if lean_px else 0)
    hy = (upper[2] if upper else 0)
    f = Image.new('RGBA', (FW, FH))
    paste_clip(f, layer, (OX + dx, OY + dy))
    paste_clip(f, st, (OX + dx + sx + hx, OY + dy + sy + hy + staff_dy))
    paste_clip(f, hand, (OX + dx, OY + dy))          # fingers over the staff
    return f

def kneel_frame(dark):
    a, b = KNEEL; knee = b - a
    up = BODY.crop((0, 0, W, a)); feet = BODY.crop((0, b, W, H))
    k = Image.new('RGBA', src.size)
    k.alpha_composite(feet, (0, b)); k.alpha_composite(lean(up, a, -2), (0, knee))
    f = Image.new('RGBA', (FW, FH))
    if dark:
        st, sx, sy = staff_layer(-84)                     # dropped flat in front
        bb = st.getbbox(); st = st.crop(bb)
        paste_clip(f, st, (OX + 4, AY - st.height + 1))
    else:
        st, sx, sy = staff_layer(8)                       # planted beside them
        paste_clip(f, st, (OX + sx, OY + sy + knee - 2))
        k.alpha_composite(flame_layer(0.7), (0, knee + 2))
    paste_clip(f, k, (OX, OY))
    if not dark: paste_clip(f, HAND_PX, (OX, OY + knee))
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

def build_one(key):
    global BODY, FLAME, STAFF8
    cfg = CONFIGS[key]; setup(cfg)
    t = cfg['tint']
    shade = lambda im, hs: hue_shift(im, t['lo'], t['hi'], hs, t['smin'], t['lmax'])
    idles = load_idle(cfg['sheet'])
    ob, of, ost = BODY, FLAME, STAFF
    sheet = Image.new('RGBA', (FW * len(POSES), FH * len(cfg['variants'])))
    for vi, hs in enumerate(cfg['variants']):
        BODY, FLAME = shade(ob, hs), shade(of, hs)
        STAFF8 = scale2x(scale2x(scale2x(shade(ost, hs))))
        P = make_poses(BODY)
        if idles:
            for i in range(4): P['idle%d' % i] = shade(idles[i], hs)
        for pi, name in enumerate(POSES): sheet.alpha_composite(P[name], (pi * FW, vi * FH))
    BODY, FLAME = ob, of
    sheet.save(os.path.join(OUT_DIR, cfg['sheet'] + '.png'))
    px, py, pw, ph = cfg['portrait']
    update_manifest(key, {
        'sheet': cfg['sheet'] + '.png', 'frame': [FW, FH], 'variants': len(cfg['variants']), 'variantRows': 1,
        'poses': {n: [i, 0] for i, n in enumerate(POSES)}, 'portrait': [OX + px, OY + py, pw, ph]
    })
    print('wrote', cfg['sheet'] + '.png', sheet.size, 'idle from PixelLab' if idles else 'idle drawn')

if __name__ == '__main__':
    for k in CONFIGS: build_one(k)

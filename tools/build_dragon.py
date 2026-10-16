"""Builds public/art/voidmaw.png, the raid boss, from Andy's red dragon (made in PixelLab).

Run: python3 tools/build_dragon.py   (needs Pillow)
The source is tools/art-src/dragon_base.png: 256x256, transparent, already mirrored to face
right (towards the heroes). It is scaled down to fit the battle scene (box filter, then snapped
back to the dragon's own palette so it stays crisp), and its poses are made by leaning,
lifting and lunging the body above the rock, with a fire breath added for attacks and roars.
"""
import json, os
from PIL import Image
from build_knight import lean, paste_clip, OUT_DIR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'dragon_base.png')
SIZE = 148                      # scaled size of the 256px source
PAD_X, PAD_TOP = 14, 8
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'roar', 'hurt', 'tail']

def scaled():
    im = Image.open(SRC).convert('RGBA')
    small = im.resize((SIZE, SIZE), Image.BOX)
    pal = im.convert('RGB').quantize(colors=64)
    q = small.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(small.split()[3].point(lambda v: 255 if v > 130 else 0))
    return q

BODY = scaled()
FW, FH = SIZE + PAD_X * 2, SIZE + PAD_TOP
PIVOT = int(SIZE * 0.62)        # the rock and legs stay put below this row
MOUTH = (80, 27)                # the open jaws (where its embers are), after mirroring

def fire(img, x, y, length, spread):
    """A short cone of fire breath from the mouth, in the dragon's own warm colours."""
    cols = [(255, 246, 190, 255), (255, 210, 90, 255), (255, 140, 40, 255), (200, 60, 30, 255)]
    p = img.load()
    for i in range(length):
        w = 1 + int(spread * i / length)
        for j in range(-w, w + 1):
            xx, yy = x + i, y + j + i // 6
            if 0 <= xx < img.width and 0 <= yy < img.height:
                k = min(3, int(3 * (abs(j) / (w + 0.01) * 0.6 + i / length * 0.6)))
                if (i + j) % 5 != 0 or k < 2: p[xx, yy] = cols[k]

def frame(lean_px=0, lift=0, dx=0, breath=0):
    b = BODY
    if lean_px: b = lean(b, PIVOT, lean_px)
    if lift:
        # lift the upper body; the original stays underneath so no gap opens at the waist
        top = b.crop((0, 0, SIZE, PIVOT))
        nb = b.copy(); nb.alpha_composite(top, (0, -lift)); b = nb
    f = Image.new('RGBA', (FW, FH))
    paste_clip(f, b, (PAD_X + dx, PAD_TOP))
    if breath:
        mx = PAD_X + dx + MOUTH[0] + lean_px * (PIVOT - MOUTH[1]) // PIVOT
        my = PAD_TOP + MOUTH[1] - lift
        fire(f, mx, my, breath, 6)
    return f

def build():
    P = {
        'idle0': frame(), 'idle1': frame(lift=1), 'idle2': frame(lift=2), 'idle3': frame(lift=1),
        'windup': frame(lean_px=-6, lift=2), 'attack': frame(lean_px=8, breath=22),
        'roar': frame(lean_px=-2, lift=3, breath=14), 'hurt': frame(lean_px=-5, dx=-3), 'tail': frame(lean_px=-3, lift=1)
    }
    sheet = Image.new('RGBA', (FW * len(POSES), FH))
    for i, n in enumerate(POSES): sheet.alpha_composite(P[n], (i * FW, 0))
    sheet.save(os.path.join(OUT_DIR, 'voidmaw.png'))
    man_path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    man.setdefault('enemies', {})['voidmaw'] = {'sheet': 'voidmaw.png', 'frame': [FW, FH], 'poses': {n: [i, 0] for i, n in enumerate(POSES)}}
    json.dump(man, open(man_path, 'w'), indent=1)
    bb = P['idle0'].getbbox()
    print('wrote voidmaw.png', sheet.size, 'frame', FW, FH, 'bbox', bb)

if __name__ == '__main__':
    build()

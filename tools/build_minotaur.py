"""Builds public/art/minotaur.png, the first act's boss, from Andy's PixelLab minotaur.

Run: python3 tools/build_minotaur.py   (needs Pillow)
Source: tools/art-src/minotaur_src.png - his four 128x128 PixelLab frames side by side
(stand, roar, lunge, fists raised), transparent. They are mirrored to face the heroes, lined up
on the feet, and turned into the boss poses: a breathing idle, wind-up (fists raised), attack
(lunge), roar, hurt (leaning back) and a sweep (lunge again, used by his stampede).
"""
import json, os
from PIL import Image
from build_knight import lean, OUT_DIR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'minotaur_src.png')
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'roar', 'hurt', 'tail']
FW, FH = 150, 136          # frame size; must match ENEMY_DEF.minotaur in sprites.js
AX, AY = 72, 132           # feet

def frames():
    src = Image.open(SRC).convert('RGBA')
    out = []
    for k in range(src.width // 128):
        f = src.crop((k * 128, 0, (k + 1) * 128, 128)).transpose(Image.FLIP_LEFT_RIGHT)
        bb = f.getbbox()
        g = Image.new('RGBA', (FW, FH))
        # feet (bottom of the sprite) on AY, body centred on AX
        g.alpha_composite(f, (AX - (bb[0] + bb[2]) // 2, AY - bb[3]))
        out.append(g)
    return out

def lift(im, px, pivot):
    """Raise the body above the pivot row by px (breathing); the original stays underneath."""
    top = im.crop((0, 0, FW, pivot)); nb = im.copy(); nb.alpha_composite(top, (0, -px)); return nb

def build():
    stand, roar, lunge, fists = frames()
    pivot = AY - 40
    P = {'idle0': stand, 'idle1': lift(stand, 1, pivot), 'idle2': lift(stand, 2, pivot), 'idle3': lift(stand, 1, pivot),
         'windup': fists, 'attack': lunge, 'roar': roar, 'hurt': lean(stand, pivot, -6), 'tail': lunge}
    sheet = Image.new('RGBA', (FW * len(POSES), FH))
    for i, n in enumerate(POSES): sheet.alpha_composite(P[n], (i * FW, 0))
    sheet.save(os.path.join(OUT_DIR, 'minotaur.png'))
    man_path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(man_path))
    man.setdefault('enemies', {})['minotaur'] = {'sheet': 'minotaur.png', 'frame': [FW, FH], 'poses': {n: [i, 0] for i, n in enumerate(POSES)}}
    json.dump(man, open(man_path, 'w'), indent=1)
    print('wrote minotaur.png', sheet.size, [P[n].getbbox() for n in ('idle0', 'attack', 'roar')])

if __name__ == '__main__':
    build()

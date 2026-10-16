"""Builds public/art/minotaur.png, the first act's boss, from Andy's PixelLab minotaur.

Run: python3 tools/build_minotaur.py   (needs Pillow)
Source: tools/art-src/minotaur_src.png - his four 128x128 PixelLab frames side by side
(stand, roar, lunge, fists raised), transparent, already facing right towards the heroes. They are
lined up on the feet and turned into the boss poses: a breathing idle, wind-up (fists raised), attack
(lunge), roar, hurt (leaning back) and a sweep (lunge again). Two PixelLab animations made from his
frames add move sequences (tools/art-src/minotaur_moves/): slam0-6 (Ground Slam: fists come down,
crouch on the ground) and run0-7 (Stampede: head-down gallop). Each sequence keeps one offset, taken
from its first frame, so the feet don't jitter between frames.
"""
import json, os
from PIL import Image
from build_knight import lean, OUT_DIR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'minotaur_src.png')
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'roar', 'hurt', 'tail']
MOVES = os.path.join(ROOT, 'tools', 'art-src', 'minotaur_moves')
SEQS = {'slam': [0, 2, 3, 5, 6, 7, 8], 'run': [1, 2, 3, 4, 5, 6, 7, 8]}   # slam frame 4 skipped: PixelLab painted a flash on it
FW, FH = 150, 136          # frame size; must match ENEMY_DEF.minotaur in sprites.js
AX, AY = 72, 132           # feet

def place(f, off):
    g = Image.new('RGBA', (FW, FH)); g.alpha_composite(f, off); return g

def offset(f):
    bb = f.getbbox()   # feet (bottom of the sprite) on AY, body centred on AX
    return (AX - (bb[0] + bb[2]) // 2, AY - bb[3])

def frames():
    src = Image.open(SRC).convert('RGBA')
    fr = [src.crop((k * 128, 0, (k + 1) * 128, 128)) for k in range(src.width // 128)]
    return [place(f, offset(f)) for f in fr]

def sequence(name):
    fr = [Image.open(os.path.join(MOVES, '%s_%02d.png' % (name, i))).convert('RGBA') for i in range(9)]
    off = offset(fr[0])
    return [place(fr[i], off) for i in SEQS[name]]

def lift(im, px, pivot):
    """Raise the body above the pivot row by px (breathing); the original stays underneath."""
    top = im.crop((0, 0, FW, pivot)); nb = im.copy(); nb.alpha_composite(top, (0, -px)); return nb

def build():
    stand, roar, lunge, fists = frames()
    pivot = AY - 40
    seqs = {name: sequence(name) for name in SEQS}
    P = {'idle0': stand, 'idle1': lift(stand, 1, pivot), 'idle2': lift(stand, 2, pivot), 'idle3': lift(stand, 1, pivot),
         'windup': fists, 'attack': lunge, 'roar': roar, 'hurt': lean(stand, pivot, -6), 'tail': lunge}
    for name, fr in seqs.items():
        for i, f in enumerate(fr): P['%s%d' % (name, i)] = f
    names = POSES + [n for n in P if n not in POSES]
    sheet = Image.new('RGBA', (FW * len(names), FH))
    for i, n in enumerate(names): sheet.alpha_composite(P[n], (i * FW, 0))
    sheet.save(os.path.join(OUT_DIR, 'minotaur.png'))
    man_path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(man_path))
    man.setdefault('enemies', {})['minotaur'] = {'sheet': 'minotaur.png', 'frame': [FW, FH], 'poses': {n: [i, 0] for i, n in enumerate(names)}, 'seqs': {k: len(v) for k, v in seqs.items()}}
    json.dump(man, open(man_path, 'w'), indent=1)
    print('wrote minotaur.png', sheet.size, [P[n].getbbox() for n in ('idle0', 'attack', 'roar')])

if __name__ == '__main__':
    build()

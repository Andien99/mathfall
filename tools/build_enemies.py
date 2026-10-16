"""Builds the enemies' battle sheets from PixelLab sprites (tools/art-src/enemies/<kind>.png).

Run: python3 tools/build_enemies.py   (needs Pillow)
Each source is one PixelLab "Create Image (Pro)" sprite in the heroes' style. It is mirrored if PixelLab drew it
facing left (enemies face right, towards the heroes), cropped, and placed on a frame with the feet on a fixed
anchor. The poses the game asks for are made from that one drawing: a breathing idle (the body above the hips
lifts 0-2px), wind-up (leans back), attack (leans in and steps forward), hurt (rocks back), charge (wind-up,
raised) and, for bosses, roar and tail. Writes public/art/<kind>.png and manifest enemies[kind] with the frame
size and foot anchor, which replace the hand-drawn fallback in sprites.js.
"""
import json, os
from PIL import Image
from build_knight import lean, OUT_DIR
from heroart import ART_SRC

SRC = os.path.join(ART_SRC, 'enemies')
POSES = ['idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'hurt', 'charge', 'roar', 'tail']
# kind: mirror (drawn facing left), padding around the sprite, how far it leans/steps, floating (shard)
ENEMIES = {
    'goblin': dict(mirror=True), 'hexer': dict(mirror=True), 'slime': dict(mirror=False, soft=True),
    'skeleton': dict(mirror=True), 'thrall': dict(mirror=True),
    'sentinel': dict(mirror=False, lean=8), 'hollowking': dict(mirror=False, lean=10),
    'colossus': dict(mirror=False, lean=12), 'shard': dict(mirror=False, float=True),
}
PAD = 10

def lift(im, px, pivot):
    if not px: return im
    top = im.crop((0, 0, im.width, pivot)); out = im.copy(); out.alpha_composite(top, (0, -px)); return out

def shift(im, dx, dy=0):
    out = Image.new('RGBA', im.size); out.alpha_composite(im, (dx, dy)); return out

def build(kind, cfg):
    im = Image.open(os.path.join(SRC, kind + '.png')).convert('RGBA')
    if cfg.get('mirror'): im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.crop(im.getbbox())
    w, h = im.size
    L = cfg.get('lean', max(4, h // 9))
    FW, FH = w + PAD * 2 + L * 2, h + PAD + 6
    ax, ay = PAD + L + w // 2, FH - 4
    base = Image.new('RGBA', (FW, FH)); base.alpha_composite(im, (PAD + L, FH - 4 - h))
    pivot = FH - 4 - int(h * (0.25 if cfg.get('soft') else 0.42))   # hips: the legs stay planted below this
    if cfg.get('float'):
        P = {'idle0': shift(base, 0, 0), 'idle1': shift(base, 0, -1), 'idle2': shift(base, 0, -2), 'idle3': shift(base, 0, -1),
             'windup': shift(base, -1, -3), 'attack': shift(base, 2, 1), 'hurt': shift(base, -2, 0)}
    else:
        P = {'idle0': base, 'idle1': lift(base, 1, pivot), 'idle2': lift(base, 2, pivot), 'idle3': lift(base, 1, pivot),
             'windup': shift(lean(base, pivot, -L // 2), -1), 'attack': shift(lean(base, pivot, L), 3),
             'hurt': shift(lean(base, pivot, -L // 2 - 2), -3)}
    P.setdefault('charge', lift(P['windup'], 2, pivot) if not cfg.get('float') else P['windup'])
    P.setdefault('roar', lift(lean(base, pivot, -L // 3), 3, pivot) if not cfg.get('float') else P['windup'])
    P.setdefault('tail', P['attack'])
    sheet = Image.new('RGBA', (FW * len(POSES), FH))
    for i, n in enumerate(POSES): sheet.alpha_composite(P[n], (i * FW, 0))
    sheet.save(os.path.join(OUT_DIR, kind + '.png'))
    return {'sheet': kind + '.png', 'frame': [FW, FH], 'anchor': [ax, ay], 'poses': {n: [i, 0] for i, n in enumerate(POSES)}}

if __name__ == '__main__':
    path = os.path.join(OUT_DIR, 'manifest.json'); man = json.load(open(path))
    for kind, cfg in ENEMIES.items():
        if not os.path.exists(os.path.join(SRC, kind + '.png')): print('missing', kind); continue
        man.setdefault('enemies', {})[kind] = build(kind, cfg); print('wrote', kind, man['enemies'][kind]['frame'])
    json.dump(man, open(path, 'w'), indent=1)

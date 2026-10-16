"""Builds the knights' special slash (PixelLab frames) into game sheets.

Run: python3 tools/build_attack.py
Source: tools/art-src/atk/<sheet>_slash_src.png - the frames in play order, each 128x112 with the
feet at (80, 104): idle -> crouch -> shoulder charge (sword behind) -> rise -> sword overhead ->
downward slash. How they were made: PixelLab animate_image from the idle frame, a shoulder-charge
keyframe made with edit_image, then pinned in-betweens (first and last frame given).
Output: public/art/<sheet>_slash.png (3 cape colours as rows) + manifest heroes[<skin>].anims.slash
"""
import os
from PIL import Image
from build_knight import recolour, VARIANTS, update_manifest, OUT_DIR
from heroart import hue_shift, ART_SRC
import json

AW, AH, AAX, AAY = 128, 112, 80, 104
# per frame: ms to show it. 'hit' = frame where the blade connects, 'trail' = frame the after-image starts,
# 'dashFrames' = frames during which the hero travels to the enemy; 'dash' = how much further back
# (px) than a normal melee hit she stops, because the slash reaches about 40px in front of her feet.
MOVES = {
    'knight:m': dict(sheet='knight', shade=lambda im, hs: recolour(im, hs), variants=VARIANTS,
                     ms=[60, 70, 130, 50, 50, 50, 50, 50, 120, 50, 60, 340], hit=10, trail=9, dashFrames=3),
    'knight:f': dict(sheet='knight_f', shade=lambda im, hs: hue_shift(im, 0.52, 0.80, hs, 0.22, 0.62), variants=[0, 0.38, -0.30],
                     ms=[60, 50, 50, 60, 130, 50, 50, 50, 50, 50, 120, 50, 60, 340], hit=12, trail=11, dashFrames=5),
}

def build(skin):
    m = MOVES[skin]
    src = Image.open(os.path.join(ART_SRC, 'atk', m['sheet'] + '_slash_src.png')).convert('RGBA')
    n = src.width // AW
    assert n == len(m['ms']), (skin, n, len(m['ms']))
    out = Image.new('RGBA', (AW * n, AH * len(m['variants'])))
    for vi, hs in enumerate(m['variants']):
        for i in range(n):
            out.alpha_composite(m['shade'](src.crop((i * AW, 0, (i + 1) * AW, AH)), hs), (i * AW, vi * AH))
    name = m['sheet'] + '_slash.png'
    out.save(os.path.join(OUT_DIR, name))
    path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(path))
    man['heroes'][skin].setdefault('anims', {})['slash'] = {
        'sheet': name, 'frame': [AW, AH], 'anchor': [AAX, AAY], 'frames': n, 'variants': len(m['variants']),
        'timeline': [[i, ms] for i, ms in enumerate(m['ms'])], 'hit': m['hit'], 'trail': m['trail'], 'dashFrames': m['dashFrames'], 'dash': m.get('dash', 16)}
    json.dump(man, open(path, 'w'), indent=1)
    print('wrote', name, n, 'frames', sum(m['ms']), 'ms')

if __name__ == '__main__':
    for k in MOVES: build(k)

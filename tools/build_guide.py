#!/usr/bin/env python3
"""Build Pawcal the guide cat's sprite sheet: public/art/guide.png (64x64 frames in one row).

Sources are PixelLab frames in tools/art-src/guide/: cat_base.png (Create Image Pro, the mage as the style
reference), idle0-4 and talk0-4 (animate_image from cat_base), point.png and cheer.png (edit_image from cat_base).
Frame order is FRAMES below; public/js/guide.js plays them by index.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'guide')
OUT = os.path.join(ROOT, 'public', 'art', 'guide.png')
FRAMES = ['idle0', 'idle1', 'idle2', 'idle3', 'talk1', 'talk2', 'talk3', 'talk4', 'point', 'cheer']
S = 64

sheet = Image.new('RGBA', (S * len(FRAMES), S), (0, 0, 0, 0))
for i, name in enumerate(FRAMES):
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGBA')
    assert im.size == (S, S), (name, im.size)
    # PixelLab leaves the odd near-transparent pixel; make alpha binary so it scales crisply
    px = im.load()
    for y in range(S):
        for x in range(S):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    sheet.alpha_composite(im, (i * S, 0))
sheet.save(OUT, optimize=True)
print('wrote', OUT, sheet.size)

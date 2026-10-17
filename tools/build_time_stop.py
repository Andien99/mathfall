#!/usr/bin/env python3
"""Time Stop (mage legendary): turn the PixelLab sources in tools/art-src/time_stop/ into public/art/fx/ts_*.png.

Sources (all PixelLab):
  rune.png        create_vfx (pro): the clock rune over the staff, 64x64 x 14 (0-3 forming, 5-13 loop), 4 columns
  clock_face.png  create_image_pro: top-down clock circle with Roman numerals, 128x128 (the hands are drawn in code)
  clock_gear.png  create_image_pro: top-down toothed rune ring, 128x128 (spun the other way round the face)
  wave.png        create_vfx: the time-freeze shockwave, a flat ellipse, 192x64 x 10, 4 columns
  crystals.png    create_vfx (pro): ice crystals shooting up round a frozen enemy, 80x56 x 10, 4 columns, feet at (40, 49)
  shatter.png     create_vfx (pro): frozen time shattering, 96x96 x 12, 4 columns

Outputs: ts_rune, ts_clock, ts_gear, ts_wave, ts_crystals, ts_crystals_front (the same crystals with only their lower part
kept, drawn in front of the enemy so it stands encased: the full set is drawn behind it), ts_shatter.
Needs Pillow. Run: python3 tools/build_time_stop.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'time_stop')
OUT = os.path.join(ROOT, 'public', 'art', 'fx')


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def save(im, name):
    im.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, im.size)


def clean(im, cut=24):
    """Drop near-invisible stray pixels the generator leaves at the canvas edges."""
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            if px[x, y][3] < cut: px[x, y] = (0, 0, 0, 0)
    return im


def front_part(sheet, fw, fh, keep_from, full_at):
    """Keep only the lower part of every frame: alpha fades in from row keep_from to row full_at."""
    out = sheet.copy(); px = out.load()
    for y in range(sheet.size[1]):
        r = y % fh
        k = 0 if r <= keep_from else 1 if r >= full_at else (r - keep_from) / (full_at - keep_from)
        k = round(k * 4) / 4   # stepped, so the fade reads as pixel art rather than a smooth gradient
        for x in range(sheet.size[0]):
            c = px[x, y]
            if c[3]: px[x, y] = (c[0], c[1], c[2], int(c[3] * k * 0.8))
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save(clean(load('rune.png')), 'ts_rune.png')
    save(clean(load('clock_face.png')), 'ts_clock.png')
    save(clean(load('clock_gear.png')), 'ts_gear.png')
    save(clean(load('wave.png')), 'ts_wave.png')
    cr = clean(load('crystals.png'))
    save(cr, 'ts_crystals.png')
    save(front_part(cr, 80, 56, 34, 44), 'ts_crystals_front.png')
    save(clean(load('shatter.png')), 'ts_shatter.png')

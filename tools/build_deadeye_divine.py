#!/usr/bin/env python3
"""Deadeye (ranger legendary) and Divine Shield (cleric legendary): turn the PixelLab sources into public/art/fx/.

Sources (all PixelLab create_vfx):
  deadeye/mark.png      (pro)  the lock-on reticle, 48x48 x 12 (0-5 spin in and lock, 6-11 pulsing loop), 4 columns
  deadeye/charge.png    (lite) emerald energy spiralling into the arrowhead, 48x48 x 8 loop, 3 columns
  deadeye/arrow.png     (lite) the emerald arrow, points right, head at the right edge, 64x24 x 6 loop, 3 columns
  deadeye/crit.png      (pro)  the critical hit starburst, 96x96 x 12, 4 columns
  divine_shield/dome_with_knight.png (pro) the golden dome, made round Andy's knight (tools/art-src/knight_base.png)
                         so it is sized to a hero: 132x100 x 14 (0-5 forming, 6-13 shimmer loop), 4 columns, feet at
                         (66, 83). The knight is cut out again here (every pixel that still matches him exactly).
  divine_shield/purify.png      (pro)  the purifying beam on a hero, 64x112 x 12, 4 columns, feet at (32, 104)
  divine_shield/staff_star.png  (lite) the holy star on the staff tip, 48x48 x 8 loop, 3 columns
  divine_shield/cleanse.png     (lite) golden crosses and a shield emblem rising, 48x64 x 10, 4 columns

Outputs: de_mark, de_charge, de_arrow, de_crit, ds_dome, ds_purify, ds_star, ds_cleanse.
Needs Pillow and numpy. Run: python3 tools/build_deadeye_divine.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src')
OUT = os.path.join(ROOT, 'public', 'art', 'fx')


def load(name):
    return Image.open(os.path.join(SRC, name)).convert('RGBA')


def save(im, name):
    im.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, im.size)


def clean(im, cut=24):
    """Drop near-invisible stray pixels the generator leaves behind."""
    a = np.array(im)
    a[a[..., 3] < cut] = 0
    return Image.fromarray(a)


def cut_knight(sheet, fw, fh, n, cols, at):
    """Remove the reference knight from every frame: pixels identical to him are made transparent."""
    k = np.array(load('knight_base.png')).astype(int)
    a = np.array(sheet).astype(int)
    kh, kw = k.shape[:2]
    mask = k[..., 3] > 0
    for i in range(n):
        x0, y0 = (i % cols) * fw + at[0], (i // cols) * fh + at[1]
        win = a[y0:y0 + kh, x0:x0 + kw]
        same = (np.abs(win[..., :3] - k[..., :3]).sum(-1) == 0) & mask & (win[..., 3] > 0)
        # where the dome's glass was laid over him his pixels are tinted rather than identical: inside his outline
        # keep only the dome's own warm, bright light
        r, g, b = win[..., 0], win[..., 1], win[..., 2]
        dome = (r > 170) & (r > b + 50) & (g > 90)
        win[same | (mask & ~dome)] = 0
    return Image.fromarray(a.astype(np.uint8))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save(clean(load('deadeye/mark.png')), 'de_mark.png')
    save(clean(load('deadeye/charge.png')), 'de_charge.png')
    save(clean(load('deadeye/arrow.png')), 'de_arrow.png')
    save(clean(load('deadeye/crit.png')), 'de_crit.png')
    save(clean(cut_knight(load('divine_shield/dome_with_knight.png'), 132, 100, 14, 4, (34, 28))), 'ds_dome.png')
    save(clean(load('divine_shield/purify.png')), 'ds_purify.png')
    save(clean(load('divine_shield/staff_star.png')), 'ds_star.png')
    save(clean(load('divine_shield/cleanse.png')), 'ds_cleanse.png')

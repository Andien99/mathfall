"""Assembles the knights' Earthshatter into tools/art-src/atk/<sheet>_quake_src.png from the Champion's Combo frames.

The combo (tools/assemble_combo.py) already has every pose the move needs, so no new PixelLab art:
  crouch (combo 0)  ->  sword swinging up as he leaps (22, 23)  ->  sword straight up, held while the flame aura
  charges (25-29)  ->  the spin (30, rotated in code while he dives at the enemy)  ->  the low downward-strike finish (36, 37).
Run: python3 tools/assemble_quake.py
"""
import os
from PIL import Image

PICK = [0, 22, 23, 25, 26, 27, 28, 29, 30, 36, 37]   # combo frame numbers, in play order

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    for sheet in ['knight', 'knight_f']:
        src = Image.open(os.path.join(here, 'art-src', 'atk', '%s_combo_src.png' % sheet)).convert('RGBA')
        strip = Image.new('RGBA', (128 * len(PICK), 112))
        for i, k in enumerate(PICK): strip.alpha_composite(src.crop((k * 128, 0, (k + 1) * 128, 112)), (i * 128, 0))
        strip.save(os.path.join(here, 'art-src', 'atk', '%s_quake_src.png' % sheet))
        print('wrote', sheet, len(PICK), 'frames')

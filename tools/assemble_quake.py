"""Assembles the knights' Earthshatter into tools/art-src/atk/<sheet>_quake_src.png from the Champion's Combo frames.

Most poses come from the Champion's Combo (tools/assemble_combo.py):
  crouch (combo 0)  ->  sword swinging up as he leaps (22)  ->  the greatsword wind-up, held while the blade burns
  ('wind': <sheet>_wind.png, made by PixelLab edit_image from the combo's sword-up frame: two-handed grip, hilt up by the
  head, blade angled down behind the back)  ->  the spin (the wind-up, rotated in code while he dives at the enemy)
  ->  the low downward-strike finish (combo 36, 37).
Run: python3 tools/assemble_quake.py
"""
import os
from PIL import Image

PICK = [0, 22, 'wind', 'wind', 'wind+', 'wind', 'wind+', 'wind', 'wind', 36, 37]   # combo frame numbers or keyframes, in play order

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    for sheet in ['knight', 'knight_f']:
        src = Image.open(os.path.join(here, 'art-src', 'atk', '%s_combo_src.png' % sheet)).convert('RGBA')
        strip = Image.new('RGBA', (128 * len(PICK), 112))
        wind = Image.open(os.path.join(here, 'art-src', 'atk', '%s_wind.png' % sheet)).convert('RGBA')
        up1 = Image.new('RGBA', (128, 112)); up1.alpha_composite(wind, (0, -1))   # 'wind+': lifted 1px (a held, trembling charge)
        for i, k in enumerate(PICK):
            fr = wind if k == 'wind' else up1 if k == 'wind+' else src.crop((k * 128, 0, (k + 1) * 128, 112))
            strip.alpha_composite(fr, (i * 128, 0))
        strip.save(os.path.join(here, 'art-src', 'atk', '%s_quake_src.png' % sheet))
        print('wrote', sheet, len(PICK), 'frames')

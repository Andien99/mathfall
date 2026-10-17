"""Dragon's Wrath (mage legendary): builds public/art/fx/dragon_*.png from the PixelLab sources in
tools/art-src/dragon_wrath/.

  head_open.png / head_closed.png  create_image_pro (the raid dragon, tools/art-src/dragon_base.png, as the
                                   reference) and edit_image (jaws shut). 160x128, facing right.
  eyes.png    create_vfx  160x64  x 15 @ 12 fps, anchor 80,32   (two eyes opening in the dark)
  claws.png   create_vfx  200x160 x 10 @ 12 fps, anchor 100,80  (three flaming claw slashes)
  blast.png   create_vfx  103x116 x 12 @ 12 fps, anchor 49,51   (molten explosion)
  spike.png   create_vfx  48x96   x 8  @ 13 fps, anchor 24,92   (one flame spike out of the floor)

The head is mirrored to face left (towards the enemies) and written as a 2-frame strip: open, closed.
Run: python3 tools/build_dragon_wrath.py   (needs Pillow)
"""
import os, shutil
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'dragon_wrath')
OUT = os.path.join(ROOT, 'public', 'art', 'fx')

def main():
    heads = [ImageOps.mirror(Image.open(os.path.join(SRC, f)).convert('RGBA')) for f in ('head_open.png', 'head_closed.png')]
    w, h = heads[0].size
    strip = Image.new('RGBA', (w * 2, h), (0, 0, 0, 0))
    for i, im in enumerate(heads): strip.alpha_composite(im, (i * w, 0))
    strip.save(os.path.join(OUT, 'dragon_head.png'), optimize=True)
    for f in ('eyes', 'claws', 'blast', 'spike'):
        shutil.copy(os.path.join(SRC, f + '.png'), os.path.join(OUT, 'dragon_' + f + '.png'))
    print('wrote', ', '.join('dragon_' + f + '.png' for f in ('head', 'eyes', 'claws', 'blast', 'spike')))

if __name__ == '__main__':
    main()

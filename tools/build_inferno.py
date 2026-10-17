"""Builds the raid arena art (the Inferno Dragon's lava cavern) into public/art/bg/.

Run: python3 tools/build_inferno.py   (needs Pillow)

Sources (all PixelLab "Create Image (Pro)", in tools/art-src/inferno/):
  cavern_wall.png   384x176  back wall: basalt cliffs and columns, two lava falls
  cavern_floor.png  384x128  cracked basalt floor with thin lava cracks (laptops: a short floor band)
  cavern_floor_tall.png 384x256  the same floor with deeper perspective (phones and tall screens)
  lava_flow.png     160x80   molten lava surface with floating crust (the pool the dragon's rock stands in)
  lava_rivers.png   160x80   an unused alternative lava candidate

The wall and floor are copied as they are. The lava is mirrored into a 320px-wide strip so it
tiles seamlessly when the game scrolls it sideways (the pool slowly flows).
The game draws them in public/js/dungeon.js (paintInferno) and animates the pool, the lava
falls, the embers and the glow where the dragon's rock meets the lava in public/js/scene.js.
"""
import os
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'inferno')
OUT = os.path.join(ROOT, 'public', 'art', 'bg')

def build():
    os.makedirs(OUT, exist_ok=True)
    for name, out in (('cavern_wall.png', 'inferno_wall.png'), ('cavern_floor.png', 'inferno_floor.png'), ('cavern_floor_tall.png', 'inferno_floor_tall.png')):
        Image.open(os.path.join(SRC, name)).convert('RGB').save(os.path.join(OUT, out), optimize=True)
    # a touch darker and redder, so the pool doesn't outshine the fighters
    lava = Image.open(os.path.join(SRC, 'lava_flow.png')).convert('RGB').point(lambda v: int(v * 0.9))
    r, g, b = lava.split(); lava = Image.merge('RGB', (r, g.point(lambda v: int(v * 0.9)), b))
    strip = Image.new('RGB', (lava.width * 2, lava.height))
    strip.paste(lava, (0, 0)); strip.paste(ImageOps.mirror(lava), (lava.width, 0))
    strip.save(os.path.join(OUT, 'inferno_lava.png'), optimize=True)
    for f in sorted(os.listdir(OUT)):
        if f.startswith('inferno_'): print('wrote', f, Image.open(os.path.join(OUT, f)).size)

if __name__ == '__main__':
    build()

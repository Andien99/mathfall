"""Assembles the knights' Hero's Resolve into tools/art-src/atk/<sheet>_resolve_src.png and measures the sword.

Frames, in play order (128x112, feet at 80,104):
  stance (combo 0)  ->  the crouch from Power Strike, held while he charges up (power frames)  ->  the airborne pose with
  the greatsword raised straight up ('up': <sheet>_airup.png, PixelLab edit_image from the combo's sword-up frame:
  knees tucked, feet off the ground)  ->  the same lifted 1px ('hover', for the held pause while the blade becomes a pillar
  of light)  ->  optional in-betweens of the swing (<sheet>_resolve_swing.png, PixelLab animate_image pinned between the
  two airborne poses)  ->  the airborne downward strike ('down': <sheet>_airdown.png, edit_image from the raised pose:
  body bent forward, blade pointing straight down)  ->  the low finish he lands in (combo 37, moved down onto the feet).
While he is invisible (the barrage) the game holds the 'up' frame with the sprite hidden.
Run: python3 tools/assemble_resolve.py   (then python3 tools/build_attack.py knight:m/resolve knight:f/resolve)
It prints the frame markers and the sword tips for build_attack.py's EXTRA entries (the crossguards there were measured by
hand: where the 9px-wide blade meets the hilt).
"""
import os
from PIL import Image

AW, AH, AX, AY = 128, 112, 80, 104
CHARGE = {'knight': [1, 2, 3, 4, 5, 6], 'knight_f': [1, 2, 3, 4, 5, 5]}   # Power Strike frames: the low crouch, sword forward


def frame(strip, k):
    return strip.crop((k * AW, 0, (k + 1) * AW, AH))


def opaque(im, x, y):
    return 0 <= x < im.width and 0 <= y < im.height and im.getpixel((x, y))[3] > 40


def sword_up(im):
    """The raised blade's tip: the topmost pixel."""
    y0 = im.getbbox()[1]
    xs = [x for x in range(AW) if opaque(im, x, y0)]
    return xs[len(xs) // 2], y0


def sword_down(im):
    """The lowered blade's tip: the lowest pixel left of the body."""
    for y in range(AH - 1, -1, -1):
        xs = [x for x in range(0, 70) if opaque(im, x, y)]
        if xs: return xs[len(xs) // 2], y


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__)); atk = os.path.join(here, 'art-src', 'atk')
    for sheet in ['knight', 'knight_f']:
        combo = Image.open(os.path.join(atk, sheet + '_combo_src.png')).convert('RGBA')
        power = Image.open(os.path.join(atk, sheet + '_power_src.png')).convert('RGBA')
        up = Image.open(os.path.join(atk, sheet + '_airup.png')).convert('RGBA')
        down = Image.open(os.path.join(atk, sheet + '_airdown.png')).convert('RGBA')
        hover = Image.new('RGBA', (AW, AH)); hover.alpha_composite(up, (0, -1))
        swing = []
        sp = os.path.join(atk, sheet + '_resolve_swing.png')
        if os.path.exists(sp):
            s = Image.open(sp).convert('RGBA'); swing = [frame(s, i) for i in range(s.width // AW)]
        land = frame(combo, 37); lb = land.getbbox()
        landed = Image.new('RGBA', (AW, AH)); landed.alpha_composite(land, (0, AY - lb[3]))   # feet back on the floor
        frames = [frame(combo, 0)] + [frame(power, k) for k in CHARGE[sheet]] + [up, hover] + swing + [down, landed]
        strip = Image.new('RGBA', (AW * len(frames), AH))
        for i, f in enumerate(frames): strip.alpha_composite(f, (i * AW, 0))
        strip.save(os.path.join(atk, sheet + '_resolve_src.png'))
        n = len(frames); upi = 1 + len(CHARGE[sheet]); downi = upi + 2 + len(swing)
        tx, ty = sword_up(up)
        dx, dy = sword_down(down)
        print(sheet, n, 'frames: charge=[1,%d] up=%d hover=%d swing=%s down=%d land=%d' % (upi - 1, upi, upi + 1, list(range(upi + 2, downi)), downi, downi + 1))
        print('   tipUp=[%d, %d] tipDown=[%d, %d]' % (tx - AX, ty - AY, dx - AX, dy - AY))

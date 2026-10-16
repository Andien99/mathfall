"""Turns Andy's victory GIFs (tools/art-src/victory/<sheet>.gif) into the victory move strips.

Run: python3 tools/build_victory.py && python3 tools/build_attack.py
Each GIF is lined up with that hero's battle idle (tools/art-src/victory/<sheet>_atk0.png, a 128x112 frame with
the feet at 80,104) by finding the offset where the GIF's first frame overlaps it best, so the hero doesn't jump
when the celebration starts. The last frame is repeated with the body lifted 1px: build_attack.py loops those
two as the held pose once the GIF has played.
"""
import os
from PIL import Image, ImageSequence
from heroart import ART_SRC, shrink_frame
from assemble_moves import fire_tint

AW, AH = 128, 112
SRC = os.path.join(ART_SRC, 'victory')
SHEETS = ['knight', 'cleric_m', 'mage_m', 'ranger', 'knight_f', 'cleric', 'mage', 'ranger_f']
# The girls' versions are the boys' GIFs re-dressed by PixelLab transfer_outfit (same motion, frame for frame),
# stored as 84x76 battle-frame PNGs in tools/art-src/victory/<sheet>/. They are tried at a few scales because the
# girl cleric and ranger are drawn smaller in battle; the scale that overlaps her idle best is kept.
TRY_SCALES = {'cleric': [1, 0.95, 0.9, 0.85], 'ranger_f': [1, 0.97, 0.95], 'knight_f': [1], 'mage': [1]}
SCALE = {'cleric_m': 0.93}   # same shrink build_ranger.py gives his battle sprite

def align(f0, ref):
    ra = ref.split()[3].load(); fa = f0.split()[3]; fw, fh = f0.size
    rb = ref.getbbox(); fb = f0.getbbox()
    best = None
    bx, by = rb[2] - fb[2], rb[3] - fb[3]     # start: bottom-right corners together
    fp = fa.load(); pts = [(x, y) for y in range(fh) for x in range(fw) if fp[x, y] > 0]
    for dy in range(by - 6, by + 7):
        for dx in range(bx - 14, bx + 15):
            sc = sum(1 for x, y in pts if 0 <= x + dx < AW and 0 <= y + dy < AH and ra[x + dx, y + dy] > 0)
            if best is None or sc > best[0]: best = (sc, dx, dy)
    return best[1], best[2], best[0] / max(1, len(pts))

def lift(im, px=1):
    bb = im.getbbox(); pivot = bb[1] + int((bb[3] - bb[1]) * 0.62)
    top = im.crop((0, 0, AW, pivot)); out = im.copy(); out.alpha_composite(top, (0, -px)); return out

if __name__ == '__main__':
    for sh in SHEETS:
        gif = os.path.join(SRC, sh + '.gif')
        if os.path.exists(gif): frames = [f.convert('RGBA') for f in ImageSequence.Iterator(Image.open(gif))]
        else: frames = [Image.open(os.path.join(SRC, sh, n)).convert('RGBA') for n in sorted(os.listdir(os.path.join(SRC, sh)))]
        if sh in SCALE:
            bb = frames[0].getbbox(); ax, ay = (bb[0] + bb[2]) // 2, bb[3] - 1
            frames = [shrink_frame(f, SCALE[sh], ax, ay) for f in frames]
        ref = Image.open(os.path.join(SRC, sh + '_atk0.png')).convert('RGBA')
        best = None
        for sc in TRY_SCALES.get(sh, [1]):
            fs = frames
            if sc < 1:
                bb = frames[0].getbbox(); fs = [shrink_frame(f, sc, (bb[0] + bb[2]) // 2, bb[3] - 1) for f in frames]
            a = align(fs[0], ref)
            if best is None or a[2] > best[1][2]: best = (fs, a, sc)
        frames, (dx, dy, fit), sc = best
        if sc < 1: print('  scale', sc)
        if sh == 'mage': frames = [fire_tint(f) for f in frames]   # her magic is orange fire, his is blue
        out = []
        for f in frames:
            c = Image.new('RGBA', (AW, AH)); c.alpha_composite(f, (dx, dy)); out.append(c)
        out.append(lift(out[-1]))
        strip = Image.new('RGBA', (AW * len(out), AH))
        for i, f in enumerate(out): strip.alpha_composite(f, (i * AW, 0))
        strip.save(os.path.join(ART_SRC, 'atk', sh + '_victory_src.png'))
        print(sh, len(frames), 'frames, offset', dx, dy, 'overlap %.0f%%' % (fit * 100))

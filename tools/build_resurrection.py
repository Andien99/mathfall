"""Resurrection (cleric legendary): builds public/art/fx/res_*.png from the PixelLab sources in
tools/art-src/resurrection/.

  angel.png        create_image_pro, 160x128, the cleric's idle frame as the style reference: the angel facing
                   front, wings spread, face hidden behind a burst of light. One of four candidates.
  angel_body.png   edit_image on angel.png ("remove both wings"). PixelLab returns the same body moved 27,14 px
                   up-left on the canvas, so it is put back with BODY_SHIFT (89% of its pixels then match).
  portal.png       create_vfx (pro), 180x144 x 16 @ 12 fps, loops, anchor 90,38 (the ring's centre)
  feather_*.png    create_image_pro, 16x16, three of the 64 candidates

The wings are the angel minus the body, split into a left and a right wing (the two largest pieces; stray
pixels from the edit are dropped). Each wing is turned about its shoulder with a RotSprite-style rotation
(Scale2x three times, rotate, sample back down) so the feathers stay crisp, and squeezed towards the body
when folded. res_wings.png holds WING_FRAMES, each the pair of wings on a 192x160 canvas (anchor 96,86, the
middle of the body, which res_body.png shares):
  0-9   unfolding, folded down behind the back -> spread (eased)
  10-13 a slow beat round the spread pose (0, up a little, up more, up a little)
  14    the final, fullest spread (raised 12 degrees and 8% wider)
Run: python3 tools/build_resurrection.py   (needs Pillow and numpy)
"""
import math, os, shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'art-src', 'resurrection')
OUT = os.path.join(ROOT, 'public', 'art', 'fx')
BODY_SHIFT = (27, 14)
CW, CH, PAD = 192, 160, (16, 16)          # output canvas and where the 160x128 source sits on it
FOLD_ANGLE, FOLD_SQUEEZE = 112, 0.5      # folded: each wing turned 112 degrees down and squeezed to half width


def scale2x(a):
    """EPX / Scale2x on an RGBA array: doubles the size, keeping edges sharp."""
    h, w = a.shape[:2]
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    E = p[1:-1, 1:-1]; B = p[:-2, 1:-1]; H = p[2:, 1:-1]; D = p[1:-1, :-2]; F = p[1:-1, 2:]
    eq = lambda x, y: np.all(x == y, axis=-1)
    c = ~eq(B, H) & ~eq(D, F)
    out = np.zeros((h * 2, w * 2, 4), a.dtype)
    out[0::2, 0::2] = np.where((c & eq(D, B))[..., None], D, E)
    out[0::2, 1::2] = np.where((c & eq(B, F))[..., None], F, E)
    out[1::2, 0::2] = np.where((c & eq(D, H))[..., None], D, E)
    out[1::2, 1::2] = np.where((c & eq(H, F))[..., None], F, E)
    return out


def rotsprite(img, angle, pivot, sx=1.0):
    """Rotate img (RGBA, on the output canvas) by angle degrees (counter-clockwise) about pivot, after
    squeezing it horizontally by sx towards the pivot."""
    a = np.array(img)
    for _ in range(3): a = scale2x(a)
    big = Image.fromarray(a)
    k = 8
    if sx != 1.0:   # squeeze towards the pivot
        w, h = big.size
        nw = max(1, round(w * sx))
        sq = big.resize((nw, h), Image.NEAREST)
        canvas = Image.new('RGBA', big.size)
        px = pivot[0] * k
        canvas.alpha_composite(sq, (round(px - px * sx), 0))
        big = canvas
    big = big.rotate(angle, resample=Image.NEAREST, center=(pivot[0] * k + k / 2, pivot[1] * k + k / 2))
    b = np.array(big)
    return Image.fromarray(b[k // 2::k, k // 2::k].copy())


def components(mask):
    """Connected pieces (4-neighbour) of a boolean mask, largest first, as lists of (y, x)."""
    seen = np.zeros_like(mask); out = []
    h, w = mask.shape
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]: continue
        st = [(y0, x0)]; seen[y0, x0] = True; pts = []
        while st:
            y, x = st.pop(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True; st.append((yy, xx))
        out.append(pts)
    return sorted(out, key=len, reverse=True)


def main():
    angel = Image.open(os.path.join(SRC, 'angel.png')).convert('RGBA')
    raw = Image.open(os.path.join(SRC, 'angel_body.png')).convert('RGBA')
    body = Image.new('RGBA', (CW, CH))
    body.alpha_composite(raw.crop((0, 0, 160 - BODY_SHIFT[0], 128 - BODY_SHIFT[1])), (PAD[0] + BODY_SHIFT[0], PAD[1] + BODY_SHIFT[1]))
    full = Image.new('RGBA', (CW, CH)); full.alpha_composite(angel, PAD)
    A = np.array(full); BA = np.array(body)[..., 3] > 0
    W = A.copy(); W[BA] = 0
    pieces = components(W[..., 3] > 0)[:2]
    pieces.sort(key=lambda p: np.mean([x for _, x in p]))   # left wing first
    cx = CW / 2
    wings = []
    for side, pts in zip((-1, 1), pieces):
        m = np.zeros((CH, CW), bool)
        for y, x in pts: m[y, x] = True
        im = A.copy(); im[~m] = 0
        ys, xs = np.nonzero(m)
        # the shoulder: the wing's innermost column, in its lower half (where it meets the back)
        inner = xs.max() if side < 0 else xs.min()
        low = ys[(xs == inner)]
        pivot = (int(inner), int(low.max()))
        wings.append((side, Image.fromarray(im), pivot))
        print('wing', 'left' if side < 0 else 'right', 'pixels', len(pts), 'pivot', pivot)

    def frame(f, raise_deg=0.0, widen=1.0):
        """f: 0 folded .. 1 spread. raise_deg lifts both wings, widen stretches them outward."""
        e = f
        canvas = Image.new('RGBA', (CW, CH))
        for side, im, pv in wings:
            ang = (FOLD_ANGLE * (1 - e) - raise_deg)   # left wing turns counter-clockwise to fold down
            sq = (FOLD_SQUEEZE + (1 - FOLD_SQUEEZE) * e) * widen
            r = rotsprite(im, ang if side < 0 else -ang, pv, sq)
            canvas.alpha_composite(r)
        return canvas

    ease = lambda k: 1 - (1 - k) ** 3
    frames = [frame(ease(i / 9)) for i in range(10)]
    frames += [frame(1, d) for d in (0, 5, 10, 5)]
    frames.append(frame(1, 12, 1.08))
    cols = 5
    sheet = Image.new('RGBA', (CW * cols, CH * math.ceil(len(frames) / cols)))
    for i, fr in enumerate(frames): sheet.alpha_composite(fr, ((i % cols) * CW, (i // cols) * CH))
    sheet.save(os.path.join(OUT, 'res_wings.png'), optimize=True)
    body.save(os.path.join(OUT, 'res_body.png'), optimize=True)
    shutil.copy(os.path.join(SRC, 'portal.png'), os.path.join(OUT, 'res_portal.png'))
    fs = Image.new('RGBA', (48, 16))
    for i in range(3): fs.alpha_composite(Image.open(os.path.join(SRC, 'feather_%d.png' % i)).convert('RGBA'), (i * 16, 0))
    fs.save(os.path.join(OUT, 'res_feathers.png'), optimize=True)
    print('wrote res_wings.png (%d frames), res_body.png, res_portal.png, res_feathers.png' % len(frames))


if __name__ == '__main__':
    main()

"""Recover a pixel-art sprite at its native resolution from an upscaled screenshot.

Usage: python3 tools/extract_sprite.py <screenshot.png> <out.png>
Finds the pixel grid (scale and offset) by testing which grid makes every cell one
colour, samples each cell's dominant colour, and makes the flat background transparent.
"""
import sys
from collections import Counter
from PIL import Image

def fit(px, W, H, scales):
    def score(s, ox, oy, step):
        nw, nh = int((W - ox) / s), int((H - oy) / s); pur = n = 0
        for j in range(0, nh, step):
            for i in range(0, nw, step):
                x0, x1 = int(ox + i * s + 0.7), int(ox + (i + 1) * s - 0.7)
                y0, y1 = int(oy + j * s + 0.7), int(oy + (j + 1) * s - 0.7)
                cs = Counter(px[x, y] for x in range(x0, x1 + 1) for y in range(y0, y1 + 1) if x < W and y < H)
                if cs: pur += cs.most_common(1)[0][1] / sum(cs.values()); n += 1
        return pur / max(1, n)
    best = None
    for s in scales:
        for ox in [k * s / 8 for k in range(8)]:
            for oy in [k * s / 8 for k in range(8)]:
                sc = score(s, ox, oy, 3)
                if not best or sc > best[0]: best = (sc, s, ox, oy)
    _, s0, ox0, oy0 = best
    # refine
    best = None
    for s in [s0 + d / 100 for d in range(-6, 7)]:
        for ox in [ox0 + d / 4 for d in range(-3, 4)]:
            for oy in [oy0 + d / 4 for d in range(-3, 4)]:
                if ox < 0 or oy < 0: continue
                sc = score(s, ox, oy, 2)
                if not best or sc > best[0]: best = (sc, s, ox, oy)
    return best

def main(src, out):
    im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
    bg = Counter(im.getdata()).most_common(1)[0][0]
    runs = Counter()
    for y in range(H):
        r = 1
        for x in range(1, W):
            if px[x, y] == px[x - 1, y]: r += 1
            else: runs[r] += 1; r = 1
    # candidate scales from common run lengths
    common = [k for k, _ in runs.most_common(12) if k > 1]
    cands = sorted({round(k / m, 2) for k in common for m in (1, 2, 3, 4, 5, 6) if 2.5 <= k / m <= 6})
    sc, s, ox, oy = fit(px, W, H, cands)
    nw, nh = int((W - ox) / s), int((H - oy) / s)
    o = Image.new('RGBA', (nw, nh)); op = o.load()
    for j in range(nh):
        for i in range(nw):
            x0, x1 = int(ox + i * s + 0.7), int(ox + (i + 1) * s - 0.7)
            y0, y1 = int(oy + j * s + 0.7), int(oy + (j + 1) * s - 0.7)
            c = Counter(px[x, y] for x in range(x0, x1 + 1) for y in range(y0, y1 + 1) if x < W and y < H).most_common(1)[0][0]
            op[i, j] = (0, 0, 0, 0) if sum(abs(a - b) for a, b in zip(c, bg)) < 12 else c + (255,)
    o = o.crop(o.getbbox()); o.save(out)
    print(f'{src}: scale {s:.2f} offset {ox:.2f},{oy:.2f} purity {sc:.3f} -> {o.size}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

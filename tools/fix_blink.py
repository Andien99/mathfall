"""Removes blinks from a PixelLab idle loop: pastes the open-eyed face from frame 0 onto the
other frames, following the head if it moved a pixel or two.

Run: python3 tools/fix_blink.py knight cleric_m ranger_f   (edits tools/art-src/<name>_idle.png)
"""
import sys, os
from PIL import Image
from build_knight import FW, FH
from heroart import load_idle, ART_SRC

def skin(p):
    r, g, b, a = p
    return a and r > g > b and r - b > 45 and r > 110 and g > 70

def face_rect(f):
    """The face: the largest blob of skin pixels in the top 60% of the frame, as a box."""
    W, H = f.size; px = f.load()
    seen = set(); best = []
    for y in range(int(H * 0.6)):
        for x in range(W):
            if (x, y) in seen or not skin(px[x, y]): continue
            stack = [(x, y)]; blob = []; seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); blob.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < int(H * 0.6) and (nx, ny) not in seen and skin(px[nx, ny]):
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(blob) > len(best): best = blob
    xs = [p[0] for p in best]; ys = [p[1] for p in best]
    return min(xs) - 1, min(ys) - 1, max(xs) + 2, max(ys) + 2

def best_shift(f0, fk, box, r=3):
    x0, y0, x1, y1 = box
    a, b = f0.load(), fk.load(); best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            err = 0
            for y in range(y0 - 4, y1 + 4):
                for x in range(x0 - 4, x1 + 4):
                    p = a[x, y]; q = b[x + dx, y + dy] if 0 <= x + dx < FW and 0 <= y + dy < FH else (0, 0, 0, 0)
                    err += (p[3] > 0) != (q[3] > 0) and 300 or sum(abs(p[i] - q[i]) for i in range(3)) * (p[3] > 0)
            if best is None or err < best[0]: best = (err, dx, dy)
    return best[1], best[2]

def fix(name):
    fr = load_idle(name)
    box = face_rect(fr[0]); x0, y0, x1, y1 = box
    patch = fr[0].crop(box)
    out = [fr[0]]
    for k in range(1, 4):
        dx, dy = best_shift(fr[0], fr[k], box)
        f = fr[k].copy(); f.alpha_composite(patch, (x0 + dx, y0 + dy)); out.append(f)
        print(name, 'frame', k, 'face', box, 'shift', (dx, dy))
    strip = Image.new('RGBA', (FW * 4, FH))
    for i, f in enumerate(out): strip.alpha_composite(f, (i * FW, 0))
    strip.save(os.path.join(ART_SRC, name + '_idle.png'))

if __name__ == '__main__':
    for n in sys.argv[1:]: fix(n)

"""Shared helpers for the hero sprite builders (idle strips from PixelLab, hue shifts)."""
import colorsys, os
from PIL import Image
from build_knight import FW, FH

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_SRC = os.path.join(ROOT, 'tools', 'art-src')

def hue_shift(im, lo, hi, shift, smin=0.12, lmax=0.8, wrap=False):
    """Rotate the hue of pixels whose hue is in [lo, hi] (wrap=True: outside it, for reds)."""
    if not shift: return im
    out = im.copy(); p = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if not a: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            inside = (h >= lo or h <= hi) if wrap else (lo <= h <= hi)
            if inside and s >= smin and l <= lmax:
                r2, g2, b2 = colorsys.hls_to_rgb((h + shift) % 1, l, s)
                p[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out

def load_idle(name):
    """A PixelLab idle loop saved as 4 frames of FWxFH (frame coordinates), or None."""
    path = os.path.join(ART_SRC, name + '_idle.png')
    if not os.path.exists(path): return None
    strip = Image.open(path).convert('RGBA')
    return [strip.crop((i * FW, 0, (i + 1) * FW, FH)) for i in range(4)]

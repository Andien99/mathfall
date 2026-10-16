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

def shrink(im, s, about=None):
    """Scale a sprite down by s (<1) and snap it back to its own colours so it stays crisp.
    about=(x, y): keep that point fixed and keep the canvas size (for frame-coordinate images);
    otherwise return a smaller image."""
    if s >= 0.999: return im
    W, H = im.size
    w, h = max(1, round(W * s)), max(1, round(H * s))
    # premultiplied box filter so transparent pixels don't bleed dark fringes
    pm = im.convert('RGBa').resize((w, h), Image.BOX).convert('RGBA')
    opaque = [px[:3] for px in im.getdata() if px[3] > 127]
    colours = sorted(set(opaque), key=opaque.count, reverse=True)[:96] if len(set(opaque)) > 96 else list(set(opaque))
    pal_img = Image.new('P', (1, 1))
    flat = [c for rgb in colours for c in rgb]; flat += [0] * (768 - len(flat))
    pal_img.putpalette(flat)
    rgb = pm.convert('RGB').quantize(colors=len(colours), palette=pal_img, dither=Image.Dither.NONE).convert('RGB')
    out = Image.new('RGBA', (w, h)); src = rgb.load(); al = pm.getchannel('A').load(); o = out.load()
    for y in range(h):
        for x in range(w):
            if al[x, y] >= 110: o[x, y] = src[x, y] + (255,)
    if about is None: return out
    ax, ay = about
    canvas = Image.new('RGBA', (W, H)); canvas.alpha_composite(out, (round(ax - ax * s), round(ay - ay * s)))
    return canvas

def shrink_frame(im, s, ax, ay):
    """Nearest-neighbour shrink of a frame about its foot anchor (ax, ay). Every pose of a hero
    uses the same sampling grid, so the frames stay consistent with each other."""
    if s >= 0.999: return im
    W, H = im.size
    out = Image.new('RGBA', (W, H)); src = im.load(); o = out.load()
    for y in range(H):
        sy = int(ay + (y + 0.5 - ay) / s)
        if not 0 <= sy < H: continue
        for x in range(W):
            sx = int(ax + (x + 0.5 - ax) / s)
            if 0 <= sx < W: o[x, y] = src[sx, sy]
    return out

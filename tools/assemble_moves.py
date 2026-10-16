"""Assembles PixelLab move frames into tools/art-src/atk/<sheet>_<move>_src.png.

PixelLab often paints its own magic into the frames. clean() keeps the character: the largest
connected blob plus anything touching the idle sprite's box, and drops detached swirls, orbs and
sparks. Frame lists pick the clean frames and set the order (holds repeat a frame).
Run: python3 tools/assemble_moves.py <jobs.json> <pixellab blob dir>
"""
import sys, json, os, colorsys
from PIL import Image

def components(im):
    W, H = im.size; px = im.load(); seen = set(); comps = []
    for y in range(H):
        for x in range(W):
            if (x, y) in seen or not px[x, y][3]: continue
            st = [(x, y)]; seen.add((x, y)); c = []
            while st:
                cx, cy = st.pop(); c.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and (nx, ny) not in seen and px[nx, ny][3]:
                            seen.add((nx, ny)); st.append((nx, ny))
            comps.append(c)
    return comps

def clean(im, box, pad=3):
    comps = components(im); big = max(comps, key=len) if comps else []
    x0, y0, x1, y1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    out = Image.new('RGBA', im.size); src = im.load(); o = out.load()
    for c in comps:
        keep = c is big or (len(c) >= 4 and any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in c))
        if keep:
            for x, y in c: o[x, y] = src[x, y]
    return out

def strip_fire(im, ymax, xmax):
    """Remove orange/yellow flame pixels above ymax and left of xmax (fire PixelLab drew on a staff)."""
    out = im.copy(); p = out.load()
    for y in range(min(ymax, im.height)):
        for x in range(min(xmax, im.width)):
            r, g, b, a = p[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if (h < 0.16 or h > 0.95) and s > 0.45 and v > 0.55: p[x, y] = (0, 0, 0, 0)
    return out

# move -> (frame order, special cleanup)
PLAN = {
    'knight_defend': [0, 1, 2, 3, 3, 3, 2, 1], 'knight_f_defend': [0, 1, 2, 3, 4, 7, 8],
    'knight_rally': [0, 1, 2, 3, 4, 5, 6, 7, 8], 'knight_f_rally': [0, 1, 2, 3, 4, 5, 6, 7, 8],
    'mage_defend': [0, 1, 8, 8, 1], 'mage_m_defend': [0, 1, 8, 8, 1],
    'mage_channel': [0, 1, 2, 3, 4, 4, 3, 0], 'mage_m_channel': [0, 1, 2, 3, 4, 5, 6, 6],
    'ranger_defend': [0, 1, 2, 3, 4, 5, 6, 7, 8], 'ranger_f_defend': [0, 1, 2, 3, 4, 5, 6, 7, 8],
    # volley: raise the bow almost straight up (0-8, pinned to an edit_image keyframe), hold the draw while the
    # star charges, then lower it again (the arrow itself is drawn by the game). The girl's in-betweens (16+) come
    # from an earlier 45-degree take because PixelLab baked arrow streaks into the pinned ones; 9-15 are unused
    # release takes that drifted back to a forward aim.
    'ranger_volley': [0, 2, 4, 6, 7, 8, 8, 7, 4, 0], 'ranger_f_volley': [0, 18, 19, 21, 7, 8, 8, 7, 21, 18, 0],
    'cleric_defend': [0, 1, 2, 3, 4, 4, 8], 'cleric_m_defend': [0, 1, 2, 3, 4, 5, 6, 7, 8],
    'cleric_pray': [0, 1, 2, 3, 4, 5, 5, 6, 7], 'cleric_m_pray': [0, 1, 2, 3, 4, 5, 6, 7],
    # cleric chant (defend / heal / bless): raise the staff over the open book, chant eyes closed, sweep it round
    'cleric_chant': [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'cleric_m_chant': [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11],
    # knight power strike: crouch and power up, then the rising slash (PixelLab's glitchy/VFX frames skipped)
    'knight_power': [0, 2, 3, 4, 5, 6, 7, 8, 9, 11], 'knight_f_power': [0, 2, 4, 5, 6, 7, 8, 9, 10],
}

# plan positions to mirror about the feet (x=80): the near-vertical volley keyframe came out facing right,
# away from the enemies, so it and the frames either side of it are flipped back to face left
MIRROR = {'ranger_volley': [4, 5, 6, 7], 'ranger_f_volley': [4, 5, 6, 7]}

def mirror_feet(im, ax=80):
    out = Image.new('RGBA', im.size); src = im.load(); o = out.load()
    for y in range(im.height):
        for x in range(im.width):
            nx = 2 * ax - 1 - x
            if src[x, y][3] and 0 <= nx < im.width: o[nx, y] = src[x, y]
    return out

def fire_tint(im):
    """Turn PixelLab's bright cyan sword glow orange, so it matches the flame aura."""
    out = im.copy(); p = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.42 < h < 0.62 and s > 0.28 and v > 0.78:
                r2, g2, b2 = colorsys.hsv_to_rgb(0.07 + (1 - v) * 0.1, min(1, s + 0.25), v)
                p[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return out
if __name__ == '__main__':
    jobs = json.load(open(sys.argv[1])); blob = sys.argv[2]
    only = sys.argv[3:]
    for name, order in PLAN.items():
        if only and name not in only: continue
        if name not in jobs: print('missing', name); continue
        fr = [Image.open(os.path.join(blob, 'mcp-Pixel_Lab-blob-%s.png' % b)).convert('RGBA') for b in jobs[name]]
        box = fr[0].getbbox()
        fr = [clean(f, box) for f in fr]
        if name == 'mage_channel': fr = [fr[0]] + [strip_fire(f, box[1] - 2, box[0] + 30) for f in fr[1:]]
        if name.endswith('_power'): fr = [fr[0]] + [fire_tint(f) for f in fr[1:]]
        strip = Image.new('RGBA', (128 * len(order), 112))
        for i, k in enumerate(order): strip.alpha_composite(mirror_feet(fr[k]) if i in MIRROR.get(name, ()) else fr[k], (i * 128, 0))
        sheet, move = name.rsplit('_', 1)
        strip.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'art-src', 'atk', '%s_%s_src.png' % (sheet, move)))
        print('wrote', name, len(order))

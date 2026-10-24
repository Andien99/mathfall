"""The samurai's victory hold pose: tools/art-src/victory/samurai_hold_pixellab.png (PixelLab edit_image of his idle:
katana sheathed, back turned, kasa on his back, looking over his shoulder) came out about 30% taller than his battle
sprite, but with a head the same size as his idle head. So the body is shrunk to his height and the head is pasted
back at full size on the neck, which keeps his proportions when he turns from the fight into the pose.
Output: tools/art-src/victory/samurai_hold.png (a 128x112 move frame, feet at 80,104).

Run: python3 tools/build_samurai_victory.py, then the sheathing in-betweens come from PixelLab animate_image
(idle -> this frame), and tools/build_attack.py samurai:m/victory builds the sheet.
"""
import os
from PIL import Image
from heroart import shrink, ART_SRC

V = os.path.join(ART_SRC, 'victory')
HEAD = (44, 16, 73, 38)      # the head in the PixelLab frame (x0, y0, x1, y1); the neck is its bottom edge
NECK = (57, 38)              # the point on the neck the pasted head sits on

def feet_x(im):
    W, H = im.size
    xs = sorted(x for y in range(int(H * 0.92), H) for x in range(W) if im.getpixel((x, y))[3])
    return xs[len(xs) // 2]

if __name__ == '__main__':
    big = Image.open(os.path.join(V, 'samurai_hold_pixellab.png')).convert('RGBA')
    idle = Image.open(os.path.join(V, 'samurai_atk0.png')).convert('RGBA')
    hb = big.getbbox(); ib = idle.getbbox()
    s = (ib[3] - ib[1]) / (hb[3] - hb[1])
    body = shrink(big.crop(hb), s)
    ox, oy = 80 - feet_x(body), 104 - body.height
    out = Image.new('RGBA', (128, 112)); out.alpha_composite(body, (ox, oy))
    nx, ny = round(ox + (NECK[0] - hb[0]) * s), round(oy + (NECK[1] - hb[1]) * s)
    head = big.crop(HEAD)
    hx, hy = nx - (NECK[0] - HEAD[0]), ny - (NECK[1] - HEAD[1])
    # clear the small head first (everything above the neck inside the head's width), then paste the full-size one
    px = out.load(); sx0, sx1 = round(ox + (HEAD[0] - hb[0]) * s), round(ox + (HEAD[2] - hb[0]) * s)
    for y in range(0, ny - 1):
        for x in range(sx0, sx1): px[x, y] = (0, 0, 0, 0)
    out.alpha_composite(head, (hx, hy))
    out.save(os.path.join(V, 'samurai_hold.png'))
    print('scale %.3f' % s, 'bbox', out.getbbox(), 'idle', ib)

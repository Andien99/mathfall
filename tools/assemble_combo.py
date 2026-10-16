"""Assembles the knights' Champion's Combo (PixelLab frames) into tools/art-src/atk/<sheet>_combo_src.png.

The move is eight PixelLab animations chained through keyframes made with edit_image from the idle frame:
  lift   idle -> sword raised high (wind-up)              slash1  wind-up -> low lunge (diagonal cut down)
  slash2 low lunge -> sword high in front (rising cut)    reset   high -> sword pulled back to the right
  slash3 pulled back -> arm out to the left (horizontal)  up      arm out -> sword straight up (charge pose)
  hold   the charge pose, held (the game adds the electric aura)
  down   charge pose -> back over the shoulder -> huge downward slash -> low lunge
Each animation's first image is the previous one's last keyframe, so it is dropped when chaining.
Run: python3 tools/assemble_combo.py <combo_jobs.json> <pixellab blob dir>
combo_jobs.json: { "knight": { "lift": [blob ids...], "slash1": [...], ... }, "knight_f": {...} }
"""
import sys, json, os
from PIL import Image
from assemble_moves import clean

SEGMENTS = ['lift', 'slash1', 'slash2', 'reset', 'slash3', 'up', 'hold', 'down']
HOLD = 4   # charge frames: the pose and a copy 1px up, alternating (a held, trembling charge)

def lift1(im):
    out = Image.new('RGBA', im.size); out.alpha_composite(im, (0, -1)); return out

if __name__ == '__main__':
    jobs = json.load(open(sys.argv[1])); blob = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    for sheet, segs in jobs.items():
        frames, marks = [], {}
        load = lambda b: Image.open(os.path.join(blob, 'mcp-Pixel_Lab-blob-%s.png' % b)).convert('RGBA')
        box = load(segs['lift'][0]).getbbox()
        for name in SEGMENTS:
            if name == 'hold':
                pose = frames[-1]; marks['hold'] = (len(frames), len(frames) + HOLD - 1)
                frames += [pose if i % 2 == 0 else lift1(pose) for i in range(HOLD)]
                continue
            fr = [clean(load(b), box, pad=12) for b in segs[name][1:]]   # [0] repeats the previous keyframe
            marks[name] = (len(frames), len(frames) + len(fr) - 1)
            frames += fr
        strip = Image.new('RGBA', (128 * len(frames), 112))
        for i, f in enumerate(frames): strip.alpha_composite(f, (i * 128, 0))
        strip.save(os.path.join(here, 'art-src', 'atk', '%s_combo_src.png' % sheet))
        print('wrote', sheet, len(frames), 'frames', marks)

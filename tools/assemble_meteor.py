"""Assembles the mages' Meteor (PixelLab frames) into tools/art-src/atk/<sheet>_meteor_src.png.

Keyframes were made with edit_image from the attack frame (both mages at once), each from the one before:
  atk0   standing, flame in the palm (the normal attack frame)
  float  levitating: toes pointed down, cloak lifted
  point  the flame arm reaching across her body, the flame held out at the enemy on the left. PixelLab would not swing
         the arm across (it kept the pose), so the arm was painted over by hand (point_paint in the frames branch)
         and edit_image redrew it in the sprite's style
  pfist  the outstretched hand squeezed shut on the flame      popen  the outstretched hand open again, palm up, empty
  praise that arm raised to the upper left                     snap   the arm straight up, fingers snapping
  half / open  the arm halfway up / palm up at her side (on the way back down)
PixelLab's pinned in-betweens for these kept adding big spell effects of their own (fire blasts, swooshes), so the
move is built from the keyframes, plus the few in-betweens whose effect came off as a separate blob (crush1/2 and
raise) after dropping everything but the body. (Those are no longer used.) The rise and the descent are moved in code.
The '+' frames are the same pose lifted 1px (a breathing hover). All frames are on the public pixellab-frames branch.
Run: python3 tools/assemble_meteor.py <frames dir>
"""
import sys, os
from PIL import Image

SEQ = {   # sheet: frame names in play order (see build_attack.py 'mage:*/meteor' for timing and markers)
    'mage':   ['atk0', 'float', 'float+', 'float', 'point', 'point+', 'point', 'pfist', 'pfist+', 'pfist', 'popen', 'popen+',
               'praise', 'snap', 'snap+', 'snap', 'half', 'open', 'atk0'],
    'mage_m': ['atk0', 'float', 'float+', 'float', 'point', 'point+', 'point', 'pfist', 'pfist+', 'pfist', 'popen', 'popen+',
               'praise', 'snap', 'snap+', 'snap', 'half', 'open', 'atk0'],
}

def lift1(im):
    out = Image.new('RGBA', im.size); out.alpha_composite(im, (0, -1)); return out

if __name__ == '__main__':
    src = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    for sheet, names in SEQ.items():
        frames = []
        for nm in names:
            im = Image.open(os.path.join(src, '%s_%s.png' % (sheet, nm.rstrip('+')))).convert('RGBA')
            frames.append(lift1(im) if nm.endswith('+') else im)
        strip = Image.new('RGBA', (128 * len(frames), 112))
        for i, f in enumerate(frames): strip.alpha_composite(f, (i * 128, 0))
        strip.save(os.path.join(here, 'art-src', 'atk', '%s_meteor_src.png' % sheet))
        print('wrote', sheet, len(frames), 'frames')

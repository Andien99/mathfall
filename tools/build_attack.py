"""Builds the heroes' special moves (knight slash, cleric smite, ranger shoot, mage cast) (PixelLab frames) into game sheets.

Run: python3 tools/build_attack.py
Source: tools/art-src/atk/<sheet>_slash_src.png - the frames in play order, each 128x112 with the
feet at (80, 104): idle -> crouch -> shoulder charge (sword behind) -> rise -> sword overhead ->
downward slash. How they were made: PixelLab animate_image from the idle frame, a shoulder-charge
keyframe made with edit_image, then pinned in-betweens (first and last frame given).
Output: public/art/<sheet>_slash.png (3 cape colours as rows) + manifest heroes[<skin>].anims.slash
"""
import os
from PIL import Image
from build_knight import recolour, VARIANTS, update_manifest, OUT_DIR
from heroart import hue_shift, ART_SRC
import json

AW, AH, AAX, AAY = 128, 112, 80, 104
# per frame: ms to show it. 'hit' = frame where the blade connects, 'trail' = frame the after-image starts,
# 'dashFrames' = frames during which the hero travels to the enemy; 'dash' = how much further back
# (px) than a normal melee hit she stops, because the slash reaches about 40px in front of her feet.
MOVES = {
    'knight:m': dict(sheet='knight', shade=lambda im, hs: recolour(im, hs), variants=VARIANTS,
                     ms=[60, 70, 130, 50, 50, 50, 50, 50, 120, 50, 60, 340], hit=10, trail=9, dashFrames=3),
    'knight:f': dict(sheet='knight_f', shade=lambda im, hs: hue_shift(im, 0.52, 0.80, hs, 0.22, 0.62), variants=[0, 0.38, -0.30],
                     ms=[60, 50, 50, 60, 130, 50, 50, 50, 50, 50, 120, 50, 60, 340], hit=12, trail=11, dashFrames=5),
    # clerics cast in place: raise the staff while chanting, slam it down -> lightning ('strike' frame)
    'cleric:f': dict(sheet='cleric', move='smite', shade=lambda im, hs: hue_shift(im, 0.93, 0.04, hs, 0.25, 0.7, True), variants=[0, 0.62, 0.36],
                     ms=[60, 60, 60, 70, 80, 80, 80, 80, 80, 80, 80, 70, 420], hit=12, strike=12, cast=True),
    'cleric:m': dict(sheet='cleric_m', move='smite', shade=lambda im, hs: hue_shift(im, 0.55, 0.75, hs, 0.12, 0.8), variants=[0, 0.16, -0.12],
                     ms=[60, 70, 70, 75, 75, 75, 75, 75, 75, 75, 75, 60, 420], hit=12, strike=12, cast=True),
    # rangers shoot from where they stand: draw, aim, release ('release' frame spawns the arrow at 'muzzle',
    # px from the feet), recoil
    'ranger:m': dict(sheet='ranger', move='shoot', shade=lambda im, hs: hue_shift(im, 0.17, 0.48, hs, 0.12, 0.7), variants=[0, -0.24, 0.30],
                     ms=[60, 60, 60, 60, 60, 60, 60, 60, 80, 700, 50, 50, 90, 220], hit=10, release=10, charge=9, muzzle=[-66, -48], cast=True, zoom=1.06),
    'ranger:f': dict(sheet='ranger_f', move='shoot', shade=lambda im, hs: hue_shift(im, 0.17, 0.48, hs, 0.12, 0.7), variants=[0, -0.24, 0.30],
                     ms=[60, 60, 60, 60, 60, 60, 60, 700, 70, 280], hit=8, release=8, charge=7, muzzle=[-44, -40], cast=True, zoom=1.06),
    # mages point the staff; the spell (arcane / fire / ice) forms at the tip during the hold, then flies
    'mage:f': dict(sheet='mage', move='cast', shade=lambda im, hs: hue_shift(im, 0.52, 0.80, hs, 0.22, 0.62), variants=[0, -0.17, 0.22],
                   ms=[60, 60, 60, 60, 70, 650, 90, 250], hit=6, release=6, charge=5, muzzle=[-59, -41], cast=True, zoom=1.08),
    'mage:m': dict(sheet='mage_m', move='cast', shade=lambda im, hs: hue_shift(im, 0.45, 0.70, hs, 0.3, 0.95), variants=[0, 0.2, -0.27],
                   ms=[60, 60, 60, 70, 100, 560, 90, 250], hit=6, release=6, charge=4, muzzle=[-43, -37], cast=True, zoom=1.08),
}

# Defends and big moves (no dash, no projectile): the game plays the frames, then runs the move's usual
# effect (block, heal, buff, arrows from the sky...) from the 'hit' frame.
SHADES = {k: v['shade'] for k, v in MOVES.items()}
SHADES.update({'ranger:m': MOVES['ranger:m']['shade'], 'ranger:f': MOVES['ranger:f']['shade']})
VARS = {k: v['variants'] for k, v in MOVES.items()}
SIMPLE = {   # skin: {move: (ms per frame, hit frame)}
    'knight:m': {'defend': ([50, 50, 60, 80, 260, 200, 60, 60], 3), 'rally': ([50, 50, 60, 70, 90, 220, 220, 80, 80], 4)},
    'knight:f': {'defend': ([50, 50, 60, 60, 80, 160, 260], 4), 'rally': ([50, 50, 60, 70, 90, 220, 220, 80, 80], 4)},
    'mage:f': {'defend': ([60, 90, 220, 380, 90], 2), 'channel': ([60, 70, 70, 80, 220, 300, 90, 80], 4)},
    'mage:m': {'defend': ([60, 90, 220, 380, 90], 2), 'channel': ([60, 70, 70, 80, 220, 300, 90, 80], 4)},
    'ranger:m': {'defend': ([50, 60, 60, 70, 70, 70, 70, 80, 160], 3)},
    'ranger:f': {'defend': ([50, 60, 60, 70, 70, 70, 70, 80, 160], 3)},
    'cleric:f': {'defend': ([60, 60, 70, 90, 260, 160, 100], 3), 'pray': ([60, 60, 70, 80, 220, 260, 100, 80, 80], 4)},
    'cleric:m': {'defend': ([60, 60, 70, 90, 220, 120, 100, 100, 100], 4), 'pray': ([60, 60, 70, 80, 220, 260, 100, 80], 4)},
}
for skin, moves in SIMPLE.items():
    for mv, (ms, hit) in moves.items():
        MOVES[skin + '/' + mv] = dict(sheet=MOVES[skin]['sheet'], move=mv, shade=SHADES[skin], variants=VARS[skin], ms=ms, hit=hit, cast=True, skin=skin)

# Hand-timed moves with their own effects (see scene.js _moveFx / _bigSlash):
#  chant - clerics' defend / heal / blessing: staff up over the book, a light grows at the tip from 'charge' to
#          'chargeTo' (blue = defend, yellow = heal), then the staff sweeps round ('swing' frames leave a light trail)
#  power - knight Power Strike: flame aura grows over the 'aura' frames, dash from 'dashAt', rising slash at 'upswing'
EXTRA = {
    'cleric:f/chant': dict(base='cleric:f', ms=[60, 80, 160, 260, 260, 260, 90, 90, 90, 90, 260], hit=9, charge=2, chargeTo=6, swing=[6, 10], track='top'),
    'cleric:m/chant': dict(base='cleric:m', ms=[60, 70, 90, 150, 200, 200, 200, 200, 90, 90, 90, 240], hit=10, charge=3, chargeTo=8, swing=[8, 11], track='top'),
    # volley: bow aimed almost straight up; star + shrinking yellow ring at the tip from 'charge' to 'chargeTo', then the shot
    'ranger:m/volley': dict(base='ranger:m', ms=[50, 60, 60, 70, 80, 120, 900, 90, 90, 120], hit=7, charge=5, chargeTo=7, ring=True, track='top'),
    'ranger:f/volley': dict(base='ranger:f', ms=[50, 60, 60, 70, 80, 120, 900, 90, 90, 90, 120], hit=7, charge=5, chargeTo=7, ring=True, track='top'),
    # victory: Andy's GIFs (tools/build_victory.py); the girls' are the same motion re-dressed by PixelLab. Every frame plays once at the GIF's 130 ms,
    # then 'loop' holds the final pose: the last frame and a copy lifted 1px (breathing).
    'knight:m/victory': dict(base='knight:m', ms=[130] * 11, loop=[[10, 650], [11, 650]]),
    'cleric:m/victory': dict(base='cleric:m', ms=[130] * 9, loop=[[8, 650], [9, 650]]),
    'mage:m/victory': dict(base='mage:m', ms=[130] * 11, loop=[[10, 650], [11, 650]]),
    'ranger:m/victory': dict(base='ranger:m', ms=[130] * 9, loop=[[8, 650], [9, 650]]),
    'knight:f/victory': dict(base='knight:f', ms=[130] * 11, loop=[[10, 650], [11, 650]]),
    'cleric:f/victory': dict(base='cleric:f', ms=[130] * 9, loop=[[8, 650], [9, 650]]),
    'mage:f/victory': dict(base='mage:f', ms=[130] * 11, loop=[[10, 650], [11, 650]]),
    'ranger:f/victory': dict(base='ranger:f', ms=[130] * 9, loop=[[8, 650], [9, 650]]),
    # Champion's Combo (tools/assemble_combo.py): three slashes ('slashAt' = the frame each one lands on), lift the sword
    # up, hold it while the electric aura charges ('holdAt' = first and last held frame; 'blade' = blade length for the
    # aura), then the downward slash: the giant arc appears on 'arcAt' and the finisher lands on 'hit'.
    'knight:m/combo': dict(base='knight:m', ms=[50, 50, 60, 90,  40, 50, 50, 110,  40, 45, 50, 100,  45, 45, 45, 90,  40, 50, 50, 130,
                                                70, 60, 60, 60, 60, 80,  260, 260, 260, 260,  70, 60, 60, 70, 45, 45, 70, 420],
                           hit=35, slashAt=[5, 9, 17], holdAt=[26, 29], arcAt=34, blade=28, track='top', dash=18, cast=False),
    'knight:f/combo': dict(base='knight:f', ms=[50, 50, 60, 90,  40, 50, 50, 110,  40, 45, 50, 100,  45, 45, 45, 90,  40, 50, 50, 130,
                                                70, 60, 60, 60, 60, 80,  260, 260, 260, 260,  70, 60, 60, 70, 45, 45, 70, 420],
                           hit=35, slashAt=[5, 9, 17], holdAt=[26, 29], arcAt=34, blade=28, track='top', dash=18, cast=False),
    # Meteor (tools/assemble_meteor.py): rise into a hover, crush the flame in the hand ('crushAt'), open it on a tiny
    # spark ('openAt') that flies up off the screen ('sparkAt'), raise the arm and snap the fingers ('snapAt'); the
    # meteor falls while she holds the pose and lands on 'hit', then she floats back down. 'palm' / 'snapTip': where the
    # hand is, px from the feet (sprite facing as drawn); 'lift': how high she floats (px); 'flame': the hand flame's colour.
    'mage:f/meteor': dict(base='mage:f', ms=[120, 140, 220, 220, 70, 70, 120, 230, 230, 160, 420, 90, 70, 160, 300, 420, 200, 160, 300],
                          hit=16, meteor=dict(liftAt=0, crushAt=6, openAt=9, sparkAt=10, snapAt=13, downAt=16, palm=[25, -41], snapTip=[17, -62], lift=30, flame='#ff8a3c')),
    'mage:m/meteor': dict(base='mage:m', ms=[120, 140, 220, 220, 70, 70, 120, 230, 230, 160, 420, 90, 70, 160, 300, 420, 200, 160, 300],
                          hit=16, meteor=dict(liftAt=0, crushAt=6, openAt=9, sparkAt=10, snapAt=13, downAt=16, palm=[21, -36], snapTip=[16, -54], lift=30, flame='#5ab8ff')),
    'knight:m/power': dict(base='knight:m', ms=[60, 70, 90, 110, 120, 130, 140, 110, 90, 380], hit=9, aura=[1, 7], dashAt=7, dashFrames=8, upswing=9, dash=10, cast=False),
    'knight:f/power': dict(base='knight:f', ms=[60, 70, 110, 120, 130, 140, 110, 90, 380], hit=8, aura=[1, 6], dashAt=6, dashFrames=7, upswing=8, dash=10, cast=False),
}
for key, e in EXTRA.items():
    base = MOVES[e.pop('base')]; skin, mv = key.split('/')
    MOVES[key] = dict(dict(sheet=base['sheet'], shade=base['shade'], variants=base['variants'], cast=True, skin=skin, move=mv), **e)

def build(skin):
    m = MOVES[skin]
    mv = m.get('move', 'slash')
    src = Image.open(os.path.join(ART_SRC, 'atk', m['sheet'] + '_' + mv + '_src.png')).convert('RGBA')
    n = src.width // AW
    assert n == len(m['ms']) or (m.get('loop') and n > len(m['ms'])), (skin, n, len(m['ms']))
    out = Image.new('RGBA', (AW * n, AH * len(m['variants'])))
    for vi, hs in enumerate(m['variants']):
        for i in range(n):
            out.alpha_composite(m['shade'](src.crop((i * AW, 0, (i + 1) * AW, AH)), hs), (i * AW, vi * AH))
    name = m['sheet'] + '_' + mv + '.png'
    out.save(os.path.join(OUT_DIR, name))
    tips = None
    if m.get('track') == 'top':   # topmost pixel per frame (staff tip / arrow tip), relative to the feet
        tips = []
        for i in range(n):
            fr = src.crop((i * AW, 0, (i + 1) * AW, AH)); bb = fr.getbbox()
            y = bb[1]; xs = [x for x in range(AW) if fr.getpixel((x, y))[3]]
            tips.append([xs[len(xs) // 2] - AAX, y - AAY])
    path = os.path.join(OUT_DIR, 'manifest.json')
    man = json.load(open(path))
    man['heroes'][m.get('skin', skin)].setdefault('anims', {})[mv] = {
        'sheet': name, 'frame': [AW, AH], 'anchor': [AAX, AAY], 'frames': n, 'variants': len(m['variants']),
        'timeline': [[i, ms] for i, ms in enumerate(m['ms'])], 'hit': m.get('hit'), 'loop': m.get('loop'), 'trail': m.get('trail'), 'dashFrames': m.get('dashFrames', 4), 'dash': m.get('dash', 16),
        'cast': m.get('cast', False), 'strike': m.get('strike'), 'release': m.get('release'), 'charge': m.get('charge'), 'muzzle': m.get('muzzle'), 'zoom': m.get('zoom'),
        'tips': tips, 'chargeTo': m.get('chargeTo'), 'swing': m.get('swing'), 'aura': m.get('aura'), 'ring': m.get('ring'), 'upswing': m.get('upswing'), 'dashAt': m.get('dashAt'),
        'slashAt': m.get('slashAt'), 'holdAt': m.get('holdAt'), 'arcAt': m.get('arcAt'), 'blade': m.get('blade'), 'meteor': m.get('meteor')}
    json.dump(man, open(path, 'w'), indent=1)
    print('wrote', name, n, 'frames', sum(m['ms']), 'ms')

if __name__ == '__main__':
    import sys
    only = sys.argv[1:]   # e.g. knight:m/combo knight:f/combo; nothing = every move
    for k in MOVES:
        if not only or k in only: build(k)

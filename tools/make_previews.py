"""Builds an offline preview pack of every animation and visual effect.

Run (needs the game running locally, Playwright + ffmpeg):
    MATHFALL_TEST=1 PORT=3123 node server.js &
    python3 tools/make_previews.py <out_dir> [--no-battle]

Output (open index.html in any browser, no internet or server needed):
    heroes/<Class> (<Boy|Girl>)/*.gif   sprite-only animations at 4x (idle, every special move, all poses)
    battle/<Class> (<Boy|Girl>)/*.mp4   the real battle scene with all effects (from /dev/lab.html)
    battle/Treasure skills/<Class>/*.mp4
    enemies/*.gif                       every enemy's idle + attack + hurt
    sheets/*.png, events/*.png          the raw sprite sheets and event art
"""
import json, os, shutil, subprocess, sys, time, glob, html
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'public', 'art')
BASE = 'http://localhost:3123'
BG = (22, 20, 42, 255)
CLS_NAME = {'knight': 'Knight', 'mage': 'Mage', 'ranger': 'Ranger', 'cleric': 'Cleric'}
G_NAME = {'m': 'Boy', 'f': 'Girl'}
MOVE_NAME = {'slash': 'Attack - Slash (also Power Strike)', 'smite': 'Attack - Smite (lightning)', 'shoot': 'Attack - Shoot (also Poison Arrow)',
             'cast': 'Attack - Cast (also Fireball, Ice Shard)', 'defend': 'Defend', 'rally': 'Big move - Rally', 'channel': 'Big move - Channel',
             'volley': 'Big move - Volley', 'pray': 'Big move - Pray'}

def gif(frames, durs, path, scale=4):
    out = []
    for f in frames:
        c = Image.new('RGBA', (f.width * scale, f.height * scale), BG)
        c.alpha_composite(f.resize((f.width * scale, f.height * scale), Image.NEAREST))
        out.append(c.convert('RGB'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out[0].save(path, save_all=True, append_images=out[1:], duration=durs, loop=0, optimize=True)

def hero_gifs(out):
    man = json.load(open(os.path.join(ART, 'manifest.json')))['heroes']
    made = {}
    for skin, d in man.items():
        cls, g = skin.split(':')
        folder = os.path.join(out, 'heroes', '%s (%s)' % (CLS_NAME[cls], G_NAME[g]))
        sheet = Image.open(os.path.join(ART, d['sheet'])).convert('RGBA'); fw, fh = d['frame']
        cut = lambda c, r: sheet.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
        idle = [cut(*d['poses']['idle%d' % (i % 4)]) for i in range(12)]
        gif(idle, [260] * 12, os.path.join(folder, 'Idle.gif'))
        poses = list(d['poses'].items())
        strip = Image.new('RGBA', (fw * len(poses), fh))
        for i, (_, (c, r)) in enumerate(poses): strip.alpha_composite(cut(c, r), (i * fw, 0))
        gif([strip], [1000], os.path.join(folder, 'All poses.gif'), scale=3)
        for v in range(min(3, d.get('variants', 1))):
            gif([sheet.crop((0, v * fh, fw, (v + 1) * fh))], [1000], os.path.join(folder, 'Colour %d.gif' % (v + 1)))
        for name, an in d.get('anims', {}).items():
            im = Image.open(os.path.join(ART, an['sheet'])).convert('RGBA'); aw, ah = an['frame']
            frs = [im.crop((f * aw, 0, (f + 1) * aw, ah)) for f, _ in an['timeline']]
            durs = [max(20, ms) for _, ms in an['timeline']]; durs[-1] += 500
            gif(frs, durs, os.path.join(folder, MOVE_NAME.get(name, name) + '.gif'))
        made[skin] = folder
    return made

ENEMY_JS = """async ([kinds, poses]) => {
  const SP = await import('/js/sprites.js');
  const out = {};
  for (const k of kinds) { out[k] = {}; for (const p of poses) { try { out[k][p] = SP.enemyFrame(k, p, false).toDataURL(); } catch (e) {} } }
  return out; }"""

def enemy_gifs(out, page):
    import base64, io
    kinds = ['goblin', 'slime', 'skeleton', 'hexer', 'thrall', 'sentinel', 'shard', 'minotaur', 'wyrm', 'colossus', 'hollowking', 'voidmaw']
    poses = ['idle0', 'idle1', 'idle2', 'idle3', 'idle0', 'idle1', 'idle2', 'idle3', 'windup', 'attack', 'attack', 'idle0', 'hurt', 'idle0']
    data = page.evaluate(ENEMY_JS, [kinds, sorted(set(poses))])
    names = page.evaluate("Object.fromEntries(Object.entries(window.MF_Content.ENEMIES).map(([k, v]) => [k, v.name]))")
    for k in kinds:
        fr = {p: Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA') for p, u in data[k].items()}
        seq = [fr[p] for p in poses if p in fr]
        if not seq: continue
        gif(seq, [220] * len(seq), os.path.join(out, 'enemies', '%s.gif' % names.get(k, k)), scale=3)

def battle_clips(out, browser):
    import re
    C = browser.new_page()
    C.goto(BASE + '/dev/lab.html'); C.wait_for_function('window.MF_Content')
    info = C.evaluate("(() => { const C = window.MF_Content; return { heroes: Object.fromEntries(C.HERO_ORDER.map(c => [c, { skills: C.HEROES[c].skills, defend: C.HEROES[c].defend.name }])), skills: Object.fromEntries(Object.entries(C.SKILLS).filter(([k, v]) => v.fx).map(([k, v]) => [k, v.name])) }; })()")
    C.close()
    basic = {'knight': 'Slash', 'mage': 'Arcane Bolt', 'ranger': 'Quick Shot', 'cleric': 'Smite'}
    jobs = []
    for cls, h in info['heroes'].items():
        for g in 'mf':
            folder = os.path.join(out, 'battle', '%s (%s)' % (CLS_NAME[cls], G_NAME[g]))
            jobs.append((cls, g, 'attack', folder, '1 Attack - ' + basic[cls]))
            jobs.append((cls, g, 'defend', folder, '2 Defend - ' + h['defend']))
            for i, sk in enumerate(h['skills']): jobs.append((cls, g, sk, folder, '%d Skill - %s' % (i + 3, info['skills'][sk])))
        for sk, nm in info['skills'].items():
            if sk in h['skills']: continue
            jobs.append((cls, 'f', sk, os.path.join(out, 'battle', 'Treasure skills', CLS_NAME[cls]), nm))
    tmp = os.path.join(out, '_vid'); os.makedirs(tmp, exist_ok=True)
    for n, (cls, g, mv, folder, label) in enumerate(jobs):
        ctx = browser.new_context(viewport={'width': 1040, 'height': 640}, record_video_dir=tmp, record_video_size={'width': 1040, 'height': 640})
        t0 = time.time(); pg = ctx.new_page()
        pg.goto('%s/dev/lab.html?bare=1&loop=0&cls=%s&gender=%s&move=%s&enemy=goblin' % (BASE, cls, g, mv))
        pg.wait_for_function('window.scene'); t_ready = time.time() - t0
        pg.wait_for_timeout(1000 + 3300)
        vp = pg.video.path(); ctx.close()
        os.makedirs(folder, exist_ok=True)
        safe = re.sub(r'[\\/:*?"<>|]', '', label)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '%.2f' % (t_ready + 0.95), '-t', '3.3', '-i', vp,
                        '-vf', 'scale=780:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'veryfast', '-movflags', '+faststart', '-an',
                        os.path.join(folder, safe + '.mp4')], check=True)
        os.remove(vp)
        print('clip %d/%d %s' % (n + 1, len(jobs), label), flush=True)
    shutil.rmtree(tmp, ignore_errors=True)

def index_html(out):
    def section(title, files, kind):
        items = []
        for f in files:
            rel = os.path.relpath(f, out).replace(os.sep, '/')
            name = html.escape(os.path.splitext(os.path.basename(f))[0])
            media = ('<video src="%s" autoplay loop muted playsinline></video>' if kind == 'video' else '<img src="%s" loading="lazy" alt="">') % html.escape(rel)
            items.append('<figure>%s<figcaption>%s</figcaption></figure>' % (media, name))
        return '<h2>%s</h2><div class="grid %s">%s</div>' % (html.escape(title), kind, ''.join(items)) if items else ''
    parts = ['<h1>Mathfall – animation previews</h1><p class="note">Sprite animations (no effects) are GIFs; battle clips show the real game with every effect. '
             'To replay moves live at any speed, open <a href="https://mathfall.onrender.com/dev/lab.html">the Animation Lab</a>.</p>']
    for d in sorted(glob.glob(os.path.join(out, 'heroes', '*'))):
        parts.append(section('Hero sprites – ' + os.path.basename(d), sorted(glob.glob(os.path.join(d, '*.gif'))), 'img'))
    for d in sorted(glob.glob(os.path.join(out, 'battle', '*'))):
        if os.path.basename(d) == 'Treasure skills': continue
        parts.append(section('In battle – ' + os.path.basename(d), sorted(glob.glob(os.path.join(d, '*.mp4'))), 'video'))
    for d in sorted(glob.glob(os.path.join(out, 'battle', 'Treasure skills', '*'))):
        parts.append(section('Treasure skills – ' + os.path.basename(d), sorted(glob.glob(os.path.join(d, '*.mp4'))), 'video'))
    parts.append(section('Enemies', sorted(glob.glob(os.path.join(out, 'enemies', '*.gif'))), 'img'))
    parts.append(section('Event art', sorted(glob.glob(os.path.join(out, 'events', '*.png'))), 'img'))
    parts.append(section('Raw sprite sheets', sorted(glob.glob(os.path.join(out, 'sheets', '*.png'))), 'img sheets'))
    page = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mathfall previews</title>
<style>body{margin:0;padding:20px 24px 60px;background:#0f0d1c;color:#efe8ff;font:15px system-ui,sans-serif}h1{margin:0 0 6px;color:#e8b85a}
h2{margin:30px 0 10px;font-size:17px;border-bottom:1px solid #2d2a52;padding-bottom:6px}.note{color:#a59fc8}a{color:#9fd0ff}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}.grid.video{grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
.grid.sheets{grid-template-columns:1fr}figure{margin:0;background:#16142a;border:1px solid #2d2a52;border-radius:8px;padding:8px}
img,video{display:block;max-width:100%;image-rendering:pixelated;border-radius:4px;margin:0 auto}figcaption{margin-top:6px;font-size:13px;color:#c9c2ea}</style></head>
<body>""" + ''.join(parts) + '</body></html>'
    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)

if __name__ == '__main__':
    out = os.path.abspath(sys.argv[1]); os.makedirs(out, exist_ok=True)
    for sub in ('sheets', 'events'): os.makedirs(os.path.join(out, sub), exist_ok=True)
    for f in glob.glob(os.path.join(ART, '*.png')): shutil.copy(f, os.path.join(out, 'sheets'))
    for f in glob.glob(os.path.join(ART, 'events', '*.png')): shutil.copy(f, os.path.join(out, 'events'))
    hero_gifs(out); print('hero gifs done', flush=True)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(); pg.goto(BASE + '/dev/lab.html'); pg.wait_for_function('window.MF_Content'); pg.wait_for_timeout(1500)
        enemy_gifs(out, pg); pg.close(); print('enemy gifs done', flush=True)
        if '--no-battle' not in sys.argv: battle_clips(out, b)
        b.close()
    index_html(out); print('wrote', os.path.join(out, 'index.html'))

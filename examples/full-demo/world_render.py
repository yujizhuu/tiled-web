#!/usr/bin/env python3
"""World overview: render every map of a .world (explicit maps + pattern matches, via `tiled-web world info`)
and composite at world offsets. Per-map rendering uses official `tmxrasterizer` when installed, else render.py.
usage: world_render.py file.world out.png [scale=2] [--plain]
--plain: no padding/labels/trim, transparent background (same framing as `tmxrasterizer file.world`), for validate.sh"""
import json, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__)); CLI = os.path.join(HERE, '..', '..', 'cli', 'bin', 'tiled-web.js')
PLAIN = '--plain' in sys.argv; argv = [a for a in sys.argv if a != '--plain']
world, out = argv[1], argv[2]; S = int(argv[3]) if len(argv) > 3 else 2
info = json.loads(subprocess.check_output(['node', CLI, 'world', 'info', world]))
wdir = os.path.dirname(os.path.abspath(world)); tmp = tempfile.mkdtemp()
use_tr = shutil.which('tmxrasterizer') is not None
env = dict(os.environ, QT_QPA_PLATFORM='offscreen')
tiles = []
for i, e in enumerate(info['resolvedMaps']):
    f = os.path.join(wdir, e['fileName']); m = json.load(open(f)); png = os.path.join(tmp, f'{i}.png')
    ox = oy = 0
    if m.get('infinite'):  # rendered image starts at the chunk bounding box, not tile (0,0)
        cs = [c for l in m['layers'] for c in l.get('chunks', [])]
        ox = min(c['x'] for c in cs) * m['tilewidth']; oy = min(c['y'] for c in cs) * m['tileheight']
    if use_tr:
        subprocess.run(['tmxrasterizer', '--scale', str(S), f, png], check=True, env=env, stderr=subprocess.DEVNULL)
    else:
        subprocess.run([sys.executable, os.path.join(HERE, 'render.py'), f, png], check=True, stdout=subprocess.DEVNULL)
        im = Image.open(png); im.resize((im.width * S // 2, im.height * S // 2), 0).save(png)
    im = Image.open(png).convert('RGBA')
    if m.get('infinite') and im.getbbox() and not PLAIN:  # trim empty chunk area around an infinite map
        bx, by, bx2, by2 = im.getbbox(); im = im.crop((bx, by, bx2, by2)); ox += bx / S; oy += by / S
    tiles.append((e, im, e['x'] + ox, e['y'] + oy))
x0 = min(x for _, _, x, _ in tiles); y0 = min(y for _, _, _, y in tiles)
x1 = max(x + im.width / S for _, im, x, _ in tiles); y1 = max(y + im.height / S for _, im, _, y in tiles)
pad = 0 if PLAIN else 8; W = int((x1 - x0) * S) + 2 * pad; H = int((y1 - y0) * S) + 2 * pad
canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0) if PLAIN else (24, 26, 36, 255)); dr = ImageDraw.Draw(canvas)
for e, im, x, y in tiles:
    px, py = int((x - x0) * S) + pad, int((y - y0) * S) + pad
    canvas.alpha_composite(im, (px, py))
for e, im, x, y in ([] if PLAIN else tiles):  # world rect (entry x/y/width/height) + name
    px, py = int((e['x'] - x0) * S) + pad, int((e['y'] - y0) * S) + pad
    w, h = (e.get('width') or im.width / S) * S, (e.get('height') or im.height / S) * S
    if not json.load(open(os.path.join(wdir, e['fileName']))).get('infinite'):
        dr.rectangle([px, py, px + w - 1, py + h - 1], outline=(255, 255, 255, 150))
    dr.text((px + 4, py + 3), f"{e['fileName']} ({e['x']},{e['y']})", fill=(255, 255, 255, 255))
(canvas if PLAIN else canvas.convert('RGB')).save(out)
print('world render', out, canvas.size, 'maps:', len(tiles), 'renderer:', 'tmxrasterizer' if use_tr else 'render.py')

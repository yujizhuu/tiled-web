#!/usr/bin/env python3
"""Tiny TMJ renderer (orthogonal, finite or infinite) → PNG. Honors external .tsx, flip bits
(H 0x80000000, V 0x40000000, D 0x20000000), layer visibility/opacity, and draws objects.
usage: render.py map.tmj out.png [scale]"""
import json, os, sys, re
from PIL import Image, ImageDraw
mp, out = sys.argv[1], sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 2
m = json.load(open(mp)); base = os.path.dirname(os.path.abspath(mp))
TW, TH = m["tilewidth"], m["tileheight"]
sets = []
for ts in m["tilesets"]:
    d, tdir = dict(ts), base
    if "source" in ts:
        path = os.path.join(base, ts["source"]); x = open(path, encoding="utf8").read(); tdir = os.path.dirname(path)
        a = dict(re.findall(r'(\w+)="([^"]*)"', re.search(r"<tileset\b([^>]*)>", x).group(1)))
        img = dict(re.findall(r'(\w+)="([^"]*)"', re.search(r"<image\b([^>]*)/?>", x).group(1)))
        d.update(columns=int(a["columns"]), tilewidth=int(a["tilewidth"]), tileheight=int(a["tileheight"]), image=img["source"])
    d["_img"] = Image.open(os.path.join(tdir, d["image"])).convert("RGBA")
    sets.append(d)
sets.sort(key=lambda t: t["firstgid"])
def tile_img(raw):
    gid = raw & 0x0FFFFFFF
    ts = [t for t in sets if t["firstgid"] <= gid][-1]
    lid = gid - ts["firstgid"]; c = ts["columns"]; w, h = ts["tilewidth"], ts["tileheight"]
    im = ts["_img"].crop(((lid % c) * w, (lid // c) * h, (lid % c) * w + w, (lid // c) * h + h))
    if raw & 0x20000000: im = im.transpose(Image.Transpose.TRANSPOSE)   # anti-diagonal first (Tiled order)
    if raw & 0x80000000: im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if raw & 0x40000000: im = im.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return im
cells = []  # (layerindex, x, y, raw)
def tiles_of(l):
    if "chunks" in l:
        for c in l["chunks"]:
            for i, g in enumerate(c["data"]): yield c["x"] + i % c["width"], c["y"] + i // c["width"], g
    else:
        for i, g in enumerate(l["data"]): yield i % l["width"], i // l["width"], g
allc = [(x, y) for l in m["layers"] if l["type"] == "tilelayer" for x, y, g in tiles_of(l) if g]
ox = min([0] + [x for x, _ in allc]); oy = min([0] + [y for _, y in allc])
W = max([m["width"]] + [x + 1 for x, _ in allc]) - ox; H = max([m["height"]] + [y + 1 for _, y in allc]) - oy
canvas = Image.new("RGBA", (W * TW, H * TH), (20, 20, 28, 255))
dr = ImageDraw.Draw(canvas)
for l in m["layers"]:
    if not l.get("visible", True): continue
    if l["type"] == "tilelayer":
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        for x, y, g in tiles_of(l):
            if g: im = tile_img(g); layer.alpha_composite(im, ((x - ox) * TW, (y - oy) * TH + TH - im.height))
        if l.get("opacity", 1) < 1:
            a = layer.getchannel("A").point(lambda v: int(v * l["opacity"])); layer.putalpha(a)
        if l["name"].lower() == "shadow":   # shadow tiles drawn semi-transparent for readability
            a = layer.getchannel("A").point(lambda v: int(v * 0.6)); layer.putalpha(a)
        canvas.alpha_composite(layer)
    elif l["type"] == "objectgroup":
        for o in l["objects"]:
            x, y = o["x"] - ox * TW, o["y"] - oy * TH
            if o.get("gid"): im = tile_img(o["gid"]); canvas.alpha_composite(im, (int(x), int(y - im.height)))   # tile objects: bottom-left anchor
            elif o.get("point"): dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 0, 255))
            elif o.get("ellipse"): dr.ellipse([x, y, x + o["width"], y + o["height"]], outline=(0, 255, 255, 255))
            elif o.get("polygon"): dr.polygon([(x + p["x"], y + p["y"]) for p in o["polygon"]], outline=(255, 128, 0, 255))
            else: dr.rectangle([x, y, x + max(o.get("width", 0), 1) - 1, y + max(o.get("height", 0), 1) - 1], outline=(255, 0, 255, 255))
            if o.get("name") and o.get("name") != "Village": dr.text((x + 2, y - 10), o["name"], fill=(255, 255, 255, 255))
canvas = canvas.resize((canvas.width * S, canvas.height * S), Image.NEAREST)
canvas.save(out); print("rendered", out, canvas.size)

#!/usr/bin/env bash
# 用上游官方 Tiled（apt 包 `tiled`，含 tmxrasterizer）对 build.sh 的产物做"真值"校验。
# 需要: tiled, tmxrasterizer, xvfb-run(仅自动地图对照), python3。未安装则跳过。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE/out"
command -v tmxrasterizer >/dev/null || { echo "SKIP: 未安装 tiled（sudo apt install tiled xvfb）"; exit 0; }
export QT_QPA_PLATFORM=offscreen
V=validate; rm -rf $V; mkdir -p $V

echo "== 1. tmxrasterizer 渲染 TMX/TMJ/压缩变体/无限图/World（能打开 = 格式被上游接受）=="
for f in village.tmj village.tmx village.zlib.tmx village.gzip.tmx cave.tmj cave.tmx forest.tmj lake.tmj field.tmj demo.world; do
  tmxrasterizer --scale 2 "$f" "$V/${f}.png" 2>/dev/null; echo "  ok  $f"
done
python3 - <<'PY'
from PIL import Image, ImageChops
a = Image.open("validate/village.tmx.png")
for f in ["village.tmj", "village.zlib.tmx", "village.gzip.tmx"]:
    assert ImageChops.difference(a, Image.open(f"validate/{f}.png")).getbbox() is None, f
print("  TMX(csv/zlib/gzip) 与 TMJ 渲染像素一致")
PY

echo "== 2. tiled --export-map：上游解析后再导出 JSON，与 CLI 结果逐字段对比 =="
for f in village.tmx village.tmj cave.tmx; do tiled --export-map json "$f" "$V/$f.json" 2>/dev/null; done
python3 - <<'PY'
import json, base64, gzip, zlib, struct
def data(l):
    d = l.get("data")
    if isinstance(d, str):
        raw = base64.b64decode(d); c = l.get("compression", "")
        raw = gzip.decompress(raw) if c == "gzip" else zlib.decompress(raw) if c == "zlib" else raw
        return list(struct.unpack("<%dI" % (len(raw) // 4), raw))
    return d
def norm(m):
    out = {"props": sorted((p["name"], p["value"]) for p in m.get("properties", [])), "layers": []}
    for l in m["layers"]:
        e = {"name": l["name"], "type": l["type"], "props": sorted((p["name"], p["value"]) for p in l.get("properties", []))}
        if "chunks" in l: e["chunks"] = [(c["x"], c["y"], data(dict(c, compression=l.get("compression", "")))) for c in l["chunks"]]
        elif "data" in l: e["data"] = data(l)
        if "objects" in l:
            e["objects"] = [(o["id"], o.get("name"), o.get("gid", 0), round(o["x"]), round(o["y"]),
                             "point" if o.get("point") else "ellipse" if o.get("ellipse") else "polygon" if "polygon" in o else "rect",
                             sorted((p["name"], p["value"]) for p in o.get("properties", []))) for o in l["objects"]]
        out["layers"].append(e)
    return out
ours = json.load(open("village.tmj"))
for f in ["validate/village.tmx.json", "validate/village.tmj.json"]:
    assert norm(json.load(open(f))) == norm(ours), f
for f in ["validate/cave.tmx.json"]:
    assert norm(json.load(open(f))) == norm(json.load(open("cave.tmj"))), f
print("  村庄/洞穴：图块数据、翻转位、对象、属性 与上游解析结果一致")
PY

echo "== 3. 自动地图对照：上游 Tiled AutoMapper 跑同一套 rules.txt =="
if command -v xvfb-run >/dev/null; then
  EXT="$HOME/.config/tiled/extensions"; mkdir -p "$EXT"; S="$EXT/zz_tiledweb_validate.js"
  cat > "$S" <<JS
try {
  var m = tiled.open("$HERE/out/village.pre-automap.tmj");
  m.autoMap("$HERE/rules/rules.txt");
  tiled.mapFormat("json").write(m, "$HERE/out/$V/upstream_automap.tmj");
} catch (e) { var f = new TextFile("$HERE/out/$V/automap_err.txt", TextFile.WriteOnly); f.write(String(e)); f.close(); }
tiled.trigger("Quit");
JS
  timeout 60 xvfb-run -a tiled >/dev/null 2>&1 || true
  rm -f "$S"
  python3 - <<'PY'
import json
u = json.load(open("validate/upstream_automap.tmj")); c = json.load(open("village.tmj"))
L = lambda m, n: [l for l in m["layers"] if l["name"] == n][0]["data"]
assert L(u, "Shadow") == L(c, "Shadow"), "Shadow 层与上游不一致"
print("  Shadow 层（自动地图输出）与上游 Tiled 完全一致：%d 个阴影格" % sum(1 for g in L(c, "Shadow") if g))
PY
else
  echo "  SKIP: 无 xvfb-run"
fi
echo "== 4. World：上游 tmxrasterizer 加载 .world（含 patterns）并与 CLI 解析逐像素对照 =="
for w in demo.world regions/regions.world; do
  n=$(basename $w .world)
  tmxrasterizer --scale 2 "$w" "$V/$n.upstream.png" 2>/dev/null
  python3 ../world_render.py "$w" "$V/$n.cli.png" 2 --plain >/dev/null
  node ../../../cli/bin/tiled-web.js world info "$w" > "$V/$n.info.json"
done
python3 - <<'PY'
import json
from PIL import Image, ImageChops
for n, need in [("demo", 5), ("regions", 6)]:
    info = json.load(open(f"validate/{n}.info.json")); maps = info["resolvedMaps"]
    assert len(maps) == need, (n, len(maps))
    up = Image.open(f"validate/{n}.upstream.png").convert("RGBA"); me = Image.open(f"validate/{n}.cli.png").convert("RGBA")
    assert up.size == me.size, (n, up.size, me.size)   # 上游按同样的 maps/patterns 坐标拼出同样大小的世界
    bb = ImageChops.difference(up, me).getbbox()
    # 允许的唯一差异：村庄 Zone 矩形对象的描边在地图上沿外 1px（单图渲染被裁掉，整世界渲染能画出来）
    assert bb is None or bb[3] - bb[1] <= 1, (n, bb)
    src = "patterns 正则" if n == "regions" else "显式 maps"
    print(f"  {n}.world（{src}）：上游加载 {len(maps)} 张图，世界尺寸 {up.size[0]//2}×{up.size[1]//2}px，逐像素一致" + ("" if bb is None else "（仅 1px 对象描边差）"))
PY
echo "VALIDATE OK"

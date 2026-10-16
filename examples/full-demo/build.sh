#!/usr/bin/env bash
# 像素村 (Pixel Village) — 用 tiled-web CLI 从零构建一张示例地图，覆盖所有 CLI 命令。
# 仅调用 `node cli/bin/tiled-web.js ...` + 少量 shell。输出在 out/。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$HERE"
t() { echo "+ tiled-web $*" >&2; node "$ROOT/cli/bin/tiled-web.js" "$@"; }
q() { t "$@" >/dev/null; }
O=out
rm -rf "$O"; mkdir -p "$O"
M=$O/village.tmj

echo "== 0. version =="
t version

echo "== 1. 新建地图 + 外部图块集(.tsx) =="
q new --width 20 --height 14 --tilewidth 16 --tileheight 16 -o $M
q tileset add $M --firstgid 1 --source village.tsx          # 外部 .tsx 引用（含 terraintypes / wangsets）
q tileset add $M --firstgid 33 --name items --image tiles.png --tilewidth 16 --tileheight 16   # 内嵌图块集（自动读 PNG 尺寸）
t tileset list $M

echo "== 2. 图层管理 =="
q layer rename $M --layer 0 --name Ground
q layer add $M --name Walls --type tile
q layer add $M --name Shadow --type tile
q layer add $M --name Deco --type tile
q layer add $M --name Temp --type tile
q layer add $M --name Objects --type object
q layer remove $M --layer Temp
t layer list $M

echo "== 3. 铺瓦: fill / set-tile(含翻转) =="
q fill $M --layer Ground --x 0 --y 0 --width 20 --height 14 --gid 1     # 草地
q fill $M --layer Ground --x 0 --y 7 --width 20 --height 1 --gid 10     # 东西向道路
q fill $M --layer Ground --x 9 --y 7 --width 1 --height 7 --gid 10      # 向南道路
q fill $M --layer Ground --x 14 --y 9 --width 4 --height 3 --gid 3      # 池塘
q fill $M --layer Walls  --x 2 --y 2 --width 5 --height 4 --gid 4       # 房屋 A 外墙
q fill $M --layer Walls  --x 3 --y 3 --width 3 --height 2 --gid 0       # 掏空
q fill $M --layer Ground --x 3 --y 3 --width 3 --height 2 --gid 6       # 室内地板
q set-tile $M --layer Walls --x 4 --y 5 --gid 8                         # 门
q set-tile $M --layer Deco --x 1 --y 10 --gid 7                         # 树（原样）
q set-tile $M --layer Deco --x 3 --y 10 --gid 7 --flip-h                # 水平翻转 0x80000000
q set-tile $M --layer Deco --x 5 --y 10 --gid 7 --flip-v                # 垂直翻转 0x40000000
q set-tile $M --layer Deco --x 7 --y 10 --gid 7 --flip-h --flip-d       # 旋转90° = H|D
q get-layer $M --layer Ground --format csv -o $O/ground.csv
t get-layer $M --layer Deco --format json | head -c 300; echo

echo "== 4. 图章: 复制房屋 A 粘贴为房屋 B =="
q stamp copy $M --layer Walls --x 2 --y 2 --width 5 --height 4 -o $O/house.stamp.json
q stamp paste $M --layer Walls --x 12 --y 1 --stamp $O/house.stamp.json
q stamp copy $M --layer Ground --x 3 --y 3 --width 3 --height 2 -o $O/floor.stamp.json
q stamp paste $M --layer Ground --x 13 --y 2 --stamp $O/floor.stamp.json

echo "== 5. replace-gid: 房屋 B 的门换成箱子图块(演示) 再换回 =="
q replace-gid $M --layer Walls --from 8 --to 9
q replace-gid $M --layer Walls --from 9 --to 8
q replace-gid $M --layer Deco --from 7 --to 7 --match-flips

echo "== 6. 自动地图: 墙下自动加阴影 (rules/shadow.tmj) =="
R=rules/shadow.tmj
q new --width 1 --height 2 --tilewidth 16 --tileheight 16 -o $R
q tileset add $R --firstgid 1 --source ../village.tsx
q layer rename $R --layer 0 --name regions
q fill $R --layer regions --x 0 --y 0 --width 1 --height 2 --gid 1
q layer add $R --name input_Walls --type tile
q set-tile $R --layer input_Walls --x 0 --y 0 --gid 4
q layer add $R --name inputnot_Walls --type tile
q set-tile $R --layer inputnot_Walls --x 0 --y 1 --gid 4
q layer add $R --name output_Shadow --type tile
q set-tile $R --layer output_Shadow --x 0 --y 1 --gid 5
cp $M $O/village.pre-automap.tmj                                        # 留一份给 validate.sh 用上游 Tiled 自动地图对照
t automap $M --rules rules/rules.txt
q automap $M --rules rules/rules.txt --radius 2 --x 4 --y 5          # 局部重跑（半径裁剪）

echo "== 7. 对象: 全部形状 + 模板 =="
q object add $M --layer Objects --name Spawn --type Player --x 72 --y 120 --shape point
q object add $M --layer Objects --name Village --type Zone --x 0 --y 0 --width 320 --height 224
q object add $M --layer Objects --name Pond --type Water --x 224 --y 144 --width 64 --height 48 --shape ellipse
q object add $M --layer Objects --name Fence --type Collision --x 16 --y 176 --shape polygon --points "0,0 48,0 48,16 0,16"
q object add $M --layer Objects --name Tmp --class Junk --x 1 --y 1 --width 8 --height 8
q object add $M --layer Spawns --name Enemy --type Slime --x 260 --y 40 --shape point --create-layer
q object update $M --layer Objects --id 1 --x 72 --y 124 --new-name PlayerSpawn
q object remove $M --layer Objects --name Tmp
t template info templates/chest.tx >/dev/null
t template index templates
q template apply $M --layer Objects --template templates/chest.tx --x 64 --y 64
q template apply $M --layer Objects --template templates/sign.tj --x 150 --y 100
t object list $M --layer Objects | head -c 400; echo

echo "== 8. 自定义属性 (map/layer/object/tileset) + 自定义类型 =="
q prop types add $M --name Faction --type enum --values villager,monster,neutral --use-as property
q prop types add $M --name Stats --type class --members '[{"name":"hp","type":"int","value":10},{"name":"speed","type":"float","value":1.5}]' --use-as property,object --color '#ff55aa00' --draw-fill
q prop types add $M --name Junk --type enum --values a,b
q prop types remove $M --name Junk
t prop types list $M | head -c 300; echo
t prop types get $M --name Stats >/dev/null
t prop types get $M --name Stats --no-expand >/dev/null
P=$O/village.tiled-project                                              # 上游 Tiled 把类型存放在项目文件里
q prop types add $P --name Faction --type enum --values villager,monster,neutral --use-as property
q prop types add $P --name Stats --type class --members '[{"name":"hp","type":"int","value":10}]' --use-as property,object
q prop set $M --target map --name title --value "像素村"
q prop set $M --target map --name difficulty --value 2 --type int
q prop set $M --target layer --layer Walls --name collision --value true --type bool
q prop set $M --target object --layer Objects --id 1 --name speed --value 1.25 --type float
q prop set $M --target tileset --tileset items --name kind --value pickups
q prop set $M --target map --name tmp --value x
q prop remove $M --target map --name tmp
t prop get $M --target map --name title
t prop list $M --target layer --layer Walls >/dev/null
t prop list $M --target object --layer Objects --id 1 >/dev/null
t prop list $M --target tileset --tileset items >/dev/null

echo "== 9. 洞穴: 无限地图 (chunks) =="
C=$O/cave.tmj
q new --width 16 --height 16 --tilewidth 16 --tileheight 16 --infinite -o $C
q tileset add $C --firstgid 1 --source ../village.tsx
q fill $C --x -4 --y -3 --width 24 --height 6 --gid 4
q fill $C --x -3 --y -2 --width 22 --height 4 --gid 6
q set-tile $C --x 18 --y 0 --gid 9
q stamp copy $C --layer 0 --x -4 --y -3 --width 3 --height 3 -o $O/cave.stamp.json
q stamp paste $C --layer 0 --x 30 --y 30 --stamp $O/cave.stamp.json
t info $C

echo "== 10. 坐标换算: ortho / iso / hex / staggered =="
t coord tile-to-pixel $M --x 4 --y 5
t coord pixel-to-tile $M --x 70 --y 85
q new --width 8 --height 8 --tilewidth 32 --tileheight 16 --orientation isometric -o $O/iso.tmj
q tileset add $O/iso.tmj --firstgid 1 --source ../village.tsx --embed          # 把 .tsx 内嵌进地图（含地形/Wang）
t terrain list $O/iso.tmj >/dev/null
q new --width 8 --height 8 --tilewidth 32 --tileheight 32 --orientation hexagonal --staggeraxis y --staggerindex odd --hexsidelength 16 -o $O/hex.tmj
q new --width 8 --height 8 --tilewidth 32 --tileheight 16 --orientation staggered --staggeraxis y --staggerindex odd -o $O/stag.tmj
t coord tile-to-pixel $O/iso.tmj --x 2 --y 1
t coord pixel-to-tile $O/iso.tmj --x 128 --y 24
t coord tile-to-pixel $O/hex.tmj --x 2 --y 1
t coord pixel-to-tile $O/hex.tmj --x 96 --y 40                   # 六边形中心 → (2,1)
t coord tile-to-pixel $O/stag.tmj --x 2 --y 1                    # staggered → (80,8)
t coord pixel-to-tile $O/stag.tmj --x 81 --y 9                   # 菱形外角 → 邻格 (2,0)
t coord tile-to-pixel --orientation isometric --tilewidth 64 --tileheight 32 --width 4 --height 4 --x 1 --y 0

echo "== 11. Wang / 地形 (只读) =="
t wang list $M
t terrain list $M

echo "== 12. World: 村庄 + 洞穴 =="
W=$O/demo.world
q world new -o $W
q world add-map $W --file village.tmj --x 0 --y 0 --width 320 --height 224   # 显式尺寸
q world add-map $W --file cave.tmj --x 320 --y 0
q world add-map $W --file iso.tmj --x 0 --y 224      # 省略尺寸 → 自动从地图读取
q world remove-map $W --file iso.tmj
t world info $W

echo "== 13. MCP stdio =="
python3 "$HERE/mcp_demo.py" "$ROOT/cli/mcp-server.js" "$HERE/$M"

echo "== 14. 信息 + 导出 =="
t info $M --format text
q export $M -f tmx -o $O/village.tmx
q export $M -f tmx --encoding base64 --compression zlib -o $O/village.zlib.tmx
q export $M -f tmx --encoding base64 --compression gzip -o $O/village.gzip.tmx
q export $M -f csv -o $O/village.csv
q export $O/village.tmx -f tmj -o $O/village.roundtrip.tmj      # TMX → TMJ 回读
q export $C -f tmx --encoding base64 --compression gzip -o $O/cave.tmx
t info $O/village.zlib.tmx >/dev/null

echo "== 15. 预览图 =="
python3 "$HERE/render.py" "$M" "$O/village.png"
python3 "$HERE/render.py" "$C" "$O/cave.png"
echo "OK → $HERE/$O"

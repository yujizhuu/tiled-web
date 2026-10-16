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
q tileset add $M --firstgid 33 --name items --image items.png --tilewidth 16 --tileheight 16   # 内嵌图块集（自动读 PNG 尺寸）
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
# 装点：花丛 / 灌木 / 草丛 / 石头 / 荷叶 / 路灯 / 水井 / 木桶 / 栅栏
for xy in "1 1" "8 2" "11 5" "18 3" "2 12" "12 12" "19 12"; do set -- $xy; q set-tile $M --layer Deco --x $1 --y $2 --gid 11; done
for xy in "0 4" "8 5" "17 5" "11 10" "0 13"; do set -- $xy; q set-tile $M --layer Deco --x $1 --y $2 --gid 16; done
for xy in "7 1" "10 3" "6 12" "13 8" "19 0"; do set -- $xy; q set-tile $M --layer Deco --x $1 --y $2 --gid 29; done
q set-tile $M --layer Deco --x 18 --y 8 --gid 23
q set-tile $M --layer Deco --x 15 --y 10 --gid 30
q set-tile $M --layer Deco --x 16 --y 9 --gid 30
q set-tile $M --layer Deco --x 8 --y 6 --gid 28
q set-tile $M --layer Deco --x 10 --y 8 --gid 28
q set-tile $M --layer Deco --x 10 --y 5 --gid 27
q set-tile $M --layer Deco --x 6 --y 6 --gid 32
q fill $M --layer Deco --x 1 --y 11 --width 3 --height 1 --gid 25
# 道具图块集 items（firstgid 33，items.png）：金币/宝石/药水/钥匙/剑/盾/爱心/食物/星星
for xyg in "5 8 33" "6 8 34" "18 1 35" "19 6 36" "1 6 37" "14 2 39" "15 2 40" "3 3 46" "15 3 44" "13 3 45" "2 9 42" "12 6 48" "19 13 55" "7 13 50"; do
  set -- $xyg; q set-tile $M --layer Deco --x $1 --y $2 --gid $3; done
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
q fill $C --x -4 --y -3 --width 24 --height 6 --gid 15   # 洞壁
q fill $C --x -3 --y -2 --width 22 --height 4 --gid 14   # 洞底
q set-tile $C --x 18 --y 0 --gid 9
q stamp copy $C --layer 0 --x -4 --y -3 --width 3 --height 3 -o $O/cave.stamp.json
q stamp paste $C --layer 0 --x 20 --y -3 --stamp $O/cave.stamp.json   # 隧道尽头的小石室
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

echo "== 12. World（一）: 显式列表 2×2 + 洞穴 —— 道路/河流跨地图边界接上 =="
# 每张 20×14 = 320×224 px。村庄(0,0) 森林(320,0) / 湖泊(0,224) 田野(320,224)；洞穴在森林东侧。
# 接缝：村庄东西大路 y=7 → 森林；村庄南路 x=9 → 湖泊；森林南路 x=9 → 田野；湖泊河流 y=6..7 → 田野。
newmap() { q new --width 20 --height 14 --tilewidth 16 --tileheight 16 -o "$1"; q tileset add "$1" --firstgid 1 --source ../village.tsx
  q layer rename "$1" --layer 0 --name Ground; q layer add "$1" --name Deco --type tile; q fill "$1" --layer Ground --x 0 --y 0 --width 20 --height 14 --gid 1; }
g() { q fill "$1" --layer Ground --x $2 --y $3 --width $4 --height $5 --gid $6; }       # Ground 矩形
d() { q fill "$1" --layer Deco --x $2 --y $3 --width $4 --height $5 --gid $6; }         # Deco 矩形
dt() { local f=$1 gid=$2; shift 2; for xy in "$@"; do set -- $xy; q set-tile $f --layer Deco --x $1 --y $2 --gid $gid; done; }

F=$O/forest.tmj; newmap $F                                                          # 森林
g $F 0 7 20 1 10; g $F 9 8 1 6 10                                                   # 大路接村庄、南路接田野
g $F 3 2 4 2 2; g $F 13 10 3 2 2                                                    # 林间空地（土）
d $F 0 0 20 6 7; d $F 0 9 8 5 7; d $F 11 9 9 5 7; d $F 0 8 20 1 0; d $F 0 6 20 1 0 # 密林，路两侧留出一行
d $F 2 1 6 4 0; d $F 12 9 5 4 0                                                     # 挖出两块空地
dt $F 24 "3 2" "6 3" "13 10" "15 11" "18 6"; dt $F 11 "4 3" "5 1" "14 9" "16 12"; dt $F 16 "2 4" "12 12" "8 6" "11 8"
dt $F 23 "7 2" "12 10"; dt $F 26 "10 8"; dt $F 29 "1 6" "4 8" "15 6" "19 8"

L=$O/lake.tmj; newmap $L                                                            # 湖泊
g $L 1 1 8 12 12; g $L 2 2 6 10 3                                                   # 沙岸 + 湖
g $L 8 5 12 4 12; g $L 7 6 13 2 3                                                   # 河（沙岸），向东流入田野
g $L 9 0 1 5 10; g $L 9 9 1 5 10; g $L 9 5 1 4 6                                    # 南路，过河处木桥
dt $L 30 "3 4" "5 8" "6 3" "4 10" "14 7"; dt $L 23 "1 1" "8 12" "17 5"; dt $L 7 "11 1" "13 2" "16 1" "18 3" "0 13" "12 11" "15 12" "18 11"
dt $L 16 "11 3" "15 10" "19 13"; dt $L 11 "12 2" "17 11" "11 12"; dt $L 29 "14 3" "10 10" "1 0"; dt $L 28 "10 4" "10 9"

D=$O/field.tmj; newmap $D                                                           # 田野
g $D 0 5 20 4 12; g $D 0 6 15 2 3; g $D 13 6 2 8 3; g $D 12 8 4 6 12; g $D 13 8 2 6 3 # 河从湖泊流入后折向南
g $D 9 0 1 14 10; g $D 9 5 1 4 6                                                    # 北路接森林，木桥过河
g $D 1 1 7 3 2; g $D 1 10 7 3 2; g $D 16 1 3 3 2                                    # 农田（土）
for y in 1 3 10 12; do d $D 1 $y 7 1 29; done; d $D 16 2 3 1 11                     # 庄稼行 + 花圃
d $D 1 4 7 1 25; d $D 1 13 7 1 25                                                   # 栅栏
dt $D 27 "11 2"; dt $D 32 "12 2" "11 11"; dt $D 26 "10 4"; dt $D 7 "18 10" "19 12" "17 13" "0 9" "19 4"; dt $D 16 "11 9" "17 9"

W=$O/demo.world
q world new -o $W
q world add-map $W --file village.tmj --x 0 --y 0 --width 320 --height 224   # 显式尺寸
q world add-map $W --file forest.tmj --x 320 --y 0                           # 省略尺寸 → 自动从地图读取
q world add-map $W --file lake.tmj --x 0 --y 224
q world add-map $W --file field.tmj --x 320 --y 224
q world add-map $W --file cave.tmj --x 704 --y 48                            # 无限地图：(−4,−3) 号格对齐森林东缘
q world add-map $W --file iso.tmj --x 0 --y 448
q world remove-map $W --file iso.tmj                                         # 演示移除
t world info $W >/dev/null

echo "== 12b. World（二）: patterns 正则自动收图 region_X_Y.tmj =="
RG=$O/regions; mkdir -p $RG
# 3×2 块 10×10 图块（160px），全局坐标画一座跨 6 张图的岛：gfill gid gx gy w h 自动裁到各区域
for rx in 0 1 2; do for ry in 0 1; do f=$RG/region_${rx}_${ry}.tmj
  q new --width 10 --height 10 --tilewidth 16 --tileheight 16 -o $f; q tileset add $f --firstgid 1 --source ../../village.tsx
  q fill $f --x 0 --y 0 --width 10 --height 10 --gid 3; q layer add $f --name Deco --type tile; done; done
gfill() { local layer=$1 gid=$2 gx=$3 gy=$4 w=$5 h=$6 rx ry x0 y0 x1 y1
  for rx in 0 1 2; do for ry in 0 1; do
    x0=$(( gx > rx*10 ? gx : rx*10 )); y0=$(( gy > ry*10 ? gy : ry*10 ))
    x1=$(( gx+w < rx*10+10 ? gx+w : rx*10+10 )); y1=$(( gy+h < ry*10+10 ? gy+h : ry*10+10 ))
    (( x1 > x0 && y1 > y0 )) && q fill $RG/region_${rx}_${ry}.tmj --layer $layer --x $((x0-rx*10)) --y $((y0-ry*10)) --width $((x1-x0)) --height $((y1-y0)) --gid $gid
  done; done; return 0; }
gfill 0 12 3 3 24 14; gfill 0 12 2 5 26 10; gfill 0 1 5 5 20 10; gfill 0 1 4 7 22 6   # 沙滩 + 草地
gfill 0 10 6 10 18 1; gfill 0 10 15 6 1 8; gfill 0 3 10 7 3 2                        # 十字路 + 小池
gfill Deco 7 6 6 3 2; gfill Deco 7 20 6 4 3; gfill Deco 7 6 12 3 2; gfill Deco 7 19 12 4 2 # 树林
gfill Deco 11 12 11 2 1; gfill Deco 16 17 8 1 1; gfill Deco 27 16 9 1 1; gfill Deco 30 11 8 1 1; gfill Deco 23 3 4 1 1
PW=$RG/regions.world
q world new -o $PW
q world add-pattern $PW --regexp 'region_(\d+)_(\d+)\.tmj' --multiplier-x 160 --multiplier-y 160 --offset-x -240 --offset-y -160 --map-width 160 --map-height 160
q world add-pattern $PW --regexp 'tmp_(\d+)_(\d+)'           # 加一个再删掉，演示 remove-pattern
q world remove-pattern $PW --index 1
t world info $PW | python3 -c "import json,sys; w=json.load(sys.stdin); print('  pattern 收到', len(w['resolvedMaps']), '张：', ', '.join('%s@(%d,%d)'%(m['fileName'],m['x'],m['y']) for m in w['resolvedMaps']))"

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
python3 "$HERE/world_render.py" "$O/demo.world" "$O/world.png"
python3 "$HERE/world_render.py" "$O/regions/regions.world" "$O/regions.png"
echo "OK → $HERE/$O"

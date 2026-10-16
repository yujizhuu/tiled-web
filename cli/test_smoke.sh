#!/usr/bin/env bash
# Phase 1–7 CLI smoke test — stamp/template/infinite + automap/world + objects/props/tiles + create/info/export
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version =="
"${CLI[@]}" version | grep -q '0.7.1'
"${CLI[@]}" version | grep -q 'phase: 7'

echo "== new =="
"${CLI[@]}" new --width 8 --height 6 --tilewidth 16 --tileheight 16 -o "$TMP/map.tmj"
test -f "$TMP/map.tmj"

echo "== info json =="
"${CLI[@]}" info "$TMP/map.tmj" | grep -q '"width": 8'

echo "== info text =="
"${CLI[@]}" info "$TMP/map.tmj" --format text | grep -q '8x6'

echo "== layer add =="
"${CLI[@]}" layer add "$TMP/map.tmj" --name Ground
"${CLI[@]}" layer list "$TMP/map.tmj" | grep -q '"name": "Ground"'

echo "== layer rename =="
"${CLI[@]}" layer rename "$TMP/map.tmj" --layer Ground --name Terrain
"${CLI[@]}" layer list "$TMP/map.tmj" | grep -q '"name": "Terrain"'

echo "== layer add object =="
"${CLI[@]}" layer add "$TMP/map.tmj" --name Objects --type object
"${CLI[@]}" layer list "$TMP/map.tmj" | grep -q '"type": "objectgroup"'

echo "== tileset add =="
"${CLI[@]}" tileset add "$TMP/map.tmj" --name demo --firstgid 1 --tilewidth 16 --tileheight 16 --image tiles.png --columns 4 --tilecount 16
"${CLI[@]}" tileset list "$TMP/map.tmj" | grep -q '"firstgid": 1'

echo "== tileset add from tsx =="
cat > "$TMP/demo.tsx" << 'TSX'
<?xml version="1.0" encoding="UTF-8"?>
<tileset name="fromtsx" tilewidth="16" tileheight="16" tilecount="8" columns="4">
  <image source="sheet.png" width="64" height="32"/>
</tileset>
TSX
"${CLI[@]}" tileset add "$TMP/map.tmj" --firstgid 100 --source "$TMP/demo.tsx"
"${CLI[@]}" tileset list "$TMP/map.tmj" | grep -q 'demo.tsx\|fromtsx\|"firstgid": 100'

echo "== set-tile =="
"${CLI[@]}" set-tile "$TMP/map.tmj" --layer Terrain --x 1 --y 2 --gid 3
"${CLI[@]}" get-layer "$TMP/map.tmj" --layer Terrain --format json | grep -q '"data"'

echo "== set-tile with flip =="
"${CLI[@]}" set-tile "$TMP/map.tmj" --layer Terrain --x 2 --y 2 --gid 3 --flip-h --flip-v
FLIP_JSON=$("${CLI[@]}" get-layer "$TMP/map.tmj" --layer Terrain --format json)
# FLIP_H|FLIP_V|3 = 0x80000000|0x40000000|3 = 3221225475
echo "$FLIP_JSON" | grep -q '3221225475'

echo "== fill =="
"${CLI[@]}" fill "$TMP/map.tmj" --layer Terrain --x 0 --y 0 --width 3 --height 2 --gid 7
CSV=$("${CLI[@]}" get-layer "$TMP/map.tmj" --layer Terrain --format csv)
ROW1=$(echo "$CSV" | head -n1)
ROW2=$(echo "$CSV" | sed -n '2p')
echo "$ROW1" | grep -q '^7,7,7,'
echo "$ROW2" | grep -q '^7,7,7,'

echo "== get-layer csv file =="
"${CLI[@]}" get-layer "$TMP/map.tmj" --layer Terrain -f csv -o "$TMP/layer.csv"
test -f "$TMP/layer.csv"
ROWS=$(wc -l < "$TMP/layer.csv" | tr -d ' ')
test "$ROWS" -eq 6

echo "== object add =="
"${CLI[@]}" object add "$TMP/map.tmj" --layer Objects --name Spawn --type Player --x 10 --y 20 --width 16 --height 16
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -q '"name": "Spawn"'
"${CLI[@]}" object list "$TMP/map.tmj" | grep -q '"type": "Player"'

echo "== object add create-layer =="
"${CLI[@]}" object add "$TMP/map.tmj" --layer NPCs --create-layer --name Guard --x 5 --y 5 --shape ellipse --width 12 --height 12
"${CLI[@]}" object list "$TMP/map.tmj" --layer NPCs | grep -q '"name": "Guard"'
"${CLI[@]}" object list "$TMP/map.tmj" --layer NPCs | grep -q '"shape": "ellipse"'

echo "== object add point + polygon =="
"${CLI[@]}" object add "$TMP/map.tmj" --layer Objects --name Waypoint --x 1 --y 1 --shape point
"${CLI[@]}" object add "$TMP/map.tmj" --layer Objects --name Poly --x 0 --y 0 --shape polygon --points "0,0 16,0 8,16"
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -q '"shape": "polygon"'

echo "== object update =="
"${CLI[@]}" object update "$TMP/map.tmj" --layer Objects --id 1 --x 100 --y 200 --new-name Hero
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -q '"name": "Hero"'
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -q '"x": 100'

echo "== prop set/get/list map =="
"${CLI[@]}" prop set "$TMP/map.tmj" --target map --name author --value agent
"${CLI[@]}" prop set "$TMP/map.tmj" --target map --name difficulty --value 3 --type int
"${CLI[@]}" prop get "$TMP/map.tmj" --target map --name author | grep -q '"value": "agent"'
"${CLI[@]}" prop list "$TMP/map.tmj" --target map | grep -q '"name": "difficulty"'

echo "== prop layer =="
"${CLI[@]}" prop set "$TMP/map.tmj" --target layer --layer Terrain --name solid --value true --type bool
"${CLI[@]}" prop get "$TMP/map.tmj" --target layer --layer Terrain --name solid | grep -q 'true'

echo "== prop object =="
"${CLI[@]}" prop set "$TMP/map.tmj" --target object --layer Objects --id 1 --name hp --value 100 --type int
"${CLI[@]}" prop get "$TMP/map.tmj" --target object --layer Objects --id 1 --name hp | grep -q '100'
"${CLI[@]}" prop list "$TMP/map.tmj" --target object --layer Objects --id 1 | grep -q '"name": "hp"'

echo "== prop tileset =="
"${CLI[@]}" prop set "$TMP/map.tmj" --target tileset --tileset demo --name atlas --value v1
"${CLI[@]}" prop get "$TMP/map.tmj" --target tileset --tileset demo --name atlas | grep -q '"value": "v1"'

echo "== prop remove =="
"${CLI[@]}" prop remove "$TMP/map.tmj" --target map --name author
set +e
"${CLI[@]}" prop get "$TMP/map.tmj" --target map --name author >/dev/null 2>"$TMP/prop_err.txt"
PEC=$?
set -e
test "$PEC" -ne 0

echo "== object remove =="
"${CLI[@]}" object remove "$TMP/map.tmj" --layer Objects --name Waypoint
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -vq '"name": "Waypoint"' || true
# ensure Waypoint gone
set +e
"${CLI[@]}" object list "$TMP/map.tmj" --layer Objects | grep -q '"name": "Waypoint"'
OC=$?
set -e
test "$OC" -ne 0

echo "== export tmj =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmj -o "$TMP/out.tmj"
test -f "$TMP/out.tmj"

echo "== export tmx =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmx -o "$TMP/out.tmx"
grep -q '<map ' "$TMP/out.tmx"
grep -q 'encoding="csv"' "$TMP/out.tmx"
grep -q 'firstgid="1"' "$TMP/out.tmx"
grep -q 'name="Terrain"' "$TMP/out.tmx"
grep -q 'objectgroup' "$TMP/out.tmx"
grep -q 'name="Hero"' "$TMP/out.tmx"

echo "== info tmx =="
"${CLI[@]}" info "$TMP/out.tmx" | grep -q '"width": 8'

echo "== export csv =="
"${CLI[@]}" export "$TMP/map.tmj" -f csv -o "$TMP/out.csv"
ROWS=$(wc -l < "$TMP/out.csv" | tr -d ' ')
test "$ROWS" -eq 6

echo "== roundtrip tmx -> tmj =="
"${CLI[@]}" export "$TMP/out.tmx" -f tmj -o "$TMP/round.tmj"
"${CLI[@]}" info "$TMP/round.tmj" | grep -q '"height": 6'
"${CLI[@]}" get-layer "$TMP/round.tmj" --layer Terrain --format csv | head -n1 | grep -q '^7,7,7,'

echo "== layer remove =="
"${CLI[@]}" layer remove "$TMP/map.tmj" --layer 0
"${CLI[@]}" layer list "$TMP/map.tmj" | grep -q 'Terrain\|Layer\|Objects\|NPCs'

echo "== error path (expect non-zero) =="
set +e
"${CLI[@]}" info "$TMP/missing.tmj" >/dev/null 2>"$TMP/err.txt"
EC=$?
set -e
test "$EC" -ne 0
grep -qi 'cannot read\|no such' "$TMP/err.txt" || grep -qi 'ENOENT\|Cannot read' "$TMP/err.txt"

echo "== phase 4 =="
"$ROOT/test_phase4.sh"

echo "== phase 5 =="
"$ROOT/test_phase5.sh"

echo "== phase 6 =="
"$ROOT/test_phase6.sh"

echo "== phase 7 =="
"$ROOT/test_phase7.sh"

echo "== phase 8 (0.7.1 upstream conformance) =="
"$ROOT/test_phase8.sh"

echo "OK: Phase 7 CLI smoke passed"

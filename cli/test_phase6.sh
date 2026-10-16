#!/usr/bin/env bash
# Phase 6 CLI smoke — MCP, coord, prop types write, template tileset merge, wang/terrain, infinite tmj export
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke/phase6"
FIX="$ROOT/fixtures"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version 0.7.1 =="
"${CLI[@]}" version | grep -q '0.7.1'
"${CLI[@]}" version | grep -q 'phase: 7'

echo "== coord orthogonal =="
"${CLI[@]}" new --width 10 --height 8 --tilewidth 16 --tileheight 16 -o "$TMP/ortho.tmj"
T2P=$("${CLI[@]}" coord tile-to-pixel "$TMP/ortho.tmj" --x 3 --y 2)
echo "$T2P" | grep -q '"x": 48'
echo "$T2P" | grep -q '"y": 32'
P2T=$("${CLI[@]}" coord pixel-to-tile "$TMP/ortho.tmj" --x 48 --y 32)
echo "$P2T" | grep -q '"x": 3'
echo "$P2T" | grep -q '"y": 2'
"${CLI[@]}" coord tile-to-pixel --x 1 --y 1 --tilewidth 32 --tileheight 32 --orientation orthogonal | grep -q '"x": 32'

echo "== coord isometric =="
"${CLI[@]}" new --width 4 --height 4 --tilewidth 64 --tileheight 32 --orientation isometric -o "$TMP/iso.tmj"
ISO=$("${CLI[@]}" coord tile-to-pixel "$TMP/iso.tmj" --x 1 --y 0)
echo "$ISO" | grep -q '"orientation": "isometric"'
echo "$ISO" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['pixel']['x']==160 and d['pixel']['y']==16, d"
ROUND=$("${CLI[@]}" coord pixel-to-tile "$TMP/iso.tmj" --x 160 --y 16)
echo "$ROUND" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['tile']['x']==1 and d['tile']['y']==0, d"

echo "== coord hexagonal =="
"${CLI[@]}" new --width 6 --height 6 --tilewidth 32 --tileheight 32 --orientation hexagonal --staggeraxis y --staggerindex odd --hexsidelength 16 -o "$TMP/hex.tmj"
HEX=$("${CLI[@]}" coord tile-to-pixel "$TMP/hex.tmj" --x 2 --y 1)
echo "$HEX" | grep -q 'hexagonal'
echo "$HEX" | python3 -c "import sys,json; d=json.load(sys.stdin); assert abs(d['pixel']['x']-80)<0.01 and abs(d['pixel']['y']-24)<0.01, d"
# hex centre of (2,1); (80,24) is the bbox corner and belongs to (2,0) per upstream HexagonalRenderer
HEXBACK=$("${CLI[@]}" coord pixel-to-tile "$TMP/hex.tmj" --x 96 --y 40)
echo "$HEXBACK" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['tile']['x']==2 and d['tile']['y']==1, d"

echo "== prop types add/remove =="
"${CLI[@]}" new --width 4 --height 4 -o "$TMP/pt.tmj"
"${CLI[@]}" prop types add "$TMP/pt.tmj" --name Team --type enum --values red,blue,green
"${CLI[@]}" prop types add "$TMP/pt.tmj" --name Actor --type class --members '[{"name":"hp","type":"int","value":0}]'
"${CLI[@]}" prop types list "$TMP/pt.tmj" | grep -q '"name": "Team"'
"${CLI[@]}" prop types list "$TMP/pt.tmj" | grep -q '"name": "Actor"'
"${CLI[@]}" prop types get "$TMP/pt.tmj" --name Team | grep -q 'green'
"${CLI[@]}" prop types remove "$TMP/pt.tmj" --name Team
set +e
"${CLI[@]}" prop types get "$TMP/pt.tmj" --name Team >/dev/null 2>"$TMP/pt_err.txt"
PEC=$?
set -e
test "$PEC" -ne 0
"${CLI[@]}" prop types list "$TMP/pt.tmj" | grep -q '"name": "Actor"'

echo "== template apply tileset auto-merge =="
"${CLI[@]}" new --width 8 --height 6 -o "$TMP/tpl.tmj"
OUT=$("${CLI[@]}" template apply "$TMP/tpl.tmj" --layer Objects --create-layer --template "$FIX/templates/crate.tj" --x 32 --y 48)
echo "$OUT" | grep -q '"merged": true'
echo "$OUT" | grep -q 'tilesetMerge'
"${CLI[@]}" object list "$TMP/tpl.tmj" --layer Objects | grep -q '"name": "Crate"'
"${CLI[@]}" tileset list "$TMP/tpl.tmj" | grep -q 'crate'
OUT2=$("${CLI[@]}" template apply "$TMP/tpl.tmj" --layer Objects --template "$FIX/templates/crate.tj" --x 64 --y 48)
echo "$OUT2" | grep -q '"merged": false'
TS_COUNT=$("${CLI[@]}" tileset list "$TMP/tpl.tmj" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['tilesets']))")
test "$TS_COUNT" -eq 1

echo "== wang / terrain list =="
"${CLI[@]}" new --width 4 --height 4 -o "$TMP/wangmap.tmj"
cp "$FIX/wang/demo.tsx" "$TMP/demo.tsx"
"${CLI[@]}" tileset add "$TMP/wangmap.tmj" --firstgid 1 --source "$TMP/demo.tsx"
# Prefer relative source beside the map for re-load
python3 -c "
import json
m=json.load(open('$TMP/wangmap.tmj'))
m['tilesets'][0]['source']='demo.tsx'
json.dump(m, open('$TMP/wangmap.tmj','w'), indent=2)
print('ok')
"
WANG=$("${CLI[@]}" wang list "$TMP/wangmap.tmj")
echo "$WANG" | grep -q '"name": "Ground"'
echo "$WANG" | grep -q 'wangsets'
TER=$("${CLI[@]}" terrain list "$TMP/wangmap.tmj")
echo "$TER" | grep -q '"name": "Grass"'
echo "$TER" | grep -q '"name": "Dirt"'

echo "== infinite tmj export =="
"${CLI[@]}" new --width 16 --height 16 --infinite -o "$TMP/inf.tmj"
"${CLI[@]}" set-tile "$TMP/inf.tmj" --x 20 --y -3 --gid 5
"${CLI[@]}" export "$TMP/inf.tmj" -f tmj -o "$TMP/inf_out.tmj"
python3 -c "
import json
m=json.load(open('$TMP/inf_out.tmj'))
assert m.get('infinite') is True
L=m['layers'][0]
assert 'chunks' in L and L['chunks'], L
assert not L.get('data'), 'should not densify'
print('infinite tmj ok', len(L['chunks']), 'chunks')
"
"${CLI[@]}" info "$TMP/inf_out.tmj" | grep -q '"infinite": true'

echo "== MCP server tools/list =="
python3 "$ROOT/test_mcp_stdio.py"

echo "OK: Phase 6 CLI smoke passed"

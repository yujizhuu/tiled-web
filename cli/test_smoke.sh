#!/usr/bin/env bash
# Phase 2 CLI smoke test — create, layer, tile write, tileset, export roundtrips
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version =="
"${CLI[@]}" version | grep -q '0.2.0'
"${CLI[@]}" version | grep -q 'phase: 2'

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

echo "== tileset add =="
"${CLI[@]}" tileset add "$TMP/map.tmj" --name demo --firstgid 1 --tilewidth 16 --tileheight 16 --image tiles.png --columns 4 --tilecount 16
"${CLI[@]}" tileset list "$TMP/map.tmj" | grep -q '"firstgid": 1'

echo "== set-tile =="
"${CLI[@]}" set-tile "$TMP/map.tmj" --layer Terrain --x 1 --y 2 --gid 3
"${CLI[@]}" get-layer "$TMP/map.tmj" --layer Terrain --format json | grep -q '"data"'

echo "== fill =="
"${CLI[@]}" fill "$TMP/map.tmj" --layer Terrain --x 0 --y 0 --width 3 --height 2 --gid 7
# verify via csv: first two rows start with 7,7,7
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

echo "== export tmj =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmj -o "$TMP/out.tmj"
test -f "$TMP/out.tmj"

echo "== export tmx =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmx -o "$TMP/out.tmx"
grep -q '<map ' "$TMP/out.tmx"
grep -q 'encoding="csv"' "$TMP/out.tmx"
grep -q 'firstgid="1"' "$TMP/out.tmx"
grep -q 'name="Terrain"' "$TMP/out.tmx"

echo "== info tmx =="
"${CLI[@]}" info "$TMP/out.tmx" | grep -q '"width": 8'

echo "== export csv =="
"${CLI[@]}" export "$TMP/map.tmj" -f csv -o "$TMP/out.csv"
ROWS=$(wc -l < "$TMP/out.csv" | tr -d ' ')
test "$ROWS" -eq 6

echo "== roundtrip tmx -> tmj =="
"${CLI[@]}" export "$TMP/out.tmx" -f tmj -o "$TMP/round.tmj"
"${CLI[@]}" info "$TMP/round.tmj" | grep -q '"height": 6'
# filled GIDs survive roundtrip
"${CLI[@]}" get-layer "$TMP/round.tmj" --layer Terrain --format csv | head -n1 | grep -q '^7,7,7,'

echo "== layer remove =="
"${CLI[@]}" layer remove "$TMP/map.tmj" --layer 0
# Terrain was second after default Layer 1; after remove index 0, Terrain should remain or Layer 1 removed
"${CLI[@]}" layer list "$TMP/map.tmj" | grep -q 'Terrain\|Layer'

echo "== error path (expect non-zero) =="
set +e
"${CLI[@]}" info "$TMP/missing.tmj" >/dev/null 2>"$TMP/err.txt"
EC=$?
set -e
test "$EC" -ne 0
grep -qi 'cannot read\|no such' "$TMP/err.txt" || grep -qi 'ENOENT\|Cannot read' "$TMP/err.txt"

echo "OK: Phase 2 CLI smoke passed"

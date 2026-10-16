#!/usr/bin/env bash
# Phase 5 CLI smoke — stamp, template, infinite chunks, automap radius, propertytypes
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke/phase5"
FIX="$ROOT/fixtures"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version (phase5 suite; CLI may be newer) =="
"${CLI[@]}" version | grep -qE '0\.[5-9]|phase: [5-9]'

echo "== stamp copy/paste =="
"${CLI[@]}" new --width 10 --height 8 --tilewidth 16 --tileheight 16 -o "$TMP/stamp_map.tmj"
"${CLI[@]}" fill "$TMP/stamp_map.tmj" --x 1 --y 1 --width 3 --height 2 --gid 5
"${CLI[@]}" stamp copy "$TMP/stamp_map.tmj" --layer 0 --x 1 --y 1 --width 3 --height 2 -o "$TMP/stamp.json"
test -f "$TMP/stamp.json"
grep -q '"type": "tiled-web-stamp"' "$TMP/stamp.json"
grep -q '"width": 3' "$TMP/stamp.json"
"${CLI[@]}" stamp paste "$TMP/stamp_map.tmj" --layer 0 --x 5 --y 4 --stamp "$TMP/stamp.json"
CSV=$("${CLI[@]}" get-layer "$TMP/stamp_map.tmj" --format csv)
# row index 4 (y=4): positions 5,6,7 should be 5
echo "$CSV" | sed -n '5p' | grep -q ',5,5,5'
# clip: paste near edge
"${CLI[@]}" stamp paste "$TMP/stamp_map.tmj" --layer 0 --x 8 --y 6 --stamp "$TMP/stamp.json" | grep -q '"clipped"'

echo "== template info/apply =="
"${CLI[@]}" template info "$FIX/templates/chest.tj" | grep -q '"name": "Chest"'
"${CLI[@]}" template info "$FIX/templates/spawn.tx" | grep -q '"name": "Spawn"'
"${CLI[@]}" template info "$FIX/templates/spawn.tx" | grep -q '"hp"'
"${CLI[@]}" new --width 8 --height 6 -o "$TMP/tpl_map.tmj"
"${CLI[@]}" template apply "$TMP/tpl_map.tmj" --layer Objects --create-layer --template "$FIX/templates/chest.tj" --x 64 --y 48
"${CLI[@]}" object list "$TMP/tpl_map.tmj" --layer Objects | grep -q '"name": "Chest"'
"${CLI[@]}" object list "$TMP/tpl_map.tmj" --layer Objects | grep -q '"x": 64'
"${CLI[@]}" template apply "$TMP/tpl_map.tmj" --layer Objects --template "$FIX/templates/spawn.tx" --x 10 --y 20
"${CLI[@]}" object list "$TMP/tpl_map.tmj" --layer Objects | grep -q '"name": "Spawn"'

echo "== infinite map =="
"${CLI[@]}" new --width 16 --height 16 --infinite -o "$TMP/inf.tmj"
grep -q '"infinite": true' "$TMP/inf.tmj"
grep -q '"chunks"' "$TMP/inf.tmj"
"${CLI[@]}" set-tile "$TMP/inf.tmj" --x 20 --y 3 --gid 7
"${CLI[@]}" set-tile "$TMP/inf.tmj" --x -2 --y -1 --gid 9
# negative and > width should create chunks
node -e "
const m=JSON.parse(require('fs').readFileSync('$TMP/inf.tmj','utf8'));
if(!m.infinite) throw new Error('not infinite');
const L=m.layers[0];
if(!Array.isArray(L.chunks)||!L.chunks.length) throw new Error('no chunks');
if(L.data) throw new Error('should not have dense data');
console.log('chunks', L.chunks.length);
"
"${CLI[@]}" fill "$TMP/inf.tmj" --x 0 --y 0 --width 4 --height 2 --gid 3 | grep -q '"count": 8'
GL=$("${CLI[@]}" get-layer "$TMP/inf.tmj" --format json)
echo "$GL" | grep -q '"infinite": true'
echo "$GL" | grep -q '"chunkCount"'
# stamp on infinite
"${CLI[@]}" stamp copy "$TMP/inf.tmj" --x 0 --y 0 --width 4 --height 2 -o "$TMP/inf_stamp.json"
"${CLI[@]}" stamp paste "$TMP/inf.tmj" --x 32 --y 32 --stamp "$TMP/inf_stamp.json" | grep -q '"written": 8'
"${CLI[@]}" info "$TMP/inf.tmj" | grep -q '"infinite": true'

echo "== replace-gid on infinite =="
"${CLI[@]}" replace-gid "$TMP/inf.tmj" --from 3 --to 11 | grep -q '"replaced"'

echo "== automap --radius =="
cp "$FIX/automap/work.tmj" "$TMP/auto.tmj"
# Full map still matches 2
"${CLI[@]}" automap "$TMP/auto.tmj" --rules "$FIX/automap/rules.txt" -o "$TMP/auto_full.tmj" | grep -q '"matches": 2'
# Tiny radius around empty corner should match 0
cp "$FIX/automap/work.tmj" "$TMP/auto2.tmj"
"${CLI[@]}" automap "$TMP/auto2.tmj" --rules "$FIX/automap/rules.txt" --radius 0 --x 0 --y 0 | tee "$TMP/auto_r.json" | grep -q '"matches": 0'
grep -q '"clip"' "$TMP/auto_r.json"
# Radius around (1,1) should still catch the match at (1,1)
cp "$FIX/automap/work.tmj" "$TMP/auto3.tmj"
"${CLI[@]}" automap "$TMP/auto3.tmj" --rules "$FIX/automap/rules.txt" --radius 1 --x 1 --y 1 | grep -q '"matches":'

echo "== propertytypes =="
# inject propertytypes into a map
node -e "
const fs=require('fs');
const m=JSON.parse(fs.readFileSync('$TMP/stamp_map.tmj','utf8'));
m.propertytypes=[
  {name:'Team', type:'enum', values:['red','blue'], storageType:'string'},
  {name:'Actor', type:'class', members:[{name:'hp', type:'int', value:0}]}
];
fs.writeFileSync('$TMP/pt.tmj', JSON.stringify(m,null,2));
"
"${CLI[@]}" prop types list "$TMP/pt.tmj" | grep -q '"name": "Team"'
"${CLI[@]}" prop types list "$TMP/pt.tmj" | grep -q '"name": "Actor"'
"${CLI[@]}" prop types get "$TMP/pt.tmj" --name Team | grep -q 'red'

echo "== hex orientation new =="
"${CLI[@]}" new --width 4 --height 4 --orientation hexagonal -o "$TMP/hex.tmj"
"${CLI[@]}" info "$TMP/hex.tmj" | grep -q 'hexagonal'
"${CLI[@]}" set-tile "$TMP/hex.tmj" --x 1 --y 1 --gid 2
"${CLI[@]}" get-layer "$TMP/hex.tmj" --format csv | sed -n '2p' | grep -q ',2,'

echo "OK: Phase 5 CLI smoke passed"

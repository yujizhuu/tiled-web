#!/usr/bin/env bash
# Phase 4 CLI smoke — automap, world, replace-gid
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke/phase4"
FIX="$ROOT/fixtures/automap"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== automap fixture =="
cp "$FIX/work.tmj" "$TMP/work.tmj"
cp "$FIX/rule_simple.tmj" "$TMP/rule_simple.tmj"
cp "$FIX/rules.txt" "$TMP/rules.txt"
cp "$FIX/rules.json" "$TMP/rules.json"

# Before: gid 5 at (1,1) and (3,2)
BEFORE=$("${CLI[@]}" get-layer "$TMP/work.tmj" --layer Ground --format csv)
echo "$BEFORE" | sed -n '2p' | grep -q ',5,'
echo "$BEFORE" | sed -n '3p' | grep -q '5\|,5'

"${CLI[@]}" automap "$TMP/work.tmj" --rules "$TMP/rules.txt" | tee "$TMP/automap.json" | grep -q '"matches": 2'
AFTER=$("${CLI[@]}" get-layer "$TMP/work.tmj" --layer Ground --format csv)
# (1,1) and (3,2) should be 9
echo "$AFTER" | sed -n '2p' | grep -q ',9,'
echo "$AFTER" | sed -n '3p' | grep -Eq '(^9,|,9$|,9,)'

# rules.json path
cp "$FIX/work.tmj" "$TMP/work2.tmj"
"${CLI[@]}" automap "$TMP/work2.tmj" --rules "$TMP/rules.json" -o "$TMP/work2_out.tmj" | grep -q '"matches": 2'
test -f "$TMP/work2_out.tmj"
"${CLI[@]}" get-layer "$TMP/work2_out.tmj" --layer Ground --format csv | sed -n '2p' | grep -q ',9,'

# directory with rules.txt
mkdir -p "$TMP/rules_dir"
cp "$FIX/rule_simple.tmj" "$TMP/rules_dir/"
cp "$FIX/rules.txt" "$TMP/rules_dir/"
cp "$FIX/work.tmj" "$TMP/work3.tmj"
"${CLI[@]}" automap "$TMP/work3.tmj" --rules "$TMP/rules_dir" | grep -q '"matches": 2'

echo "== replace-gid =="
cp "$FIX/work.tmj" "$TMP/repl.tmj"
"${CLI[@]}" replace-gid "$TMP/repl.tmj" --from 5 --to 11 --layer Ground | grep -q '"replaced": 2'
"${CLI[@]}" get-layer "$TMP/repl.tmj" --layer Ground --format csv | grep -q '11'

echo "== world =="
"${CLI[@]}" world new -o "$TMP/demo.world"
test -f "$TMP/demo.world"
grep -q '"type": "world"' "$TMP/demo.world"

"${CLI[@]}" world add-map "$TMP/demo.world" --file "$TMP/work.tmj" --x 0 --y 0 --width 64 --height 64
"${CLI[@]}" world add-map "$TMP/demo.world" --file map_b.tmj --x 64 --y 0
INFO=$("${CLI[@]}" world info "$TMP/demo.world")
echo "$INFO" | grep -q '"mapCount": 2'
echo "$INFO" | grep -q '"x": 64'

"${CLI[@]}" world remove-map "$TMP/demo.world" --file map_b.tmj
"${CLI[@]}" world info "$TMP/demo.world" | grep -q '"mapCount": 1'

"${CLI[@]}" world remove-map "$TMP/demo.world" --index 0
"${CLI[@]}" world info "$TMP/demo.world" | grep -q '"mapCount": 0'

echo "OK: Phase 4 subset passed"

#!/usr/bin/env bash
# Phase 1 CLI smoke test — create, info, export roundtrips
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version =="
"${CLI[@]}" version

echo "== new =="
"${CLI[@]}" new --width 8 --height 6 --tilewidth 16 --tileheight 16 -o "$TMP/map.tmj"
test -f "$TMP/map.tmj"

echo "== info json =="
"${CLI[@]}" info "$TMP/map.tmj" | grep -q '"width": 8'

echo "== info text =="
"${CLI[@]}" info "$TMP/map.tmj" --format text | grep -q '8x6'

echo "== export tmj =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmj -o "$TMP/out.tmj"
test -f "$TMP/out.tmj"

echo "== export tmx =="
"${CLI[@]}" export "$TMP/map.tmj" -f tmx -o "$TMP/out.tmx"
grep -q '<map ' "$TMP/out.tmx"
grep -q 'encoding="csv"' "$TMP/out.tmx"

echo "== info tmx =="
"${CLI[@]}" info "$TMP/out.tmx" | grep -q '"width": 8'

echo "== export csv =="
"${CLI[@]}" export "$TMP/map.tmj" -f csv -o "$TMP/out.csv"
# 6 rows of 8 zeros
ROWS=$(wc -l < "$TMP/out.csv" | tr -d ' ')
test "$ROWS" -eq 6
HEAD=$(head -n1 "$TMP/out.csv")
test "$HEAD" = "0,0,0,0,0,0,0,0"

echo "== roundtrip tmx -> tmj =="
"${CLI[@]}" export "$TMP/out.tmx" -f tmj -o "$TMP/round.tmj"
"${CLI[@]}" info "$TMP/round.tmj" | grep -q '"height": 6'

echo "== error path (expect non-zero) =="
set +e
"${CLI[@]}" info "$TMP/missing.tmj" >/dev/null 2>"$TMP/err.txt"
EC=$?
set -e
test "$EC" -ne 0
grep -qi 'cannot read\|no such' "$TMP/err.txt" || grep -qi 'ENOENT\|Cannot read' "$TMP/err.txt"

echo "OK: Phase 1 CLI smoke passed"

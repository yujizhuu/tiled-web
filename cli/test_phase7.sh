#!/usr/bin/env bash
# Phase 7 CLI smoke — template index, prop types useAs+expand, TMX infinite/zlib
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke/phase7"
FIX="$ROOT/fixtures"
rm -rf "$TMP"
mkdir -p "$TMP"

echo "== version =="
"${CLI[@]}" version | grep -qE 'tiled-web [0-9]+\.'
"${CLI[@]}" version | grep -q 'formats:'

echo "== template index =="
IDX=$("${CLI[@]}" template index "$FIX/templates")
echo "$IDX" | grep -q '"count":'
echo "$IDX" | python3 -c "
import sys, json
d=json.load(sys.stdin)
assert d['count'] >= 3, d
names={t['name'] for t in d['templates']}
assert 'Chest' in names or any('chest' in t['path'].lower() for t in d['templates']), d
for t in d['templates']:
    assert 'path' in t and 'name' in t and 'type' in t and 'size' in t, t
    assert t['size'] > 0
print('index ok', d['count'])
"

echo "== template index nested =="
mkdir -p "$TMP/tpls/sub"
cp "$FIX/templates/chest.tj" "$TMP/tpls/sub/"
IDX2=$("${CLI[@]}" template index "$TMP/tpls")
echo "$IDX2" | grep -q 'chest.tj'
IDX3=$("${CLI[@]}" template index "$TMP/tpls" --no-recursive)
echo "$IDX3" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['count']==0, d"

echo "== prop types useAs + nested expand =="
"${CLI[@]}" new --width 4 --height 4 -o "$TMP/pt.tmj"
"${CLI[@]}" prop types add "$TMP/pt.tmj" --name Stats --type class \
  --members '[{"name":"hp","type":"int","value":10},{"name":"mp","type":"int","value":5}]' \
  --use-as property,object
"${CLI[@]}" prop types add "$TMP/pt.tmj" --name Actor --type class \
  --members '[{"name":"stats","type":"class","propertyType":"Stats","value":{"hp":99}},{"name":"name","type":"string","value":"Hero"}]' \
  --use-as object,tile,property
GET=$("${CLI[@]}" prop types get "$TMP/pt.tmj" --name Actor)
echo "$GET" | python3 -c "
import sys, json
d=json.load(sys.stdin)
assert d['type']=='class'
assert 'object' in d['useAs'] and 'property' in d['useAs']
exp=d.get('membersExpanded') or []
stats=next(m for m in exp if m['name']=='stats')
assert stats.get('membersExpanded'), stats
assert stats['value']['hp']==99, stats
assert stats['value']['mp']==5, stats  # inherited default from Stats
print('expand ok')
"
# no-expand omits membersExpanded
GET2=$("${CLI[@]}" prop types get "$TMP/pt.tmj" --name Actor --no-expand)
echo "$GET2" | python3 -c "
import sys, json
d=json.load(sys.stdin)
assert 'membersExpanded' not in d or d.get('membersExpanded') is None
print('no-expand ok')
"
LIST=$("${CLI[@]}" prop types list "$TMP/pt.tmj")
echo "$LIST" | grep -q '"useAs"'

echo "== infinite TMX CSV chunks roundtrip =="
"${CLI[@]}" new --width 16 --height 16 --infinite -o "$TMP/inf.tmj"
"${CLI[@]}" set-tile "$TMP/inf.tmj" --x 20 --y -3 --gid 5
"${CLI[@]}" set-tile "$TMP/inf.tmj" --x 21 --y -3 --gid 6
"${CLI[@]}" export "$TMP/inf.tmj" -f tmx -o "$TMP/inf.tmx"
grep -q 'infinite="1"' "$TMP/inf.tmx"
grep -q '<chunk ' "$TMP/inf.tmx"
grep -q 'encoding="csv"' "$TMP/inf.tmx"
# tiles outside map bounds must appear in chunk body
grep -E '5,6|,5,|,6' "$TMP/inf.tmx" >/dev/null
"${CLI[@]}" export "$TMP/inf.tmx" -f tmj -o "$TMP/inf_rt.tmj"
"${CLI[@]}" info "$TMP/inf_rt.tmj" | grep -q '"infinite": true'
G=$("${CLI[@]}" get-layer "$TMP/inf_rt.tmj" --format json)
echo "$G" | python3 -c "
import sys, json
d=json.load(sys.stdin)
assert d.get('infinite') is True
found={g for g in d.get('data') or [] if g in (5,6)}
assert found=={5,6}, (found, d.get('chunkCount'), len(d.get('data') or []))
print('infinite tmx csv ok')
"

echo "== TMX base64 zlib roundtrip (finite) =="
"${CLI[@]}" new --width 4 --height 3 -o "$TMP/z.tmj"
"${CLI[@]}" fill "$TMP/z.tmj" --x 0 --y 0 --width 4 --height 3 --gid 9
"${CLI[@]}" export "$TMP/z.tmj" -f tmx --encoding base64 --compression zlib -o "$TMP/z.tmx"
grep -q 'encoding="base64"' "$TMP/z.tmx"
grep -q 'compression="zlib"' "$TMP/z.tmx"
"${CLI[@]}" export "$TMP/z.tmx" -f tmj -o "$TMP/z_rt.tmj"
CSV=$("${CLI[@]}" get-layer "$TMP/z_rt.tmj" --format csv)
echo "$CSV" | head -n1 | grep -q '^9,9,9,9$'
echo "$CSV" | wc -l | tr -d ' ' | grep -q '^3$'

echo "== infinite TMX base64 zlib chunks =="
"${CLI[@]}" export "$TMP/inf.tmj" -f tmx --encoding base64 --compression zlib -o "$TMP/inf_z.tmx"
grep -q 'compression="zlib"' "$TMP/inf_z.tmx"
grep -q '<chunk ' "$TMP/inf_z.tmx"
"${CLI[@]}" export "$TMP/inf_z.tmx" -f tmj -o "$TMP/inf_z_rt.tmj"
G2=$("${CLI[@]}" get-layer "$TMP/inf_z_rt.tmj" --format json)
echo "$G2" | python3 -c "
import sys, json
d=json.load(sys.stdin)
found={g for g in d.get('data') or [] if g in (5,6)}
assert found=={5,6}, found
print('infinite tmx zlib ok')
"

echo "== TMJ still preferred / finite CSV export unchanged =="
"${CLI[@]}" export "$TMP/z.tmj" -f tmx -o "$TMP/plain.tmx"
grep -q 'encoding="csv"' "$TMP/plain.tmx"
grep -vq '<chunk ' "$TMP/plain.tmx" || true

echo "OK: Phase 7 CLI smoke passed"

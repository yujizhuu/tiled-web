#!/usr/bin/env bash
# 0.7.1 regression tests — upstream Tiled conformance fixes found while building examples/full-demo
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI=(node "$ROOT/bin/tiled-web.js")
TMP="$ROOT/tmp_smoke/phase8"
rm -rf "$TMP"; mkdir -p "$TMP/sub"
J() { python3 -c "import sys,json; d=json.load(open('$1')); $2"; }

echo "== version 0.7.1 =="
"${CLI[@]}" version | grep -q '0.7.1'

echo "== TMJ root type=map =="
"${CLI[@]}" new --width 4 --height 3 --tilewidth 16 --tileheight 16 -o "$TMP/sub/m.tmj" >/dev/null
J "$TMP/sub/m.tmj" "assert d['type']=='map'"

echo "== properties use Tiled >=1.2 array form =="
"${CLI[@]}" prop set "$TMP/sub/m.tmj" --target map --name title --value 'a&b<c>' >/dev/null
"${CLI[@]}" prop set "$TMP/sub/m.tmj" --target map --name n --value 3 --type int >/dev/null
"${CLI[@]}" prop set "$TMP/sub/m.tmj" --target map --name n --value 4 --type int >/dev/null
"${CLI[@]}" prop set "$TMP/sub/m.tmj" --target layer --layer 0 --name solid --value true --type bool >/dev/null
J "$TMP/sub/m.tmj" "p=d['properties']; assert isinstance(p,list) and {'name':'n','type':'int','value':4} in p and len(p)==2, p"
"${CLI[@]}" prop get "$TMP/sub/m.tmj" --target map --name n | grep -q '"value": 4'
"${CLI[@]}" prop remove "$TMP/sub/m.tmj" --target map --name n >/dev/null
J "$TMP/sub/m.tmj" "assert [x['name'] for x in d['properties']]==['title']"
# legacy object-form input is still read
python3 - "$TMP/sub/legacy.tmj" <<'PY'
import json,sys
json.dump({"width":1,"height":1,"tilewidth":8,"tileheight":8,"layers":[],"tilesets":[],"properties":{"old":1}},open(sys.argv[1],"w"))
PY
"${CLI[@]}" prop get "$TMP/sub/legacy.tmj" --target map --name old | grep -q '"value": 1'

echo "== external tileset ref is minimal; CWD-relative paths rebased to map dir =="
cp "$ROOT/fixtures/wang/demo.tsx" "$TMP/demo.tsx"
python3 -c "
from PIL import Image; Image.new('RGBA',(64,64)).save('$TMP/t.png')" 2>/dev/null || cp "$ROOT/../examples/full-demo/tiles.png" "$TMP/t.png"
( cd "$TMP" && "${CLI[@]}" tileset add sub/m.tmj --firstgid 1 --source demo.tsx >/dev/null \
  && "${CLI[@]}" tileset add sub/m.tmj --firstgid 100 --name img --image t.png --tilewidth 16 --tileheight 16 >/dev/null )
J "$TMP/sub/m.tmj" "t=d['tilesets']; assert t[0]=={'firstgid':1,'source':'../demo.tsx'}, t[0]; assert t[1]['image']=='../t.png' and t[1]['imagewidth']>0, t[1]"

echo "== wang/terrain: tsx tileCount + embedded Tiled JSON (cornercolors/edgecolors) =="
"${CLI[@]}" wang list "$TMP/sub/m.tmj" | python3 -c "import sys,json; w=json.load(sys.stdin)['tilesets'][0]['wangsets'][0]; assert w['tileCount']==2 and w['cornerColorCount']==2 and w['edgeColorCount']==1, w"
"${CLI[@]}" new --width 2 --height 2 -o "$TMP/sub/e.tmj" >/dev/null
"${CLI[@]}" tileset add "$TMP/sub/e.tmj" --firstgid 1 --source ../demo.tsx --embed >/dev/null
J "$TMP/sub/e.tmj" "t=d['tilesets'][0]; assert 'source' not in t and len(t['terrains'])==2 and t['wangsets'][0]['wangtiles'][0]['wangid']==[0,1,0,1,0,1,0,1], t"
"${CLI[@]}" wang list "$TMP/sub/e.tmj" | python3 -c "import sys,json; w=json.load(sys.stdin)['tilesets'][0]['wangsets'][0]; assert w['cornerColorCount']==2 and w['edgeColorCount']==1 and w['tileCount']==2, w"
"${CLI[@]}" export "$TMP/sub/e.tmj" -f tmx -o "$TMP/sub/e.tmx" >/dev/null
grep -q '<wangcornercolor name="Grass"' "$TMP/sub/e.tmx"; grep -q 'wangid="0x10101010"' "$TMP/sub/e.tmx"; grep -q '<terrain name="Dirt"' "$TMP/sub/e.tmx"

echo "== GID mask clears all 4 flag bits (incl. hex 120° 0x10000000) =="
node -e "const g=require('$ROOT/lib/gid.js'); const d=g.decodeGid(0x10000005); if(d.id!==5) throw new Error(JSON.stringify(d))"

echo "== TMX export: properties, next ids, template, round-trip =="
"${CLI[@]}" object add "$TMP/sub/m.tmj" --layer Obj --create-layer --name A --x 1 --y 2 >/dev/null
"${CLI[@]}" object add "$TMP/sub/m.tmj" --layer Obj --name B --x 3 --y 4 >/dev/null
"${CLI[@]}" prop set "$TMP/sub/m.tmj" --target object --layer Obj --id 1 --name hp --value 5 --type int >/dev/null
"${CLI[@]}" template apply "$TMP/sub/m.tmj" --layer Obj --template "$ROOT/fixtures/templates/spawn.tx" --x 8 --y 8 >/dev/null
J "$TMP/sub/m.tmj" "o=[l for l in d['layers'] if l['name']=='Obj'][0]['objects'][-1]; import os; assert o['template']==os.path.relpath('$ROOT/fixtures/templates/spawn.tx','$TMP/sub'), o['template']"
"${CLI[@]}" export "$TMP/sub/m.tmj" -f tmx -o "$TMP/sub/m.tmx" >/dev/null
grep -q 'nextlayerid="3"' "$TMP/sub/m.tmx"; grep -q 'nextobjectid="4"' "$TMP/sub/m.tmx"
grep -q '<property name="title" value="a&amp;b&lt;c&gt;"/>' "$TMP/sub/m.tmx"
grep -q '<property name="solid" type="bool" value="true"/>' "$TMP/sub/m.tmx"
grep -q 'template="' "$TMP/sub/m.tmx"
"${CLI[@]}" export "$TMP/sub/m.tmx" -f tmj -o "$TMP/sub/rt.tmj" >/dev/null
J "$TMP/sub/rt.tmj" "
assert d['properties']==[{'name':'title','type':'string','value':'a&b<c>'}], d['properties']
assert 'staggeraxis' not in d and d['nextobjectid']==4
og=[l for l in d['layers'] if l['name']=='Obj'][0]
assert 'properties' not in og, og.get('properties')   # must not steal first object's props
assert og['objects'][0]['properties'][0]['value']==5 and og['objects'][-1]['template'].endswith('spawn.tx')
assert d['tilesets'][0]=={'firstgid':1,'source':'../demo.tsx'}"

echo "== coord: staggered/hexagonal per upstream renderers =="
"${CLI[@]}" new --width 8 --height 8 --tilewidth 32 --tileheight 16 --orientation staggered -o "$TMP/st.tmj" >/dev/null
"${CLI[@]}" coord tile-to-pixel "$TMP/st.tmj" --x 2 --y 1 | python3 -c "import sys,json; p=json.load(sys.stdin)['pixel']; assert p=={'x':80,'y':8}, p"
"${CLI[@]}" coord pixel-to-tile "$TMP/st.tmj" --x 81 --y 9 | python3 -c "import sys,json; t=json.load(sys.stdin)['tile']; assert t=={'x':2,'y':0}, t"
"${CLI[@]}" coord pixel-to-tile "$TMP/st.tmj" --x 96 --y 16 | python3 -c "import sys,json; t=json.load(sys.stdin)['tile']; assert t=={'x':2,'y':1}, t"
"${CLI[@]}" new --width 6 --height 6 --tilewidth 32 --tileheight 32 --orientation hexagonal --staggeraxis y --staggerindex odd --hexsidelength 16 -o "$TMP/hx.tmj" >/dev/null
"${CLI[@]}" coord pixel-to-tile "$TMP/hx.tmj" --x 80 --y 24 | python3 -c "import sys,json; t=json.load(sys.stdin)['tile']; assert t=={'x':2,'y':0}, t"
"${CLI[@]}" new --width 6 --height 6 --tilewidth 32 --tileheight 32 --orientation hexagonal --staggeraxis x --staggerindex even --hexsidelength 16 -o "$TMP/hxx.tmj" >/dev/null
"${CLI[@]}" coord tile-to-pixel "$TMP/hxx.tmj" --x 2 --y 1 | python3 -c "import sys,json; p=json.load(sys.stdin)['pixel']; assert p=={'x':48,'y':48}, p"
"${CLI[@]}" coord pixel-to-tile "$TMP/hxx.tmj" --x 64 --y 64 | python3 -c "import sys,json; t=json.load(sys.stdin)['tile']; assert t=={'x':2,'y':1}, t"

echo "== world add-map fills width/height from the map =="
"${CLI[@]}" world new -o "$TMP/sub/w.world" >/dev/null
"${CLI[@]}" world add-map "$TMP/sub/w.world" --file "$TMP/sub/m.tmj" --x 0 --y 0 >/dev/null
J "$TMP/sub/w.world" "m=d['maps'][0]; assert m['fileName']=='m.tmj' and m['width']==64 and m['height']==48, m"

echo "== prop types on a .tiled-project (upstream storage) =="
"${CLI[@]}" prop types add "$TMP/p.tiled-project" --name Team --type enum --values red,blue >/dev/null
"${CLI[@]}" prop types add "$TMP/p.tiled-project" --name Unit --type class --members '[{"name":"hp","type":"int","value":1}]' --use-as object >/dev/null
J "$TMP/p.tiled-project" "t=d['propertyTypes']; assert [x['id'] for x in t]==[1,2] and t[0]['type']=='enum' and t[1]['useAs']==['object'], t"
"${CLI[@]}" prop types list "$TMP/p.tiled-project" | grep -q '"name": "Unit"'
"${CLI[@]}" prop types remove "$TMP/p.tiled-project" --name Team >/dev/null
J "$TMP/p.tiled-project" "assert [x['name'] for x in d['propertyTypes']]==['Unit']"

echo "== MCP replies with newline-delimited JSON to an NDJSON client =="
OUT=$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node "$ROOT/mcp-server.js")
echo "$OUT" | head -1 | python3 -c "import sys,json; r=json.loads(sys.stdin.readline()); assert r['id']==1 and r['result']['serverInfo']['name']=='tiled-web', r"

echo "phase8 OK"

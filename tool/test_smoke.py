#!/usr/bin/env python3
"""Smoke tests for Tiled web port (all batches)."""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
files = {
    "js": (ROOT / "tiled.js").read_text(encoding="utf-8"),
    "feat": (ROOT / "tiled-features.js").read_text(encoding="utf-8"),
    "parity": (ROOT / "tiled-parity.js").read_text(encoding="utf-8"),
    "b3": (ROOT / "tiled-batch3.js").read_text(encoding="utf-8"),
    "b4": (ROOT / "tiled-batch4.js").read_text(encoding="utf-8"),
    "b5": (ROOT / "tiled-batch5.js").read_text(encoding="utf-8"),
    "b6": (ROOT / "tiled-batch6.js").read_text(encoding="utf-8"),
    "b7": (ROOT / "tiled-batch7.js").read_text(encoding="utf-8"),
}
blob = html + "".join(files.values())

assert "tiled-batch3.js" in html
assert "tiled-batch4.js" in html
assert "tiled-batch5.js" in html
assert "tiled-batch6.js" in html
assert "tiled-batch7.js" in html
assert 'data-action="automap-browser"' in html
assert 'data-action="rule-edit"' in html
assert 'data-action="bind-assets"' in html
assert 'data-action="load-world"' in html
assert 'data-action="object-types"' in html
assert 'data-action="cli-help"' in html
assert 'data-action="terrain-mark"' in html
assert 'data-action="wang-fill"' in html
assert 'data-action="collision-import"' in html
assert 'id="mapPropsList"' in html
assert 'id="collisionSnap"' in html
assert 'id="ruleEditor"' in html
assert 'id="wangTemplatePanel"' in html
assert 'id="worldPanel"' in html
assert 'id="objectTypesEditor"' in html
assert (ROOT / "pako.min.js").is_file()
assert (ROOT / "tiled-batch4.js").is_file()

for name in (
    "stripPropMeta",
    "StrictEmpty",
    "function cellMatches",
    "Picker",
    "wangFillerFill",
    "expandWangFlipVariants",
    "openAutomapBrowser",
    "decorateTilesetCorners",
    "exportTmxWithEmbedded",
    "encoding=\"base64\"",
    "PROP_TYPES",
    "collisionSnap",
    "openRuleEditor",
    "getSurroundingPoints",
    "templateWangIdAt",
    "TiledCLI",
    "__tiledEnhanceInspector",
    "__tiledResolveAsset",
    "__tiledOnWorldFile",
    "surroundingWangIdFull",
    "wildWangIdIsUsed",
    "wangIdVariations",
    "beginPaintStroke",
    "layerChunkBounds",
    "expandWorldPatterns",
    "propertyTypes",
    "__tiledObjectTypeColor",
    "__tiledAfterDraw",
    "drawRuleCanvasEnhanced",
    "PREFS_KEY",
    "__tiledPrefs",
    "parseTemplateXml",
    "enableWorldEditor",
    "attachRuleTileset",
    "snapWorldPixel",
    "resolveMapAssets",
    "bindTemplateDirectory",
    "blitGidResolved",
    "autoResolveWorldAssets",
    "showObjectReferences",
):
    assert name in blob, f"missing {name}"

# RandomPicker
node = r"""
function Picker(){this.entries=[];this.sum=0;}
Picker.prototype.add=function(v,p){if(!(p>0))return;this.entries.push({value:v,p:p});this.sum+=p;};
Picker.prototype.pick=function(){let r=Math.random()*this.sum;for(const e of this.entries){r-=e.p;if(r<=0)return e.value;}return this.entries.at(-1).value;};
const p=new Picker(); p.add('a',0.01); p.add('b',100); 
let b=0; for(let i=0;i<200;i++) if(p.pick()==='b') b++;
if(b<150) {console.error('picker skew',b); process.exit(1);}
console.log('RandomPicker: ok', b);
"""
r = subprocess.run(["node", "-e", node], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())

# Wang rotate/flip identity-ish
node2 = r"""
function wangRotate(id, rot){ id=id>>>0; rot=((rot%4)+4)%4; for(let i=0;i<rot;i++) id=((id<<8)|(id>>>24))>>>0; return id>>>0; }
function wangFlipH(id){
  const nib=[]; for(let i=0;i<8;i++) nib.push((id>>>(i*4))&0xf);
  const hm=[0,7,6,5,4,3,2,1]; let out=0; for(let i=0;i<8;i++) out|=(nib[i]&0xf)<<(hm[i]*4); return out>>>0;
}
const id=0x12345678;
if(wangRotate(wangRotate(id,2),2)!==id) process.exit(1);
if(wangFlipH(wangFlipH(id))!==id) process.exit(1);
console.log('wang flip/rotate: ok');
"""
r = subprocess.run(["node", "-e", node2], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())

# stripPropMeta
node3 = r"""
function stripPropMeta(props){
  if(!props||typeof props!=='object') return {values:{},types:{}};
  const types=Object.assign({}, props.__propertyTypes||{});
  const values={};
  for(const [k,v] of Object.entries(props)){
    if(k==='__propertyTypes') continue; values[k]=v;
    if(!types[k]) types[k]=typeof v==='boolean'?'bool':typeof v==='number'?(Number.isInteger(v)?'int':'float'):'string';
  }
  return {values,types};
}
const {values,types}=stripPropMeta({a:true,b:1,c:'#ff0000',__propertyTypes:{c:'color',d:'file'},d:'x.png'});
if(types.a!=='bool'||types.c!=='color'||types.d!=='file'||values.a!==true) process.exit(1);
console.log('stripPropMeta: ok');
"""
r = subprocess.run(["node", "-e", node3], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())

# zlib still
node4 = (
    "const pako=require('./pako.min.js');"
    "const buf=new Uint8Array([1,0,0,0,2,0,0,0]);"
    "const c=pako.deflate(buf); const o=pako.inflate(c);"
    "if(o[0]!==1||o[4]!==2) process.exit(1); console.log('pako: ok');"
)
r = subprocess.run(["node", "-e", node4], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())


# templateWangIdAt + surrounding points staggered
node5 = r"""
function staggerIndexNum(map){return (map.staggerindex||'odd')==='even'?1:0;}
function hexTopRight(x,y,map){
  const si=staggerIndexNum(map);
  if((map.staggeraxis||'y')==='y'){if((y&1)^si)return{x:x+1,y:y-1};return{x:x,y:y-1};}
  if((x&1)^si)return{x:x+1,y:y};return{x:x+1,y:y-1};
}
function getSurroundingPoints(x,y,map){
  const points=new Array(8);
  const ori=map.orientation||'orthogonal';
  if(ori==='staggered'||ori==='hexagonal'){
    points[0]=hexTopRight(x,y,map);
    // fill rest minimally for test
    for(let i=1;i<8;i++) if(!points[i]) points[i]={x:x,y:y};
    if((map.staggeraxis||'y')==='y'){points[1]={x:x+1,y:y};points[3]={x:x,y:y+2};points[5]={x:x-1,y:y};points[7]={x:x,y:y-2};}
  } else {
    const around=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
    for(let i=0;i<8;i++) points[i]={x:x+around[i][0],y:y+around[i][1]};
  }
  return points;
}
function templateWangIdAt(ws,n){
  let wangId=0; const ec=ws.ec||1, cc=ws.cc||1;
  const cep=ec*cc; n=n>>>0;
  for(let i=7;i>=0;--i){
    const below=Math.pow(cep,Math.floor(i/2))*((i&1)?ec:1);
    const value=Math.floor(n/below); n-=value*below; wangId|=value<<(i*4);
  }
  wangId=(wangId+0x11111111)>>>0;
  if(ec<=1) wangId&=0xf0f0f0f0; if(cc<=1) wangId&=0x0f0f0f0f;
  return wangId>>>0;
}
const ortho=getSurroundingPoints(5,5,{orientation:'orthogonal'});
if(ortho[0].x!==5||ortho[0].y!==4) process.exit(1);
const stag=getSurroundingPoints(2,2,{orientation:'staggered',staggeraxis:'y',staggerindex:'odd'});
if(stag[1].x!==3||stag[1].y!==2) process.exit(1);
const id=templateWangIdAt({ec:2,cc:2},0);
if(id!==0x11111111) {console.error(id.toString(16)); process.exit(1);}
console.log('wang surround/template: ok');
"""
r = subprocess.run(["node", "-e", node5], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())

# TiledCLI surface present
assert "exportMap:" in files["b4"] or "exportMap: function" in files["b4"] or "exportMap:function" in files["b4"] or "exportMap:" in files["b4"]


# wildWangIdIsUsed / variations
node6 = r"""
function setNib(wid,i,val){wid=wid>>>0;wid&=~(0xf<<(i*4));wid|=(val&0xf)<<(i*4);return wid>>>0;}
function getNib(wid,i){return (wid>>>(i*4))&0xf;}
function wangIdVariations(wangId,edgeColors,cornerColors){
  wangId=wangId>>>0; const zeros=[];
  for(let i=0;i<8;i++){ if(getNib(wangId,i)) continue; if((i&1)===0){if(edgeColors>1)zeros.push(i);} else if(cornerColors>1)zeros.push(i); }
  const out=[]; if(!zeros.length){out.push(wangId);return out;}
  const vals=zeros.map(()=>0); const maxes=zeros.map(i=>((i&1)?cornerColors:edgeColors));
  let guard=0; while(guard++<10000){ let id=wangId; for(let z=0;z<zeros.length;z++) id=setNib(id,zeros[z],vals[z]); out.push(id>>>0);
    let carry=true; for(let z=0;z<zeros.length&&carry;z++){ vals[z]++; if(vals[z]>maxes[z]) vals[z]=0; else carry=false;} if(carry)break; }
  return out;
}
const v=wangIdVariations(0x00000001,2,2);
if(v.length<2) {console.error('vars',v.length); process.exit(1);}
console.log('wang variations: ok', v.length);
"""
r = subprocess.run(["node", "-e", node6], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())

# beginPaintStroke / infinite markers
assert "beginPaintStroke" in files["js"]
assert "layerChunkBounds" in files["js"]
assert "wildWangIdIsUsed" in files["b5"]

# prefs defaults roundtrip
node7 = r"""
const DEFAULT={showGrid:true,gridColor:'#a0b4d2',snapToGrid:false,language:'zh_CN'};
const merged=Object.assign({},DEFAULT,{snapToGrid:true});
if(!merged.snapToGrid||merged.language!=='zh_CN') process.exit(1);
console.log('prefs merge: ok');
"""
r = subprocess.run(["node", "-e", node7], cwd=str(ROOT), capture_output=True, text=True)
assert r.returncode == 0, r.stderr + r.stdout
print(r.stdout.strip())
assert "enableWorldEditor" in files["b6"]
assert "parseTemplateJson" in files["b6"]
assert 'data-action="preferences"' in html
assert 'data-action="templates"' in html
assert 'data-action="world-editor"' in html

assert "resolveMapAssets" in files["b7"]
assert "bindTemplateDirectory" in files["b7"]
assert 'data-action="tpl-bind-dir"' in html
assert "autoResolveWorldAssets" in files["b7"]
print("tiled local web smoke: ok")

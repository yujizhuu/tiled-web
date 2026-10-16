#!/usr/bin/env python3
"""Generate tiles.png: 8x4 tiles of 16px, each colored + numbered (local id)."""
from PIL import Image, ImageDraw
T=16; C=8; R=4
cols=[(80,170,60),(150,110,60),(50,110,200),(110,110,120),(60,60,70),(190,180,150),(30,110,40),(120,70,30),
      (210,170,40),(200,160,110),(220,60,60),(240,240,240),(160,60,180),(60,200,200),(250,140,30),(20,20,20)]
img=Image.new('RGBA',(T*C,T*R),(0,0,0,0)); d=ImageDraw.Draw(img)
for i in range(C*R):
    x,y=(i%C)*T,(i//C)*T; c=cols[i%len(cols)]
    if i>=16: c=tuple(max(0,v-50) for v in c)
    d.rectangle([x,y,x+T-1,y+T-1],fill=c+(255,),outline=(0,0,0,255))
    d.polygon([(x+1,y+1),(x+5,y+1),(x+1,y+5)],fill=(255,255,255,255))  # orientation marker (top-left)
    d.text((x+4,y+4),str(i),fill=(0,0,0,255) if sum(c)>350 else (255,255,255,255))
img.save('tiles.png')

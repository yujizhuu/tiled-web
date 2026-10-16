#!/usr/bin/env python3
"""Generate tiles.png: 8x4 tiles of 16px, procedural pixel art on one shared palette.
Local ids (gid = id+1) keep the original layout used by build.sh / village.tsx / templates / rules:
 0 grass  1 dirt  2 water  3 stone wall  4 wall shadow  5 wood floor  6 tree  7 door
 8 chest  9 road 10 flowers 11 sand 12 roof 13 cave floor 14 cave wall 15 bush
16 coin  17 gem  18 potion 19 key  20 sword 21 heart 22 rock 23 mushroom
24 fence 25 sign 26 well  27 lamp 28 grass tuft 29 lily pad 30 window wall 31 barrel
Ground tiles (0,1,2,5,9,11,13,14) use 16-periodic noise so they tile seamlessly."""
from PIL import Image
import random
T=16; C=8; R=4
P={k:tuple(int(v[i:i+2],16) for i in (0,2,4))+(255,) for k,v in dict(
 o='1a1c2c', g0='38b764', g1='257179', g2='a7f070', g3='2f8f4e',
 d0='a0703c', d1='7a5230', d2='c8955a', w0='3b5dc9', w1='41a6f6', w2='73eff7', w3='29366f',
 s0='566c86', s1='333c57', s2='94b0c2', s3='f4f4f4', b0='8b5a2b', b1='5d3a1a', b2='b8814a',
 y0='ffcd75', y1='ef7d57', r0='b13e53', r1='e05a6a', sa='e8cf90', sb='cfae6a',
 c0='3a3346', c1='4f4560', c2='29263a', p0='9b59b6', k0='000000').items()}
img=Image.new('RGBA',(T*C,T*R),(0,0,0,0)); px=img.load()
def tile(i):
    ox,oy=(i%C)*T,(i//C)*T
    def put(x,y,c):
        if 0<=x<T and 0<=y<T: px[ox+x,oy+y]=c
    return put
def noise(i,put,base,spots,density,seed):
    rnd=random.Random(seed)
    for y in range(T):
        for x in range(T): put(x,y,base)
    for _ in range(int(T*T*density)):
        put(rnd.randrange(T),rnd.randrange(T),rnd.choice(spots))
def grid(put,rows,fill,line,hi=None):
    for y in range(T):
        for x in range(T):
            off=4 if (y//4)%2 else 0
            c=line if (y%4==3 or (x+off)%8==7) else fill
            if hi and y%4==0 and (x+off)%8!=7: c=hi
            put(x,y,c)
def shape(put,art,pal):
    for y,row in enumerate(art):
        for x,ch in enumerate(row):
            if ch!='.': put(x,y,P[pal[ch]])
G=P['g0']
# 0 grass
p=tile(0); noise(0,p,G,[P['g3'],P['g2'],P['g3']],0.22,1)
# 1 dirt
p=tile(1); noise(1,p,P['d0'],[P['d1'],P['d2']],0.25,2)
# 2 water (horizontal waves, periodic)
p=tile(2); noise(2,p,P['w0'],[P['w0']],0,3)
for (x,y) in [(1,3),(2,3),(3,2),(9,6),(10,6),(11,5),(4,11),(5,11),(6,10),(12,13),(13,13),(14,12)]:
    p(x,y,P['w1']); p(x+1,y-1 if y>0 else y,P['w2'])
# 3 stone wall
p=tile(3); grid(p,4,P['s0'],P['s1'],P['s2'])
# 4 shadow (translucent, top half heavier)
p=tile(4)
for y in range(T):
    for x in range(T): p(x,y,(0,0,0,110 if y<6 else 60 if y<11 else 25))
# 5 wood floor
p=tile(5)
for y in range(T):
    for x in range(T):
        c=P['b0']
        if x%4==3: c=P['b1']
        elif (y+(x//4)*5)%16==0: c=P['b1']
        elif x%4==0: c=P['b2']
        p(x,y,c)
# 6 tree (transparent bg)
shape(tile(6),[
"......oooo......","....oo3322oo....","...o33222222o...","..o3322222g22o..",
".o332222g22222o.",".o32222222g222o.","o3322g222222222o","o3222222222g222o",
".o32222g22222go.",".o332222222ggo..","..oo3332ggg3oo..","....oooddooo....",
"......oddo......","......oddo......",".....oddddo.....","......oooo......"],
 {'o':'o','3':'g3','2':'g0','g':'g1','d':'b1'})
# 7 door (on wall)
p=tile(7); grid(p,4,P['s0'],P['s1'],P['s2'])
shape(p,[
"................","....oooooooo....","...obbbbbbbbo...","..obblbbbblbbo..",
"..obblbbbblbbo..","..obblbbbblbbo..","..obblbbbblbbo..","..obblbbbblbbo..",
"..obblbbbbyybo..","..obblbbbblbbo..","..obblbbbblbbo..","..obblbbbblbbo..",
"..obblbbbblbbo..","..obblbbbblbbo..","..obblbbbblbbo..","..oooooooooooo.."],
 {'o':'o','b':'b0','l':'b1','y':'y0'})
# 8 chest
shape(tile(8),[
"................","................","...oooooooooo...","..obbbbbbbbbbo..",
"..obhhhhhhhhbo..","..obbbbbbbbbbo..","..oyyyyyyyyyyo..","..obbbbyybbbbo..",
"..obbbbyybbbbo..","..obbbbbbbbbbo..","..obbbbbbbbbbo..","..oyyyyyyyyyyo..",
"...oooooooooo...","................","................","................"],
 {'o':'o','b':'b0','h':'b2','y':'y0'})
# 9 road (cobbles)
p=tile(9); noise(9,p,P['sb'],[P['sb']],0,9)
rnd=random.Random(9)
for cy in range(0,T,4):
    for cx in range(0 if cy%8 else 2,T,4):
        c=rnd.choice([P['s2'],P['sa'],P['s2']])
        for y in range(cy,cy+3):
            for x in range(cx,cx+3): p(x%T,y%T,c)
# 10 flowers (on grass)
p=tile(10); noise(10,p,G,[P['g3'],P['g2']],0.18,10)
for (x,y,c) in [(3,3,'r1'),(11,2,'y0'),(7,8,'s3'),(13,11,'r1'),(2,12,'y0'),(9,13,'p0')]:
    for dx,dy in [(0,-1),(-1,0),(1,0),(0,1)]: p(x+dx,y+dy,P[c])
    p(x,y,P['y1'])
# 11 sand
p=tile(11); noise(11,p,P['sa'],[P['sb'],P['y0']],0.15,11)
# 12 roof
p=tile(12)
for y in range(T):
    for x in range(T):
        c=P['r0'] if (y%4) else P['r1']
        if y%4==3 and x%4==(y//4)%2*2: c=P['o']
        p(x,y,c)
# 13 cave floor
p=tile(13); noise(13,p,P['c1'],[P['c0'],P['c2']],0.25,13)
# 14 cave wall
p=tile(14); noise(14,p,P['c2'],[P['c0'],P['s1']],0.3,14)
# 15 bush
shape(tile(15),[
"................","................","................","................",
"................",".....oooooo.....","...oo222g22oo...","..o2222r22222o..",
".o222g2222g222o.",".o22r22222222o..",".o2222g22r222o..","..o32222222g3o..",
"...oo333333oo...",".....oooooo.....","................","................"],
 {'o':'o','2':'g3','g':'g2','r':'r1','3':'g1'})
# 16-23 items
items={
16:(["......oooo......","....oyyyyyo.....","...oyhhyyyyo....","...oyhyyyyyo....","...oyyyyyyyo....",
     "...oyyyyyyyo....","....oyyyyyo.....","......oooo......"],{'o':'o','y':'y0','h':'s3'}),
17:(["......oooo......",".....owwwwo.....","....owhwwwwo....","...owwwwwwwwo...","....owwwwwwo....",
     ".....owwwwo.....","......owwo......",".......oo......."],{'o':'o','w':'w1','h':'w2'}),
18:(["......oooo......",".......bb.......","......oxxo......",".....orrrro.....","....orhrrrro....",
     "....orrrrrro....",".....orrrro.....","......oooo......"],{'o':'o','b':'b0','x':'s2','r':'r1','h':'s3'}),
19:(["....ooo.........","...oyyyo........","...oy.yooooooo..","...oyyyyyyyyyyo.","....ooo.oyoyo...",
     "........o.o.o...","................","................"],{'o':'o','y':'y0'}),
20:([".............oo.","............oso.","...........oso..","..........oso...","....o....oso....",
     ".....o..oso.....","......oyso......","......byo.......",".....bo.o.......","....bo...o......"],{'o':'o','s':'s2','y':'y0','b':'b1'}),
21:(["................","...ooo...ooo....","..orrro.orrro...",".orhrrrorrrrro..",".orrrrrrrrrrro..",
     "..orrrrrrrrro...","...orrrrrrro....","....orrrrro.....",".....orrro......","......oro.......",".......o........"],{'o':'o','r':'r1','h':'s3'}),
22:(["................","................","................","................","................","................",
     "................","......oooo......","....oo2221o.....","...o222222o.....","...o21222211o...","..o2222222221o..",
     "..o1122222111o..","...oooooooooo...","................","................"],{'o':'o','2':'s2','1':'s0'}),
23:(["................","................","................","................","................","....oooooo......",
     "...orrsrrrro....","..orsrrrrsrro...","..orrrrrrrrro...","...oooxxoooo....","......oxxo......","......oxxo......",
     ".....oxxxxo.....","......oooo......","................","................"],{'o':'o','r':'r1','s':'s3','x':'sa'}),
}
for i,(art,pal) in items.items():
    if len(art)<16: art=["................"]*((16-len(art))//2)+art
    shape(tile(i),art,pal)
# 24 fence
shape(tile(24),["................","................","................","..oo........oo..",".ohbo......ohbo.",
 "oooooooooooooooo","bhhhhhhhhhhhhhhb","oooooooooooooooo",".obbo......obbo.",".obbo......obbo.",
 "oooooooooooooooo","bhhhhhhhhhhhhhhb","oooooooooooooooo",".obbo......obbo.",".obbo......obbo.","..oo........oo.."],
 {'o':'o','b':'b0','h':'b2'})
# 25 sign
shape(tile(25),["................","................","..oooooooooooo..",".ohhhhhhhhhhhho.",".ohllllllllllho.",
 ".ohhhhhhhhhhhho.",".ohllllllllhhho.",".ohhhhhhhhhhhho.","..oooooobooooo..",".......ob.......",
 ".......ob.......",".......ob.......",".......ob.......","......oobo......","................","................"],
 {'o':'o','h':'b2','l':'b1','b':'b1'})
# 26 well
shape(tile(26),["................","....oooooooo....","...orrrrrrrro...","..orrrrrrrrrro..","....ob....ob....",
 "....ob....ob....","..oooooooooooo..",".o222222222222o.",".o2wwwwwwwwww2o.",".o1wwwwwwwwww1o.",
 ".o222222222222o.",".o111111111111o.",".o222222222222o.","..oooooooooooo..","................","................"],
 {'o':'o','r':'r0','b':'b1','2':'s2','1':'s0','w':'w0'})
# 27 lamp
shape(tile(27),[".......oo.......","......oyyo......",".....oyhhyo.....",".....oyyyyo.....","......oooo......",
 ".......ob.......",".......ob.......",".......ob.......",".......ob.......",".......ob.......",
 ".......ob.......",".......ob.......",".......ob.......","......oobo......",".....ooooo......","................"],
 {'o':'o','y':'y0','h':'s3','b':'s1'})
# 28 tall grass tuft
shape(tile(28),["................","................","................","................","................","................",
 "................","...g......g.....","...g..g...g..g..","..gg..g..gg..g..","..g3.gg..g3.gg..","..g3.g3..g3.g3..",
 ".g33g33.g33g33..","................","................","................"],{'g':'g2','3':'g3'})
# 29 lily pad (on water)
p=tile(29); noise(29,p,P['w0'],[P['w0']],0,29)
shape(p,["................","................","................","....oooooo......","...o222222o.....","..o22222..o.....",
 "..o2222g222o....","..o222222222o...","..o222222222o...","...o2222222o....","....ooooooo.....",
 "..........r.....",".........rrr....","..........r.....","................","................"],
 {'o':'g1','2':'g0','g':'g2','r':'r1'})
# 30 window wall
p=tile(30); grid(p,4,P['s0'],P['s1'],P['s2'])
shape(p,["................","................","...oooooooooo...","...owwwowwwwo...","...owhwowwwwo...","...owwwowwwwo...",
 "...oooooooooo...","...owwwowwwwo...","...owwwowwwwo...","...oooooooooo...","..bbbbbbbbbbbb..","................",
 "................","................","................","................"],{'o':'b1','w':'w1','h':'w2','b':'b0'})
# 31 barrel
shape(tile(31),["................","................","....oooooooo....","...obbbbbbbbo...","...ossssssssso..","..obhbbbbbbbbo..",
 "..obhbbbbbbbbo..","..ossssssssssso.","..obhbbbbbbbbo..","..obhbbbbbbbbo..","...ossssssssso..","...obbbbbbbbo...",
 "....oooooooo....","................","................","................"],{'o':'o','b':'b0','h':'b2','s':'s1'})
img.save('tiles.png')

# ---------- items.png: separate pickup/item tileset (8x3, 16px), same palette ----------
img=Image.new('RGBA',(T*C,T*3),(0,0,0,0)); px=img.load()
def gem(c,h): return (["................","................","................","......oooo......",".....occcco.....","....ochcccco....",
 "...occcccccco...","....occcccco.....",".....occcco.....","......occo......",".......oo.......","................"],{'o':'o','c':c,'h':h})
def potion(c): return (["................","................","......oooo......",".......bb.......","......oxxo......",".....occcco.....",
 "....ochccccco...","....occcccco....","....occcccco....",".....occcco.....","......oooo......","................"],{'o':'o','b':'b0','x':'s2','c':c,'h':'s3'})
def key(c): return (["................","................","....ooo.........","...occco........","...oc.cooooooo..","...occcccccccco.",
 "....ooo.ococo...","........o.o.o...","................"],{'o':'o','c':c})
art={
0:(["................","......oooo......","....oyyyyyo.....","...oyhhyyyyo....","...oyhyyyyyo....","...oyyyyyyyo....",
    "...oyyyyyyyo....","....oyyyyyo.....","......oooo......"],{'o':'o','y':'y0','h':'s3'}),
1:(["................","..oooo..........",".oyyyyo...oooo..",".oyhyyo..oyyyyo.",".oyyyyo..oyhyyo.","..oooo...oyyyyo.",
    "......oooo.ooo..",".....oyyyyo.....",".....oyhyyo.....",".....oyyyyo.....","......oooo......"],{'o':'o','y':'y0','h':'s3'}),
2:gem('w1','w2'),3:gem('r1','s3'),4:gem('g0','g2'),5:gem('p0','s3'),
6:potion('r1'),7:potion('w1'),8:potion('g0'),
9:key('y0'),10:key('s2'),
11:([".............oo.","............oso.","...........oso..","..........oso...","....o....oso....",".....o..oso.....",
     "......oyso......","......byo.......",".....bo.o.......","....bo...o......"],{'o':'o','s':'s2','y':'y0','b':'b1'}),
12:(["................","..oooooooooooo..","..osssssssssso..","..osrrrrrrrrso..","..osrryyyrrrso..","..osrryyyrrrso..",
     "..osrrrrrrrrso..","...osrrrrrrso...","....osrrrrso....",".....ossso......","......ooo......."],{'o':'o','s':'s2','r':'w0','y':'y0'}),
13:(["................","...ooo...ooo....","..orrro.orrro...",".orhrrrorrrrro..",".orrrrrrrrrrro..","..orrrrrrrrro...",
     "...orrrrrrro....","....orrrrro.....",".....orrro......","......oro.......",".......o........"],{'o':'o','r':'r1','h':'s3'}),
14:(["................","...oooooooooo...","..obsssssssbbo..","..obsllllllsbo..","...osssssssso...","...osllllllso...",
     "...osssssssso...","...osllllllso...","..obsssssssbbo..","..obbsssssssbo..","...oooooooooo..."],{'o':'o','s':'sa','l':'d1','b':'b2'}),
15:(["................","................","....oooooo......","...orrrrrro.....","..orrhrrrrro....","..orrrrrrrro....",
     "..orrrrrrrroo...","...orrrrrrobso..","....oooooo.oso..","...........oo..."],{'o':'o','r':'r1','h':'s3','b':'s3','s':'s2'}),
16:(["................","................","......ooo.......",".....oyyyo......","....oyhyyyo.....","...oyyyyyyyo....",
     "..obbbbbbbbbo...","..oyyyyyyyyyo...","...ooooooooo...."],{'o':'o','y':'y1','h':'y0','b':'b0'}),
17:(["................","...........oy...","..........o.y...","......oooo......","....oossssoo....","...osshssssso...",
     "...osshsssssso..","...osssssssso...","....osssssso....",".....oooooo....."],{'o':'o','s':'c0','h':'s2','y':'y0'}),
18:(["................","...oooooooooo...","..obhhhhhhhhbo..","..obbbbbbbbbbo..","..oyyyyyyyyyyo..","..obbbbyybbbbo..",
     "..obbbbyybbbbo..","..obbbbbbbbbbo..","..oyyyyyyyyyyo..","...oooooooooo..."],{'o':'o','b':'b0','h':'b2','y':'y0'}),
19:(["................","......oooo......",".....oyyyyo.....","....oyhhhhyo....","....oyhwwhyo....","....oyhhhhyo....",
     ".....oyyyyo.....","......oyyo......",".....oyyyyo.....","......oooo......"],{'o':'o','y':'y0','h':'y1','w':'w1'}),
20:(["................",".......oo.......","......oyyo......",".....oyrryo.....","....oyrhrryo....","...oyrrrrrryo...",
     "....oyrrrryo....",".....oyrryo.....","......oyyo......",".......oo......."],{'o':'o','y':'y0','r':'p0','h':'s3'}),
21:(["................","................","....oooooooo....","...obbbbbbbbo...","...oyyyyyyyyo...","...owwwwwwwwo...",
     "...obbbbbbbbo...","...oyyyyyyyyo...","....oooooooo...."],{'o':'o','b':'b0','y':'y0','w':'s3'}),
22:([".......o........","......oyo.......",".....oyyyo......","..oooyhyyooo....","..oyyyyyyyyyo...","...oyyyyyyyo....",
     "....oyyyyyo.....","...oyyoooyyo....","...oyo...oyo....","...oo.....oo...."],{'o':'o','y':'y0','h':'s3'}),
23:(["................","....oooooooo....","...ow.w.w.w.o...","...oooooooooo...","...os.s.s.s.o...","...oooooooooo...",
     "...ob.b.b.b.o...","...oooooooooo..."],{'o':'o','w':'s3','s':'s2','b':'b2'}),
}
for i,(a,pal) in art.items():
    a=["................"]*((16-len(a))//2)+a
    shape(tile(i),a,pal)
img.save('items.png')

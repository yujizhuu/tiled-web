<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.2" tiledversion="1.2.4" name="village" tilewidth="16" tileheight="16" tilecount="32" columns="8">
 <image source="tiles.png" width="128" height="64"/>
 <terraintypes>
  <terrain name="Grass" tile="0"/>
  <terrain name="Dirt" tile="1"/>
  <terrain name="Water" tile="2"/>
 </terraintypes>
 <tile id="0" terrain="0,0,0,0"/>
 <tile id="1" terrain="1,1,1,1"/>
 <tile id="2" terrain="2,2,2,2"/>
 <wangsets>
  <wangset name="Ground" tile="0">
   <wangcornercolor name="Grass" color="#ff50aa3c" tile="0" probability="1"/>
   <wangcornercolor name="Dirt" color="#ff966e3c" tile="1" probability="1"/>
   <wangedgecolor name="Road" color="#ffc8a06e" tile="9" probability="1"/>
   <wangtile tileid="0" wangid="0x10101010"/>
   <wangtile tileid="1" wangid="0x20202020"/>
   <wangtile tileid="9" wangid="0x1010101"/>
  </wangset>
 </wangsets>
</tileset>

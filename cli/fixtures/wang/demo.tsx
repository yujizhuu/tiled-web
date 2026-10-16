<?xml version="1.0" encoding="UTF-8"?>
<tileset name="wangdemo" tilewidth="16" tileheight="16" tilecount="16" columns="4">
  <image source="wang.png" width="64" height="64"/>
  <terraintypes>
    <terrain name="Grass" tile="0"/>
    <terrain name="Dirt" tile="1"/>
  </terraintypes>
  <wangsets>
    <wangset name="Ground" tile="0">
      <wangcornercolor name="Grass" color="#00ff00" tile="0" probability="1"/>
      <wangcornercolor name="Dirt" color="#8b4513" tile="1" probability="1"/>
      <wangedgecolor name="Edge" color="#888888" tile="2" probability="1"/>
      <wangtile tileid="0" wangid="0x10101010"/>
      <wangtile tileid="1" wangid="0x20202020"/>
    </wangset>
  </wangsets>
</tileset>

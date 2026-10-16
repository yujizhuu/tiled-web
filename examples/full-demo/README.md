# 像素村 · tiled-web CLI 全功能示例

用 tiled-web CLI（`cli/bin/tiled-web.js`）从零做一张小村庄关卡 + 一个无限大洞穴，
把 `tiled-web --help` 里**每一个命令和子命令**都实际用一遍，并用**上游官方 Tiled 1.11**（`tiled` / `tmxrasterizer`）验证结果。

```bash
cd examples/full-demo
python3 gen_tileset.py   # （可选）重新生成 tiles.png：8×4 个 16px 程序化像素画图块（统一调色板，地面无缝平铺）
bash build.sh            # 只调用 node cli/bin/tiled-web.js … 构建全部产物到 out/
bash validate.sh         # （可选）需要 apt 安装 tiled xvfb：用官方 Tiled 做真值校验
```

预览：`out/village.png`（村庄）、`out/cave.png`（无限洞穴）、`out/validate/compare.png`（左：官方 tmxrasterizer，右：本例渲染器）。

## 文件

| 文件 | 说明 |
|---|---|
| `tiles.png` / `items.png` / `gen_tileset.py` | items.png = 内嵌道具图块集 items（firstgid 33，24 个：金币、多色宝石、药水、钥匙、剑、盾、爱心、卷轴、食物、炸弹、宝箱、星星等）；图块集图片（原创程序化像素画，随仓库同许可；本地 id 布局见 gen_tileset.py 文件头，gid = id+1） |
| `village.tsx` | 外部图块集：含 `terraintypes`（草/土/水）与 `wangsets`（角色 Grass/Dirt、边色 Road） |
| `templates/chest.tx` | XML 模板：图块对象（宝箱，带 tileset 引用和属性） |
| `templates/sign.tj` | JSON 模板：矩形对象（路牌） |
| `rules/rules.txt` + `rules/shadow.tmj` | 自动地图规则：墙下方是空的 → 在 Shadow 层画阴影（rule map 也是用 CLI 搭出来的） |
| `build.sh` | 构建脚本（336 次 CLI 调用） |
| `mcp_demo.py` | MCP stdio 客户端示例（按 MCP 规范逐行 JSON-RPC） |
| `render.py` | 极简 TMJ→PNG 渲染器（支持外部 .tsx、H/V/D 翻转位、无限 chunks、对象） |
| `validate.sh` | 上游 Tiled 真值校验 |
| `out/village.tmj` / `.tmx` / `.zlib.tmx` / `.gzip.tmx` / `.csv` | 最终村庄（TMJ、TMX CSV / base64+zlib / base64+gzip、CSV） |
| `out/cave.tmj` / `cave.tmx` | 无限地图（chunks；TMX 为 base64+gzip） |
| `out/demo.world` | World（显式列表）：村庄 / 森林 / 湖泊 / 田野 2×2 + 东侧洞穴 |
| `out/forest.tmj` / `lake.tmj` / `field.tmj` | 世界里的 3 张新地图（道路、河流跨边界接上） |
| `out/regions/regions.world` + `region_X_Y.tmj` | World（patterns 正则）：6 块 3×2 区域拼成一座岛 |
| `world_render.py` | 世界总览图：逐图用官方 tmxrasterizer 渲染，再按世界坐标拼接 → `out/world.png`、`out/regions.png` |
| `out/village.tiled-project` | 自定义类型按上游方式存放在项目文件里 |

## 步骤与功能对照

| 步骤 | 做了什么 | 用到的命令 / 参数 |
|---|---|---|
| 0 | 看版本 | `version` |
| 1 | 建 20×14 地图，挂外部 `.tsx` + 内嵌道具图块集 items.png | `new`、`tileset add --source`、`tileset add --image`、`tileset list` |
| 2 | 图层：Ground/Walls/Shadow/Deco/Objects，加一个临时层再删掉 | `layer rename/add/remove/list`、`--type tile|object` |
| 3 | 铺草地、道路、池塘、房屋外墙、地板、门；4 棵树分别 原样/水平/垂直/旋转90° | `fill`、`set-tile --flip-h/--flip-v/--flip-d`、`get-layer --format csv|json` |
| 4 | 把房屋 A 复制成房屋 B（墙 + 地板） | `stamp copy`、`stamp paste` |
| 5 | 门 ↔ 箱子 互换演示 | `replace-gid`（含 `--match-flips`） |
| 6 | 自动地图：墙下自动加阴影（14 格），再用半径局部重跑 | `automap --rules`、`automap --radius --x --y` |
| 7 | 对象：出生点(point)、村庄范围(rect)、池塘(ellipse)、栅栏(polygon)、新建 Spawns 层放敌人；改名/移动/删除；套用 2 个模板 | `object add --shape … --class --create-layer`、`object update`、`object remove`、`object list`、`template info/index/apply` |
| 8 | 属性：map(标题/难度)、layer(碰撞)、object(速度)、tileset(种类)；自定义枚举 Faction、类 Stats（`useAs`、颜色、填充） | `prop set/get/list/remove --target map|layer|object|tileset`、`prop types add/get(--no-expand)/list/remove`、项目文件 `.tiled-project` |
| 9 | 无限洞穴：负坐标 fill、chunk 内 set-tile、跨 chunk 图章 | `new --infinite`、`fill`、`set-tile`、`stamp`、`info` |
| 10 | 坐标换算：正交 / 等距 / 六边形 / 交错，含命令行参数模式 | `coord tile-to-pixel`、`coord pixel-to-tile`、`new --orientation … --staggeraxis --staggerindex --hexsidelength`、`tileset add --embed` |
| 11 | 列出 Wang 集与地形 | `wang list`、`terrain list` |
| 12 | World：建森林/湖泊/田野三张图，和村庄、洞穴一起显式列进 `demo.world`（有的填尺寸、有的自动读取），再演示删一张；另建 6 张 `region_X_Y.tmj` 用 patterns 自动收进 `regions.world` | `world new/add-map/remove-map/add-pattern/remove-pattern/info` |
| 13 | MCP：initialize → tools/list → `tiled_version` / `tiled_set_tile`（放一朵翻转的花）/ `tiled_info` / `tiled_wang` | `cli/mcp-server.js` |
| 14 | 文本信息、导出全部格式，TMX→TMJ 回读 | `info --format text`、`export -f tmj|tmx|csv`、`--encoding base64 --compression zlib|gzip` |
| 15 | 渲染预览图 | `render.py` |

`--help` 中的所有命令和子命令都已用到。实时自动地图、Wang 笔刷、撤销等交互功能请在网页版中使用。

## World（世界）

**是什么**：`.world` 是 Tiled 的一个小 JSON 文件，只记录「哪些地图、各自放在世界坐标的哪里」，不含图块数据。打开它，Tiled 会把这些地图按位置并排显示，可以在地图之间直接切换、对齐边界。

**为什么**：大关卡拆成很多小地图更好编辑、加载和协作（每人改一块，游戏按需流式加载），但又要保证路和河在边界处接得上。World 就是把这些小地图拼回一张"大地图"来看的办法。

**怎么做**（两种写法，上游 Tiled 1.2.4 起都支持）：

1. **显式列表 `maps`**（`out/demo.world`）：每张图写 `fileName` + `x`/`y`（像素），可选 `width`/`height`。
   ```bash
   tiled-web world new -o out/demo.world
   tiled-web world add-map out/demo.world --file village.tmj --x 0 --y 0 --width 320 --height 224
   tiled-web world add-map out/demo.world --file forest.tmj --x 320 --y 0     # 不写尺寸 → 从地图自动读取
   ```
   本例：村庄 (0,0)、森林 (320,0)、湖泊 (0,224)、田野 (320,224)，洞穴（无限地图）在 (704,48)。村庄的东西大路接森林，南路接湖泊；森林的南路接田野；湖泊里流出的河穿过田野折向南，路过河的地方有木桥。
2. **正则 `patterns`**（`out/regions/regions.world`）：不逐个列文件，而是写一个正则，**两个捕获组**就是格子坐标：
   ```bash
   tiled-web world add-pattern out/regions/regions.world --regexp 'region_(\d+)_(\d+)\.tmj' \
     --multiplier-x 160 --multiplier-y 160 --offset-x -240 --offset-y -160 --map-width 160 --map-height 160
   ```
   `region_2_1.tmj` 的位置是 (2×160−240, 1×160−160) = (80, 0)。以下规则和上游源码 `world.cpp` 保持一致：
   - 只匹配 `.world` **同一文件夹**里的文件，不找子目录。
   - 正则是**非锚定**搜索，不要求整串匹配。
   - `multiplierX/Y` 默认 1，不能为 0；`offsetX/Y` 默认 0；`mapWidth/Height` 默认取 |multiplier|。
   - 捕获组个数不是 2 的 pattern 会被拒绝。

   `tiled-web world info` 的 `resolvedMaps` 会列出实际收到的地图。

**怎么打开**：
- 桌面版 Tiled：「文件 → 打开」选 `.world`（或 1.2.4 的「地图 → 加载世界」）。
- 网页版：点「打开文件夹」选 `examples/full-demo`，在列表里点 `out/demo.world` 或 `out/regions/regions.world`。当前地图正常编辑，其它地图按世界坐标画在四周；左侧 World 面板可以点选切换。patterns 打开时就自动收图，导出 `.world` 时不会把收到的图写进 `maps`。
- 只看图：`out/world.png`、`out/regions.png`（由 `world_render.py` 生成）。

## 用官方 Tiled 校验

`validate.sh` 做四项检查：官方 `tmxrasterizer` 能打开全部产物，且 TMX（csv/zlib/gzip）与 TMJ 的渲染逐像素一致；`tiled --export-map` 解析出的图块、翻转位、对象和属性与 CLI 结果一致；官方 AutoMapper 用同一套规则生成的 Shadow 层与 CLI 完全一致。第四项是 World：官方 `tmxrasterizer` 直接加载 `demo.world` 和带 patterns 的 `regions.world`。它收到的地图数量、拼出的世界尺寸和像素，都要与 CLI 的 `resolvedMaps` 加上 `world_render.py --plain` 的结果一致；唯一允许的差异是村庄 Zone 矩形描边在地图外缘多出的 1px。

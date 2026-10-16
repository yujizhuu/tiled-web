# 像素村 · tiled-web CLI 全功能示例

用 **tiled-web CLI 0.7.1**（`cli/bin/tiled-web.js`）从零做一张小村庄关卡 + 一个无限大洞穴，
把 `tiled-web --help` 里**每一个命令和子命令**都实际用一遍，并用**上游官方 Tiled 1.11**（`tiled` / `tmxrasterizer`）验证结果。

```bash
cd examples/full-demo
python3 gen_tileset.py   # （可选）重新生成 tiles.png：8×4 个 16px 彩色带编号图块
bash build.sh            # 只调用 node cli/bin/tiled-web.js … 构建全部产物到 out/
bash validate.sh         # （可选）需要 apt 安装 tiled xvfb：用官方 Tiled 做真值校验
```

预览：`out/village.png`（村庄）、`out/cave.png`（无限洞穴）、`out/validate/compare.png`（左：官方 tmxrasterizer，右：本例渲染器）。

## 文件

| 文件 | 说明 |
|---|---|
| `tiles.png` / `gen_tileset.py` | 图块集图片（编号 = 本地 tile id；gid = id+1）。左上角白三角用来看翻转方向 |
| `village.tsx` | 外部图块集：含 `terraintypes`（草/土/水）与 `wangsets`（角色 Grass/Dirt、边色 Road） |
| `templates/chest.tx` | XML 模板：图块对象（宝箱，带 tileset 引用和属性） |
| `templates/sign.tj` | JSON 模板：矩形对象（路牌） |
| `rules/rules.txt` + `rules/shadow.tmj` | 自动地图规则：墙下方是空的 → 在 Shadow 层画阴影（rule map 也是用 CLI 搭出来的） |
| `build.sh` | 构建脚本（117 次 CLI 调用） |
| `mcp_demo.py` | MCP stdio 客户端示例（按 MCP 规范逐行 JSON-RPC） |
| `render.py` | 极简 TMJ→PNG 渲染器（支持外部 .tsx、H/V/D 翻转位、无限 chunks、对象） |
| `validate.sh` | 上游 Tiled 真值校验 |
| `out/village.tmj` / `.tmx` / `.zlib.tmx` / `.gzip.tmx` / `.csv` | 最终村庄（TMJ、TMX CSV / base64+zlib / base64+gzip、CSV） |
| `out/cave.tmj` / `cave.tmx` | 无限地图（chunks；TMX 为 base64+gzip） |
| `out/demo.world` | World：村庄 + 洞穴并排 |
| `out/village.tiled-project` | 自定义类型按上游方式存放在项目文件里 |

## 步骤与功能对照

| 步骤 | 做了什么 | 用到的命令 / 参数 |
|---|---|---|
| 0 | 看版本 | `version` |
| 1 | 建 20×14 地图，挂外部 `.tsx` + 一个内嵌 PNG 图块集 | `new`、`tileset add --source`、`tileset add --image`、`tileset list` |
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
| 12 | World：加 3 张图（一张不填尺寸自动读取），删一张 | `world new/add-map/remove-map/info` |
| 13 | MCP：initialize → tools/list → `tiled_version` / `tiled_set_tile`（放一朵翻转的花）/ `tiled_info` / `tiled_wang` | `cli/mcp-server.js` |
| 14 | 文本信息、导出全部格式，TMX→TMJ 回读 | `info --format text`、`export -f tmj|tmx|csv`、`--encoding base64 --compression zlib|gzip` |
| 15 | 渲染预览图 | `render.py` |

**覆盖情况：`--help` 中所有命令、子命令都已用到。** 只读/GUI 专属能力（实时自动地图、Wang 笔刷手感、撤销栈）不在 CLI 范围，仍在 `tool/` 网页里。

## 对照上游 Tiled 发现并修复的问题（0.7.1）

`validate.sh` 的三项检查全部通过：官方 `tmxrasterizer` 能打开全部产物（TMX csv/zlib/gzip 与 TMJ 渲染逐像素一致）；
`tiled --export-map` 解析后的图块/翻转位/对象/属性与 CLI 结果一致；上游 AutoMapper 跑同一套规则得到的 Shadow 层与 CLI **完全一致**。

修复前发现的问题：

1. **属性格式**：CLI 写的是 Tiled ≤1.1 的 `{"k": v}`，但文件头标 1.2；Tiled 1.2+ 规定为 `[{name,type,value}]`。现在统一写数组（旧格式仍可读）。
2. **TMX 导出丢数据**：没有 `<properties>`（地图/图层/对象/图块集）、`nextlayerid/nextobjectid`、对象 `template`、`<image width/height>`、内嵌图块集的地形/Wang。全部补齐，并修正 TMX 读取时对象层“偷”第一个对象属性的问题。
3. **外部图块集引用**：TMJ 里应只有 `{firstgid, source}`；之前多写了 name/tilewidth 等。`--source/--image` 按当前目录给的相对路径现在会自动改写成相对地图文件（Tiled 的约定）。
4. **`--embed`**：.tsx 的图片路径没有改成相对地图，地形/Wang 也丢了 → 已修复（按 Tiled 1.2 JSON：`terrains`、`tiles[].terrain`、`wangsets[].cornercolors/edgecolors/wangtiles`）。
5. **wang list**：读不了官方 JSON 的 `cornercolors/edgecolors`；外部 .tsx 的 `tileCount` 总是 0 → 已修复。
6. **GID 掩码**：用的是 `0x1fffffff`，上游清除 4 个标志位（含六边形 120° `0x10000000`）→ 改为 `0x0fffffff`。
7. **模板路径**：对象的 `template` 只写了文件名，Tiled 会去地图目录找 → 改为相对地图的路径。
8. **坐标换算**：交错地图行高用了 0.75×（上游是 tileheight/2）；六边形 / 交错的 pixel→tile 只是矩形近似。现在逐行移植上游 `HexagonalRenderer` / `StaggeredRenderer`。原测试里的 (80,24)→(2,1) 其实是错的（上游为 (2,0)）。
9. **MCP 帧格式**：无论客户端用什么都用 `Content-Length` 回包；MCP 规范的 stdio 是逐行 JSON。现在按客户端格式回包（默认逐行）。
10. **自定义类型存放位置**：上游存在项目文件 `.tiled-project` 的 `propertyTypes`（带 id）。`prop types …` 现在可以直接操作 `.tiled-project`（地图内的 `propertytypes` 保留为 CLI 扩展，Tiled 会忽略）。
11. 其它：TMJ 根加 `"type": "map"`；正交 TMX 读入不再凭空加 `staggeraxis`；`world add-map` 不填尺寸时从地图读取。

回归测试：`cli/test_phase8.sh`（已接入 `cli/test_smoke.sh`）。

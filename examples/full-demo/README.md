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
| `tiles.png` / `gen_tileset.py` | 图块集图片（原创程序化像素画，随仓库同许可；本地 id 布局见 gen_tileset.py 文件头，gid = id+1） |
| `village.tsx` | 外部图块集：含 `terraintypes`（草/土/水）与 `wangsets`（角色 Grass/Dirt、边色 Road） |
| `templates/chest.tx` | XML 模板：图块对象（宝箱，带 tileset 引用和属性） |
| `templates/sign.tj` | JSON 模板：矩形对象（路牌） |
| `rules/rules.txt` + `rules/shadow.tmj` | 自动地图规则：墙下方是空的 → 在 Shadow 层画阴影（rule map 也是用 CLI 搭出来的） |
| `build.sh` | 构建脚本（142 次 CLI 调用） |
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

`--help` 中的所有命令和子命令都已用到。实时自动地图、Wang 笔刷、撤销等交互功能请在网页版中使用。

## 用官方 Tiled 校验

`validate.sh` 做三项检查：官方 `tmxrasterizer` 能打开全部产物，且 TMX（csv/zlib/gzip）与 TMJ 的渲染逐像素一致；`tiled --export-map` 解析出的图块、翻转位、对象和属性与 CLI 结果一致；官方 AutoMapper 用同一套规则生成的 Shadow 层与 CLI 完全一致。

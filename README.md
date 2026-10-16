# tiled-web

浏览器里跑的 [Tiled](https://www.mapeditor.org/) 地图编辑器（非官方）。目标是在浏览器能实现的范围内，对齐桌面版 **Tiled 1.2.4** 的常用编辑能力。

> **声明：** 本项目与官方 Tiled / mapeditor.org 无关，不包含 Qt 插件宿主。Tiled 名称归其原作者所有。

**分工：** 网页 UI 给人用；终端 CLI 给 agent / 自动化用（见下方）。

## 快速开始（网页）

需要本机已安装 Python 3。

```bash
git clone https://github.com/yujizhuu/tiled-web.git
cd tiled-web
./start.sh
```

浏览器打开 [http://127.0.0.1:8806/](http://127.0.0.1:8806/) 。

macOS 也可双击 `启动.command`（同样会起本地静态服务）。

## CLI（Phase 5 · Agent 用）

无界面时可用命令行创建 / 查看 / 写瓦片 / 印章 / 模板 / 无限地图 chunks / 管图层与对象 / 自定义属性 / 图块集 / 自动地图 / World / 批量替换 GID / 导出地图。需要 **Node.js 18+**。零 npm 依赖。当前覆盖 agent 常用编辑能力（仍非完整编辑器对等；MCP 包装为可选后续）。

### 安装

```bash
cd cli
# 直接跑（无需安装依赖，零 npm 包）
node bin/tiled-web.js version

# 或链到 PATH
npm link
tiled-web version
```

### 命令

| 命令 | 作用 |
|------|------|
| `tiled-web version` | 版本与阶段（0.5.0 / Phase 5） |
| `tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] [--infinite] [--orientation orthogonal\|isometric\|hexagonal] -o map.tmj` | 新建空瓦片层地图（可无限 / 指定朝向） |
| `tiled-web info map.tmj\|map.tmx [--format json\|text]` | 打印尺寸 / 图层 / 图块集（默认 JSON） |
| `tiled-web export map.tmj -f tmj\|tmx\|csv -o out` | 导出；CSV 为第一瓦片层 GID |
| `tiled-web set-tile <map> --x X --y Y --gid GID [--layer name\|index] [--flip-h] [--flip-v] [--flip-d] [-o out]` | 写单个瓦片 GID（可带翻转；无限地图可负坐标） |
| `tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer ...] [--flip-h\|v\|d] [-o out]` | 矩形填充 GID |
| `tiled-web get-layer <map> [--layer name\|index] [--format json\|csv] [-o out]` | 读出单层 GID（无限地图返回 chunk 包围盒） |
| `tiled-web stamp copy <map> --layer --x --y --width --height -o stamp.json` | 复制矩形区域 GID 为印章 |
| `tiled-web stamp paste <map> --layer --x --y --stamp stamp.json [-o out]` | 粘贴印章（有限地图裁剪边界；保留翻转 GID） |
| `tiled-web template info <file.tx\|file.tj\|json>` | 查看对象模板 |
| `tiled-web template apply <map> --layer --template --x --y [--create-layer] [-o out]` | 在对象层放置模板实例（像素坐标） |
| `tiled-web layer list <map>` | 列出图层 |
| `tiled-web layer add <map> [--name NAME] [--type tile\|object] [-o out]` | 追加瓦片层或对象层 |
| `tiled-web layer remove <map> --layer name\|index [-o out]` | 删除图层 |
| `tiled-web layer rename <map> --layer name\|index --name NEW [-o out]` | 重命名图层 |
| `tiled-web tileset add <map> --firstgid N [--name] [--image] [--source PATH.tsx] [--embed] [--tilewidth] [--tileheight] [--columns] [--tilecount] [--imagewidth] [--imageheight] [-o out]` | 添加图块集（可加载外部 `.tsx`；PNG 可读时推导 tilecount） |
| `tiled-web tileset list <map>` | 列出图块集 |
| `tiled-web object list <map> [--layer]` | 列出对象（JSON） |
| `tiled-web object add <map> --layer <objectlayer> --x --y [--name] [--type\|--class] [--width] [--height] [--shape rectangle\|ellipse\|point\|polygon] [--points] [--id] [--create-layer] [-o out]` | 添加对象；`--create-layer` 时自动建对象层 |
| `tiled-web object remove <map> --layer --id\|--name [-o out]` | 删除对象 |
| `tiled-web object update <map> --layer --id ... [-o out]` | 更新位置 / 尺寸 / 名称 / 类型 / 形状 |
| `tiled-web prop list\|get\|set\|remove <map> --target map\|layer\|object\|tileset ...` | 自定义属性；object 用 `--layer` + `--id`（或 `--object-name`），属性键为 `--name` |
| `tiled-web prop types list\|get <map> [--name TypeName]` | 列出/查看地图 `propertytypes`（enum/class 等） |
| `tiled-web automap <map> --rules <rules.txt\|rules.json\|dir\|rule.tmj> [--radius N] [--x X] [--y Y] [-o out]` | 应用 AutoMap；可选半径裁剪扫描区域 |
| `tiled-web world info <file.world>` | 列出世界中的地图与坐标（JSON） |
| `tiled-web world new -o file.world` | 新建空 `.world` |
| `tiled-web world add-map <file.world> --file map.tmj --x X --y Y [--width] [--height]` | 向世界添加/更新地图条目 |
| `tiled-web world remove-map <file.world> --file map.tmj\|--index N` | 从世界移除地图 |
| `tiled-web replace-gid <map> --from GID --to GID [--layer] [--match-flips] [-o out]` | 批量替换瓦片 GID（地形类批处理；支持无限地图） |

错误写 stderr，成功数据写 stdout；失败非零退出码。写操作默认原地保存，可用 `-o` 另存。

### Agent 工作流示例

```bash
cd cli
node bin/tiled-web.js new --width 32 --height 24 --tilewidth 16 --tileheight 16 -o /tmp/level.tmj
node bin/tiled-web.js tileset add /tmp/level.tmj --name terrain --firstgid 1 --tilewidth 16 --tileheight 16 --image terrain.png --columns 8 --tilecount 64
node bin/tiled-web.js layer add /tmp/level.tmj --name Ground
node bin/tiled-web.js fill /tmp/level.tmj --layer Ground --x 0 --y 0 --width 32 --height 24 --gid 1
node bin/tiled-web.js set-tile /tmp/level.tmj --layer Ground --x 4 --y 5 --gid 3 --flip-h
node bin/tiled-web.js object add /tmp/level.tmj --layer Objects --create-layer --name Spawn --type Player --x 64 --y 48 --width 16 --height 16
node bin/tiled-web.js prop set /tmp/level.tmj --target object --layer Objects --id 1 --name hp --value 100 --type int
node bin/tiled-web.js prop set /tmp/level.tmj --target map --name author --value agent
node bin/tiled-web.js object list /tmp/level.tmj
node bin/tiled-web.js get-layer /tmp/level.tmj --layer Ground --format csv -o /tmp/ground.csv
node bin/tiled-web.js info /tmp/level.tmj
node bin/tiled-web.js export /tmp/level.tmj -f tmx -o /tmp/level.tmx

# Phase 4 — automap / world / replace-gid
node bin/tiled-web.js automap fixtures/automap/work.tmj --rules fixtures/automap/rules.txt -o /tmp/auto.tmj
node bin/tiled-web.js automap fixtures/automap/work.tmj --rules fixtures/automap/rules.txt --radius 2 --x 1 --y 1 -o /tmp/auto_clip.tmj
node bin/tiled-web.js replace-gid /tmp/level.tmj --from 1 --to 2 --layer Ground
node bin/tiled-web.js world new -o /tmp/demo.world
node bin/tiled-web.js world add-map /tmp/demo.world --file /tmp/level.tmj --x 0 --y 0 --width 512 --height 384
node bin/tiled-web.js world info /tmp/demo.world

# Phase 5 — stamp / template / infinite
node bin/tiled-web.js stamp copy /tmp/level.tmj --layer Ground --x 0 --y 0 --width 4 --height 4 -o /tmp/stamp.json
node bin/tiled-web.js stamp paste /tmp/level.tmj --layer Ground --x 8 --y 8 --stamp /tmp/stamp.json
node bin/tiled-web.js template info fixtures/templates/chest.tj
node bin/tiled-web.js template apply /tmp/level.tmj --layer Objects --template fixtures/templates/spawn.tx --x 128 --y 64
node bin/tiled-web.js new --width 64 --height 64 --infinite -o /tmp/inf.tmj
node bin/tiled-web.js set-tile /tmp/inf.tmj --x 100 --y -5 --gid 1
node bin/tiled-web.js prop types list /tmp/level.tmj
```

自检：

```bash
cd cli && ./test_smoke.sh
```

### CLI 路线图

- **Phase 1：** `new` / `info` / `export`（TMJ · 最小 TMX · CSV）✅
- **Phase 2：** 图层与瓦片写入（`set-tile`、`fill`、`get-layer`、`layer *`、`tileset add|list`）✅
- **Phase 3：** 对象层、属性、更完整的图块集引用（`.tsx` / PNG 尺寸 / GID 翻转）✅
- **Phase 4：** `automap`（规则子集）、`world *`、`replace-gid` ✅
- **Phase 5（当前）：** `stamp copy|paste`、`template info|apply`、无限地图 chunks、`automap --radius`、`prop types`；MCP 包装仍为可选后续 ✅

#### Automap CLI 子集（相对网页）

已实现：`rules.txt` / `rules.json` / 目录 / 单规则图；`Regions` + `Input_*` / `InputNot_*` / `Output_*` 瓦片层；`DeleteTiles` / `MatchOutsideMap` / `StrictEmpty`；对象层 `Output_*` 克隆；`--radius N --x/--y` 扫描裁剪（规则图 `AutomappingRadius` 在给了中心点时也会参与）。

#### Phase 5 之后仍弱 / 未做（诚实清单）

- 实时绘制自动地图、规则可视化编辑器
- Wang / 地形笔刷交互对等（CLI 仅有 `replace-gid` 等批处理）
- 撤销栈 / 历史
- MCP 包装
- 像素坐标 ↔ hex/iso 瓦片坐标换算（`--x/--y` 仍是瓦片索引；`new --orientation` 只写元数据）
- 模板图块集 `firstgid` 自动并入地图、模板目录批量索引
- `propertytypes` 仅 list/get（不写继承展开到对象默认属性）
- TMX 无限 chunks / 压缩编码仍有限

## 功能概览（相对 Tiled 1.2.4 · 网页）

在「不依赖 Qt 插件」的前提下，已具备可用对等：

- 地图读写：TMJ / TMX / CSV；Base64 ± zlib/gzip；嵌入图块集；无限地图 chunks
- 瓦片 / 对象编辑、撤销、印章变换、图层组
- 自动地图（StrictEmpty、实时、规则浏览与可视化编辑）
- 地形 / Wang（概率、翻转变体、正交与 isometric 邻域等）
- 碰撞编辑、类型化属性、对象类型与 `propertytypes`
- World（`.world`、多地图、共享相机）与对象模板（`.tx` / JSON）
- 首选项（localStorage）、中文 UI

### 永久限制（浏览器不会实现）

- 无 Qt 插件宿主 / 无桌面脚本引擎
- 无原生文件系统监视与桌面级原子安全保存
- 无 OpenGL 地图视图与完整多文档 MDI

### 仍弱于桌面

- World / 模板依赖用户授权的目录句柄或一次多选
- 超大 Wang / World 同时绘制可能卡顿
- 无 zstd（属更新版本格式）

## 目录结构

```
tiled-web/
├── start.sh          # 跨平台启动（推荐）
├── 启动.command       # macOS 双击启动
├── open_url.inc.sh   # 启动脚本辅助
├── LICENSE           # AGPL-3.0
├── NOTICE
├── README.md
├── cli/              # Node CLI（Phase 5）
│   ├── bin/tiled-web.js
│   ├── lib/            # create/load/layers/objects/props/automap/world/…
│   ├── fixtures/automap/
│   ├── fixtures/templates/
│   ├── package.json
│   ├── test_smoke.sh
│   ├── test_phase4.sh
│   └── test_phase5.sh
└── tool/             # 静态站点根目录（http.server 从这个目录起）
    ├── index.html
    ├── tiled.css
    ├── tiled.js
    ├── tiled-features.js
    ├── tiled-parity.js
    ├── tiled-batch3.js … tiled-batch7.js
    ├── pako.min.js   # zlib 解压（第三方）
    └── test_smoke.py
```

脚本加载顺序：`pako.min.js` → `tiled.js` → `tiled-features.js` → `tiled-parity.js` → `tiled-batch3.js` … → `tiled-batch7.js`

## 自检

```bash
cd tool && python3 test_smoke.py
cd cli && ./test_smoke.sh
```

## 许可证

本仓库代码以 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）发布。

含义简述：你可以自由使用、修改；若你对外提供基于本项目的网络服务或再分发改版，一般需要按 AGPL 提供对应源代码。

`tool/pako.min.js` 为第三方库，请遵循其原许可证（MIT/Zlib）。

官方 Tiled 桌面版请从 [mapeditor.org](https://www.mapeditor.org/) 或 [GitHub Releases](https://github.com/mapeditor/tiled/releases) 获取。本项目与官方无关。

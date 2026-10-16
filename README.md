# tiled-web

浏览器里跑的 [Tiled](https://www.mapeditor.org/) 地图编辑器（非官方）。目标是在浏览器能实现的范围内，对齐桌面版 **Tiled 1.2.4** 的常用编辑能力。

> **声明：** 本项目与官方 Tiled / mapeditor.org 无关，不包含 Qt 插件宿主。Tiled 名称归其原作者所有。

**分工：** 网页 UI 给人用；终端 CLI 给 agent / 自动化用（见下方）。

### 打开文件夹（0.8，像桌面版一样自动关联）
- 顶栏「打开文件夹」：选项目根目录（含 `../` 引用的上级），地图引用的 `.tsx`、图片、模板 `.tx/.tj`、`.world` 按相对路径自动解析；Ctrl/⌘+S 直接写回原文件。
- 「最近 ▾」：记住已授权文件夹（IndexedDB），下次点一下重新授权即可。
- 可直接把文件夹拖进画布。单独「打开」一个地图缺图块集时，会提示「授权文件夹并重试」。
- Chrome / Edge / Opera：完整支持（读写、记住文件夹）。Safari / Firefox：用文件夹选择回退，只读，保存走下载。

## 快速开始（网页）

需要本机已安装 Python 3。

```bash
git clone https://github.com/yujizhuu/tiled-web.git
cd tiled-web
./start.sh
```

浏览器打开 [http://127.0.0.1:8806/](http://127.0.0.1:8806/) 。

macOS 也可双击 `启动.command`（同样会起本地静态服务）。

## CLI（Phase 7 · Agent 目标已达成）

**Agent CLI 目标已达成（0.7.1，已对照上游 Tiled 修正格式；全功能示例见 `examples/full-demo/`）。** 无界面时可创建 / 查看 / 写瓦片 / 印章 / 模板（含目录索引）/ 无限地图 chunks / 管图层与对象 / 自定义属性与 `propertytypes`（`useAs` + 嵌套 class 展开）/ 图块集 / 自动地图 / World / 批量替换 GID / 坐标换算 / Wang·地形列举 / 导出 TMJ·TMX·CSV（TMX 支持无限 chunks 与 base64+zlib）。另提供 **零依赖 MCP stdio 包装**（`cli/mcp-server.js`）。需要 **Node.js 18+**。零 npm 依赖。

剩余未做能力均为 **GUI 专属**（实时自动地图、规则可视化编辑、Wang/地形笔刷、撤销栈等），见 [`tool/`](tool/)。

### 安装

```bash
cd cli
# 直接跑（无需安装依赖，零 npm 包）
node bin/tiled-web.js version

# 或链到 PATH
npm link
tiled-web version
```

### MCP（Cursor / Claude）

```bash
node cli/mcp-server.js   # stdio JSON-RPC，Content-Length 帧
```

在 Cursor `~/.cursor/mcp.json`（或 Claude Desktop 配置）注册：

```json
{
  "mcpServers": {
    "tiled-web": {
      "command": "node",
      "args": ["/ABS/PATH/to/tiled-web/cli/mcp-server.js"]
    }
  }
}
```

暴露的 tools 与 CLI 对齐：`tiled_version`、`tiled_info`、`tiled_new`、`tiled_set_tile`、`tiled_fill`、`tiled_get_layer`、`tiled_layer`、`tiled_object`、`tiled_prop`、`tiled_stamp`、`tiled_template`（含 index）、`tiled_automap`、`tiled_world`、`tiled_replace_gid`、`tiled_export`（TMX encoding/compression）、`tiled_coord`、`tiled_wang`、`tiled_terrain`。

### 命令

| 命令 | 作用 |
|------|------|
| `tiled-web version` | 版本与阶段（0.7.1 / Phase 7 · agent 目标达成） |
| `tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] [--infinite] [--orientation orthogonal\|isometric\|hexagonal\|staggered] [--staggeraxis y\|x] [--staggerindex odd\|even] [--hexsidelength N] -o map.tmj` | 新建空瓦片层地图 |
| `tiled-web info map.tmj\|map.tmx [--format json\|text]` | 打印尺寸 / 图层 / 图块集（默认 JSON） |
| `tiled-web export map.tmj -f tmj\|tmx\|csv -o out [--encoding csv\|base64] [--compression zlib\|gzip]` | 导出；CSV 为第一瓦片层 GID；无限地图 TMJ/TMX 保留 chunks；TMX 可选 base64+zlib（无 zstd） |
| `tiled-web set-tile <map> --x X --y Y --gid GID [--layer name\|index] [--flip-h] [--flip-v] [--flip-d] [-o out]` | 写单个瓦片 GID（可带翻转；无限地图可负坐标） |
| `tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer ...] [--flip-h\|v\|d] [-o out]` | 矩形填充 GID |
| `tiled-web get-layer <map> [--layer name\|index] [--format json\|csv] [-o out]` | 读出单层 GID（无限地图返回 chunk 包围盒） |
| `tiled-web stamp copy <map> --layer --x --y --width --height -o stamp.json` | 复制矩形区域 GID 为印章 |
| `tiled-web stamp paste <map> --layer --x --y --stamp stamp.json [-o out]` | 粘贴印章（有限地图裁剪边界；保留翻转 GID） |
| `tiled-web template info <file.tx\|file.tj\|json>` | 查看对象模板 |
| `tiled-web template index <dir> [--no-recursive]` | 扫描目录下 `.tx`/`.tj`/JSON 模板，输出 JSON 列表（path/name/type/size） |
| `tiled-web template apply <map> --layer --template --x --y [--create-layer] [-o out]` | 放置模板实例；**自动并入缺失图块集**（安全 next firstgid + GID 重映射） |
| `tiled-web layer list\|add\|remove\|rename …` | 图层管理 |
| `tiled-web tileset add\|list …` | 图块集 |
| `tiled-web object list\|add\|remove\|update …` | 对象层 |
| `tiled-web prop list\|get\|set\|remove …` | 自定义属性 |
| `tiled-web prop types list\|get\|add\|remove …` | 地图 `propertytypes`（enum/class；`--use-as`；get 展开嵌套 class `membersExpanded`） |
| `tiled-web coord tile-to-pixel\|pixel-to-tile [<map>] --x --y [--orientation …] [--tilewidth …] …` | 像素 ↔ 瓦片（正交 / 等距 / 六角 / staggered） |
| `tiled-web wang list <map>` | 列举图块集 wangsets（只读数据） |
| `tiled-web terrain list <map>` | 列举图块集 terraintypes（只读数据） |
| `tiled-web automap <map> --rules … [--radius N] [--x] [--y] [-o out]` | 应用 AutoMap |
| `tiled-web world info\|new\|add-map\|remove-map …` | `.world` |
| `tiled-web replace-gid <map> --from GID --to GID …` | 批量替换 GID |

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
node bin/tiled-web.js prop types add /tmp/level.tmj --name Team --type enum --values red,blue
node bin/tiled-web.js coord tile-to-pixel /tmp/level.tmj --x 4 --y 5
node bin/tiled-web.js template apply /tmp/level.tmj --layer Objects --template fixtures/templates/crate.tj --x 128 --y 64
node bin/tiled-web.js wang list /tmp/level.tmj
node bin/tiled-web.js info /tmp/level.tmj
node bin/tiled-web.js export /tmp/level.tmj -f tmx -o /tmp/level.tmx

# Phase 4 — automap / world / replace-gid
node bin/tiled-web.js automap fixtures/automap/work.tmj --rules fixtures/automap/rules.txt -o /tmp/auto.tmj
node bin/tiled-web.js world new -o /tmp/demo.world
node bin/tiled-web.js world add-map /tmp/demo.world --file /tmp/level.tmj --x 0 --y 0 --width 512 --height 384

# Phase 5 — stamp / template / infinite
node bin/tiled-web.js stamp copy /tmp/level.tmj --layer Ground --x 0 --y 0 --width 4 --height 4 -o /tmp/stamp.json
node bin/tiled-web.js stamp paste /tmp/level.tmj --layer Ground --x 8 --y 8 --stamp /tmp/stamp.json
node bin/tiled-web.js new --width 64 --height 64 --infinite -o /tmp/inf.tmj
node bin/tiled-web.js set-tile /tmp/inf.tmj --x 100 --y -5 --gid 1
node bin/tiled-web.js export /tmp/inf.tmj -f tmj -o /tmp/inf_out.tmj

# Phase 7 — template index / prop types expand / TMX infinite+zlib
node bin/tiled-web.js template index fixtures/templates
node bin/tiled-web.js prop types add /tmp/level.tmj --name Stats --type class --members '[{"name":"hp","type":"int","value":10}]' --use-as property,object
node bin/tiled-web.js export /tmp/inf.tmj -f tmx -o /tmp/inf.tmx
node bin/tiled-web.js export /tmp/level.tmj -f tmx --encoding base64 --compression zlib -o /tmp/level_z.tmx
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
- **Phase 5：** `stamp copy|paste`、`template info|apply`、无限地图 chunks、`automap --radius`、`prop types` list/get ✅
- **Phase 6：** MCP stdio 包装、`coord` 像素↔瓦片、`prop types add|remove`、模板图块集自动并入、`wang list` / `terrain list`、无限 TMJ 导出确认 ✅
- **Phase 7（当前 · agent 目标达成）：** `template index`、`prop types` `useAs` + 嵌套 class `membersExpanded`、TMX 无限 `<chunk>` + base64 zlib/gzip（Node zlib；无 zstd）✅

#### Automap CLI 子集（相对网页）

已实现：`rules.txt` / `rules.json` / 目录 / 单规则图；`Regions` + `Input_*` / `InputNot_*` / `Output_*` 瓦片层；`DeleteTiles` / `MatchOutsideMap` / `StrictEmpty`；对象层 `Output_*` 克隆；`--radius N --x/--y` 扫描裁剪（规则图 `AutomappingRadius` 在给了中心点时也会参与）。

#### 仍为 GUI 专属（诚实清单 · CLI 不再追）

Agent 侧数据读写与批处理已齐；下列留在网页 [`tool/`](tool/)：

- 实时绘制自动地图、规则可视化编辑器
- Wang / 地形**笔刷交互**（CLI 已有 `wang list` / `terrain list` / `replace-gid`；无笔刷）
- 撤销栈 / 历史
- 图块→对象实例属性默认值的 GUI 灰色继承面板（CLI `prop types get` 已展开嵌套 class 成员默认值；不自动写入对象实例）
- TMX `zstd`（CLI 支持 CSV / base64 ± zlib|gzip；无限地图 TMJ 仍最稳）

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
├── cli/              # Node CLI + MCP（Phase 7 · agent 目标达成）
│   ├── bin/tiled-web.js
│   ├── mcp-server.js   # 零依赖 MCP stdio
│   ├── lib/            # create/load/coord/wang/layers/objects/props/…
│   ├── fixtures/automap/
│   ├── fixtures/templates/
│   ├── fixtures/wang/
│   ├── package.json
│   ├── test_smoke.sh
│   ├── test_phase4.sh … test_phase7.sh
│   └── test_mcp_stdio.py
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

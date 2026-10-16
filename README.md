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

## CLI（Phase 2 · Agent 用）

无界面时可用命令行创建 / 查看 / 写瓦片 / 管图层与图块集 / 导出地图。需要 **Node.js 18+**。零 npm 依赖。当前覆盖建图、图层与瓦片写入、图块集引用与格式转换（仍非完整编辑器对等）。

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
| `tiled-web version` | 版本与阶段（0.2.0 / Phase 2） |
| `tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] -o map.tmj` | 新建正交空瓦片层地图 |
| `tiled-web info map.tmj\|map.tmx [--format json\|text]` | 打印尺寸 / 图层 / 图块集（默认 JSON） |
| `tiled-web export map.tmj -f tmj\|tmx\|csv -o out` | 导出；CSV 为第一瓦片层 GID |
| `tiled-web set-tile <map> --x X --y Y --gid GID [--layer name\|index] [-o out]` | 写单个瓦片 GID（默认第一瓦片层；无 `-o` 则原地写） |
| `tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer name\|index] [-o out]` | 矩形填充 GID |
| `tiled-web get-layer <map> [--layer name\|index] [--format json\|csv] [-o out]` | 读出单层全部 GID |
| `tiled-web layer list <map>` | 列出图层 |
| `tiled-web layer add <map> [--name NAME] [-o out]` | 追加空瓦片层 |
| `tiled-web layer remove <map> --layer name\|index [-o out]` | 删除图层 |
| `tiled-web layer rename <map> --layer name\|index --name NEW [-o out]` | 重命名图层 |
| `tiled-web tileset add <map> --firstgid N [--name NAME] [--image PATH] [--source PATH.tsx] [--tilewidth TW] [--tileheight TH] [--columns C] [--tilecount N] [-o out]` | 添加图块集引用 |
| `tiled-web tileset list <map>` | 列出图块集 |

错误写 stderr，成功数据写 stdout；失败非零退出码。写操作默认原地保存，可用 `-o` 另存。

### Agent 工作流示例

```bash
cd cli
node bin/tiled-web.js new --width 32 --height 24 --tilewidth 16 --tileheight 16 -o /tmp/level.tmj
node bin/tiled-web.js tileset add /tmp/level.tmj --name terrain --firstgid 1 --tilewidth 16 --tileheight 16 --image terrain.png --columns 8 --tilecount 64
node bin/tiled-web.js layer add /tmp/level.tmj --name Ground
node bin/tiled-web.js fill /tmp/level.tmj --layer Ground --x 0 --y 0 --width 32 --height 24 --gid 1
node bin/tiled-web.js set-tile /tmp/level.tmj --layer Ground --x 4 --y 5 --gid 3
node bin/tiled-web.js get-layer /tmp/level.tmj --layer Ground --format csv -o /tmp/ground.csv
node bin/tiled-web.js info /tmp/level.tmj
node bin/tiled-web.js export /tmp/level.tmj -f tmx -o /tmp/level.tmx
```

自检：

```bash
cd cli && ./test_smoke.sh
```

### CLI 路线图

- **Phase 1：** `new` / `info` / `export`（TMJ · 最小 TMX · CSV）✅
- **Phase 2（当前）：** 图层与瓦片写入（`set-tile`、`fill`、`get-layer`、`layer *`、`tileset add|list`）✅
- **Phase 3：** 对象层、属性、更完整的图块集引用
- **Phase 4：** 自动地图 / 地形批处理；可选 MCP 包装

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
├── cli/              # Node CLI（Phase 2）
│   ├── bin/tiled-web.js
│   ├── lib/
│   ├── package.json
│   └── test_smoke.sh
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

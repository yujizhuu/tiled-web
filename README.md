# tiled-web

浏览器里跑的 [Tiled](https://www.mapeditor.org/) 地图编辑器（非官方）。目标是在浏览器能实现的范围内，对齐桌面版 **Tiled 1.2.4** 的常用编辑能力。

> **声明：** 本项目与官方 Tiled / mapeditor.org 无关，不包含 Qt 插件宿主。Tiled 名称归其原作者所有。

## 快速开始

需要本机已安装 Python 3。

```bash
git clone https://github.com/yujizhuu/tiled-web.git
cd tiled-web
./start.sh
```

浏览器打开 [http://127.0.0.1:8806/](http://127.0.0.1:8806/) 。

macOS 也可双击 `启动.command`（同样会起本地静态服务）。

## 功能概览（相对 Tiled 1.2.4）

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
├── LICENSE           # MIT
├── README.md
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
```

## 许可证

本仓库代码以 [MIT](LICENSE) 发布。`tool/pako.min.js` 为第三方库，请遵循其原许可证。

官方 Tiled 桌面版请从 [mapeditor.org](https://www.mapeditor.org/) 或 [GitHub Releases](https://github.com/mapeditor/tiled/releases) 获取。

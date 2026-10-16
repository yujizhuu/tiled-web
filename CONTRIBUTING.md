# 参与贡献 / Contributing

感谢你愿意参与 tiled-web！English version below.

## 中文

### 运行网页版

网页版是纯静态站点，没有构建步骤，根目录是 `tool/`。

```bash
./start.sh                      # 或：cd tool && python3 -m http.server 8806
# 浏览器打开 http://127.0.0.1:8806
```

「打开文件夹」和直接保存需要 Chrome / Edge（File System Access API）。

### 运行 CLI 与 MCP

需要 Node.js 18+，零 npm 依赖。

```bash
node cli/bin/tiled-web.js --help
node cli/bin/tiled-web.js new --width 20 --height 15 --tilewidth 16 --tileheight 16 -o /tmp/a.tmj
node cli/mcp-server.js          # MCP stdio 服务器（每行一条 JSON 消息）
```

### 运行全部测试

```bash
# CLI（需要 python3；Pillow 可选）
for t in cli/test_*.sh; do bash "$t"; done
python3 cli/test_mcp_stdio.py

# 网页版静态检查
cd tool && python3 test_smoke.py && cd ..

# 无头浏览器测试：puppeteer-core 不入库，装到仓库外
mkdir -p /tmp/pptr && (cd /tmp/pptr && npm init -y >/dev/null && npm i puppeteer-core@23)
export NODE_PATH=/tmp/pptr/node_modules
export CHROME=/usr/bin/google-chrome   # macOS: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for t in tool/test_*.js; do node "$t"; done   # SHOTS=1 时保存截图
```

CI（`.github/workflows/ci.yml`）会在每个 push 和 PR 上跑以上全部测试。

### 代码结构

| 路径 | 内容 |
|---|---|
| `tool/index.html`, `tool/tiled.css` | 网页版入口与样式 |
| `tool/tiled.js` | 核心：地图模型、读写 TMJ/TMX、渲染、编辑 |
| `tool/tiled-*.js` | 按功能拆分的模块（topbar、folder、help、guide、modal、tileset-popup、parity、batch3–7 等） |
| `tool/test_*.js`, `tool/test_smoke.py` | 浏览器测试与静态检查 |
| `cli/bin/tiled-web.js` | CLI 入口 |
| `cli/lib/` | CLI 共享库（格式、图层、对象、自动地图、世界……） |
| `cli/mcp-server.js` | MCP 服务器 |
| `cli/fixtures/`, `cli/test_*.sh` | 测试数据与 CLI 测试 |
| `examples/full-demo/` | 用 CLI 生成的完整示例与官方 Tiled 对照脚本 |

### 代码风格

- 原生 JavaScript，无框架、无构建、**不新增运行时依赖**（`pako.min.js` 除外）。
- CLI 用 CommonJS，Node 18+；网页版用普通 `<script>`。
- 2 空格缩进、分号、单引号，跟随所在文件的现有写法。
- 格式与行为以官方 Tiled 为准，必要时在注释里注明对应的上游源码文件。
- 用户可见文字目前为中文；新增文字请集中放置，方便以后做 i18n。

### 提交与 PR 流程

1. Fork 后从 `main` 新建分支，如 `feat/anim-editor`、`fix/tmx-export`。
2. 小步提交，提交信息说清改了什么（中英文均可）。
3. 新功能或修 bug 请补测试；改 UI 请附截图。
4. 本地跑通全部测试后提 PR，按模板填写；CI 通过后由维护者审阅合并。
5. 大改动请先开 issue 或 Discussion 讨论方案。

想找入手点？看看标了 [`good first issue`](https://github.com/yujizhuu/tiled-web/labels/good%20first%20issue) 和 [`help wanted`](https://github.com/yujizhuu/tiled-web/labels/help%20wanted) 的 issue。

### 许可证

本项目以 **AGPL-3.0-or-later** 发布。提交 PR 即表示你同意以相同许可证授权你的贡献。请勿复制许可证不兼容的代码或素材；引入第三方内容时请在 `NOTICE` 中注明来源与许可证。

### 对照官方 Tiled 验证

涉及文件格式、渲染或自动地图的改动，请用官方 Tiled 校验：

```bash
sudo apt install tiled xvfb python3-pil   # 提供 tiled、tmxrasterizer
cd examples/full-demo
./build.sh       # 用 CLI 重新生成 out/
./validate.sh    # tmxrasterizer 渲染对比、tiled --export-map 往返、自动地图对照
```

`validate.sh` 会输出与官方结果的逐像素比对；未安装 Tiled 时自动跳过。

### 行为准则

参与本项目即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。

---

## English

### Run the web UI

The web UI is a static site with no build step; its root is `tool/`.

```bash
./start.sh                      # or: cd tool && python3 -m http.server 8806
# open http://127.0.0.1:8806
```

"Open folder" and in-place saving need Chrome / Edge (File System Access API).

### Run the CLI and MCP server

Node.js 18+, zero npm dependencies.

```bash
node cli/bin/tiled-web.js --help
node cli/mcp-server.js          # MCP over stdio, one JSON message per line
```

### Run all tests

```bash
for t in cli/test_*.sh; do bash "$t"; done
python3 cli/test_mcp_stdio.py
(cd tool && python3 test_smoke.py)

# headless browser tests; puppeteer-core is installed outside the repo
mkdir -p /tmp/pptr && (cd /tmp/pptr && npm init -y >/dev/null && npm i puppeteer-core@23)
export NODE_PATH=/tmp/pptr/node_modules CHROME=/usr/bin/google-chrome
for t in tool/test_*.js; do node "$t"; done
```

CI runs all of the above on every push and pull request.

### Code layout

- `tool/`: web UI. `tiled.js` is the core (map model, TMJ/TMX I/O, rendering, editing); `tiled-*.js` are feature modules; `test_*` are tests.
- `cli/`: `bin/tiled-web.js` is the CLI entry, `lib/` the shared library, `mcp-server.js` the MCP server, `test_*.sh` the tests.
- `examples/full-demo/`: a complete example built with the CLI, plus scripts that check it against official Tiled.

### Code style

Vanilla JavaScript, no framework, no build step, **no new runtime dependencies**. Use 2-space indent, semicolons and single quotes, and follow the surrounding code. Official Tiled is the reference for formats and behaviour; cite the upstream source file in a comment when porting logic. UI strings are currently Chinese; keep new strings easy to extract for future i18n.

### Commits and pull requests

1. Fork the repo and branch off `main` (`feat/...`, `fix/...`).
2. Make small commits with clear messages (Chinese or English).
3. Add tests for features and fixes; attach screenshots for UI changes.
4. Open a PR using the template; a maintainer reviews it once CI is green.
5. For larger changes, open an issue or discussion first.

Looking for a place to start? Check [`good first issue`](https://github.com/yujizhuu/tiled-web/labels/good%20first%20issue) and [`help wanted`](https://github.com/yujizhuu/tiled-web/labels/help%20wanted).

### License

The project is licensed under **AGPL-3.0-or-later**, and by submitting a pull request you agree to license your contribution the same way. Don't copy code or assets under incompatible licenses, and record third-party sources in `NOTICE`.

### Verify against official Tiled

```bash
sudo apt install tiled xvfb python3-pil
cd examples/full-demo && ./build.sh && ./validate.sh
```

### Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

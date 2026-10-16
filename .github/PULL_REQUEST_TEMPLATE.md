## 改了什么 / What

<!-- 简述改动与动机，关联 issue：Closes #123 / Summary and motivation, link issues -->

## 怎么验证的 / How tested

- [ ] `for t in cli/test_*.sh; do bash "$t"; done`
- [ ] `python3 cli/test_mcp_stdio.py`
- [ ] `cd tool && python3 test_smoke.py`
- [ ] 浏览器测试 / browser tests `node tool/test_*.js`（涉及网页版时 / if UI changed）
- [ ] 对照官方 Tiled / checked against official Tiled（涉及格式时 / if formats changed）

## 截图 / Screenshots

<!-- UI 改动请附前后对比 / Before/after for UI changes -->

## 确认 / Checklist

- [ ] 我同意以 AGPL-3.0-or-later 授权此贡献 / I license this contribution under AGPL-3.0-or-later
- [ ] 无新增运行时依赖 / No new runtime dependencies

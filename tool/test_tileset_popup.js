#!/usr/bin/env node
// 图块集大窗预览测试：能打开、选瓦片同步画笔、缩放、800/1440 无溢出。
// NODE_PATH=/path/to/node_modules node tool/test_tileset_popup.js（SHOTS=1 存截图）
const path = require('path');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
const demo = path.join(__dirname, '..', 'examples', 'full-demo');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await br.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const w of [1440, 800]) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.topbar[data-layout="menubar"]'); await sleep(200);
    const inp = await page.$('#tilesetInput');
    await inp.uploadFile(path.join(demo, 'village.tsx'), path.join(demo, 'tiles.png'));
    await page.waitForFunction(() => window.TiledApp.getState().tileset && window.TiledApp.getImageCache().get(window.TiledApp.getState().tileset.url), { timeout: 5000 });
    await sleep(200);
    // 入口一：⤢ 按钮
    check(!!(await page.$('[data-action="tileset-popup"]')), `${w}px 图块集面板有 ⤢ 按钮`);
    await page.click('[data-action="tileset-popup"]'); await sleep(250);
    const st = await page.evaluate(() => { const p = document.querySelector('#tilesetPopup'); const r = p.getBoundingClientRect(); return { open: !p.classList.contains('hidden'), l: r.left, t: r.top, r: r.right, b: r.bottom }; });
    check(st.open, `${w}px 弹窗已打开`);
    check(st.l >= 0 && st.t >= 0 && st.r <= w && st.b <= 900, `${w}px 弹窗在视口内`);
    // 缩放
    const z0 = await page.evaluate(() => window.TiledApp.tilesetPopup.view.zoom);
    await page.click('#tilesetPopup [data-tsp="in"]'); await sleep(50);
    const z1 = await page.evaluate(() => window.TiledApp.tilesetPopup.view.zoom);
    check(z1 > z0, `${w}px ＋ 放大 (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
    const cb = await (await page.$('#tilesetPopup canvas')).boundingBox();
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.mouse.wheel({ deltaY: 300 }); await sleep(80);
    const z2 = await page.evaluate(() => window.TiledApp.tilesetPopup.view.zoom);
    check(z2 < z1, `${w}px 滚轮缩小 (${z1.toFixed(2)} → ${z2.toFixed(2)})`);
    await page.click('#tilesetPopup [data-tsp="100"]'); await sleep(50);
    check(await page.evaluate(() => window.TiledApp.tilesetPopup.view.zoom) === 1, `${w}px 100% 生效`);
    await page.click('#tilesetPopup [data-tsp="fit"]'); await sleep(50);
    // 选瓦片：拖选第 2 行第 3 列到第 3 行第 4 列
    const v = await page.evaluate(() => { const a = window.TiledApp, s = a.tilesetPopup.view, t = a.getState().tileset; return { ox: s.ox, oy: s.oy, z: s.zoom, tw: t.tileWidth, th: t.tileHeight }; });
    const at = (c, r) => [cb.x + v.ox + (c + 0.5) * v.tw * v.z, cb.y + v.oy + (r + 0.5) * v.th * v.z];
    const [x1, y1] = at(2, 1), [x2, y2] = at(3, 2);
    await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 4 }); await page.mouse.up(); await sleep(120);
    const sel = await page.evaluate(() => { const s = window.TiledApp.getState(); return { ...s.tileSelection, tile: s.tile, panel: document.querySelectorAll('.tileset-grid .tile-cell.active').length }; });
    check(sel.x === 2 && sel.y === 1 && sel.w === 2 && sel.h === 2 && sel.tile === 10, `${w}px 拖选成为画笔 ${JSON.stringify(sel)}`);
    check(sel.panel === 4, `${w}px 侧栏同步高亮 4 块`);
    await page.mouse.move(...at(5, 0)); await sleep(80);
    check(await page.evaluate(() => { const t = document.querySelector('.tsp-tip'); return !t.hidden && /图块 5/.test(t.textContent); }), `${w}px 悬停提示显示图块 ID`);
    // 用画笔在画布上画：弹窗保持打开
    await page.evaluate(() => document.querySelector('[data-tool="pencil"]').click());
    const ok = await page.evaluate(() => { try { const a = window.TiledApp; a.paintAt(0, 0); return a.tileAt(a.activeLayer(), 0, 0, a.getState().map); } catch (e) { return 'ERR ' + e.message; } });
    check(ok === 11, `${w}px 画笔可直接绘制（gid=${ok}）`);
    check(await page.evaluate(() => window.TiledApp.tilesetPopup.isOpen()), `${w}px 绘制时保持打开`);
    const ov = await page.evaluate(() => ({ d: document.documentElement.scrollWidth > document.documentElement.clientWidth, b: document.body.scrollWidth > document.body.clientWidth }));
    check(!ov.d && !ov.b, `${w}px 无横向溢出`);
    if (process.env.SHOTS && w === 1440) await page.screenshot({ path: '/workspace/tileset-popup.png', captureBeyondViewport: false });
    // 拖出视口后仍被限制在视口内
    const hb = await (await page.$('#tilesetPopup .tsp-head')).boundingBox();
    await page.mouse.move(hb.x + 40, hb.y + 10); await page.mouse.down(); await page.mouse.move(w + 400, 1400, { steps: 5 }); await page.mouse.up();
    const r2 = await page.evaluate(() => { const r = document.querySelector('#tilesetPopup').getBoundingClientRect(); return { r: r.right, b: r.bottom }; });
    check(r2.r <= w && r2.b <= 900, `${w}px 拖动后仍在视口内`);
    await page.keyboard.press('Escape'); await sleep(50);
    check(!(await page.evaluate(() => window.TiledApp.tilesetPopup.isOpen())), `${w}px Esc 关闭`);
    // 入口二：双击；入口三：视图菜单
    await page.evaluate(() => document.querySelector('.tileset-grid').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    check(await page.evaluate(() => window.TiledApp.tilesetPopup.isOpen()), `${w}px 双击图块集打开`);
    await page.keyboard.press('Escape');
    check(await page.evaluate(() => [...document.querySelectorAll('.tb-proxy')].some((b) => /图块集大窗预览/.test(b.textContent))), `${w}px 视图菜单有入口`);
    check(await page.evaluate(() => (window.TiledHelp.sections || []).some((s) => s.id === 'tileset-popup')), `${w}px 帮助章节存在`);
  }
  check(errs.length === 0, '无脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

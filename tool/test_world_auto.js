#!/usr/bin/env node
// 世界自动化测试：用文件夹打开 out/village.tmj 自动显示相邻地图；双击 forest 切换；patterns 世界；打开 .world；无溢出。
// NODE_PATH=/path/to/node_modules node tool/test_world_auto.js（SHOTS=1 存截图）
const path = require('path'), fsn = require('fs');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
const demo = path.join(__dirname, '..', 'examples', 'full-demo');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 收集示例文件夹（不含 validate / regions 等大目录之外的全部顶层与 out/、templates/、rules/）
const rels = [];
(function walk(d, pre) { for (const n of fsn.readdirSync(d)) { const p = path.join(d, n); const st = fsn.statSync(p); if (st.isDirectory()) { if (!['validate'].includes(n)) walk(p, pre + n + '/'); } else if (/\.(tmj|tmx|tsx|tsj|tx|tj|world|png|json|txt)$/i.test(n)) rels.push(pre + n); } })(demo, '');
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const w of [1440, 800]) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.TiledApp && window.TiledApp.worldAuto && window.TiledApp.folder && document.querySelector('[data-world-show]'), { timeout: 6000 });
    await page.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'tFiles'; i.style.display = 'none'; document.body.appendChild(i); });
    await (await page.$('#tFiles')).uploadFile(...rels.map((r) => path.join(demo, r)));
    // 构造只读文件夹（相对路径 → File），另加一个 patterns 世界 pat/
    await page.evaluate(async (rels) => {
      const files = [...document.querySelector('#tFiles').files];
      const pairs = rels.map((r, i) => [r, files[i]]);
      const get = (r) => pairs.find((p) => p[0] === r)[1];
      const v = await get('out/village.tmj').text(), f = await get('out/forest.tmj').text();
      pairs.push(['pat/map_0_0.tmj', new File([v], 'map_0_0.tmj')], ['pat/map_1_0.tmj', new File([f], 'map_1_0.tmj')], ['pat/notes_9_9.txt', new File(['x'], 'notes_9_9.txt')]);
      pairs.push(['pat/grid.world', new File([JSON.stringify({ type: 'world', maps: [], patterns: [{ regexp: 'map_(\\d+)_(\\d+)\\.tmj', multiplierX: 320, multiplierY: 224 }] })], 'grid.world')]);
      window.__tfs = window.TiledApp.folder.listFS('full-demo', pairs);
    }, rels);
    // 1) 用文件夹打开 out/village.tmj
    await page.evaluate(() => window.TiledApp.folder.openFromFS(window.__tfs, 'out/village.tmj'));
    await sleep(500);
    const r1 = await page.evaluate(() => {
      const a = window.TiledApp, st = a.getState(), back = document.querySelector('#worldBackdrop');
      return { world: st.worldPath, n: (st.world && st.world.maps || []).length, view: st.worldView, cached: [...(st.worldMapCache || new Map()).keys()], back: !!back && back.width > 0, crumb: document.querySelector('.world-crumb').textContent, map: st.mapFileName };
    });
    check(r1.world === 'out/demo.world' && r1.view && r1.back, `${w}px 打开 village 自动加载 demo.world 并显示相邻地图（${r1.n} 张）`);
    check(['forest.tmj', 'lake.tmj', 'field.tmj'].every((k) => r1.cached.includes(k)), `${w}px 相邻地图已载入：${r1.cached.join(',')}`);
    check(/世界：demo\.world › village\.tmj/.test(r1.crumb), `${w}px 面包屑：${r1.crumb.slice(0, 40)}`);
    // 相邻地图有像素（forest 区域）
    const px = await page.evaluate(() => {
      const a = window.TiledApp, wa = a.worldAuto, st = a.getState(), back = document.querySelector('#worldBackdrop');
      const fe = st.world.maps.find((e) => /forest/.test(e.fileName)), r = wa.extentOf(fe), s = st.zoom;
      const all = st.world.maps.map(wa.extentOf); const minX = Math.min(...all.map((q) => q.x)), minY = Math.min(...all.map((q) => q.y));
      const d = back.getContext('2d').getImageData(Math.round((r.x - minX + r.w / 2) * s), Math.round((r.y - minY + r.h / 2) * s), 4, 4).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n;
    });
    check(px > 0, `${w}px 相邻地图 forest 画出了像素`);
    // 悬停 forest 显示文件名
    const pt = await page.evaluate(() => {
      const a = window.TiledApp, st = a.getState(), wa = a.worldAuto, cvs = document.querySelector('#canvas'), wrap = document.querySelector('#canvasWrap');
      const fe = st.world.maps.find((e) => /forest/.test(e.fileName)), cur = wa.curEntry(), r = cvs.getBoundingClientRect(), s = st.zoom;
      const sx = r.left + (fe.x + 40 - cur.x) * s, sy = r.top + (fe.y + 40 - cur.y) * s;
      const wr = wrap.getBoundingClientRect();
      if (sx > wr.right - 10) wrap.scrollLeft += sx - wr.right + 60;
      const r2 = cvs.getBoundingClientRect();
      return { x: r2.left + (fe.x + 40 - cur.x) * s, y: r2.top + (fe.y + 40 - cur.y) * s };
    });
    await page.mouse.move(pt.x, pt.y); await sleep(80);
    const hov = await page.evaluate(() => { const h = document.querySelector('.world-hover'); return !h.hidden && h.dataset.file; });
    check(hov === 'forest.tmj', `${w}px 悬停高亮并显示文件名：${hov}`);
    // 在 village 上改一格，然后双击 forest：保留改动 + 相机世界位置
    await page.evaluate(() => { const a = window.TiledApp; a.snapshot(); a.getState().layer = 0; a.setTileAt(a.activeLayer(), 0, 0, a.getState().map, 5); });
    const before = await page.evaluate(() => { const wrap = document.querySelector('#canvasWrap'), wr = wrap.getBoundingClientRect(), a = window.TiledApp, st = a.getState(), cur = a.worldAuto.curEntry(), r = document.querySelector('#canvas').getBoundingClientRect(); return { x: cur.x + (wr.left + wr.width / 2 - r.left) / st.zoom, y: cur.y + (wr.top + wr.height / 2 - r.top) / st.zoom }; });
    await page.mouse.click(pt.x, pt.y, { clickCount: 2 }); await sleep(700);
    const r2 = await page.evaluate(() => { const wrap = document.querySelector('#canvasWrap'), wr = wrap.getBoundingClientRect(), a = window.TiledApp, st = a.getState(), cur = a.worldAuto.curEntry(), r = document.querySelector('#canvas').getBoundingClientRect(); return { map: st.mapFileName, world: st.worldPath, view: st.worldView, cx: cur.x + (wr.left + wr.width / 2 - r.left) / st.zoom, cy: cur.y + (wr.top + wr.height / 2 - r.top) / st.zoom, sess: [...st.worldSession.keys()], crumb: document.querySelector('.world-crumb').textContent, villageCached: st.worldMapCache.has('village.tmj') }; });
    check(r2.map === 'forest.tmj' && r2.world === 'out/demo.world' && r2.view, `${w}px 双击 forest 切换编辑，世界视图保持`);
    check(Math.abs(r2.cx - before.x) < 40 && Math.abs(r2.cy - before.y) < 40, `${w}px 相机世界位置保持（${Math.round(before.x)},${Math.round(before.y)} → ${Math.round(r2.cx)},${Math.round(r2.cy)}）`);
    check(r2.sess.includes('out/village.tmj') && /未保存/.test(r2.crumb) && r2.villageCached, `${w}px village 的未保存改动按地图保留`);
    if (process.env.SHOTS && w === 1440) await page.screenshot({ path: '/workspace/world-auto.png', captureBeyondViewport: false });
    // 切回 village，改动还在
    await page.evaluate(() => { const wa = window.TiledApp.worldAuto; return wa.switchTo(window.TiledApp.getState().world.maps.find((e) => /village/.test(e.fileName))); }); await sleep(600);
    check(await page.evaluate(() => { const a = window.TiledApp, st = a.getState(); return st.mapFileName === 'village.tmj' && a.tileAt(st.map.layers[0], 0, 0, st.map) === 5; }), `${w}px 切回 village，未保存的改动仍在`);
    // 视图开关（记住）
    await page.evaluate(() => document.querySelector('[data-world-show]').click()); await sleep(100);
    check(await page.evaluate(() => !window.TiledApp.getState().worldView && localStorage.getItem('tiled-web-hide-neighbors') === '1' && !document.querySelector('#worldBackdrop')), `${w}px 视图 › 隐藏相邻地图生效并记住`);
    await page.evaluate(() => document.querySelector('[data-world-show]').click()); await sleep(100);
    check(await page.evaluate(() => document.querySelector('[data-action="world-view-toggle"]').hidden), `${w}px 旧的手动「世界视图」开关已隐藏`);
    // 2) patterns 世界
    await page.evaluate(() => window.TiledApp.folder.openFromFS(window.__tfs, 'pat/map_0_0.tmj')); await sleep(500);
    const r3 = await page.evaluate(() => { const st = window.TiledApp.getState(); return { world: st.worldPath, maps: (st.world && st.world.maps || []).map((e) => e.fileName + '@' + e.x + ',' + e.y), back: !!document.querySelector('#worldBackdrop') }; });
    check(r3.world === 'pat/grid.world' && r3.maps.includes('map_1_0.tmj@320,0') && r3.maps.length === 2 && r3.back, `${w}px patterns 世界自动识别：${r3.maps.join(' ')}`);
    // 3) 打开 .world：打开原点地图并显示整个世界
    await page.evaluate(() => window.TiledApp.folder.openFromFS(window.__tfs, 'out/demo.world')); await sleep(800);
    const r4 = await page.evaluate(() => { const a = window.TiledApp, st = a.getState(), back = document.querySelector('#worldBackdrop'), wrap = document.querySelector('#canvasWrap'); const b = back && back.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); return { map: st.mapFileName, world: st.worldPath, fits: !!b && b.width <= wr.width + 2 && b.height <= wr.height + 2 && b.left >= wr.left - 2 && b.top >= wr.top - 2 }; });
    check(r4.map === 'village.tmj' && r4.world === 'out/demo.world', `${w}px 打开 demo.world → 打开原点地图 ${r4.map}`);
    check(r4.fits, `${w}px 打开 .world 后整个世界可见`);
    const tbo = await page.evaluate(() => { const z = document.querySelector('.toolbar > .zoom'), st = document.querySelector('#status'); if (!z || !st || st.offsetWidth === 0 || z.closest('.tb-more-panel')) return 0; const a = z.getBoundingClientRect(), b = st.getBoundingClientRect(); return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)); });
    check(tbo === 0, `${w}px 长状态文字不与顶栏缩放重叠`);
    const ov = await page.evaluate(() => { const de = document.documentElement, f = document.querySelector('.canvas-footer'); return de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth || f.scrollWidth > f.clientWidth + 1; });
    check(!ov, `${w}px 无横向溢出（含底栏面包屑）`);
  }
  check(errs.length === 0, '无脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

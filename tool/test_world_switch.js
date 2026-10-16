#!/usr/bin/env node
// 世界切换回归测试：从 village/forest/lake/field 出发，切入并切出每一张相邻地图（含无限地图 cave）。
// 检查：无脚本错误、缩放不变、画布显示尺寸 = 像素尺寸（不被缩小）、画布与世界背景对齐、相机世界位置保持、像素有渲染；cave 单独打开也正确。
// NODE_PATH=/path/to/node_modules node tool/test_world_switch.js（SHOTS=1 存截图）
const path = require('path'), fsn = require('fs');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
const demo = path.join(__dirname, '..', 'examples', 'full-demo');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rels = [];
(function walk(d, pre) { for (const n of fsn.readdirSync(d)) { const p = path.join(d, n); if (fsn.statSync(p).isDirectory()) { if (n !== 'validate') walk(p, pre + n + '/'); } else if (/\.(tmj|tsx|tx|tj|world|png)$/i.test(n)) rels.push(pre + n); } })(demo, '');
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.TiledApp && window.TiledApp.worldAuto && window.TiledApp.folder, { timeout: 6000 });
  await page.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'tF'; i.style.display = 'none'; document.body.appendChild(i); });
  await (await page.$('#tF')).uploadFile(...rels.map((r) => path.join(demo, r)));
  await page.evaluate((rels) => { const f = [...document.querySelector('#tF').files]; window.__tfs = window.TiledApp.folder.listFS('full-demo', rels.map((r, i) => [r, f[i]])); }, rels);
  const probe = () => page.evaluate(() => {
    const a = window.TiledApp, st = a.getState(), wa = a.worldAuto, c = document.querySelector('#canvas'), r = c.getBoundingClientRect();
    const wrap = document.querySelector('#canvasWrap'), wr = wrap.getBoundingClientRect(), back = document.querySelector('#worldBackdrop');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let px = 0; for (let i = 3; i < d.length; i += 64) if (d[i]) px++;
    const s = st.zoom, o = wa.origin();
    const all = st.world.maps.map(wa.extentOf); const minX = Math.min(...all.map((q) => q.x)), minY = Math.min(...all.map((q) => q.y));
    const br = back && back.getBoundingClientRect();
    const align = br ? Math.max(Math.abs((r.left - br.left) - (o.x - minX) * s), Math.abs((r.top - br.top) - (o.y - minY) * s)) : 999;
    const c0 = wa.toWorld(wr.left + wr.width / 2, wr.top + wr.height / 2);
    const atEdge = wrap.scrollLeft <= 0 || wrap.scrollTop <= 0 || wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 1 || wrap.scrollTop >= wrap.scrollHeight - wrap.clientHeight - 1;
    return { map: st.mapFileName, zoom: s, css: [Math.round(r.width), Math.round(r.height)], pix: [c.width, c.height], px, align: Math.round(align), cx: c0.x, cy: c0.y, atEdge, world: st.worldPath };
  });
  const tsOk = () => page.evaluate(() => { const a = window.TiledApp; return a.getTilesetRegistry().length > 0 && a.getTilesetRegistry().every((t) => { const im = a.getImageCache().get(t.url); return im && im.naturalWidth > 0; }); });
  const STARTS = ['village', 'forest', 'lake', 'field'];
  for (const [vw, zoomPct] of [[1440, null], [800, 300]]) {
  await page.setViewport({ width: vw, height: 900 });
  console.log(`-- 视口 ${vw}px，缩放 ${zoomPct || '自动取景'}`);
  for (const start of STARTS) {
    await page.evaluate((s) => window.TiledApp.folder.openFromFS(window.__tfs, 'out/' + s + '.tmj'), start); await sleep(500);
    if (zoomPct) { await page.evaluate((z) => { const a = window.TiledApp; a.applyZoomPercent(z); a.draw(); }, zoomPct); await sleep(120); await page.evaluate(() => { const wa = window.TiledApp.worldAuto, e = wa.extentOf(wa.curEntry()), wrap = document.querySelector('#canvasWrap'), wr = wrap.getBoundingClientRect(), r = document.querySelector('#canvas').getBoundingClientRect(), s = window.TiledApp.getState().zoom, o = wa.origin(); wrap.scrollLeft += r.left + (e.x + e.w - 40 - o.x) * s - (wr.left + wr.width / 2); wrap.scrollTop += r.top + (e.y + e.h / 2 - o.y) * s - (wr.top + wr.height / 2); }); }
    const names = await page.evaluate(() => window.TiledApp.getState().world.maps.map((e) => e.fileName));
    for (const name of names) {
      if (name === start + '.tmj') continue;
      const b0 = await probe();
      await page.evaluate((n) => window.TiledApp.worldAuto.switchTo(window.TiledApp.getState().world.maps.find((e) => e.fileName === n)), name); await sleep(450);
      const b1 = await probe();
      const camOk = (Math.abs(b1.cx - b0.cx) < 24 && Math.abs(b1.cy - b0.cy) < 24) || b1.atEdge;
      check(b1.map === name && b1.zoom === b0.zoom && b1.css[0] === b1.pix[0] && b1.css[1] === b1.pix[1] && b1.align <= 1 && b1.px > 0 && camOk && (await tsOk()),
        `${start} → ${name}：缩放 ${b0.zoom}→${b1.zoom}，画布 ${b1.css.join('×')}/${b1.pix.join('×')}，对齐误差 ${b1.align}px，相机 (${Math.round(b0.cx)},${Math.round(b0.cy)})→(${Math.round(b1.cx)},${Math.round(b1.cy)})${b1.atEdge ? '[滚动到边]' : ''}，像素 ${b1.px}`);
      if (process.env.SHOTS && name === 'cave.tmj' && start === 'forest' && !zoomPct) await page.screenshot({ path: '/workspace/world-cave.png', captureBeyondViewport: false });
      // 切回出发地图
      await page.evaluate((n) => window.TiledApp.worldAuto.switchTo(window.TiledApp.getState().world.maps.find((e) => e.fileName === n)), start + '.tmj'); await sleep(450);
      const b2 = await probe();
      const back = (Math.abs(b2.cx - b1.cx) < 24 && Math.abs(b2.cy - b1.cy) < 24) || b2.atEdge;
      check(b2.map === start + '.tmj' && b2.zoom === b0.zoom && b2.css[0] === b2.pix[0] && b2.align <= 1 && b2.px > 0 && back, `${name} → ${start}.tmj：切回，对齐 ${b2.align}px，相机保持`);
    }
  }
  }
  // 在 cave 上画一格 → 切出 → 切回，未保存改动保留
  await page.evaluate(() => window.TiledApp.folder.openFromFS(window.__tfs, 'out/cave.tmj')); await sleep(500);
  const cave = await probe();
  check(cave.world === 'out/demo.world' && cave.css[0] === cave.pix[0] && cave.align <= 1, `直接打开 cave：自动识别世界、画布 ${cave.css.join('×')} 不缩小、对齐 ${cave.align}px`);
  await page.evaluate(() => { const a = window.TiledApp, st = a.getState(); a.snapshot(); a.setTileAt(st.map.layers[0], 1, 1, st.map, 7); });
  await page.evaluate(() => window.TiledApp.worldAuto.switchTo(window.TiledApp.getState().world.maps.find((e) => e.fileName === 'forest.tmj'))); await sleep(450);
  await page.evaluate(() => window.TiledApp.worldAuto.switchTo(window.TiledApp.getState().world.maps.find((e) => e.fileName === 'cave.tmj'))); await sleep(450);
  check(await page.evaluate(() => { const a = window.TiledApp, st = a.getState(); return st.mapFileName === 'cave.tmj' && a.tileAt(st.map.layers[0], 1, 1, st.map) === 7; }), 'cave 的未保存改动切出再切回仍在');
  // cave 单独打开（不经世界）
  await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.TiledApp && window.TiledApp.worldAuto);
  await (await page.$('#mapInput')).uploadFile(path.join(demo, 'out', 'cave.tmj'), path.join(demo, 'village.tsx'), path.join(demo, 'tiles.png')); await sleep(800);
  const solo = await page.evaluate(() => { const a = window.TiledApp, st = a.getState(), c = document.querySelector('#canvas'), r = c.getBoundingClientRect(); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let px = 0; for (let i = 3; i < d.length; i += 64) if (d[i]) px++; const t = a.getTilesetRegistry()[0]; return { map: st.mapFileName, inf: !!st.map.infinite, css: [Math.round(r.width), Math.round(r.height)], pix: [c.width, c.height], px, ts: t && t.name, img: !!(t && a.getImageCache().get(t.url)) }; });
  check(solo.map === 'cave.tmj' && solo.inf && solo.css[0] === solo.pix[0] && solo.css[1] === solo.pix[1] && solo.px > 0 && solo.ts === 'village' && solo.img, `cave 单独打开：无限图、图块集 ${solo.ts}（../village.tsx）已解析、画布 ${solo.css.join('×')}、像素 ${solo.px}`);
  check(errs.length === 0, '无脚本 / 控制台错误' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

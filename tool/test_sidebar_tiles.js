#!/usr/bin/env node
// 侧栏图块缩略图测试：示例图块集每一块的缩略图都画出了像素，且与原图对应位置一致。
// NODE_PATH=/path/to/node_modules node tool/test_sidebar_tiles.js（SHOTS=1 存截图）
const path = require('path');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
const demo = path.join(__dirname, '..', 'examples', 'full-demo');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const w of [1440, 800]) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.topbar[data-layout="menubar"]');
    await (await page.$('#tilesetInput')).uploadFile(path.join(demo, 'village.tsx'), path.join(demo, 'tiles.png'));
    await page.waitForFunction(() => document.querySelectorAll('#tileset .tile-cell').length >= 32, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const r = await page.evaluate(() => {
      const a = window.TiledApp, t = a.getState().tileset, im = a.getImageCache().get(t.url);
      const ref = document.createElement('canvas'); ref.width = t.tileWidth; ref.height = t.tileHeight; const rc = ref.getContext('2d');
      const cells = [...document.querySelectorAll('#tileset .tile-cell')]; const bad = [], blank = [];
      cells.forEach((cell, i) => {
        const c = cell.querySelector('canvas'); if (!c) { blank.push(i); return; }
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k]) n++;
        if (!n) { blank.push(i); return; }
        const col = i % t.columns, row = Math.floor(i / t.columns);
        rc.clearRect(0, 0, ref.width, ref.height);
        rc.drawImage(im, (t.margin || 0) + col * (t.tileWidth + (t.spacing || 0)), (t.margin || 0) + row * (t.tileHeight + (t.spacing || 0)), t.tileWidth, t.tileHeight, 0, 0, t.tileWidth, t.tileHeight);
        const e = rc.getImageData(0, 0, ref.width, ref.height).data; let diff = 0; for (let k = 0; k < e.length; k++) if (Math.abs(e[k] - d[k]) > 2) diff++;
        if (diff) bad.push(i);
        const b = c.getBoundingClientRect(); if (b.width < 8 || b.height < 8) bad.push(i + '(尺寸)');
      });
      return { count: t.count, cells: cells.length, blank, bad };
    });
    check(r.cells === r.count, `${w}px 缩略图数量 ${r.cells}/${r.count}`);
    check(r.blank.length === 0, `${w}px 每块缩略图都有像素` + (r.blank.length ? ' 空白:' + r.blank : ''));
    check(r.bad.length === 0, `${w}px 缩略图与原图对应图块一致` + (r.bad.length ? ' 不符:' + r.bad : ''));
    if (process.env.SHOTS && w === 1440) await page.screenshot({ path: '/workspace/sidebar-tiles.png', captureBeyondViewport: false });
  }
  check(errs.length === 0, '无脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

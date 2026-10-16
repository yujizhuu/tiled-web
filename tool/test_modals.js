#!/usr/bin/env node
// 统一弹窗 + 教程入口测试。NODE_PATH=/path/to/node_modules node tool/test_modals.js（SHOTS=1 存截图）
const path = require('path');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[1440, 900], [1024, 768], [800, 800], [600, 800], [1024, 600], [600, 600]];
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const [w, h] of SIZES) {
    await page.setViewport({ width: w, height: h });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.TiledApp && window.TiledApp.guide && document.querySelector('.tour-entry') && document.querySelector('.topbar[data-layout="menubar"]'), { timeout: 5000 });
    await sleep(150);
    const tag = `${w}×${h}`;
    // 教程入口
    const te = await page.evaluate(() => { const b = document.querySelector('.tour-entry'); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: r.width > 0 && r.right <= innerWidth && r.left >= 0, hit: !!hit && b.contains(hit) }; });
    check(te.vis && te.hit, `${tag} 顶栏 🎓 教程按钮可见可点`);
    await page.click('.tour-entry'); await sleep(150);
    check(await page.evaluate(() => window.TiledApp.guide.isTourOpen()), `${tag} 点 🎓 启动新手引导`);
    if (process.env.SHOTS && w === 1440) await page.screenshot({ path: '/workspace/tour-entry.png', captureBeyondViewport: false });
    await page.keyboard.press('Escape'); await sleep(80);
    // 帮助面板顶部按钮
    await page.evaluate(() => window.TiledHelp.open()); await sleep(120);
    const hb = await page.evaluate(() => { const b = document.querySelector('.help-tour-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.top >= 0; });
    check(hb, `${tag} 帮助面板顶部有「开始新手引导」`);
    await page.click('.help-tour-btn'); await sleep(120);
    check(await page.evaluate(() => window.TiledApp.guide.isTourOpen()), `${tag} 帮助面板按钮启动引导`);
    await page.keyboard.press('Escape'); await sleep(80);
    // 所有弹窗
    const ids = await page.evaluate(() => [...document.querySelectorAll('.collision-editor')].map((m) => m.id));
    for (const id of ids) {
      const openIt = async () => {
        if (id === 'prefsEditor') await page.evaluate(() => document.querySelector('[data-action="preferences"]').click());
        else await page.evaluate((id) => { const m = document.getElementById(id); m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }, id);
        await sleep(80);
      };
      await openIt();
      const r = await page.evaluate((id) => {
        const m = document.getElementById(id), inner = m.querySelector('.modal-inner'), x = m.querySelector('.modal-x');
        if (!inner || !x) return { err: '缺少统一结构' };
        const ir = inner.getBoundingClientRect(), xr = x.getBoundingClientRect();
        const hit = document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2);
        const de = document.documentElement;
        return { fit: ir.left >= 0 && ir.top >= 0 && ir.right <= innerWidth + 0.5 && ir.bottom <= innerHeight + 0.5, xOk: !!hit && x.contains(hit), over: de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth, ir: [Math.round(ir.width), Math.round(ir.height)] };
      }, id);
      if (r.err) { check(false, `${tag} ${id} ${r.err}`); continue; }
      check(r.fit && r.xOk && !r.over, `${tag} ${id} 在视口内(${r.ir.join('×')})、✕ 可见、无横向溢出`);
      if (process.env.SHOTS && id === 'prefsEditor' && (w === 1440 || w === 800) && h >= 800) await page.screenshot({ path: `/workspace/prefs-${w}.png`, captureBeyondViewport: false });
      // 若内容超高，body 可滚动且标题仍在
      await page.evaluate((id) => { const b = document.querySelector('#' + id + ' .modal-body'); b.scrollTop = b.scrollHeight; }, id);
      check(await page.evaluate((id) => { const x = document.querySelector('#' + id + ' .modal-x').getBoundingClientRect(); return x.top >= 0 && x.bottom <= innerHeight; }, id), `${tag} ${id} 滚动后 ✕ 仍可见`);
      await page.keyboard.press('Escape'); await sleep(60);
      check(await page.evaluate((id) => document.getElementById(id).classList.contains('hidden'), id), `${tag} ${id} Esc 关闭`);
      await openIt();
      await page.click(`#${id} .modal-x`); await sleep(60);
      check(await page.evaluate((id) => document.getElementById(id).classList.contains('hidden'), id), `${tag} ${id} ✕ 关闭`);
      await openIt();
      await page.mouse.click(3, h - 3); await sleep(60);
      check(await page.evaluate((id) => document.getElementById(id).classList.contains('hidden'), id), `${tag} ${id} 点遮罩关闭`);
    }
    // 帮助弹层本身
    await page.evaluate(() => window.TiledHelp.open()); await sleep(100);
    check(await page.evaluate(() => { const r = document.querySelector('.help-inner').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), `${tag} 帮助面板在视口内`);
    await page.keyboard.press('Escape');
  }
  check(errs.length === 0, '无脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

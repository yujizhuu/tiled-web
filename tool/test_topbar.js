#!/usr/bin/env node
// 顶栏布局测试：各宽度无横向溢出、顶栏元素互不重叠、所有动作可达。
// 依赖 puppeteer-core（不入库）：NODE_PATH=/path/to/node_modules node tool/test_topbar.js
// 环境变量 CHROME 指定浏览器，SHOTS=1 时把截图存到 /workspace。
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const url = 'file://' + path.join(__dirname, 'index.html');
const WIDTHS = [1920, 1440, 1280, 1024, 800, 600];
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fail++; };
(async () => {
  const br = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 800 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.topbar[data-layout="menubar"]');
    await new Promise((r) => setTimeout(r, 150));
    const r = await page.evaluate(() => {
      const de = document.documentElement, bar = document.querySelector('.topbar'), tb = bar.querySelector('.toolbar');
      const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
      // 顶栏顶层元素：品牌、帮助键、各菜单按钮、常用图标、工具按钮、缩放、状态、更多
      const sel = '.brand-mark, .brand>span, .help-main, .tb-menubar>.tb-menu>.tb-menu-btn, .tb-primary>button, .toolbar>.tb-tools .tool-mode>button, .toolbar>.tb-tools .tool-group:not([hidden])>button, .toolbar>.zoom, .topbar>.status, .tb-more>.tb-menu-btn';
      const els = [...bar.querySelectorAll(sel)].filter((e) => vis(e) && !e.closest('.tb-menu-panel'));
      const boxes = els.map((e) => { const b = e.getBoundingClientRect(); return { n: (e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 8), l: b.left, r: b.right, t: b.top, b: b.bottom }; });
      const hits = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5) hits.push(a.n + ' × ' + c.n);
      }
      const outside = boxes.filter((b) => b.r > innerWidth + 0.5 || b.l < -0.5).map((b) => b.n);
      const tops = new Set(boxes.map((b) => Math.round((b.t + b.b) / 2 / 6)));
      return { pageOver: de.scrollWidth > de.clientWidth, barOver: bar.scrollWidth > bar.clientWidth, tbOver: tb.scrollWidth > tb.clientWidth, hits, outside, n: boxes.length, rows: tops.size, barH: bar.getBoundingClientRect().height, more: !document.querySelector('.tb-more').hidden };
    });
    check(!r.pageOver && !r.barOver && !r.tbOver, `${w}px 无横向溢出 (page/bar/toolbar)`);
    check(r.hits.length === 0, `${w}px 顶栏 ${r.n} 个元素互不重叠` + (r.hits.length ? ' ' + r.hits.join('; ') : ''));
    check(r.outside.length === 0, `${w}px 全部在视口内`);
    check(r.barH <= 50, `${w}px 单行（高 ${r.barH}px）`);
    console.log(`     更多菜单：${r.more ? '显示' : '隐藏'}`);
    // 所有动作可达：每个 data-action / data-tool 都在顶栏可见处或某个菜单里
    const reach = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('.topbar [data-action], .topbar [data-tool]').forEach((el) => {
        const inPanel = el.closest('.tb-menu-panel'); const s = getComputedStyle(el);
        if (!inPanel && (s.display === 'none' || el.offsetWidth === 0) && !el.closest('.tool-group[hidden]')) bad.push(el.dataset.action || el.dataset.tool);
      });
      return bad;
    });
    check(reach.length === 0, `${w}px 所有顶栏动作可达` + (reach.length ? ' ' + reach : ''));
    if (process.env.SHOTS && (w === 1440 || w === 1024)) await page.screenshot({ path: `/workspace/topbar-${w}.png`, clip: { x: 0, y: 0, width: w, height: 420 } });
    if (w === 800) {
      // 打开「文件」菜单与「更多」菜单，菜单面板也不能超出视口
      for (const s of ['.tb-menubar>.tb-menu:first-child>.tb-menu-btn', '.tb-more>.tb-menu-btn']) {
        const has = await page.$(s); if (!has) continue;
        await page.click(s); await new Promise((r) => setTimeout(r, 80));
        const pr = await page.evaluate(() => { const p = document.querySelector('.tb-menu.open>.tb-menu-panel'); if (!p) return null; const b = p.getBoundingClientRect(); return { l: b.left, r: b.right }; });
        check(pr && pr.l >= 0 && pr.r <= 800, `800px 菜单 ${s} 打开后在视口内`);
        if (process.env.SHOTS && s.includes('first-child')) await page.screenshot({ path: '/workspace/topbar-800-file.png', clip: { x: 0, y: 0, width: 800, height: 520 }, captureBeyondViewport: false });
        if (process.env.SHOTS && s.includes('more')) await page.screenshot({ path: '/workspace/topbar-800.png' });
      }
      // 菜单项能触发：视图 > 缩放 100%（快捷键仍有效：按 + 放大）
      await page.keyboard.press('Escape');
      const z0 = await page.$eval('#zoom', (e) => +e.value);
      await page.evaluate(() => document.body.focus()); await page.keyboard.press('Equal');
      const z1 = await page.$eval('#zoom', (e) => +e.value);
      check(z1 > z0, '快捷键 + 仍能放大');
      await page.evaluate(() => document.querySelector('[data-action="zoom-reset"]').click());
      check(await page.$eval('#zoom', (e) => +e.value) === 100, '菜单项「缩放 100%」生效');
      await page.evaluate(() => document.querySelector('.help-main').click());
      check(await page.evaluate(() => !!document.querySelector('.help-inner') && ![...document.querySelectorAll('.hidden')].some((h) => h.contains(document.querySelector('.help-inner')))), '? 帮助按钮可打开');
      const deep = await page.evaluate(() => document.querySelectorAll('.help-q.help-inline').length);
      check(deep >= 5, `帮助深链小问号仍在（${deep} 个）`);
    }
  }
  check(errs.length === 0, '无页面脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close();
  console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

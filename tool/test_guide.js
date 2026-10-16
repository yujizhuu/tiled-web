#!/usr/bin/env node
// 情境提示 + 新手引导测试。NODE_PATH=/path/to/node_modules node tool/test_guide.js（SHOTS=1 存截图）
const path = require('path');
const puppeteer = require('puppeteer-core');
const url = 'file://' + path.join(__dirname, 'index.html');
const demo = path.join(__dirname, '..', 'examples', 'full-demo');
let fail = 0; const check = (ok, m) => { console.log((ok ? 'ok   ' : 'FAIL ') + m); if (!ok) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const br = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await br.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  for (const w of [1440, 800]) {
    await page.setViewport({ width: w, height: 900 });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => window.TiledApp && window.TiledApp.guide && document.querySelector('[data-guide="tour"]'), { timeout: 5000 });
    // 载入示例村庄（地图 + 外部图块集 + 图片 + 模板）
    const inp = await page.$('#mapInput');
    await inp.uploadFile(path.join(demo, 'out', 'village.tmj'), path.join(demo, 'village.tsx'), path.join(demo, 'tiles.png'), path.join(demo, 'items.png'), path.join(demo, 'templates', 'chest.tx'), path.join(demo, 'templates', 'sign.tj'));
    await page.waitForFunction(() => (window.TiledApp.getState().map.layers || []).some((l) => l.type === 'objectgroup'), { timeout: 5000 });
    await sleep(300);
    // 1) 每种图层类型的提示
    const layerRes = await page.evaluate(async () => {
      const a = window.TiledApp, st = a.getState(), m = st.map, out = {};
      const types = ['tilelayer', 'objectgroup', 'imagelayer', 'group'];
      if (!m.layers.some((l) => l.type === 'imagelayer')) m.layers.push({ id: 900, name: 'BG', type: 'imagelayer', image: '', visible: true, opacity: 1, x: 0, y: 0 });
      if (!m.layers.some((l) => l.type === 'group')) m.layers.push({ id: 901, name: 'Grp', type: 'group', layers: [], visible: true, opacity: 1 });
      a.renderAll();
      for (const t of types) {
        st.layerPath = null; st.layer = m.layers.findIndex((l) => (l.type || 'tilelayer') === t); a.renderAll();
        await new Promise((r) => setTimeout(r, 320));
        const b = document.querySelector('#layerHint'); out[t] = !b.hidden && b.offsetHeight > 0 ? b.textContent : null;
      }
      return out;
    });
    for (const [t, txt] of Object.entries(layerRes)) check(!!txt, `${w}px 图层提示 ${t}: ${txt ? txt.slice(0, 22) : '无'}`);
    check(/对象层：放不按格子摆的东西/.test(layerRes.objectgroup || ''), `${w}px 对象层提示文案正确`);
    // 2) 每种对象类型的提示
    const objRes = await page.evaluate(async () => {
      const a = window.TiledApp, st = a.getState(), m = st.map;
      const oi = m.layers.findIndex((l) => l.type === 'objectgroup'); st.layerPath = null; st.layer = oi; const L = m.layers[oi];
      const add = (o) => { o.id = 1000 + L.objects.length; L.objects.push(o); return o; };
      const kinds = {
        point: add({ name: 'P', x: 40, y: 40, point: true, width: 0, height: 0 }),
        rect: add({ name: 'R', x: 60, y: 60, width: 30, height: 20 }),
        ellipse: add({ name: 'E', x: 60, y: 90, width: 30, height: 20, ellipse: true }),
        polygon: add({ name: 'PG', x: 100, y: 40, polygon: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 15 }] }),
        polyline: add({ name: 'PL', x: 100, y: 80, polyline: [{ x: 0, y: 0 }, { x: 30, y: 10 }] }),
        text: add({ name: 'T', x: 140, y: 40, width: 80, height: 20, text: { text: '你好' } }),
        tile: add({ name: 'TO', x: 140, y: 100, width: 16, height: 16, gid: 9 }),
        template: L.objects.find((o) => o.template) || add({ name: 'TI', x: 160, y: 120, template: '../templates/chest.tx' }),
      };
      const out = {};
      for (const [k, o] of Object.entries(kinds)) {
        st.selectedObject = o; st.selectedObjects = [o]; a.renderAll(); await new Promise((r) => setTimeout(r, 320));
        const b = document.querySelector('#objectHint'); out[k] = { kind: a.guide.objKind(o), txt: !b.hidden && b.offsetHeight > 0 ? b.textContent : null, more: !!b.querySelector('.ctx-hint-more') };
      }
      return out;
    });
    for (const [k, r] of Object.entries(objRes)) check(r.kind === k && !!r.txt && r.more, `${w}px 对象提示 ${k}: ${r.txt ? r.txt.slice(0, 20) : '无'}`);
    // 「详细 →」打开帮助到对象层章节
    await page.evaluate(() => { const a = window.TiledApp; const st = a.getState(); st.layerPath = null; st.layer = st.map.layers.findIndex((l) => l.type === 'objectgroup'); st.selectedObject = st.map.layers[st.layer].objects.find((o) => o.point); st.selectedObjects = [st.selectedObject]; a.renderAll(); });
    await sleep(320);
    await page.evaluate(() => document.querySelector('#objectHint').scrollIntoView({ block: 'center' })); await sleep(100);
    if (process.env.SHOTS && w === 1440) await page.screenshot({ path: '/workspace/hint-object.png', captureBeyondViewport: false });
    await page.click('#objectHint .ctx-hint-more'); await sleep(200);
    check(await page.evaluate(() => { const el = document.querySelector('#help-object-layer'); return !!el && !!el.querySelector('svg') && el.getBoundingClientRect().height > 0; }), `${w}px 「详细 →」打开对象层帮助（含示意图）`);
    const fig = await page.evaluate(() => [...document.querySelectorAll('#help-object-layer svg text')].map((t) => t.textContent).join('|'));
    check(['点', '矩形', '椭圆', '文本', '图块对象'].every((k) => fig.includes(k)), `${w}px 示意图标注点/矩形/椭圆/文本/图块对象`);
    await page.keyboard.press('Escape'); await sleep(100);
    // 关闭开关
    await page.evaluate(() => window.TiledApp.guide.setHints(false)); await sleep(320);
    check(await page.evaluate(() => document.querySelector('#objectHint').hidden && document.querySelector('#layerHint').hidden), `${w}px 帮助菜单开关可关闭提示`);
    await page.evaluate(() => window.TiledApp.guide.setHints(true)); await sleep(320);
    check(await page.evaluate(() => !document.querySelector('#objectHint').hidden), `${w}px 重新打开提示`);
    // 3) 新手引导：从帮助菜单启动
    await page.evaluate(() => { const a = window.TiledApp, st = a.getState(); st.selectedObject = null; st.layer = 0; a.renderAll(); });
    await page.evaluate(() => document.querySelector('[data-guide="tour"]').click()); await sleep(250);
    check(await page.evaluate(() => window.TiledApp.guide.isTourOpen()), `${w}px 帮助 › 新手引导 可启动`);
    const n = await page.evaluate(() => window.TiledApp.guide.steps().length);
    const titles = [];
    for (let i = 0; i < n; i++) {
      await sleep(230);
      const s = await page.evaluate(() => {
        const ov = document.querySelector('#tour'), spot = ov.querySelector('.tour-spot'), card = ov.querySelector('.tour-card');
        const sr = spot.style.display === 'none' ? null : spot.getBoundingClientRect(), cr = card.getBoundingClientRect();
        const de = document.documentElement;
        return { t: card.querySelector('h3').textContent, spot: sr && { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom, w: sr.width, h: sr.height }, card: { l: cr.left, t: cr.top, r: cr.right, b: cr.bottom }, over: de.scrollWidth > de.clientWidth || document.body.scrollWidth > document.body.clientWidth };
      });
      titles.push(s.t);
      const inVp = (b) => b.l >= 0 && b.t >= 0 && b.r <= w + 0.5 && b.b <= 900.5;
      const spotOk = !s.spot || (inVp(s.spot) && s.spot.w > 8 && s.spot.h > 8);
      const ovl = s.spot ? Math.max(0, Math.min(s.card.r, s.spot.r) - Math.max(s.card.l, s.spot.l)) * Math.max(0, Math.min(s.card.b, s.spot.b) - Math.max(s.card.t, s.spot.t)) : 0;
      check(spotOk && inVp(s.card) && !s.over, `${w}px 引导 ${i + 1}/${n}「${s.t}」聚光${s.spot ? '可见' : '（居中）'}、卡片在视口内、无溢出` + (ovl > 0 ? `（卡片与聚光重叠 ${Math.round(ovl)}px²）` : ''));
      if (process.env.SHOTS && w === 1440 && s.t === '地图上的对象') await page.screenshot({ path: '/workspace/tour-step.png', captureBeyondViewport: false });
      await page.click('#tour [data-tour="next"]');
    }
    await sleep(150);
    check(!(await page.evaluate(() => window.TiledApp.guide.isTourOpen())), `${w}px 引导走完后关闭`);
    check(titles.includes('对象层') && titles.includes('地图上的对象'), `${w}px 引导包含对象层和地图上的对象步骤`);
    check(await page.evaluate(() => localStorage.getItem('tiled-web-tour-done') === '1'), `${w}px 完成后记录到 localStorage`);
  }
  // 首次访问自动弹出（模拟非自动化环境）
  const p2 = await br.newPage(); await p2.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); localStorage.removeItem('tiled-web-tour-done'); });
  await p2.setViewport({ width: 1280, height: 800 }); await p2.goto(url, { waitUntil: 'load' }); await sleep(1500);
  check(await p2.evaluate(() => !!document.querySelector('#tour')), '首次访问自动显示新手引导');
  await p2.click('#tour [data-tour="skip"]');
  check(await p2.evaluate(() => !document.querySelector('#tour') && localStorage.getItem('tiled-web-tour-done') === '1'), '跳过后不再自动显示');
  check(errs.length === 0, '无脚本错误' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await br.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

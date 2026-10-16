/* Tiled 网页版 · 新手帮助：情境提示（图层 / 对象类型）+ 聚光灯新手引导。 */
(function () {
  'use strict';
  const HINTS_OFF = 'tiled-web-hints-off', DISMISSED = 'tiled-web-hints-dismissed', TOUR_DONE = 'tiled-web-tour-done';
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const LAYER_HINT = {
    tilelayer: ['瓦片层', '按格子铺图块，画的是地面、墙、装饰等看得见的画面。', 'layers'],
    objectgroup: ['对象层', '放不按格子摆的东西（出生点、碰撞区、触发区、宝箱等），给游戏程序读，不是画面。', 'object-layer'],
    imagelayer: ['图像层', '整张图片（背景、远景），不按格子摆，常用作视差背景。', 'layers'],
    group: ['组层', '像文件夹一样把几个图层装在一起，可一起隐藏、调透明度或移动。', 'layers'],
  };
  const OBJ_HINT = {
    point: ['点对象', '只有位置、没有大小，常用作出生点、刷怪点、路径点。', 'object-layer'],
    rect: ['矩形对象', '一块矩形区域，常用作碰撞区、触发区、相机边界。', 'object-layer'],
    ellipse: ['椭圆对象', '圆形或椭圆区域，常用作范围检测（水塘、光照半径、警戒范围）。', 'object-layer'],
    polygon: ['多边形对象', '任意形状的封闭区域，用于不规则的碰撞或区域。', 'object-layer'],
    polyline: ['折线对象', '不封闭的线，常用作巡逻路线、轨道、边界线。', 'object-layer'],
    text: ['文本对象', '地图上的文字，可以让游戏显示，也可以只是给自己看的备注。', 'object-layer'],
    tile: ['图块对象', '把一个图块当图片自由摆放，位置不受格子限制，如宝箱、道具、NPC。', 'object-layer'],
    template: ['模板实例', '引用 .tx 模板的对象：改模板，所有实例一起变；这里只保存改动过的部分。', 'templates'],
  };
  function objKind(o) {
    if (!o) return null;
    if (o.template) return 'template';
    if (o.point) return 'point';
    if (o.ellipse) return 'ellipse';
    if (o.polygon) return 'polygon';
    if (o.polyline) return 'polyline';
    if (o.text != null && o.text !== false) return 'text';
    if (o.gid) return 'tile';
    return 'rect';
  }
  const dismissed = () => { try { return new Set(JSON.parse(ls.get(DISMISSED) || '[]')); } catch (_) { return new Set(); } };
  const hintsOn = () => ls.get(HINTS_OFF) !== '1';

  function boot(api) {
    const state = api.getState();
    /* ---------- 1. 情境提示 ---------- */
    function makeBox(id, anchor, before) {
      const box = document.createElement('div'); box.className = 'ctx-hint'; box.id = id; box.hidden = true; box.setAttribute('role', 'note');
      box.innerHTML = '<span class="ctx-hint-text"></span><a href="#" class="ctx-hint-more">详细 →</a><button type="button" class="ctx-hint-x" title="不再显示这类提示">✕</button>';
      if (before) anchor.parentNode.insertBefore(box, anchor); else anchor.after(box);
      box.querySelector('.ctx-hint-more').onclick = (e) => { e.preventDefault(); window.TiledHelp && window.TiledHelp.open(box.dataset.topic); };
      box.querySelector('.ctx-hint-x').onclick = () => { const d = dismissed(); d.add(box.dataset.key); ls.set(DISMISSED, JSON.stringify([...d])); box.hidden = true; last[id] = null; };
      return box;
    }
    const layersEl = document.querySelector('#layers'), inspector = document.querySelector('#objectInspector');
    const layerBox = layersEl && makeBox('layerHint', layersEl, false);
    const objBox = inspector && makeBox('objectHint', inspector, true);
    const last = {};
    function show(box, key, def) {
      if (!box) return;
      const want = def && hintsOn() && !dismissed().has(key) ? key : null;
      if (last[box.id] === want) return; last[box.id] = want;
      if (!want) { box.hidden = true; return; }
      box.dataset.key = key; box.dataset.topic = def[2];
      box.querySelector('.ctx-hint-text').innerHTML = '<b></b>：<span></span>';
      box.querySelector('b').textContent = def[0]; box.querySelector('.ctx-hint-text span').textContent = def[1];
      box.hidden = false;
      // 选中对象时把提示（及下方属性）滚进左栏可见区
      if (box.id === 'objectHint') { const sec = box.closest('.panel-section'); (sec || box).scrollIntoView({ block: 'nearest' }); }
    }
    function tick() {
      const l = api.activeLayer();
      const lt = l && (l.type || 'tilelayer');
      show(layerBox, 'layer:' + lt, LAYER_HINT[lt]);
      const k = objKind(state.selectedObject);
      show(objBox, 'obj:' + k, k && OBJ_HINT[k]);
    }
    setInterval(tick, 250); tick();
    function setHints(on) { ls.set(HINTS_OFF, on ? '0' : '1'); if (on) ls.set(DISMISSED, '[]'); last.layerHint = last.objectHint = undefined; tick(); syncMenu(); }

    /* ---------- 2. 新手引导 ---------- */
    let ov = null, idx = 0, steps = [];
    const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
    const q = (s) => document.querySelector(s);
    const firstVisible = (...sels) => sels.map(q).find(visible) || null;
    function objectRect() {
      const m = state.map; if (!m || (m.orientation && m.orientation !== 'orthogonal')) return null;
      const objs = []; const walk = (ls) => ls.forEach((l) => { if (l.visible === false) return; if (l.type === 'objectgroup') (l.objects || []).forEach((o) => objs.push(o)); if (l.layers) walk(l.layers); }); walk(m.layers || []);
      if (!objs.length) return null;
      const cv = q('#canvas'), wrap = q('#canvasWrap'); const cr = cv.getBoundingClientRect(); const k = cr.width / (m.width * m.tilewidth || 1);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      objs.forEach((o) => {
        let x = o.x || 0, y = o.y || 0, w = o.width || 0, h = o.height || 0;
        if (o.gid) y -= h;
        const pts = o.polygon || o.polyline; if (pts) { const xs = pts.map((p) => x + p.x), ys = pts.map((p) => y + p.y); x = Math.min(...xs); y = Math.min(...ys); w = Math.max(...xs) - x; h = Math.max(...ys) - y; }
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
      });
      const pad = 10, wr = wrap.getBoundingClientRect();
      const r = { left: cr.left + x0 * k - pad, top: cr.top + y0 * k - pad, right: cr.left + x1 * k + pad, bottom: cr.top + y1 * k + pad };
      // 限制在画布可见区域内
      r.left = Math.max(r.left, wr.left + 2); r.top = Math.max(r.top, wr.top + 2); r.right = Math.min(r.right, wr.right - 2); r.bottom = Math.min(r.bottom, wr.bottom - 2);
      if (r.right - r.left < 8 || r.bottom - r.top < 8) return null;
      return { left: r.left, top: r.top, width: r.right - r.left, height: r.bottom - r.top, n: objs.length };
    }
    function objectLayerRow() {
      const m = state.map; if (!m) return null;
      const names = []; const walk = (ls) => ls.forEach((l) => { if (l.type === 'objectgroup') names.push(l.name); if (l.layers) walk(l.layers); }); walk(m.layers || []);
      if (!names.length) return null;
      return [...document.querySelectorAll('#layers .layer-row')].find((r) => names.some((n) => (r.textContent || '').includes(n))) || null;
    }
    function buildSteps() {
      const S = [];
      S.push({ t: '欢迎使用 Tiled 网页版', d: '这是一个 2D 游戏地图编辑器。接下来用一分钟认识界面，随时可以按「跳过」。之后可在「帮助 › 新手引导」再看一遍。', el: null });
      S.push({ t: '顶栏菜单', d: '文件、编辑、视图、图层、地图、世界、帮助：所有命令都在这里。窗口窄时，放不下的会收进右边「更多 ▾」。', el: () => firstVisible('.tb-menubar:not([hidden])', '.tb-more:not([hidden])') });
      S.push({ t: '常用按钮', d: '📂 打开文件夹（自动关联图块集）、💾 保存（⌘S）、↶ ↷ 撤销 / 重做。', el: () => firstVisible('.tb-primary') });
      S.push({ t: '工具', d: '「瓦片」工具画格子：⌖ 选择、✎ 铅笔、⌫ 橡皮、▓ 填充、▭ 选取。切到「对象」可以画矩形、椭圆、点、文字等对象。', el: () => firstVisible('.toolbar > .tb-tools', '.tb-more:not([hidden])') });
      S.push({ t: '图层面板', d: '地图像一摞透明纸：每张纸是一个图层。瓦片层画画面，对象层放出生点、碰撞区这类给程序读的东西。点一下图层就能在下面看到它是做什么的。', el: () => firstVisible('.layers-section') });
      const olr = objectLayerRow();
      if (olr) S.push({ t: '对象层', d: '这一层是对象层：里面的点、框、圈、文字不是画面，而是告诉游戏「出生点在哪、哪里不能走、碰到哪里触发事件」。', el: () => (visible(objectLayerRow()) ? objectLayerRow() : null) });
      S.push({ t: '图块集', d: '图块集是切好格子的素材图。点一块就成为画笔；点 ⤢ 或双击可以打开大窗预览，看得更清楚。', el: () => firstVisible('.tileset-section') });
      S.push({ t: '画布', d: '中间是地图本身。选好图块和工具，在这里点或拖着画。滚轮滚动，+ / − 缩放。如果地图属于某个 .world 世界，四周的地图会自动半透明显示，双击它们就能切换去编辑。', el: () => firstVisible('#canvasWrap') });
      if (objectRect()) S.push({ t: '地图上的对象', d: '亮起来的就是对象层里的对象：圆点是点对象（如出生点），方框 / 圆圈是区域，带字的是名字或文本。用 ⌖ 选择工具点一下，左边会显示它是什么。', rect: objectRect });
      S.push({ t: '属性面板', d: '选中图层或对象后，这里显示它的名字、位置、大小和自定义属性；上方的提示条会说明它是什么，点「详细 →」看完整解释。', el: () => firstVisible('.objects-section', '.map-section') });
      S.push({ t: '帮助', d: '不懂的地方点这个蓝色 ?（或按 F1）。每个面板标题旁的小 ? 会直接跳到对应说明。想再看一遍本引导，点旁边的 🎓 教程。祝你画得开心！', el: () => firstVisible('.help-main') });
      return S;
    }
    function startTour() {
      endTour(true); steps = buildSteps(); idx = 0;
      ov = document.createElement('div'); ov.id = 'tour'; ov.className = 'tour';
      ov.innerHTML = '<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-label="新手引导"><div class="tour-step"></div><h3></h3><p></p><div class="tour-btns"><button type="button" data-tour="skip">跳过</button><span class="tour-sp"></span><button type="button" data-tour="back">上一步</button><button type="button" data-tour="next" class="tour-next">下一步</button></div></div>';
      document.body.appendChild(ov);
      ov.querySelector('[data-tour="skip"]').onclick = () => endTour();
      ov.querySelector('[data-tour="back"]').onclick = () => go(idx - 1);
      ov.querySelector('[data-tour="next"]').onclick = () => (idx >= steps.length - 1 ? endTour() : go(idx + 1));
      addEventListener('resize', place); addEventListener('keydown', onKey, true);
      go(0);
    }
    function onKey(e) {
      if (!ov) return;
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); endTour(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); idx >= steps.length - 1 ? endTour() : go(idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(idx - 1); }
    }
    function targetRect(s) {
      if (s.rect) return s.rect();
      const el = s.el && s.el(); if (!el) return null;
      if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded(false);
      const r = el.getBoundingClientRect();
      const l = Math.max(2, r.left - 4), t = Math.max(2, r.top - 4), rr = Math.min(innerWidth - 2, r.right + 4), b = Math.min(innerHeight - 2, r.bottom + 4);
      return { left: l, top: t, width: rr - l, height: b - t };
    }
    function go(i) {
      if (!ov) return; idx = Math.max(0, Math.min(steps.length - 1, i)); const s = steps[idx];
      ov.querySelector('.tour-step').textContent = `第 ${idx + 1} / ${steps.length} 步`;
      ov.querySelector('h3').textContent = s.t; ov.querySelector('p').textContent = s.d;
      ov.querySelector('[data-tour="back"]').disabled = idx === 0;
      ov.querySelector('[data-tour="next"]').textContent = idx === steps.length - 1 ? '完成' : '下一步';
      ov.dataset.step = String(idx); place();
      ov.querySelector('[data-tour="next"]').focus();
    }
    function place() {
      if (!ov) return; const s = steps[idx], spot = ov.querySelector('.tour-spot'), card = ov.querySelector('.tour-card');
      const r = targetRect(s);
      ov.classList.toggle('tour-center', !r);
      if (r) Object.assign(spot.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      else spot.style.display = 'none';
      const cw = Math.min(340, innerWidth - 24); card.style.width = cw + 'px';
      const ch = card.offsetHeight; let x, y;
      if (!r) { x = (innerWidth - cw) / 2; y = (innerHeight - ch) / 2; }
      else {
        const cands = [
          { x: r.left, y: r.top + r.height + 12 }, { x: r.left, y: r.top - ch - 12 },
          { x: r.left + r.width + 12, y: r.top }, { x: r.left - cw - 12, y: r.top },
        ];
        const fits = (c) => c.x >= 8 && c.y >= 8 && c.x + cw <= innerWidth - 8 && c.y + ch <= innerHeight - 8;
        const c = cands.find(fits) || cands.map((c) => ({ x: Math.min(Math.max(8, c.x), innerWidth - cw - 8), y: Math.min(Math.max(8, c.y), innerHeight - ch - 8) }))
          .sort((a, b) => overlap(a) - overlap(b))[0];
        function overlap(c) { const ox = Math.max(0, Math.min(c.x + cw, r.left + r.width) - Math.max(c.x, r.left)), oy = Math.max(0, Math.min(c.y + ch, r.top + r.height) - Math.max(c.y, r.top)); return ox * oy; }
        x = c.x; y = c.y;
      }
      card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
    }
    function endTour(silent) {
      if (!ov) return; ov.remove(); ov = null; removeEventListener('resize', place); removeEventListener('keydown', onKey, true);
      if (!silent) ls.set(TOUR_DONE, '1');
    }

    /* ---------- 帮助菜单：新手引导 / 情境提示开关 ---------- */
    let hintItem = null;
    function syncMenu() { if (hintItem) hintItem.querySelector('.tb-lbl').textContent = (hintsOn() ? '✓ ' : '　') + '显示情境提示'; }
    (function addMenu(n) {
      const m = [...document.querySelectorAll('.tb-mb')].find((x) => x.dataset.label === '帮助');
      if (!m) { if (n < 80) setTimeout(() => addMenu(n + 1), 50); return; }
      const p = m.querySelector(':scope > .tb-menu-panel');
      const mk = (label, fn, action) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'tb-proxy'; b.dataset.guide = action; b.innerHTML = '<span class="tb-lbl"></span>'; b.firstChild.textContent = label; b.onclick = fn; return b; };
      p.insertBefore(mk('新手引导', startTour, 'tour'), p.children[1] || null);
      hintItem = mk('', () => setHints(!hintsOn()), 'hints'); p.insertBefore(hintItem, p.children[2] || null); syncMenu();
    })(0);

    /* ---------- 显眼的教程入口 ---------- */
    (function addEntry(n) {
      const help = document.querySelector('.topbar .help-main');
      if (!help) { if (n < 80) setTimeout(() => addEntry(n + 1), 50); return; }
      if (!document.querySelector('.tour-entry')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tour-entry'; b.dataset.guide = 'topbar-tour';
        b.title = '新手引导：一步步认识界面（随时可重看）'; b.innerHTML = '🎓<span class="tour-entry-txt"> 教程</span>';
        b.onclick = (e) => { e.stopPropagation(); startTour(); };
        help.after(b);
        if (window.TiledTopbar) window.TiledTopbar.layout();
      }
    })(0);
    const empty = document.querySelector('#emptyHint');
    if (empty && !empty.querySelector('.empty-tour')) { const a = document.createElement('a'); a.className = 'empty-tour'; a.textContent = '第一次用？看新手引导 →'; a.onclick = startTour; empty.appendChild(a); }
    api.guide = { startTour, endTour, setHints, hintsOn, objKind, isTourOpen: () => !!ov, step: () => idx, steps: () => steps, next: () => (ov && (idx >= steps.length - 1 ? endTour() : go(idx + 1))) };
    // 首次访问自动开始（自动化测试环境不自动弹出，测试里显式调用）
    if (!ls.get(TOUR_DONE) && !navigator.webdriver) setTimeout(startTour, 700);
  }
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 180);
})();

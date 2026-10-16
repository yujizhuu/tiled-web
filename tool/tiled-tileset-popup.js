/* Tiled 网页版 · 图块集大窗预览（浮动窗口，可拖动/缩放，选区与面板同步，动画播放）。 */
(function () {
  'use strict';
  function boot(api) {
    const state = api.getState(), reg = api.getTilesetRegistry(), cache = api.getImageCache();
    let win = null, cv, ctx, tabs, info, tip, zoomOut, gridBox, keepBox;
    const view = { zoom: 2, ox: 0, oy: 0, grid: true, fitted: null };
    let drag = null, raf = 0;

    const geom = (t) => ({ cols: t.columns || 1, rows: Math.ceil((t.count || 1) / (t.columns || 1)), tw: t.tileWidth, th: t.tileHeight });
    function animIndex(t, i) {
      const fr = t.tiles && t.tiles[i] && t.tiles[i].animation; if (!fr || !fr.length) return i;
      const tot = fr.reduce((n, f) => n + Math.max(1, f.duration || 100), 0); let now = Date.now() % tot, c = 0;
      for (const f of fr) { c += Math.max(1, f.duration || 100); if (now < c) return f.tileid; } return fr[fr.length - 1].tileid;
    }
    function build() {
      win = document.createElement('div'); win.id = 'tilesetPopup'; win.className = 'tsp hidden'; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', '图块集预览');
      win.innerHTML = `<header class="tsp-head"><span class="tsp-title">图块集预览</span><button type="button" class="help-q help-inline" data-help-topic="tileset-popup" title="图块集预览：大窗查看和选瓦片（点击查看详解）">?</button><span class="tsp-sp"></span><button type="button" data-tsp="close" title="关闭（Esc）">✕</button></header>
        <div class="tsp-tabs" role="tablist"></div>
        <div class="tsp-bar"><button type="button" data-tsp="out" title="缩小（−）">−</button><output class="tsp-zoom">200%</output><button type="button" data-tsp="in" title="放大（+）">＋</button><button type="button" data-tsp="fit" title="适应窗口">适应窗口</button><button type="button" data-tsp="100" title="原始大小">100%</button>
        <label title="显示网格"><input type="checkbox" data-tsp="grid" checked> 网格</label><label title="选瓦片后不关闭，方便边选边画"><input type="checkbox" data-tsp="keep" checked> 绘制时保持打开</label></div>
        <div class="tsp-body"><canvas></canvas><div class="tsp-tip" hidden></div></div>
        <footer class="tsp-info">点选或拖选瓦片作为画笔 · 滚轮缩放 · 右键/中键或空格+拖动平移</footer>`;
      document.body.appendChild(win);
      cv = win.querySelector('canvas'); ctx = cv.getContext('2d'); tabs = win.querySelector('.tsp-tabs'); info = win.querySelector('.tsp-info');
      tip = win.querySelector('.tsp-tip'); zoomOut = win.querySelector('.tsp-zoom'); gridBox = win.querySelector('[data-tsp="grid"]'); keepBox = win.querySelector('[data-tsp="keep"]');
      win.querySelector('.help-q').onclick = (e) => { e.stopPropagation(); window.TiledHelp && window.TiledHelp.open('tileset-popup'); };
      win.querySelector('[data-tsp="close"]').onclick = close;
      win.querySelector('[data-tsp="in"]').onclick = () => zoomBy(1.25);
      win.querySelector('[data-tsp="out"]').onclick = () => zoomBy(0.8);
      win.querySelector('[data-tsp="fit"]').onclick = fit;
      win.querySelector('[data-tsp="100"]').onclick = () => setZoom(1);
      gridBox.onchange = () => { view.grid = gridBox.checked; };
      // 拖动窗口
      win.querySelector('.tsp-head').addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        const r = win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
        const mv = (ev) => { place(r.left + ev.clientX - sx, r.top + ev.clientY - sy); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      new ResizeObserver(() => { sizeCanvas(); clampWin(); }).observe(win);
      addEventListener('resize', clampWin);
      const body = win.querySelector('.tsp-body');
      body.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      body.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerleave', () => { tip.hidden = true; });
      addEventListener('pointerup', onUp);
      addEventListener('keydown', (e) => {
        if (!isOpen()) return;
        if (e.key === 'Escape') { close(); e.stopPropagation(); return; }
        if (e.code === 'Space' && win.contains(document.activeElement)) { view.space = true; e.preventDefault(); }
      }, true);
      addEventListener('keyup', (e) => { if (e.code === 'Space') view.space = false; });
      win.addEventListener('keydown', (e) => { if (e.key === '+' || e.key === '=') { zoomBy(1.25); e.stopPropagation(); } if (e.key === '-') { zoomBy(0.8); e.stopPropagation(); } });
    }
    const isOpen = () => win && !win.classList.contains('hidden');
    function place(x, y) { win.style.left = x + 'px'; win.style.top = y + 'px'; clampWin(); }
    function clampWin() {
      if (!isOpen()) return; const r = win.getBoundingClientRect();
      if (r.width > innerWidth - 8) win.style.width = (innerWidth - 8) + 'px';
      if (r.height > innerHeight - 8) win.style.height = (innerHeight - 8) + 'px';
      const r2 = win.getBoundingClientRect();
      win.style.left = Math.max(4, Math.min(r2.left, innerWidth - r2.width - 4)) + 'px';
      win.style.top = Math.max(4, Math.min(r2.top, innerHeight - r2.height - 4)) + 'px';
    }
    function sizeCanvas() {
      const b = cv.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
      cv.width = Math.max(1, Math.floor(b.width * d)); cv.height = Math.max(1, Math.floor(b.height * d)); cv.style.width = b.width + 'px'; cv.style.height = b.height + 'px';
    }
    function setZoom(z, cx, cy) {
      const W = cv.clientWidth, H = cv.clientHeight; cx = cx == null ? W / 2 : cx; cy = cy == null ? H / 2 : cy;
      z = Math.max(0.25, Math.min(16, z)); const k = z / view.zoom;
      view.ox = cx - (cx - view.ox) * k; view.oy = cy - (cy - view.oy) * k; view.zoom = z; zoomOut.value = zoomOut.textContent = Math.round(z * 100) + '%';
    }
    function zoomBy(f, cx, cy) { setZoom(view.zoom * f, cx, cy); }
    function fit() {
      const t = state.tileset; if (!t) return; const g = geom(t), W = cv.clientWidth, H = cv.clientHeight;
      const z = Math.max(0.25, Math.min(16, Math.min((W - 16) / (g.cols * g.tw), (H - 16) / (g.rows * g.th))));
      view.zoom = z; view.ox = (W - g.cols * g.tw * z) / 2; view.oy = (H - g.rows * g.th * z) / 2; zoomOut.value = zoomOut.textContent = Math.round(z * 100) + '%';
    }
    function cellAt(e) {
      const t = state.tileset; if (!t) return null; const g = geom(t), r = cv.getBoundingClientRect();
      const col = Math.floor((e.clientX - r.left - view.ox) / (g.tw * view.zoom)), row = Math.floor((e.clientY - r.top - view.oy) / (g.th * view.zoom));
      if (col < 0 || row < 0 || col >= g.cols || row >= g.rows || row * g.cols + col >= t.count) return null; return { col, row };
    }
    function onDown(e) {
      if (e.button === 1 || e.button === 2 || view.space) { drag = { pan: true, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      const c = cellAt(e); if (!c) return;
      const o = state.tileSelection;
      drag = { sel: true, a: e.shiftKey && o ? { col: o.x, row: o.y } : c }; applySel(drag.a, c); cv.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (drag && drag.pan) { view.ox = drag.ox + e.clientX - drag.x; view.oy = drag.oy + e.clientY - drag.y; return; }
      const c = cellAt(e);
      if (drag && drag.sel && c) applySel(drag.a, c, true);
      showTip(e, c);
    }
    function onUp() {
      if (!drag) return; const wasSel = drag.sel; drag = null;
      if (wasSel) { api.renderAll(); api.status('已选为画笔：' + selText()); if (!keepBox.checked) close(); }
    }
    function applySel(a, b, live) {
      const t = state.tileset;
      state.tileSelection = { x: Math.min(a.col, b.col), y: Math.min(a.row, b.row), w: Math.abs(a.col - b.col) + 1, h: Math.abs(a.row - b.row) + 1 };
      state.stampData = null; state.tile = state.tileSelection.y * t.columns + state.tileSelection.x;
      if (!live) api.renderAll();
    }
    const selText = () => { const s = state.tileSelection; return s.w * s.h > 1 ? `${s.w}×${s.h} 块（起点 ${state.tile}）` : `图块 ${state.tile}`; };
    function showTip(e, c) {
      if (!c) { tip.hidden = true; return; }
      const t = state.tileset, id = c.row * t.columns + c.col, rec = t.tiles && t.tiles[id];
      const lines = [`图块 ${id} · GID ${t.firstgid + id}`];
      if (rec) {
        if (rec.type || rec.class) lines.push('类：' + (rec.class || rec.type));
        const p = rec.properties; if (p) (Array.isArray(p) ? p : Object.entries(p).map(([name, value]) => ({ name, value }))).slice(0, 8).forEach((q) => lines.push(`${q.name} = ${typeof q.value === 'object' ? JSON.stringify(q.value) : q.value}`));
        if (rec.animation && rec.animation.length) lines.push(`动画 ${rec.animation.length} 帧`);
        if (rec.terrain) lines.push('地形角：' + rec.terrain);
      }
      tip.textContent = lines.join('\n'); tip.hidden = false;
      const br = cv.parentElement.getBoundingClientRect(); let x = e.clientX - br.left + 14, y = e.clientY - br.top + 14;
      const tw = tip.offsetWidth, th = tip.offsetHeight; if (x + tw > br.width) x = Math.max(0, x - tw - 24); if (y + th > br.height) y = Math.max(0, y - th - 24);
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function renderTabs() {
      tabs.innerHTML = ''; tabs.hidden = reg.length < 2;
      reg.forEach((ts) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = ts.name || ('gid' + ts.firstgid);
        b.setAttribute('aria-selected', ts === state.tileset ? 'true' : 'false'); b.className = ts === state.tileset ? 'active' : '';
        b.onclick = () => { state.tileset = ts; state.tile = 0; state.tileSelection = { x: 0, y: 0, w: 1, h: 1 }; state.stampData = null; api.renderAll(); renderTabs(); fit(); };
        tabs.appendChild(b);
      });
    }
    let lastTs = null, lastReg = 0;
    function frame() {
      raf = 0; if (!isOpen()) return; raf = requestAnimationFrame(frame);
      if (state.tileset !== lastTs || reg.length !== lastReg) { lastTs = state.tileset; lastReg = reg.length; renderTabs(); fit(); }
      const d = devicePixelRatio || 1; ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      const t = state.tileset;
      win.querySelector('.tsp-title').textContent = t ? `图块集预览 · ${t.name || '图块集'}` : '图块集预览';
      if (!t) { ctx.fillStyle = '#8a94a6'; ctx.font = '13px sans-serif'; ctx.fillText('尚未载入图块集', 16, 28); return; }
      const img = cache.get(t.url), g = geom(t), z = view.zoom; ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#0d0f14'; ctx.fillRect(view.ox, view.oy, g.cols * g.tw * z, g.rows * g.th * z);
      for (let i = 0; i < t.count; i++) {
        const col = i % g.cols, row = Math.floor(i / g.cols), dx = view.ox + col * g.tw * z, dy = view.oy + row * g.th * z;
        if (dx > cv.clientWidth || dy > cv.clientHeight || dx + g.tw * z < 0 || dy + g.th * z < 0) continue;
        const idx = animIndex(t, i);
        if (img && img.complete) {
          const sx = (t.margin || 0) + (idx % g.cols) * (g.tw + (t.spacing || 0)), sy = (t.margin || 0) + Math.floor(idx / g.cols) * (g.th + (t.spacing || 0));
          ctx.drawImage(img, sx, sy, g.tw, g.th, dx, dy, g.tw * z, g.th * z);
        }
      }
      if (view.grid) {
        ctx.strokeStyle = 'rgba(160,180,210,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let c = 0; c <= g.cols; c++) { const x = Math.round(view.ox + c * g.tw * z) + 0.5; ctx.moveTo(x, view.oy); ctx.lineTo(x, view.oy + g.rows * g.th * z); }
        for (let r = 0; r <= g.rows; r++) { const y = Math.round(view.oy + r * g.th * z) + 0.5; ctx.moveTo(view.ox, y); ctx.lineTo(view.ox + g.cols * g.tw * z, y); }
        ctx.stroke();
      }
      const s = state.tileSelection;
      if (s) { ctx.strokeStyle = '#4ea1ff'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(78,161,255,.18)'; const x = view.ox + s.x * g.tw * z, y = view.oy + s.y * g.th * z; ctx.fillRect(x, y, s.w * g.tw * z, s.h * g.th * z); ctx.strokeRect(x + 1, y + 1, s.w * g.tw * z - 2, s.h * g.th * z - 2); }
      info.textContent = `${g.cols}×${g.rows} · ${t.count} 块 · 画笔：${selText()} · 滚轮缩放 · 右键/中键或空格+拖动平移`;
    }
    function open() {
      if (!win) build();
      win.classList.remove('hidden');
      if (!win.style.left) { const w = Math.min(720, innerWidth - 40), h = Math.min(560, innerHeight - 80); win.style.width = w + 'px'; win.style.height = h + 'px'; place((innerWidth - w) / 2, Math.max(50, (innerHeight - h) / 2)); }
      clampWin(); sizeCanvas(); lastTs = null; if (!raf) raf = requestAnimationFrame(frame);
      win.querySelector('[data-tsp="close"]').focus();
    }
    function close() { if (win) win.classList.add('hidden'); if (tip) tip.hidden = true; }

    // 入口：⤢ 按钮、双击图块集视图、视图菜单
    const head = document.querySelector('.tileset-section .section-head .section-actions');
    if (head) { const b = document.createElement('button'); b.type = 'button'; b.dataset.action = 'tileset-popup'; b.textContent = '⤢'; b.title = '大窗预览图块集（双击图块集也可打开）'; b.onclick = open; head.appendChild(b); }
    const grid = api.getEls().tileset; if (grid) grid.addEventListener('dblclick', open);
    (function addMenu(n) {
      const panel = [...document.querySelectorAll('.tb-mb')].find((m) => m.dataset.label === '视图');
      if (!panel) { if (n < 80) setTimeout(() => addMenu(n + 1), 50); return; }
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'tb-proxy'; b.title = '大窗预览图块集';
      b.innerHTML = '<span class="tb-lbl">图块集大窗预览…</span>'; b.onclick = open;
      const p = panel.querySelector(':scope > .tb-menu-panel'); p.appendChild(document.createElement('hr')).className = 'tb-menu-sep'; p.appendChild(b);
    })(0);
    api.tilesetPopup = { open, close, isOpen, view, fit, setZoom };
  }
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 160);
})();

/* Tiled 网页版 · 世界自动化（像桌面版）：
 * 用文件夹打开地图时自动找到包含它的 .world（显式列出或 patterns 匹配），自动显示相邻地图；
 * 打开 .world 直接打开原点/第一张图并显示整个世界；双击相邻地图切换编辑（保持相机世界位置，未保存改动按地图保留）。 */
(function () {
  'use strict';
  const HIDE_KEY = 'tiled-web-hide-neighbors';
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const baseOf = (p) => String(p || '').split('/').pop();
  function joinPath(dir, rel) {
    const parts = (String(rel).startsWith('/') ? [] : String(dir || '').split('/')).concat(String(rel).replace(/\\/g, '/').split('/'));
    const out = []; for (const p of parts) { if (!p || p === '.') continue; if (p === '..') { if (!out.length) return null; out.pop(); } else out.push(p); }
    return out.join('/');
  }
  // 与上游 World::allMaps 一致：恰好 2 个捕获组、非锚定匹配、multiplier 默认 1、mapWidth/Height 默认 |multiplier|
  function compilePattern(p) {
    let re; try { re = new RegExp(String(p.regexp || '')); } catch (_) { return null; }
    const caps = new RegExp(re.source + '|').exec('').length - 1;
    const int = (v, d) => (v == null || !Number.isInteger(Number(v)) ? d : Number(v));
    const c = { re, mx: int(p.multiplierX, 1), my: int(p.multiplierY, 1), ox: int(p.offsetX, 0), oy: int(p.offsetY, 0) };
    c.mw = int(p.mapWidth, Math.abs(c.mx)); c.mh = int(p.mapHeight, Math.abs(c.my));
    return caps === 2 && c.mx && c.my && c.mw > 0 && c.mh > 0 ? c : null;
  }
  const qtInt = (s) => (/^\s*[+-]?\d+\s*$/.test(String(s)) ? parseInt(s, 10) : 0);

  function boot(api) {
    const state = api.getState(), F = api.features || (api.features = {});
    const wrap = document.querySelector('#canvasWrap'), cvs = document.querySelector('#canvas');
    state.worldSession = state.worldSession || new Map(); // 路径 → 未保存的地图副本（按地图保留改动）
    let auto = null; // { fs, worldPath, candidates:[{path, world}], mapPath }

    /* ---------- 扫描 .world ---------- */
    function entriesOf(world, worldPath, allFiles) {
      const wdir = dirOf(worldPath), out = [];
      (world.maps || []).forEach((m) => { const p = joinPath(wdir, m.fileName); if (p) out.push({ path: p, e: m }); });
      const pre = wdir ? wdir + '/' : '';
      const seen = new Set(out.map((x) => x.path));
      (world.patterns || []).forEach((pat) => {
        const c = compilePattern(pat); if (!c) return;
        allFiles.forEach((f) => {
          if (!f.startsWith(pre) || f.slice(pre.length).includes('/') || seen.has(f)) return;
          const name = f.slice(pre.length); const m = c.re.exec(name); if (!m) return;
          seen.add(f); out.push({ path: f, e: { fileName: name, x: qtInt(m[1]) * c.mx + c.ox, y: qtInt(m[2]) * c.my + c.oy, width: c.mw, height: c.mh, fromPattern: true } });
        });
      });
      return out;
    }
    async function findWorlds(fs, mapPath) {
      const all = await fs.list();
      const dirs = []; let d = dirOf(mapPath); for (;;) { dirs.push(d); if (!d) break; d = dirOf(d); }
      const worlds = all.filter((p) => /\.world$/i.test(p) && dirs.includes(dirOf(p)))
        .sort((a, b) => dirs.indexOf(dirOf(a)) - dirs.indexOf(dirOf(b)) || a.localeCompare(b));
      const hits = [];
      for (const wp of worlds) {
        const got = await fs.getFile(wp); if (!got) continue;
        let w; try { w = JSON.parse(await got.file.text()); } catch (_) { continue; }
        const ents = entriesOf(w, wp, all);
        if (ents.some((x) => x.path === mapPath)) hits.push({ path: wp, world: w, ents });
      }
      return hits;
    }
    async function applyWorld(fs, cand, mapPath) {
      const wdir = dirOf(cand.path);
      const world = JSON.parse(JSON.stringify(cand.world));
      // 地图条目改成相对 .world 的文件名（patterns 结果并入 maps，导出时带 fromPattern 不写回）
      world.maps = cand.ents.map((x) => Object.assign({}, x.e, { fileName: x.e.fileName, _path: x.path }));
      world.patterns = [];
      world._source = cand.world;
      state.world = world; state.worldPath = cand.path;
      state.worldFiles = new Map(); state.worldMapCache = new Map();
      for (const x of cand.ents) {
        const got = await fs.getFile(x.path); if (!got) continue;
        state.worldFiles.set(x.e.fileName, got.file); state.worldFiles.set(baseOf(x.path), got.file);
        if (!state.assetFileIndex) state.assetFileIndex = new Map();
        if (!state.assetFileIndex.has(baseOf(x.path))) state.assetFileIndex.set(baseOf(x.path), got.file);
        if (x.path === mapPath) continue;
        const sess = state.worldSession.get(x.path);
        try { state.worldMapCache.set(baseOf(x.path), sess || (/\.tmx$/i.test(x.path) ? api.parseTmxAdvanced(await got.file.text()) : JSON.parse(await got.file.text()))); } catch (_) {}
      }
      state.worldView = ls.get(HIDE_KEY) !== '1';
      if (F.renderWorldPanel) F.renderWorldPanel();
      void wdir;
    }
    function curEntry() { const w = state.world; return w && (w.maps || []).find((e) => baseOf(e.fileName) === baseOf(state.mapFileName)); }
    function extentOf(e) {
      const mm = baseOf(e.fileName) === baseOf(state.mapFileName) ? state.map : state.worldMapCache.get(baseOf(e.fileName));
      const w = e.width || (mm ? mm.width * mm.tilewidth : 0), h = e.height || (mm ? mm.height * mm.tileheight : 0);
      let x = e.x || 0, y = e.y || 0;
      if (mm && mm.infinite) {
        const xs = [], ys = []; (mm.layers || []).forEach((l) => (l.chunks || []).forEach((c) => { xs.push(c.x, c.x + c.width); ys.push(c.y, c.y + c.height); }));
        if (xs.length) return { x: x + Math.min(...xs) * mm.tilewidth, y: y + Math.min(...ys) * mm.tileheight, w: (Math.max(...xs) - Math.min(...xs)) * mm.tilewidth, h: (Math.max(...ys) - Math.min(...ys)) * mm.tileheight };
      }
      return { x, y, w: w || 320, h: h || 224 };
    }
    function worldExtent() {
      const ex = (state.world.maps || []).map(extentOf);
      const x0 = Math.min(...ex.map((r) => r.x)), y0 = Math.min(...ex.map((r) => r.y));
      return { x: x0, y: y0, w: Math.max(...ex.map((r) => r.x + r.w)) - x0, h: Math.max(...ex.map((r) => r.y + r.h)) - y0 };
    }
    // 屏幕坐标 ↔ 世界坐标（以当前地图画布为基准）
    function toWorld(cx, cy) { const e = curEntry(); const r = cvs.getBoundingClientRect(), s = state.zoom || 1; return { x: (e ? e.x || 0 : 0) + (cx - r.left) / s, y: (e ? e.y || 0 : 0) + (cy - r.top) / s }; }
    function centerOn(wx, wy) {
      const e = curEntry(); if (!e) return;
      const r = cvs.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), s = state.zoom || 1;
      const sx = r.left + (wx - (e.x || 0)) * s, sy = r.top + (wy - (e.y || 0)) * s;
      wrap.scrollLeft += sx - (wr.left + wr.width / 2); wrap.scrollTop += sy - (wr.top + wr.height / 2);
    }
    const redraw = () => { api.draw(); if (F.paintWorldBackdrop) F.paintWorldBackdrop(); };
    function frame(mode) {
      if (!state.world || !curEntry()) return;
      redraw();
      const wr = wrap.getBoundingClientRect();
      if (mode === 'world') {
        const we = worldExtent();
        const z = Math.max(25, Math.min(400, Math.floor(Math.min((wr.width - 64) / we.w, (wr.height - 64) / we.h) * 100)));
        api.applyZoomPercent(z); redraw();
        requestAnimationFrame(() => { centerOn(we.x + we.w / 2, we.y + we.h / 2); });
      } else {
        const ce = extentOf(curEntry());
        // 当前地图放得下时显示一圈邻图：缩放到「当前图 + 约半张邻图」
        const z = Math.max(25, Math.min(400, Math.floor(Math.min((wr.width - 64) / (ce.w * 1.6), (wr.height - 64) / (ce.h * 1.6)) * 100)));
        if (z < (state.zoom || 1) * 100) { api.applyZoomPercent(z); redraw(); }
        requestAnimationFrame(() => centerOn(ce.x + ce.w / 2, ce.y + ce.h / 2));
      }
    }

    /* ---------- 打开后自动识别 ---------- */
    window.__tiledAfterFolderOpen = async function (fs, mapPath) {
      if (/\.world$/i.test(mapPath)) {
        const got = await fs.getFile(mapPath); let w; try { w = JSON.parse(await got.file.text()); } catch (_) { return; }
        const ents = entriesOf(w, mapPath, await fs.list());
        const pick = ents.find((x) => !(x.e.x || 0) && !(x.e.y || 0)) || ents[0];
        if (!pick) return;
        state._preferWorld = mapPath; state._worldFrame = 'world';
        await api.folder.openFromFS(fs, pick.path);
        return;
      }
      const prefer = state._preferWorld; state._preferWorld = null;
      const mode = state._worldFrame || 'map'; state._worldFrame = null;
      const switching = state._worldSwitching; state._worldSwitching = null;
      let hits;
      if (switching && auto && auto.fs === fs && auto.cands.length) hits = auto.cands;
      else hits = await findWorlds(fs, mapPath);
      if (!hits.length) { if (state.world && state.world._source) { state.world = null; state.worldPath = null; } auto = null; renderCrumb(); redraw(); return; }
      let cand = hits.find((h) => h.path === (prefer || (switching && auto && auto.worldPath))) || hits[0];
      auto = { fs, cands: hits, worldPath: cand.path, mapPath };
      const sess = state.worldSession.get(mapPath);
      if (sess) { api.setMap(sess); state.mapFileName = baseOf(mapPath); }
      await applyWorld(fs, cand, mapPath);
      renderCrumb();
      if (switching) { redraw(); requestAnimationFrame(() => centerOn(switching.x, switching.y)); }
      else frame(mode);
      api.status(`世界：${baseOf(cand.path)} › ${baseOf(mapPath)}（自动显示 ${state.world.maps.length - 1} 张相邻地图${hits.length > 1 ? `，共 ${hits.length} 个世界匹配` : ''}）`);
    };

    /* ---------- 切换到相邻地图 ---------- */
    async function switchTo(entry) {
      if (!auto) return;
      const path = entry._path || joinPath(dirOf(auto.worldPath), entry.fileName);
      const wr = wrap.getBoundingClientRect(); const c = toWorld(wr.left + wr.width / 2, wr.top + wr.height / 2);
      if (state.history && state.history.length && auto.mapPath) state.worldSession.set(auto.mapPath, state.map); // 保留未保存的改动
      state._worldSwitching = c;
      await api.folder.openFromFS(auto.fs, path);
    }
    function hitNeighbor(ev) {
      if (!state.world || !state.worldView || !auto) return null;
      const p = toWorld(ev.clientX, ev.clientY), cur = curEntry();
      const ce = cur && extentOf(cur); if (ce && p.x >= ce.x && p.y >= ce.y && p.x < ce.x + ce.w && p.y < ce.y + ce.h) return null;
      return (state.world.maps || []).filter((e) => e !== cur).map((e) => ({ e, r: extentOf(e) })).find(({ r }) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h) || null;
    }
    const hl = document.createElement('div'); hl.className = 'world-hover'; hl.hidden = true; wrap.appendChild(hl);
    wrap.addEventListener('mousemove', (ev) => {
      const h = hitNeighbor(ev);
      if (!h) { hl.hidden = true; wrap.classList.remove('world-hovering'); return; }
      const e = curEntry(), r = cvs.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), s = state.zoom || 1;
      const left = r.left - wr.left + wrap.scrollLeft + (h.r.x - (e.x || 0)) * s, top = r.top - wr.top + wrap.scrollTop + (h.r.y - (e.y || 0)) * s;
      Object.assign(hl.style, { left: left + 'px', top: top + 'px', width: h.r.w * s + 'px', height: h.r.h * s + 'px' });
      const dirty = state.worldSession.has(h.e._path) ? ' •未保存' : '';
      hl.dataset.label = baseOf(h.e.fileName) + dirty + ' · 双击切换编辑'; hl.dataset.file = baseOf(h.e.fileName);
      hl.hidden = false; wrap.classList.add('world-hovering');
    });
    wrap.addEventListener('mouseleave', () => { hl.hidden = true; });
    wrap.addEventListener('dblclick', (ev) => { const h = hitNeighbor(ev); if (h) { ev.preventDefault(); ev.stopPropagation(); hl.hidden = true; switchTo(h.e); } }, true);

    /* ---------- 面包屑 ---------- */
    const crumb = document.createElement('span'); crumb.className = 'world-crumb'; crumb.hidden = true;
    const footer = document.querySelector('.canvas-footer'); if (footer) footer.appendChild(crumb);
    function renderCrumb() {
      if (!state.world || !auto || !curEntry()) { crumb.hidden = true; crumb.textContent = ''; return; }
      crumb.hidden = false; crumb.innerHTML = '';
      const lab = document.createElement('span'); lab.textContent = '世界：'; crumb.appendChild(lab);
      if (auto.cands.length > 1) {
        const sel = document.createElement('select'); sel.title = '有多个世界包含此地图，选择要使用的世界';
        auto.cands.forEach((c) => { const o = document.createElement('option'); o.value = c.path; o.textContent = baseOf(c.path); if (c.path === auto.worldPath) o.selected = true; sel.appendChild(o); });
        sel.onchange = async () => { const c = auto.cands.find((x) => x.path === sel.value); auto.worldPath = c.path; await applyWorld(auto.fs, c, auto.mapPath); renderCrumb(); frame('map'); };
        crumb.appendChild(sel);
      } else { const w = document.createElement('b'); w.textContent = baseOf(auto.worldPath); crumb.appendChild(w); }
      const m = document.createElement('span'); m.textContent = ' › ' + baseOf(state.mapFileName); crumb.appendChild(m);
      const n = state.worldSession.size; if (n) { const d = document.createElement('span'); d.className = 'world-dirty'; d.textContent = ` （${n} 张图有未保存改动，已按地图保留）`; crumb.appendChild(d); }
      const fit = document.createElement('a'); fit.href = '#'; fit.textContent = '看全图'; fit.title = '缩放到整个世界'; fit.onclick = (e) => { e.preventDefault(); frame('world'); }; crumb.appendChild(fit);
    }
    // 保存后不再标记该图未保存
    const origSave = api.save; if (origSave) api.save = function () { const r = origSave.apply(this, arguments); if (auto) { state.worldSession.delete(auto.mapPath); renderCrumb(); } return r; };

    window.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && auto) { state.worldSession.delete(auto.mapPath); setTimeout(renderCrumb, 0); } });
    /* ---------- 视图 › 显示相邻地图（记住）；去掉手动开关 ---------- */
    function setShow(on) { ls.set(HIDE_KEY, on ? '0' : '1'); state.worldView = on; redraw(); syncItem(); }
    let item = null;
    function syncItem() { if (item) item.querySelector('.tb-lbl').textContent = (ls.get(HIDE_KEY) !== '1' ? '✓ ' : '　') + '显示相邻地图（世界）'; }
    (function addMenu(n) {
      const m = [...document.querySelectorAll('.tb-mb')].find((x) => x.dataset.label === '视图');
      if (!m) { if (n < 80) setTimeout(() => addMenu(n + 1), 50); return; }
      const old = document.querySelector('[data-action="world-view-toggle"]'); if (old) old.hidden = true;
      item = document.createElement('button'); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.className = 'tb-proxy'; item.dataset.worldShow = '1';
      item.innerHTML = '<span class="tb-lbl"></span>'; item.onclick = () => setShow(ls.get(HIDE_KEY) === '1');
      const p = m.querySelector(':scope > .tb-menu-panel'); p.appendChild(item); syncItem();
    })(0);
    api.worldAuto = { findWorlds, switchTo, frame, setShow, current: () => auto, curEntry, extentOf };
  }
  const start = () => (window.TiledApp && window.TiledApp.folder ? setTimeout(() => boot(window.TiledApp), 60) : setTimeout(start, 50));
  start();
})();

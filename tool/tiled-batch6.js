/*! Tiled 1.2.4 batch6: preferences (localStorage), world shared-camera editor,
 * object templates (.tx/json), rule-session tileset, misc editor prefs */
(function () {
  'use strict';

  const PREFS_KEY = 'tiled-web-prefs-v1';
  const RECENT_KEY = 'tiled-web-recent-v1';

  const DEFAULT_PREFS = {
    showGrid: true,
    gridColor: '#a0b4d2',
    gridFine: 4,
    snapToGrid: false,
    snapToFineGrid: false,
    snapToPixels: false,
    highlightCurrentLayer: false,
    showTileObjectOutlines: true,
    showTileAnimations: true,
    objectLabels: 'all', // all | selected | none
    objectLineWidth: 2,
    autoMapWhileDrawing: false,
    layerDataFormat: 'csv', // csv | base64 | base64zlib
    embedTilesetsOnExport: false,
    detachTemplatesOnExport: false,
    exportFormat: 'tmj',
    wheelZooms: true,
    language: 'zh_CN'
  };

  function boot(api) {
    if (!api || api._batch6) return;
    api._batch6 = true;
    const state = api.getState();
    const els = api.getEls();
    const F = api.features || (api.features = {});
    const $ = (s) => document.querySelector(s);

    /* ---------- Preferences ---------- */
    function loadPrefs() {
      try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return Object.assign({}, DEFAULT_PREFS);
        return Object.assign({}, DEFAULT_PREFS, JSON.parse(raw));
      } catch (_) {
        return Object.assign({}, DEFAULT_PREFS);
      }
    }
    function savePrefs() {
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch (_) {}
      applyPrefsToRuntime();
    }
    function loadRecent() {
      try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
    }
    function saveRecent(list) {
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch (_) {}
    }

    state.prefs = loadPrefs();
    state.recentFiles = loadRecent();
    state.templates = state.templates || [];
    state.selectedTemplate = null;
    state.insertTemplateMode = false;
    state.worldEditor = state.worldEditor || {
      enabled: false,
      panX: 0,
      panY: 0,
      originX: 0,
      originY: 0
    };

    window.__tiledPrefs = () => state.prefs;
    window.__tiledAddRecent = (name) => {
      if (!name) return;
      let list = loadRecent().filter((x) => x !== name);
      list.unshift(name);
      state.recentFiles = list.slice(0, 12);
      saveRecent(state.recentFiles);
    };

    function applyPrefsToRuntime() {
      const p = state.prefs;
      state.grid = !!p.showGrid;
      if (p.autoMapWhileDrawing && !state.liveAutomap) {
        state.liveAutomap = true;
        document.querySelectorAll('[data-action="toggle-live-automap"]').forEach((b) => b.classList.add('active'));
      }
      api.draw();
    }

    function renderPrefsForm() {
      const form = $('#prefsForm');
      if (!form) return;
      const p = state.prefs;
      form.innerHTML = '';
      const fields = [
        ['showGrid', '显示网格', 'check'],
        ['gridColor', '网格颜色', 'color'],
        ['gridFine', '细网格细分', 'number'],
        ['snapToGrid', '吸附到网格', 'check'],
        ['snapToFineGrid', '吸附到细网格', 'check'],
        ['snapToPixels', '吸附到像素', 'check'],
        ['highlightCurrentLayer', '高亮当前图层', 'check'],
        ['showTileObjectOutlines', '图块对象描边', 'check'],
        ['showTileAnimations', '图块动画', 'check'],
        ['objectLabels', '对象标签', 'select', ['all', 'selected', 'none']],
        ['objectLineWidth', '对象线宽', 'number'],
        ['autoMapWhileDrawing', '绘制时自动地图', 'check'],
        ['layerDataFormat', '默认图层数据格式', 'select', ['csv', 'base64', 'base64zlib']],
        ['embedTilesetsOnExport', '导出时嵌入图块集', 'check'],
        ['detachTemplatesOnExport', '导出时分离模板实例', 'check'],
        ['exportFormat', '默认导出格式', 'select', ['tmj', 'tmx', 'csv', 'png']],
        ['wheelZooms', '滚轮缩放', 'check'],
        ['language', '语言', 'text']
      ];
      fields.forEach(([key, label, kind, opts]) => {
        const lab = document.createElement('label');
        if (kind === 'check' || key === 'language') lab.classList.add('wide');
        lab.textContent = label;
        let input;
        if (kind === 'check') {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !!p[key];
          input.onchange = () => { p[key] = input.checked; savePrefs(); };
        } else if (kind === 'color') {
          input = document.createElement('input');
          input.type = 'color';
          let c = p[key] || '#a0b4d2';
          if (c.startsWith('rgba') || c.startsWith('rgb')) c = '#a0b4d2';
          input.value = c.slice(0, 7);
          input.onchange = () => { p[key] = input.value; savePrefs(); };
        } else if (kind === 'select') {
          input = document.createElement('select');
          (opts || []).forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o; opt.textContent = o;
            if (p[key] === o) opt.selected = true;
            input.appendChild(opt);
          });
          input.onchange = () => { p[key] = input.value; savePrefs(); };
        } else {
          input = document.createElement('input');
          input.type = kind === 'number' ? 'number' : 'text';
          input.value = p[key] == null ? '' : p[key];
          if (key === 'language') { input.value = 'zh_CN'; input.disabled = true; }
          input.onchange = () => {
            p[key] = kind === 'number' ? Number(input.value) : input.value;
            savePrefs();
          };
        }
        lab.appendChild(input);
        form.appendChild(lab);
      });
      renderRecentList();
    }

    function renderRecentList() {
      const list = $('#recentFilesList');
      if (!list) return;
      list.innerHTML = '';
      (state.recentFiles || []).forEach((name) => {
        const row = document.createElement('div');
        row.className = 'prop-row';
        row.textContent = name;
        list.appendChild(row);
      });
      if (!(state.recentFiles || []).length) list.textContent = '（空）';
    }

    applyPrefsToRuntime();

    /* ---------- Object templates ---------- */
    function parseTemplateJson(text, fileName) {
      const data = JSON.parse(text);
      if (data.type && data.type !== 'template') {
        // still accept if has object
      }
      return {
        name: fileName,
        fileName,
        tileset: data.tileset || null,
        object: data.object || data,
        format: 'json'
      };
    }

    function parseTemplateXml(text, fileName) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const root = doc.querySelector('template');
      if (!root) throw new Error('非 template 根元素');
      const objNode = root.querySelector(':scope > object');
      if (!objNode) throw new Error('模板缺少 object');
      // Reuse xml object parser via temporary map parse if available
      const object = {
        id: Number(objNode.getAttribute('id') || 1),
        name: objNode.getAttribute('name') || '',
        type: objNode.getAttribute('type') || '',
        x: Number(objNode.getAttribute('x') || 0),
        y: Number(objNode.getAttribute('y') || 0),
        width: Number(objNode.getAttribute('width') || 0),
        height: Number(objNode.getAttribute('height') || 0),
        rotation: Number(objNode.getAttribute('rotation') || 0),
        visible: objNode.getAttribute('visible') !== '0',
        properties: {}
      };
      if (objNode.getAttribute('gid')) object.gid = Number(objNode.getAttribute('gid')) >>> 0;
      if (objNode.querySelector(':scope > ellipse')) object.ellipse = true;
      if (objNode.querySelector(':scope > point')) object.point = true;
      const poly = objNode.querySelector(':scope > polygon');
      const line = objNode.querySelector(':scope > polyline');
      const textNode = objNode.querySelector(':scope > text');
      if (poly) object.polygon = (poly.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => {
        const [x, y] = v.split(',').map(Number); return { x, y };
      });
      if (line) object.polyline = (line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => {
        const [x, y] = v.split(',').map(Number); return { x, y };
      });
      if (textNode) object.text = textNode.textContent || '';
      const props = objNode.querySelectorAll(':scope > properties > property');
      props.forEach((pr) => {
        const n = pr.getAttribute('name');
        if (!n) return;
        let val = pr.getAttribute('value');
        if (val == null) val = pr.textContent || '';
        const t = pr.getAttribute('type') || 'string';
        if (t === 'bool') val = val === 'true' || val === '1';
        else if (t === 'int') val = parseInt(val, 10) || 0;
        else if (t === 'float') val = parseFloat(val) || 0;
        object.properties[n] = val;
        if (!object.properties.__propertyTypes) object.properties.__propertyTypes = {};
        object.properties.__propertyTypes[n] = t;
      });
      let tileset = null;
      const tsNode = root.querySelector(':scope > tileset');
      if (tsNode) {
        tileset = {
          firstgid: Number(tsNode.getAttribute('firstgid') || 1),
          source: tsNode.getAttribute('source') || '',
          name: tsNode.getAttribute('name') || ''
        };
      }
      return { name: fileName, fileName, object, tileset, format: 'xml' };
    }

    function addTemplatesFromFiles(files) {
      return Promise.all(Array.from(files || []).map(async (f) => {
        const text = await f.text();
        let tpl;
        if (/\.tx$/i.test(f.name) || text.trim().startsWith('<')) tpl = parseTemplateXml(text, f.name);
        else tpl = parseTemplateJson(text, f.name);
        const idx = state.templates.findIndex((t) => t.fileName === f.name);
        if (idx >= 0) state.templates[idx] = tpl;
        else state.templates.push(tpl);
        return tpl;
      }));
    }

    function renderTemplatesPanel() {
      const list = $('#templateList');
      if (!list) return;
      list.innerHTML = '';
      state.templates.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t.name || t.fileName;
        if (state.selectedTemplate === t) b.classList.add('active');
        b.onclick = () => {
          state.selectedTemplate = t;
          previewTemplate(t);
          renderTemplatesPanel();
        };
        list.appendChild(b);
      });
      if (!state.templates.length) list.textContent = '未载入模板';
      if (state.selectedTemplate) previewTemplate(state.selectedTemplate);
    }

    function previewTemplate(t) {
      const canvas = $('#templatePreview');
      const meta = $('#templateMeta');
      if (!canvas || !t) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const o = t.object || {};
      ctx.strokeStyle = '#ffc857';
      ctx.strokeRect(20, 20, Math.max(8, o.width || 32), Math.max(8, o.height || 32));
      ctx.fillStyle = '#e8eaed';
      ctx.font = '12px sans-serif';
      ctx.fillText((o.name || o.type || 'object') + (o.gid ? ' gid=' + o.gid : ''), 20, 16);
      if (meta) meta.textContent = (t.fileName || '') + ' · ' + (t.format || '');
    }

    function placeTemplateInstance(wx, wy) {
      const t = state.selectedTemplate;
      if (!t || !t.object) { api.status('请先选择模板'); return; }
      const layer = api.activeLayer();
      if (!layer || layer.type !== 'objectgroup') {
        api.status('请在对象层上插入模板');
        return;
      }
      api.snapshot();
      const o = JSON.parse(JSON.stringify(t.object));
      delete o.id;
      const ids = (layer.objects || []).map((x) => x.id || 0);
      o.id = Math.max(0, ...ids) + 1;
      const snapped = api.snapWorldPixel ? api.snapWorldPixel(wx, wy) : { x: wx, y: wy };
      o.x = snapped.x;
      o.y = snapped.y;
      o.template = t.fileName;
      if (!layer.objects) layer.objects = [];
      layer.objects.push(o);
      state.selectedObject = o;
      api.renderAll();
      api.status('已插入模板实例：' + t.fileName);
    }

    function saveSelectedAsTemplate() {
      const o = state.selectedObject;
      if (!o) { api.status('请先选中对象'); return; }
      const clone = JSON.parse(JSON.stringify(o));
      delete clone.template;
      const data = { type: 'template', object: clone };
      if (clone.gid && state.tileset) {
        data.tileset = { firstgid: state.tileset.firstgid, name: state.tileset.name, source: state.tileset.source || '' };
      }
      const name = (clone.name || 'template') + '.tj';
      api.download(name, 'application/json', JSON.stringify(data, null, 2));
      // also XML .tx
      const objXml = api.objectXml(clone, '  ');
      const tx = '<?xml version="1.0" encoding="UTF-8"?>\n<template>\n' + objXml + '</template>\n';
      api.download((clone.name || 'template') + '.tx', 'application/xml', tx);
      const tpl = { name, fileName: name, object: clone, tileset: data.tileset || null, format: 'json' };
      state.templates.push(tpl);
      state.selectedTemplate = tpl;
      renderTemplatesPanel();
      api.status('已导出模板 JSON + TX');
    }

    function detachSelectedTemplate() {
      const o = state.selectedObject;
      if (!o || !o.template) { api.status('选中对象不是模板实例'); return; }
      api.snapshot();
      delete o.template;
      api.renderAll();
      api.status('已分离模板实例');
    }

    /* ---------- Rule editor dedicated tileset ---------- */
    state.ruleTileset = null;
    async function attachRuleTileset(file) {
      if (!file) return;
      const re = state.ruleEdit;
      if (!re) { api.status('请先打开规则编辑器'); return; }
      if (file.type.startsWith('image/') || /\.(png|gif|jpe?g|bmp|webp)$/i.test(file.name)) {
        const url = await api.readImage(file);
        const img = api.getImageCache().get(url);
        const tw = re.map.tilewidth || 32, th = re.map.tileheight || 32;
        const columns = Math.max(1, Math.floor(img.width / tw));
        const count = columns * Math.floor(img.height / th);
        state.ruleTileset = {
          name: file.name, url, tileWidth: tw, tileHeight: th, columns, count, firstgid: 1, tiles: {}
        };
        // also register into session so drawGidPreview can resolve if firstgid matches
        // Keep separate: patch paint GID to use rule tileset
        re.map.tilesets = [{
          firstgid: 1, name: file.name, tilewidth: tw, tileheight: th,
          tilecount: count, columns, image: file.name, imagewidth: img.width, imageheight: img.height
        }];
        // Temporarily put on registry for preview
        api.registerTileset({
          name: 'rule:' + file.name, tileWidth: tw, tileHeight: th, columns, count,
          firstgid: 1, url, tiles: {}
        });
        state.tileset = state.ruleTileset;
        api.status('规则会话图块集：' + file.name);
        if (F.drawRuleCanvasEnhanced) F.drawRuleCanvasEnhanced();
        else api.renderAll();
      } else {
        // tsx/tsj — open via loadTiles
        await api.loadTiles([file]);
        state.ruleTileset = state.tileset;
        api.status('已载入规则图块集文件');
        if (F.drawRuleCanvasEnhanced) F.drawRuleCanvasEnhanced();
      }
    }

    /* ---------- World shared-camera editor ---------- */
    function currentWorldEntry() {
      if (!state.world || !state.mapFileName) return null;
      const base = String(state.mapFileName).split('/').pop();
      return (state.world.maps || []).find((m) => String(m.fileName).split('/').pop() === base) || null;
    }

    function worldBounds() {
      const maps = (state.world && state.world.maps) || [];
      if (!maps.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      maps.forEach((e) => {
        const cached = state.worldMapCache && state.worldMapCache.get(String(e.fileName).split('/').pop());
        const w = e.width || (cached ? cached.width * cached.tilewidth : (state.map ? state.map.width * state.map.tilewidth : 640));
        const h = e.height || (cached ? cached.height * cached.tileheight : (state.map ? state.map.height * state.map.tileheight : 640));
        const x = e.x || 0, y = e.y || 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      });
      if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
      return { minX, minY, maxX, maxY };
    }

    async function ensureAllWorldMapsLoaded() {
      if (!state.world) return;
      for (const e of state.world.maps || []) {
        if (F.ensureWorldMapCached) await F.ensureWorldMapCached(e.fileName);
        else {
          const base = String(e.fileName).split('/').pop();
          if (state.worldMapCache && state.worldMapCache.has(base)) continue;
          const file = (state.worldFiles && state.worldFiles.get(base)) || (state.assetFileIndex && state.assetFileIndex.get(base));
          if (!file) continue;
          try {
            const text = await file.text();
            const map = /\.tmx$/i.test(file.name) ? api.parseTmxAdvanced(text) : JSON.parse(text);
            if (!state.worldMapCache) state.worldMapCache = new Map();
            state.worldMapCache.set(base, map);
          } catch (_) {}
        }
      }
    }

    function syncActiveMapToCache() {
      if (!state.map || !state.mapFileName) return;
      const base = String(state.mapFileName).split('/').pop();
      if (!state.worldMapCache) state.worldMapCache = new Map();
      state.worldMapCache.set(base, state.map);
    }

    function enableWorldEditor(on) {
      state.worldEditor.enabled = !!on;
      state._worldDraw = state.worldEditor;
      if (on) {
        state.worldView = true;
        ensureAllWorldMapsLoaded().then(() => {
          fitWorldCamera();
          api.renderAll();
          api.status('World 共享相机编辑：开 — 点击地图激活，中键/空格拖拽平移，Alt 拖拽改坐标');
        });
      } else {
        api.status('World 共享相机编辑：关');
        api.renderAll();
      }
    }

    function fitWorldCamera() {
      const b = worldBounds();
      state.worldEditor.originX = b.minX;
      state.worldEditor.originY = b.minY;
      state.worldEditor.panX = 0;
      state.worldEditor.panY = 0;
      const s = state.zoom || 1;
      const w = Math.max(64, (b.maxX - b.minX) * s + 80);
      const h = Math.max(64, (b.maxY - b.minY) * s + 80);
      els.canvas.width = Math.min(8000, Math.ceil(w));
      els.canvas.height = Math.min(8000, Math.ceil(h));
    }

    function drawMapAtWorld(ctx, map, entry, originX, originY, s, active) {
      if (!map) return;
      const dx = ((entry.x || 0) - originX) * s + (state.worldEditor.panX || 0);
      const dy = ((entry.y || 0) - originY) * s + (state.worldEditor.panY || 0);
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = active ? 1 : 0.55;
      const tw = map.tilewidth || 32, th = map.tileheight || 32;
      const drawLayerLocal = (layers) => {
        for (const l of layers || []) {
          if (!l || l.visible === false) continue;
          if (l.type === 'group') { drawLayerLocal(l.layers); continue; }
          if (l.type === 'tilelayer') {
            if (map.infinite && Array.isArray(l.chunks)) {
              for (const c of l.chunks) {
                for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
                  const gid = c.data[y * c.width + x] || 0;
                  if (!gid) continue;
                  blitGid(ctx, gid, (c.x + x) * tw * s, (c.y + y) * th * s, tw * s, th * s);
                }
              }
            } else if (l.data) {
              for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
                const gid = l.data[y * map.width + x] || 0;
                if (!gid) continue;
                blitGid(ctx, gid, x * tw * s, y * th * s, tw * s, th * s);
              }
            }
          } else if (l.type === 'objectgroup') {
            (l.objects || []).forEach((o) => {
              ctx.strokeStyle = active ? '#66a8ff' : '#94a3b8';
              ctx.strokeRect((o.x || 0) * s, (o.y || 0) * s, Math.max(2, (o.width || 8) * s), Math.max(2, (o.height || 8) * s));
            });
          }
        }
      };
      drawLayerLocal(map.layers);
      // bounds
      const mw = (entry.width || map.width * tw) * s;
      const mh = (entry.height || map.height * th) * s;
      ctx.strokeStyle = active ? '#60a5fa' : 'rgba(160,200,255,0.5)';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(0, 0, mw, mh);
      ctx.fillStyle = active ? '#93c5fd' : '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(String(entry.fileName || '').split('/').pop(), 4, 14);
      ctx.restore();
    }

    function blitGid(ctx, gid, dx, dy, dw, dh) {
      const clear = api.clearGid(gid >>> 0);
      const ts = api.tilesetForGid(clear);
      if (!ts || !ts.url) {
        ctx.fillStyle = '#345';
        ctx.fillRect(dx, dy, dw, dh);
        return;
      }
      const img = api.getImageCache().get(ts.url);
      if (!img) return;
      const local = clear - ts.firstgid;
      const cols = ts.columns || 1;
      const tW = ts.tileWidth || 32, tH = ts.tileHeight || 32;
      const sx = (ts.margin || 0) + (local % cols) * (tW + (ts.spacing || 0));
      const sy = (ts.margin || 0) + Math.floor(local / cols) * (tH + (ts.spacing || 0));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, tW, tH, dx, dy, dw, dh);
    }

    // Override after-draw: when world editor on, redraw whole shared canvas
    const _prevAfter = window.__tiledAfterDraw;
    window.__tiledAfterDraw = function (ctx, m) {
      if (!state.worldEditor.enabled || !state.world) {
        if (_prevAfter) _prevAfter(ctx, m);
        return;
      }
      // Full world composite (replace normal single-map look by painting over)
      syncActiveMapToCache();
      const b = worldBounds();
      const s = state.zoom || 1;
      const we = state.worldEditor;
      we.originX = b.minX;
      we.originY = b.minY;
      // Ensure canvas size
      const needW = Math.min(8000, Math.ceil((b.maxX - b.minX) * s + 80 + Math.abs(we.panX)));
      const needH = Math.min(8000, Math.ceil((b.maxY - b.minY) * s + 80 + Math.abs(we.panY)));
      if (Math.abs(els.canvas.width - needW) > 2 || Math.abs(els.canvas.height - needH) > 2) {
        els.canvas.width = needW;
        els.canvas.height = needH;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      ctx.fillStyle = '#101217';
      ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
      const activeBase = state.mapFileName ? String(state.mapFileName).split('/').pop() : '';
      (state.world.maps || []).forEach((entry) => {
        const base = String(entry.fileName || '').split('/').pop();
        const map = (state.worldMapCache && state.worldMapCache.get(base)) || (base === activeBase ? m : null);
        drawMapAtWorld(ctx, map, entry, we.originX, we.originY, s, base === activeBase);
      });
      // also chunk/grid skipped — world mode uses map bounds
    };

    window.__tiledWorldScreenToMap = function (sx, sy) {
      if (!state.worldEditor.enabled || !state.world) return null;
      const s = state.zoom || 1;
      const we = state.worldEditor;
      const wx = sx / s + we.originX - (we.panX || 0) / s;
      const wy = sy / s + we.originY - (we.panY || 0) / s;
      const entry = currentWorldEntry();
      if (!entry || !state.map) return { x: 0, y: 0, wx, wy };
      const lx = wx - (entry.x || 0);
      const ly = wy - (entry.y || 0);
      const tw = state.map.tilewidth || 32, th = state.map.tileheight || 32;
      return { x: Math.floor(lx / tw), y: Math.floor(ly / th), wx, wy, lx, ly };
    };

    async function activateWorldMapAt(wx, wy) {
      const maps = state.world.maps || [];
      let hit = null;
      for (let i = maps.length - 1; i >= 0; i--) {
        const e = maps[i];
        const base = String(e.fileName).split('/').pop();
        const cached = state.worldMapCache && state.worldMapCache.get(base);
        const w = e.width || (cached ? cached.width * cached.tilewidth : 640);
        const h = e.height || (cached ? cached.height * cached.tileheight : 640);
        const x = e.x || 0, y = e.y || 0;
        if (wx >= x && wy >= y && wx < x + w && wy < y + h) { hit = e; break; }
      }
      if (!hit) return false;
      const base = String(hit.fileName).split('/').pop();
      if (state.mapFileName && base === String(state.mapFileName).split('/').pop()) return true;
      syncActiveMapToCache();
      // open from cache without losing world
      let map = state.worldMapCache.get(base);
      if (!map) {
        await ensureAllWorldMapsLoaded();
        map = state.worldMapCache.get(base);
      }
      if (!map) {
        api.status('地图未缓存：' + base + ' — 请绑定资源目录');
        return false;
      }
      state.mapFileName = base;
      api.setMap(JSON.parse(JSON.stringify(map)));
      // keep cache as live reference
      state.worldMapCache.set(base, state.map);
      api.renderAll();
      api.status('激活地图：' + base);
      if (F.renderWorldPanel) F.renderWorldPanel();
      return true;
    }

    // Pointer: world pan + click activate + template insert
    const canvas = els.canvas;
    if (canvas && !canvas._b6) {
      canvas._b6 = true;
      let panDrag = null;
      canvas.addEventListener('pointerdown', (e) => {
        // Space or middle button pans world camera
        if (state.worldEditor.enabled && (e.button === 1 || e.code === 'Space' || state._spacePan)) {
          panDrag = { x: e.clientX, y: e.clientY, px: state.worldEditor.panX, py: state.worldEditor.panY };
          e.preventDefault();
          return;
        }
        if (state.worldEditor.enabled && e.button === 0 && !e.altKey) {
          const r = canvas.getBoundingClientRect();
          const wp = window.__tiledWorldScreenToMap(e.clientX - r.left, e.clientY - r.top);
          if (wp) {
            // try activate other map first
            activateWorldMapAt(wp.wx, wp.wy);
          }
        }
        if (state.insertTemplateMode && e.button === 0) {
          const p = api.getState && null;
          const r = canvas.getBoundingClientRect();
          let wx, wy;
          if (state.worldEditor.enabled) {
            const wp = window.__tiledWorldScreenToMap(e.clientX - r.left, e.clientY - r.top);
            wx = wp ? wp.lx : 0; wy = wp ? wp.ly : 0;
          } else {
            const tp = (function () {
              // reuse screenToMap tile * tile size
              const sm = canvas.getBoundingClientRect();
              // call through pointer logic
              return null;
            })();
            const tile = (window.TiledApp && (() => {
              // approximate via existing
              const m = state.map;
              const s = state.zoom;
              const x = Math.floor((e.clientX - r.left) / (m.tilewidth * s));
              const y = Math.floor((e.clientY - r.top) / (m.tileheight * s));
              return { x: x * m.tilewidth, y: y * m.tileheight };
            })());
            wx = tile.x; wy = tile.y;
          }
          placeTemplateInstance(wx, wy);
          e.stopPropagation();
        }
      }, true);
      window.addEventListener('pointermove', (e) => {
        if (!panDrag) return;
        state.worldEditor.panX = panDrag.px + (e.clientX - panDrag.x);
        state.worldEditor.panY = panDrag.py + (e.clientY - panDrag.y);
        api.draw();
      });
      window.addEventListener('pointerup', () => { panDrag = null; });
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') state._spacePan = true;
        if (e.key === 'v' || e.key === 'V') {
          if (!/input|textarea/i.test(e.target.tagName)) {
            state.insertTemplateMode = !state.insertTemplateMode;
            api.status('插入模板工具：' + (state.insertTemplateMode ? '开' : '关'));
          }
        }
      });
      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') state._spacePan = false;
      });
      // Wheel zoom when prefs say so
      canvas.addEventListener('wheel', (e) => {
        if (!state.prefs.wheelZooms) return;
        if (!(e.ctrlKey || e.metaKey || state.prefs.wheelZooms)) return;
        e.preventDefault();
        const z = els.zoom;
        if (!z) return;
        const cur = Number(z.value) || 100;
        const next = Math.max(25, Math.min(400, cur + (e.deltaY > 0 ? -10 : 10)));
        z.value = next;
        z.dispatchEvent(new Event('input'));
      }, { passive: false });
    }

    // Export hooks: respect embed / detach prefs lightly
    const _save = api.save;
    api.save = function () {
      if (state.prefs.exportFormat === 'tmx') return api.saveTmx();
      if (state.prefs.exportFormat === 'csv') return api.saveCsv();
      if (state.prefs.exportFormat === 'png') return api.exportPng();
      return _save();
    };

    /* ---------- UI ---------- */
    document.querySelectorAll('[data-action]').forEach((b) => {
      const a = b.dataset.action;
      if (a === 'preferences') b.onclick = () => {
        const m = $('#prefsEditor');
        if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
        renderPrefsForm();
      };
      else if (a === 'close-prefs') b.onclick = () => {
        const m = $('#prefsEditor');
        if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); }
      };
      else if (a === 'prefs-reset') b.onclick = () => {
        state.prefs = Object.assign({}, DEFAULT_PREFS);
        savePrefs();
        renderPrefsForm();
        api.status('已恢复默认首选项');
      };
      else if (a === 'prefs-clear-recent') b.onclick = () => {
        state.recentFiles = [];
        saveRecent([]);
        renderRecentList();
      };
      else if (a === 'templates') b.onclick = () => {
        const m = $('#templatesPanel');
        if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
        renderTemplatesPanel();
      };
      else if (a === 'close-templates') b.onclick = () => {
        const m = $('#templatesPanel');
        if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); }
      };
      else if (a === 'tpl-save-selected') b.onclick = () => saveSelectedAsTemplate();
      else if (a === 'tpl-insert-tool') b.onclick = () => {
        state.insertTemplateMode = !state.insertTemplateMode;
        api.status('插入模板工具：' + (state.insertTemplateMode ? '开（快捷键 V）' : '关'));
      };
      else if (a === 'tpl-detach') b.onclick = () => detachSelectedTemplate();
      else if (a === 'world-editor') b.onclick = () => {
        if (!state.world) {
          api.status('请先打开 .world');
          return;
        }
        enableWorldEditor(!state.worldEditor.enabled);
      };
      else if (a === 'rule-attach-tileset') b.onclick = () => {
        const inp = $('#ruleTilesetInput');
        if (inp) inp.click();
      };
    });

    const tplInput = $('#templateInput');
    if (tplInput) {
      tplInput.onchange = async () => {
        try {
          await addTemplatesFromFiles(tplInput.files);
          renderTemplatesPanel();
          api.status('已载入模板 ' + state.templates.length);
        } catch (err) {
          api.status('模板载入失败');
          api.log(String(err.message || err));
        }
      };
    }

    const ruleTs = $('#ruleTilesetInput');
    if (ruleTs) {
      ruleTs.onchange = async () => {
        if (ruleTs.files && ruleTs.files[0]) await attachRuleTileset(ruleTs.files[0]);
      };
    }

    // When saving world, write coords
    const prevWorldExport = document.querySelector('[data-action="world-export"]');
    // already in batch5

    Object.assign(F, {
      loadPrefs, savePrefs, applyPrefsToRuntime,
      parseTemplateJson, parseTemplateXml, placeTemplateInstance,
      enableWorldEditor, attachRuleTileset, worldBounds, fitWorldCamera
    });

    api.log('Batch6：首选项 / World共享相机 / 对象模板 / 规则图块集');
  }

  window.initTiledBatch6 = boot;
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 100);
})();

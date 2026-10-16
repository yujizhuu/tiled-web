/*! Tiled 1.2.4 batch7: world asset auto-resolve, template dir browser, prefs polish */
(function () {
  'use strict';

  function boot(api) {
    if (!api || api._batch7) return;
    api._batch7 = true;
    const state = api.getState();
    const els = api.getEls();
    const F = api.features || (api.features = {});
    const $ = (s) => document.querySelector(s);

    state.worldMapAssets = state.worldMapAssets || new Map(); // base -> { tilesets:[{firstgid,url,tileWidth,tileHeight,columns,count,name}], images:Map }
    state.templateDirHandle = state.templateDirHandle || null;
    state.templateDirFiles = state.templateDirFiles || []; // {name, path, file}
    state.templateSearch = '';

    function basename(p) {
      return String(p || '').replace(/\\/g, '/').split('/').pop();
    }

    function resolveAssetFile(pathOrName) {
      const base = basename(pathOrName);
      if (!base) return null;
      if (state.assetFileIndex) {
        if (state.assetFileIndex.has(pathOrName)) return state.assetFileIndex.get(pathOrName);
        if (state.assetFileIndex.has(base)) return state.assetFileIndex.get(base);
        // try relative keys ending with path
        for (const [k, v] of state.assetFileIndex.entries()) {
          if (k === base || k.endsWith('/' + base) || k.endsWith('\\' + base)) return v;
        }
      }
      if (state.worldFiles) {
        if (state.worldFiles.has(base)) return state.worldFiles.get(base);
        if (state.worldFiles.has(pathOrName)) return state.worldFiles.get(pathOrName);
      }
      if (typeof window.__tiledResolveAsset === 'function') {
        const r = window.__tiledResolveAsset(pathOrName, base);
        if (r) return r;
      }
      return null;
    }

    async function loadImageUrl(file) {
      if (!file) return null;
      return api.readImage(file);
    }

    async function parseExternalTileset(file, firstgid) {
      const text = await file.text();
      const lower = file.name.toLowerCase();
      let ts;
      if (lower.endsWith('.tsx') || text.trim().startsWith('<')) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const n = doc.querySelector('tileset');
        if (!n) return null;
        const image = n.querySelector(':scope > image');
        ts = {
          firstgid: firstgid || Number(n.getAttribute('firstgid') || 1),
          name: n.getAttribute('name') || file.name,
          tilewidth: Number(n.getAttribute('tilewidth') || 32),
          tileheight: Number(n.getAttribute('tileheight') || 32),
          tilecount: Number(n.getAttribute('tilecount') || 0),
          columns: Number(n.getAttribute('columns') || 0),
          image: image ? (image.getAttribute('source') || '') : '',
          imagewidth: image ? Number(image.getAttribute('width') || 0) : 0,
          imageheight: image ? Number(image.getAttribute('height') || 0) : 0,
          margin: Number(n.getAttribute('margin') || 0),
          spacing: Number(n.getAttribute('spacing') || 0),
          source: file.name
        };
      } else {
        ts = JSON.parse(text);
        ts.firstgid = firstgid || Number(ts.firstgid || 1);
      }
      return ts;
    }

    async function resolveTilesetRecord(tsRef) {
      if (!tsRef) return null;
      let ts = Object.assign({}, tsRef);
      if (ts.source) {
        const srcFile = resolveAssetFile(ts.source);
        if (srcFile) {
          const parsed = await parseExternalTileset(srcFile, Number(ts.firstgid || 1));
          if (parsed) ts = Object.assign(parsed, { firstgid: Number(ts.firstgid || parsed.firstgid || 1) });
        }
      }
      const imgName = ts.image;
      if (!imgName || String(imgName).startsWith('data:')) {
        if (String(imgName || '').startsWith('data:')) {
          return {
            firstgid: Number(ts.firstgid || 1),
            name: ts.name || '',
            url: imgName,
            tileWidth: Number(ts.tilewidth || ts.tileWidth || 32),
            tileHeight: Number(ts.tileheight || ts.tileHeight || 32),
            columns: Number(ts.columns || 1),
            count: Number(ts.tilecount || ts.count || 0),
            margin: Number(ts.margin || 0),
            spacing: Number(ts.spacing || 0)
          };
        }
        return null;
      }
      const imgFile = resolveAssetFile(imgName);
      if (!imgFile) return null;
      const url = await loadImageUrl(imgFile);
      const img = api.getImageCache().get(url);
      const tw = Number(ts.tilewidth || ts.tileWidth || 32);
      const th = Number(ts.tileheight || ts.tileHeight || 32);
      const columns = Number(ts.columns || Math.max(1, Math.floor((img && img.width || 1) / tw)));
      const count = Number(ts.tilecount || ts.count || columns * Math.floor((img && img.height || 1) / th));
      // Also register into global session so active editing benefits
      try {
        api.registerTileset({
          name: ts.name || basename(imgName),
          tileWidth: tw, tileHeight: th, columns, count,
          firstgid: Number(ts.firstgid || 1), url,
          margin: Number(ts.margin || 0), spacing: Number(ts.spacing || 0),
          tiles: ts.tiles || {}, wangSets: ts.wangsets || ts.wangSets, terrains: ts.terrains
        });
      } catch (_) {}
      return {
        firstgid: Number(ts.firstgid || 1),
        name: ts.name || basename(imgName),
        url, tileWidth: tw, tileHeight: th, columns, count,
        margin: Number(ts.margin || 0), spacing: Number(ts.spacing || 0)
      };
    }

    async function resolveMapAssets(map, mapKey) {
      const key = mapKey || 'map';
      const tilesets = [];
      for (const ts of (map.tilesets || [])) {
        try {
          const rec = await resolveTilesetRecord(ts);
          if (rec) tilesets.push(rec);
        } catch (err) {
          api.log('图块集解析失败：' + (ts.source || ts.image || '') + ' — ' + (err.message || err));
        }
      }
      const images = new Map();
      const visit = async (layers) => {
        for (const l of layers || []) {
          if (l.type === 'imagelayer' && l.image && !String(l.image).startsWith('data:')) {
            const f = resolveAssetFile(l.image);
            if (f) {
              const url = await loadImageUrl(f);
              images.set(basename(l.image), url);
              l.image = url; // inline for draw
            }
          }
          if (l.type === 'group') await visit(l.layers);
        }
      };
      await visit(map.layers);
      const pack = { tilesets, images };
      state.worldMapAssets.set(key, pack);
      return pack;
    }

    function tilesetForGidInPack(pack, gid) {
      const id = api.clearGid(gid >>> 0);
      if (!pack || !pack.tilesets) return api.tilesetForGid(id);
      let best = null;
      for (const ts of pack.tilesets) {
        if (id >= ts.firstgid && (!best || ts.firstgid >= best.firstgid)) best = ts;
      }
      return best || api.tilesetForGid(id);
    }

    function blitGidResolved(ctx, gid, dx, dy, dw, dh, pack) {
      const clear = api.clearGid(gid >>> 0);
      const ts = tilesetForGidInPack(pack, clear);
      if (!ts || !ts.url) {
        ctx.fillStyle = '#345';
        ctx.fillRect(dx, dy, Math.max(1, dw), Math.max(1, dh));
        return;
      }
      const img = api.getImageCache().get(ts.url);
      if (!img) return;
      const local = clear - ts.firstgid;
      const cols = ts.columns || 1;
      const tW = ts.tileWidth || ts.tilewidth || 32;
      const tH = ts.tileHeight || ts.tileheight || 32;
      const sx = (ts.margin || 0) + (local % cols) * (tW + (ts.spacing || 0));
      const sy = (ts.margin || 0) + Math.floor(local / cols) * (tH + (ts.spacing || 0));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, tW, tH, dx, dy, dw, dh);
    }

    // Patch ensureWorldMapCached to resolve assets
    const _ensure = F.ensureWorldMapCached;
    F.ensureWorldMapCached = async function (fileName) {
      const base = basename(fileName);
      let map = _ensure ? await _ensure(fileName) : null;
      if (!map) {
        const file = resolveAssetFile(fileName) || resolveAssetFile(base);
        if (file) {
          try {
            const text = await file.text();
            map = /\.tmx$/i.test(file.name) ? api.parseTmxAdvanced(text) : JSON.parse(text);
            if (!state.worldMapCache) state.worldMapCache = new Map();
            state.worldMapCache.set(base, map);
          } catch (_) { return null; }
        }
      }
      if (map && !state.worldMapAssets.has(base)) {
        await resolveMapAssets(map, base);
      }
      return map;
    };

    // Patch drawMapAtWorld / blit in batch6 via replacing world after-draw blit path
    // Override __tiledAfterDraw world branch drawing by wrapping blit used in composite
    const _after = window.__tiledAfterDraw;
    window.__tiledAfterDraw = function (ctx, m) {
      // Ensure packs for all cached maps (sync kickoff)
      if (state.world && (state.worldEditor && state.worldEditor.enabled || state.worldView)) {
        (state.world.maps || []).forEach((e) => {
          const base = basename(e.fileName);
          if (state.worldMapCache && state.worldMapCache.has(base) && !state.worldMapAssets.has(base)) {
            resolveMapAssets(state.worldMapCache.get(base), base);
          }
        });
      }
      if (_after) _after(ctx, m);
      // If world editor drew with unresolved tiles, repaint overlays with resolved packs
      if (state.worldEditor && state.worldEditor.enabled && state.world) {
        const s = state.zoom || 1;
        const we = state.worldEditor;
        const activeBase = state.mapFileName ? basename(state.mapFileName) : '';
        (state.world.maps || []).forEach((entry) => {
          const base = basename(entry.fileName);
          const map = (state.worldMapCache && state.worldMapCache.get(base)) || (base === activeBase ? m : null);
          const pack = state.worldMapAssets.get(base);
          if (!map || !pack || !pack.tilesets.length) return;
          // redraw tilelayers with resolved tilesets on top of existing (fixes missing tiles)
          const dx = ((entry.x || 0) - we.originX) * s + (we.panX || 0);
          const dy = ((entry.y || 0) - we.originY) * s + (we.panY || 0);
          const tw = map.tilewidth || 32, th = map.tileheight || 32;
          ctx.save();
          ctx.translate(dx, dy);
          ctx.globalAlpha = base === activeBase ? 1 : 0.55;
          const paint = (layers) => {
            for (const l of layers || []) {
              if (!l || l.visible === false) continue;
              if (l.type === 'group') { paint(l.layers); continue; }
              if (l.type !== 'tilelayer') continue;
              if (map.infinite && Array.isArray(l.chunks)) {
                for (const c of l.chunks) {
                  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
                    const gid = c.data[y * c.width + x] || 0;
                    if (!gid) continue;
                    blitGidResolved(ctx, gid, (c.x + x) * tw * s, (c.y + y) * th * s, tw * s, th * s, pack);
                  }
                }
              } else if (l.data) {
                for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
                  const gid = l.data[y * map.width + x] || 0;
                  if (!gid) continue;
                  blitGidResolved(ctx, gid, x * tw * s, y * th * s, tw * s, th * s, pack);
                }
              }
            }
          };
          paint(map.layers);
          ctx.restore();
        });
      } else if (state.worldView && state.world && !(state.worldEditor && state.worldEditor.enabled)) {
        // ghost preview path from batch5 — enhance with resolved blit for first tilelayer
        // batch5 already drew; we overpaint tiles with resolved assets
        const cur = (function () {
          if (!state.mapFileName) return null;
          const base = basename(state.mapFileName);
          return (state.world.maps || []).find((m) => basename(m.fileName) === base) || null;
        })();
        const originX = cur ? (cur.x || 0) : 0;
        const originY = cur ? (cur.y || 0) : 0;
        const s = state.zoom || 1;
        (state.world.maps || []).forEach((entry) => {
          const base = basename(entry.fileName);
          if (state.mapFileName && base === basename(state.mapFileName)) return;
          const map = state.worldMapCache && state.worldMapCache.get(base);
          const pack = state.worldMapAssets.get(base);
          if (!map || !pack) return;
          const dx = ((entry.x || 0) - originX) * s;
          const dy = ((entry.y || 0) - originY) * s;
          const tw = map.tilewidth || 32, th = map.tileheight || 32;
          ctx.save();
          ctx.globalAlpha = 0.4;
          for (const l of map.layers || []) {
            if (l.type !== 'tilelayer' || !l.data) continue;
            for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
              const gid = l.data[y * map.width + x] || 0;
              if (!gid) continue;
              blitGidResolved(ctx, gid, dx + x * tw * s, dy + y * th * s, tw * s, th * s, pack);
            }
            break;
          }
          ctx.restore();
        });
      }
    };

    // When binding assets / opening world, resolve all
    const _bindAssets = F.bindAssetDirectory;
    if (_bindAssets) {
      F.bindAssetDirectory = async function () {
        await _bindAssets();
        if (state.world) {
          for (const e of state.world.maps || []) await F.ensureWorldMapCached(e.fileName);
          api.draw();
        }
      };
    }

    /* ---------- Template directory browser ---------- */
    async function indexTemplateDir(handle, prefix) {
      const out = [];
      if (!handle || !handle.values) return out;
      for await (const entry of handle.values()) {
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.kind === 'file') {
          if (/\.(tx|tj)$/i.test(entry.name) || (/\.json$/i.test(entry.name))) {
            try {
              const file = await entry.getFile();
              // Quick sniff for template json
              if (/\.json$/i.test(entry.name)) {
                const head = (await file.slice(0, 200).text());
                if (!/"type"\s*:\s*"template"/.test(head) && !/"object"\s*:/.test(head)) {
                  // still allow; user may have template without type
                }
              }
              out.push({ name: entry.name, path, file });
              // also index into assetFileIndex for tileset resolution
              if (!state.assetFileIndex) state.assetFileIndex = new Map();
              state.assetFileIndex.set(entry.name, file);
              state.assetFileIndex.set(path, file);
            } catch (_) {}
          } else if (/\.(png|gif|jpe?g|bmp|webp|tsx|tsj)$/i.test(entry.name)) {
            try {
              const file = await entry.getFile();
              if (!state.assetFileIndex) state.assetFileIndex = new Map();
              state.assetFileIndex.set(entry.name, file);
              state.assetFileIndex.set(path, file);
            } catch (_) {}
          }
        } else if (entry.kind === 'directory') {
          const sub = await indexTemplateDir(entry, path);
          out.push(...sub);
        }
      }
      return out;
    }

    async function bindTemplateDirectory() {
      if (window.showDirectoryPicker) {
        try {
          const handle = await window.showDirectoryPicker();
          state.templateDirHandle = handle;
          state.templateDirFiles = await indexTemplateDir(handle, '');
          await loadTemplatesFromDirFiles(state.templateDirFiles);
          api.status('模板目录：' + (handle.name || '') + '（' + state.templateDirFiles.length + ' 个候选）');
          renderTemplatesPanelFiltered();
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          api.log('模板目录失败：' + (err.message || err));
        }
      }
      // Fallback multi-select
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.accept = '.tx,.tj,.json,image/*,.tsx,.tsj';
      inp.onchange = async () => {
        const files = Array.from(inp.files || []);
        if (!state.assetFileIndex) state.assetFileIndex = new Map();
        files.forEach((f) => state.assetFileIndex.set(f.name, f));
        state.templateDirFiles = files.filter((f) => /\.(tx|tj|json)$/i.test(f.name)).map((f) => ({
          name: f.name, path: f.name, file: f
        }));
        await loadTemplatesFromDirFiles(state.templateDirFiles);
        renderTemplatesPanelFiltered();
        api.status('已索引模板相关文件 ' + files.length);
      };
      inp.click();
    }

    async function loadTemplatesFromDirFiles(list) {
      const parseJson = F.parseTemplateJson;
      const parseXml = F.parseTemplateXml;
      if (!parseJson || !parseXml) return;
      for (const item of list || []) {
        try {
          const text = await item.file.text();
          let tpl;
          if (/\.tx$/i.test(item.name) || text.trim().startsWith('<')) tpl = parseXml(text, item.name);
          else {
            const data = JSON.parse(text);
            if (data.type && data.type !== 'template' && !data.object) continue;
            tpl = parseJson(text, item.name);
          }
          tpl.path = item.path;
          // resolve template tileset
          if (tpl.tileset) {
            const rec = await resolveTilesetRecord(tpl.tileset);
            if (rec) tpl._tilesetRec = rec;
          } else if (tpl.object && tpl.object.gid) {
            // try map session tileset
            tpl._tilesetRec = api.tilesetForGid(api.clearGid(tpl.object.gid));
          }
          const idx = state.templates.findIndex((t) => t.fileName === tpl.fileName || t.path === tpl.path);
          if (idx >= 0) state.templates[idx] = Object.assign(state.templates[idx], tpl);
          else state.templates.push(tpl);
        } catch (_) {}
      }
    }

    async function refreshTemplateDir() {
      if (state.templateDirHandle) {
        state.templateDirFiles = await indexTemplateDir(state.templateDirHandle, '');
        await loadTemplatesFromDirFiles(state.templateDirFiles);
        renderTemplatesPanelFiltered();
        api.status('模板目录已刷新（' + state.templateDirFiles.length + '）');
      } else {
        api.status('未绑定模板目录');
      }
    }

    function renderTemplatesPanelFiltered() {
      const list = $('#templateList');
      if (!list) return;
      const q = (state.templateSearch || '').trim().toLowerCase();
      list.innerHTML = '';
      const items = (state.templates || []).filter((t) => {
        if (!q) return true;
        return (t.name || '').toLowerCase().includes(q)
          || (t.fileName || '').toLowerCase().includes(q)
          || (t.path || '').toLowerCase().includes(q);
      });
      items.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = (t.name || t.fileName) + (t.path ? '<span class="tpl-path">' + t.path + '</span>' : '');
        if (state.selectedTemplate === t) b.classList.add('active');
        b.onclick = () => {
          state.selectedTemplate = t;
          // enhanced preview with tileset
          previewTemplateResolved(t);
          renderTemplatesPanelFiltered();
        };
        list.appendChild(b);
      });
      if (!items.length) list.textContent = q ? '无匹配模板' : '未载入模板';
      if (state.selectedTemplate) previewTemplateResolved(state.selectedTemplate);
    }

    function previewTemplateResolved(t) {
      const canvas = $('#templatePreview');
      const meta = $('#templateMeta');
      if (!canvas || !t) return;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const o = t.object || {};
      if (o.gid && (t._tilesetRec || api.tilesetForGid(api.clearGid(o.gid)))) {
        const pack = { tilesets: t._tilesetRec ? [t._tilesetRec] : [] };
        const tw = Math.max(8, o.width || (t._tilesetRec && t._tilesetRec.tileWidth) || 32);
        const th = Math.max(8, o.height || (t._tilesetRec && t._tilesetRec.tileHeight) || 32);
        blitGidResolved(ctx, o.gid, 20, 30, tw, th, pack.tilesets.length ? pack : null);
      } else {
        ctx.strokeStyle = '#ffc857';
        ctx.strokeRect(20, 30, Math.max(8, o.width || 32), Math.max(8, o.height || 32));
      }
      ctx.fillStyle = '#e8eaed';
      ctx.font = '12px sans-serif';
      ctx.fillText((o.name || o.type || 'object') + (o.gid ? ' gid=' + o.gid : ''), 20, 16);
      if (meta) meta.textContent = (t.path || t.fileName || '') + ' · ' + (t.format || '');
    }

    // Hook search
    const search = $('#templateSearch');
    if (search && !search._b7) {
      search._b7 = true;
      search.oninput = () => {
        state.templateSearch = search.value || '';
        renderTemplatesPanelFiltered();
      };
    }

    // Replace batch6 renderTemplatesPanel calls by patching F if exists
    const _rtp = null;
    // Override placeTemplateInstance to use resolved tileset firstgid if needed — keep as is

    /* ---------- Prefs expansion ---------- */
    if (state.prefs) {
      const extra = {
        middleClickPan: state.prefs.middleClickPan != null ? state.prefs.middleClickPan : true,
        spacePan: state.prefs.spacePan != null ? state.prefs.spacePan : true,
        showObjectReferences: state.prefs.showObjectReferences != null ? state.prefs.showObjectReferences : true,
        selectionColor: state.prefs.selectionColor || '#308cc6',
        showFineGrid: state.prefs.showFineGrid != null ? state.prefs.showFineGrid : false,
        panButton: state.prefs.panButton || 'middle', // middle | right
        autoResolveWorldAssets: state.prefs.autoResolveWorldAssets != null ? state.prefs.autoResolveWorldAssets : true
      };
      Object.assign(state.prefs, extra);
      if (F.savePrefs) F.savePrefs();
    }

    // Extend prefs form renderer
    const _rpf = F.applyPrefsToRuntime;
    const origRenderPrefs = null;
    // Monkey-patch by rebinding preferences open to enhanced form
    function renderPrefsFormEnhanced() {
      const form = $('#prefsForm');
      if (!form || !state.prefs) return;
      // Call into batch6 by simulating — rebuild with extras
      const p = state.prefs;
      // Keep language disabled zh
      const fields = [
        ['showGrid', '显示网格', 'check'],
        ['showFineGrid', '显示细网格', 'check'],
        ['gridColor', '网格颜色', 'color'],
        ['gridFine', '细网格细分', 'number'],
        ['snapToGrid', '吸附到网格', 'check'],
        ['snapToFineGrid', '吸附到细网格', 'check'],
        ['snapToPixels', '吸附到像素', 'check'],
        ['highlightCurrentLayer', '高亮当前图层', 'check'],
        ['showTileObjectOutlines', '图块对象描边', 'check'],
        ['showTileAnimations', '图块动画', 'check'],
        ['showObjectReferences', '显示模板引用标记', 'check'],
        ['objectLabels', '对象标签', 'select', ['all', 'selected', 'none']],
        ['objectLineWidth', '对象线宽', 'number'],
        ['selectionColor', '选中颜色', 'color'],
        ['autoMapWhileDrawing', '绘制时自动地图', 'check'],
        ['autoResolveWorldAssets', 'World 自动解析图块集', 'check'],
        ['layerDataFormat', '默认图层数据格式', 'select', ['csv', 'base64', 'base64zlib']],
        ['embedTilesetsOnExport', '导出时嵌入图块集', 'check'],
        ['detachTemplatesOnExport', '导出时分离模板实例', 'check'],
        ['exportFormat', '默认导出格式', 'select', ['tmj', 'tmx', 'csv', 'png']],
        ['wheelZooms', '滚轮默认缩放', 'check'],
        ['middleClickPan', '中键平移', 'check'],
        ['spacePan', '空格平移', 'check'],
        ['language', '语言', 'text']
      ];
      form.innerHTML = '';
      fields.forEach(([key, label, kind, opts]) => {
        const lab = document.createElement('label');
        if (kind === 'check' || key === 'language') lab.classList.add('wide');
        lab.textContent = label;
        let input;
        if (kind === 'check') {
          input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !!p[key];
          input.onchange = () => { p[key] = input.checked; if (F.savePrefs) F.savePrefs(); else applyLocal(); };
        } else if (kind === 'color') {
          input = document.createElement('input');
          input.type = 'color';
          let c = p[key] || '#a0b4d2';
          if (!/^#/.test(c)) c = '#a0b4d2';
          input.value = c.slice(0, 7);
          input.onchange = () => { p[key] = input.value; if (F.savePrefs) F.savePrefs(); };
        } else if (kind === 'select') {
          input = document.createElement('select');
          (opts || []).forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o; opt.textContent = o;
            if (p[key] === o) opt.selected = true;
            input.appendChild(opt);
          });
          input.onchange = () => { p[key] = input.value; if (F.savePrefs) F.savePrefs(); };
        } else {
          input = document.createElement('input');
          input.type = kind === 'number' ? 'number' : 'text';
          input.value = p[key] == null ? '' : p[key];
          if (key === 'language') { input.value = 'zh_CN'; input.disabled = true; }
          input.onchange = () => {
            p[key] = kind === 'number' ? Number(input.value) : input.value;
            if (F.savePrefs) F.savePrefs();
          };
        }
        lab.appendChild(input);
        form.appendChild(lab);
      });
      const recent = $('#recentFilesList');
      if (recent && state.recentFiles) {
        recent.innerHTML = '';
        state.recentFiles.forEach((name) => {
          const row = document.createElement('div');
          row.className = 'prop-row';
          row.textContent = name;
          recent.appendChild(row);
        });
        if (!state.recentFiles.length) recent.textContent = '（空）';
      }
      function applyLocal() { if (F.applyPrefsToRuntime) F.applyPrefsToRuntime(); api.draw(); }
    }

    // Fine grid + object reference markers in after draw (non-world)
    const _after2 = window.__tiledAfterDraw;
    window.__tiledAfterDraw = function (ctx, m) {
      if (_after2) _after2(ctx, m);
      if (!m || (state.worldEditor && state.worldEditor.enabled)) return;
      const prefs = state.prefs || {};
      if (prefs.showFineGrid && state.grid && m.orientation === 'orthogonal') {
        const s = state.zoom || 1;
        const div = Math.max(1, Number(prefs.gridFine) || 4);
        const tw = m.tilewidth * s / div, th = m.tileheight * s / div;
        ctx.save();
        ctx.strokeStyle = prefs.gridColor || 'rgba(160,180,210,.12)';
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1;
        const w = els.canvas.width, h = els.canvas.height;
        for (let x = 0; x < w; x += tw) {
          ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += th) {
          ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
        }
        ctx.restore();
      }
      if (prefs.showObjectReferences) {
        const s = state.zoom || 1;
        const visit = (layers) => {
          for (const l of layers || []) {
            if (l.type === 'objectgroup') {
              (l.objects || []).forEach((o) => {
                if (!o.template) return;
                const x = (o.x || 0) * s, y = (o.y || 0) * s;
                ctx.save();
                ctx.fillStyle = '#a78bfa';
                ctx.font = '10px sans-serif';
                ctx.fillText('Ⓣ', x + 2, y + 10);
                ctx.restore();
              });
            }
            if (l.type === 'group') visit(l.layers);
          }
        };
        visit(m.layers);
      }
    };

    // Respect middleClickPan / spacePan prefs in world pan — patch via flag
    const canvas = els.canvas;
    if (canvas && !canvas._b7pan) {
      canvas._b7pan = true;
      // Selection color for selected object already uses #66a8ff — apply prefs via CSS var
      const applySel = () => {
        if (state.prefs && state.prefs.selectionColor) {
          document.documentElement.style.setProperty('--sel', state.prefs.selectionColor);
        }
      };
      applySel();
    }

    // UI bindings
    document.querySelectorAll('[data-action]').forEach((b) => {
      const a = b.dataset.action;
      if (a === 'tpl-bind-dir') b.onclick = () => bindTemplateDirectory();
      else if (a === 'tpl-refresh-dir') b.onclick = () => refreshTemplateDir();
      else if (a === 'preferences') {
        const prev = b.onclick;
        b.onclick = () => {
          const m = $('#prefsEditor');
          if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
          renderPrefsFormEnhanced();
        };
      }
      else if (a === 'templates') {
        b.onclick = () => {
          const m = $('#templatesPanel');
          if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
          renderTemplatesPanelFiltered();
        };
      }
    });

    // After open map — if part of world, resolve assets
    const _afterOpen = window.__tiledAfterOpenMap;
    window.__tiledAfterOpenMap = async function (file, files, map) {
      if (_afterOpen) await _afterOpen(file, files, map);
      if (state.prefs && state.prefs.autoResolveWorldAssets !== false) {
        await resolveMapAssets(map, basename(file.name));
        if (state.world) {
          for (const e of state.world.maps || []) await F.ensureWorldMapCached(e.fileName);
        }
      }
    };

    Object.assign(F, {
      resolveAssetFile, resolveMapAssets, resolveTilesetRecord,
      bindTemplateDirectory, refreshTemplateDir, renderTemplatesPanelFiltered,
      blitGidResolved, renderPrefsFormEnhanced
    });

    api.log('Batch7：World 资源自动解析 / 模板目录浏览 / 首选项扩充');
  }

  window.initTiledBatch7 = boot;
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 120);
})();

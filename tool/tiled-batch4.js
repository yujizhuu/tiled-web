/*! Tiled 1.2.4 batch4: rule editor, external assets, staggered WangFiller,
 * Wang templates, object-types inheritance, .world, browser TiledCLI */
(function () {
  'use strict';

  function boot(api) {
    if (!api || api._batch4) return;
    api._batch4 = true;
    const state = api.getState();
    const els = api.getEls();
    const F = api.features || (api.features = {});
    const $ = (s) => document.querySelector(s);

    state.assetDirHandle = state.assetDirHandle || null;
    state.assetFileIndex = state.assetFileIndex || new Map();
    state.objectTypes = state.objectTypes || [];
    state.world = state.world || null;
    state.worldFiles = state.worldFiles || new Map();
    state.ruleEdit = null;
    state.wangTemplateId = null;

    /* ---------- helpers ---------- */
    function downloadText(name, mime, text) {
      api.download(name, mime, text);
    }

    function basename(p) {
      return String(p || '').replace(/\\/g, '/').split('/').pop();
    }

    function indexFiles(files) {
      for (const f of files || []) {
        if (f && f.name) state.assetFileIndex.set(f.name, f);
      }
    }

    async function indexDirHandle(handle, prefix) {
      if (!handle || !handle.values) return;
      for await (const entry of handle.values()) {
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile();
            state.assetFileIndex.set(entry.name, file);
            state.assetFileIndex.set(path, file);
            // also leaf-only already set
          } catch (_) {}
        } else if (entry.kind === 'directory') {
          await indexDirHandle(entry, path);
        }
      }
    }

    /* ---------- 1. Automap rule visual editor ---------- */
    function blankRuleMap(w, h, tw, th) {
      const W = w || 8, H = h || 8;
      const tw0 = tw || (state.map && state.map.tilewidth) || 32;
      const th0 = th || (state.map && state.map.tileheight) || 32;
      const empty = () => Array(W * H).fill(0);
      return {
        version: '1.2', tiledversion: '1.2.4', orientation: 'orthogonal',
        width: W, height: H, tilewidth: tw0, tileheight: th0,
        properties: { DeleteTiles: 'false', MatchOutsideMap: 'true' },
        layers: [
          { id: 1, name: 'Regions', type: 'tilelayer', width: W, height: H, opacity: 1, visible: true, data: empty() },
          { id: 2, name: 'input_Ground', type: 'tilelayer', width: W, height: H, opacity: 1, visible: true, data: empty(),
            properties: { StrictEmpty: false } },
          { id: 3, name: 'output_Ground', type: 'tilelayer', width: W, height: H, opacity: 1, visible: true, data: empty() },
          { id: 4, name: 'output_Objects', type: 'objectgroup', objects: [], opacity: 1, visible: true }
        ],
        tilesets: []
      };
    }

    function ensureRuleEdit() {
      if (!state.ruleEdit) {
        state.ruleEdit = {
          map: blankRuleMap(),
          layerIdx: 0,
          tool: 'paint',
          paintGid: 1,
          painting: false
        };
      }
      return state.ruleEdit;
    }

    function ruleLayer() {
      const re = ensureRuleEdit();
      return (re.map.layers || [])[re.layerIdx] || null;
    }

    function refreshRuleLayerSelect() {
      const sel = $('#ruleLayerSelect');
      if (!sel) return;
      const re = ensureRuleEdit();
      sel.innerHTML = '';
      (re.map.layers || []).forEach((l, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = (l.name || ('层' + i)) + ' [' + (l.type || '') + ']';
        if (i === re.layerIdx) o.selected = true;
        sel.appendChild(o);
      });
    }

    function drawRuleCanvas() {
      const canvas = $('#ruleCanvas');
      if (!canvas) return;
      const re = ensureRuleEdit();
      const m = re.map;
      const tw = 24, th = 24;
      canvas.width = m.width * tw;
      canvas.height = m.height * th;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // draw all visible tile layers bottom-up, Regions tinted
      const layers = m.layers || [];
      layers.forEach((l, li) => {
        if (l.type !== 'tilelayer' || !l.visible) return;
        const isActive = li === re.layerIdx;
        const isRegions = /^regions/i.test(l.name || '');
        for (let y = 0; y < m.height; y++) {
          for (let x = 0; x < m.width; x++) {
            const gid = (l.data[y * m.width + x] || 0) >>> 0;
            const px = x * tw, py = y * th;
            if (gid) {
              if (isRegions) {
                ctx.fillStyle = 'rgba(80,160,255,0.55)';
              } else if (/^input/i.test(l.name || '')) {
                ctx.fillStyle = isActive ? 'rgba(255,180,60,0.85)' : 'rgba(255,180,60,0.35)';
              } else {
                ctx.fillStyle = isActive ? 'rgba(80,220,120,0.85)' : 'rgba(80,220,120,0.35)';
              }
              ctx.fillRect(px + 1, py + 1, tw - 2, th - 2);
              ctx.fillStyle = '#e8eaed';
              ctx.font = '10px monospace';
              ctx.fillText(String(gid & 0x1fffffff), px + 3, py + 14);
            } else if (isActive) {
              ctx.strokeStyle = 'rgba(255,255,255,0.08)';
              ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, th - 1);
            }
          }
        }
      });
      // objects
      layers.forEach((l) => {
        if (l.type !== 'objectgroup') return;
        (l.objects || []).forEach((o) => {
          const s = tw / (m.tilewidth || 32);
          ctx.strokeStyle = '#f472b6';
          ctx.strokeRect((o.x || 0) * s, (o.y || 0) * s, Math.max(4, (o.width || 16) * s), Math.max(4, (o.height || 16) * s));
        });
      });
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let x = 0; x <= m.width; x++) {
        ctx.beginPath(); ctx.moveTo(x * tw + 0.5, 0); ctx.lineTo(x * tw + 0.5, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= m.height; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * th + 0.5); ctx.lineTo(canvas.width, y * th + 0.5); ctx.stroke();
      }
    }

    function rulePaintAt(cx, cy) {
      const re = ensureRuleEdit();
      const m = re.map;
      const canvas = $('#ruleCanvas');
      if (!canvas) return;
      const tw = canvas.width / m.width;
      const th = canvas.height / m.height;
      const x = Math.floor(cx / tw);
      const y = Math.floor(cy / th);
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) return;
      const layer = ruleLayer();
      if (!layer || layer.type !== 'tilelayer') return;
      const gid = re.tool === 'erase' ? 0 : (Number($('#rulePaintGid') && $('#rulePaintGid').value) || re.paintGid || 1);
      re.paintGid = gid;
      layer.data[y * m.width + x] = gid;
      drawRuleCanvas();
    }

    function openRuleEditor(fromCompiled) {
      const re = ensureRuleEdit();
      if (fromCompiled && fromCompiled.map) {
        re.map = JSON.parse(JSON.stringify(fromCompiled.map));
      } else if (!re.map) {
        re.map = blankRuleMap();
      }
      re.layerIdx = 0;
      refreshRuleLayerSelect();
      const modal = $('#ruleEditor');
      if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
      }
      drawRuleCanvas();
      api.status('规则编辑器已打开');
    }

    function closeRuleEditor() {
      const modal = $('#ruleEditor');
      if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      }
    }

    function ruleMapToTmj() {
      const re = ensureRuleEdit();
      return JSON.stringify(re.map, null, 2);
    }

    function ruleMapToTmx() {
      const re = ensureRuleEdit();
      const m = re.map;
      // Prefer api.toTmx if it reads state.map — temporarily swap
      const prev = state.map;
      state.map = m;
      let xml;
      try {
        if (F.exportTmxWithEmbedded) xml = F.exportTmxWithEmbedded();
        else xml = api.toTmx();
      } finally {
        state.map = prev;
      }
      return xml;
    }

    function applyRuleToSession() {
      const re = ensureRuleEdit();
      if (!F.compileRuleMap) {
        api.status('缺少 compileRuleMap');
        return;
      }
      const compiled = F.compileRuleMap(JSON.parse(JSON.stringify(re.map)), 'rule-edit.tmj');
      if (!compiled || !compiled.rules.length) {
        api.status('规则无效：需要 Regions 与至少一条区域');
        api.log('提示：在 Regions 层用非零 GID 画出规则区域矩形');
        return;
      }
      if (!state.automapRules) state.automapRules = [];
      // replace same name or push
      const idx = state.automapRules.findIndex((c) => c.name === compiled.name);
      if (idx >= 0) state.automapRules[idx] = compiled;
      else state.automapRules.push(compiled);
      const meta = $('#automapMeta');
      if (meta) meta.textContent = `已载入 ${state.automapRules.length} 个规则文件，共 ${state.automapRules.reduce((n, c) => n + c.rules.length, 0)} 条规则`;
      api.status('已加入会话规则：' + compiled.rules.length + ' 条');
      api.log('规则编辑器 → 会话：' + compiled.rules.length + ' 条');
    }

    function bindRuleEditor() {
      const canvas = $('#ruleCanvas');
      if (canvas && !canvas._ruleBound) {
        canvas._ruleBound = true;
        canvas.addEventListener('pointerdown', (e) => {
          ensureRuleEdit().painting = true;
          const r = canvas.getBoundingClientRect();
          rulePaintAt(e.clientX - r.left, e.clientY - r.top);
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!ensureRuleEdit().painting) return;
          const r = canvas.getBoundingClientRect();
          rulePaintAt(e.clientX - r.left, e.clientY - r.top);
        });
        window.addEventListener('pointerup', () => { if (state.ruleEdit) state.ruleEdit.painting = false; });
      }
      const sel = $('#ruleLayerSelect');
      if (sel) sel.onchange = () => {
        ensureRuleEdit().layerIdx = Number(sel.value) || 0;
        drawRuleCanvas();
      };
      document.querySelectorAll('[data-rule-tool]').forEach((b) => {
        b.onclick = () => {
          ensureRuleEdit().tool = b.dataset.ruleTool;
          document.querySelectorAll('[data-rule-tool]').forEach((x) => x.classList.toggle('active', x === b));
        };
      });
    }

    /* ---------- 2. External tileset path resolution ---------- */
    window.__tiledResolveAsset = function (path, base) {
      if (state.assetFileIndex.has(base)) return state.assetFileIndex.get(base);
      if (path && state.assetFileIndex.has(path)) return state.assetFileIndex.get(path);
      // try relative to map file name folder prefix keys
      return null;
    };

    window.__tiledMissingAssets = function (missing) {
      api.log('缺少外部资源：' + missing.join(', '));
      api.status('缺少 ' + missing.length + ' 个外部资源 — 点「资源目录」或重新多选文件');
    };

    window.__tiledBeforeAttachAssets = async function (file, files) {
      indexFiles(files);
      state.mapFileName = file.name;
    };

    async function bindAssetDirectory() {
      if (window.showDirectoryPicker) {
        try {
          const handle = await window.showDirectoryPicker();
          state.assetDirHandle = handle;
          state.assetFileIndex = new Map();
          await indexDirHandle(handle, '');
          api.status('已绑定资源目录（' + state.assetFileIndex.size + ' 文件）');
          api.log('资源目录：' + (handle.name || '') + '，索引 ' + state.assetFileIndex.size);
          if (state.map) {
            await api.attachMapTileset(state.openFileBundle || []);
            await api.attachMapImages(state.openFileBundle || []);
            api.renderAll();
          }
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
          api.log('目录选择失败：' + (err.message || err));
        }
      }
      // Fallback: multi-file open
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.onchange = async () => {
        indexFiles(inp.files);
        api.status('已索引 ' + state.assetFileIndex.size + ' 个资源文件');
        if (state.map) {
          await api.attachMapTileset([...(state.openFileBundle || []), ...Array.from(inp.files || [])]);
          await api.attachMapImages([...(state.openFileBundle || []), ...Array.from(inp.files || [])]);
          api.renderAll();
        }
      };
      inp.click();
    }

    /* ---------- 3. Staggered WangFiller + Wang template UI ---------- */
    function staggerIndexNum(map) {
      return (map.staggerindex || 'odd') === 'even' ? 1 : 0;
    }

    function hexTopLeft(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') {
        if ((y & 1) ^ si) return { x: x, y: y - 1 };
        return { x: x - 1, y: y - 1 };
      }
      if ((x & 1) ^ si) return { x: x - 1, y: y };
      return { x: x - 1, y: y - 1 };
    }
    function hexTopRight(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') {
        if ((y & 1) ^ si) return { x: x + 1, y: y - 1 };
        return { x: x, y: y - 1 };
      }
      if ((x & 1) ^ si) return { x: x + 1, y: y };
      return { x: x + 1, y: y - 1 };
    }
    function hexBottomLeft(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') {
        if ((y & 1) ^ si) return { x: x, y: y + 1 };
        return { x: x - 1, y: y + 1 };
      }
      if ((x & 1) ^ si) return { x: x - 1, y: y + 1 };
      return { x: x - 1, y: y };
    }
    function hexBottomRight(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') {
        if ((y & 1) ^ si) return { x: x + 1, y: y + 1 };
        return { x: x, y: y + 1 };
      }
      if ((x & 1) ^ si) return { x: x + 1, y: y + 1 };
      return { x: x + 1, y: y };
    }

    /** 8 surrounding points — matches wangfiller.cpp getSurroundingPoints */
    function getSurroundingPoints(x, y, map) {
      const points = new Array(8);
      const ori = map.orientation || 'orthogonal';
      if (ori === 'staggered' || ori === 'hexagonal') {
        points[0] = hexTopRight(x, y, map);
        points[2] = hexBottomRight(x, y, map);
        points[4] = hexBottomLeft(x, y, map);
        points[6] = hexTopLeft(x, y, map);
        if ((map.staggeraxis || 'y') === 'x') {
          points[1] = { x: x + 2, y: y };
          points[3] = { x: x, y: y + 1 };
          points[5] = { x: x - 2, y: y };
          points[7] = { x: x, y: y - 1 };
        } else {
          points[1] = { x: x + 1, y: y };
          points[3] = { x: x, y: y + 2 };
          points[5] = { x: x - 1, y: y };
          points[7] = { x: x, y: y - 2 };
        }
      } else {
        const around = [
          [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]
        ];
        for (let i = 0; i < 8; i++) points[i] = { x: x + around[i][0], y: y + around[i][1] };
      }
      return points;
    }

    function setNib(wid, nibIndex, val) {
      wid = wid >>> 0;
      wid &= ~(0xf << (nibIndex * 4));
      wid |= (val & 0xf) << (nibIndex * 4);
      return wid >>> 0;
    }

    /** Improved surroundingWangId using 8-neighbor updateToAdjacent semantics */
    function surroundingWangIdFull(layer, map, x, y, ws, ts) {
      let id = 0;
      const points = getSurroundingPoints(x, y, map);
      for (let i = 0; i < 8; i++) {
        const p = points[i];
        if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
        const gid = api.tileAt(layer, p.x, p.y, map) >>> 0;
        if (!gid) continue;
        const local = api.clearGid(gid) - ts.firstgid;
        const rec = (ws.tiles || {})[local];
        const nid = rec ? (rec.wangId >>> 0) : 0;
        if (!nid) continue;
        // updateToAdjacent: neighbor index i contributes to our opposite side (i+4)%8
        const adjIndex = (i + 4) % 8;
        const color = (nid >>> (i * 4)) & 0xf;
        // Actually: from wangId.cpp updateToAdjacent — set our color at position from neighbor's opposite
        // neighbor's facing us is opposite of i from neighbor's view = (i+4)%8 on neighbor
        const fromNeighbor = (nid >>> (((i + 4) % 8) * 4)) & 0xf;
        id = setNib(id, i, fromNeighbor);
      }
      return id >>> 0;
    }

    // Override batch3 wangFillerFill surrounding if present
    if (F.wangFillerFill) {
      const _oldFill = F.wangFillerFill;
      // Replace surrounding by patching via reimplementation
      F.getSurroundingPoints = getSurroundingPoints;
      F.surroundingWangIdFull = surroundingWangIdFull;
      F.wangFillerFill = function (region) {
        const layer = api.activeLayer();
        const map = state.map;
        const ts = state.tileset;
        const ws = state.wangSet || (ts && ts.wangSets && ts.wangSets[0]);
        if (!layer || layer.type !== 'tilelayer' || !ts || !ws) {
          api.status('需要当前瓦片层与 Wang 集');
          return;
        }
        state.wangSet = ws;
        if (F.expandWangFlipVariants) F.expandWangFlipVariants(ws);
        api.snapshot();
        const x0 = region.minX, y0 = region.minY, x1 = region.maxX, y1 = region.maxY;
        const Picker = F.Picker;
        for (let pass = 0; pass < 3; pass++) {
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const wangId = surroundingWangIdFull(layer, map, x, y, ws, ts);
              const matches = F.findMatchingWangTiles ? F.findMatchingWangTiles(ws, wangId) : [];
              if (!Picker || !matches.length) continue;
              const picker = new Picker();
              matches.forEach((m) => {
                const rec = ws.tiles[m.tileId] || {};
                const prob = rec.probability != null ? Number(rec.probability) : 1;
                picker.add(m, prob > 0 ? prob : 0.0001);
              });
              if (picker.isEmpty()) continue;
              const chosen = picker.pick();
              let gid = ts.firstgid + chosen.tileId;
              if (chosen.hflip || chosen.vflip || chosen.dflip) {
                gid = api.composeGid(api.clearGid(gid), !!chosen.hflip, !!chosen.vflip, !!chosen.dflip);
              }
              api.setTileAt(layer, x, y, map, gid);
            }
          }
        }
        api.renderAll();
        const tag = (map.orientation === 'staggered' || map.orientation === 'hexagonal') ? '交错/六角' : '正交';
        api.status('WangFiller 完成（' + tag + '，3 遍）');
        if (F.markAutomapDirty) F.markAutomapDirty(x0, y0, x1, y1);
      };
    }

    function edgeColorCount(ws) {
      const cols = ws.edgecolors || ws.colors || [];
      // wang set: edgecolors array length; colors may be shared
      if (Array.isArray(ws.edgecolors)) return Math.max(1, ws.edgecolors.length);
      if (ws.edgecolorcount != null) return Math.max(1, Number(ws.edgecolorcount));
      // infer from tiles
      let max = 0;
      Object.values(ws.tiles || {}).forEach((rec) => {
        const id = rec.wangId >>> 0;
        for (let i = 0; i < 8; i += 2) max = Math.max(max, (id >>> (i * 4)) & 0xf);
      });
      return Math.max(1, max);
    }
    function cornerColorCount(ws) {
      if (Array.isArray(ws.cornercolors)) return Math.max(1, ws.cornercolors.length);
      if (ws.cornercolorcount != null) return Math.max(1, Number(ws.cornercolorcount));
      let max = 0;
      Object.values(ws.tiles || {}).forEach((rec) => {
        const id = rec.wangId >>> 0;
        for (let i = 1; i < 8; i += 2) max = Math.max(max, (id >>> (i * 4)) & 0xf);
      });
      return Math.max(1, max);
    }

    /** WangSet::templateWangIdAt */
    function templateWangIdAt(ws, n) {
      let wangId = 0;
      const ec = edgeColorCount(ws);
      const cc = cornerColorCount(ws);
      const cornerEdgePermutations = ec * cc;
      n = n >>> 0;
      for (let i = 7; i >= 0; --i) {
        const below = Math.pow(cornerEdgePermutations, Math.floor(i / 2)) * ((i & 1) ? ec : 1);
        const value = Math.floor(n / below);
        n -= value * below;
        wangId |= value << (i * 4);
      }
      wangId = (wangId + 0x11111111) >>> 0;
      if (ec <= 1) wangId &= 0xf0f0f0f0;
      if (cc <= 1) wangId &= 0x0f0f0f0f;
      return wangId >>> 0;
    }

    function completeSetSize(ws) {
      const ec = edgeColorCount(ws), cc = cornerColorCount(ws);
      return Math.pow(ec, 4) * Math.pow(cc, 4);
    }

    function renderWangTemplates() {
      const panel = $('#wangTemplatePanel');
      if (!panel) return;
      panel.innerHTML = '';
      const ts = state.tileset;
      const ws = state.wangSet || (ts && ts.wangSets && ts.wangSets[0]);
      if (!ws) {
        panel.textContent = '';
        return;
      }
      const size = Math.min(completeSetSize(ws), 64);
      const title = document.createElement('div');
      title.style.cssText = 'width:100%;font-size:11px;color:#9aa3b2;margin-bottom:2px';
      title.textContent = 'Wang 模板（' + size + '/' + completeSetSize(ws) + '）';
      panel.appendChild(title);
      for (let n = 0; n < size; n++) {
        const wid = templateWangIdAt(ws, n);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'wangId 0x' + wid.toString(16);
        btn.textContent = n;
        if (state.wangTemplateId === wid) btn.classList.add('active');
        // color preview from nibbles
        const c0 = (wid & 0xf);
        btn.style.background = 'hsl(' + ((c0 * 40) % 360) + ' 50% 35%)';
        btn.onclick = () => {
          state.wangTemplateId = wid;
          state.wangPaintId = wid;
          // try paint matching tile as stamp
          if (F.findMatchingWangTiles) {
            const matches = F.findMatchingWangTiles(ws, wid);
            if (matches.length && ts) {
              state.tile = matches[0].tileId;
              state.tileSelection = { x: matches[0].tileId % (ts.columns || 1), y: Math.floor(matches[0].tileId / (ts.columns || 1)), w: 1, h: 1 };
              state.stampData = null;
            }
          }
          renderWangTemplates();
          api.status('Wang 模板 #' + n + ' → 0x' + wid.toString(16));
          api.renderAll();
        };
        panel.appendChild(btn);
      }
    }

    /* ---------- 4. Object types + property inheritance grey-out ---------- */
    function parseObjectTypesJson(text) {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : (data.objectTypes || data.types || []);
      return arr.map((t) => {
        const props = {};
        const types = {};
        (t.properties || []).forEach((p) => {
          if (!p || p.name == null) return;
          props[p.name] = p.value;
          types[p.name] = p.type || 'string';
        });
        // also allow map form
        if (t.properties && !Array.isArray(t.properties) && typeof t.properties === 'object') {
          Object.assign(props, t.properties);
        }
        return { name: t.name || '', color: t.color || '#a0a0a0', properties: props, types };
      });
    }

    function parseObjectTypesXml(text) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const out = [];
      doc.querySelectorAll('objecttype').forEach((n) => {
        const props = {}, types = {};
        n.querySelectorAll('property').forEach((p) => {
          const name = p.getAttribute('name');
          if (!name) return;
          const type = p.getAttribute('type') || 'string';
          let val = p.getAttribute('default') != null ? p.getAttribute('default') : (p.getAttribute('value') || '');
          if (type === 'bool') val = val === 'true' || val === '1';
          else if (type === 'int') val = parseInt(val, 10) || 0;
          else if (type === 'float') val = parseFloat(val) || 0;
          props[name] = val;
          types[name] = type;
        });
        out.push({ name: n.getAttribute('name') || '', color: n.getAttribute('color') || '#a0a0a0', properties: props, types });
      });
      return out;
    }

    function findObjectType(name) {
      if (!name) return null;
      return (state.objectTypes || []).find((t) => t.name === name) || null;
    }

    function tilePropsForObject(o) {
      if (!o || !o.gid) return {};
      const gid = api.clearGid(o.gid >>> 0);
      const ts = api.tilesetForGid(gid);
      if (!ts) return {};
      const local = gid - ts.firstgid;
      const tile = (ts.tiles && ts.tiles[local]) || {};
      return tile.properties || {};
    }

    window.__tiledEnhanceInspector = function (o, inspector) {
      // Append inherited props panel (object type defaults + tile props) greyed out
      const existing = inspector.querySelector('.inherited-props');
      if (existing) existing.remove();
      const wrap = document.createElement('div');
      wrap.className = 'inherited-props';
      wrap.style.cssText = 'margin-top:8px;border-top:1px solid var(--line);padding-top:6px';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:11px;color:#9aa3b2;margin-bottom:4px';
      title.textContent = '继承属性（灰显 = 未覆盖）';
      wrap.appendChild(title);

      const own = o.properties || {};
      const { values: ownVals } = api.stripPropMeta(own);
      const typeDef = findObjectType(o.type);
      const tileProps = tilePropsForObject(o);
      const { values: tileVals } = api.stripPropMeta(tileProps);

      const inherited = {};
      if (typeDef) {
        Object.entries(typeDef.properties || {}).forEach(([k, v]) => {
          if (!(k in ownVals)) inherited[k] = { value: v, source: '类型:' + typeDef.name, type: (typeDef.types || {})[k] || 'string' };
        });
        // tint type color on name label
        const typeInput = inspector.querySelector('[data-k="type"]');
        if (typeInput && typeDef.color) {
          typeInput.style.borderColor = typeDef.color;
          typeInput.title = '对象类型颜色 ' + typeDef.color;
        }
      }
      Object.entries(tileVals).forEach(([k, v]) => {
        if (!(k in ownVals) && !(k in inherited)) {
          inherited[k] = { value: v, source: '图块', type: 'string' };
        }
      });

      if (!Object.keys(inherited).length && !Object.keys(ownVals).length) {
        const empty = document.createElement('div');
        empty.style.color = '#7a8494';
        empty.textContent = typeDef ? '类型默认均已被覆盖或为空' : '无对象类型或图块继承';
        wrap.appendChild(empty);
      }

      Object.entries(inherited).forEach(([name, info]) => {
        const row = document.createElement('div');
        row.className = 'prop-row inherited';
        row.title = '继承自 ' + info.source + ' — 编辑以覆盖';
        const nameIn = document.createElement('input');
        nameIn.value = name;
        nameIn.disabled = true;
        const valIn = document.createElement('input');
        valIn.value = info.value == null ? '' : String(info.value);
        valIn.disabled = true;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '覆盖';
        btn.onclick = () => {
          api.snapshot();
          if (!o.properties) o.properties = {};
          if (!o.properties.__propertyTypes) o.properties.__propertyTypes = {};
          o.properties[name] = info.value;
          o.properties.__propertyTypes[name] = info.type || 'string';
          api.renderAll();
        };
        row.appendChild(nameIn);
        row.appendChild(valIn);
        row.appendChild(btn);
        wrap.appendChild(row);
      });

      // own props quick list with override marker
      Object.keys(ownVals).forEach((name) => {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const nameIn = document.createElement('input');
        nameIn.value = name;
        nameIn.disabled = true;
        const valIn = document.createElement('input');
        valIn.value = ownVals[name] == null ? '' : String(ownVals[name]);
        valIn.onchange = () => {
          api.snapshot();
          let v = valIn.value;
          const t = (own.__propertyTypes || {})[name];
          if (t === 'int') v = parseInt(v, 10) || 0;
          else if (t === 'float') v = parseFloat(v) || 0;
          else if (t === 'bool') v = v === 'true';
          o.properties[name] = v;
          api.renderAll();
        };
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.title = '删除覆盖（恢复继承）';
        del.onclick = () => {
          api.snapshot();
          delete o.properties[name];
          if (o.properties.__propertyTypes) delete o.properties.__propertyTypes[name];
          api.renderAll();
        };
        row.appendChild(nameIn);
        row.appendChild(valIn);
        row.appendChild(del);
        wrap.appendChild(row);
      });

      inspector.appendChild(wrap);
    };

    function renderObjectTypesList() {
      const list = $('#objectTypesList');
      if (!list) return;
      list.innerHTML = '';
      (state.objectTypes || []).forEach((t, idx) => {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const nameIn = document.createElement('input');
        nameIn.value = t.name;
        nameIn.onchange = () => { t.name = nameIn.value; };
        const colorIn = document.createElement('input');
        colorIn.type = 'color';
        colorIn.value = /^#/.test(t.color) ? t.color.slice(0, 7) : '#a0a0a0';
        colorIn.onchange = () => { t.color = colorIn.value; };
        const meta = document.createElement('span');
        meta.style.fontSize = '11px';
        meta.textContent = Object.keys(t.properties || {}).length + ' 属性';
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '×';
        del.onclick = () => { state.objectTypes.splice(idx, 1); renderObjectTypesList(); };
        row.appendChild(nameIn);
        row.appendChild(colorIn);
        row.appendChild(meta);
        row.appendChild(del);
        list.appendChild(row);
        // property editor lines
        Object.entries(t.properties || {}).forEach(([pn, pv]) => {
          const pr = document.createElement('div');
          pr.className = 'prop-row';
          pr.style.marginLeft = '12px';
          const n = document.createElement('input'); n.value = pn; n.disabled = true;
          const v = document.createElement('input'); v.value = pv == null ? '' : String(pv);
          v.onchange = () => { t.properties[pn] = v.value; };
          pr.appendChild(n); pr.appendChild(v);
          list.appendChild(pr);
        });
        const addP = document.createElement('button');
        addP.type = 'button';
        addP.textContent = '＋属性';
        addP.style.marginLeft = '12px';
        addP.onclick = () => {
          let n = 'prop', i = 1;
          while (n in (t.properties || {})) n = 'prop' + (++i);
          if (!t.properties) t.properties = {};
          if (!t.types) t.types = {};
          t.properties[n] = '';
          t.types[n] = 'string';
          renderObjectTypesList();
        };
        list.appendChild(addP);
      });
    }

    function exportObjectTypes() {
      const arr = (state.objectTypes || []).map((t) => ({
        name: t.name,
        color: t.color,
        properties: Object.entries(t.properties || {}).map(([name, value]) => ({
          name, type: (t.types || {})[name] || 'string', value
        }))
      }));
      downloadText('objecttypes.json', 'application/json', JSON.stringify(arr, null, 2));
    }

    /* ---------- 5. Minimal World support ---------- */
    function renderWorldPanel() {
      const panel = $('#worldPanel');
      if (!panel) return;
      if (!state.world) {
        panel.textContent = '未加载 .world';
        return;
      }
      panel.innerHTML = '';
      const head = document.createElement('div');
      head.textContent = '地图 ' + ((state.world.maps || []).length) + ' · 点选切换';
      head.style.cssText = 'font-size:11px;color:#9aa3b2;padding:4px 8px';
      panel.appendChild(head);
      (state.world.maps || []).forEach((m) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-map-btn';
        btn.textContent = (m.fileName || '?') + '  (' + (m.x || 0) + ',' + (m.y || 0) + ')';
        if (state.mapFileName && basename(m.fileName) === basename(state.mapFileName)) {
          btn.style.outline = '1px solid #60a5fa';
        }
        btn.onclick = () => openWorldMap(m.fileName);
        panel.appendChild(btn);
      });
      (state.world.patterns || []).forEach((p, i) => {
        const d = document.createElement('div');
        d.style.cssText = 'font-size:10px;color:#7a8494;padding:2px 8px';
        d.textContent = 'pattern[' + i + ']: ' + (p.regexp || '');
        panel.appendChild(d);
      });
    }

    async function openWorldMap(fileName) {
      const base = basename(fileName);
      let file = state.worldFiles.get(base) || state.worldFiles.get(fileName) || state.assetFileIndex.get(base);
      if (!file && state.assetDirHandle) {
        // try walk already indexed
        file = state.assetFileIndex.get(fileName);
      }
      if (!file) {
        api.status('找不到 ' + base + ' — 请用资源目录或同时打开该地图');
        api.log('World 切换失败：' + fileName);
        // offer file picker
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.tmx,.tmj,.json';
        inp.onchange = () => {
          if (inp.files[0]) {
            state.worldFiles.set(inp.files[0].name, inp.files[0]);
            api.openFile(inp.files[0], [inp.files[0], ...state.assetFileIndex.values()]);
            renderWorldPanel();
          }
        };
        inp.click();
        return;
      }
      const bundle = [file, ...state.assetFileIndex.values(), ...state.worldFiles.values()];
      await api.openFile(file, bundle);
      renderWorldPanel();
    }

    window.__tiledOnWorldFile = async function (file, files, text) {
      indexFiles(files);
      let world;
      try { world = JSON.parse(text); } catch (e) {
        api.status('World JSON 无效');
        return;
      }
      if (world.type && world.type !== 'world') {
        api.log('警告：JSON type=' + world.type + '，仍按 world 处理');
      }
      state.world = world;
      state.worldFiles = new Map();
      Array.from(files || []).forEach((f) => state.worldFiles.set(f.name, f));
      renderWorldPanel();
      api.status('已加载 World：' + ((world.maps || []).length) + ' 地图');
      api.log('World：' + file.name);
      // auto-open first map if available
      const first = (world.maps || [])[0];
      if (first) await openWorldMap(first.fileName);
    };

    async function loadWorldDialog() {
      const inp = $('#worldInput');
      if (inp) {
        inp.onchange = async () => {
          if (!inp.files[0]) return;
          const f = inp.files[0];
          const text = await f.text();
          await window.__tiledOnWorldFile(f, inp.files, text);
        };
        inp.click();
      }
    }

    /* ---------- 6. Minimal browser TiledCLI ---------- */
    window.TiledCLI = {
      version: () => '1.2.4-web',
      exportFormats: () => ['json', 'tmx', 'csv', 'png'],
      /** Match common `tiled --export-map` helpers (in-browser download) */
      exportMap: function (format, fileName) {
        if (!state.map) throw new Error('no map');
        format = (format || 'json').toLowerCase().replace(/^\./, '');
        const base = (fileName || state.mapFileName || 'map').replace(/\.(tmx|tmj|json|csv|png)$/i, '');
        if (format === 'json' || format === 'tmj') {
          downloadText(base + '.tmj', 'application/json', JSON.stringify(state.map, null, 2));
          return base + '.tmj';
        }
        if (format === 'tmx') {
          const xml = F.exportTmxWithEmbedded ? F.exportTmxWithEmbedded() : api.toTmx();
          downloadText(base + '.tmx', 'application/xml', xml);
          return base + '.tmx';
        }
        if (format === 'csv') {
          api.saveCsv();
          return base + '.csv';
        }
        if (format === 'png') {
          api.exportPng();
          return base + '.png';
        }
        throw new Error('unsupported format: ' + format);
      },
      exportTileset: function (format) {
        const ts = state.tileset;
        if (!ts) throw new Error('no tileset');
        format = (format || 'tsj').toLowerCase();
        const data = {
          name: ts.name, tilewidth: ts.tileWidth || ts.tilewidth,
          tileheight: ts.tileHeight || ts.tileheight,
          tilecount: ts.count, columns: ts.columns,
          image: ts.image || '', imagewidth: 0, imageheight: 0,
          tiles: ts.tiles, wangsets: ts.wangSets, terrains: ts.terrains
        };
        if (format === 'tsx') {
          // minimal TSX
          const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset name="${api.xmlEscape(data.name || '')}" tilewidth="${data.tilewidth}" tileheight="${data.tileheight}" tilecount="${data.tilecount || 0}" columns="${data.columns || 0}">\n</tileset>\n`;
          downloadText((data.name || 'tileset') + '.tsx', 'application/xml', xml);
          return (data.name || 'tileset') + '.tsx';
        }
        downloadText((data.name || 'tileset') + '.tsj', 'application/json', JSON.stringify(data, null, 2));
        return (data.name || 'tileset') + '.tsj';
      },
      help: function () {
        return [
          'TiledCLI (browser subset of tiled --export-map):',
          '  TiledCLI.version()',
          '  TiledCLI.exportFormats() → json|tmx|csv|png',
          '  TiledCLI.exportMap("tmx"|"json"|"csv"|"png", name?)',
          '  TiledCLI.exportTileset("tsj"|"tsx")',
          '  TiledCLI.listAutomapRules()',
          '  TiledCLI.applyAutomap()',
          'Not a Qt plugin host — no --export-plugins scripting engine.'
        ].join('\n');
      },
      listAutomapRules: () => (state.automapRules || []).map((c) => ({ name: c.name, rules: c.rules.length })),
      applyAutomap: () => { if (F.runAutomap) return F.runAutomap(); api.status('无 automap'); }
    };

    /* ---------- UI actions ---------- */
    function showCliHelp() {
      api.log(window.TiledCLI.help());
      api.status('CLI 帮助已写入控制台');
      try { console.log(window.TiledCLI.help()); } catch (_) {}
    }

    document.querySelectorAll('[data-action]').forEach((b) => {
      const a = b.dataset.action;
      const prev = b.onclick;
      if (a === 'rule-edit') b.onclick = () => openRuleEditor();
      else if (a === 'close-rule-edit') b.onclick = () => closeRuleEditor();
      else if (a === 'rule-export-tmj') b.onclick = () => downloadText('rule.tmj', 'application/json', ruleMapToTmj());
      else if (a === 'rule-export-tmx') b.onclick = () => downloadText('rule.tmx', 'application/xml', ruleMapToTmx());
      else if (a === 'rule-apply-session') b.onclick = () => applyRuleToSession();
      else if (a === 'rule-add-input') b.onclick = () => {
        const re = ensureRuleEdit();
        const m = re.map;
        let n = 1, name = 'input_Layer';
        while ((m.layers || []).some((l) => l.name === name)) name = 'input_Layer' + (++n);
        const id = Math.max(0, ...(m.layers || []).map((l) => l.id || 0)) + 1;
        m.layers.push({
          id, name, type: 'tilelayer', width: m.width, height: m.height, opacity: 1, visible: true,
          data: Array(m.width * m.height).fill(0), properties: { StrictEmpty: false }
        });
        re.layerIdx = m.layers.length - 1;
        refreshRuleLayerSelect();
        drawRuleCanvas();
      };
      else if (a === 'rule-add-output') b.onclick = () => {
        const re = ensureRuleEdit();
        const m = re.map;
        let n = 1, name = 'output_Layer';
        while ((m.layers || []).some((l) => l.name === name)) name = 'output_Layer' + (++n);
        const id = Math.max(0, ...(m.layers || []).map((l) => l.id || 0)) + 1;
        m.layers.push({
          id, name, type: 'tilelayer', width: m.width, height: m.height, opacity: 1, visible: true,
          data: Array(m.width * m.height).fill(0)
        });
        re.layerIdx = m.layers.length - 1;
        refreshRuleLayerSelect();
        drawRuleCanvas();
      };
      else if (a === 'rule-add-objout') b.onclick = () => {
        const re = ensureRuleEdit();
        const m = re.map;
        let name = 'output_Objects';
        let n = 1;
        while ((m.layers || []).some((l) => l.name === name)) name = 'output_Objects' + (++n);
        const id = Math.max(0, ...(m.layers || []).map((l) => l.id || 0)) + 1;
        m.layers.push({ id, name, type: 'objectgroup', objects: [], opacity: 1, visible: true });
        re.layerIdx = m.layers.length - 1;
        refreshRuleLayerSelect();
        drawRuleCanvas();
      };
      else if (a === 'rule-add-rect-obj') b.onclick = () => {
        const re = ensureRuleEdit();
        const layer = ruleLayer();
        if (!layer || layer.type !== 'objectgroup') {
          api.status('请先选中对象输出层');
          return;
        }
        if (!layer.objects) layer.objects = [];
        const id = Math.max(0, ...layer.objects.map((o) => o.id || 0)) + 1;
        layer.objects.push({
          id, name: 'obj' + id, type: '', x: 0, y: 0,
          width: re.map.tilewidth || 32, height: re.map.tileheight || 32,
          rotation: 0, visible: true, properties: {}
        });
        drawRuleCanvas();
      };
      else if (a === 'rule-resize') b.onclick = () => {
        const re = ensureRuleEdit();
        const w = Math.max(1, Number($('#ruleMapW').value) || 8);
        const h = Math.max(1, Number($('#ruleMapH').value) || 8);
        const old = re.map;
        const next = blankRuleMap(w, h, old.tilewidth, old.tileheight);
        // copy overlapping
        (old.layers || []).forEach((ol, i) => {
          let nl = next.layers[i];
          if (!nl) {
            nl = JSON.parse(JSON.stringify(ol));
            if (nl.type === 'tilelayer') {
              nl.width = w; nl.height = h;
              nl.data = Array(w * h).fill(0);
            }
            next.layers.push(nl);
          }
          if (ol.type === 'tilelayer' && nl.type === 'tilelayer') {
            nl.name = ol.name;
            nl.properties = ol.properties;
            for (let y = 0; y < Math.min(h, old.height); y++)
              for (let x = 0; x < Math.min(w, old.width); x++)
                nl.data[y * w + x] = ol.data[y * old.width + x] || 0;
          } else if (ol.type === 'objectgroup') {
            nl.name = ol.name;
            nl.objects = (ol.objects || []).slice();
          }
        });
        // keep extra layers from old
        for (let i = next.layers.length; i < (old.layers || []).length; i++) {
          const ol = old.layers[i];
          if (ol.type === 'tilelayer') {
            const data = Array(w * h).fill(0);
            for (let y = 0; y < Math.min(h, old.height); y++)
              for (let x = 0; x < Math.min(w, old.width); x++)
                data[y * w + x] = ol.data[y * old.width + x] || 0;
            next.layers.push({ ...ol, width: w, height: h, data });
          } else next.layers.push(JSON.parse(JSON.stringify(ol)));
        }
        next.properties = old.properties;
        re.map = next;
        refreshRuleLayerSelect();
        drawRuleCanvas();
      };
      else if (a === 'bind-assets') b.onclick = () => bindAssetDirectory();
      else if (a === 'load-world') b.onclick = () => loadWorldDialog();
      else if (a === 'object-types') b.onclick = () => {
        const modal = $('#objectTypesEditor');
        if (modal) { modal.classList.remove('hidden'); modal.setAttribute('aria-hidden', 'false'); }
        renderObjectTypesList();
      };
      else if (a === 'close-object-types') b.onclick = () => {
        const modal = $('#objectTypesEditor');
        if (modal) { modal.classList.add('hidden'); modal.setAttribute('aria-hidden', 'true'); }
      };
      else if (a === 'ot-add') b.onclick = () => {
        state.objectTypes.push({ name: 'NewType', color: '#ff8800', properties: {}, types: {} });
        renderObjectTypesList();
      };
      else if (a === 'ot-export') b.onclick = () => exportObjectTypes();
      else if (a === 'cli-help') b.onclick = () => showCliHelp();
    });

    const otInput = $('#objectTypesInput');
    if (otInput) {
      otInput.onchange = async () => {
        const f = otInput.files && otInput.files[0];
        if (!f) return;
        const text = await f.text();
        try {
          if (/\.xml$/i.test(f.name) || text.trim().startsWith('<')) {
            state.objectTypes = parseObjectTypesXml(text);
          } else {
            state.objectTypes = parseObjectTypesJson(text);
          }
          renderObjectTypesList();
          api.status('已载入 ' + state.objectTypes.length + ' 个对象类型');
          api.renderAll();
        } catch (err) {
          api.status('对象类型解析失败');
          api.log(String(err.message || err));
        }
      };
    }

    // Let rule browser open editor on a rule
    const _openBrowser = F.openAutomapBrowser;
    if (_openBrowser) {
      F.openAutomapBrowser = function () {
        _openBrowser();
        // add edit buttons into browser if present
        setTimeout(() => {
          const browser = $('#automapBrowser');
          if (!browser || browser.querySelector('[data-rule-edit-idx]')) return;
          (state.automapRules || []).forEach((c, ci) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '编辑规则图 #' + ci;
            btn.dataset.ruleEditIdx = String(ci);
            btn.style.margin = '4px';
            btn.onclick = () => openRuleEditor(c);
            const body = browser.querySelector('.collision-editor-inner') || browser;
            body.appendChild(btn);
          });
        }, 0);
      };
    }

    // Refresh wang templates when tileset/wang changes
    const _renderAll = api.renderAll;
    api.renderAll = function () {
      _renderAll();
      renderWangTemplates();
      renderWorldPanel();
    };

    bindRuleEditor();
    renderWangTemplates();
    renderWorldPanel();

    Object.assign(F, {
      openRuleEditor, ruleMapToTmj, ruleMapToTmx, applyRuleToSession,
      getSurroundingPoints, surroundingWangIdFull, templateWangIdAt,
      bindAssetDirectory, parseObjectTypesJson, findObjectType,
      renderWangTemplates, renderWorldPanel
    });

    api.log('Batch4：规则编辑 / 资源目录 / 交错 WangFiller / Wang模板 / 对象类型继承 / World / TiledCLI');
  }

  window.initTiledBatch4 = boot;
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 60);
})();

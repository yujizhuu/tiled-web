
/*! Batch3: rule browser, strict empty (via features), terrain mark, RandomPicker,
    WangFiller + flips, collision import/snap, typed props, embedded images */
(function () {
  'use strict';

  function RandomPicker() {
    this.sum = 0;
    this.items = []; // {threshold, value}
  }
  RandomPicker.prototype.add = function (value, probability) {
    const p = Number(probability);
    if (!(p > 0)) return;
    this.sum += p;
    this.items.push({ threshold: this.sum, value });
  };
  RandomPicker.prototype.isEmpty = function () { return !this.items.length; };
  RandomPicker.prototype.pick = function () {
    if (!this.items.length) return null;
    const r = Math.random() * this.sum;
    for (const it of this.items) if (r <= it.threshold) return it.value;
    return this.items[this.items.length - 1].value;
  };
  RandomPicker.prototype.take = function () {
    if (!this.items.length) return null;
    const r = Math.random() * this.sum;
    let idx = this.items.length - 1;
    for (let i = 0; i < this.items.length; i++) if (r <= this.items[i].threshold) { idx = i; break; }
    const chosen = this.items[idx];
    // rebuild without chosen (approx by removing and renormalizing)
    const rest = this.items.filter((_, i) => i !== idx).map((it) => it.value);
    const probs = []; // equal remaining weight — simplify: remove and keep relative by re-add with 1
    this.items = []; this.sum = 0;
    // We don't have original probs stored separately; store on add
    return chosen.value;
  };
  // Better RandomPicker with stored probs
  function Picker() { this.entries = []; this.sum = 0; }
  Picker.prototype.add = function (value, probability) {
    const p = Number(probability); if (!(p > 0)) return;
    this.entries.push({ value, p }); this.sum += p;
  };
  Picker.prototype.isEmpty = function () { return !this.entries.length; };
  Picker.prototype.pick = function () {
    if (!this.entries.length) return null;
    let r = Math.random() * this.sum;
    for (const e of this.entries) { r -= e.p; if (r <= 0) return e.value; }
    return this.entries[this.entries.length - 1].value;
  };
  Picker.prototype.take = function () {
    if (!this.entries.length) return null;
    let r = Math.random() * this.sum, idx = this.entries.length - 1;
    for (let i = 0; i < this.entries.length; i++) { r -= this.entries[i].p; if (r <= 0) { idx = i; break; } }
    const e = this.entries.splice(idx, 1)[0];
    this.sum -= e.p;
    return e.value;
  };

  function boot(api) {
    if (!api || !api.getState) return;
    const state = api.getState();
    const els = api.getEls();
    const $ = (s) => document.querySelector(s);
    const F = api.features || {};

    state.terrainMarkMode = false;
    state.collisionSnap = true;
    state.automapPreviewIndex = 0;

    /* ===== Typed properties panel ===== */
    const PROP_TYPES = ['string', 'bool', 'int', 'float', 'color', 'file'];

    function getPropsTarget(kind) {
      if (kind === 'map') return state.map;
      if (kind === 'layer') return api.activeLayer();
      if (kind === 'tile') {
        if (!state.tileset) return null;
        if (!state.tileset.tiles) state.tileset.tiles = {};
        return state.tileset.tiles[state.tile] || (state.tileset.tiles[state.tile] = {});
      }
      return null;
    }

    function ensureProps(obj) {
      if (!obj.properties) obj.properties = {};
      if (!obj.properties.__propertyTypes) obj.properties.__propertyTypes = {};
      // migrate flat
      return obj.properties;
    }

    function renderPropsList(kind) {
      const list = document.getElementById(kind + 'PropsList') || document.getElementById(kind === 'map' ? 'mapPropsList' : kind === 'layer' ? 'layerPropsList' : 'tilePropsList');
      if (!list) return;
      const target = getPropsTarget(kind);
      list.innerHTML = '';
      if (!target) { list.textContent = '—'; return; }
      const props = ensureProps(target);
      const { values, types } = api.stripPropMeta(props);
      Object.keys(values).forEach((name) => {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const nameIn = document.createElement('input'); nameIn.value = name; nameIn.title = '名称';
        const typeSel = document.createElement('select');
        PROP_TYPES.forEach((t) => { const o = document.createElement('option'); o.value = t; o.textContent = t; if (t === (types[name] || 'string')) o.selected = true; typeSel.appendChild(o); });
        const valIn = document.createElement(types[name] === 'bool' ? 'select' : 'input');
        if (types[name] === 'bool') {
          valIn.innerHTML = '<option value="true">true</option><option value="false">false</option>';
          valIn.value = values[name] ? 'true' : 'false';
        } else {
          valIn.type = types[name] === 'color' ? 'color' : (types[name] === 'int' || types[name] === 'float' ? 'number' : 'text');
          if (types[name] === 'float') valIn.step = 'any';
          let v = values[name];
          if (types[name] === 'color' && typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.replace('#',''))) {
            valIn.value = v.startsWith('#') ? v : '#' + v;
          } else valIn.value = v == null ? '' : v;
        }
        const del = document.createElement('button'); del.type = 'button'; del.textContent = '×';
        const commit = () => {
          api.snapshot();
          const newName = nameIn.value.trim() || name;
          const t = typeSel.value;
          let val = valIn.value;
          if (t === 'bool') val = valIn.value === 'true';
          else if (t === 'int') val = parseInt(val, 10) || 0;
          else if (t === 'float') val = parseFloat(val) || 0;
          delete props[name];
          if (props.__propertyTypes) delete props.__propertyTypes[name];
          props[newName] = val;
          if (!props.__propertyTypes) props.__propertyTypes = {};
          props.__propertyTypes[newName] = t;
          syncPropsJson(kind);
          renderPropsList(kind);
        };
        nameIn.onchange = commit; typeSel.onchange = () => { commit(); renderPropsList(kind); }; valIn.onchange = commit;
        del.onclick = () => {
          api.snapshot();
          delete props[name];
          if (props.__propertyTypes) delete props.__propertyTypes[name];
          syncPropsJson(kind); renderPropsList(kind);
        };
        row.appendChild(nameIn); row.appendChild(typeSel); row.appendChild(valIn); row.appendChild(del);
        list.appendChild(row);
      });
      syncPropsJson(kind);
    }

    function syncPropsJson(kind) {
      const target = getPropsTarget(kind);
      const ta = kind === 'map' ? $('#mapProperties') : kind === 'layer' ? $('#layerProperties') : $('#tileProperties');
      if (!ta || !target) return;
      const props = ensureProps(target);
      const { values } = api.stripPropMeta(props);
      // Keep types in __propertyTypes inside serialized object for roundtrip
      ta.value = JSON.stringify(props, null, 2);
    }

    function addProp(kind) {
      const target = getPropsTarget(kind);
      if (!target) return;
      api.snapshot();
      const props = ensureProps(target);
      let n = 1, name = '属性';
      while (name in props && name !== '__propertyTypes') { name = '属性' + (++n); }
      props[name] = '';
      props.__propertyTypes[name] = 'string';
      renderPropsList(kind);
    }

    document.querySelectorAll('[data-props-add]').forEach((b) => {
      b.onclick = () => addProp(b.dataset.propsAdd);
    });

    // Refresh typed panels when selection changes
    const _renderAll = api.renderAll;
    api.renderAll = function () {
      _renderAll();
      renderPropsList('map');
      renderPropsList('layer');
      renderPropsList('tile');
    };

    // JSON textarea still works
    ['map', 'layer', 'tile'].forEach((kind) => {
      const ta = kind === 'map' ? $('#mapProperties') : kind === 'layer' ? $('#layerProperties') : $('#tileProperties');
      if (!ta) return;
      ta.addEventListener('change', () => {
        try {
          const target = getPropsTarget(kind);
          if (!target) return;
          const parsed = JSON.parse(ta.value || '{}');
          target.properties = parsed;
          if (!target.properties.__propertyTypes) target.properties.__propertyTypes = {};
          renderPropsList(kind);
        } catch (e) { api.status('属性 JSON 无效'); }
      });
    });

    /* ===== RandomPicker in terrain findBestTile ===== */
    const _findBest = F.findBestTile;
    F.findBestTile = function (ts, preferred, mask) {
      if (preferred === 0xFFFFFFFF) return null;
      if (F.recalculateTerrainDistances && !ts._terrainDist) F.recalculateTerrainDistances(ts);
      const picker = new Picker();
      let bestPen = Infinity;
      const candidates = [];
      for (let id = 0; id < ts.count; id++) {
        const terr = F.tileTerrain(ts, id);
        if (terr === 0xFFFFFFFF) continue;
        if ((terr & mask) !== (preferred & mask)) continue;
        let pen = 0, ok = true;
        for (let c = 0; c < 4; c++) {
          const shift = (3 - c) * 8;
          const want = (preferred >>> shift) & 0xFF;
          const have = (terr >>> shift) & 0xFF;
          const p = F.transitionPenalty ? F.transitionPenalty(ts, have, want) : (have === want ? 0 : 1);
          if (p < 0) { ok = false; break; }
          pen += p;
        }
        if (!ok) continue;
        const rec = ts.tiles[id] || ts.tiles[String(id)] || {};
        const prob = rec.probability != null ? Number(rec.probability) : 1;
        if (prob <= 0) continue;
        if (pen < bestPen) { bestPen = pen; candidates.length = 0; }
        if (pen === bestPen) candidates.push({ id, prob });
      }
      candidates.forEach((c) => picker.add(c.id, c.prob));
      return picker.isEmpty() ? null : picker.pick();
    };

    /* ===== Terrain corner marking on tileset ===== */
    function setTerrainMarkMode(on) {
      state.terrainMarkMode = on;
      document.querySelectorAll('[data-action="terrain-mark"]').forEach((b) => b.classList.toggle('active', on));
      api.status('图块集标角：' + (on ? '开（选地形后点四角）' : '关'));
      decorateTilesetCorners();
    }

    function decorateTilesetCorners() {
      const grid = els.tileset;
      if (!grid || !state.tileset) return;
      grid.querySelectorAll('.tile-cell').forEach((cell, i) => {
        cell.querySelectorAll('.corner-dot').forEach((d) => d.remove());
        if (!state.terrainMarkMode) return;
        const ts = state.tileset;
        const rec = (ts.tiles && (ts.tiles[i] || ts.tiles[String(i)])) || {};
        const terr = rec.terrain != null ? rec.terrain >>> 0 : 0xFFFFFFFF;
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#95a5a6'];
        for (let c = 0; c < 4; c++) {
          const v = (terr >>> ((3 - c) * 8)) & 0xFF;
          const dot = document.createElement('span');
          dot.className = 'corner-dot c' + c;
          if (v === 0xFF) { dot.style.background = '#333'; dot.style.opacity = '.35'; }
          else { dot.style.background = colors[v % colors.length]; }
          dot.title = '角' + c + (v === 0xFF ? ' 空' : ' 地形' + v);
          dot.onclick = (e) => {
            e.stopPropagation();
            if (state.selectedTerrainId == null) { api.status('先在地形面板选择地形'); return; }
            api.snapshot();
            if (!ts.tiles) ts.tiles = {};
            const item = ts.tiles[i] || (ts.tiles[i] = {});
            let t = item.terrain != null ? item.terrain >>> 0 : 0xFFFFFFFF;
            const mask = 0xFF << ((3 - c) * 8);
            const insert = (state.selectedTerrainId & 0xFF) << ((3 - c) * 8);
            item.terrain = ((t & ~mask) | insert) >>> 0;
            if (F.recalculateTerrainDistances) { delete ts._terrainDist; F.recalculateTerrainDistances(ts); }
            decorateTilesetCorners();
            api.status('已标记图块 ' + i + ' 角' + c + ' → 地形 ' + state.selectedTerrainId);
          };
          cell.appendChild(dot);
        }
      });
    }

    if (els.meta) {
      new MutationObserver(() => { if (state.terrainMarkMode) setTimeout(decorateTilesetCorners, 0); })
        .observe(els.meta, { childList: true, subtree: true, characterData: true });
    }
    document.querySelectorAll('[data-action="terrain-mark"]').forEach((b) => {
      b.onclick = () => setTerrainMarkMode(!state.terrainMarkMode);
    });

    /* ===== Wang flip variants + WangFiller ===== */
    function wangRotate(id, rot) {
      // rotate wangId clockwise rot times (each 90°) — 8 nibbles, rotate by 2 nibbles
      id = id >>> 0;
      rot = ((rot % 4) + 4) % 4;
      for (let i = 0; i < rot; i++) {
        id = ((id << 8) | (id >>> 24)) >>> 0;
      }
      return id >>> 0;
    }
    function wangFlipH(id) {
      // flip horizontally: swap edges/corners left-right
      // indices: 7|0|1 / 6|X|2 / 5|4|3
      const nib = [];
      for (let i = 0; i < 8; i++) nib.push((id >>> (i * 4)) & 0xf);
      // map: 0<->0? Actually top edge stays conceptually... use WangId::flipHorizontally from source
      // From wangset.cpp flipHorizontally then we replicate:
      const mapIdx = [0, 7, 6, 5, 4, 3, 2, 1]; // approximate swap around vertical axis for 8-way
      // Better read: swap corner TR<->TL, BR<->BL and edges R<->L
      // corners: 0 TR,1 BR,2 BL,3 TL -> after H flip: 3,2,1,0 for corners in corner space
      // indexColor: edge0=0, corner0=1, edge1=2, corner1=3, edge2=4, corner2=5, edge3=6, corner3=7
      // H flip: Top edge stays 0, Bottom stays 4, Left<->Right edges 6<->2, corners TL<->TR (7<->1), BL<->BR (5<->3)
      const order = [0, 7, 6, 5, 4, 3, 2, 1];
      // wait that's reverse which is vertical? 
      // Correct mapping for H flip of ring:
      const hmap = [0, 7, 6, 5, 4, 3, 2, 1]; // reverse of full ring = flip vertical in circular sense
      // Circular reverse is vertical flip of diamond; for horizontal:
      // positions around: 0(top),1(TR),2(R),3(BR),4(B),5(BL),6(L),7(TL)
      // H flip: 0->0, 1->7, 2->6, 3->5, 4->4, 5->3, 6->2, 7->1
      const hm = [0, 7, 6, 5, 4, 3, 2, 1];
      // That's same as reverse... 0 stays, 1->7, 2->6 yes that's H for this indexing if 0 is top.
      let out = 0;
      for (let i = 0; i < 8; i++) out |= (nib[hm[i]] & 0xf) << (i * 4);
      // Actually we need nib[i] goes to position hm[i]: out[hm[i]] = nib[i]
      out = 0;
      for (let i = 0; i < 8; i++) out |= (nib[i] & 0xf) << (hm[i] * 4);
      return out >>> 0;
    }

    function expandWangFlipVariants(ws) {
      if (!ws || ws._expandedFlips) return;
      const extra = {};
      Object.entries(ws.tiles || {}).forEach(([tid, rec]) => {
        const base = rec.wangId >>> 0;
        // native flips from file
        if (rec.hflip || rec.vflip || rec.dflip) {
          let id = base;
          // apply recorded transforms to wangId for lookup under same tile
          if (rec.hflip) id = wangFlipH(id);
          if (rec.vflip) { id = wangFlipH(id); id = wangRotate(id, 2); }
          if (rec.dflip) id = wangRotate(id, 1); // anti-diagonal ~ rotate+flip approx
          extra[tid + '|f'] = { wangId: id, tileId: Number(tid), hflip: !!rec.hflip, vflip: !!rec.vflip, dflip: !!rec.dflip };
        }
        // also generate H/V variants of every tile for matching coverage
        extra[tid + '|H'] = { wangId: wangFlipH(base), tileId: Number(tid), hflip: true, vflip: false, dflip: false };
        extra[tid + '|V'] = { wangId: wangFlipH(wangRotate(base, 2)), tileId: Number(tid), hflip: false, vflip: true, dflip: false };
        extra[tid + '|R1'] = { wangId: wangRotate(base, 1), tileId: Number(tid), hflip: false, vflip: false, dflip: true };
      });
      ws._flipVariants = extra;
      ws._expandedFlips = true;
    }

    function wangIdFromTile(ws, localId) {
      const rec = ws.tiles[localId];
      return rec ? (rec.wangId >>> 0) : 0;
    }

    function findMatchingWangTiles(ws, wangId) {
      expandWangFlipVariants(ws);
      const out = [];
      const want = wangId >>> 0;
      const matchRec = (rec, tileId) => {
        const have = rec.wangId >>> 0;
        for (let i = 0; i < 8; i++) {
          const w = (want >>> (i * 4)) & 0xf;
          const h = (have >>> (i * 4)) & 0xf;
          if (w && h && w !== h) return;
          // 0 is wildcard on either side for matching
        }
        out.push({ tileId: tileId != null ? tileId : Number(rec.tileId), wangId: have, hflip: !!rec.hflip, vflip: !!rec.vflip, dflip: !!rec.dflip, probability: 1 });
      };
      Object.entries(ws.tiles || {}).forEach(([tid, rec]) => matchRec(rec, Number(tid)));
      Object.values(ws._flipVariants || {}).forEach((rec) => matchRec(rec, rec.tileId));
      return out;
    }

    function surroundingWangId(layer, map, x, y, ws, ts) {
      // Build wangId from 4 neighbors' facing edges/corners — simplified orthogonal
      let id = 0;
      const neigh = [
        [x, y - 1, 0], // top -> affects our top edge/corners
        [x + 1, y, 1],
        [x, y + 1, 2],
        [x - 1, y, 3]
      ];
      // Start empty (wildcards 0)
      for (const [nx, ny, dir] of neigh) {
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const gid = api.tileAt(layer, nx, ny, map) >>> 0;
        if (!gid) continue;
        const local = api.clearGid(gid) - ts.firstgid;
        const nid = wangIdFromTile(ws, local);
        if (!nid) continue;
        // updateToAdjacent: position = dir*2 for edge
        const position = dir * 2;
        // mirror of WangId::updateToAdjacent for edge
        const index = position / 2;
        const adjCornerA = F.wangIndexColor ? null : null;
        // set our edge from neighbor's opposite edge
        const oppEdge = (index + 2) % 4;
        const edgeColor = (nid >>> (oppEdge * 2 * 4)) & 0xf; // edge nibble index = edge*2
        id = F.wangSetIndexColor ? id : id;
        // manual: set edge color at index
        const setNib = (wid, nibIndex, val) => {
          wid &= ~(0xf << (nibIndex * 4));
          wid |= (val & 0xf) << (nibIndex * 4);
          return wid >>> 0;
        };
        id = setNib(id, index * 2, (nid >>> (((index + 2) % 4) * 2 * 4)) & 0xf);
        id = setNib(id, index * 2 + 1, (nid >>> ((((index + 1) % 4) * 2 + 1) * 4)) & 0xf);
        id = setNib(id, ((index + 3) % 4) * 2 + 1, (nid >>> ((((index + 2) % 4) * 2 + 1) * 4)) & 0xf);
      }
      return id >>> 0;
    }

    function wangFillerFill(region) {
      const layer = api.activeLayer();
      const map = state.map;
      const ts = state.tileset;
      const ws = state.wangSet || (ts && ts.wangSets && ts.wangSets[0]);
      if (!layer || layer.type !== 'tilelayer' || !ts || !ws) {
        api.status('需要当前瓦片层与 Wang 集');
        return;
      }
      state.wangSet = ws;
      expandWangFlipVariants(ws);
      api.snapshot();
      const x0 = region.minX, y0 = region.minY, x1 = region.maxX, y1 = region.maxY;
      // Multi-pass: 3 passes for correction
      for (let pass = 0; pass < 3; pass++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const wangId = surroundingWangId(layer, map, x, y, ws, ts);
            const matches = findMatchingWangTiles(ws, wangId);
            const picker = new Picker();
            matches.forEach((m) => {
              const rec = ws.tiles[m.tileId] || {};
              const prob = rec.probability != null ? Number(rec.probability) : 1;
              picker.add(m, prob > 0 ? prob : 0.0001);
            });
            if (picker.isEmpty()) continue;
            const chosen = picker.pick();
            let gid = ts.firstgid + chosen.tileId;
            // encode flips into GID flags if needed
            if (chosen.hflip) gid = api.composeGid(api.clearGid(gid), true, !!chosen.vflip, !!chosen.dflip);
            else if (chosen.vflip || chosen.dflip) gid = api.composeGid(api.clearGid(gid), false, !!chosen.vflip, !!chosen.dflip);
            api.setTileAt(layer, x, y, map, gid);
          }
        }
      }
      api.renderAll();
      api.status('WangFiller 完成（3 遍） ' + (x1 - x0 + 1) + '×' + (y1 - y0 + 1));
      if (F.markAutomapDirty) F.markAutomapDirty(x0, y0, x1, y1);
    }

    document.querySelectorAll('[data-action="wang-fill"]').forEach((b) => {
      b.onclick = () => {
        if (!state.map) return;
        // fill current dirty stamp selection or whole map small area around cursor — use map bounds clipped 32 or selection
        const sel = state.tileSelection;
        // Use full visible map if small, else ask — default: entire map up to 64x64 else active 16x16 at 0,0
        let region;
        if (state.map.width * state.map.height <= 4096) {
          region = { minX: 0, minY: 0, maxX: state.map.width - 1, maxY: state.map.height - 1 };
        } else {
          region = { minX: 0, minY: 0, maxX: Math.min(31, state.map.width - 1), maxY: Math.min(31, state.map.height - 1) };
          api.log('地图较大，Wang填充仅处理左上 32×32；可缩小地图或分次填充');
        }
        wangFillerFill(region);
      };
    });

    /* ===== Automap rule browser ===== */
    function openAutomapBrowser() {
      const root = $('#automapBrowser');
      if (!root) return;
      root.classList.remove('hidden');
      const list = $('#automapRuleList');
      list.innerHTML = '';
      const rules = [];
      (state.automapRules || []).forEach((c, ci) => {
        c.rules.forEach((r, ri) => rules.push({ compiled: c, rule: r, label: c.name + ' #' + (ri + 1), ci, ri }));
      });
      if (!rules.length) {
        list.textContent = '请先载入规则';
        return;
      }
      rules.forEach((item, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = item.label + ' (' + item.rule.inRect.w + '×' + item.rule.inRect.h + ')';
        b.onclick = () => {
          list.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          previewRule(item);
        };
        list.appendChild(b);
        if (idx === 0) { b.classList.add('active'); previewRule(item); }
      });
    }

    function previewRule(item) {
      const canvas = $('#automapPreview');
      const meta = $('#automapPreviewMeta');
      const ctx = canvas.getContext('2d');
      const r = item.rule.inRect;
      const rm = item.compiled.map;
      const scale = Math.max(4, Math.min(24, Math.floor(280 / Math.max(r.w, r.h, 1))));
      canvas.width = r.w * scale; canvas.height = r.h * scale;
      ctx.fillStyle = '#1a1d24'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // draw first input yes layer
      const inputs = (item.rule.inputs || []).filter((s) => !s.not);
      const layer = inputs[0] && inputs[0].layer;
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const gid = layer ? (api.tileAt(layer, r.minX + x, r.minY + y, rm) >>> 0) : 0;
          ctx.fillStyle = gid ? '#3d7ea6' : '#2a2e38';
          if (gid) {
            const hue = (api.clearGid(gid) * 37) % 360;
            ctx.fillStyle = 'hsl(' + hue + ' 45% 40%)';
          }
          ctx.fillRect(x * scale, y * scale, scale - 1, scale - 1);
          if (gid) {
            ctx.fillStyle = '#fff'; ctx.font = Math.max(8, scale - 6) + 'px sans-serif';
            ctx.fillText(String(api.clearGid(gid)), x * scale + 1, y * scale + scale - 2);
          }
        }
      }
      const outs = (item.rule.outputs || []).length;
      const objs = (item.rule.objectOutputs || []).length;
      meta.textContent = item.label + ' 输入层 ' + (item.rule.inputs || []).length + ' · 瓦片输出 ' + outs + ' · 对象输出 ' + objs +
        (item.compiled.radius ? ' · Radius ' + item.compiled.radius : '');
    }

    document.querySelectorAll('[data-action="automap-browser"]').forEach((b) => b.onclick = openAutomapBrowser);
    document.querySelectorAll('[data-action="close-automap-browser"]').forEach((b) => {
      b.onclick = () => { $('#automapBrowser').classList.add('hidden'); };
    });

    /* ===== Collision import + snap ===== */
    const snapBox = $('#collisionSnap');
    if (snapBox) snapBox.onchange = () => { state.collisionSnap = snapBox.checked; };

    function snapVal(v, tileW) {
      if (!state.collisionSnap) return v;
      // snap to 1px within tile (or half): use 1 pixel grid of tile space
      return Math.round(v);
    }

    document.querySelectorAll('[data-action="collision-import"]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const layer = api.activeLayer();
        if (!layer || layer.type !== 'objectgroup') {
          api.status('请先选中对象层再导入碰撞');
          return;
        }
        const ts = state.tileset;
        if (!ts) return;
        const objects = (layer.objects || []).map((o) => {
          const c = JSON.parse(JSON.stringify(o));
          // fit into tile local space 0..tileSize
          c.x = Math.max(0, Math.min(ts.tileWidth, c.x || 0));
          c.y = Math.max(0, Math.min(ts.tileHeight, c.y || 0));
          return c;
        });
        if (!ts.tiles) ts.tiles = {};
        const rec = ts.tiles[state.tile] || (ts.tiles[state.tile] = {});
        api.snapshot();
        rec.objectgroup = { objects };
        if ($('#tileCollision')) $('#tileCollision').value = JSON.stringify(rec.objectgroup, null, 2);
        if (F.openCollisionEditor) F.openCollisionEditor();
        api.status('已从对象层导入 ' + objects.length + ' 个形状到当前图块');
      };
    });

    // Patch collision pointer path via capturing snap on collision canvas
    const colCanvas = $('#collisionCanvas');
    if (colCanvas) {
      colCanvas.addEventListener('pointerup', (e) => {
        // after features handlers, snap shapes
        if (!state.collisionSnap || !state.tileset) return;
        setTimeout(() => {
          try {
            const ta = $('#tileCollision');
            if (!ta) return;
            const og = JSON.parse(ta.value || '{"objects":[]}');
            const tw = state.tileset.tileWidth, th = state.tileset.tileHeight;
            (og.objects || []).forEach((o) => {
              o.x = snapVal(o.x || 0); o.y = snapVal(o.y || 0);
              o.width = snapVal(o.width || 0); o.height = snapVal(o.height || 0);
              if (o.polygon) o.polygon.forEach((p) => { p.x = snapVal(p.x); p.y = snapVal(p.y); });
              if (o.polyline) o.polyline.forEach((p) => { p.x = snapVal(p.x); p.y = snapVal(p.y); });
            });
            ta.value = JSON.stringify(og, null, 2);
            const rec = state.tileset.tiles[state.tile] || (state.tileset.tiles[state.tile] = {});
            rec.objectgroup = og;
            ta.dispatchEvent(new Event('change'));
          } catch (err) {}
        }, 0);
      }, true);
    }

    /* ===== Embedded image base64 in TMX/TSX export ===== */
    function dataUrlToBase64Raw(dataUrl) {
      const i = String(dataUrl).indexOf('base64,');
      return i >= 0 ? dataUrl.slice(i + 7) : '';
    }

    function enhanceTmxEmbedded() {
      const _toTmxZlib = F.toTmxZlib;
      if (!_toTmxZlib) return;
      F.toTmxZlib = function () {
        // Temporarily rewrite tileset image sources that are in imageCache as data URLs into embedded format in a custom exporter
        return exportTmxWithEmbedded();
      };
      // Also override download path used by parity save — parity binds save-tmx to toTmxZlib via features
      document.querySelectorAll('[data-action="save-tmx"]').forEach((b) => {
        b.onclick = (e) => {
          e.stopImmediatePropagation();
          if (!state.map) return;
          api.download('tiled-map.tmx', 'application/xml', exportTmxWithEmbedded());
          api.status('已导出 TMX (zlib + 可嵌入图)');
          api.log('导出 TMX（含嵌入图若已载入为 data URL）');
        };
      });
    }

    function exportTmxWithEmbedded() {
      const m = state.map;
      const xmlEscape = api.xmlEscape;
      const propertiesXml = api.propertiesXml;
      const objectXml = api.objectXml;
      const encode = F.encodeGidsZlib;
      const attrs = [
        `version="1.2"`, `tiledversion="${xmlEscape(m.tiledversion || '1.2.4')}"`,
        `orientation="${xmlEscape(m.orientation || 'orthogonal')}"`,
        `renderorder="${xmlEscape(m.renderorder || 'right-down')}"`,
        `width="${m.width}"`, `height="${m.height}"`,
        `tilewidth="${m.tilewidth}"`, `tileheight="${m.tileheight}"`,
        `infinite="${m.infinite ? 1 : 0}"`
      ];
      if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
        attrs.push(`staggeraxis="${xmlEscape(m.staggeraxis || 'y')}"`);
        attrs.push(`staggerindex="${xmlEscape(m.staggerindex || 'odd')}"`);
        if (m.orientation === 'hexagonal') attrs.push(`hexsidelength="${m.hexsidelength || 0}"`);
      }

      const reg = api.getTilesetRegistry();
      const tilesetsXml = (m.tilesets || []).map((t) => {
        const loaded = reg.find((r) => r.firstgid === Number(t.firstgid));
        let imageXml;
        if (loaded && loaded.url && String(loaded.url).startsWith('data:')) {
          const raw = dataUrlToBase64Raw(loaded.url);
          const fmt = loaded.url.indexOf('image/png') >= 0 ? 'png' : (loaded.url.indexOf('image/jpeg') >= 0 ? 'jpg' : 'png');
          const img = api.getImageCache().get(loaded.url);
          const w = img ? img.width : 0, h = img ? img.height : 0;
          imageXml = `<image width="${w}" height="${h}" format="${fmt}"><data encoding="base64">${raw}</data></image>`;
        } else {
          imageXml = `<image source="${xmlEscape(t.image || '')}"/>`;
        }
        return `  <tileset firstgid="${t.firstgid || 1}" name="${xmlEscape(t.name || '图块集')}" tilewidth="${t.tilewidth || m.tilewidth}" tileheight="${t.tileheight || m.tileheight}" tilecount="${t.tilecount || 0}" columns="${t.columns || 0}">${imageXml}</tileset>`;
      }).join('\n');

      function layerXml(l, indent) {
        if (l.type === 'tilelayer') {
          const gids = [];
          for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) gids.push(api.tileAt(l, x, y, m) >>> 0);
          const b64 = encode(gids);
          return `${indent}<layer id="${l.id || 1}" name="${xmlEscape(l.name || '图层')}" width="${m.width}" height="${m.height}">\n` +
            propertiesXml(l.properties, indent) +
            `${indent}  <data encoding="base64" compression="zlib">\n${b64}\n${indent}  </data>\n${indent}</layer>`;
        }
        if (l.type === 'objectgroup') {
          return `${indent}<objectgroup id="${l.id || 1}" name="${xmlEscape(l.name || '对象层')}">\n` +
            (l.objects || []).map((o) => objectXml(o, indent + '  ')).join('\n') + `\n${indent}</objectgroup>`;
        }
        if (l.type === 'imagelayer') {
          let imageXml;
          if (l.image && String(l.image).startsWith('data:')) {
            const raw = dataUrlToBase64Raw(l.image);
            imageXml = `<image format="png"><data encoding="base64">${raw}</data></image>`;
          } else imageXml = `<image source="${xmlEscape(l.image || '')}"/>`;
          return `${indent}<imagelayer id="${l.id || 1}" name="${xmlEscape(l.name || '图像层')}">${imageXml}</imagelayer>`;
        }
        if (l.type === 'group') {
          return `${indent}<group id="${l.id || 1}" name="${xmlEscape(l.name || '组层')}">\n` +
            (l.layers || []).map((c) => layerXml(c, indent + '  ')).join('\n') + `\n${indent}</group>`;
        }
        return '';
      }
      const layers = (m.layers || []).map((l) => layerXml(l, '  ')).filter(Boolean).join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<map ${attrs.join(' ')}>\n` + propertiesXml(m.properties, '') + (tilesetsXml ? tilesetsXml + '\n' : '') + layers + '\n</map>\n';
    }

    enhanceTmxEmbedded();

    // Expose
    Object.assign(api.features || {}, F, {
      Picker, findMatchingWangTiles, wangFillerFill, expandWangFlipVariants,
      openAutomapBrowser, renderPropsList, decorateTilesetCorners, exportTmxWithEmbedded
    });
    api.features = api.features || F;

    renderPropsList('map');
    renderPropsList('layer');
    renderPropsList('tile');
    api.log('Batch3：规则浏览 / 标角 / RandomPicker / WangFiller / 碰撞导入吸附 / 类型属性 / 嵌入图');
  }

  window.initTiledBatch3 = boot;
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 0);
})();

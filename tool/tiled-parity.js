
/*! Tiled 1.2.4 parity extensions: live automap, object outputs, PaintVertex, wang, collision vertices */
(function () {
  'use strict';

  function enhanceParity(api) {
    if (!api || !api.getState) return;
    const state = api.getState();
    const els = api.getEls();
    const $ = (s) => document.querySelector(s);
    const F = api.features || {};

    state.liveAutomap = false;
    state.terrainBrushMode = 'tile'; // tile | vertex
    state.wangSet = null;
    state.wangColor = null; // { index:1-based, isEdge:bool }
    state.wangMode = 'corner';
    state._automapDirty = null; // {minX,minY,maxX,maxY}
    state._automapTimer = null;

    /* ---- Terrain transfer matrix ---- */
    function recalculateTerrainDistances(ts) {
      const terrains = ts.terrains || [];
      const n = terrains.length;
      if (!n) { ts._terrainDist = []; ts._maxTerrainDist = 1; return; }
      // distance[i][j+1] where j=-1..n-1 indexed as j+1
      const dist = [];
      for (let i = 0; i < n; i++) {
        const d = new Array(n + 1).fill(-1);
        for (let id = 0; id < (ts.count || 0); id++) {
          const terr = F.tileTerrain ? F.tileTerrain(ts, id) : 0xFFFFFFFF;
          if (terr === 0xFFFFFFFF) continue;
          const corners = [0, 1, 2, 3].map((c) => {
            const v = (terr >>> ((3 - c) * 8)) & 0xFF;
            return v === 0xFF ? -1 : v;
          });
          const [tl, tr, bl, br] = corners;
          if (tl !== i && tr !== i && bl !== i && br !== i) continue;
          if (tl === i || br === i) {
            if (tr >= 0) d[tr + 1] = 1;
            if (bl >= 0) d[bl + 1] = 1;
          }
          if (tr === i || bl === i) {
            if (tl >= 0) d[tl + 1] = 1;
            if (br >= 0) d[br + 1] = 1;
          }
          d[i + 1] = 0;
        }
        dist.push(d);
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            if (i === j) continue;
            for (let t = -1; t < n; t++) {
              const d0 = dist[i][t + 1], d1 = dist[j][t + 1];
              if (d0 < 0 || d1 < 0) continue;
              const cur = dist[i][j + 1];
              const nd = d0 + d1;
              if (cur < 0 || nd < cur) { dist[i][j + 1] = nd; changed = true; }
            }
          }
        }
      }
      let maxD = 1;
      for (const row of dist) for (const v of row) if (v > maxD) maxD = v;
      ts._terrainDist = dist;
      ts._maxTerrainDist = maxD;
    }

    function transitionPenalty(ts, a, b) {
      // a,b are 0..n-1 or 0xFF
      if (a === 0xFF) a = -1; if (b === 0xFF) b = -1;
      if (a === -1 && b === -1) return 0;
      if (!ts._terrainDist) recalculateTerrainDistances(ts);
      if (a === -1) {
        if (b < 0 || b >= ts._terrainDist.length) return 1;
        return ts._terrainDist[b][0]; // distance to no-terrain
      }
      if (a < 0 || a >= ts._terrainDist.length) return -1;
      const d = ts._terrainDist[a][b + 1];
      return d;
    }

    // Override findBestTile to use matrix
    function findBestTile(ts, preferred, mask) {
      if (preferred === 0xFFFFFFFF) return null;
      if (!ts._terrainDist) recalculateTerrainDistances(ts);
      let best = null, bestPen = Infinity, bestProb = -1;
      for (let id = 0; id < ts.count; id++) {
        const terr = F.tileTerrain(ts, id);
        if (terr === 0xFFFFFFFF) continue;
        if ((terr & mask) !== (preferred & mask)) continue;
        let pen = 0, ok = true;
        for (let c = 0; c < 4; c++) {
          const shift = (3 - c) * 8;
          const want = (preferred >>> shift) & 0xFF;
          const have = (terr >>> shift) & 0xFF;
          const p = transitionPenalty(ts, have, want);
          if (p < 0) { ok = false; break; }
          pen += p;
        }
        if (!ok) continue;
        const rec = ts.tiles[id] || ts.tiles[String(id)] || {};
        const prob = rec.probability != null ? rec.probability : 1;
        if (pen < bestPen || (pen === bestPen && Math.random() * (bestProb + prob) < prob)) {
          if (pen < bestPen) { bestPen = pen; best = id; bestProb = prob; }
          else if (pen === bestPen) { best = id; bestProb = prob; }
        }
      }
      return best;
    }

    function makeTerrain4(tl, tr, bl, br) {
      return (((tl & 0xFF) << 24) | ((tr & 0xFF) << 16) | ((bl & 0xFF) << 8) | (br & 0xFF)) >>> 0;
    }
    function makeTerrainId(id) {
      id &= 0xFF;
      return ((id << 24) | (id << 16) | (id << 8) | id) >>> 0;
    }
    function setCorner(terrain, corner, tid) {
      const mask = 0xFF << ((3 - corner) * 8);
      const insert = (tid & 0xFF) << ((3 - corner) * 8);
      return ((terrain & ~mask) | insert) >>> 0;
    }

    function vertexCornerFromPointer(tileX, tileY, clientX, clientY) {
      // Return corner 0=TL,1=TR,2=BL,3=BR based on position within tile
      const r = els.canvas.getBoundingClientRect();
      const screen = api.mapToScreen(tileX, tileY);
      const localX = (clientX - r.left) - screen.x;
      const localY = (clientY - r.top) - screen.y;
      const tw = state.map.tilewidth * state.zoom;
      const th = state.map.tileheight * state.zoom;
      const right = localX > tw / 2;
      const bottom = localY > th / 2;
      if (!bottom && !right) return 0;
      if (!bottom && right) return 1;
      if (bottom && !right) return 2;
      return 3;
    }

    function paintTerrainAt(x, y, opts) {
      opts = opts || {};
      const layer = api.activeLayer();
      const map = state.map;
      const ts = state.terrainTileset || state.tileset;
      if (!layer || layer.type !== 'tilelayer' || !ts || state.selectedTerrainId == null) return;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
      const tid = state.selectedTerrainId;
      const mode = state.terrainBrushMode || 'tile';
      const margin = ts._maxTerrainDist || 2;
      const considered = new Set();
      const stamp = new Map();
      const paintCorner = opts.corner != null ? opts.corner : 0;
      const queue = [[x, y, true, paintCorner]];

      while (queue.length) {
        const [cx, cy, initial, corner] = queue.shift();
        const key = cx + ',' + cy;
        if (considered.has(key)) continue;
        if (Math.abs(cx - x) > margin || Math.abs(cy - y) > margin) continue;
        if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) continue;
        considered.add(key);

        const gid = api.tileAt(layer, cx, cy, map) >>> 0;
        const curLocal = gid ? (api.clearGid(gid) - ts.firstgid) : -1;
        const curTerr = curLocal >= 0 ? F.tileTerrain(ts, curLocal) : 0xFFFFFFFF;

        let preferred, mask;
        if (initial) {
          if (mode === 'vertex') {
            preferred = setCorner(curTerr === 0xFFFFFFFF ? 0xFFFFFFFF : curTerr, corner, tid);
            // If was empty, start with all FF then set corner
            if (curTerr === 0xFFFFFFFF) preferred = setCorner(0xFFFFFFFF, corner, tid);
            mask = 0xFF << ((3 - corner) * 8);
            // For matching, also allow other corners wildcard by only masking painted corner
          } else {
            preferred = makeTerrainId(tid);
            mask = 0xFFFFFFFF;
          }
        } else {
          preferred = curTerr;
          mask = 0;
          const neighbors = [[cx, cy - 1, 'up'], [cx, cy + 1, 'down'], [cx - 1, cy, 'left'], [cx + 1, cy, 'right']];
          for (const [nx, ny, dir] of neighbors) {
            const nk = nx + ',' + ny;
            if (!stamp.has(nk)) continue;
            const nTerr = F.tileTerrain(ts, stamp.get(nk));
            if (dir === 'up') {
              preferred = ((nTerr << 16) | (preferred & 0x0000FFFF)) >>> 0;
              mask |= 0xFFFF0000;
            } else if (dir === 'down') {
              preferred = ((nTerr >>> 16) | (preferred & 0xFFFF0000)) >>> 0;
              mask |= 0x0000FFFF;
            } else if (dir === 'left') {
              preferred = ((((nTerr << 8) & 0xFF00FF00) | (preferred & 0x00FF00FF))) >>> 0;
              mask |= 0xFF00FF00;
            } else if (dir === 'right') {
              preferred = ((((nTerr >>> 8) & 0x00FF00FF) | (preferred & 0xFF00FF00))) >>> 0;
              mask |= 0x00FF00FF;
            }
          }
        }
        if (preferred === 0xFFFFFFFF && mask === 0) continue;
        const best = findBestTile(ts, preferred === 0xFFFFFFFF ? makeTerrainId(tid) : preferred, mask || 0xFFFFFFFF);
        if (best == null) continue;
        stamp.set(key, best);
        if (initial || stamp.size < 40) {
          for (const [nx, ny] of [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]]) {
            const nk = nx + ',' + ny;
            if (!considered.has(nk)) queue.push([nx, ny, false, 0]);
          }
        }
      }
      for (const [key, localId] of stamp) {
        const [px, py] = key.split(',').map(Number);
        api.setTileAt(layer, px, py, map, ts.firstgid + localId);
      }
      api.draw();
      markAutomapDirty(x - margin, y - margin, x + margin, y + margin);
    }

    /* ---- Live automapping ---- */
    function markAutomapDirty(x0, y0, x1, y1) {
      if (!state.liveAutomap || !state.automapRules || !state.automapRules.length) return;
      const d = state._automapDirty || { minX: x0, minY: y0, maxX: x1, maxY: y1 };
      d.minX = Math.min(d.minX, x0); d.minY = Math.min(d.minY, y0);
      d.maxX = Math.max(d.maxX, x1); d.maxY = Math.max(d.maxY, y1);
      state._automapDirty = d;
      clearTimeout(state._automapTimer);
      state._automapTimer = setTimeout(flushLiveAutomap, 80);
    }

    function flushLiveAutomap() {
      const d = state._automapDirty;
      state._automapDirty = null;
      if (!d || !state.map || !state.automapRules.length) return;
      let radius = 0;
      for (const c of state.automapRules) {
        const props = (c.map && c.map.properties) || {};
        const r = Number(props.AutomappingRadius || props.AutoMappingRadius || 0);
        if (r > radius) radius = r;
      }
      const region = {
        minX: Math.max(0, d.minX - radius),
        minY: Math.max(0, d.minY - radius),
        maxX: Math.min(state.map.width - 1, d.maxX + radius),
        maxY: Math.min(state.map.height - 1, d.maxY + radius)
      };
      runAutomapRegion(region, { silent: true, noSnapshot: true });
    }

    window.__onTilePainted = function (x, y, reason) {
      markAutomapDirty(x, y, x, y);
    };

    function layerByName(map, name) {
      const find = (layers) => {
        for (const l of layers || []) {
          if ((l.name || '') === name) return l;
          if ((l.name || '').toLowerCase() === String(name).toLowerCase()) return l;
          if (l.type === 'group') { const f = find(l.layers); if (f) return f; }
        }
        return null;
      };
      return find(map.layers);
    }

    function ensureObjectLayer(workMap, name) {
      let l = layerByName(workMap, name);
      if (l && l.type === 'objectgroup') return l;
      if (l && l.type !== 'objectgroup') return null;
      l = {
        id: Math.max(0, ...(workMap.layers || []).map((x) => x.id || 0)) + 1,
        name, type: 'objectgroup', draworder: 'topdown', objects: []
      };
      workMap.layers.push(l);
      return l;
    }

    function cloneObj(o) {
      return JSON.parse(JSON.stringify(o));
    }

    function applyObjectOutputs(compiled, rule, workMap, ox, oy) {
      const ir = rule.inRect, or = rule.outRect;
      const outOx = ox + (or.minX - ir.minX);
      const outOy = oy + (or.minY - ir.minY);
      const tw = workMap.tilewidth, th = workMap.tileheight;
      for (const out of rule.objectOutputs || []) {
        const dst = ensureObjectLayer(workMap, out.target);
        if (!dst) continue;
        const src = out.layer;
        const objects = src.objects || [];
        // Region in pixel space of rule map
        const rx0 = or.minX * (compiled.map.tilewidth || tw);
        const ry0 = or.minY * (compiled.map.tileheight || th);
        const rx1 = (or.maxX + 1) * (compiled.map.tilewidth || tw);
        const ry1 = (or.maxY + 1) * (compiled.map.tileheight || th);
        const pixelOffsetX = outOx * tw - rx0;
        const pixelOffsetY = outOy * th - ry0;
        for (const obj of objects) {
          const oxp = obj.x || 0, oyp = obj.y || 0;
          const ow = obj.width || 0, oh = obj.height || 0;
          // include if object origin or bounds intersects region
          if (oxp + ow < rx0 || oyp + oh < ry0 || oxp > rx1 || oyp > ry1) continue;
          const clone = cloneObj(obj);
          clone.id = 1 + Math.max(0, ...(dst.objects || []).map((o) => o.id || 0));
          clone.x = oxp + pixelOffsetX;
          clone.y = oyp + pixelOffsetY;
          dst.objects.push(clone);
        }
      }
    }

    // Patch compileRuleMap outputs to include object groups — wrap existing

    // Ensure match/apply available
    function runAutomapRegion(region, opts) {
      opts = opts || {};
      if (!state.map || !state.automapRules || !state.automapRules.length) return 0;
      if (!opts.noSnapshot) api.snapshot();
      const work = state.map;
      let matches = 0;
      const match = F.matchRuleAt;
      const apply = F.applyRuleAt;
      if (!match || !apply) {
        if (!opts.silent) api.log('自动地图内部函数未就绪');
        return 0;
      }
      for (const compiled of state.automapRules) {
        for (const rule of compiled.rules) {
          const ir = rule.inRect;
          const y0 = Math.max(0, (region.minY|0) - ir.h + 1);
          const y1 = Math.min(work.height - ir.h, region.maxY|0);
          const x0 = Math.max(0, (region.minX|0) - ir.w + 1);
          const x1 = Math.min(work.width - ir.w, region.maxX|0);
          for (let oy = y0; oy <= y1; oy++) {
            for (let ox = x0; ox <= x1; ox++) {
              if (match(compiled, rule, work, ox, oy)) {
                apply(compiled, rule, work, ox, oy);
                matches++;
              }
            }
          }
        }
      }
      api.renderAll();
      if (!opts.silent) {
        api.status('自动地图：' + matches + ' 处');
        api.log('自动地图匹配 ' + matches + ' 处');
      }
      return matches;
    }

    // Replace region automap stub from earlier incomplete section
    // (functions above redefine runAutomapRegion — OK in JS)

    /* ---- Wang brush ---- */
    function wangIndexColor(wangId, index) {
      return (wangId >>> (index * 4)) & 0xf;
    }
    function wangSetIndexColor(wangId, index, value) {
      wangId = wangId >>> 0;
      wangId &= ~(0xf << (index * 4));
      wangId |= (value & 0xf) << (index * 4);
      return wangId >>> 0;
    }
    function wangCornerColor(wangId, corner) {
      // corner 0=TopRight,1=BottomRight,2=BottomLeft,3=TopLeft -> indexColor corner*2+1
      return wangIndexColor(wangId, corner * 2 + 1);
    }
    function wangEdgeColor(wangId, edge) {
      return wangIndexColor(wangId, edge * 2);
    }
    function wangSetCorner(wangId, corner, color) {
      return wangSetIndexColor(wangId, corner * 2 + 1, color);
    }
    function wangSetEdge(wangId, edge, color) {
      return wangSetIndexColor(wangId, edge * 2, color);
    }

    function findWangTile(wangSet, wangId, maskBits) {
      // maskBits: which of 8 nibbles must match (bit i = nibble i)
      let best = null, bestWild = 99;
      for (const [tid, rec] of Object.entries(wangSet.tiles || {})) {
        let ok = true, wild = 0;
        for (let i = 0; i < 8; i++) {
          if (!(maskBits & (1 << i))) continue;
          const want = wangIndexColor(wangId, i);
          const have = wangIndexColor(rec.wangId, i);
          if (have === 0) { wild++; continue; } // wildcard in tile
          if (want !== 0 && have !== want) { ok = false; break; }
          if (want === 0) continue;
        }
        if (!ok) continue;
        if (wild < bestWild) { bestWild = wild; best = Number(tid); }
      }
      return best;
    }

    function paintWangAt(x, y, opts) {
      opts = opts || {};
      const layer = api.activeLayer();
      const map = state.map;
      const ts = state.tileset;
      const ws = state.wangSet;
      const color = state.wangColor;
      if (!layer || layer.type !== 'tilelayer' || !ts || !ws || !color) return;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;

      const gid = api.tileAt(layer, x, y, map) >>> 0;
      const local = gid ? api.clearGid(gid) - ts.firstgid : -1;
      let curWang = 0;
      if (local >= 0 && ws.tiles[local]) curWang = ws.tiles[local].wangId >>> 0;

      let maskBits = 0;
      let wangId = curWang;
      const colorIndex = color.index; // 1-based in Tiled colors, 0 = unset
      if (state.wangMode === 'edge' || color.isEdge) {
        const edge = opts.edge != null ? opts.edge : 0; // 0 top,1 right,2 bottom,3 left
        wangId = wangSetEdge(wangId, edge, colorIndex);
        maskBits |= 1 << (edge * 2);
        // also lock adjacent corners loosely
      } else {
        const corner = opts.corner != null ? opts.corner : 0; // 0 TR,1 BR,2 BL,3 TL in Wang space
        // Convert from terrain TL/TR/BL/BR to Wang TR/BR/BL/TL:
        // terrain 0 TL -> Wang TopLeft=3; 1 TR -> 0; 2 BL -> 2; 3 BR -> 1
        wangId = wangSetCorner(wangId, corner, colorIndex);
        maskBits |= 1 << (corner * 2 + 1);
      }

      const tileId = findWangTile(ws, wangId, maskBits || 0xFF);
      if (tileId == null) return;
      api.setTileAt(layer, x, y, map, ts.firstgid + tileId);
      // Neighbors for edge matching
      const neigh = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
      for (const [nx, ny] of neigh) {
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const ng = api.tileAt(layer, nx, ny, map) >>> 0;
        if (!ng) continue;
        const nl = api.clearGid(ng) - ts.firstgid;
        const nrec = ws.tiles[nl];
        if (!nrec) continue;
        // Try to rematch neighbor with adjacency — simplified: find tile matching neighbor wangid
        const better = findWangTile(ws, nrec.wangId, 0xFF);
        if (better != null) api.setTileAt(layer, nx, ny, map, ts.firstgid + better);
      }
      api.draw();
      markAutomapDirty(x - 1, y - 1, x + 1, y + 1);
    }

    function renderWangPanel() {
      const panel = $('#wangPanel');
      if (!panel) return;
      const ts = state.tileset;
      const sets = (ts && ts.wangSets) || [];
      if (!ts || !sets.length) {
        panel.textContent = '载入含 wangsets 的图块集后可选';
        return;
      }
      panel.innerHTML = '';
      const setSel = document.createElement('select');
      sets.forEach((s, i) => {
        const o = document.createElement('option');
        o.value = i; o.textContent = s.name || ('Wang ' + i);
        setSel.appendChild(o);
      });
      setSel.onchange = () => {
        state.wangSet = sets[Number(setSel.value)];
        renderWangColors(panel, state.wangSet);
      };
      panel.appendChild(setSel);
      state.wangSet = sets[0];
      renderWangColors(panel, state.wangSet);
    }

    function renderWangColors(panel, ws) {
      // remove old chips
      panel.querySelectorAll('.terrain-chip').forEach((n) => n.remove());
      const add = (list, isEdge) => {
        list.forEach((c, i) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'terrain-chip';
          const dot = document.createElement('span');
          dot.className = 'wang-dot';
          dot.style.background = c.color || '#888';
          chip.appendChild(dot);
          chip.appendChild(document.createTextNode((isEdge ? '边:' : '角:') + (c.name || (i + 1))));
          chip.onclick = () => {
            state.wangColor = { index: i + 1, isEdge, name: c.name };
            state.wangMode = isEdge ? 'edge' : 'corner';
            if ($('#wangMode')) $('#wangMode').value = state.wangMode;
            state.tool = 'wang';
            document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === 'wang'));
            api.status('Wang：' + (c.name || i + 1));
          };
          panel.appendChild(chip);
        });
      };
      add(ws.cornerColors || [], false);
      add(ws.edgeColors || [], true);
    }

    /* ---- Collision polygon / polyline / vertex edit ---- */
    const colState = {
      polyDraft: null, // { type:'polygon'|'polyline', points:[] }
      vertexEdit: null // { shapeIndex, pointIndex }
    };

    function enhanceCollisionEditor() {
      const canvas = $('#collisionCanvas');
      if (!canvas || canvas._parityBound) return;
      canvas._parityBound = true;

      // Replace handlers by adding capture listeners that handle new tools
      canvas.addEventListener('pointerdown', (e) => {
        const toolBtn = document.querySelector('[data-coltool].active');
        const tool = toolBtn ? toolBtn.dataset.coltool : 'select';
        if (!['polygon', 'polyline', 'vertex'].includes(tool)) return;
        e.stopPropagation();
        const ts = state.tileset;
        if (!ts) return;
        const r = canvas.getBoundingClientRect();
        const scale = canvas.width / ts.tileWidth;
        const x = (e.clientX - r.left) / scale;
        const y = (e.clientY - r.top) / scale;

        // Access shapes from features via tileCollision textarea / re-read
        const shapes = getCollisionShapes();
        if (tool === 'vertex') {
          let hit = null;
          shapes.forEach((o, si) => {
            const pts = o.polygon || o.polyline;
            if (!pts) return;
            pts.forEach((p, pi) => {
              const dx = (o.x || 0) + p.x - x, dy = (o.y || 0) + p.y - y;
              if (dx * dx + dy * dy < 4) hit = { si, pi, o };
            });
          });
          if (hit) {
            colState.vertexEdit = hit;
            canvas.setPointerCapture(e.pointerId);
          }
          return;
        }

        if (tool === 'polygon' || tool === 'polyline') {
          if (!colState.polyDraft || colState.polyDraft.type !== tool) {
            colState.polyDraft = { type: tool, points: [{ x, y }], originX: x, originY: y };
          } else {
            colState.polyDraft.points.push({ x, y });
          }
          redrawCollisionWithDraft(shapes);
        }
      }, true);

      canvas.addEventListener('pointermove', (e) => {
        if (!colState.vertexEdit) return;
        e.stopPropagation();
        const ts = state.tileset;
        const r = canvas.getBoundingClientRect();
        const scale = canvas.width / ts.tileWidth;
        const x = (e.clientX - r.left) / scale;
        const y = (e.clientY - r.top) / scale;
        const shapes = getCollisionShapes();
        const o = shapes[colState.vertexEdit.si];
        const pts = o.polygon || o.polyline;
        if (!pts) return;
        pts[colState.vertexEdit.pi] = { x: x - (o.x || 0), y: y - (o.y || 0) };
        setCollisionShapes(shapes);
        if (api.features && api.features.openCollisionEditor) {
          // trigger redraw by synthesizing - call draw via textarea
        }
        redrawCollisionWithDraft(shapes);
      }, true);

      canvas.addEventListener('pointerup', () => { colState.vertexEdit = null; }, true);

      canvas.addEventListener('dblclick', (e) => {
        const toolBtn = document.querySelector('[data-coltool].active');
        const tool = toolBtn ? toolBtn.dataset.coltool : '';
        if (tool === 'polygon' || tool === 'polyline') {
          e.stopPropagation();
          finishPolyDraft();
        }
      }, true);

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && colState.polyDraft) {
          e.preventDefault();
          finishPolyDraft();
        }
        if (e.key === 'Escape') colState.polyDraft = null;
      });
    }

    function getCollisionShapes() {
      // Prefer live editor state via tileCollision field synced on open; also try features
      try {
        const ta = $('#tileCollision');
        if (ta && ta.value) {
          const og = JSON.parse(ta.value);
          return (og.objects || []).slice();
        }
      } catch (e) {}
      const ts = state.tileset;
      const rec = ts && ts.tiles && (ts.tiles[state.tile] || ts.tiles[String(state.tile)]);
      return ((rec && rec.objectgroup && rec.objectgroup.objects) || []).slice();
    }

    function setCollisionShapes(shapes) {
      const ts = state.tileset;
      if (!ts) return;
      if (!ts.tiles) ts.tiles = {};
      const rec = ts.tiles[state.tile] || (ts.tiles[state.tile] = {});
      rec.objectgroup = { objects: shapes };
      if ($('#tileCollision')) $('#tileCollision').value = JSON.stringify(rec.objectgroup, null, 2);
    }

    function finishPolyDraft() {
      const d = colState.polyDraft;
      if (!d || d.points.length < 2) { colState.polyDraft = null; return; }
      const shapes = getCollisionShapes();
      const xs = d.points.map((p) => p.x), ys = d.points.map((p) => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const obj = {
        id: shapes.length + 1,
        x: minX,
        y: minY,
        width: Math.max(...xs) - minX,
        height: Math.max(...ys) - minY
      };
      const rel = d.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
      if (d.type === 'polygon') obj.polygon = rel;
      else obj.polyline = rel;
      shapes.push(obj);
      setCollisionShapes(shapes);
      colState.polyDraft = null;
      // reopen editor draw
      document.querySelector('[data-action="edit-collision"]')?.click();
      setTimeout(() => {
        // keep open — features openCollisionEditor resets from rec
        if (api.features) api.features.openCollisionEditor();
      }, 0);
    }

    function redrawCollisionWithDraft(shapes) {
      const canvas = $('#collisionCanvas');
      const ts = state.tileset;
      if (!canvas || !ts) return;
      const ctx = canvas.getContext('2d');
      const scale = Math.floor(Math.min(256 / ts.tileWidth, 256 / ts.tileHeight));
      const tw = ts.tileWidth * scale, th = ts.tileHeight * scale;
      canvas.width = tw; canvas.height = th;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#222'; ctx.fillRect(0, 0, tw, th);
      const img = api.getImageCache().get(ts.url);
      if (img) {
        const idx = state.tile;
        const sx = (ts.margin || 0) + (idx % ts.columns) * (ts.tileWidth + (ts.spacing || 0));
        const sy = (ts.margin || 0) + Math.floor(idx / ts.columns) * (ts.tileHeight + (ts.spacing || 0));
        ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, 0, 0, tw, th);
      }
      const drawShape = (o, color) => {
        ctx.strokeStyle = color; ctx.fillStyle = color.replace(')', ',.2)').replace('rgb', 'rgba').replace('#ff4d6d', 'rgba(255,77,109,.2)');
        if (color.startsWith('#')) ctx.fillStyle = 'rgba(255,77,109,.2)';
        const x = (o.x || 0) * scale, y = (o.y || 0) * scale;
        if (o.polygon || o.polyline) {
          const pts = o.polygon || o.polyline;
          ctx.beginPath();
          pts.forEach((p, i) => {
            const px = x + p.x * scale, py = y + p.y * scale;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          });
          if (o.polygon) ctx.closePath();
          if (o.polygon) ctx.fill();
          ctx.stroke();
          pts.forEach((p) => {
            ctx.fillStyle = '#66a8ff';
            ctx.fillRect(x + p.x * scale - 3, y + p.y * scale - 3, 6, 6);
          });
        } else if (o.ellipse) {
          const w = (o.width || 0) * scale, h = (o.height || 0) * scale;
          ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(x, y, (o.width || 0) * scale, (o.height || 0) * scale);
          ctx.strokeRect(x, y, (o.width || 0) * scale, (o.height || 0) * scale);
        }
      };
      shapes.forEach((o) => drawShape(o, '#ff4d6d'));
      if (colState.polyDraft && colState.polyDraft.points.length) {
        ctx.strokeStyle = '#66a8ff';
        ctx.beginPath();
        colState.polyDraft.points.forEach((p, i) => {
          const px = p.x * scale, py = p.y * scale;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          ctx.fillStyle = '#66a8ff';
          ctx.fillRect(px - 3, py - 3, 6, 6);
        });
        ctx.stroke();
      }
    }

    /* ---- Wire UI ---- */
    document.querySelectorAll('[data-action="toggle-live-automap"]').forEach((b) => {
      b.onclick = () => {
        state.liveAutomap = !state.liveAutomap;
        b.classList.toggle('active', state.liveAutomap);
        api.status('实时自动地图：' + (state.liveAutomap ? '开' : '关'));
      };
    });

    const terrainMode = $('#terrainMode');
    if (terrainMode) {
      terrainMode.onchange = () => {
        state.terrainBrushMode = terrainMode.value;
        api.status('地形模式：' + (state.terrainBrushMode === 'vertex' ? 'PaintVertex' : 'PaintTile'));
      };
    }
    const wangMode = $('#wangMode');
    if (wangMode) {
      wangMode.onchange = () => { state.wangMode = wangMode.value; };
    }

    // Override terrain painting from features with PaintVertex-aware version
    F.paintTerrainAt = paintTerrainAt;
    F.findBestTile = findBestTile;
    F.recalculateTerrainDistances = recalculateTerrainDistances;
    F.transitionPenalty = transitionPenalty;
    F.runAutomapRegion = runAutomapRegion;
    F.paintWangAt = paintWangAt;
    F.wangIndexColor = wangIndexColor;
    F.findWangTile = findWangTile;

    // Re-bind terrain pointer with vertex corner detection
    els.canvas.addEventListener('pointerdown', (e) => {
      if (state.tool === 'terrain') {
        const r = els.canvas.getBoundingClientRect();
        const p = api.screenToMap(e.clientX - r.left, e.clientY - r.top);
        const corner = vertexCornerFromPointer(p.x, p.y, e.clientX, e.clientY);
        // Map terrain corners TL,TR,BL,BR = 0,1,2,3
        api.snapshot();
        paintTerrainAt(p.x, p.y, { corner });
        state._terrainDrag = true;
        state._terrainCorner = corner;
        e.stopPropagation();
      } else if (state.tool === 'wang') {
        const r = els.canvas.getBoundingClientRect();
        const p = api.screenToMap(e.clientX - r.left, e.clientY - r.top);
        const terrCorner = vertexCornerFromPointer(p.x, p.y, e.clientX, e.clientY);
        // terrain TL,TR,BL,BR -> wang TL=3,TR=0,BL=2,BR=1
        const wangCorner = [3, 0, 2, 1][terrCorner];
        const edge = terrCorner; // approximate
        api.snapshot();
        paintWangAt(p.x, p.y, { corner: wangCorner, edge });
        state._wangDrag = true;
        e.stopPropagation();
      }
    }, true);

    els.canvas.addEventListener('pointermove', (e) => {
      if (state.tool === 'terrain' && state._terrainDrag) {
        const r = els.canvas.getBoundingClientRect();
        const p = api.screenToMap(e.clientX - r.left, e.clientY - r.top);
        paintTerrainAt(p.x, p.y, { corner: state._terrainCorner || 0 });
        e.stopPropagation();
      } else if (state.tool === 'wang' && state._wangDrag) {
        const r = els.canvas.getBoundingClientRect();
        const p = api.screenToMap(e.clientX - r.left, e.clientY - r.top);
        const terrCorner = vertexCornerFromPointer(p.x, p.y, e.clientX, e.clientY);
        paintWangAt(p.x, p.y, { corner: [3, 0, 2, 1][terrCorner], edge: terrCorner });
        e.stopPropagation();
      }
    }, true);
    window.addEventListener('pointerup', () => { state._terrainDrag = false; state._wangDrag = false; });

    document.querySelectorAll('[data-tool="wang"]').forEach((b) => {
      b.onclick = () => {
        state.tool = 'wang';
        document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('active', x === b));
        renderWangPanel();
        api.status('工具：Wang 笔刷');
      };
    });

    // Refresh wang when tileset changes
    if (els.meta) {
      new MutationObserver(() => { renderWangPanel(); if (state.tileset) recalculateTerrainDistances(state.tileset); })
        .observe(els.meta, { childList: true, characterData: true, subtree: true });
    }

    // Hook edit-collision open to bind enhanced editor
    document.querySelectorAll('[data-action="edit-collision"]').forEach((b) => {
      b.addEventListener('click', () => setTimeout(enhanceCollisionEditor, 0));
    });

    // Override automap button to use region=full via features.runAutomap (already has object outputs)
    document.querySelectorAll('[data-action="automap"]').forEach((b) => {
      b.addEventListener('click', () => {
        // after features handler — object outputs already in applyRuleAt
      });
    });

    api.features = Object.assign(api.features || {}, F, {
      paintTerrainAt, findBestTile, recalculateTerrainDistances, transitionPenalty,
      runAutomapRegion, paintWangAt, wangIndexColor, findWangTile, markAutomapDirty
    });
    api.log('对等扩展已加载：实时自动地图 / 对象输出 / PaintVertex / 转移矩阵 / Wang / 碰撞顶点');
  }

  window.enhanceTiledParity = enhanceParity;
  if (window.TiledApp) {
    // Defer until features init
    const boot = () => enhanceParity(window.TiledApp);
    if (window.TiledApp.features) boot();
    else setTimeout(boot, 0);
  }
})();

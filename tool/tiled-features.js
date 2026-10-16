
/*! Tiled 网页版扩展：自动地图 / 地形笔 / 碰撞编辑 / 多选 / zlib 导出 / 更好 hex */
(function () {
  'use strict';

  function initTiledFeatures(api) {
    if (!api || !api.getState) return;
    const state = api.getState();
    const els = api.getEls();
    const $ = (s) => document.querySelector(s);

    /* ========== helpers ========== */
    function makeTerrain(tl, tr, bl, br) {
      if (arguments.length === 1) {
        const id = tl & 0xFF;
        return ((id << 24) | (id << 16) | (id << 8) | id) >>> 0;
      }
      return (((tl & 0xFF) << 24) | ((tr & 0xFF) << 16) | ((bl & 0xFF) << 8) | (br & 0xFF)) >>> 0;
    }
    function cornerId(terrain, corner) {
      // 0 TL, 1 TR, 2 BL, 3 BR
      const t = ((terrain >>> ((3 - corner) * 8)) & 0xFF);
      return t === 0xFF ? -1 : t;
    }
    function tileTerrain(ts, localId) {
      if (!ts || !ts.tiles) return 0xFFFFFFFF;
      const rec = ts.tiles[localId] || ts.tiles[String(localId)];
      if (!rec || rec.terrain == null) return 0xFFFFFFFF;
      return rec.terrain >>> 0;
    }
    function gidLocal(gid, ts) {
      return api.clearGid(gid) - ts.firstgid;
    }
    function layerDataGet(layer, x, y, map) {
      return api.tileAt(layer, x, y, map) >>> 0;
    }
    function layerDataSet(layer, x, y, map, gid) {
      api.setTileAt(layer, x, y, map, gid);
    }

    /* ========== Better hex / stagger with hexsidelength ========== */
    const _mapToScreen = api.mapToScreen;
    const _screenToMap = api.screenToMap;
    const _resizeCanvas = api.resizeCanvas;

    function hexLayout() {
      const m = state.map;
      if (!m) return null;
      const s = state.zoom;
      const side = Number(m.hexsidelength || 0);
      const tw = m.tilewidth * s, th = m.tileheight * s;
      // For pointy-top (staggeraxis y): horizontal step = tilewidth; vertical = (tileheight + side) / 2 roughly
      // Tiled staggered: for hex, tileheight includes side; distance between rows = tileheight * 0.75 when side=tileheight/2
      // Generalize: row step = (tileheight + side) / 2 when hexagonal, else 0.75*tileheight for staggered iso
      if (m.orientation === 'hexagonal') {
        const axis = m.staggeraxis || 'y';
        if (axis === 'y') {
          const rowH = side > 0 ? (th + side * s) / 2 : th * 0.75;
          return { axis, colW: tw, rowH, stagger: 'y' };
        }
        const colW = side > 0 ? (tw + side * s) / 2 : tw * 0.75;
        return { axis, colW, rowH: th, stagger: 'x' };
      }
      if (m.orientation === 'staggered') {
        return { axis: m.staggeraxis || 'y', colW: tw, rowH: th * 0.75, stagger: m.staggeraxis || 'y' };
      }
      return null;
    }
    function staggerBit(v) {
      const m = state.map;
      const odd = (m.staggerindex || 'odd') === 'odd';
      const even = v % 2 === 0;
      return (odd ? !even : even) ? 1 : 0;
    }

    // Monkey-patch coordinate helpers used by draw (they're closed over in main - patching api alone won't change draw).
    // Instead we override state via replacing functions on the closed module by patching through a redraw shim:
    // Re-bind canvas size calculation on orientation change by listening — actually mapToScreen is closed.
    // We'll patch by wrapping renderAll/draw after features load using Mutation — simplest fix: replace methods
    // that features CAN call, and for draw we need to patch inside main.
    // Practical approach: override els and re-implement resize + use CSS; for painting screenToMap we intercept pointer.
    // Better: patch pointer path only and document hex improvement in resize via listening orientation change
    // and adjusting canvas size ourselves after renderAll.

    const origRenderAll = api.renderAll;
    api.renderAll = function () {
      origRenderAll();
      const lay = hexLayout();
      if (!lay || !state.map) return;
      const m = state.map, s = state.zoom;
      let w, h;
      if (lay.stagger === 'y') {
        w = m.width * lay.colW + lay.colW / 2;
        h = m.height * lay.rowH + (m.tileheight * s - lay.rowH);
      } else {
        w = m.width * lay.colW + (m.tilewidth * s - lay.colW);
        h = m.height * lay.rowH + lay.rowH / 2;
      }
      // Only expand if larger — keep main draw coords; improved sizing reduces clipping for hexsidelength
      if (els.canvas.width < w) {
        els.canvas.width = Math.ceil(w);
        els.canvas.style.width = Math.ceil(w) + 'px';
      }
      if (els.canvas.height < h) {
        els.canvas.height = Math.ceil(h);
        els.canvas.style.height = Math.ceil(h) + 'px';
      }
    };

    /* ========== Terrain brush ========== */
    state.selectedTerrainId = null;
    state.terrainTileset = null;

    function terrainsOf(ts) {
      return (ts && ts.terrains) || [];
    }

    function renderTerrainPanel() {
      const panel = $('#terrainPanel');
      if (!panel) return;
      const ts = state.tileset;
      const list = terrainsOf(ts);
      if (!ts || !list.length) {
        panel.textContent = '载入含 terraintypes 的图块集后可选地形';
        return;
      }
      panel.innerHTML = '';
      list.forEach((t) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'terrain-chip' + (state.selectedTerrainId === t.id && state.terrainTileset === ts ? ' active' : '');
        const sw = document.createElement('canvas');
        sw.className = 'swatch';
        sw.width = 18; sw.height = 18;
        const img = api.getImageCache().get(ts.url);
        if (img) {
          const ctx = sw.getContext('2d');
          const col = t.tile % ts.columns, row = Math.floor(t.tile / ts.columns);
          const sx = (ts.margin || 0) + col * (ts.tileWidth + (ts.spacing || 0));
          const sy = (ts.margin || 0) + row * (ts.tileHeight + (ts.spacing || 0));
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, 0, 0, 18, 18);
        }
        chip.appendChild(sw);
        chip.appendChild(document.createTextNode(t.name));
        chip.onclick = () => {
          state.selectedTerrainId = t.id;
          state.terrainTileset = ts;
          state.tool = 'terrain';
          document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === 'terrain'));
          renderTerrainPanel();
          api.status('地形：' + t.name);
        };
        panel.appendChild(chip);
      });
    }

    function transitionPenalty(ts, a, b) {
      if (a === 0xFF || b === 0xFF) return a === b ? 0 : 1;
      if (a === b) return 0;
      // Simplified: any different terrain costs 1 if both exist in set
      return 1;
    }

    function findBestTile(ts, preferred, mask) {
      if (preferred === 0xFFFFFFFF) return null;
      let best = null, bestPen = Infinity, bestProb = -1;
      for (let id = 0; id < ts.count; id++) {
        const terr = tileTerrain(ts, id);
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
        if (pen < bestPen || (pen === bestPen && prob > bestProb)) {
          bestPen = pen; bestProb = prob; best = id;
        }
      }
      return best;
    }

    function paintTerrainAt(x, y) {
      const layer = api.activeLayer();
      const map = state.map;
      const ts = state.terrainTileset || state.tileset;
      if (!layer || layer.type !== 'tilelayer' || !ts || state.selectedTerrainId == null) return;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
      const tid = state.selectedTerrainId;
      const margin = 2;
      const considered = new Set();
      const queue = [[x, y, true]];
      const stamp = new Map(); // key -> local tile id

      while (queue.length) {
        const [cx, cy, initial] = queue.shift();
        const key = cx + ',' + cy;
        if (considered.has(key)) continue;
        if (cx < x - margin || cy < y - margin || cx > x + margin || cy > y + margin) continue;
        if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) continue;
        considered.add(key);

        const gid = layerDataGet(layer, cx, cy, map);
        const curLocal = gid ? gidLocal(gid, ts) : -1;
        const curTerr = curLocal >= 0 ? tileTerrain(ts, curLocal) : 0xFFFFFFFF;

        let preferred, mask;
        if (initial) {
          preferred = makeTerrain(tid);
          mask = 0xFFFFFFFF;
        } else {
          preferred = curTerr;
          mask = 0;
          const neighbors = [[cx, cy - 1, 'up'], [cx, cy + 1, 'down'], [cx - 1, cy, 'left'], [cx + 1, cy, 'right']];
          for (const [nx, ny, dir] of neighbors) {
            const nk = nx + ',' + ny;
            if (!stamp.has(nk)) continue;
            const nTerr = tileTerrain(ts, stamp.get(nk));
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

        if (preferred === 0xFFFFFFFF) continue;
        const best = findBestTile(ts, preferred, mask);
        if (best == null) continue;
        stamp.set(key, best);

        if (initial) {
          queue.push([cx, cy - 1, false], [cx, cy + 1, false], [cx - 1, cy, false], [cx + 1, cy, false]);
        } else {
          // propagate outward once
          for (const [nx, ny] of [[cx, cy - 1], [cx, cy + 1], [cx - 1, cy], [cx + 1, cy]]) {
            const nk = nx + ',' + ny;
            if (!considered.has(nk) && nx >= x - margin && nx <= x + margin && ny >= y - margin && ny <= y + margin) {
              queue.push([nx, ny, false]);
            }
          }
        }
      }

      for (const [key, localId] of stamp) {
        const [px, py] = key.split(',').map(Number);
        layerDataSet(layer, px, py, map, ts.firstgid + localId);
      }
      api.draw();
    }

    /* ========== Automapping ========== */
    state.automapRules = []; // { name, map, rules: [{inRect, outRect, inputs, outputs}] }

    function layerByName(map, name) {
      const find = (layers) => {
        for (const l of layers || []) {
          if ((l.name || '') === name) return l;
          if (l.type === 'group') {
            const f = find(l.layers);
            if (f) return f;
          }
        }
        return null;
      };
      return find(map.layers);
    }

    function extractRegions(layer, map) {
      // connected components of non-zero cells
      const visited = new Set();
      const regions = [];
      const W = map.width, H = map.height;
      const key = (x, y) => x + ',' + y;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!layerDataGet(layer, x, y, map) || visited.has(key(x, y))) continue;
          const cells = [];
          const q = [[x, y]];
          let minX = x, minY = y, maxX = x, maxY = y;
          while (q.length) {
            const [cx, cy] = q.pop();
            const k = key(cx, cy);
            if (visited.has(k) || cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
            if (!layerDataGet(layer, cx, cy, map)) continue;
            visited.add(k);
            cells.push([cx, cy]);
            minX = Math.min(minX, cx); minY = Math.min(minY, cy);
            maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
            q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
          }
          regions.push({ minX, minY, maxX, maxY, cells, w: maxX - minX + 1, h: maxY - minY + 1 });
        }
      }
      // sort top-to-bottom, left-to-right
      regions.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
      return regions;
    }

    function parseInputLayerName(name) {
      // input[not][index]_layerName  OR Input_set style (legacy examples use Input_set)
      const n = name || '';
      let m = /^input(not)?([^_]*)_(.+)$/i.exec(n);
      if (m) return { not: !!m[1], index: m[2] || '', target: m[3] };
      // Also accept "Input_set" / "Input_NotSet" from older examples (target = set / NotSet -> often "set" layer name variations)
      m = /^input[_-]?(not)?[_-]?(.*)$/i.exec(n);
      if (m && !/^regions/i.test(n)) {
        const rest = m[2] || '';
        // Input_set -> target "set"; Input_Ground -> Ground
        return { not: !!m[1] || /not/i.test(n), index: '', target: rest.replace(/^_/, '') || 'set' };
      }
      return null;
    }

    function parseOutputLayerName(name) {
      let m = /^output([^_]*)_(.+)$/i.exec(name || '');
      if (m) return { index: m[1] || '', target: m[2] };
      m = /^output[_-]?(.*)$/i.exec(name || '');
      if (m) return { index: '', target: m[1].replace(/^_/, '') || 'Ground' };
      // Rule_Ground style from comments - treat Rule_* as output? Skip; examples use Output_Ground
      return null;
    }

    function compileRuleMap(ruleMap, fileName) {
      const layers = ruleMap.layers || [];
      const byName = {};
      layers.forEach((l) => { byName[l.name || ''] = l; });
      const regionsLayer = byName.Regions || byName.regions || byName.regions_input;
      const regionsOutLayer = byName.regions_output;
      if (!regionsLayer) {
        api.log('规则缺少 Regions 层：' + fileName);
        return null;
      }
      const inRegions = extractRegions(regionsLayer, ruleMap);
      const outRegions = regionsOutLayer ? extractRegions(regionsOutLayer, ruleMap) : inRegions;
      const inputLayers = [];
      const outputLayers = [];
      for (const l of layers) {
        if (l.type !== 'tilelayer') continue;
        const nm = l.name || '';
        if (/^regions/i.test(nm)) continue;
        const inp = parseInputLayerName(nm);
        if (inp) {
          const p = l.properties || {};
          const strictEmpty = !!(p.StrictEmpty === true || p.StrictEmpty === 'true' || p.strictempty);
          inputLayers.push({ layer: l, ...inp, strictEmpty });
          continue;
        }
        const out = parseOutputLayerName(nm);
        if (out) outputLayers.push({ layer: l, ...out });
      }
      const props = ruleMap.properties || {};
      const deleteTiles = String(props.DeleteTiles || props.deleteTiles || '').toLowerCase() === 'true' ||
        String(props.DeleteTiles || '').toLowerCase() === 'yes';
      const matchOutside = String(props.MatchOutsideMap || 'true').toLowerCase() !== 'false';

      const objectOutputs = [];
      const walkObj = (layers) => {
        for (const l of layers || []) {
          if (l.type === 'objectgroup') {
            const nm = l.name || '';
            let m = /^output([^_]*)_(.+)$/i.exec(nm);
            if (!m) m = /^output[_-]?(.*)$/i.exec(nm);
            if (m) objectOutputs.push({ layer: l, target: (m[2] || m[1] || 'Objects').replace(/^_/, '') || 'Objects', index: m[1] || '' });
          }
          if (l.type === 'group') walkObj(l.layers);
        }
      };
      walkObj(ruleMap.layers || []);
      const rules = [];
      for (let i = 0; i < inRegions.length; i++) {
        const ir = inRegions[i];
        const or = outRegions[Math.min(i, outRegions.length - 1)] || ir;
        rules.push({
          inRect: ir, outRect: or,
          inputs: inputLayers,
          outputs: outputLayers,
          objectOutputs
        });
      }
      const radius = Number((ruleMap.properties || {}).AutomappingRadius || (ruleMap.properties || {}).AutoMappingRadius || 0);
      return { name: fileName, map: ruleMap, rules, deleteTiles, matchOutside, radius };
    }

    function cellMatches(ruleMap, inputSpec, rx, ry, workLayer, wx, wy, workMap) {
      // Tiled 1.2.4 semantics (simplified per-cell):
      // - inputnot: if (strictEmpty || ruleCell nonempty) and work equals rule → fail
      // - input yes: if any yes layer has (strictEmpty || nonempty) at cell, work must equal one of them
      // - if no yes layer defines this cell and only yes lists exist, empty means "anything not used in yes layers"
      const yesSpecs = inputSpec.filter((s) => !s.not);
      const noSpecs = inputSpec.filter((s) => s.not);
      const workRaw = (layerDataGet(workLayer, wx, wy, workMap) >>> 0);

      const isStrict = (spec) => {
        const p = (spec.layer && spec.layer.properties) || {};
        return !!(spec.strictEmpty || p.StrictEmpty === true || p.StrictEmpty === 'true' || p.strictempty === true || p.strictempty === 'true');
      };

      for (const spec of noSpecs) {
        const ruleRaw = (layerDataGet(spec.layer, rx, ry, ruleMap) >>> 0);
        if ((isStrict(spec) || ruleRaw) && ruleRaw === workRaw) return false;
      }

      let defined = false, matched = false;
      const definedGids = [];
      for (const spec of yesSpecs) {
        const ruleRaw = (layerDataGet(spec.layer, rx, ry, ruleMap) >>> 0);
        if (isStrict(spec) || ruleRaw) {
          defined = true;
          definedGids.push(ruleRaw);
          if (ruleRaw === workRaw) matched = true;
        }
      }
      if (!defined) {
        // Exception when only yes lists: forbid tiles that appear anywhere in yes layers of this rule group
        if (noSpecs.length === 0 && yesSpecs.length) {
          const used = new Set();
          for (const spec of yesSpecs) {
            const L = spec.layer, m = ruleMap;
            for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
              const g = layerDataGet(L, x, y, m) >>> 0;
              if (g) used.add(g);
            }
          }
          if (workRaw && used.has(workRaw)) return false;
          return true;
        }
        return true;
      }
      return matched;
    }

    function matchRuleAt(compiled, rule, workMap, ox, oy) {
      // ox,oy = top-left of input region on working map
      const ir = rule.inRect;
      // Group inputs by target layer name + index
      const groups = new Map();
      for (const spec of rule.inputs) {
        const k = (spec.index || '') + '::' + spec.target;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(spec);
      }
      // Each index is alternative; empty index alone is one condition set
      // Simplified: all indices must... actually docs say each index is checked individually (OR across indices)
      const indices = new Set(rule.inputs.map((s) => s.index || ''));
      let anyIndex = false;
      for (const index of indices) {
        let ok = true;
        const specs = rule.inputs.filter((s) => (s.index || '') === index);
        const byTarget = new Map();
        for (const s of specs) {
          if (!byTarget.has(s.target)) byTarget.set(s.target, []);
          byTarget.get(s.target).push(s);
        }
        for (const [target, list] of byTarget) {
          // Resolve working layer: try exact name, then case-insensitive, then "Ground"/"set"
          let workLayer = layerByName(workMap, target);
          if (!workLayer) {
            const low = target.toLowerCase();
            const find = (layers) => {
              for (const l of layers || []) {
                if ((l.name || '').toLowerCase() === low) return l;
                if (l.layers) { const f = find(l.layers); if (f) return f; }
              }
              return null;
            };
            workLayer = find(workMap.layers);
          }
          if (!workLayer) {
            // fallback to active tile layer
            workLayer = api.activeLayer();
            if (!workLayer || workLayer.type !== 'tilelayer') { ok = false; break; }
          }
          for (let dy = 0; dy < ir.h; dy++) {
            for (let dx = 0; dx < ir.w; dx++) {
              const rx = ir.minX + dx, ry = ir.minY + dy;
              // only check cells inside region mask
              if (!layerDataGet(compiled.map.layers.find(l => /^regions$/i.test(l.name || '')) || layerByName(compiled.map, 'Regions') || layerByName(compiled.map, 'regions'), rx, ry, compiled.map)) {
                // if using region mask - skip cells outside region tiles
              }
              const regionLayer = layerByName(compiled.map, 'Regions') || layerByName(compiled.map, 'regions') || layerByName(compiled.map, 'regions_input');
              if (regionLayer && !layerDataGet(regionLayer, rx, ry, compiled.map)) continue;
              const wx = ox + dx, wy = oy + dy;
              if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) {
                if (!compiled.matchOutside) { ok = false; break; }
                continue;
              }
              if (!cellMatches(compiled.map, list, rx, ry, workLayer, wx, wy, workMap)) {
                ok = false; break;
              }
            }
            if (!ok) break;
          }
          if (!ok) break;
        }
        if (ok) { anyIndex = true; break; }
      }
      return anyIndex || indices.size === 0;
    }

    function applyRuleAt(compiled, rule, workMap, ox, oy) {
      const or = rule.outRect;
      const ir = rule.inRect;
      // Map output relative to input top-left
      const outOx = ox + (or.minX - ir.minX);
      const outOy = oy + (or.minY - ir.minY);
      if (compiled.deleteTiles) {
        for (const out of rule.outputs) {
          let workLayer = layerByName(workMap, out.target) || api.activeLayer();
          if (!workLayer || workLayer.type !== 'tilelayer') continue;
          for (let dy = 0; dy < or.h; dy++) {
            for (let dx = 0; dx < or.w; dx++) {
              const rx = or.minX + dx, ry = or.minY + dy;
              const regionOut = layerByName(compiled.map, 'regions_output') || layerByName(compiled.map, 'Regions') || layerByName(compiled.map, 'regions');
              if (regionOut && !layerDataGet(regionOut, rx, ry, compiled.map)) continue;
              const wx = outOx + dx, wy = outOy + dy;
              if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) continue;
              layerDataSet(workLayer, wx, wy, workMap, 0);
            }
          }
        }
      }
      for (const out of rule.outputs) {
        let workLayer = layerByName(workMap, out.target);
        if (!workLayer) {
          // create layer
          workLayer = {
            id: Math.max(0, ...(workMap.layers || []).map((l) => l.id || 0)) + 1,
            name: out.target, type: 'tilelayer', x: 0, y: 0,
            width: workMap.width, height: workMap.height, opacity: 1, visible: true,
            data: Array(workMap.width * workMap.height).fill(0)
          };
          workMap.layers.push(workLayer);
        }
        if (workLayer.type !== 'tilelayer') continue;
        for (let dy = 0; dy < or.h; dy++) {
          for (let dx = 0; dx < or.w; dx++) {
            const rx = or.minX + dx, ry = or.minY + dy;
            const regionOut = layerByName(compiled.map, 'regions_output') || layerByName(compiled.map, 'Regions') || layerByName(compiled.map, 'regions');
            if (regionOut && !layerDataGet(regionOut, rx, ry, compiled.map)) continue;
            const gid = layerDataGet(out.layer, rx, ry, compiled.map);
            if (!gid) continue;
            const wx = outOx + dx, wy = outOy + dy;
            if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) continue;
            layerDataSet(workLayer, wx, wy, workMap, gid);
          }
        }
      }
      // Object group outputs (output_* object layers in rule map)
      const tw = workMap.tilewidth, th = workMap.tileheight;
      const rtw = compiled.map.tilewidth || tw, rth = compiled.map.tileheight || th;
      for (const out of rule.objectOutputs || []) {
        let dst = layerByName(workMap, out.target);
        if (!dst || dst.type !== 'objectgroup') {
          dst = {
            id: Math.max(0, ...(workMap.layers || []).map((l) => l.id || 0)) + 1,
            name: out.target, type: 'objectgroup', draworder: 'topdown', objects: []
          };
          workMap.layers.push(dst);
        }
        const rx0 = or.minX * rtw, ry0 = or.minY * rth;
        const rx1 = (or.maxX + 1) * rtw, ry1 = (or.maxY + 1) * rth;
        const pixelOffsetX = outOx * tw - rx0;
        const pixelOffsetY = outOy * th - ry0;
        for (const obj of (out.layer.objects || [])) {
          const oxp = obj.x || 0, oyp = obj.y || 0;
          const ow = obj.width || 0, oh = obj.height || 0;
          if (oxp + ow < rx0 || oyp + oh < ry0 || oxp > rx1 || oyp > ry1) continue;
          const clone = JSON.parse(JSON.stringify(obj));
          clone.id = 1 + Math.max(0, ...(dst.objects || []).map((o) => o.id || 0));
          clone.x = oxp + pixelOffsetX;
          clone.y = oyp + pixelOffsetY;
          dst.objects.push(clone);
        }
      }
    }

    function runAutomap() {
      if (!state.map) { api.status('无地图'); return; }
      if (!state.automapRules.length) { api.status('请先载入规则'); return; }
      api.snapshot();
      const work = state.map;
      let matches = 0;
      for (const compiled of state.automapRules) {
        for (const rule of compiled.rules) {
          const ir = rule.inRect;
          for (let oy = 0; oy <= work.height - ir.h; oy++) {
            for (let ox = 0; ox <= work.width - ir.w; ox++) {
              if (matchRuleAt(compiled, rule, work, ox, oy)) {
                applyRuleAt(compiled, rule, work, ox, oy);
                matches++;
              }
            }
          }
        }
      }
      api.renderAll();
      api.status('自动地图完成：应用 ' + matches + ' 处');
      api.log('自动地图匹配 ' + matches + ' 处');
    }

    async function loadAutomapFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const byName = new Map(files.map((f) => [f.name, f]));
      let ruleFiles = [];
      const txt = files.find((f) => f.name.toLowerCase() === 'rules.txt');
      if (txt) {
        const text = await txt.text();
        for (const line of text.split(/\r?\n/)) {
          const s = line.trim();
          if (!s || s.startsWith('#') || s.startsWith('//')) continue;
          const base = s.split('/').pop();
          if (byName.has(base)) ruleFiles.push(byName.get(base));
          else api.log('rules.txt 引用未选中：' + s);
        }
      } else {
        ruleFiles = files.filter((f) => /\.tmx$/i.test(f.name) || /\.tmj$/i.test(f.name));
      }
      state.automapRules = [];
      for (const f of ruleFiles) {
        try {
          const text = await f.text();
          const map = /\.tmx$/i.test(f.name) ? api.parseTmxAdvanced(text) : JSON.parse(text);
          // attach images from selection for gids display (optional)
          const compiled = compileRuleMap(map, f.name);
          if (compiled && compiled.rules.length) state.automapRules.push(compiled);
          else api.log('未解析到规则：' + f.name);
        } catch (err) {
          api.log('规则载入失败 ' + f.name + '：' + err.message);
        }
      }
      const meta = $('#automapMeta');
      if (meta) meta.textContent = `已载入 ${state.automapRules.length} 个规则文件，共 ${state.automapRules.reduce((n, c) => n + c.rules.length, 0)} 条规则`;
      api.status(meta ? meta.textContent : '规则已载入');
    }

    /* ========== Collision editor GUI ========== */
    const col = {
      open: false, tool: 'select', shapes: [], selected: -1, drag: null
    };

    function currentTileRec() {
      const ts = state.tileset;
      if (!ts) return null;
      if (!ts.tiles) ts.tiles = {};
      const id = state.tile;
      return ts.tiles[id] || ts.tiles[String(id)] || (ts.tiles[id] = {});
    }

    function openCollisionEditor() {
      if (!state.tileset) { api.status('请先载入图块集并选中图块'); return; }
      const rec = currentTileRec();
      col.shapes = JSON.parse(JSON.stringify((rec.objectgroup && rec.objectgroup.objects) || []));
      col.selected = -1;
      col.open = true;
      const root = $('#collisionEditor');
      root.classList.remove('hidden');
      root.setAttribute('aria-hidden', 'false');
      drawCollisionEditor();
    }
    function closeCollisionEditor(save) {
      if (save !== false) {
        const rec = currentTileRec();
        if (rec) {
          api.snapshot();
          rec.objectgroup = { objects: col.shapes };
          if ($('#tileCollision')) $('#tileCollision').value = JSON.stringify(rec.objectgroup, null, 2);
        }
      }
      col.open = false;
      $('#collisionEditor').classList.add('hidden');
      api.renderAll();
    }
    function drawCollisionEditor() {
      const canvas = $('#collisionCanvas');
      if (!canvas || !state.tileset) return;
      const ts = state.tileset;
      const ctx = canvas.getContext('2d');
      const scale = Math.floor(Math.min(256 / ts.tileWidth, 256 / ts.tileHeight));
      const tw = ts.tileWidth * scale, th = ts.tileHeight * scale;
      canvas.width = tw; canvas.height = th;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, tw, th);
      const img = api.getImageCache().get(ts.url);
      if (img) {
        const idx = state.tile;
        const sx = (ts.margin || 0) + (idx % ts.columns) * (ts.tileWidth + (ts.spacing || 0));
        const sy = (ts.margin || 0) + Math.floor(idx / ts.columns) * (ts.tileHeight + (ts.spacing || 0));
        ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, 0, 0, tw, th);
      }
      col.shapes.forEach((o, i) => {
        ctx.save();
        ctx.strokeStyle = i === col.selected ? '#66a8ff' : '#ff4d6d';
        ctx.fillStyle = i === col.selected ? 'rgba(102,168,255,.25)' : 'rgba(255,77,109,.2)';
        ctx.lineWidth = 2;
        const x = (o.x || 0) * scale, y = (o.y || 0) * scale;
        const w = (o.width || 0) * scale, h = (o.height || 0) * scale;
        if (o.ellipse) {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        } else if (o.polygon) {
          ctx.beginPath();
          o.polygon.forEach((p, j) => { const px = x + p.x * scale, py = y + p.y * scale; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
          ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
        }
        ctx.restore();
      });
    }
    function collisionPointer(e) {
      const canvas = $('#collisionCanvas');
      const r = canvas.getBoundingClientRect();
      const ts = state.tileset;
      const scale = canvas.width / ts.tileWidth;
      return {
        x: (e.clientX - r.left) / scale,
        y: (e.clientY - r.top) / scale,
        scale
      };
    }
    function hitShape(px, py) {
      for (let i = col.shapes.length - 1; i >= 0; i--) {
        const o = col.shapes[i];
        const x = o.x || 0, y = o.y || 0, w = o.width || 0, h = o.height || 0;
        if (px >= x && py >= y && px <= x + w && py <= y + h) return i;
      }
      return -1;
    }

    /* ========== Multi-object selection ========== */
    state.selectedObjects = [];

    function syncPrimarySelection() {
      state.selectedObject = state.selectedObjects[0] || null;
    }

    /* ========== TMX base64+zlib export ========== */
    function encodeGidsZlib(gids) {
      const buf = new Uint8Array(gids.length * 4);
      for (let i = 0; i < gids.length; i++) {
        const g = gids[i] >>> 0;
        buf[i * 4] = g & 255;
        buf[i * 4 + 1] = (g >>> 8) & 255;
        buf[i * 4 + 2] = (g >>> 16) & 255;
        buf[i * 4 + 3] = (g >>> 24) & 255;
      }
      const compressed = window.pako.deflate(buf); // zlib wrapper
      let s = '';
      for (let i = 0; i < compressed.length; i++) s += String.fromCharCode(compressed[i]);
      return btoa(s);
    }

    function toTmxZlib() {
      const m = state.map;
      // Build on top of existing toTmx but replace csv data — easier to regenerate layers
      const xmlEscape = api.xmlEscape;
      const propertiesXml = api.propertiesXml;
      const objectXml = api.objectXml;
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
        if (m.orientation === 'hexagonal') attrs.push(`hexsidelength="${m.hexsidelength || Math.floor(m.tileheight / 2)}"`);
      }
      const tilesets = (m.tilesets || []).map((t) => {
        if (t.source) return `  <tileset firstgid="${t.firstgid || 1}" source="${xmlEscape(t.source)}"/>`;
        let terrainXml = '';
        if (t.terrains && t.terrains.length) {
          terrainXml = '<terraintypes>' + t.terrains.map((tr) => `<terrain name="${xmlEscape(tr.name)}" tile="${tr.tile || 0}"/>`).join('') + '</terraintypes>';
        }
        let tileXml = '';
        const tiles = t.tiles || {};
        Object.keys(tiles).forEach((id) => {
          const rec = tiles[id];
          if (!rec) return;
          const parts = [];
          if (rec.terrain != null) {
            const terr = rec.terrain >>> 0;
            const corners = [0, 1, 2, 3].map((c) => {
              const v = (terr >>> ((3 - c) * 8)) & 0xFF;
              return v === 0xFF ? '' : String(v);
            });
            parts.push(`terrain="${corners.join(',')}"`);
          }
          if (rec.probability != null) parts.push(`probability="${rec.probability}"`);
          if (parts.length) tileXml += `<tile id="${id}" ${parts.join(' ')}/>`;
        });
        return `  <tileset firstgid="${t.firstgid || 1}" name="${xmlEscape(t.name || '图块集')}" tilewidth="${t.tilewidth || m.tilewidth}" tileheight="${t.tileheight || m.tileheight}" tilecount="${t.tilecount || 0}" columns="${t.columns || 0}"><image source="${xmlEscape(t.image || '')}"/>${terrainXml}${tileXml}</tileset>`;
      }).join('\n');

      function layerXml(l, indent) {
        if (l.type === 'tilelayer') {
          const gids = [];
          for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) gids.push(api.tileAt(l, x, y, m) >>> 0);
          const b64 = encodeGidsZlib(gids);
          return `${indent}<layer id="${l.id || 1}" name="${xmlEscape(l.name || '图层')}" width="${m.width}" height="${m.height}"` +
            `${l.visible === false ? ' visible="0"' : ''}>\n${propertiesXml(l.properties, indent)}` +
            `${indent}  <data encoding="base64" compression="zlib">\n${b64}\n${indent}  </data>\n${indent}</layer>`;
        }
        if (l.type === 'objectgroup') {
          return `${indent}<objectgroup id="${l.id || 1}" name="${xmlEscape(l.name || '对象层')}">\n` +
            (l.objects || []).map((o) => objectXml(o, indent + '  ')).join('\n') + `\n${indent}</objectgroup>`;
        }
        if (l.type === 'group') {
          return `${indent}<group id="${l.id || 1}" name="${xmlEscape(l.name || '组层')}">\n` +
            (l.layers || []).map((c) => layerXml(c, indent + '  ')).join('\n') + `\n${indent}</group>`;
        }
        if (l.type === 'imagelayer') {
          const src = String(l.image || '').startsWith('data:') ? '' : xmlEscape(l.image || '');
          return `${indent}<imagelayer id="${l.id || 1}" name="${xmlEscape(l.name || '图像层')}"><image source="${src}"/></imagelayer>`;
        }
        return '';
      }
      const layers = (m.layers || []).map((l) => layerXml(l, '  ')).filter(Boolean).join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<map ${attrs.join(' ')}>\n` + propertiesXml(m.properties, '') + (tilesets ? tilesets + '\n' : '') + layers + '\n</map>\n';
    }

    function saveTmxZlib() {
      if (!state.map) return;
      if (!window.pako || !window.pako.deflate) { api.status('需要 pako.deflate'); return; }
      api.download('tiled-map.tmx', 'application/xml', toTmxZlib());
      api.status('已导出 TMX (base64+zlib)');
      api.log('导出：tiled-map.tmx (zlib)');
    }

    /* ========== Wire UI ========== */
    // Override save-tmx to zlib by default; keep CSV via shift? Use zlib as primary.
    document.querySelectorAll('[data-action="save-tmx"]').forEach((b) => {
      b.title = '导出 TMX (base64+zlib)';
      b.onclick = (e) => { e.stopImmediatePropagation(); saveTmxZlib(); };
    });

    document.querySelectorAll('[data-action="automap"]').forEach((b) => {
      b.onclick = () => runAutomap();
    });
    document.querySelectorAll('[data-action="edit-collision"]').forEach((b) => {
      b.onclick = () => openCollisionEditor();
    });
    document.querySelectorAll('[data-action="close-collision"]').forEach((b) => {
      b.onclick = () => closeCollisionEditor(true);
    });
    document.querySelectorAll('[data-coltool]').forEach((b) => {
      b.onclick = () => {
        col.tool = b.dataset.coltool;
        document.querySelectorAll('[data-coltool]').forEach((x) => x.classList.toggle('active', x === b));
      };
    });

    const automapInput = $('#automapInput');
    if (automapInput) automapInput.onchange = () => loadAutomapFiles(automapInput.files);

    // Terrain tool button
    document.querySelectorAll('[data-tool="terrain"]').forEach((b) => {
      b.onclick = () => {
        state.tool = 'terrain';
        document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('active', x === b));
        api.status('工具：地形笔刷');
        renderTerrainPanel();
      };
    });

    // Hook canvas for multi-select (terrain/wang handled in tiled-parity.js)
    const canvas = els.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      if (state.tool === 'select' && e.shiftKey) {
        // multi-select add
        const r = canvas.getBoundingClientRect();
        const p = api.screenToMap(e.clientX - r.left, e.clientY - r.top);
        const px = p.x * state.map.tilewidth, py = p.y * state.map.tileheight;
        const layer = api.activeLayer();
        const hit = (layer && layer.objects || []).slice().reverse().find((o) => {
          const x = o.x || 0, y = o.y || 0, w = Math.max(o.width || 0, 4), h = Math.max(o.height || 0, 4);
          return px >= x && py >= y && px <= x + w && py <= y + h;
        });
        if (hit) {
          if (!state.selectedObjects.includes(hit)) state.selectedObjects.push(hit);
          else state.selectedObjects = state.selectedObjects.filter((o) => o !== hit);
          syncPrimarySelection();
          api.renderAll();
          api.status('已选对象 ×' + state.selectedObjects.length);
          e.stopPropagation();
        }
      } else if (state.tool === 'select' && !e.shiftKey) {
        // clear multi on normal click — let main handler run, then sync
        setTimeout(() => {
          if (state.selectedObject && !state.selectedObjects.includes(state.selectedObject)) {
            state.selectedObjects = [state.selectedObject];
          } else if (!state.selectedObject) state.selectedObjects = [];
        }, 0);
      }
    }, true);

    // terrain drag handled in parity

    // Collision canvas events
    const colCanvas = $('#collisionCanvas');
    if (colCanvas) {
      colCanvas.addEventListener('pointerdown', (e) => {
        const p = collisionPointer(e);
        if (col.tool === 'select') {
          col.selected = hitShape(p.x, p.y);
          if (col.selected >= 0) {
            const o = col.shapes[col.selected];
            col.drag = { mode: 'move', ox: p.x - (o.x || 0), oy: p.y - (o.y || 0) };
          }
        } else if (col.tool === 'delete') {
          const i = hitShape(p.x, p.y);
          if (i >= 0) { col.shapes.splice(i, 1); col.selected = -1; }
        } else if (col.tool === 'rect' || col.tool === 'ellipse') {
          col.drag = { mode: 'create', x0: p.x, y0: p.y, ellipse: col.tool === 'ellipse' };
        }
        drawCollisionEditor();
      });
      colCanvas.addEventListener('pointermove', (e) => {
        if (!col.drag) return;
        const p = collisionPointer(e);
        if (col.drag.mode === 'move' && col.selected >= 0) {
          const o = col.shapes[col.selected];
          o.x = p.x - col.drag.ox; o.y = p.y - col.drag.oy;
        } else if (col.drag.mode === 'create') {
          drawCollisionEditor();
          const ctx = colCanvas.getContext('2d');
          const scale = colCanvas.width / state.tileset.tileWidth;
          const x = Math.min(col.drag.x0, p.x) * scale, y = Math.min(col.drag.y0, p.y) * scale;
          const w = Math.abs(p.x - col.drag.x0) * scale, h = Math.abs(p.y - col.drag.y0) * scale;
          ctx.strokeStyle = '#66a8ff'; ctx.setLineDash([4, 3]);
          if (col.drag.ellipse) { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
          else ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          return;
        }
        drawCollisionEditor();
      });
      colCanvas.addEventListener('pointerup', (e) => {
        if (!col.drag) return;
        const p = collisionPointer(e);
        if (col.drag.mode === 'create') {
          const x = Math.min(col.drag.x0, p.x), y = Math.min(col.drag.y0, p.y);
          const w = Math.abs(p.x - col.drag.x0), h = Math.abs(p.y - col.drag.y0);
          if (w > 1 && h > 1) {
            const o = { id: col.shapes.length + 1, x, y, width: w, height: h };
            if (col.drag.ellipse) o.ellipse = true;
            col.shapes.push(o);
            col.selected = col.shapes.length - 1;
          }
        }
        col.drag = null;
        drawCollisionEditor();
      });
    }

    // Delete multi selection
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedObjects.length > 1 && !/input|textarea/i.test(e.target.tagName)) {
        api.snapshot();
        const layer = api.activeLayer();
        if (layer && layer.objects) {
          const set = new Set(state.selectedObjects);
          layer.objects = layer.objects.filter((o) => !set.has(o));
          state.selectedObjects = [];
          syncPrimarySelection();
          api.renderAll();
        }
      }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && state.tool === 'select') {
        const layer = api.activeLayer();
        if (layer && layer.objects) {
          e.preventDefault();
          state.selectedObjects = layer.objects.slice();
          syncPrimarySelection();
          api.renderAll();
          api.status('全选对象 ×' + state.selectedObjects.length);
        }
      }
    });

    // Refresh terrain panel when tileset renders — poll lightly via Mutation on tileset meta
    const meta = els.meta;
    if (meta) {
      const obs = new MutationObserver(() => renderTerrainPanel());
      obs.observe(meta, { childList: true, characterData: true, subtree: true });
    }
    renderTerrainPanel();

    // Expose for tests
    api.features = {
      makeTerrain, findBestTile, tileTerrain, encodeGidsZlib, toTmxZlib,
      compileRuleMap, extractRegions, paintTerrainAt, runAutomap, openCollisionEditor,
      matchRuleAt, applyRuleAt, layerByName, cellMatches, parseInputLayerName, parseOutputLayerName
    };
    api.log('扩展已加载：自动地图 / 地形 / 碰撞编辑 / zlib 导出 / 多选');
  }

  window.initTiledFeatures = initTiledFeatures;
  if (window.TiledApp) initTiledFeatures(window.TiledApp);
})();

/*! Tiled 1.2.4 batch5: rule tileset preview + rich object-out, Wang look-ahead,
 * iso neighbors, world multi-map, chunks UX, propertytypes, type colors, undo coalesce */
(function () {
  'use strict';

  function boot(api) {
    if (!api || api._batch5) return;
    api._batch5 = true;
    const state = api.getState();
    const els = api.getEls();
    const F = api.features || (api.features = {});
    const $ = (s) => document.querySelector(s);

    state.propertyTypes = state.propertyTypes || [];
    state.worldView = state.worldView !== false; // default on when world loaded
    state.worldMapCache = state.worldMapCache || new Map();
    state.showChunkBounds = true;
    state.wangTemplateCap = 1024;

    function setNib(wid, nibIndex, val) {
      wid = wid >>> 0;
      wid &= ~(0xf << (nibIndex * 4));
      wid |= (val & 0xf) << (nibIndex * 4);
      return wid >>> 0;
    }
    function getNib(wid, i) { return (wid >>> (i * 4)) & 0xf; }

    /* ===== Object type colors on canvas ===== */
    window.__tiledObjectTypeColor = function (o) {
      if (!o || !o.type) return null;
      const t = (state.objectTypes || []).find((x) => x.name === o.type);
      if (!t || !t.color) return null;
      let c = t.color;
      if (/^#/.test(c) && c.length === 9) c = '#' + c.slice(3); // strip alpha from #AARRGGBB-ish
      if (/^#/.test(c) && c.length > 7) c = c.slice(0, 7);
      return c;
    };

    /* ===== 1. Rule editor: tileset paint preview + rich objects ===== */
    function drawGidPreview(ctx, gid, px, py, tw, th) {
      gid = gid >>> 0;
      if (!gid) return false;
      const clear = api.clearGid(gid);
      const ts = api.tilesetForGid(clear) || state.tileset;
      if (!ts || !ts.url) return false;
      const imgCache = api.getImageCache();
      const img = imgCache.get(ts.url);
      if (!img) return false;
      const local = clear - ts.firstgid;
      const cols = ts.columns || 1;
      const tW = ts.tileWidth || ts.tilewidth || 32;
      const tH = ts.tileHeight || ts.tileheight || 32;
      const sx = (ts.margin || 0) + (local % cols) * (tW + (ts.spacing || 0));
      const sy = (ts.margin || 0) + Math.floor(local / cols) * (tH + (ts.spacing || 0));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, tW, tH, px + 1, py + 1, tw - 2, th - 2);
      return true;
    }

    const _drawRule = F.openRuleEditor && null;
    // Replace drawRuleCanvas by patching via Features override after batch4
    function drawRuleCanvasEnhanced() {
      const canvas = $('#ruleCanvas');
      if (!canvas || !state.ruleEdit) return;
      const re = state.ruleEdit;
      const m = re.map;
      const tw = 32, th = 32;
      canvas.width = m.width * tw;
      canvas.height = m.height * th;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      (m.layers || []).forEach((l, li) => {
        if (l.type !== 'tilelayer' || !l.visible) return;
        const isActive = li === re.layerIdx;
        const isRegions = /^regions/i.test(l.name || '');
        for (let y = 0; y < m.height; y++) {
          for (let x = 0; x < m.width; x++) {
            const gid = (l.data[y * m.width + x] || 0) >>> 0;
            const px = x * tw, py = y * th;
            if (gid) {
              const drawn = !isRegions && drawGidPreview(ctx, gid, px, py, tw, th);
              if (!drawn || isRegions) {
                if (isRegions) ctx.fillStyle = 'rgba(80,160,255,0.55)';
                else if (/^input/i.test(l.name || '')) ctx.fillStyle = isActive ? 'rgba(255,180,60,0.5)' : 'rgba(255,180,60,0.25)';
                else ctx.fillStyle = isActive ? 'rgba(80,220,120,0.5)' : 'rgba(80,220,120,0.25)';
                if (!drawn) ctx.fillRect(px + 1, py + 1, tw - 2, th - 2);
                else if (isRegions) ctx.fillRect(px + 1, py + 1, tw - 2, th - 2);
              }
              if (isRegions) {
                ctx.fillStyle = 'rgba(80,160,255,0.35)';
                ctx.fillRect(px + 1, py + 1, tw - 2, th - 2);
              }
            } else if (isActive) {
              ctx.strokeStyle = 'rgba(255,255,255,0.08)';
              ctx.strokeRect(px + 0.5, py + 0.5, tw - 1, th - 1);
            }
          }
        }
      });
      (m.layers || []).forEach((l) => {
        if (l.type !== 'objectgroup') return;
        const s = tw / (m.tilewidth || 32);
        (l.objects || []).forEach((o) => {
          const typeColor = window.__tiledObjectTypeColor(o) || '#f472b6';
          ctx.strokeStyle = typeColor;
          ctx.fillStyle = typeColor + '44';
          const ox = (o.x || 0) * s, oy = (o.y || 0) * s;
          const ow = Math.max(4, (o.width || 16) * s), oh = Math.max(4, (o.height || 16) * s);
          if (o.ellipse) {
            ctx.beginPath();
            ctx.ellipse(ox + ow / 2, oy + oh / 2, ow / 2, oh / 2, 0, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
          } else if (o.point) {
            ctx.beginPath(); ctx.arc(ox, oy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          } else if (o.polygon || o.polyline) {
            const pts = o.polygon || o.polyline;
            ctx.beginPath();
            pts.forEach((q, i) => { const ax = ox + q.x * s, ay = oy + q.y * s; i ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay); });
            if (o.polygon) ctx.closePath();
            ctx.stroke();
          } else if (o.gid) {
            drawGidPreview(ctx, o.gid, ox, oy, ow, oh);
            ctx.strokeRect(ox, oy, ow, oh);
          } else {
            ctx.fillRect(ox, oy, ow, oh);
            ctx.strokeRect(ox, oy, ow, oh);
          }
          if (o.name) {
            ctx.fillStyle = '#e8eaed';
            ctx.font = '10px sans-serif';
            ctx.fillText(o.name, ox + 2, oy + 10);
          }
        });
      });
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let x = 0; x <= m.width; x++) {
        ctx.beginPath(); ctx.moveTo(x * tw + 0.5, 0); ctx.lineTo(x * tw + 0.5, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= m.height; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * th + 0.5); ctx.lineTo(canvas.width, y * th + 0.5); ctx.stroke();
      }
    }

    // Monkey-patch: re-bind rule canvas draw by wrapping openRuleEditor and paint
    const _openRule = F.openRuleEditor;
    if (_openRule) {
      F.openRuleEditor = function (c) {
        _openRule(c);
        // Replace draw calls: override via interval-free hook on canvas paint
        const canvas = $('#ruleCanvas');
        if (canvas && !canvas._b5) {
          canvas._b5 = true;
          // re-wrap painting to redraw enhanced
          const rebind = () => {
            drawRuleCanvasEnhanced();
          };
          // Patch rulePaint path: listen to pointerup on canvas
          canvas.addEventListener('pointerup', rebind);
          canvas.addEventListener('pointerdown', () => setTimeout(rebind, 0));
          rebind();
        } else {
          drawRuleCanvasEnhanced();
        }
      };
    }

    function ruleLayer() {
      const re = state.ruleEdit;
      if (!re) return null;
      return (re.map.layers || [])[re.layerIdx] || null;
    }
    function addRuleObject(shape) {
      const re = state.ruleEdit;
      if (!re) return;
      const layer = ruleLayer();
      if (!layer || layer.type !== 'objectgroup') {
        api.status('请先选中对象输出层');
        return;
      }
      if (!layer.objects) layer.objects = [];
      const id = Math.max(0, ...layer.objects.map((o) => o.id || 0)) + 1;
      const tw = re.map.tilewidth || 32, th = re.map.tileheight || 32;
      const type = ($('#ruleObjType') && $('#ruleObjType').value) || '';
      const base = { id, name: shape + id, type, x: tw, y: th, rotation: 0, visible: true, properties: {} };
      if (shape === 'rect') Object.assign(base, { width: tw, height: th });
      else if (shape === 'ellipse') Object.assign(base, { width: tw, height: th, ellipse: true });
      else if (shape === 'point') Object.assign(base, { width: 0, height: 0, point: true });
      else if (shape === 'polygon') Object.assign(base, {
        width: tw, height: th,
        polygon: [{ x: 0, y: 0 }, { x: tw, y: 0 }, { x: tw / 2, y: th }]
      });
      else if (shape === 'tile') {
        const ts = state.tileset;
        const gid = ts ? ts.firstgid + (state.tile || 0) : 1;
        Object.assign(base, { width: tw, height: th, gid });
      }
      layer.objects.push(base);
      drawRuleCanvasEnhanced();
      api.status('已添加规则对象：' + shape);
    }

    /* ===== 2. Wang: wildWangIdIsUsed look-ahead + templates + iso ===== */
    function edgeColorCount(ws) {
      if (Array.isArray(ws.edgecolors)) return Math.max(1, ws.edgecolors.length);
      if (ws.edgecolorcount != null) return Math.max(1, Number(ws.edgecolorcount));
      let max = 0;
      Object.values(ws.tiles || {}).forEach((rec) => {
        const id = rec.wangId >>> 0;
        for (let i = 0; i < 8; i += 2) max = Math.max(max, getNib(id, i));
      });
      return Math.max(1, max);
    }
    function cornerColorCount(ws) {
      if (Array.isArray(ws.cornercolors)) return Math.max(1, ws.cornercolors.length);
      if (ws.cornercolorcount != null) return Math.max(1, Number(ws.cornercolorcount));
      let max = 0;
      Object.values(ws.tiles || {}).forEach((rec) => {
        const id = rec.wangId >>> 0;
        for (let i = 1; i < 8; i += 2) max = Math.max(max, getNib(id, i));
      });
      return Math.max(1, max);
    }

    function wangIdIsUsed(ws, wangId) {
      wangId = wangId >>> 0;
      for (const rec of Object.values(ws.tiles || {})) {
        if ((rec.wangId >>> 0) === wangId) return true;
      }
      if (ws._flipVariants) {
        for (const rec of Object.values(ws._flipVariants)) {
          if ((rec.wangId >>> 0) === wangId) return true;
        }
      }
      return false;
    }

    /** Enumerate wildcard expansions like WangId::variations */
    function wangIdVariations(wangId, edgeColors, cornerColors) {
      wangId = wangId >>> 0;
      const zeros = [];
      for (let i = 0; i < 8; i++) {
        if (getNib(wangId, i)) continue;
        if ((i & 1) === 0) {
          if (edgeColors > 1) zeros.push(i);
        } else if (cornerColors > 1) zeros.push(i);
      }
      const out = [];
      if (!zeros.length) { out.push(wangId); return out; }
      const vals = zeros.map(() => 0);
      const maxes = zeros.map((i) => ((i & 1) ? cornerColors : edgeColors));
      // include wild 0 as first value? C++ starts at current (0) and goes to maxColors inclusive
      let guard = 0;
      const maxIter = 200000;
      while (guard++ < maxIter) {
        let id = wangId;
        for (let z = 0; z < zeros.length; z++) id = setNib(id, zeros[z], vals[z]);
        out.push(id >>> 0);
        let carry = true;
        for (let z = 0; z < zeros.length && carry; z++) {
          vals[z]++;
          if (vals[z] > maxes[z]) vals[z] = 0;
          else carry = false;
        }
        if (carry) break;
      }
      return out;
    }

    function wildWangIdIsUsed(ws, wangId) {
      if (!(wangId >>> 0)) return true;
      if (F.expandWangFlipVariants) F.expandWangFlipVariants(ws);
      const ec = edgeColorCount(ws), cc = cornerColorCount(ws);
      const vars = wangIdVariations(wangId, ec, cc);
      for (const id of vars) {
        if (wangIdIsUsed(ws, id)) return true;
      }
      return false;
    }

    function staggerIndexNum(map) {
      return (map.staggerindex || 'odd') === 'even' ? 1 : 0;
    }
    function hexTopLeft(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') return ((y & 1) ^ si) ? { x: x, y: y - 1 } : { x: x - 1, y: y - 1 };
      return ((x & 1) ^ si) ? { x: x - 1, y: y } : { x: x - 1, y: y - 1 };
    }
    function hexTopRight(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') return ((y & 1) ^ si) ? { x: x + 1, y: y - 1 } : { x: x, y: y - 1 };
      return ((x & 1) ^ si) ? { x: x + 1, y: y } : { x: x + 1, y: y - 1 };
    }
    function hexBottomLeft(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') return ((y & 1) ^ si) ? { x: x, y: y + 1 } : { x: x - 1, y: y + 1 };
      return ((x & 1) ^ si) ? { x: x - 1, y: y + 1 } : { x: x - 1, y: y };
    }
    function hexBottomRight(x, y, map) {
      const si = staggerIndexNum(map);
      if ((map.staggeraxis || 'y') === 'y') return ((y & 1) ^ si) ? { x: x + 1, y: y + 1 } : { x: x, y: y + 1 };
      return ((x & 1) ^ si) ? { x: x + 1, y: y + 1 } : { x: x + 1, y: y };
    }

    /**
     * Surrounding points:
     * - orthogonal / pure isometric: tile-space 8-neighbors (iso uses rectangular map coords)
     * - staggered / hexagonal: HexagonalRenderer corners + stagger axis extensions
     */
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
      } else if (ori === 'isometric') {
        // Pure isometric: same tile-index neighbors as orthogonal (diamond is render-only).
        // Modeled as its own branch for parity with Tiled (StaggeredRenderer not used).
        const around = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
        for (let i = 0; i < 8; i++) points[i] = { x: x + around[i][0], y: y + around[i][1] };
      } else {
        const around = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
        for (let i = 0; i < 8; i++) points[i] = { x: x + around[i][0], y: y + around[i][1] };
      }
      return points;
    }

    function surroundingWangIdFull(layer, map, x, y, ws, ts) {
      let id = 0;
      const points = getSurroundingPoints(x, y, map);
      for (let i = 0; i < 8; i++) {
        const p = points[i];
        if (!map.infinite && (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height)) continue;
        const gid = api.tileAt(layer, p.x, p.y, map) >>> 0;
        if (!gid) continue;
        const local = api.clearGid(gid) - ts.firstgid;
        const rec = (ws.tiles || {})[local];
        const nid = rec ? (rec.wangId >>> 0) : 0;
        if (!nid) continue;
        const fromNeighbor = getNib(nid, (i + 4) % 8);
        id = setNib(id, i, fromNeighbor);
      }
      return id >>> 0;
    }

    function updateToAdjacent(wangId, adjacentWangId, position) {
      // set wangId's color at `position` from adjacentWangId's opposite
      const opp = (position + 4) % 8;
      return setNib(wangId, position, getNib(adjacentWangId, opp));
    }

    function wangFillerFillLookAhead(region) {
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
      const complete = (() => {
        try {
          const size = Math.pow(edgeColorCount(ws), 4) * Math.pow(cornerColorCount(ws), 4);
          let uniq = 0;
          const seen = new Set();
          Object.values(ws.tiles || {}).forEach((r) => { const id = r.wangId >>> 0; if (!seen.has(id)) { seen.add(id); uniq++; } });
          return uniq >= size;
        } catch (_) { return false; }
      })();

      for (let pass = 0; pass < 3; pass++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const wangId = surroundingWangIdFull(layer, map, x, y, ws, ts);
            let matches = F.findMatchingWangTiles ? F.findMatchingWangTiles(ws, wangId) : [];
            if (!Picker || !matches.length) continue;

            // Look-ahead prune when incomplete (wildWangIdIsUsed)
            if (!complete) {
              const pruned = [];
              for (const m of matches) {
                const candidateId = m.wangId >>> 0;
                let ok = true;
                const adj = getSurroundingPoints(x, y, map);
                for (let i = 0; i < 8; i++) {
                  const p = adj[i];
                  if (p.x < x0 || p.y < y0 || p.x > x1 || p.y > y1) continue;
                  if (!map.infinite && (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height)) continue;
                  const cell = api.tileAt(layer, p.x, p.y, map) >>> 0;
                  if (cell) continue; // already filled
                  let adjWang = surroundingWangIdFull(layer, map, p.x, p.y, ws, ts);
                  // apply candidate as neighbor at opposite slot
                  adjWang = updateToAdjacent(adjWang, candidateId, (i + 4) % 8);
                  // Actually: adjacentWangId.updateToAdjacent(wangTile.wangId(), (i+4)%8)
                  // meaning set adjacent's color at (i+4)%8 from candidate's color at i
                  adjWang = setNib(
                    surroundingWangIdFull(layer, map, p.x, p.y, ws, ts),
                    (i + 4) % 8,
                    getNib(candidateId, i)
                  );
                  if (!wildWangIdIsUsed(ws, adjWang)) { ok = false; break; }
                }
                if (ok) pruned.push(m);
              }
              if (pruned.length) matches = pruned;
              // else keep original matches (last resort, like fill=wangTiles.isEmpty())
            }

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
      const tag = map.orientation || 'orthogonal';
      api.status('WangFiller 完成（' + tag + '，look-ahead' + (complete ? '跳过-完备集' : '开') + '）');
      if (F.markAutomapDirty) F.markAutomapDirty(x0, y0, x1, y1);
    }

    F.getSurroundingPoints = getSurroundingPoints;
    F.surroundingWangIdFull = surroundingWangIdFull;
    F.wildWangIdIsUsed = wildWangIdIsUsed;
    F.wangIdVariations = wangIdVariations;
    F.wangFillerFill = wangFillerFillLookAhead;

    function templateWangIdAt(ws, n) {
      let wangId = 0;
      const ec = edgeColorCount(ws), cc = cornerColorCount(ws);
      const cep = ec * cc;
      n = n >>> 0;
      for (let i = 7; i >= 0; --i) {
        const below = Math.pow(cep, Math.floor(i / 2)) * ((i & 1) ? ec : 1);
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
      return Math.pow(edgeColorCount(ws), 4) * Math.pow(cornerColorCount(ws), 4);
    }

    function renderWangTemplates() {
      const panel = $('#wangTemplatePanel');
      if (!panel) return;
      panel.innerHTML = '';
      const ts = state.tileset;
      const ws = state.wangSet || (ts && ts.wangSets && ts.wangSets[0]);
      if (!ws) return;
      const total = completeSetSize(ws);
      const cap = state.wangTemplateCap || 1024;
      const size = Math.min(total, cap);
      const title = document.createElement('div');
      title.style.cssText = 'width:100%;font-size:11px;color:#9aa3b2;margin-bottom:2px';
      title.textContent = 'Wang 模板 ' + size + '/' + total + (total > cap ? '（已截断，点下方显示更多）' : '');
      panel.appendChild(title);
      for (let n = 0; n < size; n++) {
        const wid = templateWangIdAt(ws, n);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = '0x' + wid.toString(16);
        btn.textContent = String(n);
        const c0 = wid & 0xf;
        btn.style.background = 'hsl(' + ((c0 * 40) % 360) + ' 50% 35%)';
        if (state.wangTemplateId === wid) btn.classList.add('active');
        btn.onclick = () => {
          state.wangTemplateId = wid;
          if (F.findMatchingWangTiles && ts) {
            const matches = F.findMatchingWangTiles(ws, wid);
            if (matches.length) {
              state.tile = matches[0].tileId;
              state.tileSelection = {
                x: matches[0].tileId % (ts.columns || 1),
                y: Math.floor(matches[0].tileId / (ts.columns || 1)),
                w: 1, h: 1
              };
              state.stampData = null;
            }
          }
          renderWangTemplates();
          api.status('Wang 模板 #' + n);
          api.renderAll();
        };
        panel.appendChild(btn);
      }
      if (total > cap) {
        const more = document.createElement('button');
        more.type = 'button';
        more.textContent = '显示更多（+' + Math.min(1024, total - cap) + '）';
        more.style.width = '100%';
        more.onclick = () => {
          state.wangTemplateCap = cap + 1024;
          renderWangTemplates();
        };
        panel.appendChild(more);
        const all = document.createElement('button');
        all.type = 'button';
        all.textContent = '显示全部（' + total + '）';
        all.style.width = '100%';
        all.onclick = () => {
          if (total > 4096 && !confirm('将渲染 ' + total + ' 个模板按钮，可能较卡，继续？')) return;
          state.wangTemplateCap = total;
          renderWangTemplates();
        };
        panel.appendChild(all);
      }
    }
    F.templateWangIdAt = templateWangIdAt;
    F.renderWangTemplates = renderWangTemplates;

    /* ===== 3. World multi-map view + drag + pattern expand ===== */
    async function ensureWorldMapCached(fileName) {
      const base = String(fileName || '').split('/').pop();
      if (state.worldMapCache.has(base)) return state.worldMapCache.get(base);
      const file = (state.worldFiles && (state.worldFiles.get(base) || state.worldFiles.get(fileName)))
        || (state.assetFileIndex && state.assetFileIndex.get(base));
      if (!file) return null;
      try {
        const text = await file.text();
        let map;
        if (/\.tmx$/i.test(file.name)) map = api.parseTmxAdvanced(text);
        else map = JSON.parse(text);
        state.worldMapCache.set(base, map);
        return map;
      } catch (_) { return null; }
    }

    function currentWorldEntry() {
      if (!state.world || !state.mapFileName) return null;
      const base = String(state.mapFileName).split('/').pop();
      return (state.world.maps || []).find((m) => String(m.fileName).split('/').pop() === base) || null;
    }

    // 与上游一致（src/libtiled/world.cpp World::allMaps / 1.2.4 worldmanager.cpp）：
    // multiplierX/Y 默认 1（0 无效）、offset 默认 0、mapWidth/Height 默认 |multiplier|；正则须恰好 2 个捕获组；
    // QRegularExpression::match 是非锚定搜索；只匹配 .world 所在文件夹里的文件（不含子目录）；捕获组按 QString::toInt（失败为 0）。
    function compileWorldPattern(p) {
      let re; try { re = new RegExp(String(p.regexp || '')); } catch (_) { return null; }
      const caps = new RegExp(re.source + '|').exec('').length - 1;
      const int = (v, d) => (v == null || !Number.isInteger(Number(v)) ? d : Number(v));
      const c = { re, mx: int(p.multiplierX, 1), my: int(p.multiplierY, 1), ox: int(p.offsetX, 0), oy: int(p.offsetY, 0) };
      c.mw = int(p.mapWidth, Math.abs(c.mx)); c.mh = int(p.mapHeight, Math.abs(c.my));
      if (caps !== 2 || !c.mx || !c.my || c.mw <= 0 || c.mh <= 0) return null;
      return c;
    }
    const qtToInt = (s) => (/^\s*[+-]?\d+\s*$/.test(String(s)) ? parseInt(s, 10) : 0);
    function worldFolderNames() {
      // 文件夹模式：assetFileIndex 的键是相对路径 → 只取与 .world 同目录的文件；否则（多选文件）取全部文件名
      const names = new Set();
      const wp = state.workspaceMapPath && /\.world$/i.test(state.workspaceMapPath) ? state.workspaceMapPath : (state.worldPath || null);
      const wdir = wp && wp.includes('/') ? wp.slice(0, wp.lastIndexOf('/') + 1) : '';
      const keys = [];
      if (state.assetFileIndex) state.assetFileIndex.forEach((_, k) => keys.push(String(k)));
      if (state.worldFiles) state.worldFiles.forEach((_, k) => keys.push(String(k)));
      const anyPaths = keys.some((k) => k.includes('/'));
      for (const k of keys) {
        if (anyPaths && wp) { if (k.startsWith(wdir) && !k.slice(wdir.length).includes('/')) names.add(k.slice(wdir.length)); }
        else if (!k.includes('/')) names.add(k);
      }
      return [...names].sort();
    }
    function expandWorldPatterns() {
      if (!state.world) return 0;
      const patterns = state.world.patterns || [];
      if (!patterns.length) return 0;
      if (!state.world.maps) state.world.maps = [];
      const existing = new Set(state.world.maps.map((m) => String(m.fileName).split('/').pop()));
      let added = 0;
      const names = worldFolderNames();
      for (const pat of patterns) {
        const c = compileWorldPattern(pat);
        if (!c) { api.log('World pattern 无效（上游会拒绝）：' + (pat.regexp || '')); continue; }
        for (const name of names) {
          const m = c.re.exec(name);
          if (!m || existing.has(name)) continue;
          state.world.maps.push({ fileName: name, x: qtToInt(m[1]) * c.mx + c.ox, y: qtToInt(m[2]) * c.my + c.oy, width: c.mw, height: c.mh, fromPattern: true });
          existing.add(name);
          added++;
        }
      }
      return added;
    }

    window.__tiledAfterDraw = function (ctx, m) {
      // Chunk bounds
      if (state.showChunkBounds && m.infinite) {
        ctx.save();
        ctx.strokeStyle = 'rgba(100,180,255,0.35)';
        ctx.lineWidth = 1;
        const visit = (layers) => {
          for (const l of layers || []) {
            if (l.type === 'tilelayer' && Array.isArray(l.chunks)) {
              for (const c of l.chunks) {
                const p0 = api.mapToScreen(c.x, c.y);
                const p1 = api.mapToScreen(c.x + c.width, c.y + c.height);
                ctx.strokeRect(p0.x + 0.5, p0.y + 0.5, p1.x - p0.x, p1.y - p0.y);
              }
            }
            if (l.type === 'group') visit(l.layers);
          }
        };
        visit(m.layers);
        ctx.restore();
      }

      // World ghosts
      if (!state.worldView || !state.world || !state.world.maps) return;
      const cur = currentWorldEntry();
      const originX = cur ? (cur.x || 0) : 0;
      const originY = cur ? (cur.y || 0) : 0;
      const s = state.zoom;
      for (const entry of state.world.maps) {
        const base = String(entry.fileName || '').split('/').pop();
        if (state.mapFileName && base === String(state.mapFileName).split('/').pop()) continue;
        const onlyAdj = !!state.world.onlyShowAdjacentMaps;
        if (onlyAdj && cur) {
          const w = entry.width || cur.width || (m.width * m.tilewidth);
          const h = entry.height || cur.height || (m.height * m.tileheight);
          const cw = cur.width || (m.width * m.tilewidth);
          const ch = cur.height || (m.height * m.tileheight);
          const ax0 = entry.x || 0, ay0 = entry.y || 0;
          const touches = !(ax0 + w < originX || ay0 + h < originY || ax0 > originX + cw || ay0 > originY + ch);
          // expand by 1 map for "adjacent"
          const pad = Math.max(cw, ch);
          const near = !(ax0 + w < originX - pad || ay0 + h < originY - pad || ax0 > originX + cw + pad || ay0 > originY + ch + pad);
          if (!near) continue;
        }
        const cached = state.worldMapCache.get(base);
        // outline even without cache
        const dx = ((entry.x || 0) - originX) * s;
        const dy = ((entry.y || 0) - originY) * s;
        const mw = (entry.width || (cached ? cached.width * cached.tilewidth : m.width * m.tilewidth)) * s;
        const mh = (entry.height || (cached ? cached.height * cached.tileheight : m.height * m.tileheight)) * s;
        ctx.save();
        ctx.strokeStyle = 'rgba(160,200,255,0.7)';
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(dx, dy, mw, mh);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(160,200,255,0.5)';
        ctx.font = '11px sans-serif';
        ctx.fillText(base, dx + 4, dy + 14);
        if (cached && cached.layers && m.orientation === 'orthogonal') {
          ctx.globalAlpha = state.worldGhostAlpha != null ? state.worldGhostAlpha : 0.85;
          // 邻图：画全部图块层（同一套图块集按 gid 解析）
          const tw = cached.tilewidth || 32, th = cached.tileheight || 32;
          for (const l of cached.layers) {
            if (l.type !== 'tilelayer' || !l.data) continue;
            for (let y = 0; y < cached.height; y++) {
              for (let x = 0; x < cached.width; x++) {
                const gid = l.data[y * cached.width + x] || 0;
                if (!gid) continue;
                const px = dx + x * tw * s;
                const py = dy + y * th * s;
                // try draw tile if same tileset registry can resolve
                const ts = api.tilesetForGid(api.clearGid(gid));
                if (ts && ts.url) {
                  const img = api.getImageCache().get(ts.url);
                  if (img) {
                    const local = api.clearGid(gid) - ts.firstgid;
                    const cols = ts.columns || 1;
                    const tW = ts.tileWidth || 32, tH = ts.tileHeight || 32;
                    const sx = (local % cols) * tW, sy = Math.floor(local / cols) * tH;
                    ctx.drawImage(img, sx, sy, tW, tH, px, py, tW * s, tH * s);
                    continue;
                  }
                }
                ctx.fillStyle = '#6af';
                ctx.fillRect(px, py, Math.max(2, tw * s - 1), Math.max(2, th * s - 1));
              }
            }
          }
        }
        ctx.restore();
      }
    };

    // Prefetch world maps when world loads / panel renders
    const expandedWorlds = new WeakSet();
    const _renderWorld = F.renderWorldPanel;
    F.renderWorldPanel = function () {
      if (_renderWorld) _renderWorld();
      const panel = $('#worldPanel');
      if (!panel || !state.world) return;
      // extras
      if (!panel.querySelector('[data-action="world-expand-patterns"]')) {
        const row = document.createElement('div');
        row.style.padding = '4px 8px';
        row.innerHTML = '<button type="button" data-action="world-expand-patterns">展开 patterns</button> '
          + '<button type="button" data-action="world-export">导出 .world</button> '
          + '<label style="font-size:11px"><input type="checkbox" id="worldViewChk"'
          + (state.worldView ? ' checked' : '') + '> 并排预览</label>';
        panel.insertBefore(row, panel.firstChild);
        const chk = panel.querySelector('#worldViewChk');
        if (chk) chk.onchange = () => { state.worldView = chk.checked; api.draw(); };
      }
      // 打开 world 即按 patterns 自动收图（上游 World::allMaps 也是加载即生效）
      if (!expandedWorlds.has(state.world)) { expandedWorlds.add(state.world); const n = expandWorldPatterns(); if (n) { api.log('World patterns 收到 ' + n + ' 张图'); F.renderWorldPanel(); return; } }
      // prefetch，全部就绪后重绘邻图
      Promise.all((state.world.maps || []).map((e) => ensureWorldMapCached(e.fileName))).then(() => api.draw());
      // make entries draggable via inputs
      panel.querySelectorAll('.world-map-btn').forEach((btn) => {
        if (btn._b5) return;
        btn._b5 = true;
        const name = btn.textContent.split('  ')[0];
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const entry = (state.world.maps || []).find((m) => String(m.fileName).split('/').pop() === name || m.fileName === name);
          if (!entry) return;
          const nx = prompt('世界坐标 X（像素）', String(entry.x || 0));
          const ny = prompt('世界坐标 Y（像素）', String(entry.y || 0));
          if (nx == null || ny == null) return;
          entry.x = Number(nx) || 0;
          entry.y = Number(ny) || 0;
          F.renderWorldPanel();
          api.draw();
          api.status('已更新世界坐标 ' + name);
        });
        btn.title = (btn.title || '') + '；右键编辑世界坐标';
      });
    };

    // Drag current map world position with Alt+drag on canvas
    const canvas = els.canvas;
    if (canvas && !canvas._worldDrag) {
      canvas._worldDrag = true;
      let dragging = null;
      canvas.addEventListener('pointerdown', (e) => {
        if (!e.altKey || !state.world) return;
        const entry = currentWorldEntry();
        if (!entry) return;
        dragging = { entry, sx: e.clientX, sy: e.clientY, ox: entry.x || 0, oy: entry.y || 0 };
        e.preventDefault();
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const s = state.zoom || 1;
        dragging.entry.x = Math.round(dragging.ox + (e.clientX - dragging.sx) / s);
        dragging.entry.y = Math.round(dragging.oy + (e.clientY - dragging.sy) / s);
        api.draw();
        if (F.renderWorldPanel) F.renderWorldPanel();
      });
      window.addEventListener('pointerup', () => { dragging = null; });
    }

    /* ===== 4. Chunk UX ===== */
    function pruneEmptyChunks() {
      if (!state.map) return 0;
      let removed = 0;
      const visit = (layers) => {
        for (const l of layers || []) {
          if (l.type === 'tilelayer' && Array.isArray(l.chunks)) {
            const next = l.chunks.filter((c) => (c.data || []).some((g) => g));
            removed += l.chunks.length - next.length;
            l.chunks = next;
          }
          if (l.type === 'group') visit(l.layers);
        }
      };
      api.snapshot();
      visit(state.map.layers);
      api.renderAll();
      return removed;
    }

    function toggleInfinite() {
      if (!state.map) return;
      api.snapshot();
      state.map.infinite = !state.map.infinite;
      if (state.map.infinite) {
        // force promote via dummy set
        const l = api.activeLayer();
        if (l && l.type === 'tilelayer') api.setTileAt(l, 0, 0, state.map, api.tileAt(l, 0, 0, state.map));
      }
      api.renderAll();
      api.status('无限地图：' + (state.map.infinite ? '开' : '关'));
      renderChunkPanel();
    }

    function renderChunkPanel() {
      const list = $('#chunkList');
      if (!list) return;
      list.innerHTML = '';
      if (!state.map) { list.textContent = '无地图'; return; }
      const head = document.createElement('div');
      head.className = 'chunk-row';
      head.textContent = 'infinite=' + !!state.map.infinite;
      list.appendChild(head);
      const visit = (layers, path) => {
        for (const l of layers || []) {
          if (l.type === 'tilelayer') {
            const chunks = l.chunks || [];
            const row = document.createElement('div');
            row.className = 'chunk-row';
            row.innerHTML = '<span>' + (path + l.name) + ' · ' + chunks.length + ' chunks</span>';
            const del = document.createElement('button');
            del.type = 'button';
            del.textContent = '清空';
            del.onclick = () => {
              api.snapshot();
              if (l.chunks) l.chunks = (l.chunks || []).filter((c) => (c.data || []).some((g) => g));
              renderChunkPanel();
              api.renderAll();
            };
            row.appendChild(del);
            list.appendChild(row);
            chunks.forEach((c, i) => {
              const cr = document.createElement('div');
              cr.className = 'chunk-row';
              cr.style.paddingLeft = '16px';
              const nonempty = (c.data || []).filter((g) => g).length;
              cr.textContent = '#' + i + ' @' + c.x + ',' + c.y + ' ' + c.width + '×' + c.height + ' 非空' + nonempty;
              const rm = document.createElement('button');
              rm.type = 'button';
              rm.textContent = '删';
              rm.onclick = () => {
                api.snapshot();
                l.chunks.splice(i, 1);
                renderChunkPanel();
                api.renderAll();
              };
              cr.appendChild(rm);
              list.appendChild(cr);
            });
          }
          if (l.type === 'group') visit(l.layers, path + l.name + '/');
        }
      };
      visit(state.map.layers, '');
    }

    /* ===== 5. propertytypes ===== */
    function renderPropertyTypesList() {
      const list = $('#propertyTypesList');
      if (!list) return;
      list.innerHTML = '';
      (state.propertyTypes || []).forEach((t, idx) => {
        const row = document.createElement('div');
        row.className = 'prop-row';
        const nameIn = document.createElement('input');
        nameIn.value = t.name || '';
        nameIn.onchange = () => { t.name = nameIn.value; };
        const kind = document.createElement('select');
        ['enum', 'class', 'string', 'int', 'float', 'bool', 'color', 'file'].forEach((k) => {
          const o = document.createElement('option');
          o.value = k; o.textContent = k;
          if (k === (t.type || 'enum')) o.selected = true;
          kind.appendChild(o);
        });
        kind.onchange = () => { t.type = kind.value; renderPropertyTypesList(); };
        const del = document.createElement('button');
        del.type = 'button'; del.textContent = '×';
        del.onclick = () => { state.propertyTypes.splice(idx, 1); renderPropertyTypesList(); };
        row.appendChild(nameIn); row.appendChild(kind); row.appendChild(del);
        list.appendChild(row);
        if (t.type === 'enum') {
          const vals = document.createElement('input');
          vals.style.marginLeft = '12px';
          vals.style.width = '90%';
          vals.placeholder = '枚举值，逗号分隔';
          vals.value = (t.values || []).join(',');
          vals.onchange = () => { t.values = vals.value.split(',').map((s) => s.trim()).filter(Boolean); };
          list.appendChild(vals);
        } else if (t.type === 'class') {
          const members = t.members || (t.members = []);
          members.forEach((mem, mi) => {
            const mr = document.createElement('div');
            mr.className = 'prop-row';
            mr.style.marginLeft = '12px';
            const mn = document.createElement('input'); mn.value = mem.name || '';
            mn.onchange = () => { mem.name = mn.value; };
            const mt = document.createElement('input'); mt.value = mem.type || 'string';
            mt.onchange = () => { mem.type = mt.value; };
            const mv = document.createElement('input'); mv.value = mem.value == null ? '' : String(mem.value);
            mv.onchange = () => { mem.value = mv.value; };
            mr.appendChild(mn); mr.appendChild(mt); mr.appendChild(mv);
            list.appendChild(mr);
          });
          const addM = document.createElement('button');
          addM.type = 'button'; addM.textContent = '＋成员';
          addM.style.marginLeft = '12px';
          addM.onclick = () => { members.push({ name: 'field', type: 'string', value: '' }); renderPropertyTypesList(); };
          list.appendChild(addM);
        }
      });
    }

    function exportPropertyTypes() {
      const data = {
        propertyTypes: (state.propertyTypes || []).map((t) => {
          const o = { name: t.name, type: t.type };
          if (t.type === 'enum') { o.storageType = t.storageType || 'string'; o.values = t.values || []; }
          if (t.type === 'class') o.members = t.members || [];
          return o;
        })
      };
      api.download('propertytypes.json', 'application/json', JSON.stringify(data, null, 2));
    }

    // Integrate enums into typed props: expose helper
    F.propertyTypeNames = () => (state.propertyTypes || []).map((t) => t.name);
    F.enumValues = (name) => {
      const t = (state.propertyTypes || []).find((x) => x.name === name);
      return t && t.type === 'enum' ? (t.values || []) : null;
    };

    /* ===== UI bindings ===== */
    document.querySelectorAll('[data-action]').forEach((b) => {
      const a = b.dataset.action;
      if (a === 'rule-add-ellipse-obj') b.onclick = () => addRuleObject('ellipse');
      else if (a === 'rule-add-point-obj') b.onclick = () => addRuleObject('point');
      else if (a === 'rule-add-poly-obj') b.onclick = () => addRuleObject('polygon');
      else if (a === 'rule-add-tile-obj') b.onclick = () => addRuleObject('tile');
      else if (a === 'rule-add-rect-obj') b.onclick = () => addRuleObject('rect');
      else if (a === 'property-types') b.onclick = () => {
        const m = $('#propertyTypesEditor');
        if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
        renderPropertyTypesList();
      };
      else if (a === 'close-property-types') b.onclick = () => {
        const m = $('#propertyTypesEditor');
        if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); }
      };
      else if (a === 'pt-add-enum') b.onclick = () => {
        state.propertyTypes.push({ name: 'NewEnum', type: 'enum', values: ['A', 'B'], storageType: 'string' });
        renderPropertyTypesList();
      };
      else if (a === 'pt-add-class') b.onclick = () => {
        state.propertyTypes.push({ name: 'NewClass', type: 'class', members: [{ name: 'id', type: 'int', value: 0 }] });
        renderPropertyTypesList();
      };
      else if (a === 'pt-export') b.onclick = () => exportPropertyTypes();
      else if (a === 'chunk-panel') b.onclick = () => {
        const m = $('#chunkPanel');
        if (m) { m.classList.remove('hidden'); m.setAttribute('aria-hidden', 'false'); }
        renderChunkPanel();
      };
      else if (a === 'close-chunk-panel') b.onclick = () => {
        const m = $('#chunkPanel');
        if (m) { m.classList.add('hidden'); m.setAttribute('aria-hidden', 'true'); }
      };
      else if (a === 'toggle-infinite') b.onclick = () => toggleInfinite();
      else if (a === 'prune-chunks') b.onclick = () => {
        const n = pruneEmptyChunks();
        api.status('已清理 ' + n + ' 个空 chunk');
        renderChunkPanel();
      };
      else if (a === 'world-view-toggle') b.onclick = () => {
        state.worldView = !state.worldView;
        api.status('World 并排预览：' + (state.worldView ? '开' : '关'));
        api.draw();
      };
      else if (a === 'world-expand-patterns') b.onclick = () => {
        const n = expandWorldPatterns();
        api.status('patterns 展开 +' + n);
        if (F.renderWorldPanel) F.renderWorldPanel();
        api.draw();
      };
      else if (a === 'world-export') b.onclick = () => {
        if (!state.world) return;
        // 和上游一样：pattern 收到的图不写进 maps（只存 patterns 本身）
        const out = { ...state.world, maps: (state.world.maps || []).filter((m) => !m.fromPattern) };
        api.download('world.world', 'application/json', JSON.stringify(out, null, 2));
      };
    });

    const ptInput = $('#propertyTypesInput');
    if (ptInput) {
      ptInput.onchange = async () => {
        const f = ptInput.files && ptInput.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const arr = Array.isArray(data) ? data : (data.propertyTypes || data.types || []);
          state.propertyTypes = arr.map((t) => ({
            name: t.name, type: t.type || 'enum',
            values: t.values || [], members: t.members || t.properties || [],
            storageType: t.storageType || 'string'
          }));
          renderPropertyTypesList();
          api.status('已载入 ' + state.propertyTypes.length + ' 个属性类型');
        } catch (err) {
          api.status('propertytypes 解析失败');
          api.log(String(err.message || err));
        }
      };
    }

    // Refresh templates on renderAll
    const _ra = api.renderAll;
    api.renderAll = function () {
      _ra();
      renderWangTemplates();
    };

    // When rule editor tools change layers, redraw enhanced
    document.querySelectorAll('[data-action="rule-add-input"],[data-action="rule-add-output"],[data-action="rule-add-objout"],[data-action="rule-resize"]').forEach((b) => {
      const prev = b.onclick;
      b.onclick = function (e) {
        if (prev) prev.call(this, e);
        setTimeout(drawRuleCanvasEnhanced, 0);
      };
    });

    // Live tileset preview while painting in rule editor
    const ruleCanvas = $('#ruleCanvas');
    if (ruleCanvas && !ruleCanvas._b5live) {
      ruleCanvas._b5live = true;
      const live = () => { if (state.ruleEdit && state.ruleEdit.painting) drawRuleCanvasEnhanced(); };
      ruleCanvas.addEventListener('pointermove', live);
      ruleCanvas.addEventListener('pointerup', () => drawRuleCanvasEnhanced());
    }

    Object.assign(F, {
      drawRuleCanvasEnhanced, wildWangIdIsUsed, wangFillerFillLookAhead,
      expandWorldPatterns, compileWorldPattern, pruneEmptyChunks, toggleInfinite, ensureWorldMapCached,
      renderPropertyTypesList, renderChunkPanel, getSurroundingPoints
    });

    renderWangTemplates();
    api.log('Batch5：规则图块预览/富对象 · Wang look-ahead/iso · World并排 · Chunks · propertytypes · 类型色 · 撤销合并');
  }

  window.initTiledBatch5 = boot;
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 80);
})();

/* ===== World 背景层：在当前地图四周按 world 坐标画出其它地图（像桌面版 Tiled 的世界视图） =====
 * 主画布坐标/交互不变：只给主画布加 margin，把整张世界画在它下面的绝对定位画布上。 */
(function () {
  function boot(api) {
    const state = api.getState();
    const F = api.features || (api.features = {});
    const cvs = document.getElementById('canvas'); const wrap = document.getElementById('canvasWrap');
    if (!cvs || !wrap) return;
    let back = null;
    const base = (p) => String(p || '').split('/').pop();
    function sizeOf(e, mm) {
      if (e.width && e.height) return { w: e.width, h: e.height };
      if (mm && !mm.infinite) return { w: mm.width * mm.tilewidth, h: mm.height * mm.tileheight };
      return null;
    }
    function extent(e, mm) { // 世界坐标包围盒（无限图按 chunk 范围）
      if (mm && mm.infinite) {
        const cs = []; (mm.layers || []).forEach((l) => (l.chunks || []).forEach((c) => cs.push(c)));
        if (cs.length) {
          const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y));
          const x1 = Math.max(...cs.map((c) => c.x + c.width)), y1 = Math.max(...cs.map((c) => c.y + c.height));
          return { x: e.x + x0 * mm.tilewidth, y: e.y + y0 * mm.tileheight, w: (x1 - x0) * mm.tilewidth, h: (y1 - y0) * mm.tileheight };
        }
      }
      const s = sizeOf(e, mm) || { w: 0, h: 0 }; return { x: e.x || 0, y: e.y || 0, w: s.w, h: s.h };
    }
    function drawGid(ctx, gid, px, py, s) {
      const g = api.clearGid(gid); const ts = api.tilesetForGid(g);
      if (!ts || !ts.url) return;
      const img = api.getImageCache().get(ts.url); if (!img) return;
      const local = g - ts.firstgid, cols = ts.columns || 1, tW = ts.tileWidth || 16, tH = ts.tileHeight || 16;
      ctx.drawImage(img, (local % cols) * tW, Math.floor(local / cols) * tH, tW, tH, px, py, tW * s, tH * s);
    }
    function clear() {
      if (back) { back.remove(); back = null; }
      cvs.style.marginLeft = ''; cvs.style.marginTop = ''; cvs.style.position = ''; cvs.style.zIndex = '';
    }
    function paint() {
      const m = state.map, w = state.world;
      if (!m || !w || !state.worldView || (m.orientation || 'orthogonal') !== 'orthogonal' || !(w.maps || []).length) return clear();
      const cur = (w.maps || []).find((e) => base(e.fileName) === base(state.mapFileName));
      if (!cur) return clear();
      const s = state.zoom;
      const items = w.maps.map((e) => ({ e, mm: base(e.fileName) === base(state.mapFileName) ? m : state.worldMapCache.get(base(e.fileName)) }));
      const ex = items.map((it) => extent(it.e, it.mm));
      const curEx = extent(cur, m);
      const minX = Math.min(...ex.map((r) => r.x)), minY = Math.min(...ex.map((r) => r.y));
      const maxX = Math.max(...ex.map((r) => r.x + r.w)), maxY = Math.max(...ex.map((r) => r.y + r.h));
      if (!back) { back = document.createElement('canvas'); back.id = 'worldBackdrop'; back.style.cssText = 'position:absolute;margin:0;left:0;top:0;z-index:0;pointer-events:none;image-rendering:pixelated'; wrap.insertBefore(back, cvs); }
      back.width = Math.ceil((maxX - minX) * s); back.height = Math.ceil((maxY - minY) * s);
      cvs.style.position = 'relative'; cvs.style.zIndex = '1';
      cvs.style.marginLeft = (32 + (curEx.x - minX) * s) + 'px'; cvs.style.marginTop = (32 + (curEx.y - minY) * s) + 'px';
      cvs.style.marginRight = '32px'; cvs.style.marginBottom = (32 + Math.max(0, (maxY - curEx.y - curEx.h) * s)) + 'px';
      // 以主画布实际位置为准对齐（offsetParent 相同：canvasWrap）
      back.style.left = (cvs.offsetLeft - (curEx.x - minX) * s) + 'px'; back.style.top = (cvs.offsetTop - (curEx.y - minY) * s) + 'px';
      const ctx = back.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, back.width, back.height);
      items.forEach((it, i) => {
        const { e, mm } = it; const r = ex[i];
        const ox = ((e.x || 0) - minX) * s, oy = ((e.y || 0) - minY) * s;
        if (mm !== m && mm && mm.layers) {
          ctx.globalAlpha = state.worldGhostAlpha != null ? state.worldGhostAlpha : 0.9;
          const tw = mm.tilewidth, th = mm.tileheight;
          const visit = (layers) => (layers || []).forEach((l) => {
            if (l.visible === false) return;
            if (l.type === 'group') return visit(l.layers);
            if (l.type !== 'tilelayer') return;
            const blocks = l.chunks ? l.chunks : [{ x: 0, y: 0, width: mm.width, height: mm.height, data: l.data }];
            for (const c of blocks) {
              if (!Array.isArray(c.data)) continue;
              for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
                const gid = c.data[y * c.width + x]; if (gid) drawGid(ctx, gid, ox + (c.x + x) * tw * s, oy + (c.y + y) * th * s, s);
              }
            }
          });
          visit(mm.layers); ctx.globalAlpha = 1;
        }
        ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = mm === m ? 'rgba(96,165,250,.95)' : 'rgba(200,220,255,.55)';
        ctx.strokeRect((r.x - minX) * s + .5, (r.y - minY) * s + .5, r.w * s - 1, r.h * s - 1); ctx.restore();
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.font = '11px sans-serif';
        const label = base(e.fileName) + '  (' + (e.x || 0) + ',' + (e.y || 0) + ')';
        ctx.fillRect(ox + 2, oy + 2, ctx.measureText(label).width + 8, 15); ctx.fillStyle = '#e6eefc'; ctx.fillText(label, ox + 6, oy + 13);
      });
    }
    const prev = window.__tiledAfterDraw;
    window.__tiledAfterDraw = function (ctx, m) {
      const wv = state.worldView; state.worldView = false; // 旧的画布内“幽灵”只剩 chunk 边框等
      try { if (prev) prev(ctx, m); } finally { state.worldView = wv; }
      try { paint(); } catch (e) { api.log('World 背景层绘制失败：' + e.message); }
    };
    F.paintWorldBackdrop = paint;
  }
  const start = () => (window.TiledApp ? setTimeout(() => boot(window.TiledApp), 200) : setTimeout(start, 50));
  start();
})();

(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const els = {
    canvas: $('#canvas'), wrap: $('#canvasWrap'), layers: $('#layers'), tileset: $('#tileset'),
    meta: $('#tilesetMeta'), status: $('#status'), console: $('#console'), empty: $('#emptyHint'),
    cursor: $('#cursorPos'), info: $('#mapInfo'), selection: $('#selectionInfo'),
    mapInput: $('#mapInput'), tilesetInput: $('#tilesetInput'), zoom: $('#zoom'),
    zoomValue: $('#zoomValue'), inspector: $('#objectInspector')
  };
  const imageCache = new Map();
  const tilesetRegistry = [];

  const FLIP_H = 0x80000000;
  const FLIP_V = 0x40000000;
  const FLIP_D = 0x20000000;
  const GID_MASK = 0x1fffffff;

  const state = {
    map: null, tileset: null, tile: 0,
    tileSelection: { x: 0, y: 0, w: 1, h: 1 },
    stampData: null, quickStamps: {},
    stampTransform: { flipX: false, flipY: false, rotate: 0 },
    showCollision: false, tool: 'select', grid: true, zoom: 1,
    layer: 0, layerPath: null, history: [], future: [], drag: null, selectedObject: null
  };

  const blankMap = () => ({
    version: '1.2', tiledversion: '1.2.4', orientation: 'orthogonal', renderorder: 'right-down',
    width: 24, height: 16, tilewidth: 32, tileheight: 32, infinite: false,
    staggeraxis: 'y', staggerindex: 'odd', hexsidelength: 0,
    layers: [{ id: 1, name: '图层 1', type: 'tilelayer', x: 0, y: 0, width: 24, height: 16, opacity: 1, visible: true, data: Array(24 * 16).fill(0) }],
    tilesets: []
  });

  function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    els.console.textContent = `${line}\n${els.console.textContent}`.slice(0, 7000);
  }
  function status(msg) { els.status.textContent = msg; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function clearGid(gid) { return (Number(gid) >>> 0) & GID_MASK; }
  function gidInfo(gid) {
    const g = Number(gid) >>> 0;
    return { id: g & GID_MASK, flipH: !!(g & FLIP_H), flipV: !!(g & FLIP_V), flipD: !!(g & FLIP_D), raw: g };
  }
  function composeGid(id, flipH, flipV, flipD) {
    let g = clearGid(id);
    if (flipH) g |= FLIP_H;
    if (flipV) g |= FLIP_V;
    if (flipD) g |= FLIP_D;
    return g >>> 0;
  }

  function activeLayer() {
    if (!state.map) return null;
    if (!state.layerPath) return state.map.layers[state.layer];
    let list = state.map.layers, l = null;
    for (const idx of state.layerPath) { l = list[idx]; if (!l) return null; list = l.layers || []; }
    return l;
  }
  function layerListForPath(path) {
    let list = state.map.layers, parent = null;
    for (const idx of path || []) { parent = list[idx]; list = parent.layers || []; }
    return { list, parent };
  }
  function flattenLayerIds(layers) {
    const out = [];
    for (const x of layers || []) { out.push(x.id || 0); if (x.layers) out.push(...flattenLayerIds(x.layers)); }
    return out;
  }

  function bytesFromBase64(value) {
    const raw = atob(String(value).replace(/\s/g, ''));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function gidsFromBytes(bytes) {
    const out = [];
    for (let i = 0; i + 3 < bytes.length; i += 4) {
      out.push((bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0);
    }
    return out;
  }
  function inflateBytes(bytes, compression) {
    const pako = window.pako;
    if (!pako || !pako.inflate) throw new Error('缺少 pako.inflate，无法解压图层');
    if (compression === 'gzip') return pako.inflate(bytes);
    try { return pako.inflate(bytes); } catch (e) { return pako.inflateRaw(bytes); }
  }
  function decodeGids(value, encoding, compression) {
    if (Array.isArray(value)) return value.map((v) => Number(v) >>> 0);
    if (typeof value !== 'string') return [];
    const enc = (encoding || (value.includes(',') ? 'csv' : 'base64')).toLowerCase();
    if (enc === 'csv' || (!encoding && value.includes(','))) {
      return value.split(/[,\s]+/).filter(Boolean).map((v) => Number(v) >>> 0);
    }
    let bytes = bytesFromBase64(value);
    const comp = (compression || '').toLowerCase();
    if (comp === 'zlib' || comp === 'gzip' || comp === 'deflate') {
      bytes = inflateBytes(bytes, comp === 'gzip' ? 'gzip' : 'zlib');
    }
    return gidsFromBytes(bytes);
  }

  function tileAt(layer, x, y, map) {
    if (Array.isArray(layer.chunks)) {
      for (const c of layer.chunks) {
        if (x >= c.x && y >= c.y && x < c.x + c.width && y < c.y + c.height) {
          return c.data[(y - c.y) * c.width + (x - c.x)] || 0;
        }
      }
      return 0;
    }
    return (layer.data || [])[y * map.width + x] || 0;
  }
  function setTileAt(layer, x, y, map, gid) {
    if (map && map.infinite && !Array.isArray(layer.chunks)) {
      // Promote fixed layer to chunked when map becomes infinite
      const chunks = [];
      if (layer.data && map.width && map.height) {
        for (let cy = 0; cy < map.height; cy += 16) {
          for (let cx = 0; cx < map.width; cx += 16) {
            const w = Math.min(16, map.width - cx), h = Math.min(16, map.height - cy);
            const data = Array(w * h).fill(0);
            let any = false;
            for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
              const g = layer.data[(cy + yy) * map.width + (cx + xx)] || 0;
              data[yy * w + xx] = g; if (g) any = true;
            }
            if (any) chunks.push({ x: cx, y: cy, width: w, height: h, data });
          }
        }
      }
      layer.chunks = chunks;
      delete layer.data;
    }
    if (Array.isArray(layer.chunks)) {
      let chunk = layer.chunks.find((c) => x >= c.x && y >= c.y && x < c.x + c.width && y < c.y + c.height);
      if (!chunk) {
        if (!(gid >>> 0) && map && map.infinite) return; // don't create chunk to erase empty
        const cx = Math.floor(x / 16) * 16, cy = Math.floor(y / 16) * 16;
        chunk = { x: cx, y: cy, width: 16, height: 16, data: Array(16 * 16).fill(0) };
        layer.chunks.push(chunk);
      }
      chunk.data[(y - chunk.y) * chunk.width + (x - chunk.x)] = gid >>> 0;
      return;
    }
    if (!layer.data) layer.data = Array(map.width * map.height).fill(0);
    if (y < 0 || x < 0 || x >= map.width || y >= map.height) return;
    layer.data[y * map.width + x] = gid >>> 0;
  }

  function snapshot(opts) {
    if (!state.map) return;
    opts = opts || {};
    // During an active paint stroke, coalesce all edits (paint + live automap + wang/terrain) into one undo step
    if (state._paintStroke && !opts.force) return;
    state.history.push({ map: clone(state.map), tile: state.tile, layer: state.layer, layerPath: state.layerPath ? clone(state.layerPath) : null });
    if (state.history.length > 80) state.history.shift();
    state.future = [];
  }
  function beginPaintStroke() {
    if (state._paintStroke) return;
    snapshot({ force: true });
    state._paintStroke = true;
  }
  function endPaintStroke() {
    state._paintStroke = false;
  }
  function restore(s) {
    state.map = clone(s.map); state.tile = s.tile;
    state.layer = Math.min(s.layer, state.map.layers.length - 1);
    state.layerPath = s.layerPath ? clone(s.layerPath) : null;
    state.selectedObject = null; syncRegistryFromMap(); renderAll();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push({ map: clone(state.map), tile: state.tile, layer: state.layer, layerPath: state.layerPath ? clone(state.layerPath) : null });
    restore(state.history.pop()); status('已撤销');
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push({ map: clone(state.map), tile: state.tile, layer: state.layer, layerPath: state.layerPath ? clone(state.layerPath) : null });
    restore(state.future.pop()); status('已重做');
  }

  function normalizeLayer(l) {
    if (l.type === 'tilelayer') {
      if (typeof l.data === 'string') l.data = decodeGids(l.data, l.encoding, l.compression);
      if (Array.isArray(l.chunks)) {
        l.chunks = l.chunks.map((c) => ({
          ...c,
          data: typeof c.data === 'string'
            ? decodeGids(c.data, c.encoding || l.encoding, c.compression || l.compression)
            : Array.isArray(c.data) ? c.data.map((v) => Number(v) >>> 0) : []
        }));
      }
      delete l.encoding; delete l.compression;
    }
    if (l.type === 'group') l.layers = Array.isArray(l.layers) ? l.layers.map(normalizeLayer) : [];
    return l;
  }
  // Official Tiled JSON (>= 1.2, and tiled-web CLI >= 0.7.1) stores properties as
  // [{name,type,value}]; the editor model uses { name: value, __propertyTypes }.
  function uiProps(props) {
    if (!Array.isArray(props)) return props;
    const out = {}; const types = {};
    props.forEach((p) => { if (p && p.name != null) { out[p.name] = p.value; types[p.name] = p.type || 'string'; } });
    out.__propertyTypes = types;
    return out;
  }
  function uiPropsDeep(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.properties)) o.properties = uiProps(o.properties);
    (o.layers || []).forEach(uiPropsDeep);
    (o.objects || []).forEach(uiPropsDeep);
    (o.tilesets || []).forEach(uiPropsDeep);
    if (Array.isArray(o.tiles)) o.tiles.forEach(uiPropsDeep);
  }
  function normalizeMap(map) {
    const m = map || {};
    uiPropsDeep(m);
    m.width = Number(m.width || 1); m.height = Number(m.height || 1);
    m.tilewidth = Number(m.tilewidth || 32); m.tileheight = Number(m.tileheight || 32);
    m.staggeraxis = m.staggeraxis || 'y'; m.staggerindex = m.staggerindex || 'odd';
    m.hexsidelength = Number(m.hexsidelength || 0);
    m.layers = Array.isArray(m.layers) ? m.layers.map(normalizeLayer) : [];
    m.tilesets = Array.isArray(m.tilesets) ? m.tilesets : [];
    return m;
  }
  function setMap(map) {
    state.map = normalizeMap(map); state.history = []; state.future = [];
    state.layer = 0; state.layerPath = null; state.selectedObject = null;
    if (!state.map.layers.length) {
      state.map.layers = [{ id: 1, name: '图层 1', type: 'tilelayer', x: 0, y: 0, width: state.map.width, height: state.map.height, opacity: 1, visible: true, data: Array(state.map.width * state.map.height).fill(0) }];
    }
    syncRegistryFromMap(); renderAll();
  }
  function syncRegistryFromMap() {
    if (!state.map) return;
    if (tilesetRegistry.length && !state.tileset) state.tileset = tilesetRegistry[0];
  }
  function tilesetForGid(gid) {
    const id = clearGid(gid); if (!id) return null;
    const loaded = tilesetRegistry.filter((t) => t.firstgid <= id).sort((a, b) => b.firstgid - a.firstgid)[0];
    if (loaded && id < loaded.firstgid + loaded.count) return loaded;
    return state.tileset && state.tileset.firstgid <= id ? state.tileset : null;
  }
  function registerTileset(ts) {
    const idx = tilesetRegistry.findIndex((t) => t.firstgid === ts.firstgid);
    if (idx >= 0) tilesetRegistry[idx] = ts; else tilesetRegistry.push(ts);
    state.tileset = ts;
  }
  function nextFirstGid() {
    const sets = state.map?.tilesets || [];
    if (!sets.length && !tilesetRegistry.length) return 1;
    let max = 1;
    for (const t of [...sets, ...tilesetRegistry]) {
      const end = Number(t.firstgid || 1) + Number(t.tilecount || t.count || 0);
      if (end > max) max = end;
    }
    return max;
  }

  function renderAll() {
    if (!state.map) return;
    els.empty.classList.add('hidden');
    renderLayers(); renderLayerOpacity(); renderMapFields(); renderTileset(); resizeCanvas(); draw(); renderInspector();
  }
  function renderMapFields() {
    $('#mapWidth').value = state.map.width || 1;
    $('#mapHeight').value = state.map.height || 1;
    $('#tileWidth').value = state.map.tilewidth || 32;
    $('#tileHeight').value = state.map.tileheight || 32;
    $('#orientation').value = state.map.orientation || 'orthogonal';
    if ($('#hexsidelength')) $('#hexsidelength').value = state.map.hexsidelength || 0;
    $('#mapProperties').value = JSON.stringify(state.map.properties || {}, null, 2);
    els.info.textContent = `${state.map.width} × ${state.map.height} · ${state.map.orientation || 'orthogonal'}`;
  }
  function renderLayerOpacity() {
    const l = activeLayer();
    const value = Math.round(((l && l.opacity == null ? 1 : (l && l.opacity) || 0) * 100));
    const input = $('#layerOpacity'), output = $('#layerOpacityValue'), props = $('#layerProperties');
    if (input) input.value = value;
    if (output) output.textContent = `${value}%`;
    if (props) props.value = JSON.stringify((l && l.properties) || {}, null, 2);
  }
  function renderLayers() {
    els.layers.innerHTML = '';
    if (!state.map) return;
    const add = (l, path, depth) => {
      const row = document.createElement('div');
      const selected = JSON.stringify(state.layerPath || [state.layer]) === JSON.stringify(path);
      row.className = 'layer-row' + (selected ? ' active' : '');
      row.style.paddingLeft = `${7 + depth * 16}px`;
      row.innerHTML = `<span class="eye">${l.visible === false ? '○' : '●'}</span><span class="layer-icon">${
        l.type === 'tilelayer' ? '▦' : l.type === 'objectgroup' ? '◇' : l.type === 'group' ? '▤' : '▧'
      }</span><span class="layer-name"></span>`;
      row.querySelector('.layer-name').textContent = l.name || `图层 ${path[path.length - 1] + 1}`;
      row.onclick = () => { state.layer = path[0]; state.layerPath = path; state.selectedObject = null; renderAll(); };
      row.ondblclick = () => {
        const next = window.prompt('图层名称', l.name || '图层');
        if (next && next.trim()) { snapshot(); l.name = next.trim(); renderAll(); }
      };
      row.querySelector('.eye').onclick = (e) => { e.stopPropagation(); snapshot(); l.visible = l.visible === false; renderAll(); };
      els.layers.appendChild(row);
      if (l.type === 'group') for (let i = 0; i < (l.layers || []).length; i++) add(l.layers[i], path.concat(i), depth + 1);
    };
    for (let i = 0; i < state.map.layers.length; i++) add(state.map.layers[i], [i], 0);
  }
  function renderTileProperties() {
    const box = $('#tileProperties'), collision = $('#tileCollision');
    if (!box) return;
    if (!state.tileset) { box.value = ''; if (collision) collision.value = ''; return; }
    const item = state.tileset.tiles && state.tileset.tiles[state.tile];
    box.value = JSON.stringify((item && item.properties) || {}, null, 2);
    if (collision) collision.value = JSON.stringify((item && item.objectgroup) || { objects: [] }, null, 2);
  }
  function renderTileset() {
    els.tileset.innerHTML = '';
    renderTileProperties();
    if (!state.tileset) { els.meta.textContent = '尚未载入图块集'; return; }
    const t = state.tileset, sel = state.tileSelection;
    const flipHint = [state.stampTransform.flipX ? 'H' : '', state.stampTransform.flipY ? 'V' : '', state.stampTransform.rotate ? `R${state.stampTransform.rotate}` : ''].filter(Boolean).join('') || '无';
    els.meta.textContent = `${t.name || '图块集'} · ${t.tileWidth}×${t.tileHeight} · ${t.columns} 列 · ${t.count} 块 · 选区 ${sel.w}×${sel.h} · 变换 ${flipHint}`;
    if (tilesetRegistry.length > 1) {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:0 7px 8px';
      tilesetRegistry.forEach((ts) => {
        const b = document.createElement('button');
        b.textContent = ts.name || `gid${ts.firstgid}`;
        b.style.fontSize = '11px';
        if (ts === state.tileset) { b.style.background = 'var(--accent2)'; b.style.borderColor = 'var(--accent)'; }
        b.onclick = () => { state.tileset = ts; state.tile = 0; state.tileSelection = { x: 0, y: 0, w: 1, h: 1 }; state.stampData = null; renderTileset(); };
        bar.appendChild(b);
      });
      els.tileset.appendChild(bar);
    }
    for (let i = 0; i < t.count; i++) {
      const col = i % t.columns, row = Math.floor(i / t.columns);
      const active = col >= sel.x && col < sel.x + sel.w && row >= sel.y && row < sel.y + sel.h;
      const cell = document.createElement('button');
      cell.className = 'tile-cell' + (active ? ' active' : '');
      cell.title = `图块 ${i} / GID ${t.firstgid + i}`;
      // 每格用 canvas 画出单个图块（考虑 margin/spacing）；图片未加载完时等 onload 再画
      const thumb = document.createElement('canvas');
      thumb.width = t.tileWidth; thumb.height = t.tileHeight; thumb.className = 'tile-thumb';
      const sx = (t.margin || 0) + col * (t.tileWidth + (t.spacing || 0));
      const sy = (t.margin || 0) + row * (t.tileHeight + (t.spacing || 0));
      const paint = (im) => { const c = thumb.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, thumb.width, thumb.height); c.drawImage(im, sx, sy, t.tileWidth, t.tileHeight, 0, 0, t.tileWidth, t.tileHeight); };
      const im = imageCache.get(t.url);
      if (im && im.complete && im.naturalWidth) paint(im);
      else if (im) im.addEventListener('load', () => paint(im), { once: true });
      else { const ni = new Image(); ni.onload = () => paint(ni); ni.src = t.url; }
      cell.appendChild(thumb);
      const n = document.createElement('span'); n.textContent = i; cell.appendChild(n);
      cell.onclick = (e) => {
        const old = state.tileSelection;
        if (e.shiftKey) {
          state.tileSelection = { x: Math.min(old.x, col), y: Math.min(old.y, row), w: Math.abs(col - old.x) + 1, h: Math.abs(row - old.y) + 1 };
        } else {
          state.tileSelection = { x: col, y: row, w: 1, h: 1 }; state.stampData = null;
        }
        state.tile = state.tileSelection.y * t.columns + state.tileSelection.x;
        renderTileset();
      };
      els.tileset.appendChild(cell);
    }
  }

  function staggerOffset(y) {
    const m = state.map;
    const odd = (m.staggerindex || 'odd') === 'odd';
    const evenRow = y % 2 === 0;
    return (odd ? !evenRow : evenRow) ? 1 : 0;
  }
  function layerChunkBounds(map) {
    let minX = 0, minY = 0, maxX = map.width || 0, maxY = map.height || 0;
    if (!map.infinite) return { minX, minY, maxX, maxY };
    let any = false;
    const visit = (layers) => {
      for (const l of layers || []) {
        if (l.type === 'tilelayer' && Array.isArray(l.chunks)) {
          for (const c of l.chunks) {
            if (!any) { minX = c.x; minY = c.y; maxX = c.x + c.width; maxY = c.y + c.height; any = true; }
            else {
              minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
              maxX = Math.max(maxX, c.x + c.width); maxY = Math.max(maxY, c.y + c.height);
            }
          }
        }
        if (l.type === 'group') visit(l.layers);
      }
    };
    visit(map.layers);
    if (!any) { minX = 0; minY = 0; maxX = Math.max(16, map.width || 16); maxY = Math.max(16, map.height || 16); }
    // pad
    minX -= 2; minY -= 2; maxX += 2; maxY += 2;
    return { minX, minY, maxX, maxY };
  }
  function resizeCanvas() {
    if (!state.map) return;
    const m = state.map, s = state.zoom;
    let w, h;
    if (m.infinite) {
      const b = layerChunkBounds(m);
      const bw = Math.max(1, b.maxX - b.minX), bh = Math.max(1, b.maxY - b.minY);
      state._chunkOrigin = { x: b.minX, y: b.minY };
      if (m.orientation === 'isometric') {
        w = (bw + bh) * m.tilewidth * s / 2;
        h = (bw + bh) * m.tileheight * s / 2;
      } else {
        w = bw * m.tilewidth * s; h = bh * m.tileheight * s;
      }
      els.canvas.width = Math.max(64, Math.ceil(w));
      els.canvas.height = Math.max(64, Math.ceil(h));
      state._infiniteDrawOffset = { x: -b.minX, y: -b.minY };
      return;
    }
    state._infiniteDrawOffset = null;
    if (m.orientation === 'isometric') {
      w = (m.width + m.height) * m.tilewidth * s / 2;
      h = (m.width + m.height) * m.tileheight * s / 2;
    } else if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
      if ((m.staggeraxis || 'y') === 'x') {
        w = m.width * hexColStep(m, s) + m.tilewidth * s;
        h = m.height * m.tileheight * s + m.tileheight * s / 2;
      } else {
        w = m.width * m.tilewidth * s + m.tilewidth * s / 2;
        h = m.height * hexRowStep(m, s) + m.tileheight * s;
      }
    } else { w = m.width * m.tilewidth * s; h = m.height * m.tileheight * s; }
    els.canvas.width = Math.max(1, Math.ceil(w));
    els.canvas.height = Math.max(1, Math.ceil(h));
    els.canvas.style.width = `${Math.ceil(w)}px`;
    els.canvas.style.height = `${Math.ceil(h)}px`;
  }
  function hexRowStep(m, s) {
    const side = Number(m.hexsidelength || 0) * s;
    if (m.orientation === 'hexagonal' && side > 0) return (m.tileheight * s + side) / 2;
    return m.tileheight * s * 0.75;
  }
  function hexColStep(m, s) {
    const side = Number(m.hexsidelength || 0) * s;
    if (m.orientation === 'hexagonal' && side > 0) return (m.tilewidth * s + side) / 2;
    return m.tilewidth * s * 0.75;
  }
  function mapToScreen(x, y) {
    const m = state.map, s = state.zoom;
    if (state._infiniteDrawOffset) { x += state._infiniteDrawOffset.x; y += state._infiniteDrawOffset.y; } /*_infOffApplied*/
    if (m.orientation === 'isometric') {
      return { x: (x - y) * m.tilewidth * s / 2 + (m.height * m.tilewidth * s / 2), y: (x + y) * m.tileheight * s / 2 };
    }
    if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
      if ((m.staggeraxis || 'y') === 'x') {
        return { x: x * hexColStep(m, s), y: y * m.tileheight * s + staggerOffset(x) * m.tileheight * s / 2 };
      }
      return { x: x * m.tilewidth * s + staggerOffset(y) * m.tilewidth * s / 2, y: y * hexRowStep(m, s) };
    }
    return { x: x * m.tilewidth * s, y: y * m.tileheight * s };
  }
  function screenToMap(px, py) {
    const m = state.map, s = state.zoom;
    let x, y;
    if (m.orientation === 'isometric') {
      x = (px / (m.tilewidth * s / 2) + py / (m.tileheight * s / 2)) / 2 - m.height / 2;
      y = (py / (m.tileheight * s / 2) - px / (m.tilewidth * s / 2)) / 2 + m.height / 2;
      x = Math.floor(x); y = Math.floor(y);
    } else if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
      if ((m.staggeraxis || 'y') === 'x') {
        x = Math.floor(px / hexColStep(m, s));
        y = Math.floor((py - staggerOffset(x) * m.tileheight * s / 2) / (m.tileheight * s));
      } else {
        y = Math.floor(py / hexRowStep(m, s));
        x = Math.floor((px - staggerOffset(y) * m.tilewidth * s / 2) / (m.tilewidth * s));
      }
    } else {
      x = Math.floor(px / (m.tilewidth * s));
      y = Math.floor(py / (m.tileheight * s));
    }
    if (state._infiniteDrawOffset) {
      x -= state._infiniteDrawOffset.x;
      y -= state._infiniteDrawOffset.y;
    }
    return { x, y };
  }

  function animatedTileIndex(ts, index) {
    const rec = ts && ts.tiles && ts.tiles[index];
    const frames = rec && rec.animation;
    if (!frames || !frames.length) return index;
    const total = frames.reduce((n, f) => n + Math.max(1, f.duration || 100), 0);
    const now = Date.now() % total; let cursor = 0;
    for (const frame of frames) { cursor += Math.max(1, frame.duration || 100); if (now < cursor) return frame.tileid; }
    return frames[frames.length - 1].tileid;
  }
  function hasAnimations() {
    return tilesetRegistry.some((ts) => Object.values(ts.tiles || {}).some((x) => x && x.animation && x.animation.length));
  }
  function drawTile(ctx, gid, x, y) {
    const info = gidInfo(gid); if (!info.id) return;
    const ts = tilesetForGid(info.id); if (!ts) return;
    const idx = animatedTileIndex(ts, info.id - ts.firstgid);
    const img = imageCache.get(ts.url); if (!img) return;
    const sx = (ts.margin || 0) + (idx % ts.columns) * (ts.tileWidth + (ts.spacing || 0));
    const sy = (ts.margin || 0) + Math.floor(idx / ts.columns) * (ts.tileHeight + (ts.spacing || 0));
    const p = mapToScreen(x, y), s = state.zoom;
    const dw = ts.tileWidth * s, dh = ts.tileHeight * s;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    let flipH = info.flipH, flipV = info.flipV, flipD = info.flipD;
    ctx.translate(p.x + dw / 2, p.y + dh / 2);
    if (flipD) { ctx.rotate(-Math.PI / 2); const t = flipH; flipH = flipV; flipV = t; }
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    if (state.showCollision) {
      const data = ts.tiles && ts.tiles[idx];
      const objects = (data && data.objectgroup && data.objectgroup.objects) || [];
      ctx.save(); ctx.strokeStyle = '#ff4d6d'; ctx.fillStyle = 'rgba(255,77,109,.2)'; ctx.lineWidth = 1.5;
      for (const o of objects) {
        const ox = p.x + (o.x || 0) * s, oy = p.y + (o.y || 0) * s;
        const w = (o.width || 0) * s, h = (o.height || 0) * s;
        if (o.ellipse) { ctx.beginPath(); ctx.ellipse(ox + w / 2, oy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        else if (o.polygon || o.polyline) {
          ctx.beginPath();
          (o.polygon || o.polyline).forEach((q, i) => { i ? ctx.lineTo(ox + q.x * s, oy + q.y * s) : ctx.moveTo(ox + q.x * s, oy + q.y * s); });
          if (o.polygon) ctx.closePath(); ctx.fill(); ctx.stroke();
        } else { ctx.fillRect(ox, oy, w, h); ctx.strokeRect(ox, oy, w, h); }
      }
      ctx.restore();
    }
  }
  function drawLayer(ctx, l, m, parentAlpha = 1) {
    if (!l || l.visible === false) return;
    ctx.save();
    let alpha = parentAlpha * (l.opacity == null ? 1 : l.opacity);
    if (typeof window.__tiledPrefs === 'function' && window.__tiledPrefs().highlightCurrentLayer) {
      const cur = activeLayer();
      if (cur && l !== cur && l.type !== 'group') alpha *= 0.35;
    }
    ctx.globalAlpha = alpha;
    if (l.type === 'group') for (const child of l.layers || []) drawLayer(ctx, child, m, ctx.globalAlpha);
    else if (l.type === 'tilelayer') {
      if (m.infinite && Array.isArray(l.chunks) && l.chunks.length) {
        for (const c of l.chunks) {
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const gid = c.data[y * c.width + x] || 0;
            if (gid) drawTile(ctx, gid, c.x + x, c.y + y);
          }
        }
      } else {
        for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
          const gid = tileAt(l, x, y, m); if (gid) drawTile(ctx, gid, x, y);
        }
      }
    } else if (l.type === 'objectgroup') drawObjects(ctx, l, m);
    else if (l.type === 'imagelayer' && l.image) {
      const img = imageCache.get(l.image);
      if (img) ctx.drawImage(img, Number(l.offsetx || 0) * state.zoom, Number(l.offsety || 0) * state.zoom, img.width * state.zoom, img.height * state.zoom);
    }
    ctx.restore();
  }
  function draw() {
    const c = els.canvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (!state.map) return;
    const m = state.map;
    for (const l of m.layers) drawLayer(ctx, l, m);
    if (state.grid) {
      ctx.save();
      const gc = (typeof window.__tiledPrefs === 'function' && window.__tiledPrefs().gridColor) || 'rgba(160,180,210,.18)';
      ctx.strokeStyle = gc; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      for (let y = 0; y <= m.height; y++) for (let x = 0; x <= m.width; x++) {
        const p = mapToScreen(x, y);
        if (m.orientation === 'orthogonal') {
          ctx.beginPath(); ctx.moveTo(p.x + .5, p.y + .5); ctx.lineTo(p.x + .5, p.y + m.tileheight * state.zoom + .5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p.x + .5, p.y + .5); ctx.lineTo(p.x + m.tilewidth * state.zoom + .5, p.y + .5); ctx.stroke();
        } else if (m.orientation === 'isometric') {
          const hw = m.tilewidth * state.zoom / 2, hh = m.tileheight * state.zoom / 2;
          ctx.beginPath(); ctx.moveTo(p.x, p.y + hh); ctx.lineTo(p.x + hw, p.y); ctx.lineTo(p.x + 2 * hw, p.y + hh); ctx.lineTo(p.x + hw, p.y + 2 * hh); ctx.closePath(); ctx.stroke();
        } else ctx.strokeRect(p.x + .5, p.y + .5, m.tilewidth * state.zoom, m.tileheight * state.zoom * .75);
      }
      ctx.restore();
    }
    if (typeof window.__tiledAfterDraw === 'function') window.__tiledAfterDraw(ctx, m);
    if (hasAnimations()) window.requestAnimationFrame(draw);
  }
  function drawObjects(ctx, l, m) {
    for (const o of l.objects || []) {
      ctx.save();
      if (o.visible === false) { ctx.restore(); continue; }
      ctx.globalAlpha = l.opacity == null ? 1 : l.opacity;
      const s = state.zoom;
      const use = (m.orientation === 'orthogonal')
        ? { x: (o.x || 0) * s, y: (o.y || 0) * s }
        : mapToScreen((o.x || 0) / m.tilewidth, (o.y || 0) / m.tileheight);
      let typeColor = null;
      if (typeof window.__tiledObjectTypeColor === 'function') typeColor = window.__tiledObjectTypeColor(o);
      const selected = o === state.selectedObject;
      ctx.strokeStyle = selected ? '#66a8ff' : (typeColor || '#ffc857');
      ctx.fillStyle = selected ? 'rgba(102,168,255,.18)' : (typeColor ? typeColor + '33' : 'rgba(255,200,87,.12)');
      ctx.lineWidth = 2;
      const w = (o.width || 0) * s, h = (o.height || 0) * s;
      const angle = (Number(o.rotation) || 0) * Math.PI / 180;
      let ux = use.x, uy = use.y;
      if (angle) { ctx.translate(ux + w / 2, uy + h / 2); ctx.rotate(angle); ctx.translate(-w / 2, -h / 2); ux = 0; uy = 0; }
      if (o.gid) {
        if (m.orientation === 'orthogonal') {
          const ts = tilesetForGid(o.gid);
          if (ts) {
            const info = gidInfo(o.gid);
            const idx = animatedTileIndex(ts, info.id - ts.firstgid);
            const img = imageCache.get(ts.url);
            if (img) {
              const sx = (ts.margin || 0) + (idx % ts.columns) * (ts.tileWidth + (ts.spacing || 0));
              const sy = (ts.margin || 0) + Math.floor(idx / ts.columns) * (ts.tileHeight + (ts.spacing || 0));
              const dw = w || ts.tileWidth * s, dh = h || ts.tileHeight * s;
              ctx.drawImage(img, sx, sy, ts.tileWidth, ts.tileHeight, ux, uy - dh + (h || dh), dw, dh);
            }
          }
        } else drawTile(ctx, o.gid, (o.x || 0) / m.tilewidth, (o.y || 0) / m.tileheight);
        ctx.strokeRect(ux, uy, w || m.tilewidth * s, h || m.tileheight * s);
      } else if (o.text !== undefined) {
        ctx.fillStyle = '#f3f4f6'; ctx.font = `${14 * s}px sans-serif`;
        ctx.fillText(o.text || '', ux + 3, uy + 16 * s);
        ctx.strokeRect(ux, uy, w || 80 * s, h || 24 * s);
      } else if (o.point) { ctx.beginPath(); ctx.arc(ux, uy, 4 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (o.ellipse) { ctx.beginPath(); ctx.ellipse(ux + w / 2, uy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (o.polygon || o.polyline) {
        const pts = o.polygon || o.polyline; ctx.beginPath();
        pts.forEach((q, i) => { const ax = ux + q.x * s, ay = uy + q.y * s; i ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay); });
        if (o.polygon) ctx.closePath(); ctx.stroke();
      } else { ctx.fillRect(ux, uy, w, h); ctx.strokeRect(ux, uy, w, h); }
      const prefs = typeof window.__tiledPrefs === 'function' ? window.__tiledPrefs() : {};
      const showLabel = prefs.objectLabels !== 'none' && (o.name || prefs.objectLabels === 'all');
      if (showLabel && (o.name || o.type)) {
        ctx.fillStyle = '#f3f4f6'; ctx.font = `${11 * s}px sans-serif`;
        ctx.fillText(o.name || o.type || '', ux + 4, uy + 14 * s);
      }
      ctx.restore();
    }
  }

  function renderInspector() {
    const o = state.selectedObject;
    if (!o) { els.inspector.className = 'inspector empty'; els.inspector.textContent = '选择对象后编辑属性'; return; }
    els.inspector.className = 'inspector';
    els.inspector.innerHTML = `<div class="inspector-grid"><label>名称<input data-k="name"></label><label>类型<input data-k="type"></label><label>x<input data-k="x" type="number"></label><label>y<input data-k="y" type="number"></label><label>宽<input data-k="width" type="number"></label><label>高<input data-k="height" type="number"></label><label>旋转<input data-k="rotation" type="number"></label><label>可见 <input data-k="visible" type="checkbox"></label><label class="wide">文本<input data-k="text"></label><label class="wide">属性(JSON)<textarea data-k="properties" rows="3"></textarea></label></div>`;
    for (const k of ['name', 'type', 'x', 'y', 'width', 'height', 'rotation', 'text']) {
      const e = els.inspector.querySelector(`[data-k="${k}"]`);
      e.value = o[k] ?? (k === 'type' ? 'object' : '');
      e.onchange = () => { snapshot(); if (k === 'name' || k === 'type' || k === 'text') o[k] = e.value; else o[k] = Number(e.value) || 0; renderAll(); };
    }
    const visible = els.inspector.querySelector('[data-k="visible"]');
    visible.checked = o.visible !== false;
    visible.onchange = () => { snapshot(); o.visible = visible.checked; renderAll(); };
    els.inspector.querySelector('[data-k="properties"]').value = JSON.stringify(o.properties || {}, null, 2);
    els.inspector.querySelector('[data-k="properties"]').onchange = (e) => {
      snapshot();
      try { o.properties = JSON.parse(e.target.value || '{}'); renderAll(); } catch { status('属性 JSON 无效'); }
    };
    if (typeof window.__tiledEnhanceInspector === 'function') {
      window.__tiledEnhanceInspector(o, els.inspector);
    }
  }

  function addLayer(type = 'tilelayer') {
    if (!state.map) return;
    snapshot();
    const parent = activeLayer()?.type === 'group' ? activeLayer() : null;
    const list = parent ? (parent.layers || (parent.layers = [])) : state.map.layers;
    const id = Math.max(0, ...flattenLayerIds(state.map.layers)) + 1;
    const n = list.length + 1;
    const layer = { id, name: type === 'objectgroup' ? `对象层 ${n}` : type === 'group' ? `组层 ${n}` : `图层 ${n}`, type, x: 0, y: 0, opacity: 1, visible: true };
    if (type === 'tilelayer') { layer.width = state.map.width; layer.height = state.map.height; layer.data = Array(state.map.width * state.map.height).fill(0); }
    if (type === 'objectgroup') layer.objects = [];
    if (type === 'group') layer.layers = [];
    list.push(layer);
    state.layerPath = parent ? state.layerPath.concat(list.length - 1) : null;
    state.layer = parent ? state.layerPath[0] : list.length - 1;
    renderAll();
  }
  function removeLayer() {
    if (!state.map) return;
    const path = state.layerPath || [state.layer], parentPath = path.slice(0, -1), idx = path[path.length - 1];
    const bucket = layerListForPath(parentPath);
    if (bucket.list.length <= 1 && path.length === 1) return;
    snapshot(); bucket.list.splice(idx, 1);
    state.layerPath = parentPath.length ? parentPath : null;
    state.layer = parentPath[0] || Math.max(0, idx - 1);
    renderAll();
  }
  function moveLayer(delta) {
    if (!state.map) return;
    const path = state.layerPath || [state.layer], parentPath = path.slice(0, -1), idx = path[path.length - 1];
    const bucket = layerListForPath(parentPath), next = idx + delta;
    if (next < 0 || next >= bucket.list.length) return;
    snapshot();
    const item = bucket.list.splice(idx, 1)[0];
    bucket.list.splice(next, 0, item);
    state.layerPath = parentPath.length ? parentPath.concat(next) : null;
    state.layer = parentPath[0] || next;
    renderAll();
  }

  function stampCellGid(sx, sy) {
    const sel = state.tileSelection || { x: 0, y: 0, w: 1, h: 1 };
    let x = sx, y = sy;
    if (state.stampTransform.flipX) x = sel.w - 1 - x;
    if (state.stampTransform.flipY) y = sel.h - 1 - y;
    let gid;
    if (state.stampData) gid = state.stampData[y * sel.w + x] || 0;
    else {
      const idx = (sel.y + y) * (state.tileset?.columns || 1) + sel.x + x;
      gid = state.tileset ? state.tileset.firstgid + idx : 1;
    }
    const info = gidInfo(gid);
    let flipH = info.flipH ^ state.stampTransform.flipX;
    let flipV = info.flipV ^ state.stampTransform.flipY;
    let flipD = info.flipD;
    const rot = ((state.stampTransform.rotate % 360) + 360) % 360;
    if (rot === 90) { const t = flipH; flipH = flipV; flipV = t; flipD = !flipD; flipH = !flipH; }
    else if (rot === 180) { flipH = !flipH; flipV = !flipV; }
    else if (rot === 270) { const t = flipH; flipH = flipV; flipV = t; flipD = !flipD; flipV = !flipV; }
    return composeGid(info.id, flipH, flipV, flipD);
  }
  function paintAt(x, y) {
    const l = activeLayer(), m = state.map;
    if (!l || l.type !== 'tilelayer') return;
    if (!m.infinite && (x < 0 || y < 0 || x >= m.width || y >= m.height)) return;
    if (m.infinite && (Math.abs(x) > 100000 || Math.abs(y) > 100000)) return;
    if (state.tool === 'eraser') setTileAt(l, x, y, m, 0);
    else {
      const sel = state.tileSelection || { x: 0, y: 0, w: 1, h: 1 };
      const origin = state.drag && state.drag.start ? state.drag.start : { x, y };
      const sx = ((x - origin.x) % sel.w + sel.w) % sel.w;
      const sy = ((y - origin.y) % sel.h + sel.h) % sel.h;
      setTileAt(l, x, y, m, stampCellGid(sx, sy));
    }
    draw();
    if (typeof window.__onTilePainted === 'function') window.__onTilePainted(x, y, 'paint');
  }
  function bucket(x, y) {
    const l = activeLayer(), m = state.map;
    if (!l || l.type !== 'tilelayer') return;
    if (!m.infinite && (x < 0 || y < 0 || x >= m.width || y >= m.height)) return;
    const old = tileAt(l, x, y, m) >>> 0;
    const newGid = state.tool === 'eraser' ? 0 : stampCellGid(0, 0);
    if (old === (newGid >>> 0)) return;
    const q = [[x, y]], seen = new Set();
    const inBounds = (a, b) => m.infinite
      ? (Math.abs(a) <= 100000 && Math.abs(b) <= 100000)
      : (a >= 0 && b >= 0 && a < m.width && b < m.height);
    let filled = 0;
    const maxFill = m.infinite ? 20000 : m.width * m.height;
    while (q.length && filled < maxFill) {
      const [a, b] = q.pop();
      const key = a + ',' + b;
      if (seen.has(key) || !inBounds(a, b)) continue;
      if ((tileAt(l, a, b, m) >>> 0) !== old) continue;
      seen.add(key); setTileAt(l, a, b, m, newGid); filled++;
      q.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    if (typeof window.__onTilePainted === 'function') window.__onTilePainted(x, y, 'bucket');
  }

  function objectAt(px, py) {
    const objs = activeLayer()?.objects || [];
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.point) {
        const dx = px - (o.x || 0), dy = py - (o.y || 0);
        if (dx * dx + dy * dy <= 64) return o;
        continue;
      }
      const x = o.x || 0, y = o.y || 0, w = o.width || 0, h = o.height || 0;
      if (px >= x && py >= y && px <= x + Math.max(w, 4) && py <= y + Math.max(h, 4)) return o;
    }
    return null;
  }
  function snapWorldPixel(x, y) {
    const prefs = typeof window.__tiledPrefs === 'function' ? window.__tiledPrefs() : {};
    const m = state.map;
    if (!m) return { x, y };
    if (prefs.snapToPixels) { x = Math.round(x); y = Math.round(y); }
    if (prefs.snapToGrid || prefs.snapToFineGrid) {
      const tw = m.tilewidth || 32, th = m.tileheight || 32;
      const div = prefs.snapToFineGrid ? Math.max(1, Number(prefs.gridFine) || 4) : 1;
      const gx = tw / div, gy = th / div;
      x = Math.round(x / gx) * gx;
      y = Math.round(y / gy) * gy;
    }
    return { x, y };
  }
  function pointer(e) {
    const r = els.canvas.getBoundingClientRect();
    let sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (state._worldDraw && state._worldDraw.enabled) {
      // world shared-camera: convert via hook if present
      if (typeof window.__tiledWorldScreenToMap === 'function') {
        const wp = window.__tiledWorldScreenToMap(sx, sy);
        if (wp) {
          els.cursor.textContent = `world ${Math.round(wp.wx)},${Math.round(wp.wy)} | map ${wp.x},${wp.y}`;
          return { x: wp.x, y: wp.y, wx: wp.wx, wy: wp.wy };
        }
      }
    }
    const p = screenToMap(sx, sy);
    els.cursor.textContent = `x: ${p.x}  y: ${p.y}`;
    return p;
  }
  function pointerDown(e) {
    if (!state.map) return;
    const p = pointer(e);
    const px = p.x * state.map.tilewidth, py = p.y * state.map.tileheight;
    state.drag = { start: p, last: p, moved: false };
    if (state.tool === 'select') {
      state.selectedObject = objectAt(px, py);
      if (state.selectedObject) {
        state.drag.object = state.selectedObject;
        state.drag.offset = { x: px - (state.selectedObject.x || 0), y: py - (state.selectedObject.y || 0) };
      }
      renderInspector(); draw(); return;
    }
    if (state.tool === 'tile-select') { if (activeLayer()?.type === 'tilelayer') state.drag.start = p; draw(); return; }
    if (state.tool === 'pencil' || state.tool === 'eraser' || state.tool === 'bucket' || state.tool === 'terrain' || state.tool === 'wang') {
      beginPaintStroke();
    } else {
      snapshot();
    }
    if (state.tool === 'pencil' || state.tool === 'eraser') paintAt(p.x, p.y);
    else if (state.tool === 'bucket') { bucket(p.x, p.y); draw(); }
    else if (['rect', 'ellipse', 'polyline', 'point', 'text', 'polygon', 'tile-object'].includes(state.tool)) {
      if (activeLayer()?.type !== 'objectgroup') {
        const l = { id: Math.max(0, ...flattenLayerIds(state.map.layers)) + 1, name: '对象层', type: 'objectgroup', draworder: 'topdown', objects: [] };
        state.map.layers.push(l); state.layer = state.map.layers.length - 1; state.layerPath = null;
      }
      state.drag.start = { x: px, y: py };
      if (state.tool === 'polyline') state.drag.points = [{ x: 0, y: 0 }];
    }
  }
  function pointerMove(e) {
    if (!state.drag) { pointer(e); return; }
    const p = pointer(e);
    if (state.tool === 'select' && state.drag.object) {
      const px = p.x * state.map.tilewidth, py = p.y * state.map.tileheight;
      if (!state.drag.moved) { snapshot(); state.drag.moved = true; }
      state.drag.object.x = px - state.drag.offset.x;
      state.drag.object.y = py - state.drag.offset.y;
      draw(); renderInspector(); return;
    }
    if (state.tool === 'tile-select') {
      draw();
      const ctx = els.canvas.getContext('2d'), a = state.drag.start, b = p;
      const p0 = mapToScreen(Math.min(a.x, b.x), Math.min(a.y, b.y));
      const p1 = mapToScreen(Math.max(a.x, b.x) + 1, Math.max(a.y, b.y) + 1);
      ctx.strokeStyle = '#66a8ff'; ctx.setLineDash([5, 4]);
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); ctx.setLineDash([]);
      return;
    }
    if (state.tool === 'pencil' || state.tool === 'eraser') { paintAt(p.x, p.y); state.drag.last = p; }
    else if (['rect', 'ellipse'].includes(state.tool)) {
      draw();
      const ctx = els.canvas.getContext('2d'), a = state.drag.start;
      const b = { x: p.x * state.map.tilewidth, y: p.y * state.map.tileheight };
      const x = Math.min(a.x, b.x) * state.zoom, y = Math.min(a.y, b.y) * state.zoom;
      const w = Math.abs(b.x - a.x) * state.zoom, h = Math.abs(b.y - a.y) * state.zoom;
      ctx.strokeStyle = '#66a8ff'; ctx.setLineDash([5, 4]);
      if (state.tool === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      else ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    } else if (state.tool === 'polyline') {
      draw();
      const ctx = els.canvas.getContext('2d'), a = state.drag.start;
      const b = { x: p.x * state.map.tilewidth, y: p.y * state.map.tileheight };
      ctx.strokeStyle = '#66a8ff'; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x * state.zoom, a.y * state.zoom); ctx.lineTo(b.x * state.zoom, b.y * state.zoom); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function pointerUp(e) {
    if (!state.drag) { endPaintStroke(); return; }
    const d = state.drag, p = pointer(e); state.drag = null;
    endPaintStroke();
    if (state.tool === 'select') { renderAll(); return; }
    if (state.tool === 'tile-select') {
      const l = activeLayer(), a = d.start, b = p;
      if (l?.type === 'tilelayer') {
        const x0 = Math.max(0, Math.min(a.x, b.x)), y0 = Math.max(0, Math.min(a.y, b.y));
        const x1 = Math.min(state.map.width - 1, Math.max(a.x, b.x)), y1 = Math.min(state.map.height - 1, Math.max(a.y, b.y));
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        state.stampData = [];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) state.stampData.push(tileAt(l, x, y, state.map));
        state.tileSelection = { x: 0, y: 0, w, h };
        state.tool = 'pencil';
        setToolMode('tile', { keepTool: true });
        const pencilBtn = document.querySelector('[data-tool-group="tile"] [data-tool="pencil"]') || document.querySelector('[data-tool="pencil"]');
        if (pencilBtn) pencilBtn.click();
        status(`已选取地图印章 ${w}×${h}`);
      }
      renderAll(); return;
    }
    if (['rect', 'ellipse', 'text', 'polygon', 'tile-object'].includes(state.tool)) {
      let b = { x: p.x * state.map.tilewidth, y: p.y * state.map.tileheight };
      const a0 = snapWorldPixel(d.start.x, d.start.y);
      b = snapWorldPixel(b.x, b.y);
      const a = a0;
      const o = { id: nextObjectId(), name: '对象', type: 'object', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
      if (state.tool === 'ellipse') o.ellipse = true;
      if (state.tool === 'text') o.text = '文本';
      if (state.tool === 'polygon') o.polygon = [{ x: 0, y: 0 }, { x: Math.abs(b.x - a.x), y: 0 }, { x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y) }, { x: 0, y: Math.abs(b.y - a.y) }];
      if (state.tool === 'tile-object') o.gid = state.tileset ? state.tileset.firstgid + state.tile : 0;
      activeLayer().objects.push(o); state.selectedObject = o;
    } else if (state.tool === 'point') {
      const sp = snapWorldPixel(d.start.x, d.start.y);
      state.selectedObject = { id: nextObjectId(), name: '点', type: 'point', x: sp.x, y: sp.y, point: true };
      activeLayer().objects.push(state.selectedObject);
    } else if (state.tool === 'polyline') {
      const a = d.start, b = { x: p.x * state.map.tilewidth, y: p.y * state.map.tileheight };
      state.selectedObject = { id: nextObjectId(), name: '折线', type: 'polyline', x: a.x, y: a.y, polyline: [{ x: 0, y: 0 }, { x: b.x - a.x, y: b.y - a.y }] };
      activeLayer().objects.push(state.selectedObject);
    }
    renderAll();
  }
  function nextObjectId() {
    return 1 + Math.max(0, ...state.map.layers.flatMap((l) => [
      ...((l.objects || []).map((o) => o.id || 0)),
      ...((l.layers || []).flatMap((c) => (c.objects || []).map((o) => o.id || 0)))
    ]));
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => { imageCache.set(fr.result, img); resolve(fr.result); };
        img.onerror = reject; img.src = fr.result;
      };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }
  function xmlProperties(node) {
    const out = {};
    const types = {};
    if (!node) return out;
    node.querySelectorAll(':scope > properties > property').forEach((prop) => {
      const name = prop.getAttribute('name'); if (!name) return;
      const type = prop.getAttribute('type') || 'string';
      const value = (prop.getAttribute('value') ?? prop.textContent) || '';
      types[name] = type;
      if (type === 'bool') out[name] = value === 'true';
      else if (type === 'int' || type === 'float') out[name] = Number(value);
      else out[name] = value; // string, color, file
    });
    out.__propertyTypes = types;
    return out;
  }
  function stripPropMeta(props) {
    if (!props || typeof props !== 'object') return { values: {}, types: {} };
    const types = Object.assign({}, props.__propertyTypes || {});
    const values = {};
    for (const [k, v] of Object.entries(props)) {
      if (k === '__propertyTypes') continue;
      values[k] = v;
      if (!types[k]) {
        types[k] = typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : 'string';
      }
    }
    return { values, types };
  }


  function parseWangSets(root) {
    const sets = [];
    const wrap = root.querySelector(':scope > wangsets');
    if (!wrap) return sets;
    wrap.querySelectorAll(':scope > wangset').forEach((ws) => {
      const set = {
        name: ws.getAttribute('name') || 'Wang',
        tile: Number(ws.getAttribute('tile') || 0),
        edgeColors: [],
        cornerColors: [],
        tiles: {} // tileId -> { wangId, hflip, vflip, dflip }
      };
      ws.querySelectorAll(':scope > wangedgecolor').forEach((c) => {
        set.edgeColors.push({
          name: c.getAttribute('name') || '',
          color: c.getAttribute('color') || '#888',
          tile: Number(c.getAttribute('tile') || 0),
          probability: Number(c.getAttribute('probability') || 1)
        });
      });
      ws.querySelectorAll(':scope > wangcornercolor').forEach((c) => {
        set.cornerColors.push({
          name: c.getAttribute('name') || '',
          color: c.getAttribute('color') || '#888',
          tile: Number(c.getAttribute('tile') || 0),
          probability: Number(c.getAttribute('probability') || 1)
        });
      });
      ws.querySelectorAll(':scope > wangtile').forEach((t) => {
        const id = Number(t.getAttribute('tileid') || 0);
        const wangAttr = t.getAttribute('wangid') || '0';
        const wangId = wangAttr.startsWith('0x') || wangAttr.startsWith('0X')
          ? parseInt(wangAttr, 16) : (Number(wangAttr) >>> 0);
        set.tiles[id] = {
          wangId: wangId >>> 0,
          hflip: t.getAttribute('hflip') === '1',
          vflip: t.getAttribute('vflip') === '1',
          dflip: t.getAttribute('dflip') === '1'
        };
      });
      sets.push(set);
    });
    return sets;
  }

  function parseTerrainTypes(root) {
    const terrains = [];
    const node = root.querySelector(':scope > terraintypes');
    if (!node) return terrains;
    node.querySelectorAll(':scope > terrain').forEach((t, i) => {
      terrains.push({
        id: i,
        name: t.getAttribute('name') || `地形 ${i}`,
        tile: Number(t.getAttribute('tile') || 0)
      });
    });
    return terrains;
  }
  function parseTileTerrainAttr(attr) {
    // "tl,tr,bl,br" with empty meaning -1 (0xFF)
    if (!attr && attr !== 0) return null;
    const parts = String(attr).split(',');
    while (parts.length < 4) parts.push('');
    const ids = parts.slice(0, 4).map((p) => {
      const s = p.trim();
      if (s === '' || s === '-1') return 0xFF;
      return Number(s) & 0xFF;
    });
    return ((ids[0] & 0xFF) << 24) | ((ids[1] & 0xFF) << 16) | ((ids[2] & 0xFF) << 8) | (ids[3] & 0xFF);
  }
  function parseTsxTileExtras(root) {
    const tiles = {};
    root.querySelectorAll(':scope > tile').forEach((node) => {
      const id = node.getAttribute('id') || '0';
      const rec = tiles[id] || (tiles[id] = {});
      const props = xmlProperties(node);
      if (Object.keys(props).length) rec.properties = props;
      const terr = parseTileTerrainAttr(node.getAttribute('terrain'));
      if (terr != null) rec.terrain = terr >>> 0;
      if (node.getAttribute('probability') != null) rec.probability = Number(node.getAttribute('probability'));
      const animation = node.querySelector(':scope > animation');
      if (animation) {
        const frames = [];
        animation.querySelectorAll('frame').forEach((frame) => {
          frames.push({ tileid: Number(frame.getAttribute('tileid') || 0), duration: Math.max(1, Number(frame.getAttribute('duration') || 100)) });
        });
        if (frames.length) rec.animation = frames;
      }
      const og = node.querySelector(':scope > objectgroup');
      if (og) {
        rec.objectgroup = {
          objects: Array.from(og.querySelectorAll(':scope > object')).map((o) => {
            const obj = {
              id: Number(o.getAttribute('id') || 0), name: o.getAttribute('name') || '', type: o.getAttribute('type') || '',
              x: Number(o.getAttribute('x') || 0), y: Number(o.getAttribute('y') || 0),
              width: Number(o.getAttribute('width') || 0), height: Number(o.getAttribute('height') || 0)
            };
            if (o.querySelector(':scope > ellipse')) obj.ellipse = true;
            if (o.querySelector(':scope > point')) obj.point = true;
            const poly = o.querySelector(':scope > polygon');
            const line = o.querySelector(':scope > polyline');
            if (poly) obj.polygon = (poly.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => { const [x, y] = v.split(',').map(Number); return { x, y }; });
            if (line) obj.polyline = (line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => { const [x, y] = v.split(',').map(Number); return { x, y }; });
            return obj;
          })
        };
      }
    });
    return tiles;
  }
  async function loadTiles(files, opts = {}) {
    const list = Array.from(files || []);
    const file = list[0]; if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    let meta = null, imageFile = null;
    if (ext === 'tsx') {
      const xml = new DOMParser().parseFromString(await file.text(), 'application/xml');
      const root = xml.querySelector('tileset');
      const image = root && root.querySelector(':scope > image');
      if (!root || !image) throw Error('TSX 图块集无效');
      meta = {
        name: root.getAttribute('name') || file.name,
        tileWidth: Number(root.getAttribute('tilewidth') || 32), tileHeight: Number(root.getAttribute('tileheight') || 32),
        margin: Number(root.getAttribute('margin') || 0), spacing: Number(root.getAttribute('spacing') || 0),
        columns: Number(root.getAttribute('columns') || 0), count: Number(root.getAttribute('tilecount') || 0),
        image: image.getAttribute('source') || '', tiles: parseTsxTileExtras(root), terrains: parseTerrainTypes(root), wangSets: parseWangSets(root)
      };
      imageFile = list.find((x) => x.name === meta.image.split('/').pop()) || list.find((x) => x.type.startsWith('image/'));
    } else if (ext === 'tsj' || ext === 'json') {
      const raw = JSON.parse(await file.text());
      if (raw.layers && raw.tilesets) throw Error('这是地图 JSON，请用「打开」');
      meta = {
        ...raw, name: raw.name || file.name,
        tileWidth: Number(raw.tilewidth || raw.tileWidth || 32), tileHeight: Number(raw.tileheight || raw.tileHeight || 32),
        margin: Number(raw.margin || 0), spacing: Number(raw.spacing || 0),
        columns: Number(raw.columns || 0), count: Number(raw.tilecount || raw.count || 0), tiles: raw.tiles || {}
      };
      if (Array.isArray(meta.tiles)) {
        const mapTiles = {}; meta.tiles.forEach((t) => { if (t && t.id != null) mapTiles[t.id] = t; }); meta.tiles = mapTiles;
      }
      Object.values(meta.tiles || {}).forEach((rec) => {
        if (rec && Array.isArray(rec.terrain)) {
          const p = rec.terrain.concat(['','','','']).slice(0,4).map((v) => (v === '' || v == null || v < 0) ? 0xFF : (Number(v) & 0xFF));
          rec.terrain = ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3]) >>> 0;
        }
      });
      imageFile = list.find((x) => x.name === (raw.image || '').split('/').pop()) || list.find((x) => x.type.startsWith('image/'));
    } else {
      imageFile = file;
      meta = { name: file.name, tileWidth: Number($('#tileWidth').value) || 32, tileHeight: Number($('#tileHeight').value) || 32, margin: 0, spacing: 0, tiles: {} };
    }
    if (!imageFile) throw Error('图块集缺少配套图片：请同时选择 TSX/TSJ 和图片');
    const url = await readImage(imageFile);
    const img = imageCache.get(url);
    const tw = meta.tileWidth || 32, th = meta.tileHeight || 32;
    const columns = meta.columns || Math.max(1, Math.floor((img.width - 2 * (meta.margin || 0) + (meta.spacing || 0)) / (tw + (meta.spacing || 0))));
    const count = meta.count || Math.max(1, columns * Math.floor((img.height - 2 * (meta.margin || 0) + (meta.spacing || 0)) / (th + (meta.spacing || 0))));
    const firstgid = Number(opts.firstgid || meta.firstgid || nextFirstGid());
    const ts = { ...meta, name: meta.name || file.name, tileWidth: tw, tileHeight: th, columns, count, firstgid, url, image: imageFile.name };
    registerTileset(ts);
    if (state.map) {
      const existing = (state.map.tilesets || []).find((t) => Number(t.firstgid) === firstgid);
      const entry = { firstgid, name: ts.name, tilewidth: tw, tileheight: th, tilecount: count, columns, margin: meta.margin || 0, spacing: meta.spacing || 0, image: imageFile.name, tiles: meta.tiles || {} };
      if (existing) Object.assign(existing, entry);
      else { state.map.tilesets = state.map.tilesets || []; state.map.tilesets.push(entry); }
    }
    renderTileset(); draw();
    log(`已载入图块集：${file.name} (firstgid=${firstgid})`);
  }
  async function attachMapTileset(files) {
    const all = Array.from(files || []);
    const resolveName = (path) => {
      const base = String(path || '').split('/').pop();
      if (!base) return null;
      let f = all.find((x) => x.name === base);
      if (f) return f;
      if (state.assetFileIndex && state.assetFileIndex.has(base)) return state.assetFileIndex.get(base);
      if (typeof window.__tiledResolveAsset === 'function') {
        const r = window.__tiledResolveAsset(path, base);
        if (r) return r;
      }
      return null;
    };
    const missing = [];
    for (const ts of state.map.tilesets || []) {
      if (!ts) continue;
      if (ts.source) {
        const sourceFile = resolveName(ts.source);
        if (sourceFile) {
          const extras = all.slice();
          if (state.assetFileIndex) extras.push(...state.assetFileIndex.values());
          await loadTiles([sourceFile, ...extras.filter((x) => x !== sourceFile)], { firstgid: Number(ts.firstgid || 1) });
          continue;
        }
        missing.push(String(ts.source));
        continue;
      }
      const wanted = String(ts.image || '').split('/').pop();
      const imageFile = resolveName(ts.image) || ((state.map.tilesets || []).length === 1 ? all.find((x) => x.type && x.type.startsWith('image/')) : null);
      if (!imageFile) { if (wanted) missing.push(wanted); continue; }
      const url = await readImage(imageFile);
      const img = imageCache.get(url);
      const tw = Number(ts.tilewidth || state.map.tilewidth || 32);
      const th = Number(ts.tileheight || state.map.tileheight || 32);
      const columns = Number(ts.columns || Math.max(1, Math.floor(img.width / tw)));
      const count = Number(ts.tilecount || columns * Math.floor(img.height / th));
      let tiles = ts.tiles || {};
      if (Array.isArray(tiles)) { const mapTiles = {}; tiles.forEach((t) => { if (t && t.id != null) mapTiles[t.id] = t; }); tiles = mapTiles; }
      registerTileset({ ...ts, name: ts.name || wanted, tileWidth: tw, tileHeight: th, columns, count, firstgid: Number(ts.firstgid || 1), url, tiles });
    }
    if (missing.length && typeof window.__tiledMissingAssets === 'function') {
      window.__tiledMissingAssets(missing);
    } else if (missing.length) {
      log('未解析的外部资源：' + missing.join(', ') + '（可用「资源目录」或一次多选）');
    }
    renderTileset(); draw();
  }
  async function attachMapImages(files) {
    const all = Array.from(files || []);
    const visit = async (layers) => {
      for (const layer of layers || []) {
        if (layer.type === 'imagelayer' && layer.image && !String(layer.image).startsWith('data:')) {
          const wanted = String(layer.image).split('/').pop();
          const file = all.find((x) => x.name === wanted);
          if (file) layer.image = await readImage(file);
        }
        if (layer.type === 'group') await visit(layer.layers);
      }
    };
    await visit(state.map.layers);
  }
  function parseCsvMap(text) {
    const rows = text.replace(/\r/g, '').trim().split('\n').map((row) => row.split(',').map((v) => Number(v.trim()) || 0));
    const height = rows.length, width = Math.max(1, ...rows.map((r) => r.length));
    return {
      version: '1.2', tiledversion: '1.2.4', orientation: 'orthogonal', renderorder: 'right-down',
      width, height, tilewidth: Number($('#tileWidth').value) || 32, tileheight: Number($('#tileHeight').value) || 32,
      layers: [{ id: 1, name: 'CSV 图层', type: 'tilelayer', x: 0, y: 0, width, height, opacity: 1, visible: true, data: rows.flatMap((r) => r.concat(Array(width - r.length).fill(0))) }],
      tilesets: []
    };
  }
  async function openFile(file, files = [file]) {
    const text = await file.text();
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.world')) {
        if (typeof window.__tiledOnWorldFile === 'function') {
          await window.__tiledOnWorldFile(file, files, text);
          return;
        }
      }
      let map;
      if (lower.endsWith('.tmx')) map = parseTmxAdvanced(text);
      else if (lower.endsWith('.csv')) map = parseCsvMap(text);
      else map = JSON.parse(text);
      tilesetRegistry.length = 0; state.tileset = null;
      state.mapFileName = file.name;
      state.mapFile = file;
      state.fileHandle = null;
      state.openFileBundle = Array.from(files || [file]);
      setMap(map);
      if (typeof window.__tiledBeforeAttachAssets === 'function') {
        await window.__tiledBeforeAttachAssets(file, files, map);
      }
      await attachMapTileset(files);
      await attachMapImages(files);
      if (typeof window.__tiledAfterOpenMap === 'function') {
        await window.__tiledAfterOpenMap(file, files, map);
      }
      draw(); status(`已打开 ${file.name}`); log(`打开：${file.name}`);
      if (typeof window.__tiledAddRecent === 'function') window.__tiledAddRecent(file.name);
    } catch (err) { status('打开失败'); log(`打开失败：${err.message}`); }
  }

  function parseObjectNode(o) {
    const rec = {
      id: Number(o.getAttribute('id') || 1), name: o.getAttribute('name') || '', type: o.getAttribute('type') || 'object',
      properties: xmlProperties(o), x: Number(o.getAttribute('x') || 0), y: Number(o.getAttribute('y') || 0),
      width: Number(o.getAttribute('width') || 0), height: Number(o.getAttribute('height') || 0),
      rotation: Number(o.getAttribute('rotation') || 0), visible: o.getAttribute('visible') !== '0'
    };
    const poly = o.querySelector(':scope > polygon');
    const line = o.querySelector(':scope > polyline');
    const text = o.querySelector(':scope > text');
    if (o.querySelector(':scope > ellipse')) rec.ellipse = true;
    if (o.querySelector(':scope > point')) rec.point = true;
    if (poly) rec.polygon = (poly.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => { const [x, y] = v.split(',').map(Number); return { x, y }; });
    if (line) rec.polyline = (line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).map((v) => { const [x, y] = v.split(',').map(Number); return { x, y }; });
    if (text) rec.text = text.textContent || '';
    if (o.getAttribute('gid')) rec.gid = Number(o.getAttribute('gid')) >>> 0;
    return rec;
  }
  function parseTileLayerNode(n, map, i) {
    const dataNode = n.querySelector(':scope > data');
    const encoding = dataNode?.getAttribute('encoding') || '';
    const compression = dataNode?.getAttribute('compression') || '';
    const raw = (dataNode?.textContent || '').trim();
    const layer = {
      id: Number(n.getAttribute('id') || i + 1), name: n.getAttribute('name') || `图层 ${i + 1}`, type: 'tilelayer',
      x: 0, y: 0, width: Number(n.getAttribute('width') || map.width), height: Number(n.getAttribute('height') || map.height),
      properties: xmlProperties(n), opacity: Number(n.getAttribute('opacity') || 1), visible: n.getAttribute('visible') !== '0',
      offsetx: Number(n.getAttribute('offsetx') || 0), offsety: Number(n.getAttribute('offsety') || 0)
    };
    const chunks = dataNode ? Array.from(dataNode.querySelectorAll(':scope > chunk')) : [];
    if (chunks.length) {
      layer.chunks = chunks.map((c) => {
        const cEnc = c.getAttribute('encoding') || encoding;
        const cComp = c.getAttribute('compression') || compression;
        return {
          x: Number(c.getAttribute('x') || 0), y: Number(c.getAttribute('y') || 0),
          width: Number(c.getAttribute('width') || 16), height: Number(c.getAttribute('height') || 16),
          data: decodeGids((c.textContent || '').trim(), cEnc || 'csv', cComp)
        };
      });
      map.infinite = true;
    } else {
      layer.data = decodeGids(raw, encoding || (raw.includes(',') ? 'csv' : 'base64'), compression);
    }
    return layer;
  }
  function walkTmxLayers(parent, map) {
    const out = [];
    for (const n of Array.from(parent.children)) {
      const tag = n.tagName.toLowerCase();
      if (tag === 'layer') out.push(parseTileLayerNode(n, map, out.length));
      else if (tag === 'imagelayer') {
        const image = n.querySelector(':scope > image');
        out.push({
          id: Number(n.getAttribute('id') || out.length + 1), name: n.getAttribute('name') || `图像层 ${out.length + 1}`,
          type: 'imagelayer', offsetx: Number(n.getAttribute('offsetx') || 0), offsety: Number(n.getAttribute('offsety') || 0),
          opacity: Number(n.getAttribute('opacity') || 1), visible: n.getAttribute('visible') !== '0',
          properties: xmlProperties(n), image: (image && image.getAttribute('source')) || ''
        });
      } else if (tag === 'objectgroup') {
        out.push({
          id: Number(n.getAttribute('id') || out.length + 1), name: n.getAttribute('name') || `对象层 ${out.length + 1}`,
          type: 'objectgroup', properties: xmlProperties(n), opacity: Number(n.getAttribute('opacity') || 1),
          visible: n.getAttribute('visible') !== '0', objects: Array.from(n.querySelectorAll(':scope > object')).map(parseObjectNode)
        });
      } else if (tag === 'group') {
        out.push({
          id: Number(n.getAttribute('id') || out.length + 1), name: n.getAttribute('name') || `组层 ${out.length + 1}`,
          type: 'group', properties: xmlProperties(n), opacity: Number(n.getAttribute('opacity') || 1),
          visible: n.getAttribute('visible') !== '0', layers: walkTmxLayers(n, map)
        });
      }
    }
    return out;
  }
  function parseTmxAdvanced(text) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    const m = xml.querySelector('map');
    if (!m || xml.querySelector('parsererror')) throw Error('TMX XML 无效');
    const map = {
      version: m.getAttribute('version') || '1.2', tiledversion: m.getAttribute('tiledversion') || '1.2.4',
      orientation: m.getAttribute('orientation') || 'orthogonal', renderorder: m.getAttribute('renderorder') || 'right-down',
      width: Number(m.getAttribute('width') || 1), height: Number(m.getAttribute('height') || 1),
      tilewidth: Number(m.getAttribute('tilewidth') || 32), tileheight: Number(m.getAttribute('tileheight') || 32),
      infinite: m.getAttribute('infinite') === '1',
      staggeraxis: m.getAttribute('staggeraxis') || 'y', staggerindex: m.getAttribute('staggerindex') || 'odd',
      hexsidelength: Number(m.getAttribute('hexsidelength') || 0), layers: [], tilesets: []
    };
    map.properties = xmlProperties(m);
    map.layers = walkTmxLayers(m, map);
    m.querySelectorAll(':scope > tileset').forEach((t) => {
      const image = t.querySelector(':scope > image');
      map.tilesets.push({
        firstgid: Number(t.getAttribute('firstgid') || 1), name: t.getAttribute('name') || '',
        tilewidth: Number(t.getAttribute('tilewidth') || map.tilewidth), tileheight: Number(t.getAttribute('tileheight') || map.tileheight),
        tilecount: Number(t.getAttribute('tilecount') || 0), columns: Number(t.getAttribute('columns') || 0),
        margin: Number(t.getAttribute('margin') || 0), spacing: Number(t.getAttribute('spacing') || 0),
        image: (image && image.getAttribute('source')) || '', source: t.getAttribute('source') || '',
        tiles: parseTsxTileExtras(t),
        terrains: parseTerrainTypes(t),
        wangSets: parseWangSets(t)
      });
    });
    return map;
  }

  function download(name, type, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function save() {
    if (!state.map) return;
    if (typeof window.__tiledSaveToHandle === 'function' && await window.__tiledSaveToHandle()) return;
    download('tiled-map.tmj', 'application/json', JSON.stringify(state.map, null, 2));
    status('已导出 TMJ'); log('导出：tiled-map.tmj');
  }
  function exportPng() {
    if (!state.map) return;
    const out = document.createElement('canvas'), ctx = out.getContext('2d'), old = state.grid;
    state.grid = false; out.width = els.canvas.width; out.height = els.canvas.height;
    ctx.clearRect(0, 0, out.width, out.height);
    const original = els.canvas; els.canvas = out; draw(); els.canvas = original; state.grid = old; draw();
    out.toBlob((blob) => { if (blob) download('tiled-map.png', 'image/png', blob); });
    status('已导出 PNG'); log('导出：tiled-map.png');
  }
  function xmlEscape(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function propertiesXml(props, indent) {
    const { values, types } = stripPropMeta(props);
    const entries = Object.entries(values);
    if (!entries.length) return '';
    return `${indent}<properties>\n${entries.map(([name, value]) => {
      const type = types[name] || 'string';
      let exportVal = value;
      if (type === 'bool') exportVal = value ? 'true' : 'false';
      return `${indent}  <property name="${xmlEscape(name)}" type="${xmlEscape(type)}" value="${xmlEscape(exportVal)}"/>`;
    }).join('\n')}\n${indent}</properties>\n`;
  }
  function objectXml(o, indent = '    ') {
    const attrs = [`id="${o.id || 1}"`, `name="${xmlEscape(o.name || '')}"`, `type="${xmlEscape(o.type || '')}"`, `x="${o.x || 0}"`, `y="${o.y || 0}"`, `width="${o.width || 0}"`, `height="${o.height || 0}"`];
    if (o.rotation) attrs.push(`rotation="${o.rotation}"`);
    if (o.visible === false) attrs.push('visible="0"');
    if (o.gid) attrs.push(`gid="${o.gid >>> 0}"`);
    let shape = '';
    if (o.ellipse) shape = '<ellipse/>';
    else if (o.point) shape = '<point/>';
    else if (o.polygon) shape = `<polygon points="${o.polygon.map((pt) => `${pt.x},${pt.y}`).join(' ')}"/>`;
    else if (o.polyline) shape = `<polyline points="${o.polyline.map((pt) => `${pt.x},${pt.y}`).join(' ')}"/>`;
    const text = o.text !== undefined ? `<text>${xmlEscape(o.text)}</text>` : '';
    const props = propertiesXml(o.properties, indent + '  ');
    const inner = shape + text + (props ? '\n' + props : '');
    if (!inner) return `${indent}<object ${attrs.join(' ')}/>`;
    return `${indent}<object ${attrs.join(' ')}>${shape}${text}${props ? '\n' + props + indent : ''}</object>`;
  }
  function layerToTmx(l, m, indent = '  ') {
    if (l.type === 'tilelayer') {
      const data = [];
      for (let y = 0; y < m.height; y++) {
        const row = [];
        for (let x = 0; x < m.width; x++) row.push(tileAt(l, x, y, m) >>> 0);
        data.push(row.join(','));
      }
      return `${indent}<layer id="${l.id || 1}" name="${xmlEscape(l.name || '图层')}" width="${m.width}" height="${m.height}"` +
        `${l.opacity != null && l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''}${l.visible === false ? ' visible="0"' : ''}>\n` +
        propertiesXml(l.properties, indent) +
        `${indent}  <data encoding="csv">\n${data.join(',\n')}\n${indent}  </data>\n${indent}</layer>`;
    }
    if (l.type === 'objectgroup') {
      const objects = (l.objects || []).map((o) => objectXml(o, indent + '  ')).join('\n');
      return `${indent}<objectgroup id="${l.id || 1}" name="${xmlEscape(l.name || '对象层')}"${l.visible === false ? ' visible="0"' : ''}>\n` +
        propertiesXml(l.properties, indent) + `${objects}\n${indent}</objectgroup>`;
    }
    if (l.type === 'imagelayer') {
      const src = String(l.image || '').startsWith('data:') ? '' : xmlEscape(l.image || '');
      return `${indent}<imagelayer id="${l.id || 1}" name="${xmlEscape(l.name || '图像层')}"` +
        `${l.offsetx ? ` offsetx="${l.offsetx}"` : ''}${l.offsety ? ` offsety="${l.offsety}"` : ''}${l.visible === false ? ' visible="0"' : ''}>\n` +
        propertiesXml(l.properties, indent) + `${indent}  <image source="${src}"/>\n${indent}</imagelayer>`;
    }
    if (l.type === 'group') {
      const kids = (l.layers || []).map((c) => layerToTmx(c, m, indent + '  ')).join('\n');
      return `${indent}<group id="${l.id || 1}" name="${xmlEscape(l.name || '组层')}"` +
        `${l.opacity != null && l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''}${l.visible === false ? ' visible="0"' : ''}>\n` +
        propertiesXml(l.properties, indent) + `${kids}\n${indent}</group>`;
    }
    return '';
  }
  function toTmx() {
    const m = state.map;
    const attrs = [
      `version="1.2"`, `tiledversion="${xmlEscape(m.tiledversion || '1.2.4')}"`,
      `orientation="${xmlEscape(m.orientation || 'orthogonal')}"`, `renderorder="${xmlEscape(m.renderorder || 'right-down')}"`,
      `width="${m.width}"`, `height="${m.height}"`, `tilewidth="${m.tilewidth}"`, `tileheight="${m.tileheight}"`,
      `infinite="${m.infinite ? 1 : 0}"`
    ];
    if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
      attrs.push(`staggeraxis="${xmlEscape(m.staggeraxis || 'y')}"`);
      attrs.push(`staggerindex="${xmlEscape(m.staggerindex || 'odd')}"`);
      if (m.orientation === 'hexagonal') attrs.push(`hexsidelength="${m.hexsidelength || 0}"`);
    }
    const tilesets = (m.tilesets || []).map((t) => {
      if (t.source) return `  <tileset firstgid="${t.firstgid || 1}" source="${xmlEscape(t.source)}"/>`;
      return `  <tileset firstgid="${t.firstgid || 1}" name="${xmlEscape(t.name || '图块集')}" tilewidth="${t.tilewidth || m.tilewidth}" tileheight="${t.tileheight || m.tileheight}" tilecount="${t.tilecount || 0}" columns="${t.columns || 0}"` +
        `${t.margin ? ` margin="${t.margin}"` : ''}${t.spacing ? ` spacing="${t.spacing}"` : ''}><image source="${xmlEscape(t.image || '')}"/></tileset>`;
    }).join('\n');
    const layers = (m.layers || []).map((l) => layerToTmx(l, m)).filter(Boolean).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<map ${attrs.join(' ')}>\n` + propertiesXml(m.properties, '') + (tilesets ? tilesets + '\n' : '') + layers + '\n</map>\n';
  }
  function saveTmx() {
    if (!state.map) return;
    download('tiled-map.tmx', 'application/xml', toTmx());
    status('已导出 TMX'); log('导出：tiled-map.tmx');
  }
  function saveCsv() {
    const l = activeLayer();
    if (!l || l.type !== 'tilelayer') { status('当前不是瓦片层'); return; }
    const rows = [];
    for (let y = 0; y < state.map.height; y++) {
      const row = [];
      for (let x = 0; x < state.map.width; x++) row.push(tileAt(l, x, y, state.map) >>> 0);
      rows.push(row.join(','));
    }
    download(`${(l.name || 'layer').replace(/[^\w\u4e00-\u9fff-]+/g, '_')}.csv`, 'text/csv;charset=utf-8', rows.join('\n'));
    status('已导出 CSV'); log('导出当前瓦片层 CSV');
  }

  const TOOL_MODE_KEY = 'tiled-web-tool-mode';
  const TILE_TOOLS = new Set(['select', 'pencil', 'eraser', 'bucket', 'tile-select', 'terrain', 'wang']);
  const OBJECT_ONLY_TOOLS = new Set(['rect', 'ellipse', 'polyline', 'point', 'text', 'polygon', 'tile-object']);

  function currentToolMode() {
    const active = document.querySelector('[data-tool-mode].active');
    return active ? active.dataset.toolMode : 'tile';
  }

  function syncToolActive(toolName) {
    document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('active', x.dataset.tool === toolName));
    document.querySelectorAll('.tb-menu').forEach((menu) => {
      const hasActive = !!menu.querySelector('[data-tool].active');
      menu.classList.toggle('has-active-tool', hasActive);
    });
  }

  function setToolMode(mode, opts = {}) {
    mode = mode === 'object' ? 'object' : 'tile';
    document.querySelectorAll('[data-tool-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.toolMode === mode);
    });
    document.querySelectorAll('[data-tool-group]').forEach((g) => {
      g.hidden = g.dataset.toolGroup !== mode;
    });
    try { localStorage.setItem(TOOL_MODE_KEY, mode); } catch (_) {}
    if (!opts.keepTool) {
      if (mode === 'tile' && OBJECT_ONLY_TOOLS.has(state.tool)) {
        state.tool = 'pencil';
        syncToolActive('pencil');
        status('工具：铅笔');
      } else if (mode === 'object' && TILE_TOOLS.has(state.tool) && state.tool !== 'select') {
        state.tool = 'select';
        syncToolActive('select');
        status('工具：选择');
      } else {
        syncToolActive(state.tool);
      }
    } else {
      syncToolActive(state.tool);
    }
  }

  function applyZoomPercent(pct) {
    const v = Math.max(25, Math.min(400, Math.round(pct)));
    els.zoom.value = String(v);
    els.zoom.dispatchEvent(new Event('input'));
  }

  function closeToolbarMenus(except) {
    document.querySelectorAll('.tb-menu.open').forEach((menu) => {
      if (except && menu === except) return;
      menu.classList.remove('open');
      const btn = menu.querySelector('.tb-menu-btn');
      const panel = menu.querySelector('.tb-menu-panel');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
    });
  }

  function bindToolbarMenus() {
    document.querySelectorAll('.tb-menu').forEach((menu) => {
      const btn = menu.querySelector('.tb-menu-btn');
      const panel = menu.querySelector('.tb-menu-panel');
      if (!btn || !panel) return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !menu.classList.contains('open');
        closeToolbarMenus();
        if (willOpen) {
          menu.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          panel.hidden = false;
          // Flip panel if it would overflow the right edge
          panel.classList.remove('tb-menu-panel-end');
          const rect = panel.getBoundingClientRect();
          if (rect.right > window.innerWidth - 8) panel.classList.add('tb-menu-panel-end');
        }
      });
      panel.addEventListener('click', (e) => {
        if (e.target.closest('[data-action],[data-tool]')) closeToolbarMenus();
      });
    });
    document.addEventListener('click', () => closeToolbarMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeToolbarMenus();
    });
  }

  function bind() {
    document.querySelectorAll('[data-action]').forEach((b) => b.onclick = () => {
      const a = b.dataset.action;
      if (a === 'new') { tilesetRegistry.length = 0; state.tileset = null; setMap(blankMap()); }
      else if (a === 'open') els.mapInput.click();
      else if (a === 'save') save();
      else if (a === 'save-tmx') saveTmx();
      else if (a === 'save-csv') saveCsv();
      else if (a === 'export-png') exportPng();
      else if (a === 'undo') undo();
      else if (a === 'redo') redo();
      else if (a === 'grid') { state.grid = !state.grid; draw(); }
      else if (a === 'collision') { state.showCollision = !state.showCollision; status('图块碰撞：' + (state.showCollision ? '开' : '关')); draw(); }
      else if (a === 'add-layer') addLayer('tilelayer');
      else if (a === 'add-object-layer') addLayer('objectgroup');
      else if (a === 'add-group-layer') addLayer('group');
      else if (a === 'move-layer-up') moveLayer(1);
      else if (a === 'move-layer-down') moveLayer(-1);
      else if (a === 'remove-layer') removeLayer();
      else if (a === 'add-tileset') els.tilesetInput.click();
      else if (a === 'clear-log') els.console.textContent = '';
      else if (a === 'zoom-in') applyZoomPercent(Number(els.zoom.value) + 10);
      else if (a === 'zoom-out') applyZoomPercent(Number(els.zoom.value) - 10);
      else if (a === 'zoom-reset') applyZoomPercent(100);
    });
    document.querySelectorAll('[data-tool-mode]').forEach((b) => {
      b.onclick = () => setToolMode(b.dataset.toolMode);
    });
    document.querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => {
      const tool = b.dataset.tool;
      state.tool = tool;
      if (OBJECT_ONLY_TOOLS.has(tool)) setToolMode('object', { keepTool: true });
      else if (tool === 'terrain' || tool === 'wang' || tool === 'pencil' || tool === 'eraser' || tool === 'bucket' || tool === 'tile-select') {
        setToolMode('tile', { keepTool: true });
      } else {
        syncToolActive(tool);
      }
      status(`工具：${b.title || tool}`);
    });
    try {
      const savedMode = localStorage.getItem(TOOL_MODE_KEY);
      if (savedMode === 'object' || savedMode === 'tile') setToolMode(savedMode, { keepTool: true });
      else setToolMode('tile', { keepTool: true });
    } catch (_) {
      setToolMode('tile', { keepTool: true });
    }
    bindToolbarMenus();
    els.mapInput.onchange = () => els.mapInput.files[0] && openFile(els.mapInput.files[0], els.mapInput.files);
    els.tilesetInput.onchange = () => loadTiles(els.tilesetInput.files).catch((err) => { status('载入失败'); log(err.message); });
    $('#layerOpacity').oninput = (e) => {
      const l = activeLayer(); if (!l) return;
      l.opacity = Number(e.target.value) / 100;
      $('#layerOpacityValue').textContent = `${e.target.value}%`;
      draw();
    };
    $('#layerProperties').onchange = (e) => {
      const l = activeLayer(); if (!l) return;
      try { snapshot(); l.properties = JSON.parse(e.target.value || '{}'); renderLayerOpacity(); }
      catch { status('图层属性 JSON 无效'); }
    };
    $('#tileProperties').onchange = (e) => {
      if (!state.tileset) return;
      try {
        if (!state.tileset.tiles) state.tileset.tiles = {};
        const item = state.tileset.tiles[state.tile] || (state.tileset.tiles[state.tile] = {});
        snapshot(); item.properties = JSON.parse(e.target.value || '{}'); renderTileset();
      } catch { status('图块属性 JSON 无效'); }
    };
    $('#mapProperties').onchange = (e) => {
      if (!state.map) return;
      try { snapshot(); state.map.properties = JSON.parse(e.target.value || '{}'); renderMapFields(); }
      catch { status('地图属性 JSON 无效'); }
    };
    ['mapWidth', 'mapHeight', 'tileWidth', 'tileHeight', 'orientation', 'hexsidelength'].forEach((id) => {
      $('#' + id).onchange = () => {
        if (!state.map) return;
        snapshot();
        if (id === 'orientation') state.map.orientation = $('#' + id).value;
        else if (id === 'hexsidelength') state.map.hexsidelength = Number($('#' + id).value) || 0;
        else state.map[{ mapWidth: 'width', mapHeight: 'height', tileWidth: 'tilewidth', tileHeight: 'tileheight' }[id]] = Number($('#' + id).value) || 1;
        if (id === 'mapWidth' || id === 'mapHeight') {
          const visit = (layers) => {
            for (const l of layers || []) {
              if (l.type === 'tilelayer' && !l.chunks) {
                const oldW = l.width || state.map.width, oldH = l.height || state.map.height;
                const old = (l.data || []).slice();
                const next = Array(state.map.width * state.map.height).fill(0);
                for (let y = 0; y < Math.min(oldH, state.map.height); y++) {
                  for (let x = 0; x < Math.min(oldW, state.map.width); x++) next[y * state.map.width + x] = old[y * oldW + x] || 0;
                }
                l.width = state.map.width; l.height = state.map.height; l.data = next;
              }
              if (l.type === 'group') visit(l.layers);
            }
          };
          visit(state.map.layers);
        }
        renderAll();
      };
    });
    els.zoom.oninput = () => {
      state.zoom = Number(els.zoom.value) / 100;
      els.zoomValue.textContent = els.zoom.value + '%';
      resizeCanvas(); draw();
    };
    els.canvas.addEventListener('pointerdown', pointerDown);
    els.canvas.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    els.wrap.addEventListener('dragover', (e) => { e.preventDefault(); els.wrap.classList.add('dragover'); });
    els.wrap.addEventListener('dragleave', () => els.wrap.classList.remove('dragover'));
    els.wrap.addEventListener('drop', (e) => {
      e.preventDefault(); els.wrap.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files[0]) openFile(files[0], files);
    });
    window.addEventListener('keydown', (e) => {
      const typing = /input|textarea/i.test(e.target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedObject && !typing) {
        snapshot();
        const l = activeLayer();
        if (l && l.objects) { l.objects = l.objects.filter((o) => o !== state.selectedObject); state.selectedObject = null; renderAll(); }
      }
      if (e.ctrlKey && /[1-9]/.test(e.key)) {
        const slot = Number(e.key);
        if (state.stampData) {
          state.quickStamps[slot] = { data: state.stampData.slice(), selection: { ...state.tileSelection } };
          status('已保存印章 ' + slot);
        }
      } else if (!e.ctrlKey && !e.metaKey && /[1-9]/.test(e.key) && state.quickStamps[Number(e.key)] && !typing) {
        const slot = Number(e.key);
        state.stampData = state.quickStamps[slot].data.slice();
        state.tileSelection = { ...state.quickStamps[slot].selection };
        status('已召回印章 ' + slot);
      }
      if ((e.key === '+' || e.key === '=') && !e.metaKey && !e.ctrlKey) {
        const v = Math.min(400, Number(els.zoom.value) + 10); els.zoom.value = v; els.zoom.dispatchEvent(new Event('input'));
      }
      if ((e.key === '-' || e.key === '_') && !e.metaKey && !e.ctrlKey) {
        const v = Math.max(25, Number(els.zoom.value) - 10); els.zoom.value = v; els.zoom.dispatchEvent(new Event('input'));
      }
      if (e.key === '0' && !typing) { els.zoom.value = 100; els.zoom.dispatchEvent(new Event('input')); }
      if ((e.key === 'x' || e.key === 'X') && !typing) {
        state.stampTransform.flipX = !state.stampTransform.flipX;
        status(`图块印章：水平翻转 ${state.stampTransform.flipX ? '开' : '关'}`); renderTileset();
      }
      if ((e.key === 'y' || e.key === 'Y') && !typing) {
        state.stampTransform.flipY = !state.stampTransform.flipY;
        status(`图块印章：垂直翻转 ${state.stampTransform.flipY ? '开' : '关'}`); renderTileset();
      }
      if ((e.key === 'z' || e.key === 'Z') && !e.metaKey && !e.ctrlKey && !typing) {
        state.stampTransform.rotate = (state.stampTransform.rotate + 90) % 360;
        status(`图块印章：旋转 ${state.stampTransform.rotate}°`); renderTileset();
      }
      if (e.key === 'b' && !typing) {
        setToolMode('tile', { keepTool: true });
        const btn = document.querySelector('[data-tool-group="tile"] [data-tool="pencil"]') || document.querySelector('[data-tool="pencil"]');
        if (btn) btn.click();
      }
      if (e.key === 'e' && !typing) {
        setToolMode('tile', { keepTool: true });
        const btn = document.querySelector('[data-tool-group="tile"] [data-tool="eraser"]') || document.querySelector('[data-tool="eraser"]');
        if (btn) btn.click();
      }
    });
  }

  document.addEventListener('change', (e) => {
    if (e.target.id !== 'tileCollision' || !state.tileset) return;
    try {
      if (!state.tileset.tiles) state.tileset.tiles = {};
      const item = state.tileset.tiles[state.tile] || (state.tileset.tiles[state.tile] = {});
      snapshot();
      item.objectgroup = JSON.parse(e.target.value || '{"objects":[]}');
      renderTileProperties();
    } catch { status('碰撞对象 JSON 无效'); }
  });

  window.__tiledWeb = {
    decodeGids, clearGid, gidInfo, composeGid, inflateBytes, gidsFromBytes, bytesFromBase64,
    parseTmxAdvanced, toTmx, tileAt, setTileAt, activeLayer, snapshot, renderAll, draw, log, status,
    tilesetForGid, registerTileset, nextFirstGid, mapToScreen, screenToMap, resizeCanvas,
    parseTerrainTypes, parseTileTerrainAttr, parseWangSets, xmlEscape, propertiesXml, objectXml, download, stripPropMeta, xmlProperties,
    openFile, loadTiles, attachMapTileset, attachMapImages, readImage, save, saveTmx, saveCsv, exportPng,
    beginPaintStroke, endPaintStroke, snapWorldPixel,
    setToolMode, syncToolActive, applyZoomPercent,
    getState: () => state,
    getEls: () => els,
    getTilesetRegistry: () => tilesetRegistry,
    getImageCache: () => imageCache,
    setMap, clone, paintAt, bucket, FLIP_H, FLIP_V, FLIP_D, GID_MASK
  };
  window.TiledApp = window.__tiledWeb;

  bind();
  setMap(blankMap());
  log('Tiled 网页版就绪');
  if (typeof window.initTiledFeatures === 'function') window.initTiledFeatures(window.TiledApp);
})();

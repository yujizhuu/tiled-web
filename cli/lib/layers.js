'use strict';

const { walkLayers, ensureLayerData, setTileAt, tileAt, firstTileLayer, layerBounds } = require('./util');

function listLayers(map) {
  const out = [];
  walkLayers(map.layers, (layer, path) => {
    const rec = {
      indexPath: path,
      topIndex: path.length === 1 ? path[0] : null,
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible !== false,
      opacity: layer.opacity != null ? layer.opacity : 1,
    };
    if (layer.type === 'tilelayer') {
      rec.width = layer.width || map.width;
      rec.height = layer.height || map.height;
      rec.hasChunks = !!(layer.chunks && layer.chunks.length);
      if (rec.hasChunks) {
        const b = layerBounds(layer, map);
        rec.chunkBounds = b;
        rec.chunkCount = layer.chunks.length;
      }
    }
    if (layer.type === 'objectgroup') {
      rec.objectCount = (layer.objects || []).length;
    }
    if (layer.type === 'group') {
      rec.childCount = (layer.layers || []).length;
    }
    out.push(rec);
  });
  return out;
}

function nextLayerId(map) {
  let max = 0;
  if (map.nextlayerid != null) max = Math.max(max, Number(map.nextlayerid) - 1);
  walkLayers(map.layers, (layer) => {
    if (layer.id != null) max = Math.max(max, Number(layer.id) || 0);
  });
  return max + 1;
}

function addTileLayer(map, { name = 'Layer', width, height } = {}) {
  if (!Array.isArray(map.layers)) map.layers = [];
  const w = width != null ? Number(width) : map.width;
  const h = height != null ? Number(height) : map.height;
  if (!Number.isInteger(w) || w < 1 || !Number.isInteger(h) || h < 1) {
    throw new Error('layer add: width/height must be positive integers');
  }
  const id = nextLayerId(map);
  const layer = {
    id,
    name: String(name || `Layer ${id}`),
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: w,
    height: h,
    opacity: 1,
    visible: true,
  };
  if (map.infinite) {
    layer.chunks = [];
  } else {
    layer.data = Array(w * h).fill(0);
  }
  // unique name nudge
  const names = new Set();
  walkLayers(map.layers, (l) => names.add(l.name));
  if (names.has(layer.name)) {
    let n = 2;
    while (names.has(`${layer.name} ${n}`)) n += 1;
    layer.name = `${layer.name} ${n}`;
  }
  map.layers.push(layer);
  map.nextlayerid = id + 1;
  return layer;
}

/**
 * Remove a top-level layer by name or index. Object layers can be removed if targeted.
 * Does not descend into groups for remove by index; name match is depth-first and
 * removes from the parent array that owns it.
 */
function removeLayer(map, layerSpec) {
  if (layerSpec == null || layerSpec === '' || layerSpec === true) {
    throw new Error('layer remove requires --layer <name|index>');
  }
  const spec = String(layerSpec);
  if (/^\d+$/.test(spec)) {
    const idx = Number(spec);
    if (idx < 0 || idx >= (map.layers || []).length) {
      throw new Error(`Layer index out of range: ${idx}`);
    }
    const [removed] = map.layers.splice(idx, 1);
    return removed;
  }
  let removed = null;
  const tryRemove = (list) => {
    if (!list || removed) return false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].name === spec) {
        removed = list.splice(i, 1)[0];
        return true;
      }
      if (list[i].type === 'group' && list[i].layers) {
        if (tryRemove(list[i].layers)) return true;
      }
    }
    return false;
  };
  if (!tryRemove(map.layers)) throw new Error(`Layer not found: ${spec}`);
  return removed;
}

function renameLayer(map, layerSpec, newName) {
  if (!newName || newName === true) throw new Error('layer rename requires --name <newName>');
  const { resolveLayer } = require('./util');
  const layer = resolveLayer(map, layerSpec, { tileOnly: false, required: true });
  const old = layer.name;
  layer.name = String(newName);
  return { layer, oldName: old, newName: layer.name };
}

function fillRect(map, layer, { x, y, width, height, gid }) {
  ensureLayerData(layer, map);
  if (!Number.isInteger(x) || !Number.isInteger(y) || width < 1 || height < 1) {
    throw new Error(`Invalid fill rect: x=${x} y=${y} w=${width} h=${height}`);
  }
  if (!map.infinite) {
    const lw = layer.width || map.width;
    const lh = layer.height || map.height;
    if (x < 0 || y < 0 || x + width > lw || y + height > lh) {
      throw new Error(
        `Fill rect (${x},${y},${width},${height}) exceeds layer ${lw}x${lh}`
      );
    }
  }
  let count = 0;
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      setTileAt(layer, xx, yy, gid, map);
      count += 1;
    }
  }
  return { count, x, y, width, height, gid: gid >>> 0 };
}

function getLayerGids(map, layer) {
  ensureLayerData(layer, map);
  if (map.infinite || (layer.chunks && layer.chunks.length)) {
    const b = layerBounds(layer, map);
    if (!Number.isFinite(b.x)) {
      return {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        data: [],
        name: layer.name,
        id: layer.id,
        infinite: true,
        chunks: layer.chunks || [],
      };
    }
    const data = [];
    for (let y = b.y; y < b.y + b.height; y++) {
      for (let x = b.x; x < b.x + b.width; x++) {
        data.push(tileAt(layer, x, y, map) >>> 0);
      }
    }
    return {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      data,
      name: layer.name,
      id: layer.id,
      infinite: !!map.infinite,
      chunkCount: (layer.chunks || []).length,
    };
  }
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  const data = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.push(tileAt(layer, x, y, map) >>> 0);
  }
  return { width: w, height: h, x: 0, y: 0, data, name: layer.name, id: layer.id };
}

function formatLayerCsv(gids) {
  const rows = [];
  for (let y = 0; y < gids.height; y++) {
    const row = [];
    for (let x = 0; x < gids.width; x++) row.push(gids.data[y * gids.width + x]);
    rows.push(row.join(','));
  }
  return rows.join('\n') + (gids.height ? '\n' : '');
}

module.exports = {
  listLayers,
  addTileLayer,
  removeLayer,
  renameLayer,
  fillRect,
  getLayerGids,
  formatLayerCsv,
  nextLayerId,
  firstTileLayer,
};

'use strict';

const fs = require('fs');
const path = require('path');

function die(msg, code = 1) {
  process.stderr.write(String(msg).endsWith('\n') ? String(msg) : String(msg) + '\n');
  process.exit(code);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file: ${filePath} (${err.message})`);
  }
}

function writeText(filePath, text) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function extOf(filePath) {
  return path.extname(filePath).toLowerCase();
}

function xmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * First tile layer in depth-first order (groups included).
 */
function firstTileLayer(layers) {
  for (const layer of layers || []) {
    if (layer.type === 'tilelayer') return layer;
    if (layer.type === 'group' && layer.layers) {
      const found = firstTileLayer(layer.layers);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Walk layers depth-first; callback(layer, pathIndices, parentLayersArray).
 */
function walkLayers(layers, cb, path = [], parent = null) {
  const list = layers || [];
  list.forEach((layer, i) => {
    const p = path.concat(i);
    cb(layer, p, list);
    if (layer.type === 'group' && layer.layers) walkLayers(layer.layers, cb, p, layer);
  });
}

function ensureLayerData(layer, map) {
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  layer.width = w;
  layer.height = h;
  if (layer.chunks && layer.chunks.length) {
    throw new Error(`Layer "${layer.name}" uses infinite chunks; Phase 2 CLI writes finite data only`);
  }
  if (!Array.isArray(layer.data) || layer.data.length !== w * h) {
    const old = Array.isArray(layer.data) ? layer.data : [];
    const next = Array(w * h).fill(0);
    for (let i = 0; i < Math.min(old.length, next.length); i++) next[i] = (old[i] >>> 0) || 0;
    layer.data = next;
  }
  return layer;
}

function tileAt(layer, x, y, map) {
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  if (layer.chunks && layer.chunks.length) {
    for (const c of layer.chunks) {
      if (x >= c.x && y >= c.y && x < c.x + c.width && y < c.y + c.height) {
        const lx = x - c.x;
        const ly = y - c.y;
        return (c.data[ly * c.width + lx] >>> 0) || 0;
      }
    }
    return 0;
  }
  if (!layer.data) return 0;
  return (layer.data[y * w + x] >>> 0) || 0;
}

function setTileAt(layer, x, y, gid, map) {
  ensureLayerData(layer, map);
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) {
    throw new Error(`Tile coordinates out of range: (${x},${y}) for ${w}x${h} layer "${layer.name}"`);
  }
  const g = Number(gid);
  if (!Number.isFinite(g) || g < 0 || !Number.isInteger(g)) {
    throw new Error(`gid must be a non-negative integer, got: ${gid}`);
  }
  layer.data[y * w + x] = g >>> 0;
  return layer.data[y * w + x];
}

/**
 * Resolve a layer from --layer (name or top-level index). If omitted and tileOnly,
 * returns first tile layer.
 */
function resolveLayer(map, layerSpec, { tileOnly = false, required = true } = {}) {
  const layers = map.layers || [];
  if (layerSpec == null || layerSpec === '' || layerSpec === true) {
    if (tileOnly) {
      const first = firstTileLayer(layers);
      if (!first && required) throw new Error('No tile layer found (add one with: layer add)');
      return first;
    }
    if (required) throw new Error('Missing --layer <name|index>');
    return null;
  }
  const spec = String(layerSpec);
  if (/^\d+$/.test(spec)) {
    const idx = Number(spec);
    if (idx < 0 || idx >= layers.length) {
      throw new Error(`Layer index out of range: ${idx} (have ${layers.length} top-level layers)`);
    }
    const layer = layers[idx];
    if (tileOnly && layer.type !== 'tilelayer') {
      throw new Error(`Layer index ${idx} is type "${layer.type}", expected tilelayer`);
    }
    return layer;
  }
  let found = null;
  walkLayers(layers, (layer) => {
    if (found) return;
    if (layer.name === spec) {
      if (tileOnly && layer.type !== 'tilelayer') {
        throw new Error(`Layer "${spec}" is type "${layer.type}", expected tilelayer`);
      }
      found = layer;
    }
  });
  if (!found) {
    if (required) throw new Error(`Layer not found: ${spec}`);
    return null;
  }
  return found;
}

function parseIntFlag(v, name, { min = null, allowZero = false } = {}) {
  if (v == null || v === true || v === '') {
    throw new Error(`Missing --${name}`);
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got: ${v}`);
  if (allowZero) {
    if (min != null && n < min) throw new Error(`${name} must be >= ${min}, got: ${v}`);
  } else if (min != null) {
    if (n < min) throw new Error(`${name} must be >= ${min}, got: ${v}`);
  }
  return n;
}

module.exports = {
  die,
  readText,
  writeText,
  extOf,
  xmlEscape,
  firstTileLayer,
  walkLayers,
  tileAt,
  setTileAt,
  ensureLayerData,
  resolveLayer,
  parseIntFlag,
};

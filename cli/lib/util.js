'use strict';

const fs = require('fs');
const path = require('path');

/** Tiled default chunk size for infinite maps */
const CHUNK_SIZE = 16;

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

function isChunkedLayer(layer, map) {
  return !!(map && map.infinite) || !!(layer && Array.isArray(layer.chunks));
}

/**
 * Ensure layer storage is ready for writes.
 * Finite maps: dense layer.data array.
 * Infinite maps: layer.chunks[] (promotes from data if needed).
 */
function ensureLayerData(layer, map) {
  if (map && map.infinite) {
    if (!Array.isArray(layer.chunks)) {
      const chunks = [];
      const w = layer.width || map.width || 0;
      const h = layer.height || map.height || 0;
      if (Array.isArray(layer.data) && w > 0 && h > 0) {
        for (let cy = 0; cy < h; cy += CHUNK_SIZE) {
          for (let cx = 0; cx < w; cx += CHUNK_SIZE) {
            const cw = Math.min(CHUNK_SIZE, w - cx);
            const ch = Math.min(CHUNK_SIZE, h - cy);
            const data = Array(cw * ch).fill(0);
            let any = false;
            for (let yy = 0; yy < ch; yy++) {
              for (let xx = 0; xx < cw; xx++) {
                const g = (layer.data[(cy + yy) * w + (cx + xx)] >>> 0) || 0;
                data[yy * cw + xx] = g;
                if (g) any = true;
              }
            }
            if (any) chunks.push({ x: cx, y: cy, width: cw, height: ch, data });
          }
        }
      }
      layer.chunks = chunks;
      delete layer.data;
    }
    if (layer.width == null) layer.width = map.width;
    if (layer.height == null) layer.height = map.height;
    return layer;
  }

  // Finite map
  if (layer.chunks && layer.chunks.length) {
    // Readable via tileAt/setTileAt chunk path; keep as-is for load-only roundtrips
    return layer;
  }
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  layer.width = w;
  layer.height = h;
  if (!Array.isArray(layer.data) || layer.data.length !== w * h) {
    const old = Array.isArray(layer.data) ? layer.data : [];
    const next = Array(w * h).fill(0);
    for (let i = 0; i < Math.min(old.length, next.length); i++) next[i] = (old[i] >>> 0) || 0;
    layer.data = next;
  }
  return layer;
}

function findChunk(layer, x, y) {
  if (!layer.chunks) return null;
  for (const c of layer.chunks) {
    if (x >= c.x && y >= c.y && x < c.x + c.width && y < c.y + c.height) return c;
  }
  return null;
}

function tileAt(layer, x, y, map) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 0;
  if (isChunkedLayer(layer, map) && Array.isArray(layer.chunks)) {
    const c = findChunk(layer, x, y);
    if (!c) return 0;
    const lx = x - c.x;
    const ly = y - c.y;
    return (c.data[ly * c.width + lx] >>> 0) || 0;
  }
  if (map && map.infinite) return 0;
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  if (!layer.data) return 0;
  return (layer.data[y * w + x] >>> 0) || 0;
}

function setTileAt(layer, x, y, gid, map) {
  const g = Number(gid);
  if (!Number.isFinite(g) || g < 0 || !Number.isInteger(g)) {
    throw new Error(`gid must be a non-negative integer, got: ${gid}`);
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error(`Tile coordinates must be integers, got: (${x},${y})`);
  }

  if (map && map.infinite) {
    ensureLayerData(layer, map);
    let chunk = findChunk(layer, x, y);
    if (!chunk) {
      if (!(g >>> 0)) return 0; // don't create chunk to erase empty
      const cx = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
      const cy = Math.floor(y / CHUNK_SIZE) * CHUNK_SIZE;
      chunk = {
        x: cx,
        y: cy,
        width: CHUNK_SIZE,
        height: CHUNK_SIZE,
        data: Array(CHUNK_SIZE * CHUNK_SIZE).fill(0),
      };
      layer.chunks.push(chunk);
    }
    chunk.data[(y - chunk.y) * chunk.width + (x - chunk.x)] = g >>> 0;
    return g >>> 0;
  }

  // Finite: also support layers that already have chunks (rare)
  if (layer.chunks && layer.chunks.length) {
    let chunk = findChunk(layer, x, y);
    const w = layer.width || map.width;
    const h = layer.height || map.height;
    if (x < 0 || y < 0 || x >= w || y >= h) {
      throw new Error(`Tile coordinates out of range: (${x},${y}) for ${w}x${h} layer "${layer.name}"`);
    }
    if (!chunk) {
      if (!(g >>> 0)) return 0;
      const cx = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
      const cy = Math.floor(y / CHUNK_SIZE) * CHUNK_SIZE;
      const cw = Math.min(CHUNK_SIZE, w - cx);
      const ch = Math.min(CHUNK_SIZE, h - cy);
      chunk = { x: cx, y: cy, width: cw, height: ch, data: Array(cw * ch).fill(0) };
      layer.chunks.push(chunk);
    }
    chunk.data[(y - chunk.y) * chunk.width + (x - chunk.x)] = g >>> 0;
    return g >>> 0;
  }

  ensureLayerData(layer, map);
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  if (x < 0 || y < 0 || x >= w || y >= h) {
    throw new Error(`Tile coordinates out of range: (${x},${y}) for ${w}x${h} layer "${layer.name}"`);
  }
  layer.data[y * w + x] = g >>> 0;
  return layer.data[y * w + x];
}

/**
 * Bounding box of written tiles for a layer (infinite: union of chunks; finite: 0,0,w,h).
 */
function layerBounds(layer, map) {
  if (layer.chunks && layer.chunks.length) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of layer.chunks) {
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.width - 1);
      maxY = Math.max(maxY, c.y + c.height - 1);
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }
  const w = layer.width || map.width;
  const h = layer.height || map.height;
  return { x: 0, y: 0, width: w, height: h };
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

function parseIntFlag(v, name, { min = null, allowZero = false, allowNegative = false } = {}) {
  if (v == null || v === true || v === '') {
    throw new Error(`Missing --${name}`);
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got: ${v}`);
  if (allowNegative) {
    if (min != null && n < min) throw new Error(`${name} must be >= ${min}, got: ${v}`);
  } else if (allowZero) {
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
  CHUNK_SIZE,
  isChunkedLayer,
  layerBounds,
  findChunk,
};

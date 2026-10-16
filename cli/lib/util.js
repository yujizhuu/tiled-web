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
 * Walk layers depth-first; callback(layer, pathIndices).
 */
function walkLayers(layers, cb, path = []) {
  (layers || []).forEach((layer, i) => {
    const p = path.concat(i);
    cb(layer, p);
    if (layer.type === 'group' && layer.layers) walkLayers(layer.layers, cb, p);
  });
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

module.exports = {
  die,
  readText,
  writeText,
  extOf,
  xmlEscape,
  firstTileLayer,
  walkLayers,
  tileAt,
};

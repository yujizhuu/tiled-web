'use strict';

/**
 * Stamp copy/paste — capture a rectangle of GIDs and paste elsewhere.
 * Flip bits in GIDs are preserved as stored.
 */

const path = require('path');
const { tileAt, setTileAt, resolveLayer, parseIntFlag, readText, writeText, layerBounds } = require('./util');

function copyStamp(map, { layer: layerSpec, x, y, width, height } = {}) {
  const layer = resolveLayer(map, layerSpec, { tileOnly: true, required: true });
  const sx = parseIntFlag(x, 'x', {
    min: map.infinite ? null : 0,
    allowZero: true,
    allowNegative: !!map.infinite,
  });
  const sy = parseIntFlag(y, 'y', {
    min: map.infinite ? null : 0,
    allowZero: true,
    allowNegative: !!map.infinite,
  });
  const w = parseIntFlag(width, 'width', { min: 1 });
  const h = parseIntFlag(height, 'height', { min: 1 });

  if (!map.infinite) {
    const lw = layer.width || map.width;
    const lh = layer.height || map.height;
    if (sx < 0 || sy < 0 || sx + w > lw || sy + h > lh) {
      throw new Error(
        `Stamp rect (${sx},${sy},${w},${h}) exceeds layer ${lw}x${lh}`
      );
    }
  }

  const data = [];
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      data.push(tileAt(layer, sx + col, sy + row, map) >>> 0);
    }
  }
  return {
    version: 1,
    type: 'tiled-web-stamp',
    width: w,
    height: h,
    source: {
      layer: layer.name,
      x: sx,
      y: sy,
    },
    data,
  };
}

function writeStampFile(stamp, outPath) {
  const body = JSON.stringify(stamp, null, 2) + '\n';
  writeText(outPath, body);
  return { path: path.resolve(outPath), bytes: Buffer.byteLength(body, 'utf8'), width: stamp.width, height: stamp.height };
}

function loadStamp(filePath) {
  const text = readText(filePath);
  let stamp;
  try {
    stamp = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid stamp JSON: ${filePath} (${err.message})`);
  }
  if (!stamp || typeof stamp !== 'object') throw new Error(`Stamp root must be an object: ${filePath}`);
  const w = Number(stamp.width);
  const h = Number(stamp.height);
  if (!Number.isInteger(w) || w < 1 || !Number.isInteger(h) || h < 1) {
    throw new Error(`Stamp missing valid width/height: ${filePath}`);
  }
  if (!Array.isArray(stamp.data) || stamp.data.length !== w * h) {
    throw new Error(`Stamp data length must be width*height (${w * h}), got ${stamp.data ? stamp.data.length : 0}`);
  }
  return stamp;
}

/**
 * Paste stamp at (x,y). Finite maps clip to layer bounds; infinite writes all cells.
 * Returns counts of written / clipped / skipped-empty.
 */
function pasteStamp(map, { layer: layerSpec, x, y, stamp } = {}) {
  const layer = resolveLayer(map, layerSpec, { tileOnly: true, required: true });
  const sx = Number(x);
  const sy = Number(y);
  if (!Number.isInteger(sx) || !Number.isInteger(sy)) {
    throw new Error(`stamp paste requires integer --x and --y, got: (${x},${y})`);
  }
  if (!stamp || !Array.isArray(stamp.data)) throw new Error('stamp paste requires a loaded stamp');
  const w = stamp.width;
  const h = stamp.height;
  const lw = layer.width || map.width;
  const lh = layer.height || map.height;
  let written = 0;
  let clipped = 0;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const tx = sx + col;
      const ty = sy + row;
      const gid = stamp.data[row * w + col] >>> 0;
      if (!map.infinite) {
        if (tx < 0 || ty < 0 || tx >= lw || ty >= lh) {
          clipped += 1;
          continue;
        }
      }
      setTileAt(layer, tx, ty, gid, map);
      written += 1;
    }
  }
  return {
    layer: { id: layer.id, name: layer.name },
    x: sx,
    y: sy,
    width: w,
    height: h,
    written,
    clipped,
  };
}

module.exports = {
  copyStamp,
  pasteStamp,
  loadStamp,
  writeStampFile,
};

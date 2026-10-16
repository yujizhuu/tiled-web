'use strict';

const path = require('path');
const { writeText, firstTileLayer, tileAt } = require('./util');
const { toTmx } = require('./tmx');

function exportTmj(map) {
  return JSON.stringify(map, null, 2) + '\n';
}

function exportCsv(map, layer) {
  const l = layer || firstTileLayer(map.layers);
  if (!l || l.type !== 'tilelayer') {
    throw new Error('CSV export needs a tile layer (none found)');
  }
  const rows = [];
  for (let y = 0; y < map.height; y++) {
    const row = [];
    for (let x = 0; x < map.width; x++) row.push(tileAt(l, x, y, map) >>> 0);
    rows.push(row.join(','));
  }
  return rows.join('\n') + '\n';
}

/**
 * Export map to format and write to outPath.
 * @param {object} map
 * @param {'tmj'|'tmx'|'csv'} format
 * @param {string} outPath
 */
function exportMap(map, format, outPath) {
  const fmt = String(format || '').toLowerCase();
  let body;
  if (fmt === 'tmj' || fmt === 'json') body = exportTmj(map);
  else if (fmt === 'tmx') body = toTmx(map);
  else if (fmt === 'csv') body = exportCsv(map);
  else throw new Error(`Unknown export format: ${format} (use tmj|tmx|csv)`);

  writeText(outPath, body);
  return { format: fmt === 'json' ? 'tmj' : fmt, path: path.resolve(outPath), bytes: Buffer.byteLength(body, 'utf8') };
}

module.exports = { exportMap, exportTmj, exportCsv };

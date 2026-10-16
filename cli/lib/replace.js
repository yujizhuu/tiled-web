'use strict';

/**
 * Batch GID replace — terrain-ish helper for agents.
 * Replaces raw stored GIDs (including flip bits) matching --from with --to.
 * Optional --layer; omit = all tile layers.
 * Works on infinite/chunked layers via setTileAt.
 */

const { walkLayers, ensureLayerData, tileAt, setTileAt, layerBounds } = require('./util');
const { decodeGid } = require('./gid');

function replaceGid(map, { from, to, layer: layerSpec, matchFlips = false } = {}) {
  const fromGid = Number(from);
  const toGid = Number(to);
  if (!Number.isInteger(fromGid) || fromGid < 0) throw new Error(`--from must be a non-negative integer, got: ${from}`);
  if (!Number.isInteger(toGid) || toGid < 0) throw new Error(`--to must be a non-negative integer, got: ${to}`);

  const fromDecoded = decodeGid(fromGid);
  const targets = [];
  if (layerSpec != null && layerSpec !== '' && layerSpec !== true) {
    const { resolveLayer } = require('./util');
    const layer = resolveLayer(map, layerSpec, { tileOnly: true, required: true });
    targets.push(layer);
  } else {
    walkLayers(map.layers, (layer) => {
      if (layer.type === 'tilelayer') targets.push(layer);
    });
  }

  let replaced = 0;
  const perLayer = [];
  for (const layer of targets) {
    ensureLayerData(layer, map);
    let n = 0;
    let minX;
    let minY;
    let maxX;
    let maxY;
    if (map.infinite || (layer.chunks && layer.chunks.length)) {
      const b = layerBounds(layer, map);
      if (!Number.isFinite(b.x)) {
        perLayer.push({ id: layer.id, name: layer.name, replaced: 0 });
        continue;
      }
      minX = b.x;
      minY = b.y;
      maxX = b.x + b.width - 1;
      maxY = b.y + b.height - 1;
    } else {
      minX = 0;
      minY = 0;
      maxX = (layer.width || map.width) - 1;
      maxY = (layer.height || map.height) - 1;
    }
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const raw = tileAt(layer, x, y, map) >>> 0;
        let hit = false;
        if (matchFlips) {
          hit = raw === (fromGid >>> 0);
        } else {
          const d = decodeGid(raw);
          hit = d.id === fromDecoded.id;
        }
        if (hit) {
          setTileAt(layer, x, y, toGid, map);
          n += 1;
        }
      }
    }
    if (n) {
      replaced += n;
      perLayer.push({ id: layer.id, name: layer.name, replaced: n });
    }
  }
  return {
    from: fromGid,
    to: toGid,
    fromDecoded,
    toDecoded: decodeGid(toGid),
    matchFlips: !!matchFlips,
    replaced,
    layers: perLayer,
  };
}

module.exports = { replaceGid };

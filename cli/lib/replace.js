'use strict';

/**
 * Batch GID replace — terrain-ish helper for agents.
 * Replaces raw stored GIDs (including flip bits) matching --from with --to.
 * Optional --layer; omit = all tile layers.
 */

const { walkLayers, ensureLayerData, tileAt } = require('./util');
const { decodeGid, applyFlipFlags } = require('./gid');

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
    const w = layer.width || map.width;
    const h = layer.height || map.height;
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const raw = tileAt(layer, x, y, map) >>> 0;
        let hit = false;
        if (matchFlips) {
          hit = raw === (fromGid >>> 0);
        } else {
          // match base tile id only; preserve destination flip bits from --to as given
          const d = decodeGid(raw);
          hit = d.id === fromDecoded.id;
        }
        if (hit) {
          layer.data[y * w + x] = toGid >>> 0;
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

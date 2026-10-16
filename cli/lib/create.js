'use strict';

/**
 * Create an empty orthogonal TMJ-compatible map object.
 * Pass infinite:true for chunked layers (Tiled infinite maps).
 */
function createEmptyMap({
  width = 24,
  height = 16,
  tilewidth = 32,
  tileheight = 32,
  layerName = 'Layer 1',
  infinite = false,
  orientation = 'orthogonal',
  staggeraxis,
  staggerindex,
  hexsidelength,
} = {}) {
  const w = assertPositiveInt(width, 'width');
  const h = assertPositiveInt(height, 'height');
  const tw = assertPositiveInt(tilewidth, 'tilewidth');
  const th = assertPositiveInt(tileheight, 'tileheight');
  const orient = String(orientation || 'orthogonal').toLowerCase();
  const layer = {
    id: 1,
    name: layerName,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: w,
    height: h,
    opacity: 1,
    visible: true,
  };
  if (infinite) {
    layer.chunks = [];
  } else {
    layer.data = Array(w * h).fill(0);
  }
  const map = {
    version: '1.2',
    tiledversion: '1.2.4',
    orientation: orient,
    renderorder: 'right-down',
    width: w,
    height: h,
    tilewidth: tw,
    tileheight: th,
    infinite: !!infinite,
    nextlayerid: 2,
    nextobjectid: 1,
    layers: [layer],
    tilesets: [],
  };
  if (orient === 'hexagonal' || orient === 'staggered') {
    map.staggeraxis = String(staggeraxis || 'y').toLowerCase();
    map.staggerindex = String(staggerindex || 'odd').toLowerCase();
    if (orient === 'hexagonal') {
      map.hexsidelength =
        hexsidelength != null && hexsidelength !== true
          ? Number(hexsidelength) || 0
          : Math.floor(th / 2);
    }
  }
  return map;
}

function assertPositiveInt(v, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got: ${v}`);
  }
  return n;
}

module.exports = { createEmptyMap };

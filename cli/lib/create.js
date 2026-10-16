'use strict';

/**
 * Create an empty orthogonal TMJ-compatible map object.
 */
function createEmptyMap({
  width = 24,
  height = 16,
  tilewidth = 32,
  tileheight = 32,
  layerName = 'Layer 1',
} = {}) {
  const w = assertPositiveInt(width, 'width');
  const h = assertPositiveInt(height, 'height');
  const tw = assertPositiveInt(tilewidth, 'tilewidth');
  const th = assertPositiveInt(tileheight, 'tileheight');
  return {
    version: '1.2',
    tiledversion: '1.2.4',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: w,
    height: h,
    tilewidth: tw,
    tileheight: th,
    infinite: false,
    nextlayerid: 2,
    nextobjectid: 1,
    layers: [
      {
        id: 1,
        name: layerName,
        type: 'tilelayer',
        x: 0,
        y: 0,
        width: w,
        height: h,
        opacity: 1,
        visible: true,
        data: Array(w * h).fill(0),
      },
    ],
    tilesets: [],
  };
}

function assertPositiveInt(v, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got: ${v}`);
  }
  return n;
}

module.exports = { createEmptyMap };

'use strict';

/**
 * Pixel ↔ tile coordinate helpers for orthogonal / isometric / hexagonal / staggered.
 * Matches the web UI formulas in tool/tiled.js (zoom=1, no infinite draw offset).
 */

function staggerOffset(index, staggerindex) {
  const odd = String(staggerindex || 'odd') === 'odd';
  const even = Number(index) % 2 === 0;
  return (odd ? !even : even) ? 1 : 0;
}

function hexRowStep(m) {
  const side = Number(m.hexsidelength || 0);
  if (m.orientation === 'hexagonal' && side > 0) return (m.tileheight + side) / 2;
  return m.tileheight * 0.75;
}

function hexColStep(m) {
  const side = Number(m.hexsidelength || 0);
  if (m.orientation === 'hexagonal' && side > 0) return (m.tilewidth + side) / 2;
  return m.tilewidth * 0.75;
}

function resolveMapMeta(mapOrFlags) {
  const m = mapOrFlags || {};
  const orientation = String(m.orientation || 'orthogonal').toLowerCase();
  const tilewidth = Number(m.tilewidth != null ? m.tilewidth : m.tileWidth);
  const tileheight = Number(m.tileheight != null ? m.tileheight : m.tileHeight);
  if (!Number.isFinite(tilewidth) || tilewidth <= 0) {
    throw new Error('coord requires tilewidth > 0 (from map or --tilewidth)');
  }
  if (!Number.isFinite(tileheight) || tileheight <= 0) {
    throw new Error('coord requires tileheight > 0 (from map or --tileheight)');
  }
  return {
    orientation,
    tilewidth,
    tileheight,
    width: Number(m.width) || 0,
    height: Number(m.height) || 0,
    staggeraxis: String(m.staggeraxis || m['stagger-axis'] || 'y').toLowerCase(),
    staggerindex: String(m.staggerindex || m['stagger-index'] || 'odd').toLowerCase(),
    hexsidelength: Number(m.hexsidelength != null ? m.hexsidelength : m['hex-side-length'] || 0) || 0,
  };
}

/**
 * Tile indices → pixel top-left of the tile (zoom=1).
 */
function tileToPixel(mapOrFlags, tileX, tileY) {
  const m = resolveMapMeta(mapOrFlags);
  const x = Number(tileX);
  const y = Number(tileY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('tile-to-pixel requires numeric --x and --y (tile indices)');
  }

  let px;
  let py;
  if (m.orientation === 'isometric') {
    // Match tool/tiled.js mapToScreen: offset by height * tilewidth / 2
    px = (x - y) * m.tilewidth / 2 + (m.height * m.tilewidth / 2);
    py = (x + y) * m.tileheight / 2;
  } else if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
    if (m.staggeraxis === 'x') {
      px = x * hexColStep(m);
      py = y * m.tileheight + staggerOffset(x, m.staggerindex) * m.tileheight / 2;
    } else {
      px = x * m.tilewidth + staggerOffset(y, m.staggerindex) * m.tilewidth / 2;
      py = y * hexRowStep(m);
    }
  } else {
    // orthogonal (default)
    px = x * m.tilewidth;
    py = y * m.tileheight;
  }

  return {
    orientation: m.orientation,
    tile: { x, y },
    pixel: { x: px, y: py },
    tilewidth: m.tilewidth,
    tileheight: m.tileheight,
    staggeraxis: m.staggeraxis,
    staggerindex: m.staggerindex,
    hexsidelength: m.hexsidelength,
  };
}

/**
 * Pixel → floored tile indices (zoom=1).
 */
function pixelToTile(mapOrFlags, pixelX, pixelY) {
  const m = resolveMapMeta(mapOrFlags);
  const px = Number(pixelX);
  const py = Number(pixelY);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    throw new Error('pixel-to-tile requires numeric --x and --y (pixel coordinates)');
  }

  let x;
  let y;
  if (m.orientation === 'isometric') {
    x = (px / (m.tilewidth / 2) + py / (m.tileheight / 2)) / 2 - m.height / 2;
    y = (py / (m.tileheight / 2) - px / (m.tilewidth / 2)) / 2 + m.height / 2;
    x = Math.floor(x);
    y = Math.floor(y);
  } else if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
    if (m.staggeraxis === 'x') {
      x = Math.floor(px / hexColStep(m));
      y = Math.floor((py - staggerOffset(x, m.staggerindex) * m.tileheight / 2) / m.tileheight);
    } else {
      y = Math.floor(py / hexRowStep(m));
      x = Math.floor((px - staggerOffset(y, m.staggerindex) * m.tilewidth / 2) / m.tilewidth);
    }
  } else {
    x = Math.floor(px / m.tilewidth);
    y = Math.floor(py / m.tileheight);
  }

  return {
    orientation: m.orientation,
    pixel: { x: px, y: py },
    tile: { x, y },
    tilewidth: m.tilewidth,
    tileheight: m.tileheight,
    staggeraxis: m.staggeraxis,
    staggerindex: m.staggerindex,
    hexsidelength: m.hexsidelength,
  };
}

module.exports = {
  tileToPixel,
  pixelToTile,
  resolveMapMeta,
  staggerOffset,
  hexRowStep,
  hexColStep,
};

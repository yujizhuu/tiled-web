'use strict';

/**
 * Pixel ↔ tile coordinate helpers for orthogonal / isometric / hexagonal / staggered.
 * Orthogonal/isometric match tool/tiled.js; staggered/hexagonal are ports of upstream Tiled
 * HexagonalRenderer / StaggeredRenderer (zoom=1, no infinite draw offset).
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

/**
 * Port of upstream Tiled HexagonalRenderer::RenderParams (src/libtiled/hexagonalrenderer.cpp).
 * Staggered maps use the same params with side length 0. Integer math mirrors the C++ ints.
 */
function renderParams(m) {
  const staggerX = m.staggeraxis === 'x';
  const staggerEven = m.staggerindex === 'even' ? 1 : 0;
  let sideLengthX = 0;
  let sideLengthY = 0;
  if (m.orientation === 'hexagonal') {
    if (staggerX) sideLengthX = m.hexsidelength | 0;
    else sideLengthY = m.hexsidelength | 0;
  }
  const sideOffsetX = Math.trunc((m.tilewidth - sideLengthX) / 2);
  const sideOffsetY = Math.trunc((m.tileheight - sideLengthY) / 2);
  const columnWidth = sideOffsetX + sideLengthX;
  const rowHeight = sideOffsetY + sideLengthY;
  return {
    staggerX, staggerEven, sideLengthX, sideLengthY, sideOffsetX, sideOffsetY, columnWidth, rowHeight,
    tileWidth: columnWidth + sideOffsetX,
    tileHeight: rowHeight + sideOffsetY,
    doStaggerX: (x) => staggerX && ((x & 1) ^ staggerEven) === 1,
    doStaggerY: (y) => !staggerX && ((y & 1) ^ staggerEven) === 1,
  };
}

function hexTileToScreen(m, tileX, tileY) {
  const p = renderParams(m);
  const tx = Math.floor(tileX);
  const ty = Math.floor(tileY);
  let px;
  let py;
  if (p.staggerX) {
    py = ty * (p.tileHeight + p.sideLengthY);
    if (p.doStaggerX(tx)) py += p.rowHeight;
    px = tx * p.columnWidth;
  } else {
    px = tx * (p.tileWidth + p.sideLengthX);
    if (p.doStaggerY(ty)) px += p.columnWidth;
    py = ty * p.rowHeight;
  }
  return { x: px, y: py };
}

// HexagonalRenderer::topLeft/topRight/bottomLeft/bottomRight
function neighbor(m, kind, x, y) {
  const e = m.staggerindex === 'even' ? 1 : 0;
  const sy = m.staggeraxis !== 'x';
  const odd = sy ? ((y & 1) ^ e) === 1 : ((x & 1) ^ e) === 1;
  switch (kind) {
    case 'tl': return sy ? (odd ? [x, y - 1] : [x - 1, y - 1]) : odd ? [x - 1, y] : [x - 1, y - 1];
    case 'tr': return sy ? (odd ? [x + 1, y - 1] : [x, y - 1]) : odd ? [x + 1, y] : [x + 1, y - 1];
    case 'bl': return sy ? (odd ? [x, y + 1] : [x - 1, y + 1]) : odd ? [x - 1, y + 1] : [x - 1, y];
    default: return sy ? (odd ? [x + 1, y + 1] : [x, y + 1]) : odd ? [x + 1, y + 1] : [x + 1, y];
  }
}

function hexScreenToTile(m, x, y) {
  const p = renderParams(m);
  if (p.staggerX) x -= p.staggerEven ? p.tileWidth : p.sideOffsetX;
  else y -= p.staggerEven ? p.tileHeight : p.sideOffsetY;
  const ref = [Math.floor(x / (p.columnWidth * 2)), Math.floor(y / (p.rowHeight * 2))];
  const rel = [x - ref[0] * (p.columnWidth * 2), y - ref[1] * (p.rowHeight * 2)];
  const ai = p.staggerX ? 0 : 1;
  ref[ai] = ref[ai] * 2 + (p.staggerEven ? 1 : 0);
  let centers;
  if (p.staggerX) {
    const left = Math.trunc(p.sideLengthX / 2);
    const cx = left + p.columnWidth;
    const cy = Math.trunc(p.tileHeight / 2);
    centers = [[left, cy], [cx, cy - p.rowHeight], [cx, cy + p.rowHeight], [cx + p.columnWidth, cy]];
  } else {
    const top = Math.trunc(p.sideLengthY / 2);
    const cx = Math.trunc(p.tileWidth / 2);
    const cy = top + p.rowHeight;
    centers = [[cx, top], [cx - p.columnWidth, cy], [cx + p.columnWidth, cy], [cx, cy + p.rowHeight]];
  }
  let nearest = 0;
  let min = Infinity;
  centers.forEach((c, i) => {
    const d = (c[0] - rel[0]) ** 2 + (c[1] - rel[1]) ** 2;
    if (d < min) { min = d; nearest = i; }
  });
  const offs = p.staggerX ? [[0, 0], [1, -1], [1, 0], [2, 0]] : [[0, 0], [-1, 1], [0, 1], [0, 2]];
  return { x: ref[0] + offs[nearest][0], y: ref[1] + offs[nearest][1] };
}

// StaggeredRenderer::screenToTileCoords (integer part)
function staggeredScreenToTile(m, x, y) {
  const p = renderParams(m);
  let ax = x;
  let ay = y;
  if (p.staggerX) ax -= p.staggerEven ? p.sideOffsetX : 0;
  else ay -= p.staggerEven ? p.sideOffsetY : 0;
  let ref = [Math.floor(ax / p.tileWidth), Math.floor(ay / p.tileHeight)];
  const rel = [ax - ref[0] * p.tileWidth, ay - ref[1] * p.tileHeight];
  const ai = p.staggerX ? 0 : 1;
  ref[ai] = ref[ai] * 2 + (p.staggerEven ? 1 : 0);
  const yPos = rel[0] * (p.tileHeight / p.tileWidth);
  if (p.sideOffsetY - yPos > rel[1]) ref = neighbor(m, 'tl', ref[0], ref[1]);
  if (-p.sideOffsetY + yPos > rel[1]) ref = neighbor(m, 'tr', ref[0], ref[1]);
  if (p.sideOffsetY + yPos < rel[1]) ref = neighbor(m, 'bl', ref[0], ref[1]);
  if (p.sideOffsetY * 3 - yPos < rel[1]) ref = neighbor(m, 'br', ref[0], ref[1]);
  return { x: ref[0], y: ref[1] };
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
    // upstream HexagonalRenderer::tileToScreenCoords (also used by StaggeredRenderer)
    ({ x: px, y: py } = hexTileToScreen(m, x, y));
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
  } else if (m.orientation === 'hexagonal') {
    ({ x, y } = hexScreenToTile(m, px, py));
  } else if (m.orientation === 'staggered') {
    ({ x, y } = staggeredScreenToTile(m, px, py));
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

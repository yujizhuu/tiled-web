'use strict';

/**
 * Tiled .world file helpers (JSON).
 * Spec-ish: { type: "world", maps: [{ fileName, x, y, width?, height? }], patterns?: [...] }
 */

const fs = require('fs');
const path = require('path');
const { writeText, readText } = require('./util');

function emptyWorld() {
  return {
    type: 'world',
    maps: [],
    patterns: [],
  };
}

function loadWorld(filePath) {
  const text = readText(filePath);
  let world;
  try {
    world = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid world JSON: ${filePath} (${err.message})`);
  }
  if (!world || typeof world !== 'object') throw new Error(`World root must be an object: ${filePath}`);
  if (!Array.isArray(world.maps)) world.maps = [];
  if (world.type == null) world.type = 'world';
  return world;
}

function saveWorld(world, filePath) {
  if (!world.type) world.type = 'world';
  if (!Array.isArray(world.maps)) world.maps = [];
  const body = JSON.stringify(world, null, 2) + '\n';
  writeText(filePath, body);
  return { path: path.resolve(filePath), bytes: Buffer.byteLength(body, 'utf8') };
}

function worldInfo(world, filePath) {
  return {
    file: filePath ? path.resolve(filePath) : null,
    type: world.type || 'world',
    mapCount: (world.maps || []).length,
    patternCount: (world.patterns || []).length,
    onlyShowAdjacentMaps: !!world.onlyShowAdjacentMaps,
    maps: (world.maps || []).map((m, i) => ({
      index: i,
      fileName: m.fileName,
      x: m.x != null ? Number(m.x) : 0,
      y: m.y != null ? Number(m.y) : 0,
      width: m.width != null ? Number(m.width) : null,
      height: m.height != null ? Number(m.height) : null,
    })),
    patterns: world.patterns || [],
  };
}

/** Pixel size of a finite orthogonal/isometric map (Tiled MapRenderer::mapBoundingRect). */
function mapPixelSize(absPath) {
  try {
    const { loadMap } = require('./load');
    const m = loadMap(absPath);
    if (m.infinite) return null;
    if ((m.orientation || 'orthogonal') === 'orthogonal') return { width: m.width * m.tilewidth, height: m.height * m.tileheight };
    if (m.orientation === 'isometric') {
      const side = m.width + m.height;
      return { width: (side * m.tilewidth) / 2, height: (side * m.tileheight) / 2 };
    }
  } catch {
    /* unreadable map: leave size unset */
  }
  return null;
}

function addMap(world, { fileName, x, y, width, height, worldPath }) {
  if (!fileName) throw new Error('world add-map requires --file <map path or relative name>');
  if (!Array.isArray(world.maps)) world.maps = [];
  const entry = {
    fileName: String(fileName),
    x: x != null ? Number(x) : 0,
    y: y != null ? Number(y) : 0,
  };
  if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y)) {
    throw new Error('world add-map: --x and --y must be numbers');
  }
  if (width != null && width !== true && width !== '') {
    const w = Number(width);
    if (!Number.isFinite(w) || w < 0) throw new Error('world add-map: --width must be a non-negative number');
    entry.width = w;
  }
  if (height != null && height !== true && height !== '') {
    const h = Number(height);
    if (!Number.isFinite(h) || h < 0) throw new Error('world add-map: --height must be a non-negative number');
    entry.height = h;
  }
  // Tiled writes width/height for every world entry; fill them from the map file when omitted
  if ((entry.width == null || entry.height == null) && worldPath) {
    const abs = path.resolve(path.dirname(path.resolve(worldPath)), entry.fileName);
    const size = mapPixelSize(abs);
    if (size) {
      if (entry.width == null) entry.width = size.width;
      if (entry.height == null) entry.height = size.height;
    }
  }
  // Replace existing same fileName (basename match) or append
  const base = path.basename(entry.fileName);
  const idx = world.maps.findIndex(
    (m) => m.fileName === entry.fileName || path.basename(String(m.fileName)) === base
  );
  if (idx >= 0) {
    world.maps[idx] = { ...world.maps[idx], ...entry };
    return { entry: world.maps[idx], replaced: true, index: idx };
  }
  world.maps.push(entry);
  return { entry, replaced: false, index: world.maps.length - 1 };
}

function removeMap(world, { fileName, index }) {
  if (!Array.isArray(world.maps) || !world.maps.length) {
    throw new Error('World has no maps');
  }
  if (index != null && index !== true && index !== '') {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= world.maps.length) {
      throw new Error(`world remove-map: index out of range: ${index}`);
    }
    const removed = world.maps.splice(i, 1)[0];
    return { removed, index: i };
  }
  if (!fileName) throw new Error('world remove-map requires --file <name> or --index N');
  const base = path.basename(String(fileName));
  const i = world.maps.findIndex(
    (m) => m.fileName === fileName || path.basename(String(m.fileName)) === base
  );
  if (i < 0) throw new Error(`Map not found in world: ${fileName}`);
  const removed = world.maps.splice(i, 1)[0];
  return { removed, index: i };
}

/**
 * Prefer storing relative path from world file directory when possible.
 */
function relativizeMapFile(worldPath, mapFile) {
  const worldDir = path.dirname(path.resolve(worldPath));
  const abs = path.resolve(mapFile);
  const rel = path.relative(worldDir, abs);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  return mapFile;
}

module.exports = {
  emptyWorld,
  loadWorld,
  saveWorld,
  worldInfo,
  addMap,
  removeMap,
  relativizeMapFile,
};

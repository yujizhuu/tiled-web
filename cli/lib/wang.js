'use strict';

/**
 * Read-only Wang / terrain data ops for agent tooling.
 * Lists wangsets and terraintypes from map tilesets (embedded or external .tsx).
 */

const fs = require('fs');
const path = require('path');
const { readText } = require('./util');

function parseAttrs(tagInner) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagInner))) attrs[m[1]] = m[2];
  return attrs;
}

function parseWangSetsFromXml(text) {
  const sets = [];
  const wrap = text.match(/<wangsets\b[^>]*>([\s\S]*?)<\/wangsets>/i);
  if (!wrap) return sets;
  const body = wrap[1];
  const re = /<wangset\b([^>]*)>([\s\S]*?)<\/wangset>/gi;
  let m;
  while ((m = re.exec(body))) {
    const a = parseAttrs(m[1] || '');
    const inner = m[2] || '';
    const set = {
      name: a.name || 'Wang',
      tile: a.tile != null ? Number(a.tile) : 0,
      edgeColors: [],
      cornerColors: [],
      tileCount: 0,
    };
    const edgeRe = /<wangedgecolor\b([^>]*)\/?>/gi;
    let em;
    while ((em = edgeRe.exec(inner))) {
      const ea = parseAttrs(em[1] || '');
      set.edgeColors.push({
        name: ea.name || '',
        color: ea.color || '#888',
        tile: ea.tile != null ? Number(ea.tile) : 0,
        probability: ea.probability != null ? Number(ea.probability) : 1,
      });
    }
    const cornerRe = /<wangcornercolor\b([^>]*)\/?>/gi;
    while ((em = cornerRe.exec(inner))) {
      const ea = parseAttrs(em[1] || '');
      set.cornerColors.push({
        name: ea.name || '',
        color: ea.color || '#888',
        tile: ea.tile != null ? Number(ea.tile) : 0,
        probability: ea.probability != null ? Number(ea.probability) : 1,
      });
    }
    const tileMatches = inner.match(/<wangtile\b/gi);
    set.tileCount = tileMatches ? tileMatches.length : 0;
    sets.push(set);
  }
  return sets;
}

function parseTerrainsFromXml(text) {
  const terrains = [];
  const wrap = text.match(/<terraintypes\b[^>]*>([\s\S]*?)<\/terraintypes>/i);
  if (!wrap) return terrains;
  const re = /<terrain\b([^>]*)\/?>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(wrap[1]))) {
    const a = parseAttrs(m[1] || '');
    terrains.push({
      id: i++,
      name: a.name || `terrain ${i - 1}`,
      tile: a.tile != null ? Number(a.tile) : 0,
    });
  }
  return terrains;
}

function summarizeWangSet(ws) {
  if (!ws || typeof ws !== 'object') return null;
  const tiles = ws.tiles || ws.wangtiles;
  const tileCount = !tiles
    ? ws.tileCount || 0
    : Array.isArray(tiles)
    ? tiles.length
    : typeof tiles === 'object'
      ? Object.keys(tiles).length
      : ws.tileCount || 0;
  const t15 = ws.type || 'mixed';
  const colors15 = Array.isArray(ws.colors) ? ws.colors : Array.isArray(ws.wangcolors) ? ws.wangcolors : [];
  const edgeList = ws.edgeColors || ws.edgecolors || (t15 !== 'corner' ? colors15 : []);
  const cornerList = ws.cornerColors || ws.cornercolors || (t15 === 'corner' ? colors15 : []);
  return {
    name: ws.name || '',
    tile: ws.tile != null ? ws.tile : 0,
    // Tiled JSON 1.2: edgecolors/cornercolors; Tiled 1.5+: colors (+ type); CLI internal: camelCase
    edgeColorCount: edgeList.length,
    cornerColorCount: cornerList.length,
    tileCount,
    edgeColors: edgeList.map((c) => ({
      name: c.name || '',
      color: c.color,
      tile: c.tile,
    })),
    cornerColors: cornerList.map((c) => ({
      name: c.name || '',
      color: c.color,
      tile: c.tile,
    })),
  };
}

function loadTilesetExtras(ts, { mapPath } = {}) {
  const result = {
    wangsets: [],
    terrains: [],
    source: null,
  };

  // Embedded on map tileset object
  const embeddedWang = ts.wangsets || ts.wangSets;
  if (Array.isArray(embeddedWang) && embeddedWang.length) {
    result.wangsets = embeddedWang.map(summarizeWangSet).filter(Boolean);
  }
  const embeddedTerrains = ts.terrains || ts.terraintypes;
  if (Array.isArray(embeddedTerrains) && embeddedTerrains.length) {
    result.terrains = embeddedTerrains.map((t, i) => ({
      id: t.id != null ? t.id : i,
      name: t.name || '',
      tile: t.tile != null ? t.tile : 0,
    }));
  }

  // External .tsx
  if (ts.source) {
    const baseDir = mapPath ? path.dirname(path.resolve(mapPath)) : process.cwd();
    const abs = path.isAbsolute(ts.source) ? ts.source : path.resolve(baseDir, ts.source);
    result.source = abs;
    if (fs.existsSync(abs) && /\.(tsx|xml)$/i.test(abs)) {
      try {
        const text = readText(abs);
        if (!result.wangsets.length) result.wangsets = parseWangSetsFromXml(text).map(summarizeWangSet);
        if (!result.terrains.length) result.terrains = parseTerrainsFromXml(text);
      } catch {
        // ignore unreadable tsx
      }
    }
  }

  return result;
}

function listWang(map, { mapPath } = {}) {
  const out = [];
  for (const ts of map.tilesets || []) {
    const extras = loadTilesetExtras(ts, { mapPath });
    if (!extras.wangsets.length) continue;
    out.push({
      tileset: {
        firstgid: ts.firstgid,
        name: ts.name || null,
        source: ts.source || null,
      },
      wangsets: extras.wangsets,
    });
  }
  return out;
}

function listTerrain(map, { mapPath } = {}) {
  const out = [];
  for (const ts of map.tilesets || []) {
    const extras = loadTilesetExtras(ts, { mapPath });
    if (!extras.terrains.length) continue;
    out.push({
      tileset: {
        firstgid: ts.firstgid,
        name: ts.name || null,
        source: ts.source || null,
      },
      terrains: extras.terrains,
    });
  }
  return out;
}

module.exports = {
  listWang,
  listTerrain,
  parseWangSetsFromXml,
  parseTerrainsFromXml,
  loadTilesetExtras,
};

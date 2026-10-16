'use strict';

/**
 * Add a tileset reference to a map (embedded image or external .tsx source).
 */
function addTileset(map, opts = {}) {
  if (!Array.isArray(map.tilesets)) map.tilesets = [];
  const name = opts.name != null && opts.name !== true ? String(opts.name) : '';
  const source = opts.source != null && opts.source !== true ? String(opts.source) : '';
  const image = opts.image != null && opts.image !== true ? String(opts.image) : '';
  const firstgid = Number(opts.firstgid);
  if (!Number.isInteger(firstgid) || firstgid < 1) {
    throw new Error('tileset add requires --firstgid <positive integer>');
  }
  if (!source && !image && !name) {
    throw new Error('tileset add requires --name and/or --image and/or --source');
  }
  const tilewidth = Number(opts.tilewidth || opts.tileWidth || map.tilewidth || 32);
  const tileheight = Number(opts.tileheight || opts.tileHeight || map.tileheight || 32);
  if (!Number.isInteger(tilewidth) || tilewidth < 1 || !Number.isInteger(tileheight) || tileheight < 1) {
    throw new Error('tilewidth/tileheight must be positive integers');
  }
  // conflict check
  for (const t of map.tilesets) {
    if (Number(t.firstgid) === firstgid) {
      throw new Error(`tileset with firstgid=${firstgid} already exists (${t.name || t.source || '?'})`);
    }
  }
  const ts = {
    firstgid,
    name: name || (source ? '' : 'Tileset'),
    tilewidth,
    tileheight,
  };
  if (source) {
    ts.source = source;
  } else {
    if (image) ts.image = image;
    if (opts.columns != null && opts.columns !== true) {
      const c = Number(opts.columns);
      if (!Number.isInteger(c) || c < 0) throw new Error('columns must be a non-negative integer');
      ts.columns = c;
    }
    if (opts.tilecount != null && opts.tilecount !== true) {
      const n = Number(opts.tilecount);
      if (!Number.isInteger(n) || n < 0) throw new Error('tilecount must be a non-negative integer');
      ts.tilecount = n;
    } else if (ts.columns && opts.imageheight != null) {
      // optional derived — skip unless given
    }
    if (opts.imagewidth != null && opts.imagewidth !== true) ts.imagewidth = Number(opts.imagewidth);
    if (opts.imageheight != null && opts.imageheight !== true) ts.imageheight = Number(opts.imageheight);
    if (opts.margin != null && opts.margin !== true) ts.margin = Number(opts.margin) || 0;
    if (opts.spacing != null && opts.spacing !== true) ts.spacing = Number(opts.spacing) || 0;
  }
  map.tilesets.push(ts);
  map.tilesets.sort((a, b) => (a.firstgid || 0) - (b.firstgid || 0));
  return ts;
}

function listTilesets(map) {
  return (map.tilesets || []).map((t) => ({
    firstgid: t.firstgid,
    name: t.name || null,
    source: t.source || null,
    image: t.image || null,
    tilewidth: t.tilewidth || null,
    tileheight: t.tileheight || null,
    tilecount: t.tilecount || null,
    columns: t.columns || null,
  }));
}

module.exports = { addTileset, listTilesets };

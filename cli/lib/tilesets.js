'use strict';

const fs = require('fs');
const path = require('path');
const { readText } = require('./util');

/**
 * Read PNG IHDR width/height (no deps). Returns null if not a PNG or unreadable.
 */
function readPngSize(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(24);
    const n = fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    if (n < 24) return null;
    // PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
    // IHDR chunk starts at offset 8; width/height at 16/20
    if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

function parseAttrs(attrText) {
  const attrs = {};
  const re = /([^\s=]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrText || ''))) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Minimal external .tsx / tileset XML loader → partial tileset fields (no firstgid).
 */
function loadTsx(filePath) {
  const text = readText(filePath);
  const open = text.match(/<tileset\b([^>]*)>/i);
  if (!open) throw new Error(`Not a tileset XML: ${filePath}`);
  const a = parseAttrs(open[1]);
  const ts = {
    name: a.name || '',
    tilewidth: Number(a.tilewidth || 0) || undefined,
    tileheight: Number(a.tileheight || 0) || undefined,
    tilecount: a.tilecount != null ? Number(a.tilecount) : undefined,
    columns: a.columns != null ? Number(a.columns) : undefined,
    margin: a.margin != null ? Number(a.margin) : undefined,
    spacing: a.spacing != null ? Number(a.spacing) : undefined,
  };
  const img = text.match(/<image\b([^>]*)\/?>/i);
  if (img) {
    const ia = parseAttrs(img[1]);
    if (ia.source) ts.image = ia.source;
    if (ia.width) ts.imagewidth = Number(ia.width);
    if (ia.height) ts.imageheight = Number(ia.height);
  }
  // Extras in Tiled 1.2 JSON shape (used by --embed): terrains, tiles[].terrain, wangsets
  const tw = text.match(/<terraintypes\b[^>]*>([\s\S]*?)<\/terraintypes>/i);
  if (tw) {
    ts.terrains = [];
    const re = /<terrain\b([^>]*?)\/?>/gi;
    let m;
    while ((m = re.exec(tw[1]))) {
      const ta = parseAttrs(m[1]);
      ts.terrains.push({ name: ta.name || '', tile: Number(ta.tile || -1) });
    }
  }
  const tiles = [];
  const tileRe = /<tile\b([^>]*?)(\/>|>)/gi;
  let tm;
  while ((tm = tileRe.exec(text))) {
    const ta = parseAttrs(tm[1]);
    if (ta.id == null || ta.terrain == null) continue;
    tiles.push({ id: Number(ta.id), terrain: ta.terrain.split(',').map((v) => (v === '' ? -1 : Number(v))) });
  }
  if (tiles.length) ts.tiles = tiles;
  const ww = text.match(/<wangsets\b[^>]*>([\s\S]*?)<\/wangsets>/i);
  if (ww) {
    ts.wangsets = [];
    const re = /<wangset\b([^>]*)>([\s\S]*?)<\/wangset>/gi;
    let m;
    while ((m = re.exec(ww[1]))) {
      const wa = parseAttrs(m[1]);
      const ws = { name: wa.name || '', tile: Number(wa.tile || -1), cornercolors: [], edgecolors: [], wangtiles: [] };
      const colRe = /<wang(corner|edge)color\b([^>]*?)\/?>/gi;
      let c;
      while ((c = colRe.exec(m[2]))) {
        const ca = parseAttrs(c[2]);
        ws[c[1] + 'colors'].push({ name: ca.name || '', color: ca.color || '', tile: Number(ca.tile || -1), probability: Number(ca.probability || 1) });
      }
      const wtRe = /<wangtile\b([^>]*?)\/?>/gi;
      while ((c = wtRe.exec(m[2]))) {
        const ca = parseAttrs(c[1]);
        const id = Number(ca.wangid) >>> 0; // "0x..." parses as hex
        // Tiled 1.2 JSON wangid: 8 ints [top, topright, right, bottomright, bottom, bottomleft, left, topleft] = nibbles 0..7
        const wangid = [];
        for (let i = 0; i < 8; i++) wangid.push((id >>> (4 * i)) & 0xf);
        ws.wangtiles.push({ tileid: Number(ca.tileid), wangid, hflip: ca.hflip === 'true', vflip: ca.vflip === 'true', dflip: ca.dflip === 'true' });
      }
      ts.wangsets.push(ws);
    }
  }
  return ts;
}

/**
 * Derive tilecount/columns from image dimensions when possible.
 * Documents when image size is unknown (returns note).
 */
function deriveTileMetrics(ts) {
  const notes = [];
  const tw = ts.tilewidth;
  const th = ts.tileheight;
  const margin = ts.margin || 0;
  const spacing = ts.spacing || 0;
  let iw = ts.imagewidth;
  let ih = ts.imageheight;

  if ((!iw || !ih) && ts.image && !String(ts.image).startsWith('data:')) {
    // absolute or relative — caller may pass resolved path via _imagePath
    const tryPath = ts._imagePath || ts.image;
    const size = readPngSize(tryPath);
    if (size) {
      iw = size.width;
      ih = size.height;
      ts.imagewidth = iw;
      ts.imageheight = ih;
      notes.push(`read PNG size ${iw}x${ih} from ${tryPath}`);
    } else {
      notes.push(
        'image size unknown (not a readable PNG, or missing); pass --imagewidth/--imageheight or --tilecount/--columns'
      );
    }
  }

  if (iw && th && tw && (ts.columns == null || ts.columns === 0)) {
    const usable = iw - 2 * margin + spacing;
    const col = Math.floor((usable + spacing) / (tw + spacing));
    if (col > 0) {
      ts.columns = col;
      notes.push(`derived columns=${col}`);
    }
  }
  if (iw && ih && tw && th && (ts.tilecount == null || ts.tilecount === 0)) {
    const cols = ts.columns || Math.floor((iw - 2 * margin + spacing) / (tw + spacing));
    const rows = Math.floor((ih - 2 * margin + spacing) / (th + spacing));
    if (cols > 0 && rows > 0) {
      ts.tilecount = cols * rows;
      if (!ts.columns) ts.columns = cols;
      notes.push(`derived tilecount=${ts.tilecount}`);
    }
  }
  return notes;
}

/**
 * Add a tileset reference to a map (embedded image or external .tsx source).
 * When --source points to an existing .tsx, fields are filled from it (still stored as external ref unless --embed).
 */
function addTileset(map, opts = {}, { mapPath } = {}) {
  if (!Array.isArray(map.tilesets)) map.tilesets = [];
  let name = opts.name != null && opts.name !== true ? String(opts.name) : '';
  let source = opts.source != null && opts.source !== true ? String(opts.source) : '';
  let image = opts.image != null && opts.image !== true ? String(opts.image) : '';
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

  for (const t of map.tilesets) {
    if (Number(t.firstgid) === firstgid) {
      throw new Error(`tileset with firstgid=${firstgid} already exists (${t.name || t.source || '?'})`);
    }
  }

  const notes = [];
  let loaded = null;

  // Resolve --source relative to map file when possible
  if (source) {
    const baseDir = mapPath ? path.dirname(path.resolve(mapPath)) : process.cwd();
    let abs = path.isAbsolute(source) ? source : path.resolve(baseDir, source);
    // Fallback: path given relative to CWD → store it relative to the map file (Tiled stores
    // tileset sources relative to the map, see TMX spec <tileset source>).
    if (!fs.existsSync(abs) && !path.isAbsolute(source) && fs.existsSync(path.resolve(source))) {
      abs = path.resolve(source);
      source = path.relative(baseDir, abs).split(path.sep).join('/');
      notes.push(`--source resolved from CWD; stored relative to map as ${source}`);
    }
    if (fs.existsSync(abs) && /\.(tsx|xml)$/i.test(abs)) {
      loaded = loadTsx(abs);
      notes.push(`loaded external tileset ${abs}`);
      if (!name && loaded.name) name = loaded.name;
      if (!image && loaded.image) {
        // keep image path as stored in tsx (usually relative to tsx)
        // for metrics, resolve against tsx dir
        const imgAbs = path.isAbsolute(loaded.image)
          ? loaded.image
          : path.resolve(path.dirname(abs), loaded.image);
        loaded._imagePath = imgAbs;
      }
    } else if (fs.existsSync(abs)) {
      notes.push(`--source exists but is not .tsx/.xml; storing path only`);
    } else {
      notes.push(`--source file not found on disk (${abs}); storing path reference only`);
    }
  }

  const embed = !!(opts.embed || opts['embed-tsx']);
  const ts = {
    firstgid,
    name: name || (loaded && loaded.name) || (source && !embed ? '' : 'Tileset'),
    tilewidth: (loaded && loaded.tilewidth) || tilewidth,
    tileheight: (loaded && loaded.tileheight) || tileheight,
  };

  if (source && !embed) {
    // Tiled JSON/TMX external reference is exactly {firstgid, source} (doc: "source: only for
    // external tilesets"); extra fields are ignored/dropped by Tiled. Keep the ref minimal.
    for (const k of Object.keys(ts)) delete ts[k];
    ts.firstgid = firstgid;
    ts.source = source;
  } else {
    if (source && embed) {
      notes.push('embedded tsx contents into map (dropped external source)');
      if (loaded) {
        // image path in .tsx is relative to the .tsx; rebase to the map directory
        if (loaded.image && !image) {
          image = loaded._imagePath
            ? path.relative(mapPath ? path.dirname(path.resolve(mapPath)) : process.cwd(), loaded._imagePath).split(path.sep).join('/')
            : loaded.image;
        }
        for (const k of ['terrains', 'wangsets', 'tiles', 'properties']) if (loaded[k]) ts[k] = loaded[k];
        if (loaded.columns != null) ts.columns = loaded.columns;
        if (loaded.tilecount != null) ts.tilecount = loaded.tilecount;
        if (loaded.imagewidth) ts.imagewidth = loaded.imagewidth;
        if (loaded.imageheight) ts.imageheight = loaded.imageheight;
        if (loaded.margin != null) ts.margin = loaded.margin;
        if (loaded.spacing != null) ts.spacing = loaded.spacing;
      }
    }
    if (image && !image.startsWith('data:') && !path.isAbsolute(image)) {
      // Tiled stores image paths relative to the file that contains the tileset (the map here).
      const mapDir = mapPath ? path.dirname(path.resolve(mapPath)) : process.cwd();
      if (!fs.existsSync(path.resolve(mapDir, image)) && fs.existsSync(path.resolve(image))) {
        image = path.relative(mapDir, path.resolve(image)).split(path.sep).join('/');
        notes.push(`--image resolved from CWD; stored relative to map as ${image}`);
      }
    }
    if (image) ts.image = image;
    else if (loaded && loaded.image) ts.image = loaded.image;

    if (opts.columns != null && opts.columns !== true) {
      const c = Number(opts.columns);
      if (!Number.isInteger(c) || c < 0) throw new Error('columns must be a non-negative integer');
      ts.columns = c;
    } else if (loaded && loaded.columns != null && ts.columns == null) {
      ts.columns = loaded.columns;
    }

    if (opts.tilecount != null && opts.tilecount !== true) {
      const n = Number(opts.tilecount);
      if (!Number.isInteger(n) || n < 0) throw new Error('tilecount must be a non-negative integer');
      ts.tilecount = n;
    } else if (loaded && loaded.tilecount != null && ts.tilecount == null) {
      ts.tilecount = loaded.tilecount;
    }

    if (opts.imagewidth != null && opts.imagewidth !== true) ts.imagewidth = Number(opts.imagewidth);
    else if (loaded && loaded.imagewidth) ts.imagewidth = loaded.imagewidth;
    if (opts.imageheight != null && opts.imageheight !== true) ts.imageheight = Number(opts.imageheight);
    else if (loaded && loaded.imageheight) ts.imageheight = loaded.imageheight;
    if (opts.margin != null && opts.margin !== true) ts.margin = Number(opts.margin) || 0;
    else if (loaded && loaded.margin != null) ts.margin = loaded.margin;
    if (opts.spacing != null && opts.spacing !== true) ts.spacing = Number(opts.spacing) || 0;
    else if (loaded && loaded.spacing != null) ts.spacing = loaded.spacing;

    // resolve image for PNG size probe
    if (ts.image && !ts.imagewidth) {
      const baseDir = mapPath ? path.dirname(path.resolve(mapPath)) : process.cwd();
      const imgAbs = path.isAbsolute(ts.image) ? ts.image : path.resolve(baseDir, ts.image);
      ts._imagePath = (loaded && loaded._imagePath) || imgAbs;
    }
    const derived = deriveTileMetrics(ts);
    notes.push(...derived);
    delete ts._imagePath;
  }

  map.tilesets.push(ts);
  map.tilesets.sort((a, b) => (a.firstgid || 0) - (b.firstgid || 0));
  ts._notes = notes;
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
    imagewidth: t.imagewidth || null,
    imageheight: t.imageheight || null,
  }));
}

module.exports = { addTileset, listTilesets, loadTsx, readPngSize, deriveTileMetrics };

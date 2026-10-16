'use strict';

/**
 * Object templates (.tx XML / .tj|.json JSON) — load info + apply instance to object layer.
 */

const path = require('path');
const { readText, extOf, xmlEscape } = require('./util');
const { nextObjectId, resolveObjectLayer, summarizeObject } = require('./objects');
const { addTileset } = require('./tilesets');
const { decodeGid, encodeGid } = require('./gid');

function parseAttrs(tagInner) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagInner))) attrs[m[1]] = m[2];
  return attrs;
}

function parsePointsAttr(str) {
  return String(str || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x, y };
    });
}

function parseTemplateJson(text, fileName) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid template JSON: ${fileName} (${err.message})`);
  }
  const object = data.object || (data.type === 'template' ? null : data);
  if (!object || typeof object !== 'object') {
    throw new Error(`Template missing object: ${fileName}`);
  }
  return {
    name: fileName,
    fileName,
    tileset: data.tileset || null,
    object: JSON.parse(JSON.stringify(object)),
    format: 'json',
  };
}

function parseTemplateXml(text, fileName) {
  const body = String(text).replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const tplOpen = body.match(/<template\b([^>]*)>/i);
  if (!tplOpen) throw new Error(`Not a template root (missing <template>): ${fileName}`);
  const tplStart = tplOpen.index + tplOpen[0].length;
  const tplClose = body.toLowerCase().lastIndexOf('</template>');
  if (tplClose < 0) throw new Error(`Missing </template>: ${fileName}`);
  const inner = body.slice(tplStart, tplClose);

  // tileset (optional, first)
  let tileset = null;
  const tsMatch = inner.match(/<tileset\b([^>]*)\/>/i) || inner.match(/<tileset\b([^>]*)>[\s\S]*?<\/tileset>/i);
  if (tsMatch) {
    const attrs = parseAttrs(tsMatch[1] || '');
    tileset = {
      firstgid: attrs.firstgid != null ? Number(attrs.firstgid) : 1,
      source: attrs.source || '',
      name: attrs.name || '',
    };
  }

  const objMatch = inner.match(/<object\b([^>]*)(\/>|>)/i);
  if (!objMatch) throw new Error(`Template missing <object>: ${fileName}`);
  const objAttrs = parseAttrs(objMatch[1] || '');
  const selfClose = objMatch[0].endsWith('/>') || objMatch[2] === '/>';
  let objInner = '';
  if (!selfClose) {
    const objStart = objMatch.index + objMatch[0].length;
    const objClose = inner.toLowerCase().indexOf('</object>', objStart);
    if (objClose < 0) throw new Error(`Template object not closed: ${fileName}`);
    objInner = inner.slice(objStart, objClose);
  }

  const object = {
    id: objAttrs.id != null ? Number(objAttrs.id) : 1,
    name: objAttrs.name || '',
    type: objAttrs.type || objAttrs.class || '',
    x: Number(objAttrs.x || 0),
    y: Number(objAttrs.y || 0),
    width: Number(objAttrs.width || 0),
    height: Number(objAttrs.height || 0),
    rotation: Number(objAttrs.rotation || 0),
    visible: objAttrs.visible !== '0',
  };
  if (objAttrs.gid != null) object.gid = Number(objAttrs.gid) >>> 0;

  if (/<ellipse\b/i.test(objInner)) object.ellipse = true;
  if (/<point\b/i.test(objInner)) object.point = true;
  const poly = objInner.match(/<polygon\b([^>]*)\/?>/i);
  if (poly) object.polygon = parsePointsAttr(parseAttrs(poly[1]).points);
  const line = objInner.match(/<polyline\b([^>]*)\/?>/i);
  if (line) object.polyline = parsePointsAttr(parseAttrs(line[1]).points);
  const textNode = objInner.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i);
  if (textNode) object.text = textNode[1];

  const props = {};
  const propRe = /<property\b([^>]*)(\/>|>([\s\S]*?)<\/property>)/gi;
  let pm;
  while ((pm = propRe.exec(objInner))) {
    const attrs = parseAttrs(pm[1] || '');
    if (!attrs.name) continue;
    let val = attrs.value;
    if (val == null) val = pm[3] != null ? pm[3] : '';
    const t = (attrs.type || 'string').toLowerCase();
    if (t === 'bool' || t === 'boolean') val = val === 'true' || val === '1';
    else if (t === 'int' || t === 'integer') val = parseInt(val, 10) || 0;
    else if (t === 'float' || t === 'number') val = parseFloat(val) || 0;
    props[attrs.name] = val;
  }
  if (Object.keys(props).length) object.properties = props;

  return { name: fileName, fileName, object, tileset, format: 'xml' };
}

function loadTemplate(filePath) {
  const text = readText(filePath);
  const ext = extOf(filePath);
  const base = path.basename(filePath);
  if (ext === '.tx' || text.trim().startsWith('<')) {
    return parseTemplateXml(text, base);
  }
  if (ext === '.tj' || ext === '.json' || ext === '') {
    return parseTemplateJson(text, base);
  }
  // sniff
  if (text.trim().startsWith('{')) return parseTemplateJson(text, base);
  throw new Error(`Unsupported template format: ${ext || '(none)'} (use .tx / .tj / .json)`);
}

function templateInfo(tpl, filePath) {
  const o = tpl.object || {};
  return {
    file: filePath ? path.resolve(filePath) : null,
    format: tpl.format,
    fileName: tpl.fileName,
    tileset: tpl.tileset,
    object: summarizeObject(o),
    properties: o.properties
      ? Array.isArray(o.properties)
        ? o.properties
        : Object.keys(o.properties).map((k) => ({ name: k, value: o.properties[k] }))
      : [],
  };
}

/**
 * Find next free firstgid after existing tilesets.
 */
function nextFirstGid(map) {
  let next = 1;
  for (const t of map.tilesets || []) {
    const fg = Number(t.firstgid) || 1;
    const count = Number(t.tilecount) || 1;
    next = Math.max(next, fg + Math.max(1, count));
  }
  return next;
}

/**
 * Match an existing map tileset to a template tileset ref (by source path basename or name).
 */
function findMatchingTileset(map, tplTs) {
  if (!tplTs) return null;
  const list = map.tilesets || [];
  const src = tplTs.source ? String(tplTs.source) : '';
  const srcBase = src ? path.basename(src) : '';
  const name = tplTs.name ? String(tplTs.name) : '';
  if (srcBase) {
    const bySrc = list.find((t) => t.source && path.basename(String(t.source)) === srcBase);
    if (bySrc) return bySrc;
  }
  if (src) {
    const bySrcExact = list.find((t) => t.source && String(t.source) === src);
    if (bySrcExact) return bySrcExact;
  }
  if (name) {
    const byName = list.find((t) => t.name && String(t.name) === name);
    if (byName) return byName;
  }
  return null;
}

/**
 * Ensure template tileset is on the map; remap object.gid if present.
 * Returns { merged, tileset, gidRemap: { from, to } | null }.
 */
function mergeTemplateTileset(map, tpl, { mapPath, templatePath } = {}) {
  const tplTs = tpl.tileset;
  if (!tplTs) return { merged: false, tileset: null, gidRemap: null };

  const existing = findMatchingTileset(map, tplTs);
  const tplFirst = Number(tplTs.firstgid) || 1;

  let mapTs = existing;
  let merged = false;
  if (!mapTs) {
    const firstgid = nextFirstGid(map);
    const opts = {
      firstgid,
      name: tplTs.name || undefined,
      source: tplTs.source || undefined,
      image: tplTs.image || undefined,
      tilewidth: tplTs.tilewidth,
      tileheight: tplTs.tileheight,
      columns: tplTs.columns,
      tilecount: tplTs.tilecount || tplTs.tileCount,
      imagewidth: tplTs.imagewidth,
      imageheight: tplTs.imageheight,
    };
    // Resolve source relative to template file when possible
    if (opts.source && templatePath && !path.isAbsolute(opts.source)) {
      const tplDir = path.dirname(path.resolve(templatePath));
      const abs = path.resolve(tplDir, opts.source);
      // Prefer relative-to-map if mapPath known, else keep template-relative path string
      if (mapPath) {
        const mapDir = path.dirname(path.resolve(mapPath));
        opts.source = path.relative(mapDir, abs) || path.basename(abs);
      } else {
        opts.source = abs;
      }
    }
    // Drop undefined keys so addTileset validation is happy
    for (const k of Object.keys(opts)) {
      if (opts[k] === undefined || opts[k] === true) delete opts[k];
    }
    if (!opts.name && !opts.source && !opts.image) {
      opts.name = 'TemplateTileset';
    }
    mapTs = addTileset(map, opts, { mapPath });
    delete mapTs._notes;
    merged = true;
  }

  // Remap object gid: preserve flip bits
  let gidRemap = null;
  const obj = tpl.object;
  if (obj && obj.gid != null) {
    const decoded = decodeGid(obj.gid);
    const localId = decoded.id - tplFirst;
    if (localId < 0) {
      // gid smaller than template firstgid — leave as-is
      gidRemap = { from: obj.gid >>> 0, to: obj.gid >>> 0, note: 'gid below template firstgid; unchanged' };
    } else {
      const newId = (Number(mapTs.firstgid) || 1) + localId;
      const newGid = encodeGid(newId, {
        flipH: decoded.flipH,
        flipV: decoded.flipV,
        flipD: decoded.flipD,
      });
      gidRemap = { from: obj.gid >>> 0, to: newGid, localId, mapFirstgid: mapTs.firstgid };
      // mutate the clone later in applyTemplate — return intended gid
      gidRemap._applyToObject = true;
    }
  }

  return { merged, tileset: mapTs, gidRemap, tplFirstgid: tplFirst };
}

/**
 * Place a template instance on an object layer at pixel (x,y).
 * Auto-merges template tileset onto the map when missing (safe next firstgid).
 */
function applyTemplate(map, {
  layer: layerSpec,
  template: tpl,
  x,
  y,
  createLayer = false,
  mapPath,
  templatePath,
  mergeTileset = true,
} = {}) {
  if (!tpl || !tpl.object) throw new Error('applyTemplate requires a loaded template');
  const layer = resolveObjectLayer(map, layerSpec, {
    createIfMissing: !!createLayer,
    createName: layerSpec && layerSpec !== true ? String(layerSpec) : 'Object Layer',
  });
  if (!Array.isArray(layer.objects)) layer.objects = [];

  const xx = Number(x);
  const yy = Number(y);
  if (!Number.isFinite(xx) || !Number.isFinite(yy)) {
    throw new Error('template apply requires --x and --y (pixel coordinates)');
  }

  let tilesetMerge = null;
  if (mergeTileset && tpl.tileset) {
    tilesetMerge = mergeTemplateTileset(map, tpl, { mapPath, templatePath });
  }

  const obj = JSON.parse(JSON.stringify(tpl.object));
  delete obj.id;
  obj.id = nextObjectId(map);
  obj.x = xx;
  obj.y = yy;
  obj.template = tpl.fileName || tpl.name || 'template';

  if (tilesetMerge && tilesetMerge.gidRemap && tilesetMerge.gidRemap._applyToObject) {
    obj.gid = tilesetMerge.gidRemap.to;
  }

  layer.objects.push(obj);
  map.nextobjectid = Math.max(Number(map.nextobjectid) || 1, obj.id + 1);

  const result = { layer, object: obj };
  if (tilesetMerge) {
    result.tilesetMerge = {
      merged: tilesetMerge.merged,
      tileset: tilesetMerge.tileset
        ? {
            firstgid: tilesetMerge.tileset.firstgid,
            name: tilesetMerge.tileset.name || null,
            source: tilesetMerge.tileset.source || null,
          }
        : null,
      gidRemap: tilesetMerge.gidRemap
        ? {
            from: tilesetMerge.gidRemap.from,
            to: tilesetMerge.gidRemap.to,
            localId: tilesetMerge.gidRemap.localId,
            note: tilesetMerge.gidRemap.note,
          }
        : null,
    };
  }
  return result;
}

module.exports = {
  loadTemplate,
  templateInfo,
  applyTemplate,
  mergeTemplateTileset,
  nextFirstGid,
  findMatchingTileset,
  parseTemplateJson,
  parseTemplateXml,
};

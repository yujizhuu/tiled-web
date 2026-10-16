'use strict';

/**
 * Object templates (.tx XML / .tj|.json JSON) — load info + apply instance to object layer.
 */

const path = require('path');
const { readText, extOf, xmlEscape } = require('./util');
const { nextObjectId, resolveObjectLayer, summarizeObject } = require('./objects');

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
 * Place a template instance on an object layer at pixel (x,y).
 */
function applyTemplate(map, { layer: layerSpec, template: tpl, x, y, createLayer = false } = {}) {
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

  const obj = JSON.parse(JSON.stringify(tpl.object));
  delete obj.id;
  obj.id = nextObjectId(map);
  obj.x = xx;
  obj.y = yy;
  obj.template = tpl.fileName || tpl.name || 'template';
  layer.objects.push(obj);
  map.nextobjectid = Math.max(Number(map.nextobjectid) || 1, obj.id + 1);
  return { layer, object: obj };
}

module.exports = {
  loadTemplate,
  templateInfo,
  applyTemplate,
  parseTemplateJson,
  parseTemplateXml,
};

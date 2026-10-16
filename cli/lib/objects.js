'use strict';

const { resolveLayer, walkLayers } = require('./util');
const { nextLayerId } = require('./layers');

function nextObjectId(map) {
  let max = 0;
  if (map.nextobjectid != null) max = Math.max(max, Number(map.nextobjectid) - 1);
  walkLayers(map.layers, (layer) => {
    if (layer.type !== 'objectgroup') return;
    for (const o of layer.objects || []) {
      if (o.id != null) max = Math.max(max, Number(o.id) || 0);
    }
  });
  return max + 1;
}

function addObjectLayer(map, { name = 'Object Layer' } = {}) {
  if (!Array.isArray(map.layers)) map.layers = [];
  const id = nextLayerId(map);
  const layer = {
    id,
    name: String(name || `Object Layer ${id}`),
    type: 'objectgroup',
    draworder: 'topdown',
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    objects: [],
  };
  const names = new Set();
  walkLayers(map.layers, (l) => names.add(l.name));
  if (names.has(layer.name)) {
    let n = 2;
    while (names.has(`${layer.name} ${n}`)) n += 1;
    layer.name = `${layer.name} ${n}`;
  }
  map.layers.push(layer);
  map.nextlayerid = id + 1;
  return layer;
}

function resolveObjectLayer(map, layerSpec, { createIfMissing = false, createName } = {}) {
  if (layerSpec == null || layerSpec === '' || layerSpec === true) {
    if (createIfMissing) {
      return addObjectLayer(map, { name: createName || 'Object Layer' });
    }
    // first object layer
    let found = null;
    walkLayers(map.layers, (layer) => {
      if (!found && layer.type === 'objectgroup') found = layer;
    });
    if (!found) {
      throw new Error('No object layer found (pass --layer and optionally --create-layer)');
    }
    return found;
  }
  let layer;
  try {
    layer = resolveLayer(map, layerSpec, { tileOnly: false, required: true });
  } catch (err) {
    if (createIfMissing) {
      return addObjectLayer(map, { name: String(layerSpec) });
    }
    throw err;
  }
  if (layer.type !== 'objectgroup') {
    if (createIfMissing) {
      // name already taken by non-object layer
      throw new Error(
        `Layer "${layer.name}" exists as type "${layer.type}"; cannot create object layer with same name`
      );
    }
    throw new Error(`Layer "${layer.name}" is type "${layer.type}", expected objectgroup`);
  }
  return layer;
}

function summarizeObject(o) {
  let shape = 'rectangle';
  if (o.point) shape = 'point';
  else if (o.ellipse) shape = 'ellipse';
  else if (o.polygon) shape = 'polygon';
  else if (o.polyline) shape = 'polyline';
  else if (o.gid) shape = 'tile';
  return {
    id: o.id,
    name: o.name || '',
    type: o.type || o.class || '',
    x: o.x || 0,
    y: o.y || 0,
    width: o.width || 0,
    height: o.height || 0,
    rotation: o.rotation || 0,
    visible: o.visible !== false,
    shape,
    gid: o.gid != null ? o.gid >>> 0 : null,
    propertyCount: o.properties
      ? Array.isArray(o.properties)
        ? o.properties.length
        : Object.keys(o.properties).length
      : 0,
  };
}

function listObjects(map, layerSpec) {
  const layers = [];
  if (layerSpec != null && layerSpec !== '' && layerSpec !== true) {
    const layer = resolveObjectLayer(map, layerSpec, { createIfMissing: false });
    layers.push(layer);
  } else {
    walkLayers(map.layers, (layer) => {
      if (layer.type === 'objectgroup') layers.push(layer);
    });
  }
  const out = [];
  for (const layer of layers) {
    for (const o of layer.objects || []) {
      out.push({
        layer: { id: layer.id, name: layer.name },
        ...summarizeObject(o),
      });
    }
  }
  return out;
}

function parsePoints(str) {
  // "0,0 16,0 16,16" or JSON
  const s = String(str).trim();
  if (s.startsWith('[')) {
    const arr = JSON.parse(s);
    return arr.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  }
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`Invalid polygon point: ${pair}`);
      }
      return { x, y };
    });
}

function addObject(map, opts = {}) {
  const createLayer = !!(opts['create-layer'] || opts.createLayer);
  const layer = resolveObjectLayer(map, opts.layer, {
    createIfMissing: createLayer,
    createName: opts.layer && opts.layer !== true ? String(opts.layer) : 'Object Layer',
  });
  if (!Array.isArray(layer.objects)) layer.objects = [];

  const x = Number(opts.x);
  const y = Number(opts.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('object add requires --x and --y (numbers)');
  }

  let id;
  if (opts.id != null && opts.id !== true && opts.id !== '') {
    id = Number(opts.id);
    if (!Number.isInteger(id) || id < 1) throw new Error(`--id must be a positive integer, got: ${opts.id}`);
    if (layer.objects.some((o) => Number(o.id) === id)) {
      throw new Error(`Object id ${id} already exists on layer "${layer.name}"`);
    }
    // also uniqueness across map
    let clash = false;
    walkLayers(map.layers, (l) => {
      if (clash || l.type !== 'objectgroup') return;
      if ((l.objects || []).some((o) => Number(o.id) === id)) clash = true;
    });
    if (clash) throw new Error(`Object id ${id} already exists on the map`);
  } else {
    id = nextObjectId(map);
  }

  const shape = String(opts.shape || 'rectangle').toLowerCase();
  const obj = {
    id,
    name: opts.name != null && opts.name !== true ? String(opts.name) : '',
    type: '',
    x,
    y,
    width: 0,
    height: 0,
    rotation: 0,
    visible: true,
  };
  const classOrType = opts.class != null && opts.class !== true ? opts.class : opts.type;
  if (classOrType != null && classOrType !== true) {
    obj.type = String(classOrType);
  }

  if (opts.width != null && opts.width !== true) obj.width = Number(opts.width) || 0;
  if (opts.height != null && opts.height !== true) obj.height = Number(opts.height) || 0;
  if (opts.rotation != null && opts.rotation !== true) obj.rotation = Number(opts.rotation) || 0;
  if (opts.gid != null && opts.gid !== true) obj.gid = Number(opts.gid) >>> 0;
  if (opts.visible === false || opts.visible === '0' || opts.visible === 'false') obj.visible = false;

  if (shape === 'ellipse') {
    obj.ellipse = true;
    if (!obj.width) obj.width = Number(opts.width) || map.tilewidth || 32;
    if (!obj.height) obj.height = Number(opts.height) || map.tileheight || 32;
  } else if (shape === 'point') {
    obj.point = true;
    obj.width = 0;
    obj.height = 0;
  } else if (shape === 'polygon') {
    if (opts.points == null || opts.points === true) {
      throw new Error('object add --shape polygon requires --points "x,y x,y ..."');
    }
    obj.polygon = parsePoints(opts.points);
    if (!obj.width && obj.polygon.length) {
      const xs = obj.polygon.map((p) => p.x);
      const ys = obj.polygon.map((p) => p.y);
      obj.width = Math.max(...xs) - Math.min(...xs);
      obj.height = Math.max(...ys) - Math.min(...ys);
    }
  } else if (shape === 'polyline') {
    if (opts.points == null || opts.points === true) {
      throw new Error('object add --shape polyline requires --points "x,y x,y ..."');
    }
    obj.polyline = parsePoints(opts.points);
  } else if (shape === 'rectangle' || shape === 'rect') {
    if (!obj.width) obj.width = Number(opts.width) || map.tilewidth || 32;
    if (!obj.height) obj.height = Number(opts.height) || map.tileheight || 32;
  } else {
    throw new Error(`Unknown --shape: ${opts.shape} (use rectangle|ellipse|point|polygon)`);
  }

  layer.objects.push(obj);
  map.nextobjectid = Math.max(Number(map.nextobjectid) || 1, id + 1);
  return { layer, object: obj };
}

function findObject(layer, { id, name }) {
  const objects = layer.objects || [];
  if (id != null && id !== true && id !== '') {
    const nid = Number(id);
    if (!Number.isInteger(nid)) throw new Error(`--id must be an integer, got: ${id}`);
    const idx = objects.findIndex((o) => Number(o.id) === nid);
    if (idx < 0) throw new Error(`Object id ${nid} not found on layer "${layer.name}"`);
    return { object: objects[idx], index: idx };
  }
  if (name != null && name !== true && name !== '') {
    const idx = objects.findIndex((o) => o.name === String(name));
    if (idx < 0) throw new Error(`Object name "${name}" not found on layer "${layer.name}"`);
    return { object: objects[idx], index: idx };
  }
  throw new Error('object remove/update requires --id or --name');
}

function removeObject(map, opts = {}) {
  const layer = resolveObjectLayer(map, opts.layer, { createIfMissing: false });
  const { object, index } = findObject(layer, { id: opts.id, name: opts.name });
  layer.objects.splice(index, 1);
  return { layer, object };
}

function updateObject(map, opts = {}) {
  const layer = resolveObjectLayer(map, opts.layer, { createIfMissing: false });
  const { object } = findObject(layer, { id: opts.id, name: opts.name });
  if (opts.x != null && opts.x !== true) object.x = Number(opts.x);
  if (opts.y != null && opts.y !== true) object.y = Number(opts.y);
  if (opts.width != null && opts.width !== true) object.width = Number(opts.width);
  if (opts.height != null && opts.height !== true) object.height = Number(opts.height);
  if (opts.rotation != null && opts.rotation !== true) object.rotation = Number(opts.rotation);
  if (opts.name != null && opts.name !== true && (opts.id != null && opts.id !== true)) {
    // --name is new name only when --id identifies the object
    object.name = String(opts.name);
  }
  if (opts['new-name'] != null && opts['new-name'] !== true) object.name = String(opts['new-name']);
  const classOrType = opts.class != null && opts.class !== true ? opts.class : opts.type;
  // only apply type/class if explicitly passed and we're not mistaking object identity
  if (opts.class != null && opts.class !== true) object.type = String(opts.class);
  else if (opts.type != null && opts.type !== true) object.type = String(opts.type);
  if (opts.gid != null && opts.gid !== true) object.gid = Number(opts.gid) >>> 0;
  if (opts.visible === false || opts.visible === '0' || opts.visible === 'false') object.visible = false;
  if (opts.visible === true || opts.visible === '1' || opts.visible === 'true') object.visible = true;
  if (opts.shape != null && opts.shape !== true) {
    const shape = String(opts.shape).toLowerCase();
    delete object.ellipse;
    delete object.point;
    delete object.polygon;
    delete object.polyline;
    if (shape === 'ellipse') object.ellipse = true;
    else if (shape === 'point') {
      object.point = true;
      object.width = 0;
      object.height = 0;
    } else if (shape === 'polygon') {
      if (opts.points == null || opts.points === true) throw new Error('--shape polygon requires --points');
      object.polygon = parsePoints(opts.points);
    } else if (shape === 'polyline') {
      if (opts.points == null || opts.points === true) throw new Error('--shape polyline requires --points');
      object.polyline = parsePoints(opts.points);
    } else if (shape !== 'rectangle' && shape !== 'rect') {
      throw new Error(`Unknown --shape: ${opts.shape}`);
    }
  }
  return { layer, object };
}

module.exports = {
  nextObjectId,
  addObjectLayer,
  resolveObjectLayer,
  listObjects,
  addObject,
  removeObject,
  updateObject,
  summarizeObject,
};

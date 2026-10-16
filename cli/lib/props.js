'use strict';

const { resolveLayer, walkLayers } = require('./util');

/**
 * Custom properties helpers.
 * Storage: prefer plain object { name: value } (matches web UI + CLI TMX parse).
 * Also accept official Tiled JSON array [{name,type,value}] when reading.
 */

function isPropArray(props) {
  return Array.isArray(props);
}

function toObjectMap(props) {
  if (!props) return {};
  if (!isPropArray(props)) {
    if (typeof props === 'object') return { ...props };
    return {};
  }
  const out = {};
  for (const p of props) {
    if (p && p.name != null) out[p.name] = p.value;
  }
  return out;
}

function ensureObjectProps(owner) {
  if (!owner.properties) {
    owner.properties = {};
    return owner.properties;
  }
  if (isPropArray(owner.properties)) {
    owner.properties = toObjectMap(owner.properties);
  }
  return owner.properties;
}

function listProps(owner) {
  const map = toObjectMap(owner && owner.properties);
  return Object.keys(map)
    .sort()
    .map((name) => ({
      name,
      value: map[name],
      type: typeof map[name] === 'boolean' ? 'bool' : typeof map[name] === 'number' ? (Number.isInteger(map[name]) ? 'int' : 'float') : 'string',
    }));
}

function getProp(owner, name) {
  if (!name || name === true) throw new Error('prop get/set/remove requires --name <key>');
  const map = toObjectMap(owner && owner.properties);
  if (!(name in map)) throw new Error(`Property not found: ${name}`);
  return { name, value: map[name] };
}

function setProp(owner, name, value, typeHint) {
  if (!name || name === true) throw new Error('prop set requires --name <key>');
  if (value === undefined) throw new Error('prop set requires --value <value>');
  const props = ensureObjectProps(owner);
  let v = value;
  const t = typeHint != null && typeHint !== true ? String(typeHint).toLowerCase() : null;
  if (t === 'bool' || t === 'boolean') {
    v = value === true || value === 'true' || value === '1' || value === 1;
  } else if (t === 'int' || t === 'integer') {
    v = Number(value);
    if (!Number.isInteger(v)) throw new Error(`Property "${name}" type=int but value is not an integer: ${value}`);
  } else if (t === 'float' || t === 'number') {
    v = Number(value);
    if (!Number.isFinite(v)) throw new Error(`Property "${name}" type=float but value is not a number: ${value}`);
  } else if (t === 'string' || t == null) {
    // auto-detect when no hint: keep bool/number if already typed; else string
    if (t == null && typeof value !== 'boolean' && typeof value !== 'number') {
      if (value === 'true' || value === 'false') v = value === 'true';
      else if (value !== '' && /^-?\d+$/.test(String(value))) v = Number(value);
      else if (value !== '' && /^-?\d+\.\d+$/.test(String(value))) v = Number(value);
      else v = String(value === true ? 'true' : value == null ? '' : value);
    } else if (t === 'string') {
      v = String(value === true ? 'true' : value == null ? '' : value);
    }
  } else {
    throw new Error(`Unknown property --type: ${typeHint} (use string|int|float|bool)`);
  }
  props[name] = v;
  return { name, value: v };
}

function removeProp(owner, name) {
  if (!name || name === true) throw new Error('prop remove requires --name <key>');
  const props = ensureObjectProps(owner);
  if (!(name in props)) throw new Error(`Property not found: ${name}`);
  const old = props[name];
  delete props[name];
  if (Object.keys(props).length === 0) delete owner.properties;
  return { name, value: old };
}

function resolveTileset(map, spec) {
  const list = map.tilesets || [];
  if (spec == null || spec === '' || spec === true) {
    throw new Error('tileset target requires --tileset <name|firstgid|index>');
  }
  const s = String(spec);
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    // prefer firstgid match, else index
    const byGid = list.find((t) => Number(t.firstgid) === n);
    if (byGid) return byGid;
    if (n >= 0 && n < list.length) return list[n];
    throw new Error(`Tileset not found by firstgid/index: ${s}`);
  }
  const byName = list.find((t) => t.name === s);
  if (byName) return byName;
  throw new Error(`Tileset not found: ${s}`);
}

function resolveObjectInLayer(layer, { id, name }) {
  if (layer.type !== 'objectgroup') {
    throw new Error(`Layer "${layer.name}" is type "${layer.type}", expected objectgroup`);
  }
  const objects = layer.objects || [];
  if (id != null && id !== true && id !== '') {
    const nid = Number(id);
    if (!Number.isInteger(nid)) throw new Error(`object --id must be an integer, got: ${id}`);
    const found = objects.find((o) => Number(o.id) === nid);
    if (!found) throw new Error(`Object id ${nid} not found on layer "${layer.name}"`);
    return found;
  }
  if (name != null && name !== true && name !== '') {
    const found = objects.find((o) => o.name === String(name));
    if (!found) throw new Error(`Object name "${name}" not found on layer "${layer.name}"`);
    return found;
  }
  throw new Error('object target requires --id or --object-name / --name');
}

/**
 * Resolve a property owner from --target map|layer|object|tileset + identifiers.
 */
function resolveOwner(map, flags) {
  const target = String(flags.target || 'map').toLowerCase();
  if (target === 'map') {
    return { owner: map, label: 'map' };
  }
  if (target === 'layer') {
    const layer = resolveLayer(map, flags.layer, { tileOnly: false, required: true });
    return { owner: layer, label: `layer:${layer.name}` };
  }
  if (target === 'object') {
    const layer = resolveLayer(map, flags.layer, { tileOnly: false, required: true });
    const obj = resolveObjectInLayer(layer, {
      id: flags.id != null ? flags.id : flags.objectid || flags['object-id'],
      name: flags['object-name'] != null ? flags['object-name'] : flags.objectname,
    });
    // --name is always the property key; object identity via --id or --object-name
    return { owner: obj, label: `object:${obj.id}`, layer };
  }
  if (target === 'tileset') {
    const ts = resolveTileset(map, flags.tileset != null ? flags.tileset : flags.name);
    return { owner: ts, label: `tileset:${ts.name || ts.firstgid}` };
  }
  throw new Error(`Unknown --target: ${flags.target} (use map|layer|object|tileset)`);
}

/**
 * Map-level property type definitions (Tiled propertytypes / object types subset).
 * Stored as map.propertytypes = [{ name, type, values?, members?, useAs?, ... }].
 *
 * Inheritance model (matches Tiled, not OO extends):
 * - Classes do NOT extend other classes.
 * - A class member with type "class" + propertyType "<OtherClass>" nests that class;
 *   `get` expands nested members one level deep (and recursively up to depth 8).
 * - `useAs` is the modern Tiled array: property|map|layer|object|tile|tileset|wangcolor|wangset|project.
 *   Legacy useAsPropertyValue / useAsMapType / … flags are also read/written for compatibility.
 * Limits: no tile→object instance default merging (GUI); no zstd; color/drawFill optional passthrough.
 */

const USE_AS_LEGACY = {
  property: 'useAsPropertyValue',
  map: 'useAsMapType',
  layer: 'useAsLayerType',
  object: 'useAsObjectType',
  tile: 'useAsTileType',
};

const USE_AS_ALL = [
  'property',
  'map',
  'layer',
  'object',
  'tile',
  'tileset',
  'wangcolor',
  'wangset',
  'project',
];

function ensurePropertyTypesArray(map) {
  if (!Array.isArray(map.propertytypes)) {
    if (Array.isArray(map.propertyTypes)) {
      map.propertytypes = map.propertyTypes;
      delete map.propertyTypes;
    } else {
      map.propertytypes = [];
    }
  } else if (map.propertyTypes && map.propertyTypes !== map.propertytypes) {
    delete map.propertyTypes;
  }
  return map.propertytypes;
}

function findRawPropertyType(map, name) {
  const list = map.propertytypes || map.propertyTypes || [];
  if (!Array.isArray(list)) return null;
  return list.find((t) => t && t.name === String(name)) || null;
}

function useAsFromRecord(t) {
  if (Array.isArray(t.useAs)) return t.useAs.map(String);
  const out = [];
  for (const [key, flag] of Object.entries(USE_AS_LEGACY)) {
    if (t[flag] === true) out.push(key);
  }
  return out;
}

function applyUseAsToRecord(rec, useAsList) {
  const list = (useAsList || []).map(String);
  rec.useAs = list;
  for (const [key, flag] of Object.entries(USE_AS_LEGACY)) {
    rec[flag] = list.includes(key);
  }
}

function parseUseAsFlag(opts) {
  let useAs = opts['use-as'] != null ? opts['use-as'] : opts.useAs;
  if (useAs == null || useAs === true) {
    // Collect legacy boolean flags if any were passed
    const collected = [];
    for (const [key, flag] of Object.entries(USE_AS_LEGACY)) {
      const kebab = flag.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase());
      const raw = opts[flag] != null ? opts[flag] : opts[kebab];
      if (raw === true || raw === 'true' || raw === '1') collected.push(key);
    }
    return collected.length ? collected : null;
  }
  if (typeof useAs === 'string') {
    const s = useAs.trim();
    if (s.startsWith('[')) {
      try {
        useAs = JSON.parse(s);
      } catch (err) {
        throw new Error(`Invalid --use-as JSON: ${err.message}`);
      }
    } else {
      useAs = s.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(useAs)) throw new Error('--use-as must be a list (comma-separated or JSON array)');
  for (const u of useAs) {
    if (!USE_AS_ALL.includes(String(u))) {
      throw new Error(
        `Unknown useAs value: ${u} (use ${USE_AS_ALL.join('|')})`
      );
    }
  }
  return useAs.map(String);
}

/**
 * Expand nested class members (type:"class" + propertyType) into membersExpanded + merged value defaults.
 */
function expandClassMembers(map, typeRec, { depth = 0, seen = null } = {}) {
  const members = Array.isArray(typeRec && typeRec.members) ? typeRec.members : [];
  if (!members.length) return [];
  if (depth > 8) return members.map((m) => ({ ...m }));
  const seenSet = seen || new Set();
  const typeName = typeRec && typeRec.name;
  if (typeName) {
    if (seenSet.has(typeName)) return members.map((m) => ({ ...m }));
    seenSet.add(typeName);
  }
  return members.map((m) => {
    const out = { ...m };
    const propTypeName = m.propertyType || m.propertytype;
    if (String(m.type || '').toLowerCase() === 'class' && propTypeName) {
      const nested = findRawPropertyType(map, propTypeName);
      if (nested && (nested.type || nested.kind) === 'class') {
        const childSeen = new Set(seenSet);
        const expanded = expandClassMembers(map, nested, { depth: depth + 1, seen: childSeen });
        out.membersExpanded = expanded;
        const base = {};
        for (const nm of expanded) {
          if (nm && nm.name != null) base[nm.name] = nm.value;
        }
        const own = m.value && typeof m.value === 'object' && !Array.isArray(m.value) ? m.value : {};
        out.value = { ...base, ...own };
        out.propertyType = String(propTypeName);
      }
    }
    return out;
  });
}

function listPropertyTypes(map) {
  const list = map.propertytypes || map.propertyTypes || [];
  if (!Array.isArray(list)) return [];
  return list.map((t, i) => ({
    index: i,
    name: t.name || '',
    type: t.type || t.kind || 'string',
    values: t.values || undefined,
    members: t.members || undefined,
    storageType: t.storageType || undefined,
    useAs: useAsFromRecord(t),
    useAsPropertyValue: t.useAsPropertyValue,
    useAsMapType: t.useAsMapType,
    useAsLayerType: t.useAsLayerType,
    useAsObjectType: t.useAsObjectType,
    useAsTileType: t.useAsTileType,
    color: t.color,
    drawFill: t.drawFill,
  }));
}

function getPropertyType(map, name, { expand = true } = {}) {
  if (!name || name === true) throw new Error('prop types get requires --name <TypeName>');
  const found = findRawPropertyType(map, name);
  if (!found) throw new Error(`Property type not found: ${name}`);
  const type = found.type || found.kind || 'string';
  const rec = {
    name: found.name,
    type,
    values: found.values,
    members: found.members,
    storageType: found.storageType,
    useAs: useAsFromRecord(found),
    color: found.color,
    drawFill: found.drawFill,
    raw: found,
  };
  if (expand && type === 'class') {
    rec.membersExpanded = expandClassMembers(map, found);
  }
  return rec;
}

/**
 * Add a property type definition to map.propertytypes.
 * opts: { name, type, values?, members?, storageType?, useAs? / use-as?, useAs* , color?, drawFill? }
 */
function addPropertyType(map, opts = {}) {
  const name = opts.name != null && opts.name !== true ? String(opts.name) : '';
  if (!name) throw new Error('prop types add requires --name <TypeName>');
  const type = String(opts.type || opts.kind || 'class').toLowerCase();
  if (!['enum', 'class', 'string', 'bool', 'int', 'float', 'color', 'file', 'object'].includes(type)) {
    throw new Error(`Unknown property type --type: ${opts.type} (use enum|class|string|bool|int|float|…)`);
  }

  const list = ensurePropertyTypesArray(map);
  if (list.some((t) => t && t.name === name)) {
    throw new Error(`Property type already exists: ${name}`);
  }

  const rec = { name, type };

  if (type === 'enum') {
    let values = opts.values;
    if (values == null || values === true) {
      throw new Error('prop types add --type enum requires --values a,b,c or JSON array');
    }
    if (typeof values === 'string') {
      const s = values.trim();
      if (s.startsWith('[')) {
        try {
          values = JSON.parse(s);
        } catch (err) {
          throw new Error(`Invalid --values JSON: ${err.message}`);
        }
      } else {
        values = s.split(',').map((v) => v.trim()).filter((v) => v !== '');
      }
    }
    if (!Array.isArray(values) || !values.length) {
      throw new Error('--values must be a non-empty list');
    }
    rec.values = values.map(String);
    if (opts['storage-type'] != null && opts['storage-type'] !== true) {
      rec.storageType = String(opts['storage-type']);
    } else if (opts.storageType != null && opts.storageType !== true) {
      rec.storageType = String(opts.storageType);
    } else {
      rec.storageType = 'string';
    }
    if (opts['values-as-flags'] === true || opts.valuesAsFlags === true || opts['values-as-flags'] === 'true') {
      rec.valuesAsFlags = true;
    }
  }

  if (type === 'class') {
    let members = opts.members;
    if (members != null && members !== true) {
      if (typeof members === 'string') {
        try {
          members = JSON.parse(members);
        } catch (err) {
          throw new Error(`Invalid --members JSON: ${err.message}`);
        }
      }
      if (!Array.isArray(members)) throw new Error('--members must be a JSON array');
      rec.members = members;
    } else {
      rec.members = [];
    }
    if (opts.color != null && opts.color !== true) rec.color = String(opts.color);
    if (opts['draw-fill'] === true || opts.drawFill === true || opts['draw-fill'] === 'true') {
      rec.drawFill = true;
    } else if (opts['draw-fill'] === false || opts.drawFill === false || opts['draw-fill'] === 'false') {
      rec.drawFill = false;
    }
  }

  const useAs = parseUseAsFlag(opts);
  if (useAs) {
    applyUseAsToRecord(rec, useAs);
  } else if (type === 'class') {
    // Tiled default for new classes: usable as property + common entity scopes
    applyUseAsToRecord(rec, ['property', 'object', 'tile', 'map', 'layer']);
  }

  list.push(rec);
  return rec;
}

/**
 * Remove a property type by name.
 */
function removePropertyType(map, name) {
  if (!name || name === true) throw new Error('prop types remove requires --name <TypeName>');
  const list = ensurePropertyTypesArray(map);
  if (!list.length) throw new Error('Map has no propertytypes');
  const idx = list.findIndex((t) => t && t.name === String(name));
  if (idx < 0) throw new Error(`Property type not found: ${name}`);
  const [removed] = list.splice(idx, 1);
  if (list.length === 0) delete map.propertytypes;
  return removed;
}

module.exports = {
  toObjectMap,
  listProps,
  getProp,
  setProp,
  removeProp,
  resolveOwner,
  resolveTileset,
  resolveObjectInLayer,
  ensureObjectProps,
  listPropertyTypes,
  getPropertyType,
  addPropertyType,
  removePropertyType,
  expandClassMembers,
  useAsFromRecord,
  USE_AS_ALL,
};

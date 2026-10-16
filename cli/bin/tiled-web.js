#!/usr/bin/env node
'use strict';

/**
 * tiled-web CLI — Phase 3 (objects / properties / richer tilesets + Phase 1–2)
 * Humans: browser UI under tool/
 * Agents: this CLI
 */

const path = require('path');
const { die, writeText, resolveLayer, setTileAt, parseIntFlag } = require('../lib/util');
const { createEmptyMap } = require('../lib/create');
const { loadMap } = require('../lib/load');
const { exportMap } = require('../lib/export');
const { mapInfo, formatInfoHuman } = require('../lib/info');
const { saveMap } = require('../lib/save');
const {
  listLayers,
  addTileLayer,
  removeLayer,
  renameLayer,
  fillRect,
  getLayerGids,
  formatLayerCsv,
} = require('../lib/layers');
const { addTileset, listTilesets } = require('../lib/tilesets');
const {
  listObjects,
  addObject,
  removeObject,
  updateObject,
  summarizeObject,
  addObjectLayer,
} = require('../lib/objects');
const { listProps, getProp, setProp, removeProp, resolveOwner } = require('../lib/props');
const { applyFlipFlags, decodeGid } = require('../lib/gid');

const PKG = require('../package.json');

function usage(code = 0) {
  const text = `tiled-web ${PKG.version} — Phase 3 CLI (objects / properties / tilesets)

Usage:
  tiled-web version
  tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] -o map.tmj
  tiled-web info <map.tmj|map.tmx> [--format json|text]
  tiled-web export <map.tmj|map.tmx> -f tmj|tmx|csv -o <out>

  tiled-web set-tile <map> --x X --y Y --gid GID [--layer name|index]
                      [--flip-h] [--flip-v] [--flip-d] [-o out]
  tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer name|index]
                 [--flip-h] [--flip-v] [--flip-d] [-o out]
  tiled-web get-layer <map> [--layer name|index] [--format json|csv] [-o out]

  tiled-web layer list <map>
  tiled-web layer add <map> [--name NAME] [--type tile|object] [-o out]
  tiled-web layer remove <map> --layer name|index [-o out]
  tiled-web layer rename <map> --layer name|index --name NEW [-o out]

  tiled-web tileset add <map> --firstgid N [--name NAME] [--image PATH] [--source PATH.tsx]
                              [--tilewidth TW] [--tileheight TH] [--columns C] [--tilecount N]
                              [--imagewidth W] [--imageheight H] [--embed] [-o out]
  tiled-web tileset list <map>

  tiled-web object list <map> [--layer name|index]
  tiled-web object add <map> --layer <objectlayer> --x X --y Y [--name NAME] [--type|--class T]
                             [--width W] [--height H] [--shape rectangle|ellipse|point|polygon]
                             [--points "x,y ..."] [--id N] [--create-layer] [-o out]
  tiled-web object remove <map> --layer <objectlayer> --id N|--name NAME [-o out]
  tiled-web object update <map> --layer <objectlayer> --id N [--x --y --width --height --name|--new-name --type|--class --shape ...] [-o out]

  tiled-web prop list <map> --target map|layer|object|tileset [--layer ...] [--id ...] [--tileset ...]
  tiled-web prop get  <map> --target ... --name KEY
  tiled-web prop set  <map> --target ... --name KEY --value VAL [--type string|int|float|bool] [-o out]
  tiled-web prop remove <map> --target ... --name KEY [-o out]

Notes:
  - Mutations write in-place unless -o / --output is set.
  - Default --layer for tile cmds is the first tile layer.
  - Object identity for prop --target object: --layer + --id (or --object-name).
  - TMX support is minimal orthogonal (CSV data).
  - Browser UI under tool/ is unchanged.

Exit: 0 on success; non-zero on error (messages on stderr).
`;
  if (code === 0) process.stdout.write(text);
  else process.stderr.write(text);
  process.exit(code);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (!args.length || args[0] === '-h' || args[0] === '--help') usage(0);
  const cmd = args[0];
  const flags = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') usage(0);
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next == null || next.startsWith('-')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else if (a === '-o' || a === '-f' || a === '-L') {
      const next = args[i + 1];
      if (next == null) die(`Missing value for ${a}`);
      if (a === '-o') flags.output = next;
      else if (a === '-f') flags.format = next;
      else flags.layer = next;
      i += 1;
    } else {
      positional.push(a);
    }
  }
  if (flags.o && !flags.output) flags.output = flags.o;
  if (flags.f && !flags.format) flags.format = flags.f;
  if (flags.w != null && flags.width == null) flags.width = flags.w;
  if (flags.h != null && flags.height == null) flags.height = flags.h;
  return { cmd, flags, positional };
}

function ok(obj) {
  process.stdout.write(JSON.stringify({ ok: true, ...obj }, null, 2) + '\n');
}

function cmdVersion() {
  process.stdout.write(`tiled-web ${PKG.version}\n`);
  process.stdout.write(`phase: 3 (objects/properties/tilesets + layers/tiles + create/info/export)\n`);
  process.stdout.write(`license: ${PKG.license}\n`);
}

function cmdNew(flags) {
  const out = flags.output;
  if (!out) die('new requires -o / --output <map.tmj>');
  const map = createEmptyMap({
    width: flags.width,
    height: flags.height,
    tilewidth: flags.tilewidth || flags.tileWidth || 32,
    tileheight: flags.tileheight || flags.tileHeight || 32,
  });
  writeText(out, JSON.stringify(map, null, 2) + '\n');
  ok({
    path: path.resolve(out),
    width: map.width,
    height: map.height,
    tilewidth: map.tilewidth,
    tileheight: map.tileheight,
  });
}

function cmdInfo(positional, flags) {
  const file = positional[0];
  if (!file) die('info requires a map path: tiled-web info map.tmj');
  const map = loadMap(file);
  const info = mapInfo(map, path.resolve(file));
  const fmt = String(flags.format || 'json').toLowerCase();
  if (fmt === 'text' || fmt === 'human') {
    process.stdout.write(formatInfoHuman(info));
  } else if (fmt === 'json') {
    process.stdout.write(JSON.stringify(info, null, 2) + '\n');
  } else {
    die(`Unknown --format: ${flags.format} (use json|text)`);
  }
}

function cmdExport(positional, flags) {
  const file = positional[0];
  if (!file) die('export requires a map path');
  const format = flags.format;
  const out = flags.output;
  if (!format) die('export requires -f / --format tmj|tmx|csv');
  if (!out) die('export requires -o / --output <path>');
  const map = loadMap(file);
  const result = exportMap(map, format, out);
  ok(result);
}

function cmdSetTile(positional, flags) {
  const file = positional[0];
  if (!file) die('set-tile requires a map path');
  const x = parseIntFlag(flags.x, 'x', { min: 0, allowZero: true });
  const y = parseIntFlag(flags.y, 'y', { min: 0, allowZero: true });
  let gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
  gid = applyFlipFlags(gid, flags);
  const map = loadMap(file);
  const layer = resolveLayer(map, flags.layer, { tileOnly: true, required: true });
  const written = setTileAt(layer, x, y, gid, map);
  const saved = saveMap(map, { output: flags.output, inPlacePath: file });
  ok({
    action: 'set-tile',
    layer: { id: layer.id, name: layer.name },
    x,
    y,
    gid: written,
    decoded: decodeGid(written),
    ...saved,
  });
}

function cmdFill(positional, flags) {
  const file = positional[0];
  if (!file) die('fill requires a map path');
  const x = parseIntFlag(flags.x, 'x', { min: 0, allowZero: true });
  const y = parseIntFlag(flags.y, 'y', { min: 0, allowZero: true });
  const width = parseIntFlag(flags.width, 'width', { min: 1 });
  const height = parseIntFlag(flags.height, 'height', { min: 1 });
  let gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
  gid = applyFlipFlags(gid, flags);
  const map = loadMap(file);
  const layer = resolveLayer(map, flags.layer, { tileOnly: true, required: true });
  const result = fillRect(map, layer, { x, y, width, height, gid });
  const saved = saveMap(map, { output: flags.output, inPlacePath: file });
  ok({
    action: 'fill',
    layer: { id: layer.id, name: layer.name },
    ...result,
    decoded: decodeGid(gid),
    ...saved,
  });
}

function cmdGetLayer(positional, flags) {
  const file = positional[0];
  if (!file) die('get-layer requires a map path');
  const map = loadMap(file);
  const layer = resolveLayer(map, flags.layer, { tileOnly: true, required: true });
  const gids = getLayerGids(map, layer);
  const fmt = String(flags.format || 'json').toLowerCase();
  if (fmt === 'csv') {
    const body = formatLayerCsv(gids);
    if (flags.output) {
      writeText(flags.output, body);
      ok({
        action: 'get-layer',
        format: 'csv',
        layer: { id: layer.id, name: layer.name },
        width: gids.width,
        height: gids.height,
        path: path.resolve(flags.output),
      });
    } else {
      process.stdout.write(body);
    }
    return;
  }
  if (fmt !== 'json') die(`Unknown --format: ${flags.format} (use json|csv)`);
  const payload = {
    action: 'get-layer',
    format: 'json',
    layer: { id: gids.id, name: gids.name },
    width: gids.width,
    height: gids.height,
    data: gids.data,
  };
  const body = JSON.stringify(payload, null, 2) + '\n';
  if (flags.output) {
    writeText(flags.output, body);
    ok({
      action: 'get-layer',
      format: 'json',
      layer: payload.layer,
      width: gids.width,
      height: gids.height,
      path: path.resolve(flags.output),
    });
  } else {
    process.stdout.write(body);
  }
}

function cmdLayer(positional, flags) {
  const sub = positional[0];
  const file = positional[1];
  if (!sub) die('layer requires subcommand: list|add|remove|rename');
  if (!file) die(`layer ${sub} requires a map path`);

  if (sub === 'list') {
    const map = loadMap(file);
    process.stdout.write(
      JSON.stringify({ file: path.resolve(file), layers: listLayers(map) }, null, 2) + '\n'
    );
    return;
  }

  const map = loadMap(file);
  if (sub === 'add') {
    const type = String(flags.type || 'tile').toLowerCase();
    let layer;
    if (type === 'object' || type === 'objectgroup' || type === 'objectlayer') {
      layer = addObjectLayer(map, { name: flags.name });
    } else if (type === 'tile' || type === 'tilelayer') {
      layer = addTileLayer(map, { name: flags.name });
    } else {
      die(`Unknown layer --type: ${flags.type} (use tile|object)`);
    }
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'layer-add',
      layer: {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        width: layer.width,
        height: layer.height,
        objectCount: layer.objects ? layer.objects.length : undefined,
      },
      ...saved,
    });
    return;
  }
  if (sub === 'remove') {
    const removed = removeLayer(map, flags.layer);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'layer-remove',
      removed: { id: removed.id, name: removed.name, type: removed.type },
      ...saved,
    });
    return;
  }
  if (sub === 'rename') {
    const result = renameLayer(map, flags.layer, flags.name);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'layer-rename',
      layer: { id: result.layer.id, name: result.newName, type: result.layer.type },
      oldName: result.oldName,
      ...saved,
    });
    return;
  }
  die(`Unknown layer subcommand: ${sub} (use list|add|remove|rename)`);
}

function cmdTileset(positional, flags) {
  const sub = positional[0];
  const file = positional[1];
  if (!sub) die('tileset requires subcommand: add|list');
  if (!file) die(`tileset ${sub} requires a map path`);

  if (sub === 'list') {
    const map = loadMap(file);
    process.stdout.write(
      JSON.stringify({ file: path.resolve(file), tilesets: listTilesets(map) }, null, 2) + '\n'
    );
    return;
  }
  if (sub === 'add') {
    const map = loadMap(file);
    const ts = addTileset(map, flags, { mapPath: file });
    const notes = ts._notes || [];
    delete ts._notes;
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'tileset-add',
      tileset: {
        firstgid: ts.firstgid,
        name: ts.name || null,
        source: ts.source || null,
        image: ts.image || null,
        tilewidth: ts.tilewidth,
        tileheight: ts.tileheight,
        tilecount: ts.tilecount != null ? ts.tilecount : null,
        columns: ts.columns != null ? ts.columns : null,
        imagewidth: ts.imagewidth != null ? ts.imagewidth : null,
        imageheight: ts.imageheight != null ? ts.imageheight : null,
      },
      notes,
      ...saved,
    });
    return;
  }
  die(`Unknown tileset subcommand: ${sub} (use add|list)`);
}

function cmdObject(positional, flags) {
  const sub = positional[0];
  const file = positional[1];
  if (!sub) die('object requires subcommand: list|add|remove|update');
  if (!file) die(`object ${sub} requires a map path`);

  if (sub === 'list') {
    const map = loadMap(file);
    const objects = listObjects(map, flags.layer);
    process.stdout.write(
      JSON.stringify({ file: path.resolve(file), count: objects.length, objects }, null, 2) + '\n'
    );
    return;
  }

  const map = loadMap(file);
  if (sub === 'add') {
    const { layer, object } = addObject(map, flags);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'object-add',
      layer: { id: layer.id, name: layer.name },
      object: summarizeObject(object),
      ...saved,
    });
    return;
  }
  if (sub === 'remove') {
    const { layer, object } = removeObject(map, flags);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'object-remove',
      layer: { id: layer.id, name: layer.name },
      removed: summarizeObject(object),
      ...saved,
    });
    return;
  }
  if (sub === 'update') {
    // For update, --name alone is identity; use --new-name to rename
    const { layer, object } = updateObject(map, flags);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'object-update',
      layer: { id: layer.id, name: layer.name },
      object: summarizeObject(object),
      ...saved,
    });
    return;
  }
  die(`Unknown object subcommand: ${sub} (use list|add|remove|update)`);
}

function cmdProp(positional, flags) {
  const sub = positional[0];
  const file = positional[1];
  if (!sub) die('prop requires subcommand: list|get|set|remove');
  if (!file) die(`prop ${sub} requires a map path`);

  const map = loadMap(file);
  // Normalize object identity flags for resolveOwner
  if (flags['object-name'] == null && flags.objectname == null) {
    // when --target object and --id is set, --name is the property key
    // when --target object and no --id, --object-name identifies; --name is prop key
  }
  const { owner, label } = resolveOwner(map, flags);

  if (sub === 'list') {
    process.stdout.write(
      JSON.stringify(
        {
          file: path.resolve(file),
          target: flags.target || 'map',
          label,
          properties: listProps(owner),
        },
        null,
        2
      ) + '\n'
    );
    return;
  }
  if (sub === 'get') {
    const rec = getProp(owner, flags.name);
    process.stdout.write(
      JSON.stringify({ file: path.resolve(file), target: flags.target || 'map', label, ...rec }, null, 2) +
        '\n'
    );
    return;
  }
  if (sub === 'set') {
    if (flags.value === undefined) die('prop set requires --value <value>');
    // boolean flags: --value true without next token becomes flags.value === true
    const value = flags.value === true ? 'true' : flags.value;
    const rec = setProp(owner, flags.name, value, flags.type);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'prop-set',
      target: flags.target || 'map',
      label,
      ...rec,
      ...saved,
    });
    return;
  }
  if (sub === 'remove') {
    const rec = removeProp(owner, flags.name);
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'prop-remove',
      target: flags.target || 'map',
      label,
      ...rec,
      ...saved,
    });
    return;
  }
  die(`Unknown prop subcommand: ${sub} (use list|get|set|remove)`);
}

function main() {
  try {
    const { cmd, flags, positional } = parseArgs(process.argv);
    switch (cmd) {
      case 'version':
      case '--version':
      case '-V':
        cmdVersion();
        break;
      case 'new':
        cmdNew(flags);
        break;
      case 'info':
        cmdInfo(positional, flags);
        break;
      case 'export':
        cmdExport(positional, flags);
        break;
      case 'set-tile':
      case 'settile':
        cmdSetTile(positional, flags);
        break;
      case 'fill':
        cmdFill(positional, flags);
        break;
      case 'get-layer':
      case 'getlayer':
        cmdGetLayer(positional, flags);
        break;
      case 'layer':
        cmdLayer(positional, flags);
        break;
      case 'tileset':
        cmdTileset(positional, flags);
        break;
      case 'object':
      case 'objects':
        cmdObject(positional, flags);
        break;
      case 'prop':
      case 'property':
      case 'props':
        cmdProp(positional, flags);
        break;
      case 'help':
        usage(0);
        break;
      default:
        die(`Unknown command: ${cmd}\nRun: tiled-web --help`);
    }
  } catch (err) {
    die(err && err.message ? err.message : String(err));
  }
}

main();

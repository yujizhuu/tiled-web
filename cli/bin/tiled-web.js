#!/usr/bin/env node
'use strict';

/**
 * tiled-web CLI — Phase 2 (create / info / export / layer / tile write / tileset)
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

const PKG = require('../package.json');

function usage(code = 0) {
  const text = `tiled-web ${PKG.version} — Phase 2 CLI (layers / tiles / tilesets)

Usage:
  tiled-web version
  tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] -o map.tmj
  tiled-web info <map.tmj|map.tmx> [--format json|text]
  tiled-web export <map.tmj|map.tmx> -f tmj|tmx|csv -o <out>

  tiled-web set-tile <map> --x X --y Y --gid GID [--layer name|index] [-o out]
  tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer name|index] [-o out]
  tiled-web get-layer <map> [--layer name|index] [--format json|csv] [-o out]

  tiled-web layer list <map>
  tiled-web layer add <map> [--name NAME] [-o out]
  tiled-web layer remove <map> --layer name|index [-o out]
  tiled-web layer rename <map> --layer name|index --name NEW [-o out]

  tiled-web tileset add <map> --firstgid N [--name NAME] [--image PATH] [--source PATH.tsx]
                              [--tilewidth TW] [--tileheight TH] [--columns C] [--tilecount N] [-o out]
  tiled-web tileset list <map>

Notes:
  - Mutations write in-place unless -o / --output is set.
  - Default --layer is the first tile layer.
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
  // aliases for fill size
  if (flags.w != null && flags.width == null) flags.width = flags.w;
  if (flags.h != null && flags.height == null) flags.height = flags.h;
  return { cmd, flags, positional };
}

function ok(obj) {
  process.stdout.write(JSON.stringify({ ok: true, ...obj }, null, 2) + '\n');
}

function cmdVersion() {
  process.stdout.write(`tiled-web ${PKG.version}\n`);
  process.stdout.write(`phase: 2 (layers/tiles/tilesets + create/info/export)\n`);
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
  const gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
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
  const gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
  const map = loadMap(file);
  const layer = resolveLayer(map, flags.layer, { tileOnly: true, required: true });
  const result = fillRect(map, layer, { x, y, width, height, gid });
  const saved = saveMap(map, { output: flags.output, inPlacePath: file });
  ok({
    action: 'fill',
    layer: { id: layer.id, name: layer.name },
    ...result,
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
      JSON.stringify(
        {
          file: path.resolve(file),
          layers: listLayers(map),
        },
        null,
        2
      ) + '\n'
    );
    return;
  }

  const map = loadMap(file);
  if (sub === 'add') {
    const layer = addTileLayer(map, { name: flags.name });
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'layer-add',
      layer: { id: layer.id, name: layer.name, type: layer.type, width: layer.width, height: layer.height },
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
    const ts = addTileset(map, flags);
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
      },
      ...saved,
    });
    return;
  }
  die(`Unknown tileset subcommand: ${sub} (use add|list)`);
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

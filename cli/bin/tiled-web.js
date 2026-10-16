#!/usr/bin/env node
'use strict';

/**
 * tiled-web CLI — Phase 7 (agent goal met: template index / prop types useAs+expand / TMX infinite+zlib)
 * Humans: browser UI under tool/
 * Agents: this CLI
 */

const fs = require('fs');
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
const {
  listProps,
  getProp,
  setProp,
  removeProp,
  resolveOwner,
  listPropertyTypes,
  getPropertyType,
  addPropertyType,
  removePropertyType,
} = require('../lib/props');
const { applyFlipFlags, decodeGid } = require('../lib/gid');
const { applyAutomapToMap } = require('../lib/automap');
const {
  emptyWorld,
  loadWorld,
  saveWorld,
  worldInfo,
  addMap: worldAddMap,
  removeMap: worldRemoveMap,
  relativizeMapFile,
} = require('../lib/world');
const { replaceGid } = require('../lib/replace');
const { copyStamp, pasteStamp, loadStamp, writeStampFile } = require('../lib/stamp');
const { loadTemplate, templateInfo, indexTemplates, applyTemplate } = require('../lib/template');
const { tileToPixel, pixelToTile } = require('../lib/coord');
const { listWang, listTerrain } = require('../lib/wang');

const PKG = require('../package.json');

function usage(code = 0) {
  const text = `tiled-web ${PKG.version} — Phase 7 CLI (agent goal met)

Usage:
  tiled-web version
  tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] [--infinite]
                [--orientation orthogonal|isometric|hexagonal|staggered]
                [--staggeraxis y|x] [--staggerindex odd|even] [--hexsidelength N] -o map.tmj
  tiled-web info <map.tmj|map.tmx> [--format json|text]
  tiled-web export <map.tmj|map.tmx> -f tmj|tmx|csv [-o <out>]
                   [--encoding csv|base64] [--compression zlib|gzip]   # TMX only

  tiled-web set-tile <map> --x X --y Y --gid GID [--layer name|index]
                      [--flip-h] [--flip-v] [--flip-d] [-o out]
  tiled-web fill <map> --x X --y Y --width W --height H --gid GID [--layer name|index]
                 [--flip-h] [--flip-v] [--flip-d] [-o out]
  tiled-web get-layer <map> [--layer name|index] [--format json|csv] [-o out]
  tiled-web replace-gid <map> --from GID --to GID [--layer name|index] [--match-flips] [-o out]

  tiled-web stamp copy <map> --layer name|index --x X --y Y --width W --height H -o stamp.json
  tiled-web stamp paste <map> --layer name|index --x X --y Y --stamp stamp.json [-o out]

  tiled-web template info <file.tx|file.tj|file.json>
  tiled-web template index <dir> [--no-recursive]
  tiled-web template apply <map> --layer <objectlayer> --template <file> --x X --y Y [--create-layer] [-o out]

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
  tiled-web prop types list <map>
  tiled-web prop types get <map> --name TypeName [--no-expand]
  tiled-web prop types add <map> --name TypeName --type enum|class
                           [--values a,b] [--members JSON] [--use-as property,object,tile,…]
                           [--storage-type string|int] [--color #aarrggbb] [--draw-fill] [-o out]
  tiled-web prop types remove <map> --name TypeName [-o out]

  tiled-web coord tile-to-pixel|pixel-to-tile [<map>] --x --y [--orientation ...] [--tilewidth ...] [--tileheight ...]
                                [--staggeraxis y|x] [--staggerindex odd|even] [--hexsidelength N] [--width|--height for iso]
  tiled-web wang list <map>
  tiled-web terrain list <map>

  tiled-web automap <map> --rules <rules.txt|rules.json|dir|rule.tmj> [--radius N] [--x X] [--y Y] [-o out]

  tiled-web world info <file.world>
  tiled-web world new -o file.world
  tiled-web world add-map <file.world> --file map.tmj --x X --y Y [--width W] [--height H]
  tiled-web world remove-map <file.world> --file map.tmj|--index N

  MCP (stdio): node cli/mcp-server.js   # see README for Cursor/Claude config

Notes:
  - Mutations write in-place unless -o / --output is set.
  - Default --layer for tile cmds is the first tile layer.
  - Infinite maps: set-tile/fill/get-layer/stamp/replace-gid use chunks[]; TMX export emits <chunk>.
  - TMX encodings: CSV (default) or base64; compression zlib|gzip (Node zlib; no zstd). Prefer TMJ for agents.
  - prop types: classes nest via members type=class + propertyType; get expands membersExpanded. No OO extends.
  - template index scans .tx/.tj/.json (skips non-template JSON).
  - wang/terrain list are data-only (no brush UI). GUI leftovers live under tool/.
  - Browser UI under tool/ is unchanged. MCP wrapper: cli/mcp-server.js (zero deps).

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
      // Allow numeric negatives like --x -2 (not a flag)
      const nextIsValue =
        next != null && (!next.startsWith('-') || /^-?\d+(\.\d+)?$/.test(next));
      if (!nextIsValue) {
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
  process.stdout.write(`phase: 7 (agent CLI complete: template-index/prop-types-useAs+expand/TMX-infinite+zlib + phases 1–6; 0.7.1 upstream-conformance fixes)\n`);
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
    infinite: !!(flags.infinite),
    orientation: flags.orientation || 'orthogonal',
    staggeraxis: flags.staggeraxis || flags['stagger-axis'],
    staggerindex: flags.staggerindex || flags['stagger-index'],
    hexsidelength: flags.hexsidelength || flags['hex-side-length'],
  });
  writeText(out, JSON.stringify(map, null, 2) + '\n');
  ok({
    path: path.resolve(out),
    width: map.width,
    height: map.height,
    tilewidth: map.tilewidth,
    tileheight: map.tileheight,
    infinite: !!map.infinite,
    orientation: map.orientation,
    staggeraxis: map.staggeraxis,
    staggerindex: map.staggerindex,
    hexsidelength: map.hexsidelength,
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
  const encoding = flags.encoding != null && flags.encoding !== true ? String(flags.encoding) : 'csv';
  const compression =
    flags.compression != null && flags.compression !== true ? String(flags.compression) : '';
  if (String(format).toLowerCase() === 'tmx') {
    if (!['csv', 'base64'].includes(encoding.toLowerCase())) {
      die('export --encoding must be csv|base64 for TMX');
    }
    if (compression && !['zlib', 'gzip', 'none'].includes(compression.toLowerCase())) {
      die('export --compression must be zlib|gzip (or omit); zstd not supported');
    }
    if (encoding.toLowerCase() === 'csv' && compression && compression.toLowerCase() !== 'none') {
      die('TMX CSV cannot be compressed; use --encoding base64 --compression zlib');
    }
  }
  const result = exportMap(map, format, out, {
    encoding,
    compression: compression.toLowerCase() === 'none' ? '' : compression,
  });
  ok(result);
}

function cmdSetTile(positional, flags) {
  const file = positional[0];
  if (!file) die('set-tile requires a map path');
  const map = loadMap(file);
  const x = parseIntFlag(flags.x, 'x', { min: map.infinite ? null : 0, allowZero: true, allowNegative: !!map.infinite });
  const y = parseIntFlag(flags.y, 'y', { min: map.infinite ? null : 0, allowZero: true, allowNegative: !!map.infinite });
  let gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
  gid = applyFlipFlags(gid, flags);
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
  const map = loadMap(file);
  const x = parseIntFlag(flags.x, 'x', { min: map.infinite ? null : 0, allowZero: true, allowNegative: !!map.infinite });
  const y = parseIntFlag(flags.y, 'y', { min: map.infinite ? null : 0, allowZero: true, allowNegative: !!map.infinite });
  const width = parseIntFlag(flags.width, 'width', { min: 1 });
  const height = parseIntFlag(flags.height, 'height', { min: 1 });
  let gid = parseIntFlag(flags.gid, 'gid', { min: 0, allowZero: true });
  gid = applyFlipFlags(gid, flags);
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
    x: gids.x != null ? gids.x : 0,
    y: gids.y != null ? gids.y : 0,
    infinite: !!gids.infinite,
    chunkCount: gids.chunkCount,
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
  if (!sub) die('prop requires subcommand: list|get|set|remove|types');

  // prop types list|get|add|remove <map>
  if (sub === 'types' || sub === 'type' || sub === 'propertytypes') {
    const tsub = positional[1];
    const file = positional[2];
    if (!tsub) die('prop types requires subcommand: list|get|add|remove');
    if (!file) die(`prop types ${tsub} requires a map path`);
    // Upstream Tiled stores custom types in the *project* file (.tiled-project, key "propertyTypes",
    // each with a numeric id). Support that directly; map-embedded propertytypes stay as CLI extension.
    const isProject = /\.tiled-project$/i.test(file);
    let project = null;
    let map;
    if (isProject) {
      project = fs.existsSync(file)
        ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : { automappingRulesFile: '', commands: [], extensionsPath: 'extensions', folders: ['.'], propertyTypes: [] };
      map = { propertytypes: Array.isArray(project.propertyTypes) ? project.propertyTypes : [] };
    } else {
      map = loadMap(file);
    }
    const saveTypes = () => {
      if (!isProject) return saveMap(map, { output: flags.output, inPlacePath: file });
      const list = map.propertytypes || [];
      let next = list.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
      for (const t of list) if (!Number.isInteger(t.id)) t.id = next++;
      project.propertyTypes = list;
      const out = flags.output || file;
      const body = JSON.stringify(project, null, 4) + '\n';
      fs.writeFileSync(out, body);
      return { path: path.resolve(out), format: 'tiled-project', bytes: Buffer.byteLength(body) };
    };
    if (tsub === 'list') {
      process.stdout.write(
        JSON.stringify(
          { file: path.resolve(file), propertytypes: listPropertyTypes(map) },
          null,
          2
        ) + '\n'
      );
      return;
    }
    if (tsub === 'get') {
      const expand = !(flags['no-expand'] || flags.noExpand);
      const rec = getPropertyType(map, flags.name, { expand });
      const { raw, ...rest } = rec;
      process.stdout.write(
        JSON.stringify(
          {
            file: path.resolve(file),
            ...rest,
            limits:
              'Classes nest via members type=class+propertyType (membersExpanded). No OO extends. useAs: property|map|layer|object|tile|tileset|wangcolor|wangset|project.',
          },
          null,
          2
        ) + '\n'
      );
      return;
    }
    if (tsub === 'add') {
      const rec = addPropertyType(map, flags);
      const saved = saveTypes();
      ok({ action: 'prop-types-add', propertytype: rec, ...saved });
      return;
    }
    if (tsub === 'remove') {
      const removed = removePropertyType(map, flags.name);
      if (!map.propertytypes) map.propertytypes = [];
      const saved = saveTypes();
      ok({
        action: 'prop-types-remove',
        removed: { name: removed.name, type: removed.type || removed.kind },
        ...saved,
      });
      return;
    }
    die(`Unknown prop types subcommand: ${tsub} (use list|get|add|remove)`);
  }

  const file = positional[1];
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



function cmdStamp(positional, flags) {
  const sub = positional[0];
  const file = positional[1];
  if (!sub) die('stamp requires subcommand: copy|paste');
  if (!file) die(`stamp ${sub} requires a map path`);

  if (sub === 'copy') {
    const out = flags.output;
    if (!out) die('stamp copy requires -o / --output <stamp.json>');
    const map = loadMap(file);
    const stamp = copyStamp(map, {
      layer: flags.layer,
      x: flags.x,
      y: flags.y,
      width: flags.width,
      height: flags.height,
    });
    const written = writeStampFile(stamp, out);
    ok({ action: 'stamp-copy', ...written, source: stamp.source });
    return;
  }
  if (sub === 'paste') {
    const stampPath = flags.stamp;
    if (!stampPath || stampPath === true) die('stamp paste requires --stamp <stamp.json>');
    const map = loadMap(file);
    const stamp = loadStamp(stampPath);
    const result = pasteStamp(map, {
      layer: flags.layer,
      x: flags.x,
      y: flags.y,
      stamp,
    });
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({ action: 'stamp-paste', ...result, stamp: path.resolve(stampPath), ...saved });
    return;
  }
  die(`Unknown stamp subcommand: ${sub} (use copy|paste)`);
}

function cmdTemplate(positional, flags) {
  const sub = positional[0];
  if (!sub) die('template requires subcommand: info|index|apply');

  if (sub === 'info') {
    const file = positional[1];
    if (!file) die('template info requires a template path (.tx / .tj / .json)');
    const tpl = loadTemplate(file);
    process.stdout.write(JSON.stringify(templateInfo(tpl, file), null, 2) + '\n');
    return;
  }
  if (sub === 'index') {
    const dir = positional[1];
    if (!dir) die('template index requires a directory path');
    const recursive = !(flags['no-recursive'] || flags.noRecursive);
    const templates = indexTemplates(dir, { recursive });
    process.stdout.write(
      JSON.stringify(
        {
          dir: path.resolve(dir),
          recursive,
          count: templates.length,
          templates,
        },
        null,
        2
      ) + '\n'
    );
    return;
  }
  if (sub === 'apply') {
    const file = positional[1];
    if (!file) die('template apply requires a map path');
    const tplPath = flags.template;
    if (!tplPath || tplPath === true) die('template apply requires --template <file.tx|file.json>');
    const map = loadMap(file);
    const tpl = loadTemplate(tplPath);
    const { layer, object, tilesetMerge } = applyTemplate(map, {
      layer: flags.layer,
      template: tpl,
      x: flags.x,
      y: flags.y,
      createLayer: !!(flags['create-layer'] || flags.createLayer),
      mapPath: flags.output || file,
      templatePath: tplPath,
      mergeTileset: !(flags['no-merge-tileset'] || flags.noMergeTileset),
    });
    const saved = saveMap(map, { output: flags.output, inPlacePath: file });
    ok({
      action: 'template-apply',
      template: path.resolve(tplPath),
      layer: { id: layer.id, name: layer.name },
      object: summarizeObject(object),
      tilesetMerge: tilesetMerge || null,
      ...saved,
    });
    return;
  }
  die(`Unknown template subcommand: ${sub} (use info|index|apply)`);
}

function cmdReplaceGid(positional, flags) {
  const file = positional[0];
  if (!file) die('replace-gid requires a map path');
  if (flags.from == null || flags.from === true) die('replace-gid requires --from <gid>');
  if (flags.to == null || flags.to === true) die('replace-gid requires --to <gid>');
  const map = loadMap(file);
  const result = replaceGid(map, {
    from: flags.from,
    to: flags.to,
    layer: flags.layer,
    matchFlips: !!(flags['match-flips'] || flags.matchFlips),
  });
  const saved = saveMap(map, { output: flags.output, inPlacePath: file });
  ok({ action: 'replace-gid', ...result, ...saved });
}

function cmdAutomap(positional, flags) {
  const file = positional[0];
  if (!file) die('automap requires a map path');
  const rules = flags.rules;
  if (!rules || rules === true) die('automap requires --rules <rules.txt|rules.json|dir|rule.tmj>');
  const map = loadMap(file);
  const radius = flags.radius != null && flags.radius !== true ? flags.radius : undefined;
  const result = applyAutomapToMap(map, rules, {
    radius,
    x: flags.x != null && flags.x !== true ? flags.x : undefined,
    y: flags.y != null && flags.y !== true ? flags.y : undefined,
  });
  const saved = saveMap(map, { output: flags.output, inPlacePath: file });
  ok({
    action: 'automap',
    matches: result.matches,
    ruleFiles: result.ruleFiles,
    ruleCount: result.ruleCount,
    warnings: result.warnings,
    clip: result.clip,
    appliedSample: result.applied.slice(0, 20),
    appliedTotal: result.applied.length,
    ...saved,
  });
}

function cmdWorld(positional, flags) {
  const sub = positional[0];
  if (!sub) die('world requires subcommand: info|new|add-map|remove-map');

  if (sub === 'new') {
    const out = flags.output;
    if (!out) die('world new requires -o / --output <file.world>');
    const world = emptyWorld();
    const saved = saveWorld(world, out);
    ok({ action: 'world-new', ...saved, mapCount: 0 });
    return;
  }

  const file = positional[1];
  if (!file) die(`world ${sub} requires a .world path`);

  if (sub === 'info') {
    const world = loadWorld(file);
    process.stdout.write(JSON.stringify(worldInfo(world, file), null, 2) + '\n');
    return;
  }

  if (sub === 'add-map' || sub === 'addmap') {
    const world = loadWorld(file);
    const mapFile = flags.file || flags.map;
    if (!mapFile || mapFile === true) die('world add-map requires --file <map.tmj>');
    if (flags.x == null || flags.x === true) die('world add-map requires --x');
    if (flags.y == null || flags.y === true) die('world add-map requires --y');
    const fileName = relativizeMapFile(file, String(mapFile));
    const result = worldAddMap(world, {
      fileName,
      x: flags.x,
      y: flags.y,
      width: flags.width,
      height: flags.height,
      worldPath: file,
    });
    const saved = saveWorld(world, flags.output || file);
    ok({ action: 'world-add-map', ...result, ...saved });
    return;
  }

  if (sub === 'remove-map' || sub === 'removemap') {
    const world = loadWorld(file);
    const result = worldRemoveMap(world, {
      fileName: flags.file || flags.map,
      index: flags.index,
    });
    const saved = saveWorld(world, flags.output || file);
    ok({ action: 'world-remove-map', removed: result.removed, index: result.index, ...saved });
    return;
  }

  die(`Unknown world subcommand: ${sub} (use info|new|add-map|remove-map)`);
}


function buildCoordMeta(file, flags) {
  let meta = {};
  if (file) {
    const map = loadMap(file);
    meta = {
      orientation: map.orientation,
      tilewidth: map.tilewidth,
      tileheight: map.tileheight,
      width: map.width,
      height: map.height,
      staggeraxis: map.staggeraxis,
      staggerindex: map.staggerindex,
      hexsidelength: map.hexsidelength,
    };
  }
  // flags override map
  if (flags.orientation && flags.orientation !== true) meta.orientation = flags.orientation;
  if (flags.tilewidth != null && flags.tilewidth !== true) meta.tilewidth = flags.tilewidth;
  if (flags.tileheight != null && flags.tileheight !== true) meta.tileheight = flags.tileheight;
  if (flags.tileWidth != null) meta.tilewidth = flags.tileWidth;
  if (flags.tileHeight != null) meta.tileheight = flags.tileHeight;
  if (flags.width != null && flags.width !== true) meta.width = flags.width;
  if (flags.height != null && flags.height !== true) meta.height = flags.height;
  if (flags.staggeraxis != null && flags.staggeraxis !== true) meta.staggeraxis = flags.staggeraxis;
  if (flags['stagger-axis'] != null && flags['stagger-axis'] !== true) meta.staggeraxis = flags['stagger-axis'];
  if (flags.staggerindex != null && flags.staggerindex !== true) meta.staggerindex = flags.staggerindex;
  if (flags['stagger-index'] != null && flags['stagger-index'] !== true) meta.staggerindex = flags['stagger-index'];
  if (flags.hexsidelength != null && flags.hexsidelength !== true) meta.hexsidelength = flags.hexsidelength;
  if (flags['hex-side-length'] != null && flags['hex-side-length'] !== true) {
    meta.hexsidelength = flags['hex-side-length'];
  }
  return meta;
}

function cmdCoord(positional, flags) {
  const sub = positional[0];
  if (!sub) die('coord requires subcommand: tile-to-pixel|pixel-to-tile');
  // positional[1] may be map path (optional)
  const file = positional[1];
  if (flags.x == null || flags.x === true) die(`coord ${sub} requires --x`);
  if (flags.y == null || flags.y === true) die(`coord ${sub} requires --y`);
  const meta = buildCoordMeta(file, flags);
  if (sub === 'tile-to-pixel' || sub === 'tile2pixel' || sub === 't2p') {
    const result = tileToPixel(meta, flags.x, flags.y);
    process.stdout.write(
      JSON.stringify({ action: 'tile-to-pixel', map: file ? path.resolve(file) : null, ...result }, null, 2) +
        '\n'
    );
    return;
  }
  if (sub === 'pixel-to-tile' || sub === 'pixel2tile' || sub === 'p2t') {
    const result = pixelToTile(meta, flags.x, flags.y);
    process.stdout.write(
      JSON.stringify({ action: 'pixel-to-tile', map: file ? path.resolve(file) : null, ...result }, null, 2) +
        '\n'
    );
    return;
  }
  die(`Unknown coord subcommand: ${sub} (use tile-to-pixel|pixel-to-tile)`);
}

function cmdWang(positional, flags) {
  const sub = positional[0] || 'list';
  const file = positional[1] || (sub !== 'list' ? null : positional[0] === 'list' ? positional[1] : positional[0]);
  // Accept: wang list <map>  OR  wang <map>
  let mapFile = positional[1];
  let subcmd = positional[0];
  if (subcmd !== 'list' && positional.length === 1) {
    mapFile = positional[0];
    subcmd = 'list';
  }
  if (subcmd !== 'list') die(`Unknown wang subcommand: ${subcmd} (use list)`);
  if (!mapFile) die('wang list requires a map path');
  const map = loadMap(mapFile);
  const wang = listWang(map, { mapPath: mapFile });
  process.stdout.write(
    JSON.stringify({ file: path.resolve(mapFile), count: wang.length, tilesets: wang }, null, 2) + '\n'
  );
}

function cmdTerrain(positional, flags) {
  let mapFile = positional[1];
  let subcmd = positional[0];
  if (subcmd !== 'list' && positional.length === 1) {
    mapFile = positional[0];
    subcmd = 'list';
  }
  if (!subcmd) subcmd = 'list';
  if (subcmd !== 'list') die(`Unknown terrain subcommand: ${subcmd} (use list)`);
  if (!mapFile) die('terrain list requires a map path');
  const map = loadMap(mapFile);
  const terrains = listTerrain(map, { mapPath: mapFile });
  process.stdout.write(
    JSON.stringify({ file: path.resolve(mapFile), count: terrains.length, tilesets: terrains }, null, 2) +
      '\n'
  );
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
      case 'automap':
      case 'auto-map':
        cmdAutomap(positional, flags);
        break;
      case 'world':
        cmdWorld(positional, flags);
        break;
      case 'replace-gid':
      case 'replacegid':
      case 'replace':
        cmdReplaceGid(positional, flags);
        break;
      case 'stamp':
        cmdStamp(positional, flags);
        break;
      case 'template':
      case 'tpl':
        cmdTemplate(positional, flags);
        break;
      case 'coord':
      case 'coords':
        cmdCoord(positional, flags);
        break;
      case 'wang':
        cmdWang(positional, flags);
        break;
      case 'terrain':
      case 'terrains':
        cmdTerrain(positional, flags);
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

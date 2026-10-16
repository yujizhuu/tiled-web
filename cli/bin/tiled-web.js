#!/usr/bin/env node
'use strict';

/**
 * tiled-web CLI — Phase 1 (create / info / export)
 * Humans: browser UI under tool/
 * Agents: this CLI
 */

const path = require('path');
const { die, writeText } = require('../lib/util');
const { createEmptyMap } = require('../lib/create');
const { loadMap } = require('../lib/load');
const { exportMap } = require('../lib/export');
const { mapInfo, formatInfoHuman } = require('../lib/info');

const PKG = require('../package.json');

function usage(code = 0) {
  const text = `tiled-web ${PKG.version} — Phase 1 CLI (create / info / export)

Usage:
  tiled-web version
  tiled-web new --width W --height H [--tilewidth TW] [--tileheight TH] -o map.tmj
  tiled-web info <map.tmj|map.tmx> [--format json|text]
  tiled-web export <map.tmj|map.tmx> -f tmj|tmx|csv -o <out>

Notes:
  - Default info output is JSON (agent-friendly). Use --format text for humans.
  - CSV export uses the first tile layer's GIDs.
  - TMX support is minimal orthogonal (CSV data); not full desktop Tiled parity.
  - Browser UI is unchanged; full editing CLI is later phases.

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
    } else if (a === '-o' || a === '-f') {
      const next = args[i + 1];
      if (next == null) die(`Missing value for ${a}`);
      flags[a === '-o' ? 'output' : 'format'] = next;
      i += 1;
    } else {
      positional.push(a);
    }
  }
  // normalize aliases
  if (flags.o && !flags.output) flags.output = flags.o;
  if (flags.f && !flags.format) flags.format = flags.f;
  return { cmd, flags, positional };
}

function cmdVersion() {
  process.stdout.write(`tiled-web ${PKG.version}\n`);
  process.stdout.write(`phase: 1 (create/info/export)\n`);
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
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        path: path.resolve(out),
        width: map.width,
        height: map.height,
        tilewidth: map.tilewidth,
        tileheight: map.tileheight,
      },
      null,
      2
    ) + '\n'
  );
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
  process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + '\n');
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

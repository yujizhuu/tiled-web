#!/usr/bin/env node
'use strict';

/**
 * tiled-web MCP server (stdio, JSON-RPC 2.0) — Phase 7
 * Zero npm deps. Spawns the sibling CLI binary so tool behavior matches CLI.
 *
 * Cursor / Claude Desktop example (~/.cursor/mcp.json or Claude config):
 * {
 *   "mcpServers": {
 *     "tiled-web": {
 *       "command": "node",
 *       "args": ["/ABS/PATH/to/tiled-web/cli/mcp-server.js"]
 *     }
 *   }
 * }
 */

const { spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

const CLI = path.join(__dirname, 'bin', 'tiled-web.js');
const PKG = require('./package.json');

const PROTOCOL_VERSION = '2024-11-05';

/** @type {{name:string,description:string,inputSchema:object,buildArgs:(a:object)=>string[]}[]} */
const TOOLS = [
  {
    name: 'tiled_version',
    description: 'Return tiled-web CLI version and phase',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    buildArgs: () => ['version'],
  },
  {
    name: 'tiled_info',
    description: 'Inspect a map (size, layers, tilesets). format: json|text',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string', description: 'Path to .tmj / .tmx' },
        format: { type: 'string', enum: ['json', 'text'], description: 'Output format (default json)' },
      },
      required: ['map'],
    },
    buildArgs: (a) => {
      const args = ['info', a.map];
      if (a.format) args.push('--format', String(a.format));
      return args;
    },
  },
  {
    name: 'tiled_new',
    description: 'Create an empty map (.tmj)',
    inputSchema: {
      type: 'object',
      properties: {
        output: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        tilewidth: { type: 'number' },
        tileheight: { type: 'number' },
        infinite: { type: 'boolean' },
        orientation: { type: 'string', enum: ['orthogonal', 'isometric', 'hexagonal', 'staggered'] },
      },
      required: ['output', 'width', 'height'],
    },
    buildArgs: (a) => {
      const args = ['new', '--width', String(a.width), '--height', String(a.height), '-o', a.output];
      if (a.tilewidth != null) args.push('--tilewidth', String(a.tilewidth));
      if (a.tileheight != null) args.push('--tileheight', String(a.tileheight));
      if (a.infinite) args.push('--infinite');
      if (a.orientation) args.push('--orientation', String(a.orientation));
      return args;
    },
  },
  {
    name: 'tiled_set_tile',
    description: 'Set a single tile GID (optional flips)',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        gid: { type: 'number' },
        layer: { type: ['string', 'number'] },
        flipH: { type: 'boolean' },
        flipV: { type: 'boolean' },
        flipD: { type: 'boolean' },
        output: { type: 'string' },
      },
      required: ['map', 'x', 'y', 'gid'],
    },
    buildArgs: (a) => {
      const args = ['set-tile', a.map, '--x', String(a.x), '--y', String(a.y), '--gid', String(a.gid)];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.flipH) args.push('--flip-h');
      if (a.flipV) args.push('--flip-v');
      if (a.flipD) args.push('--flip-d');
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_fill',
    description: 'Fill a rectangle with a GID',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        gid: { type: 'number' },
        layer: { type: ['string', 'number'] },
        output: { type: 'string' },
      },
      required: ['map', 'x', 'y', 'width', 'height', 'gid'],
    },
    buildArgs: (a) => {
      const args = [
        'fill', a.map,
        '--x', String(a.x), '--y', String(a.y),
        '--width', String(a.width), '--height', String(a.height),
        '--gid', String(a.gid),
      ];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_get_layer',
    description: 'Read tile layer GIDs as json or csv',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        layer: { type: ['string', 'number'] },
        format: { type: 'string', enum: ['json', 'csv'] },
        output: { type: 'string' },
      },
      required: ['map'],
    },
    buildArgs: (a) => {
      const args = ['get-layer', a.map];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.format) args.push('--format', String(a.format));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_layer',
    description: 'Layer list|add|remove|rename. Pass subcommand + map + fields.',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['list', 'add', 'remove', 'rename'] },
        map: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['tile', 'object'] },
        layer: { type: ['string', 'number'] },
        output: { type: 'string' },
      },
      required: ['subcommand', 'map'],
    },
    buildArgs: (a) => {
      const args = ['layer', a.subcommand, a.map];
      if (a.name != null) args.push('--name', String(a.name));
      if (a.type != null) args.push('--type', String(a.type));
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_object',
    description: 'Object list|add|remove|update',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['list', 'add', 'remove', 'update'] },
        map: { type: 'string' },
        layer: { type: ['string', 'number'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        name: { type: 'string' },
        type: { type: 'string' },
        id: { type: 'number' },
        shape: { type: 'string' },
        createLayer: { type: 'boolean' },
        output: { type: 'string' },
      },
      required: ['subcommand', 'map'],
    },
    buildArgs: (a) => {
      const args = ['object', a.subcommand, a.map];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.x != null) args.push('--x', String(a.x));
      if (a.y != null) args.push('--y', String(a.y));
      if (a.width != null) args.push('--width', String(a.width));
      if (a.height != null) args.push('--height', String(a.height));
      if (a.name != null) args.push('--name', String(a.name));
      if (a.type != null) args.push('--type', String(a.type));
      if (a.id != null) args.push('--id', String(a.id));
      if (a.shape != null) args.push('--shape', String(a.shape));
      if (a.createLayer) args.push('--create-layer');
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_prop',
    description: 'Custom properties: list|get|set|remove, or types list|get|add|remove',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['list', 'get', 'set', 'remove', 'types'] },
        typesSubcommand: { type: 'string', enum: ['list', 'get', 'add', 'remove'] },
        map: { type: 'string' },
        target: { type: 'string', enum: ['map', 'layer', 'object', 'tileset'] },
        name: { type: 'string' },
        value: { type: ['string', 'number', 'boolean'] },
        type: { type: 'string' },
        layer: { type: ['string', 'number'] },
        id: { type: 'number' },
        tileset: { type: ['string', 'number'] },
        values: { type: 'string', description: 'For types add enum: comma list or JSON array' },
        members: { type: 'string', description: 'For types add class: JSON members array' },
        useAs: { type: 'string', description: 'For types add: comma list e.g. property,object,tile' },
        noExpand: { type: 'boolean', description: 'For types get: skip membersExpanded' },
        output: { type: 'string' },
      },
      required: ['subcommand', 'map'],
    },
    buildArgs: (a) => {
      if (a.subcommand === 'types') {
        const tsub = a.typesSubcommand || 'list';
        const args = ['prop', 'types', tsub, a.map];
        if (a.name != null) args.push('--name', String(a.name));
        if (a.type != null) args.push('--type', String(a.type));
        if (a.values != null) args.push('--values', String(a.values));
        if (a.members != null) args.push('--members', String(a.members));
        if (a.useAs != null) args.push('--use-as', String(a.useAs));
        if (a.noExpand) args.push('--no-expand');
        if (a.output) args.push('-o', a.output);
        return args;
      }
      const args = ['prop', a.subcommand, a.map];
      if (a.target) args.push('--target', String(a.target));
      if (a.name != null) args.push('--name', String(a.name));
      if (a.value != null) args.push('--value', String(a.value));
      if (a.type != null) args.push('--type', String(a.type));
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.id != null) args.push('--id', String(a.id));
      if (a.tileset != null) args.push('--tileset', String(a.tileset));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_stamp',
    description: 'Stamp copy|paste',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['copy', 'paste'] },
        map: { type: 'string' },
        layer: { type: ['string', 'number'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        stamp: { type: 'string' },
        output: { type: 'string' },
      },
      required: ['subcommand', 'map'],
    },
    buildArgs: (a) => {
      const args = ['stamp', a.subcommand, a.map];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.x != null) args.push('--x', String(a.x));
      if (a.y != null) args.push('--y', String(a.y));
      if (a.width != null) args.push('--width', String(a.width));
      if (a.height != null) args.push('--height', String(a.height));
      if (a.stamp) args.push('--stamp', a.stamp);
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_template',
    description: 'Template info|index|apply (apply auto-merges tilesets; index scans a directory)',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['info', 'index', 'apply'] },
        map: { type: 'string' },
        template: { type: 'string' },
        dir: { type: 'string' },
        layer: { type: ['string', 'number'] },
        x: { type: 'number' },
        y: { type: 'number' },
        createLayer: { type: 'boolean' },
        noRecursive: { type: 'boolean' },
        output: { type: 'string' },
      },
      required: ['subcommand'],
    },
    buildArgs: (a) => {
      if (a.subcommand === 'info') {
        if (!a.template) throw new Error('template info requires template path');
        return ['template', 'info', a.template];
      }
      if (a.subcommand === 'index') {
        if (!a.dir) throw new Error('template index requires dir');
        const args = ['template', 'index', a.dir];
        if (a.noRecursive) args.push('--no-recursive');
        return args;
      }
      const args = ['template', 'apply', a.map, '--template', a.template, '--x', String(a.x), '--y', String(a.y)];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.createLayer) args.push('--create-layer');
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_automap',
    description: 'Apply AutoMap rules',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        rules: { type: 'string' },
        radius: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
        output: { type: 'string' },
      },
      required: ['map', 'rules'],
    },
    buildArgs: (a) => {
      const args = ['automap', a.map, '--rules', a.rules];
      if (a.radius != null) args.push('--radius', String(a.radius));
      if (a.x != null) args.push('--x', String(a.x));
      if (a.y != null) args.push('--y', String(a.y));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_world',
    description: 'World info|new|add-map|remove-map',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['info', 'new', 'add-map', 'remove-map'] },
        world: { type: 'string' },
        file: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        index: { type: 'number' },
        output: { type: 'string' },
      },
      required: ['subcommand'],
    },
    buildArgs: (a) => {
      if (a.subcommand === 'new') {
        if (!a.output && !a.world) throw new Error('world new requires output/world path');
        return ['world', 'new', '-o', a.output || a.world];
      }
      const args = ['world', a.subcommand, a.world];
      if (a.file) args.push('--file', a.file);
      if (a.x != null) args.push('--x', String(a.x));
      if (a.y != null) args.push('--y', String(a.y));
      if (a.width != null) args.push('--width', String(a.width));
      if (a.height != null) args.push('--height', String(a.height));
      if (a.index != null) args.push('--index', String(a.index));
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_replace_gid',
    description: 'Batch replace tile GIDs',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        from: { type: 'number' },
        to: { type: 'number' },
        layer: { type: ['string', 'number'] },
        matchFlips: { type: 'boolean' },
        output: { type: 'string' },
      },
      required: ['map', 'from', 'to'],
    },
    buildArgs: (a) => {
      const args = ['replace-gid', a.map, '--from', String(a.from), '--to', String(a.to)];
      if (a.layer != null) args.push('--layer', String(a.layer));
      if (a.matchFlips) args.push('--match-flips');
      if (a.output) args.push('-o', a.output);
      return args;
    },
  },
  {
    name: 'tiled_export',
    description: 'Export map to tmj|tmx|csv (TMX: optional encoding/compression; infinite emits chunks)',
    inputSchema: {
      type: 'object',
      properties: {
        map: { type: 'string' },
        format: { type: 'string', enum: ['tmj', 'tmx', 'csv'] },
        output: { type: 'string' },
        encoding: { type: 'string', enum: ['csv', 'base64'] },
        compression: { type: 'string', enum: ['zlib', 'gzip'] },
      },
      required: ['map', 'format', 'output'],
    },
    buildArgs: (a) => {
      const args = ['export', a.map, '-f', a.format, '-o', a.output];
      if (a.encoding) args.push('--encoding', a.encoding);
      if (a.compression) args.push('--compression', a.compression);
      return args;
    },
  },
  {
    name: 'tiled_coord',
    description: 'Convert tile↔pixel for orthogonal/isometric/hexagonal',
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: { type: 'string', enum: ['tile-to-pixel', 'pixel-to-tile'] },
        map: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        orientation: { type: 'string' },
        tilewidth: { type: 'number' },
        tileheight: { type: 'number' },
        staggeraxis: { type: 'string' },
        staggerindex: { type: 'string' },
        hexsidelength: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['subcommand', 'x', 'y'],
    },
    buildArgs: (a) => {
      const args = ['coord', a.subcommand];
      if (a.map) args.push(a.map);
      args.push('--x', String(a.x), '--y', String(a.y));
      for (const k of ['orientation', 'tilewidth', 'tileheight', 'staggeraxis', 'staggerindex', 'hexsidelength', 'width', 'height']) {
        if (a[k] != null) args.push('--' + k, String(a[k]));
      }
      return args;
    },
  },
  {
    name: 'tiled_wang',
    description: 'List wangsets from map tilesets (data only)',
    inputSchema: {
      type: 'object',
      properties: { map: { type: 'string' } },
      required: ['map'],
    },
    buildArgs: (a) => ['wang', 'list', a.map],
  },
  {
    name: 'tiled_terrain',
    description: 'List terraintypes from map tilesets (data only)',
    inputSchema: {
      type: 'object',
      properties: { map: { type: 'string' } },
      required: ['map'],
    },
    buildArgs: (a) => ['terrain', 'list', a.map],
  },
];

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  return {
    code: r.status == null ? 1 : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

// Framing of the peer, detected from the first inbound message. The MCP stdio transport spec
// (modelcontextprotocol.io, "Transports > stdio") is newline-delimited JSON; Content-Length
// (LSP-style) is accepted for legacy clients and then mirrored back.
let framing = null; // 'cl' | 'ndjson'

function send(msg) {
  const body = JSON.stringify(msg); // JSON.stringify never emits raw newlines
  if (framing === 'cl') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
  } else {
    process.stdout.write(body + '\n');
  }
}

function okResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function errResult(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return;
  // notifications have no id
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};

  if (method === 'initialize') {
    okResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'tiled-web', version: PKG.version },
    });
    return;
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }

  if (method === 'ping') {
    okResult(id, {});
    return;
  }

  if (method === 'tools/list') {
    okResult(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
    return;
  }

  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      okResult(id, {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      });
      return;
    }
    let cliArgs;
    try {
      cliArgs = tool.buildArgs(args);
    } catch (err) {
      okResult(id, {
        content: [{ type: 'text', text: err.message || String(err) }],
        isError: true,
      });
      return;
    }
    const r = runCli(cliArgs);
    const text = (r.stdout || '') + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '');
    okResult(id, {
      content: [{ type: 'text', text: text || (r.error || `exit ${r.code}`) }],
      isError: r.code !== 0,
    });
    return;
  }

  if (id !== undefined) {
    errResult(id, -32601, `Method not found: ${method}`);
  }
}

function start() {
  let buffer = Buffer.alloc(0);
  let mode = null; // 'cl' | 'ndjson'

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (mode === null) {
        // Detect framing
        const head = buffer.toString('utf8', 0, Math.min(buffer.length, 64));
        if (/^Content-Length:/i.test(head) || buffer.includes(Buffer.from('\r\n\r\n'))) {
          mode = 'cl';
        } else if (buffer.includes(0x0a) && head.trim().startsWith('{')) {
          mode = 'ndjson';
        } else if (buffer.length > 0 && !head.includes('{')) {
          // wait for more
          break;
        } else if (buffer.length > 8 && head.trim().startsWith('{')) {
          mode = 'ndjson';
        } else {
          break;
        }
      }

      framing = mode;
      if (mode === 'cl') {
        const sep = buffer.indexOf('\r\n\r\n');
        if (sep < 0) break;
        const header = buffer.slice(0, sep).toString('utf8');
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          // malformed — drop header
          buffer = buffer.slice(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buffer.length < start + len) break;
        const body = buffer.slice(start, start + len).toString('utf8');
        buffer = buffer.slice(start + len);
        try {
          handleMessage(JSON.parse(body));
        } catch (err) {
          process.stderr.write(`MCP parse error: ${err.message}\n`);
        }
      } else {
        // newline-delimited JSON
        const nl = buffer.indexOf(0x0a);
        if (nl < 0) break;
        const line = buffer.slice(0, nl).toString('utf8').trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          handleMessage(JSON.parse(line));
        } catch (err) {
          process.stderr.write(`MCP parse error: ${err.message}\n`);
        }
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
}

if (require.main === module) {
  start();
}

module.exports = { TOOLS, runCli, handleMessage };

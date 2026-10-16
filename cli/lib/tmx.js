'use strict';

/**
 * Minimal TMX read/write for Phase 1 orthogonal maps.
 * Supports CSV-encoded tile data (and simple base64 uncompressed via Buffer).
 * No DOM — pure string/regex parsing suited for empty/simple maps.
 */

const { xmlEscape, tileAt } = require('./util');

function parseAttrs(tagInner) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagInner))) attrs[m[1]] = m[2];
  return attrs;
}

function decodeCsvGids(text) {
  return String(text)
    .replace(/\s+/g, '')
    .split(',')
    .filter((s) => s.length)
    .map((v) => (Number(v) >>> 0) || 0);
}

function decodeBase64Gids(text) {
  const buf = Buffer.from(String(text).replace(/\s+/g, ''), 'base64');
  if (buf.length % 4 !== 0) {
    throw new Error('TMX base64 tile data length is not a multiple of 4');
  }
  const out = [];
  for (let i = 0; i < buf.length; i += 4) {
    out.push(buf.readUInt32LE(i));
  }
  return out;
}

function decodeLayerData(raw, encoding, compression) {
  const enc = (encoding || (String(raw).includes(',') ? 'csv' : 'base64')).toLowerCase();
  const comp = (compression || '').toLowerCase();
  if (comp && comp !== 'none') {
    throw new Error(`TMX compression "${comp}" not supported in Phase 1 CLI (use CSV or uncompressed base64)`);
  }
  if (enc === 'csv' || (!encoding && String(raw).includes(','))) return decodeCsvGids(raw);
  if (enc === 'base64') return decodeBase64Gids(raw);
  throw new Error(`Unsupported TMX data encoding: ${enc || '(empty)'}`);
}

/**
 * Extract direct child element blocks by tag name (non-nested-safe for same-name siblings).
 * For Phase 1 we only need map > tileset|layer|objectgroup|imagelayer|group|properties.
 */
function findChildBlocks(xml, parentTagHint) {
  // Strip XML declaration / comments roughly
  let body = String(xml).replace(/<\?xml[^?]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const mapOpen = body.match(/<map\b([^>]*)>/i);
  if (!mapOpen) throw new Error('TMX: missing <map> root');
  const mapAttrs = parseAttrs(mapOpen[1]);
  const mapStart = mapOpen.index + mapOpen[0].length;
  const mapClose = body.toLowerCase().lastIndexOf('</map>');
  if (mapClose < 0) throw new Error('TMX: missing </map>');
  const inner = body.slice(mapStart, mapClose);
  return { mapAttrs, inner };
}

function parseElementBlocks(inner, tagNames) {
  const tags = new Set(tagNames.map((t) => t.toLowerCase()));
  const results = [];
  const re = /<([A-Za-z]+)(\s[^>]*)?(\/>|>)/g;
  let m;
  while ((m = re.exec(inner))) {
    const tag = m[1].toLowerCase();
    if (!tags.has(tag)) continue;
    const selfClosing = m[3] === '/>';
    const attrs = parseAttrs(m[2] || '');
    if (selfClosing) {
      results.push({ tag, attrs, content: '', fullStart: m.index, fullEnd: re.lastIndex });
      continue;
    }
    const openEnd = re.lastIndex;
    const closeTag = `</${m[1]}>`;
    // naive nested depth for same tag
    let depth = 1;
    let pos = openEnd;
    const lower = inner.toLowerCase();
    const openPat = new RegExp(`<${tag}\\b`, 'gi');
    const closePat = new RegExp(`</${tag}>`, 'gi');
    while (depth > 0 && pos < inner.length) {
      openPat.lastIndex = pos;
      closePat.lastIndex = pos;
      const nextOpen = openPat.exec(inner);
      const nextClose = closePat.exec(inner);
      if (!nextClose) throw new Error(`TMX: unclosed <${tag}>`);
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        pos = nextOpen.index + 1;
      } else {
        depth -= 1;
        if (depth === 0) {
          results.push({
            tag,
            attrs,
            content: inner.slice(openEnd, nextClose.index),
            fullStart: m.index,
            fullEnd: nextClose.index + nextClose[0].length,
          });
          re.lastIndex = nextClose.index + nextClose[0].length;
          break;
        }
        pos = nextClose.index + 1;
      }
    }
  }
  return results;
}

function parseProperties(content) {
  const props = {};
  const re = /<property\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(content))) {
    const a = parseAttrs(m[1]);
    if (!a.name) continue;
    let val = a.value != null ? a.value : '';
    if ((a.type || 'string') === 'bool') val = val === 'true' || val === '1';
    else if (a.type === 'int') val = Number(val) || 0;
    else if (a.type === 'float') val = Number(val) || 0;
    props[a.name] = val;
  }
  return props;
}

function parseObject(block) {
  const a = block.attrs;
  const rec = {
    id: Number(a.id || 1),
    name: a.name || '',
    type: a.type || '',
    x: Number(a.x || 0),
    y: Number(a.y || 0),
    width: Number(a.width || 0),
    height: Number(a.height || 0),
    rotation: Number(a.rotation || 0),
    visible: a.visible !== '0',
  };
  if (a.gid) rec.gid = Number(a.gid) >>> 0;
  if (/<ellipse\b/i.test(block.content)) rec.ellipse = true;
  if (/<point\b/i.test(block.content)) rec.point = true;
  const poly = block.content.match(/<polygon\b[^>]*points="([^"]*)"/i);
  const line = block.content.match(/<polyline\b[^>]*points="([^"]*)"/i);
  if (poly) {
    rec.polygon = poly[1].trim().split(/\s+/).filter(Boolean).map((v) => {
      const [x, y] = v.split(',').map(Number);
      return { x, y };
    });
  }
  if (line) {
    rec.polyline = line[1].trim().split(/\s+/).filter(Boolean).map((v) => {
      const [x, y] = v.split(',').map(Number);
      return { x, y };
    });
  }
  const text = block.content.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i);
  if (text) rec.text = text[1];
  const propsBlock = parseElementBlocks(block.content, ['properties'])[0];
  if (propsBlock) rec.properties = parseProperties(propsBlock.content);
  return rec;
}

function parseTileLayer(block, map) {
  const a = block.attrs;
  const layer = {
    id: Number(a.id || 1),
    name: a.name || 'Layer',
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: Number(a.width || map.width),
    height: Number(a.height || map.height),
    opacity: a.opacity != null ? Number(a.opacity) : 1,
    visible: a.visible !== '0',
    offsetx: Number(a.offsetx || 0),
    offsety: Number(a.offsety || 0),
  };
  const propsBlock = parseElementBlocks(block.content, ['properties'])[0];
  if (propsBlock) layer.properties = parseProperties(propsBlock.content);

  const dataBlocks = parseElementBlocks(block.content, ['data']);
  if (!dataBlocks.length) {
    layer.data = Array(layer.width * layer.height).fill(0);
    return layer;
  }
  const data = dataBlocks[0];
  const encoding = data.attrs.encoding || '';
  const compression = data.attrs.compression || '';
  const chunks = parseElementBlocks(data.content, ['chunk']);
  if (chunks.length) {
    map.infinite = true;
    layer.chunks = chunks.map((c) => ({
      x: Number(c.attrs.x || 0),
      y: Number(c.attrs.y || 0),
      width: Number(c.attrs.width || 16),
      height: Number(c.attrs.height || 16),
      data: decodeLayerData(
        c.content,
        c.attrs.encoding || encoding,
        c.attrs.compression || compression
      ),
    }));
  } else {
    layer.data = decodeLayerData(data.content, encoding, compression);
  }
  return layer;
}

function parseLayers(inner, map) {
  const out = [];
  const blocks = parseElementBlocks(inner, ['layer', 'objectgroup', 'imagelayer', 'group']);
  // parseElementBlocks finds all matching tags including nested — filter to top-level only
  const topLevel = blocks.filter((b) => {
    // A block is top-level if no earlier unclosed sibling wraps it — approximate by
    // checking it is not strictly inside another block's range among the same list.
    return !blocks.some(
      (other) => other !== b && other.fullStart < b.fullStart && other.fullEnd > b.fullEnd
    );
  });

  for (const b of topLevel) {
    if (b.tag === 'layer') {
      out.push(parseTileLayer(b, map));
    } else if (b.tag === 'objectgroup') {
      const a = b.attrs;
      const objects = parseElementBlocks(b.content, ['object']).map(parseObject);
      const layer = {
        id: Number(a.id || out.length + 1),
        name: a.name || 'Object Layer',
        type: 'objectgroup',
        opacity: a.opacity != null ? Number(a.opacity) : 1,
        visible: a.visible !== '0',
        objects,
      };
      const propsBlock = parseElementBlocks(b.content, ['properties'])[0];
      if (propsBlock) layer.properties = parseProperties(propsBlock.content);
      out.push(layer);
    } else if (b.tag === 'imagelayer') {
      const a = b.attrs;
      const img = b.content.match(/<image\b([^>]*)\/?>/i);
      const imgAttrs = img ? parseAttrs(img[1]) : {};
      out.push({
        id: Number(a.id || out.length + 1),
        name: a.name || 'Image Layer',
        type: 'imagelayer',
        offsetx: Number(a.offsetx || 0),
        offsety: Number(a.offsety || 0),
        opacity: a.opacity != null ? Number(a.opacity) : 1,
        visible: a.visible !== '0',
        image: imgAttrs.source || '',
      });
    } else if (b.tag === 'group') {
      const a = b.attrs;
      out.push({
        id: Number(a.id || out.length + 1),
        name: a.name || 'Group',
        type: 'group',
        opacity: a.opacity != null ? Number(a.opacity) : 1,
        visible: a.visible !== '0',
        layers: parseLayers(b.content, map),
      });
    }
  }
  return out;
}

function parseTilesets(inner, map) {
  const blocks = parseElementBlocks(inner, ['tileset']);
  // only direct children of map: tileset not nested
  const top = blocks.filter(
    (b) => !blocks.some((o) => o !== b && o.fullStart < b.fullStart && o.fullEnd > b.fullEnd)
  );
  return top.map((b) => {
    const a = b.attrs;
    const img = b.content.match(/<image\b([^>]*)\/?>/i);
    const imgAttrs = img ? parseAttrs(img[1]) : {};
    return {
      firstgid: Number(a.firstgid || 1),
      name: a.name || '',
      tilewidth: Number(a.tilewidth || map.tilewidth),
      tileheight: Number(a.tileheight || map.tileheight),
      tilecount: Number(a.tilecount || 0),
      columns: Number(a.columns || 0),
      margin: Number(a.margin || 0),
      spacing: Number(a.spacing || 0),
      image: imgAttrs.source || '',
      source: a.source || '',
    };
  });
}

function parseTmx(text) {
  const { mapAttrs, inner } = findChildBlocks(text);
  const map = {
    version: mapAttrs.version || '1.2',
    tiledversion: mapAttrs.tiledversion || '1.2.4',
    orientation: mapAttrs.orientation || 'orthogonal',
    renderorder: mapAttrs.renderorder || 'right-down',
    width: Number(mapAttrs.width || 1),
    height: Number(mapAttrs.height || 1),
    tilewidth: Number(mapAttrs.tilewidth || 32),
    tileheight: Number(mapAttrs.tileheight || 32),
    infinite: mapAttrs.infinite === '1',
    staggeraxis: mapAttrs.staggeraxis || 'y',
    staggerindex: mapAttrs.staggerindex || 'odd',
    hexsidelength: Number(mapAttrs.hexsidelength || 0),
    layers: [],
    tilesets: [],
  };
  const propsBlock = parseElementBlocks(inner, ['properties']).find((b) => {
    // map-level properties: not inside other elements — approximate by earliest small block
    return true;
  });
  // Only take properties that appear before first layer/tileset-like sibling at map root
  const rootProps = parseElementBlocks(inner, ['properties']).filter((b) => {
    const layersEtc = parseElementBlocks(inner, ['layer', 'objectgroup', 'imagelayer', 'group', 'tileset']);
    return !layersEtc.some((o) => o.fullStart < b.fullStart && o.fullEnd > b.fullEnd);
  });
  if (rootProps[0]) map.properties = parseProperties(rootProps[0].content);

  map.tilesets = parseTilesets(inner, map);
  map.layers = parseLayers(inner, map);
  return map;
}

function objectXml(o, indent = '    ') {
  const attrs = [
    `id="${o.id || 1}"`,
    `name="${xmlEscape(o.name || '')}"`,
    `type="${xmlEscape(o.type || '')}"`,
    `x="${o.x || 0}"`,
    `y="${o.y || 0}"`,
    `width="${o.width || 0}"`,
    `height="${o.height || 0}"`,
  ];
  if (o.rotation) attrs.push(`rotation="${o.rotation}"`);
  if (o.visible === false) attrs.push('visible="0"');
  if (o.gid) attrs.push(`gid="${o.gid >>> 0}"`);
  let shape = '';
  if (o.ellipse) shape = '<ellipse/>';
  else if (o.point) shape = '<point/>';
  else if (o.polygon) {
    shape = `<polygon points="${o.polygon.map((pt) => `${pt.x},${pt.y}`).join(' ')}"/>`;
  } else if (o.polyline) {
    shape = `<polyline points="${o.polyline.map((pt) => `${pt.x},${pt.y}`).join(' ')}"/>`;
  }
  const text = o.text !== undefined ? `<text>${xmlEscape(o.text)}</text>` : '';
  const inner = shape + text;
  if (!inner) return `${indent}<object ${attrs.join(' ')}/>`;
  return `${indent}<object ${attrs.join(' ')}>${inner}</object>`;
}

function layerToTmx(l, m, indent = '  ') {
  if (l.type === 'tilelayer') {
    const rows = [];
    const w = m.width;
    const h = m.height;
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) row.push(tileAt(l, x, y, m) >>> 0);
      rows.push(row.join(','));
    }
    return (
      `${indent}<layer id="${l.id || 1}" name="${xmlEscape(l.name || 'Layer')}" width="${w}" height="${h}"` +
      `${l.opacity != null && l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''}` +
      `${l.visible === false ? ' visible="0"' : ''}>\n` +
      `${indent}  <data encoding="csv">\n${rows.join(',\n')}\n${indent}  </data>\n` +
      `${indent}</layer>`
    );
  }
  if (l.type === 'objectgroup') {
    const objects = (l.objects || []).map((o) => objectXml(o, indent + '  ')).join('\n');
    return (
      `${indent}<objectgroup id="${l.id || 1}" name="${xmlEscape(l.name || 'Object Layer')}"` +
      `${l.visible === false ? ' visible="0"' : ''}>\n${objects}\n${indent}</objectgroup>`
    );
  }
  if (l.type === 'imagelayer') {
    const src = String(l.image || '').startsWith('data:') ? '' : xmlEscape(l.image || '');
    return (
      `${indent}<imagelayer id="${l.id || 1}" name="${xmlEscape(l.name || 'Image Layer')}"` +
      `${l.offsetx ? ` offsetx="${l.offsetx}"` : ''}${l.offsety ? ` offsety="${l.offsety}"` : ''}` +
      `${l.visible === false ? ' visible="0"' : ''}>\n` +
      `${indent}  <image source="${src}"/>\n${indent}</imagelayer>`
    );
  }
  if (l.type === 'group') {
    const kids = (l.layers || []).map((c) => layerToTmx(c, m, indent + '  ')).join('\n');
    return (
      `${indent}<group id="${l.id || 1}" name="${xmlEscape(l.name || 'Group')}"` +
      `${l.opacity != null && l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''}` +
      `${l.visible === false ? ' visible="0"' : ''}>\n${kids}\n${indent}</group>`
    );
  }
  return '';
}

function toTmx(map) {
  const m = map;
  const attrs = [
    `version="1.2"`,
    `tiledversion="${xmlEscape(m.tiledversion || '1.2.4')}"`,
    `orientation="${xmlEscape(m.orientation || 'orthogonal')}"`,
    `renderorder="${xmlEscape(m.renderorder || 'right-down')}"`,
    `width="${m.width}"`,
    `height="${m.height}"`,
    `tilewidth="${m.tilewidth}"`,
    `tileheight="${m.tileheight}"`,
    `infinite="${m.infinite ? 1 : 0}"`,
  ];
  if (m.orientation === 'staggered' || m.orientation === 'hexagonal') {
    attrs.push(`staggeraxis="${xmlEscape(m.staggeraxis || 'y')}"`);
    attrs.push(`staggerindex="${xmlEscape(m.staggerindex || 'odd')}"`);
    if (m.orientation === 'hexagonal') attrs.push(`hexsidelength="${m.hexsidelength || 0}"`);
  }
  const tilesets = (m.tilesets || [])
    .map((t) => {
      if (t.source) {
        return `  <tileset firstgid="${t.firstgid || 1}" source="${xmlEscape(t.source)}"/>`;
      }
      return (
        `  <tileset firstgid="${t.firstgid || 1}" name="${xmlEscape(t.name || 'Tileset')}"` +
        ` tilewidth="${t.tilewidth || m.tilewidth}" tileheight="${t.tileheight || m.tileheight}"` +
        ` tilecount="${t.tilecount || 0}" columns="${t.columns || 0}"` +
        `${t.margin ? ` margin="${t.margin}"` : ''}${t.spacing ? ` spacing="${t.spacing}"` : ''}>` +
        `<image source="${xmlEscape(t.image || '')}"/></tileset>`
      );
    })
    .join('\n');
  const layers = (m.layers || []).map((l) => layerToTmx(l, m)).filter(Boolean).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<map ${attrs.join(' ')}>\n` +
    (tilesets ? tilesets + '\n' : '') +
    layers +
    `\n</map>\n`
  );
}

module.exports = { parseTmx, toTmx };

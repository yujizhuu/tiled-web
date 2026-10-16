'use strict';

const { walkLayers, firstTileLayer } = require('./util');

function collectLayerSummaries(map) {
  const layers = [];
  walkLayers(map.layers, (layer) => {
    const summary = {
      id: layer.id,
      name: layer.name,
      type: layer.type,
      visible: layer.visible !== false,
    };
    if (layer.type === 'tilelayer') {
      summary.width = layer.width || map.width;
      summary.height = layer.height || map.height;
      summary.hasChunks = !!(layer.chunks && layer.chunks.length);
      summary.dataLength = layer.data ? layer.data.length : 0;
    }
    if (layer.type === 'objectgroup') {
      summary.objectCount = (layer.objects || []).length;
    }
    if (layer.type === 'group') {
      summary.childCount = (layer.layers || []).length;
    }
    layers.push(summary);
  });
  return layers;
}

function mapInfo(map, filePath) {
  const tileLayer = firstTileLayer(map.layers);
  return {
    file: filePath || null,
    version: map.version || null,
    tiledversion: map.tiledversion || null,
    orientation: map.orientation || 'orthogonal',
    renderorder: map.renderorder || null,
    width: map.width,
    height: map.height,
    tilewidth: map.tilewidth,
    tileheight: map.tileheight,
    infinite: !!map.infinite,
    layerCount: (map.layers || []).length,
    layers: collectLayerSummaries(map),
    tilesets: (map.tilesets || []).map((t) => ({
      firstgid: t.firstgid,
      name: t.name || null,
      source: t.source || null,
      tilecount: t.tilecount || null,
      columns: t.columns || null,
      image: t.image || null,
    })),
    firstTileLayer: tileLayer
      ? { id: tileLayer.id, name: tileLayer.name }
      : null,
  };
}

function formatInfoHuman(info) {
  const lines = [];
  lines.push(`file: ${info.file || '(memory)'}`);
  lines.push(`size: ${info.width}x${info.height} tiles (${info.tilewidth}x${info.tileheight} px)`);
  lines.push(`orientation: ${info.orientation}${info.infinite ? ' infinite' : ''}`);
  lines.push(`version: ${info.version || '?'} / tiled ${info.tiledversion || '?'}`);
  lines.push(`layers (${info.layers.length}):`);
  for (const l of info.layers) {
    let extra = '';
    if (l.type === 'tilelayer') extra = ` ${l.width}x${l.height}${l.hasChunks ? ' chunks' : ''}`;
    if (l.type === 'objectgroup') extra = ` objects=${l.objectCount}`;
    if (l.type === 'group') extra = ` children=${l.childCount}`;
    lines.push(`  - [${l.id}] ${l.type} "${l.name}"${extra}${l.visible === false ? ' (hidden)' : ''}`);
  }
  lines.push(`tilesets (${info.tilesets.length}):`);
  if (!info.tilesets.length) lines.push('  (none)');
  for (const t of info.tilesets) {
    lines.push(
      `  - firstgid=${t.firstgid} name="${t.name || ''}"` +
        (t.source ? ` source=${t.source}` : '') +
        (t.image ? ` image=${t.image}` : '')
    );
  }
  return lines.join('\n') + '\n';
}

module.exports = { mapInfo, formatInfoHuman };

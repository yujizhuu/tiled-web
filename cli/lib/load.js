'use strict';

const { readText, extOf } = require('./util');
const { parseTmx } = require('./tmx');

/**
 * Load a map from .tmj / .json / .tmx path. Returns plain map object.
 */
function loadMap(filePath) {
  const text = readText(filePath);
  const ext = extOf(filePath);
  if (ext === '.tmx') return parseTmx(text);
  if (ext === '.tmj' || ext === '.json' || ext === '') {
    let map;
    try {
      map = JSON.parse(text);
    } catch (err) {
      throw new Error(`Invalid JSON map: ${filePath} (${err.message})`);
    }
    if (!map || typeof map !== 'object') throw new Error(`Map root must be an object: ${filePath}`);
    if (map.width == null || map.height == null) {
      throw new Error(`Map missing width/height: ${filePath}`);
    }
    return map;
  }
  throw new Error(`Unsupported map format for info/load: ${ext || '(none)'} (use .tmj / .tmx)`);
}

module.exports = { loadMap };

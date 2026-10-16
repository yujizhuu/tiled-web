'use strict';

const path = require('path');
const { writeText, extOf } = require('./util');
const { toTmx } = require('./tmx');

/**
 * Persist map to outPath (or inPlacePath if out omitted). Format follows extension.
 */
function saveMap(map, { output, inPlacePath }) {
  const out = output || inPlacePath;
  if (!out) throw new Error('No output path (pass -o or mutate an existing file in place)');
  const ext = extOf(out);
  let body;
  if (ext === '.tmx') body = toTmx(map);
  else if (ext === '.tmj' || ext === '.json' || ext === '') {
    body = JSON.stringify(map, null, 2) + '\n';
  } else {
    throw new Error(`Unsupported save extension: ${ext || '(none)'} (use .tmj / .tmx)`);
  }
  writeText(out, body);
  return {
    path: path.resolve(out),
    format: ext === '.tmx' ? 'tmx' : 'tmj',
    bytes: Buffer.byteLength(body, 'utf8'),
  };
}

module.exports = { saveMap };

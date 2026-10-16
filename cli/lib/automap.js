'use strict';

/**
 * Automap (AutoMapping) — Node port of tool/tiled-features.js subset.
 *
 * Supported (working subset matching browser core):
 *   - rules.txt / rules.json listing rule map paths
 *   - Rule maps as .tmj (or .tmx via loadMap)
 *   - Regions / regions / regions_input (+ optional regions_output)
 *   - Input_* / InputNot_* / Output_* tile layers (and input_ / output_ variants)
 *   - Map props: DeleteTiles, MatchOutsideMap, AutomappingRadius
 *   - StrictEmpty on input layers
 *   - Object-group Output_* cloning (pixel offset)
 *   - Optional CLI clip: --radius N --x X --y Y (and/or rule AutomappingRadius with center)
 *
 * Limits vs browser UI:
 *   - No live/while-drawing automap
 *   - No rule visual editor / browser preview
 *   - Rule and work maps should share the same firstgid scheme for meaningful matches
 */

const fs = require('fs');
const path = require('path');
const { tileAt, setTileAt, walkLayers, firstTileLayer } = require('./util');
const { loadMap } = require('./load');

// Tiled JSON properties are [{name,type,value}] (>=1.2) or legacy {name:value}
function propsObj(props) {
  if (Array.isArray(props)) {
    const o = {};
    for (const p of props) if (p && p.name != null) o[p.name] = p.value;
    return o;
  }
  return props && typeof props === 'object' ? props : {};
}

function layerByName(map, name) {
  if (!name) return null;
  let found = null;
  walkLayers(map.layers, (layer) => {
    if (found) return;
    if ((layer.name || '') === name) found = layer;
  });
  return found;
}

function layerByNameCI(map, name) {
  const exact = layerByName(map, name);
  if (exact) return exact;
  const low = String(name).toLowerCase();
  let found = null;
  walkLayers(map.layers, (layer) => {
    if (found) return;
    if ((layer.name || '').toLowerCase() === low) found = layer;
  });
  return found;
}

function layerDataGet(layer, x, y, map) {
  if (!layer) return 0;
  return tileAt(layer, x, y, map) >>> 0;
}

function layerDataSet(layer, x, y, map, gid) {
  setTileAt(layer, x, y, gid >>> 0, map);
}

function extractRegions(layer, map) {
  const visited = new Set();
  const regions = [];
  const W = map.width;
  const H = map.height;
  const key = (x, y) => x + ',' + y;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!layerDataGet(layer, x, y, map) || visited.has(key(x, y))) continue;
      const cells = [];
      const q = [[x, y]];
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      while (q.length) {
        const [cx, cy] = q.pop();
        const k = key(cx, cy);
        if (visited.has(k) || cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
        if (!layerDataGet(layer, cx, cy, map)) continue;
        visited.add(k);
        cells.push([cx, cy]);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        q.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      regions.push({
        minX,
        minY,
        maxX,
        maxY,
        cells,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
      });
    }
  }
  regions.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  return regions;
}

function parseInputLayerName(name) {
  const n = name || '';
  let m = /^input(not)?([^_]*)_(.+)$/i.exec(n);
  if (m) return { not: !!m[1], index: m[2] || '', target: m[3] };
  m = /^input[_-]?(not)?[_-]?(.*)$/i.exec(n);
  if (m && !/^regions/i.test(n)) {
    const rest = m[2] || '';
    return { not: !!m[1] || /not/i.test(n), index: '', target: rest.replace(/^_/, '') || 'set' };
  }
  return null;
}

function parseOutputLayerName(name) {
  let m = /^output([^_]*)_(.+)$/i.exec(name || '');
  if (m) return { index: m[1] || '', target: m[2] };
  m = /^output[_-]?(.*)$/i.exec(name || '');
  if (m) return { index: '', target: m[1].replace(/^_/, '') || 'Ground' };
  return null;
}

function propTruthy(props, ...keys) {
  const p = props || {};
  for (const k of keys) {
    if (p[k] === true || p[k] === 'true' || String(p[k] || '').toLowerCase() === 'yes') return true;
  }
  return false;
}

function compileRuleMap(ruleMap, fileName) {
  const layers = ruleMap.layers || [];
  const byName = {};
  layers.forEach((l) => {
    byName[l.name || ''] = l;
  });
  const regionsLayer = byName.Regions || byName.regions || byName.regions_input;
  const regionsOutLayer = byName.regions_output;
  if (!regionsLayer) {
    return { error: `Rule map missing Regions layer: ${fileName}` };
  }
  const inRegions = extractRegions(regionsLayer, ruleMap);
  const outRegions = regionsOutLayer ? extractRegions(regionsOutLayer, ruleMap) : inRegions;
  const inputLayers = [];
  const outputLayers = [];
  for (const l of layers) {
    if (l.type !== 'tilelayer') continue;
    const nm = l.name || '';
    if (/^regions/i.test(nm)) continue;
    const inp = parseInputLayerName(nm);
    if (inp) {
      const p = propsObj(l.properties);
      const strictEmpty = !!(
        p.StrictEmpty === true ||
        p.StrictEmpty === 'true' ||
        p.strictempty
      );
      inputLayers.push({ layer: l, ...inp, strictEmpty });
      continue;
    }
    const out = parseOutputLayerName(nm);
    if (out) outputLayers.push({ layer: l, ...out });
  }
  const props = propsObj(ruleMap.properties);
  const deleteTiles =
    propTruthy(props, 'DeleteTiles', 'deleteTiles') ||
    String(props.DeleteTiles || '').toLowerCase() === 'yes';
  const matchOutside = String(props.MatchOutsideMap != null ? props.MatchOutsideMap : 'true').toLowerCase() !== 'false';

  const objectOutputs = [];
  const walkObj = (ls) => {
    for (const l of ls || []) {
      if (l.type === 'objectgroup') {
        const nm = l.name || '';
        let m = /^output([^_]*)_(.+)$/i.exec(nm);
        if (!m) m = /^output[_-]?(.*)$/i.exec(nm);
        if (m) {
          objectOutputs.push({
            layer: l,
            target: (m[2] || m[1] || 'Objects').replace(/^_/, '') || 'Objects',
            index: m[1] || '',
          });
        }
      }
      if (l.type === 'group') walkObj(l.layers);
    }
  };
  walkObj(ruleMap.layers || []);

  const rules = [];
  for (let i = 0; i < inRegions.length; i++) {
    const ir = inRegions[i];
    const or = outRegions[Math.min(i, outRegions.length - 1)] || ir;
    rules.push({
      inRect: ir,
      outRect: or,
      inputs: inputLayers,
      outputs: outputLayers,
      objectOutputs,
    });
  }
  const radius = Number(props.AutomappingRadius || props.AutoMappingRadius || 0);
  return {
    name: fileName,
    map: ruleMap,
    rules,
    deleteTiles,
    matchOutside,
    radius,
  };
}

function cellMatches(ruleMap, inputSpec, rx, ry, workLayer, wx, wy, workMap) {
  const yesSpecs = inputSpec.filter((s) => !s.not);
  const noSpecs = inputSpec.filter((s) => s.not);
  const workRaw = layerDataGet(workLayer, wx, wy, workMap) >>> 0;

  const isStrict = (spec) => {
    const p = propsObj(spec.layer && spec.layer.properties);
    return !!(
      spec.strictEmpty ||
      p.StrictEmpty === true ||
      p.StrictEmpty === 'true' ||
      p.strictempty === true ||
      p.strictempty === 'true'
    );
  };

  for (const spec of noSpecs) {
    const ruleRaw = layerDataGet(spec.layer, rx, ry, ruleMap) >>> 0;
    if ((isStrict(spec) || ruleRaw) && ruleRaw === workRaw) return false;
  }

  let defined = false;
  let matched = false;
  for (const spec of yesSpecs) {
    const ruleRaw = layerDataGet(spec.layer, rx, ry, ruleMap) >>> 0;
    if (isStrict(spec) || ruleRaw) {
      defined = true;
      if (ruleRaw === workRaw) matched = true;
    }
  }
  if (!defined) {
    if (noSpecs.length === 0 && yesSpecs.length) {
      const used = new Set();
      for (const spec of yesSpecs) {
        const L = spec.layer;
        const m = ruleMap;
        for (let y = 0; y < m.height; y++) {
          for (let x = 0; x < m.width; x++) {
            const g = layerDataGet(L, x, y, m) >>> 0;
            if (g) used.add(g);
          }
        }
      }
      if (workRaw && used.has(workRaw)) return false;
      return true;
    }
    return true;
  }
  return matched;
}

function matchRuleAt(compiled, rule, workMap, ox, oy) {
  const ir = rule.inRect;
  const indices = new Set(rule.inputs.map((s) => s.index || ''));
  if (indices.size === 0) return true;
  let anyIndex = false;
  for (const index of indices) {
    let ok = true;
    const specs = rule.inputs.filter((s) => (s.index || '') === index);
    const byTarget = new Map();
    for (const s of specs) {
      if (!byTarget.has(s.target)) byTarget.set(s.target, []);
      byTarget.get(s.target).push(s);
    }
    for (const [target, list] of byTarget) {
      let workLayer = layerByNameCI(workMap, target);
      if (!workLayer || workLayer.type !== 'tilelayer') {
        workLayer = firstTileLayer(workMap.layers);
        if (!workLayer || workLayer.type !== 'tilelayer') {
          ok = false;
          break;
        }
      }
      const regionLayer =
        layerByName(compiled.map, 'Regions') ||
        layerByName(compiled.map, 'regions') ||
        layerByName(compiled.map, 'regions_input');
      for (let dy = 0; dy < ir.h; dy++) {
        for (let dx = 0; dx < ir.w; dx++) {
          const rx = ir.minX + dx;
          const ry = ir.minY + dy;
          if (regionLayer && !layerDataGet(regionLayer, rx, ry, compiled.map)) continue;
          const wx = ox + dx;
          const wy = oy + dy;
          if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) {
            if (!compiled.matchOutside) {
              ok = false;
              break;
            }
            continue;
          }
          if (!cellMatches(compiled.map, list, rx, ry, workLayer, wx, wy, workMap)) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (ok) {
      anyIndex = true;
      break;
    }
  }
  return anyIndex;
}

function nextLayerId(map) {
  let max = 0;
  if (map.nextlayerid != null) max = Math.max(max, Number(map.nextlayerid) - 1);
  walkLayers(map.layers, (layer) => {
    if (layer.id != null) max = Math.max(max, Number(layer.id) || 0);
  });
  return max + 1;
}

function ensureTileLayer(workMap, name) {
  let workLayer = layerByNameCI(workMap, name);
  if (workLayer && workLayer.type === 'tilelayer') return workLayer;
  if (!Array.isArray(workMap.layers)) workMap.layers = [];
  const id = nextLayerId(workMap);
  workLayer = {
    id,
    name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width: workMap.width,
    height: workMap.height,
    opacity: 1,
    visible: true,
    data: Array(workMap.width * workMap.height).fill(0),
  };
  workMap.layers.push(workLayer);
  workMap.nextlayerid = id + 1;
  return workLayer;
}

function ensureObjectLayer(workMap, name) {
  let dst = layerByNameCI(workMap, name);
  if (dst && dst.type === 'objectgroup') return dst;
  if (!Array.isArray(workMap.layers)) workMap.layers = [];
  const id = nextLayerId(workMap);
  dst = {
    id,
    name,
    type: 'objectgroup',
    draworder: 'topdown',
    objects: [],
  };
  workMap.layers.push(dst);
  workMap.nextlayerid = id + 1;
  return dst;
}

function applyRuleAt(compiled, rule, workMap, ox, oy) {
  const or = rule.outRect;
  const ir = rule.inRect;
  const outOx = ox + (or.minX - ir.minX);
  const outOy = oy + (or.minY - ir.minY);
  const regionOut =
    layerByName(compiled.map, 'regions_output') ||
    layerByName(compiled.map, 'Regions') ||
    layerByName(compiled.map, 'regions');

  if (compiled.deleteTiles) {
    for (const out of rule.outputs) {
      const workLayer = layerByNameCI(workMap, out.target) || firstTileLayer(workMap.layers);
      if (!workLayer || workLayer.type !== 'tilelayer') continue;
      for (let dy = 0; dy < or.h; dy++) {
        for (let dx = 0; dx < or.w; dx++) {
          const rx = or.minX + dx;
          const ry = or.minY + dy;
          if (regionOut && !layerDataGet(regionOut, rx, ry, compiled.map)) continue;
          const wx = outOx + dx;
          const wy = outOy + dy;
          if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) continue;
          layerDataSet(workLayer, wx, wy, workMap, 0);
        }
      }
    }
  }

  for (const out of rule.outputs) {
    const workLayer = ensureTileLayer(workMap, out.target);
    for (let dy = 0; dy < or.h; dy++) {
      for (let dx = 0; dx < or.w; dx++) {
        const rx = or.minX + dx;
        const ry = or.minY + dy;
        if (regionOut && !layerDataGet(regionOut, rx, ry, compiled.map)) continue;
        const gid = layerDataGet(out.layer, rx, ry, compiled.map);
        if (!gid) continue;
        const wx = outOx + dx;
        const wy = outOy + dy;
        if (wx < 0 || wy < 0 || wx >= workMap.width || wy >= workMap.height) continue;
        layerDataSet(workLayer, wx, wy, workMap, gid);
      }
    }
  }

  const tw = workMap.tilewidth;
  const th = workMap.tileheight;
  const rtw = compiled.map.tilewidth || tw;
  const rth = compiled.map.tileheight || th;
  for (const out of rule.objectOutputs || []) {
    const dst = ensureObjectLayer(workMap, out.target);
    const rx0 = or.minX * rtw;
    const ry0 = or.minY * rth;
    const rx1 = (or.maxX + 1) * rtw;
    const ry1 = (or.maxY + 1) * rth;
    const pixelOffsetX = outOx * tw - rx0;
    const pixelOffsetY = outOy * th - ry0;
    for (const obj of out.layer.objects || []) {
      const oxp = obj.x || 0;
      const oyp = obj.y || 0;
      const ow = obj.width || 0;
      const oh = obj.height || 0;
      if (oxp + ow < rx0 || oyp + oh < ry0 || oxp > rx1 || oyp > ry1) continue;
      const clone = JSON.parse(JSON.stringify(obj));
      clone.id = 1 + Math.max(0, ...(dst.objects || []).map((o) => o.id || 0));
      clone.x = oxp + pixelOffsetX;
      clone.y = oyp + pixelOffsetY;
      dst.objects.push(clone);
    }
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Optional clip region: { minX, minY, maxX, maxY } in tile coords (inclusive).
 * When set, only try rule origins whose input rect intersects the clip.
 */
function runAutomap(workMap, compiledRules, { region = null } = {}) {
  let matches = 0;
  const applied = [];
  const W = workMap.width;
  const H = workMap.height;
  for (const compiled of compiledRules) {
    for (let ri = 0; ri < compiled.rules.length; ri++) {
      const rule = compiled.rules[ri];
      const ir = rule.inRect;
      let oy0 = 0;
      let oy1 = H - ir.h;
      let ox0 = 0;
      let ox1 = W - ir.w;
      if (region) {
        // Origins where inRect overlaps region
        ox0 = Math.max(0, region.minX - (ir.w - 1));
        oy0 = Math.max(0, region.minY - (ir.h - 1));
        ox1 = Math.min(W - ir.w, region.maxX);
        oy1 = Math.min(H - ir.h, region.maxY);
      }
      if (oy1 < oy0 || ox1 < ox0) continue;
      for (let oy = oy0; oy <= oy1; oy++) {
        for (let ox = ox0; ox <= ox1; ox++) {
          if (matchRuleAt(compiled, rule, workMap, ox, oy)) {
            applyRuleAt(compiled, rule, workMap, ox, oy);
            matches += 1;
            applied.push({ ruleFile: compiled.name, ruleIndex: ri, x: ox, y: oy });
          }
        }
      }
    }
  }
  return { matches, applied, region: region || null };
}

/**
 * Build a clip region from --radius and optional center (--x/--y).
 * Also folds in max AutomappingRadius from compiled rules when radius omitted but center given.
 */
function buildClipRegion(workMap, compiledRules, { radius, x, y } = {}) {
  let r = radius != null ? Number(radius) : null;
  if (r == null || !Number.isFinite(r) || r < 0) {
    // use max rule radius if center provided
    if (x == null || y == null) return null;
    r = 0;
    for (const c of compiledRules) {
      if (c.radius && c.radius > r) r = c.radius;
    }
  }
  if (!Number.isFinite(r) || r < 0) return null;
  const cx = x != null ? Number(x) : Math.floor(workMap.width / 2);
  const cy = y != null ? Number(y) : Math.floor(workMap.height / 2);
  if (!Number.isInteger(cx) || !Number.isInteger(cy)) {
    throw new Error('automap --x/--y must be integers when used with --radius');
  }
  return {
    minX: clamp(cx - r, 0, workMap.width - 1),
    minY: clamp(cy - r, 0, workMap.height - 1),
    maxX: clamp(cx + r, 0, workMap.width - 1),
    maxY: clamp(cy + r, 0, workMap.height - 1),
    centerX: cx,
    centerY: cy,
    radius: r,
  };
}

/**
 * Resolve rule file list from --rules path:
 *   - directory: look for rules.txt / rules.json, else all .tmj/.tmx
 *   - rules.txt: one path per line (# // comments)
 *   - rules.json: { "rules": ["a.tmj", ...] } or ["a.tmj", ...]
 *   - single .tmj/.tmx: that file alone
 */
function resolveRuleFiles(rulesPath) {
  const abs = path.resolve(rulesPath);
  if (!fs.existsSync(abs)) throw new Error(`Rules path not found: ${rulesPath}`);
  const st = fs.statSync(abs);
  const baseDir = st.isDirectory() ? abs : path.dirname(abs);
  let entries = [];

  if (st.isDirectory()) {
    const txt = path.join(abs, 'rules.txt');
    const json = path.join(abs, 'rules.json');
    if (fs.existsSync(txt)) {
      return resolveRuleFiles(txt);
    }
    if (fs.existsSync(json)) {
      return resolveRuleFiles(json);
    }
    entries = fs
      .readdirSync(abs)
      .filter((n) => /\.(tmj|tmx)$/i.test(n))
      .sort()
      .map((n) => path.join(abs, n));
    return { baseDir: abs, files: entries, listFile: null };
  }

  const lower = abs.toLowerCase();
  if (lower.endsWith('rules.txt') || lower.endsWith('.txt')) {
    const text = fs.readFileSync(abs, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#') || s.startsWith('//')) continue;
      const resolved = path.isAbsolute(s) ? s : path.resolve(baseDir, s);
      entries.push(resolved);
    }
    return { baseDir, files: entries, listFile: abs };
  }

  if (lower.endsWith('rules.json') || (lower.endsWith('.json') && path.basename(lower).includes('rules'))) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (err) {
      throw new Error(`Invalid rules.json: ${rulesPath} (${err.message})`);
    }
    const list = Array.isArray(raw) ? raw : raw.rules || raw.files || [];
    if (!Array.isArray(list)) throw new Error('rules.json must be an array or { rules: [...] }');
    for (const s of list) {
      const resolved = path.isAbsolute(s) ? s : path.resolve(baseDir, String(s));
      entries.push(resolved);
    }
    return { baseDir, files: entries, listFile: abs };
  }

  if (/\.(tmj|tmx)$/i.test(abs)) {
    return { baseDir, files: [abs], listFile: null };
  }

  throw new Error(
    `Unrecognized --rules path: ${rulesPath} (use rules.txt, rules.json, a directory, or a .tmj/.tmx rule map)`
  );
}

function loadCompiledRules(rulesPath) {
  const { files, listFile, baseDir } = resolveRuleFiles(rulesPath);
  if (!files.length) throw new Error(`No rule maps found under: ${rulesPath}`);
  const compiled = [];
  const warnings = [];
  for (const f of files) {
    if (!fs.existsSync(f)) {
      warnings.push(`Missing rule map: ${f}`);
      continue;
    }
    try {
      const map = loadMap(f);
      const c = compileRuleMap(map, path.basename(f));
      if (c.error) {
        warnings.push(c.error);
        continue;
      }
      if (!c.rules.length) {
        warnings.push(`No regions/rules in: ${f}`);
        continue;
      }
      compiled.push(c);
    } catch (err) {
      warnings.push(`Failed to load ${f}: ${err.message}`);
    }
  }
  if (!compiled.length) {
    throw new Error(
      `No usable automap rules loaded from ${rulesPath}` +
        (warnings.length ? ` (${warnings.join('; ')})` : '')
    );
  }
  return {
    compiled,
    warnings,
    listFile,
    baseDir,
    ruleCount: compiled.reduce((n, c) => n + c.rules.length, 0),
    files: compiled.map((c) => c.name),
  };
}

function applyAutomapToMap(workMap, rulesPath, opts = {}) {
  const loaded = loadCompiledRules(rulesPath);
  const region = buildClipRegion(workMap, loaded.compiled, {
    radius: opts.radius,
    x: opts.x,
    y: opts.y,
  });
  const result = runAutomap(workMap, loaded.compiled, { region });
  return {
    ...result,
    ruleFiles: loaded.files,
    ruleCount: loaded.ruleCount,
    warnings: loaded.warnings,
    clip: region,
  };
}

module.exports = {
  compileRuleMap,
  loadCompiledRules,
  applyAutomapToMap,
  runAutomap,
  resolveRuleFiles,
  buildClipRegion,
  // exported for tests / reuse
  extractRegions,
  parseInputLayerName,
  parseOutputLayerName,
  matchRuleAt,
  applyRuleAt,
};

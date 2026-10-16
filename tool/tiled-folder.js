/* Tiled 网页版 — 文件夹工作区：像桌面版一样按相对路径自动解析 .tsx/图片/.tx/.world
 * File System Access API（Chrome/Edge/Opera）+ webkitdirectory / 拖入文件夹回退（Safari/Firefox）。 */
(function () {
  'use strict';
  const MAP_RE = /\.(tmj|tmx|world|json)$/i;
  const TEXT_RE = /\.(tmj|tmx|tsx|tsj|tx|tj|world|json)$/i;

  /* ---------- 路径 ---------- */
  function joinPath(dir, rel) {
    rel = String(rel || '').replace(/\\/g, '/');
    if (/^(data:|https?:|blob:)/i.test(rel)) return null;
    const parts = (rel.startsWith('/') ? [] : String(dir || '').split('/')).concat(rel.split('/'));
    const out = [];
    for (const p of parts) {
      if (!p || p === '.') continue;
      if (p === '..') { if (!out.length) return null; out.pop(); } else out.push(p);
    }
    return out.join('/');
  }
  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const baseOf = (p) => String(p).split('/').pop();

  /* 从文本中提取引用（JSON 与 XML 两种） */
  function extractRefs(text, name) {
    const refs = new Set();
    let m;
    if (/^\s*</.test(text)) {
      const re = /\b(source|template)\s*=\s*"([^"]+)"/g;
      while ((m = re.exec(text))) refs.add(m[2].replace(/&amp;/g, '&'));
    } else {
      const re = /"(source|image|template|fileName)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      while ((m = re.exec(text))) { try { refs.add(JSON.parse('"' + m[2] + '"')); } catch (_) { refs.add(m[2]); } }
    }
    return [...refs].filter((r) => r && !/^(data:|https?:|blob:)/i.test(r));
  }

  /* ---------- 虚拟文件系统 ---------- */
  // 目录句柄
  function handleFS(root) {
    return {
      kind: 'handle', root, name: root.name,
      async getHandle(path) {
        const segs = path.split('/').filter(Boolean);
        let dir = root;
        for (let i = 0; i < segs.length - 1; i++) dir = await dir.getDirectoryHandle(segs[i]);
        return dir.getFileHandle(segs[segs.length - 1]);
      },
      async getFile(path) { try { const h = await this.getHandle(path); const f = await h.getFile(); return { file: f, handle: h }; } catch (_) { return null; } },
      async list(limit = 2000) {
        const out = [];
        const walk = async (dir, prefix, depth) => {
          if (depth > 6 || out.length >= limit) return;
          for await (const [n, h] of dir.entries()) {
            if (n.startsWith('.') && n !== '.') continue;
            if (h.kind === 'directory') { if (!/^(node_modules|\.git)$/.test(n)) await walk(h, prefix + n + '/', depth + 1); }
            else out.push(prefix + n);
          }
        };
        await walk(root, '', 0);
        return out;
      }
    };
  }
  // webkitdirectory / webkitGetAsEntry 得到的 File 列表（只读）
  function listFS(name, entries) {
    const map = new Map(entries);
    return {
      kind: 'list', name,
      async getFile(path) { const f = map.get(path); return f ? { file: f, handle: null } : null; },
      async list() { return [...map.keys()]; }
    };
  }
  function fsFromFileList(files) {
    const arr = Array.from(files || []);
    if (!arr.length) return null;
    const root = (arr[0].webkitRelativePath || '').split('/')[0];
    return listFS(root || '文件夹', arr.map((f) => [(f.webkitRelativePath || f.name).split('/').slice(root ? 1 : 0).join('/'), f]));
  }
  async function fsFromEntry(entry) {
    const pairs = [];
    const readAll = (reader) => new Promise((res, rej) => {
      const acc = []; const step = () => reader.readEntries((b) => { if (!b.length) res(acc); else { acc.push(...b); step(); } }, rej); step();
    });
    const walk = async (dir, prefix, depth) => {
      if (depth > 6) return;
      for (const e of await readAll(dir.createReader())) {
        if (e.isDirectory) await walk(e, prefix + e.name + '/', depth + 1);
        else pairs.push([prefix + e.name, await new Promise((r, j) => e.file(r, j))]);
      }
    };
    await walk(entry, '', 0);
    return listFS(entry.name, pairs);
  }

  /* 从地图出发递归收集所有被引用的文件 */
  async function collectBundle(fs, mapPath) {
    const seen = new Map(); // path -> File
    const missing = [];
    const visit = async (path) => {
      if (!path || seen.has(path)) return;
      const got = await fs.getFile(path);
      if (!got) { missing.push(path); return; }
      seen.set(path, got.file);
      if (TEXT_RE.test(path)) {
        const text = await got.file.text();
        if (/\.world$/i.test(path)) await visitPatterns(path, text);
        for (const r of extractRefs(text, path)) {
          const p = joinPath(dirOf(path), r);
          if (p) await visit(p); else missing.push(r);
        }
      }
    };
    // .world 的 patterns：上游只在 .world 同一文件夹里按正则找文件（非锚定匹配，不进子目录）
    const visitPatterns = async (worldPath, text) => {
      let w; try { w = JSON.parse(text); } catch (_) { return; }
      const res = (w.patterns || []).map((p) => { try { return new RegExp(String(p.regexp || '')); } catch (_) { return null; } }).filter(Boolean);
      if (!res.length) return;
      const dir = dirOf(worldPath), pre = dir ? dir + '/' : '';
      for (const p of await fs.list()) {
        if (!p.startsWith(pre) || p.slice(pre.length).includes('/')) continue;
        const name = p.slice(pre.length);
        if (res.some((re) => re.test(name))) await visit(p);
      }
    };
    await visit(mapPath);
    return { files: seen, missing };
  }

  /* ---------- IndexedDB：最近文件夹 ---------- */
  const DB = 'tiled-web-fs', STORE = 'dirs';
  function idb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'name' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbOp(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode); const st = tx.objectStore(STORE);
      const req = fn(st); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    });
  }
  async function rememberDir(handle, lastMap) {
    try {
      const all = (await recentDirs()).filter((d) => d.name !== handle.name || !d.handle);
      for (const d of all) if (d.handle && await d.handle.isSameEntry(handle)) await idbOp('readwrite', (s) => s.delete(d.name));
      await idbOp('readwrite', (s) => s.put({ name: handle.name, handle, lastMap: lastMap || '', time: Date.now() }));
    } catch (_) {}
  }
  async function recentDirs() { try { return ((await idbOp('readonly', (s) => s.getAll())) || []).sort((a, b) => b.time - a.time); } catch (_) { return []; } }
  async function ensurePermission(handle, mode = 'readwrite') {
    if (!handle.queryPermission) return true;
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    return (await handle.requestPermission({ mode })) === 'granted';
  }

  function boot(api) {
    const state = api.getState();
    const $ = (s) => document.querySelector(s);
    const hasFSA = typeof window.showDirectoryPicker === 'function';
    let pendingSingle = null; // 单文件打开后缺资源时记住，用于授权父文件夹重试

    /* ---------- 用文件夹打开地图 ---------- */
    async function openFromFS(fs, mapPath) {
      const { files, missing } = await collectBundle(fs, mapPath);
      const mapFile = files.get(mapPath);
      if (!mapFile) { api.status('找不到 ' + mapPath); return false; }
      // 让既有的按名解析逻辑命中：同时按相对路径和文件名建索引
      state.assetFileIndex = new Map();
      for (const [p, f] of files) { state.assetFileIndex.set(p, f); if (!state.assetFileIndex.has(f.name)) state.assetFileIndex.set(f.name, f); }
      if (/\.world$/i.test(mapPath)) {
        state.worldFiles = state.worldFiles || new Map();
        for (const [p, f] of files) { state.worldFiles.set(p, f); state.worldFiles.set(f.name, f); }
      }
      state.workspaceFS = fs;
      state.workspaceMapPath = mapPath;
      pendingSingle = null;
      await api.openFile(mapFile, [mapFile, ...[...files.values()].filter((f) => f !== mapFile)]);
      if (fs.kind === 'handle') { try { state.fileHandle = await fs.getHandle(mapPath); } catch (_) {} }
      if (fs.kind === 'handle') rememberDir(fs.root, mapPath);
      const msg = `已从文件夹「${fs.name}」打开 ${mapPath}，自动关联 ${files.size - 1} 个资源`;
      api.status(missing.length ? msg + `，缺少 ${missing.length} 个` : msg);
      if (typeof window.__tiledAfterFolderOpen === 'function') { try { await window.__tiledAfterFolderOpen(fs, mapPath, files); } catch (e) { api.log('World 自动识别失败：' + e.message); } }
      api.log(msg + (missing.length ? '；缺少：' + missing.join(', ') : ''));
      renderRecent();
      return true;
    }

    async function chooseMapIn(fs, preferred) {
      const all = (await fs.list()).filter((p) => MAP_RE.test(p) && !/\.tiled-(project|session)$/i.test(p));
      const maps = all.filter((p) => !/\.json$/i.test(p) || /map|world|level/i.test(p));
      const list = maps.length ? maps : all;
      if (preferred && list.includes(preferred)) return openFromFS(fs, preferred);
      if (!list.length) { api.status(`文件夹「${fs.name}」里没有 TMJ / TMX / world 文件`); return false; }
      if (list.length === 1) return openFromFS(fs, list[0]);
      return showPicker(fs, list);
    }

    function showPicker(fs, list) {
      let dlg = $('#folderMapDialog');
      if (!dlg) {
        dlg = document.createElement('dialog'); dlg.id = 'folderMapDialog';
        dlg.style.cssText = 'max-width:560px;width:90vw;border:1px solid #555;border-radius:8px;background:#23262b;color:#e6e6e6;padding:14px';
        document.body.appendChild(dlg);
      }
      dlg.innerHTML = '';
      const h = document.createElement('div'); h.textContent = `选择要打开的地图（文件夹「${fs.name}」）`; h.style.cssText = 'font-weight:600;margin-bottom:8px';
      const filter = document.createElement('input'); filter.placeholder = '筛选…'; filter.style.cssText = 'width:100%;margin-bottom:8px;box-sizing:border-box';
      const box = document.createElement('div'); box.style.cssText = 'max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:2px';
      const fill = () => {
        box.innerHTML = '';
        list.filter((p) => p.toLowerCase().includes(filter.value.toLowerCase())).forEach((p) => {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = p; b.style.textAlign = 'left';
          b.onclick = () => { dlg.close(); openFromFS(fs, p); };
          box.appendChild(b);
        });
      };
      filter.oninput = fill; fill();
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消'; cancel.style.marginTop = '8px'; cancel.onclick = () => dlg.close();
      dlg.append(h, filter, box, cancel);
      dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
      return true;
    }

    async function openFolder() {
      if (hasFSA) {
        try {
          const dir = await window.showDirectoryPicker({ id: 'tiled-web', mode: 'readwrite' });
          await chooseMapIn(handleFS(dir));
        } catch (e) { if (e.name !== 'AbortError') api.log('打开文件夹失败：' + e.message); }
      } else dirInput.click();
    }

    /* webkitdirectory 回退 */
    const dirInput = document.createElement('input');
    dirInput.type = 'file'; dirInput.hidden = true; dirInput.multiple = true;
    dirInput.setAttribute('webkitdirectory', ''); dirInput.setAttribute('directory', '');
    dirInput.id = 'folderInput';
    document.body.appendChild(dirInput);
    dirInput.onchange = async () => {
      const fs = fsFromFileList(dirInput.files);
      dirInput.value = '';
      if (fs) await chooseMapIn(fs, pendingSingle && pendingSingle.relHint);
    };

    /* ---------- 打开单个文件：用 showOpenFilePicker 拿句柄以便原地保存 ---------- */
    async function openSingleWithHandle() {
      try {
        const handles = await window.showOpenFilePicker({
          id: 'tiled-web', multiple: true,
          types: [{ description: 'Tiled 地图 / 图块集 / 世界', accept: { 'application/json': ['.tmj', '.json', '.tsj', '.world', '.tj'], 'text/xml': ['.tmx', '.tsx', '.tx'], 'text/csv': ['.csv'], 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] } }]
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        state.workspaceFS = null; state.workspaceMapPath = null;
        pendingSingle = { name: files[0].name };
        await api.openFile(files[0], files);
        state.fileHandle = handles[0];
      } catch (e) { if (e.name !== 'AbortError') api.log('打开失败：' + e.message); }
    }

    /* 缺少外部资源时：提示授权地图所在（或上级）文件夹并重试 */
    const prevMissing = window.__tiledMissingAssets;
    window.__tiledMissingAssets = function (missing) {
      if (prevMissing) prevMissing(missing);
      if (state.workspaceFS) return;
      showGrantBar(missing);
    };
    function showGrantBar(missing) {
      let bar = $('#folderGrantBar');
      if (!bar) {
        bar = document.createElement('div'); bar.id = 'folderGrantBar';
        bar.style.cssText = 'position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:9999;background:#3a3220;color:#ffe8a8;border:1px solid #a8862f;border-radius:6px;padding:8px 12px;display:flex;gap:10px;align-items:center;max-width:90vw;font-size:13px';
        document.body.appendChild(bar);
      }
      bar.innerHTML = '';
      const t = document.createElement('span');
      t.textContent = `缺少 ${missing.join('、')}。浏览器不能自己读硬盘，需要你授权一次地图所在的文件夹（含 ../ 的上级目录），之后会自动关联并记住。`;
      const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = '授权文件夹并重试';
      const no = document.createElement('button'); no.type = 'button'; no.textContent = '忽略';
      ok.onclick = async () => { bar.remove(); await grantAndRetry(missing); };
      no.onclick = () => bar.remove();
      bar.append(t, ok, no);
    }
    async function grantAndRetry(missing) {
      const name = (pendingSingle && pendingSingle.name) || state.mapFileName;
      const findIn = async (fs) => {
        const all = await fs.list();
        const cands = all.filter((p) => baseOf(p) === name);
        if (!cands.length) { api.status(`在「${fs.name}」里没找到 ${name}，请选它的上级文件夹`); return; }
        // 选能解析最多资源的那个候选
        let best = cands[0], bestMiss = Infinity;
        for (const c of cands) { const r = await collectBundle(fs, c); if (r.missing.length < bestMiss) { best = c; bestMiss = r.missing.length; } }
        if (bestMiss > 0) api.log('提示：仍有资源在所选文件夹之外，可选择更上一级目录');
        await openFromFS(fs, best);
      };
      if (hasFSA) {
        try {
          const opts = { id: 'tiled-web', mode: 'readwrite' };
          if (state.fileHandle) opts.startIn = state.fileHandle;
          const dir = await window.showDirectoryPicker(opts);
          await findIn(handleFS(dir));
        } catch (e) { if (e.name !== 'AbortError') api.log('授权失败：' + e.message); }
      } else {
        pendingSingle = pendingSingle || { name };
        const handler = dirInput.onchange;
        dirInput.onchange = async () => {
          dirInput.onchange = handler;
          const fs = fsFromFileList(dirInput.files); dirInput.value = '';
          if (fs) await findIn(fs);
        };
        dirInput.click();
      }
    }

    /* ---------- 原地保存 ---------- */
    window.__tiledSaveToHandle = async function () {
      const h = state.fileHandle;
      if (!h || !h.createWritable || !state.map) return false;
      const name = h.name.toLowerCase();
      let data;
      if (name.endsWith('.tmx')) data = api.toTmx();
      else if (name.endsWith('.tmj') || name.endsWith('.json')) data = JSON.stringify(state.map, null, 2);
      else return false;
      try {
        if (!(await ensurePermission(h, 'readwrite'))) return false;
        const w = await h.createWritable(); await w.write(data); await w.close();
        api.status('已保存到 ' + (state.workspaceMapPath || h.name)); api.log('保存：' + (state.workspaceMapPath || h.name));
        return true;
      } catch (e) { api.log('原地保存失败，改为下载：' + e.message); return false; }
    };

    /* ---------- 拖入文件夹 / 文件 ---------- */
    const wrap = document.getElementById('canvasWrap') || document.body;
    const onDrop = async (e) => {
      const items = Array.from((e.dataTransfer && e.dataTransfer.items) || []).filter((i) => i.kind === 'file');
      if (!items.length) return;
      // 必须同步取出，await 之后 DataTransfer 就失效
      const handleP = items.map((i) => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null));
      const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
      const isDir = entries.some((en) => en && en.isDirectory) || false;
      const supportsHandle = handleP.some(Boolean);
      if (!isDir && !(supportsHandle && items.length === 1)) return; // 交给原有多文件逻辑
      e.preventDefault(); e.stopImmediatePropagation(); wrap.classList.remove('dragover');
      try {
        if (supportsHandle) {
          const handles = (await Promise.all(handleP)).filter(Boolean);
          const dir = handles.find((h) => h.kind === 'directory');
          if (dir) { if (await ensurePermission(dir)) return chooseMapIn(handleFS(dir)); }
          const fh = handles.find((h) => h.kind === 'file');
          if (fh) { const f = await fh.getFile(); state.workspaceFS = null; pendingSingle = { name: f.name }; await api.openFile(f, [f]); state.fileHandle = fh; return; }
        }
        const dirEntry = entries.find((en) => en && en.isDirectory);
        if (dirEntry) await chooseMapIn(await fsFromEntry(dirEntry));
      } catch (err) { api.log('拖入失败：' + err.message); }
    };
    wrap.addEventListener('drop', onDrop, true);

    /* ---------- 工具栏：打开文件夹 / 最近文件夹；接管「打开」 ---------- */
    const openBtn = document.querySelector('[data-action="open"]');
    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        if (window.showOpenFilePicker) { e.stopImmediatePropagation(); e.preventDefault(); openSingleWithHandle(); }
      }, true);
      const folderBtn = document.createElement('button');
      folderBtn.type = 'button'; folderBtn.dataset.role = 'open-folder'; folderBtn.textContent = '打开文件夹';
      folderBtn.title = '选择项目文件夹，自动按相对路径关联图块集、图片、模板和世界（像桌面版 Tiled）';
      folderBtn.onclick = openFolder;
      openBtn.after(folderBtn);
      const menu = document.createElement('div'); menu.className = 'tb-menu'; menu.id = 'recentFolderMenu';
      menu.innerHTML = '<button type="button" class="tb-menu-btn" aria-haspopup="true" title="最近打开的文件夹">最近 ▾</button><div class="tb-menu-panel" role="menu" hidden></div>';
      folderBtn.after(menu);
      const mbtn = menu.querySelector('.tb-menu-btn'), panel = menu.querySelector('.tb-menu-panel');
      mbtn.addEventListener('click', (e) => { e.stopPropagation(); renderRecent(); panel.hidden = !panel.hidden; });
      document.addEventListener('click', (e) => { if (!menu.contains(e.target)) panel.hidden = true; });
      if (!hasFSA) menu.style.display = 'none';
    }
    async function renderRecent() {
      const panel = document.querySelector('#recentFolderMenu .tb-menu-panel');
      if (!panel) return;
      const dirs = await recentDirs();
      panel.innerHTML = '';
      if (!dirs.length) { const s = document.createElement('div'); s.textContent = '暂无，先「打开文件夹」'; s.style.padding = '6px 10px'; panel.appendChild(s); return; }
      dirs.slice(0, 10).forEach((d) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.textContent = d.name + (d.lastMap ? '  ·  ' + d.lastMap : '');
        b.onclick = async () => {
          panel.hidden = true;
          try {
            if (!(await ensurePermission(d.handle))) { api.status('未获授权：' + d.name); return; }
            await chooseMapIn(handleFS(d.handle), d.lastMap);
          } catch (e) { api.log('打开最近文件夹失败：' + e.message); }
        };
        panel.appendChild(b);
      });
      const clr = document.createElement('button'); clr.type = 'button'; clr.textContent = '清空列表';
      clr.onclick = async () => { await idbOp('readwrite', (s) => s.clear()); renderRecent(); };
      panel.appendChild(clr);
    }

    api.folder = { openFolder, openFromFS, chooseMapIn, collectBundle, handleFS, listFS, fsFromFileList, joinPath, extractRefs, recentDirs };
  }

  window.__tiledFolderUtils = { joinPath, extractRefs, collectBundle, listFS };
  if (window.TiledApp) setTimeout(() => boot(window.TiledApp), 140);
})();

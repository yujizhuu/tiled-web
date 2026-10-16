/* Tiled 网页版 · 顶栏布局：桌面式菜单栏 + 常用图标 + 「更多 ▾」溢出菜单。
 * 只搬动已有按钮节点（保留其事件），重复入口用代理项转发 click。 */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const KEYS = { save: '⌘S', undo: '⌘Z', redo: '⇧⌘Z', 'zoom-in': '+', 'zoom-out': '−', 'zoom-reset': '0' };

  function proxy(orig, label, key) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'tb-proxy';
    b.title = orig ? (orig.title || label) : label;
    b.innerHTML = '<span class="tb-lbl"></span>' + (key ? '<kbd>' + key + '</kbd>' : '');
    b.firstChild.textContent = label;
    b.addEventListener('click', () => { if (orig) orig.click(); });
    return b;
  }
  function asItem(el, label) {
    if (!el) return null;
    el.setAttribute('role', 'menuitem');
    if (label) el.textContent = label;
    const k = KEYS[el.dataset.action];
    if (k && !el.querySelector('kbd')) { const t = el.textContent; el.innerHTML = '<span class="tb-lbl"></span><kbd>' + k + '</kbd>'; el.firstChild.textContent = t; }
    return el;
  }
  function makeMenu(label, title) {
    const m = document.createElement('div'); m.className = 'tb-menu tb-mb'; m.dataset.label = label;
    m.innerHTML = '<button type="button" class="tb-menu-btn" aria-haspopup="true" aria-expanded="false"></button><div class="tb-menu-panel" role="menu" hidden></div>';
    const b = m.firstChild; b.textContent = label; b.title = title || label;
    return m;
  }
  function sep() { const h = document.createElement('hr'); h.className = 'tb-menu-sep'; return h; }
  function closeAll(except) {
    document.querySelectorAll('.tb-menu.open').forEach((m) => {
      if (m === except || (except && m.contains(except))) return;
      m.classList.remove('open');
      const b = m.querySelector(':scope > .tb-menu-btn'), p = m.querySelector(':scope > .tb-menu-panel');
      if (b) b.setAttribute('aria-expanded', 'false'); if (p) p.hidden = true;
    });
  }
  function openMenu(m) {
    const b = m.querySelector(':scope > .tb-menu-btn'), p = m.querySelector(':scope > .tb-menu-panel');
    closeAll(); m.classList.add('open'); b.setAttribute('aria-expanded', 'true'); p.hidden = false;
    p.classList.remove('tb-menu-panel-end'); p.style.left = '';
    const r = p.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) p.classList.add('tb-menu-panel-end');
  }
  function bindMenu(m) {
    const b = m.querySelector(':scope > .tb-menu-btn'), p = m.querySelector(':scope > .tb-menu-panel');
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); m.classList.contains('open') ? closeAll() : openMenu(m); });
    b.addEventListener('mouseenter', () => { if (m.closest('.tb-more-panel') || m.classList.contains('tb-more')) return; const o = document.querySelector('.tb-mb.open'); if (o && o !== m && !o.classList.contains('tb-more')) openMenu(m); });
    p.addEventListener('click', (e) => {
      e.stopPropagation();
      const hit = e.target.closest('button'); if (!hit || hit.classList.contains('tb-menu-btn')) return;
      if (hit.closest('#recentFolderMenu') && hit.closest('#recentFolderMenu > .tb-menu-btn')) return;
      closeAll();
    });
  }

  function build() {
    const bar = $('.topbar'), tb = $('.topbar .toolbar');
    if (!bar || !tb || bar.dataset.layout === 'menubar') return;
    bar.dataset.layout = 'menubar';
    const A = (a) => tb.querySelector('[data-action="' + a + '"]') || document.querySelector('.topbar [data-action="' + a + '"]');
    const T = (t) => tb.querySelector('.tb-menu [data-tool="' + t + '"]');
    const folderBtn = tb.querySelector('[data-role="open-folder"]');
    const recent = $('#recentFolderMenu');
    const helpBtn = $('.topbar .help-main');

    const menubar = document.createElement('nav'); menubar.className = 'tb-menubar'; menubar.setAttribute('aria-label', '菜单栏');
    const defs = [];
    const add = (label, title, items) => { const m = makeMenu(label, title); const p = m.lastChild; items.filter(Boolean).forEach((i) => p.appendChild(i)); menubar.appendChild(m); defs.push(m); return m; };

    const save = A('save'), undo = A('undo'), redo = A('redo');
    add('文件', '文件：新建、打开、保存、导出', [
      asItem(A('new'), '新建地图…'), asItem(A('open'), '打开文件…'),
      folderBtn && proxy(folderBtn, '打开文件夹…'), recent, sep(),
      proxy(save, '保存', KEYS.save), asItem(A('save-tmx'), '导出 TMX'), asItem(A('save-csv'), '导出 CSV（当前层）'), asItem(A('export-png'), '导出 PNG'), sep(),
      asItem(A('preferences'), '首选项…')]);
    add('编辑', '编辑：撤销、重做、类型与模板', [
      proxy(undo, '撤销', KEYS.undo), proxy(redo, '重做', KEYS.redo), sep(),
      asItem(A('object-types'), '对象类型…'), asItem(A('property-types'), '属性类型…'), asItem(A('templates'), '对象模板…'), sep(),
      asItem(A('edit-collision'), '编辑图块碰撞…')]);
    add('视图', '视图：网格、碰撞、缩放', [
      asItem(A('grid'), '显示网格'), asItem(A('collision'), '显示碰撞'), sep(),
      asItem(A('zoom-in'), '放大'), asItem(A('zoom-out'), '缩小'), asItem(A('zoom-reset'), '缩放 100%')]);
    const L = (a) => document.querySelector('.layers-section [data-action="' + a + '"]');
    add('图层', '图层：添加、排序、删除', [
      proxy(L('add-layer'), '添加瓦片层'), proxy(L('add-object-layer'), '添加对象层'), proxy(L('add-group-layer'), '添加组层'), sep(),
      proxy(L('move-layer-up'), '图层上移'), proxy(L('move-layer-down'), '图层下移'), proxy(L('remove-layer'), '删除图层')]);
    add('地图', '地图：自动地图、地形、分块', [
      asItem(A('automap'), '应用自动地图规则'), asItem(A('toggle-live-automap'), '实时自动地图'), asItem(A('automap-browser'), '规则浏览…'), asItem(A('rule-edit'), '规则编辑…'), sep(),
      asItem(T('terrain'), '地形笔刷'), asItem(T('wang'), 'Wang 笔刷'), asItem(A('wang-fill'), 'Wang 区域填充'), asItem(A('terrain-mark'), '标记地形角'), sep(),
      asItem(A('chunk-panel'), '无限地图分块…')]);
    add('世界', '世界与资源目录', [
      asItem(A('load-world'), '打开 .world…'), asItem(A('world-view-toggle'), '世界视图'), asItem(A('world-editor'), '世界编辑…'), sep(), asItem(A('bind-assets'), '绑定资源目录…')]);
    const helpItems = [helpBtn && proxy(helpBtn, '帮助文档', 'F1'), asItem(A('cli-help'), '浏览器命令行帮助')];
    const helpMenu = add('帮助', '帮助', helpItems);
    // 兜底：旧工具栏里还没被收编的动作都放进「编辑」，保证每个功能都可达
    const leftovers = [...tb.querySelectorAll('.tb-menu-panel [data-action], .tb-menu-panel [data-tool]')].filter((el) => !menubar.contains(el));
    leftovers.forEach((el) => defs[1].lastChild.appendChild(asItem(el)));

    // 常用图标
    const prim = document.createElement('div'); prim.className = 'tb-primary tb-chunk'; prim.setAttribute('role', 'group'); prim.setAttribute('aria-label', '常用');
    const icon = (el, ch, title) => { if (!el) return; el.classList.add('tb-icon'); el.textContent = ch; el.title = title; el.removeAttribute('role'); prim.appendChild(el); };
    icon(folderBtn, '📂', '打开文件夹（自动关联图块集）');
    icon(save, '💾', '保存（⌘S）');
    icon(undo, '↶', '撤销（⌘Z）');
    icon(redo, '↷', '重做（⇧⌘Z）');

    // 工具面板
    const tools = document.createElement('div'); tools.className = 'tb-tools tb-chunk'; tools.dataset.label = '工具';
    [tb.querySelector('.tool-mode'), ...tb.querySelectorAll(':scope > .tool-group')].forEach((n) => n && tools.appendChild(n));
    const zoom = tb.querySelector('.zoom'); if (zoom) zoom.classList.add('tb-chunk'), zoom.dataset.label = '缩放';

    // 更多
    const more = makeMenu('更多 ▾', '放不下的菜单和工具'); more.classList.add('tb-more'); more.lastChild.classList.add('tb-more-panel', 'tb-menu-panel-end'); more.hidden = true;

    // 重组
    tb.textContent = '';
    tb.append(menubar, prim, tools);
    if (zoom) tb.append(zoom);
    tb.append(more);
    [...defs, more].forEach(bindMenu);
    if (recent) { recent.classList.add('tb-sub'); recent.querySelector('.tb-menu-btn').textContent = '最近的文件夹 ▸'; }

    const status = $('#status');
    // 收起顺序：先隐状态，再缩放、工具，再从右往左收菜单
    const chunks = [zoom, tools, ...defs.slice().reverse()].filter(Boolean);
    const homes = new Map(); chunks.forEach((c) => homes.set(c, { parent: c.parentNode, next: null }));
    const order = [...tb.children];
    function restore() {
      // 按原始顺序放回
      menubar.textContent = ''; defs.forEach((d) => menubar.appendChild(d));
      [menubar, prim, tools, zoom, more].forEach((n) => n && tb.appendChild(n));
      more.lastChild.textContent = '';
    }
    const over = () => bar.scrollWidth > bar.clientWidth + 0.5 || tb.scrollWidth > tb.clientWidth + 0.5;
    let busy = false, lastW = -1;
    function layout(force) {
      const w = bar.clientWidth; if (busy || (!force && w === lastW)) return; busy = true; lastW = w;
      const wasOpen = document.querySelector('.topbar .tb-mb.open');
      closeAll(); restore(); more.hidden = true; bar.classList.remove('tb-no-status', 'tb-compact');
      if (status) status.hidden = false;
      if (over()) bar.classList.add('tb-compact');
      if (over() && status) { bar.classList.add('tb-no-status'); }
      const moved = [];
      for (const c of chunks) {
        if (!over()) break;
        more.hidden = false; moved.unshift(c);
        more.lastChild.textContent = ''; moved.forEach((x) => more.lastChild.appendChild(x));
        if (c.classList.contains('tb-mb')) { c.classList.remove('open'); c.querySelector(':scope > .tb-menu-panel').hidden = true; }
      }
      // 「更多」里按原顺序：菜单在前
      more.lastChild.textContent = '';
      [...defs.filter((d) => moved.includes(d)), tools, zoom].filter((x) => x && moved.includes(x)).forEach((x) => more.lastChild.appendChild(x));
      menubar.hidden = !menubar.children.length;
      if (wasOpen && !wasOpen.hidden && !wasOpen.closest('.tb-more-panel') && wasOpen.isConnected) openMenu(wasOpen);
      busy = false;
    }
    const ro = new ResizeObserver(() => layout(false)); ro.observe(bar);
    window.addEventListener('resize', () => layout(false));
    window.TiledTopbar = { layout: () => layout(true) };
    layout(true);
    void order; void homes; void helpMenu;
  }
  // 其他模块在 0–140ms 内各自 boot（folder 模块会插入「打开文件夹」），之后再重组
  function init() {
    const t0 = Date.now();
    (function wait() { if (document.querySelector('[data-role="open-folder"]') || Date.now() - t0 > 2500) setTimeout(build, 30); else setTimeout(wait, 40); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

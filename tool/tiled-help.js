/* Tiled 网页版 · 应用内帮助：? 按钮、F1 / ? 键、可搜索面板、上下文 ? 图标 */
(function () {
  'use strict';
  const H = window.TILED_HELP || [];
  const byId = Object.fromEntries(H.map((s) => [s.id, s]));
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let root, list, body, search;

  function sectionHtml(s) {
    const how = Array.isArray(s.how) ? '<ol>' + s.how.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ol>' : '<p>' + esc(s.how) + '</p>';
    return '<article class="help-article" id="help-' + s.id + '" data-help-id="' + s.id + '">' +
      '<h3>' + esc(s.title) + '</h3><p class="help-summary">' + esc(s.summary) + '</p>' +
      (s.what ? '<h4>是什么</h4><p>' + esc(s.what) + '</p>' : '') +
      (s.why ? '<h4>为什么</h4><p>' + esc(s.why) + '</p>' : '') +
      (s.how ? '<h4>怎么做</h4>' + how : '') +
      (s.example ? '<p class="help-example"><b>例子：</b>' + esc(s.example) + '</p>' : '') +
      (s.note ? '<p class="help-note">' + esc(s.note) + '</p>' : '') + '</article>';
  }

  function build() {
    root = document.createElement('div');
    root.id = 'helpPanel'; root.className = 'help-panel hidden';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', '帮助');
    root.innerHTML = '<div class="help-inner"><header><span>帮助 · 是什么 / 为什么 / 怎么做</span>' +
      '<input id="helpSearch" type="search" placeholder="搜索：图层、自动地图、TMX…"><button type="button" data-help-close title="关闭（Esc）">关闭</button></header>' +
      '<div class="help-body"><nav id="helpToc" class="help-toc"></nav><div id="helpContent" class="help-content"></div></div></div>';
    document.body.appendChild(root);
    list = root.querySelector('#helpToc'); body = root.querySelector('#helpContent'); search = root.querySelector('#helpSearch');
    let g = '', toc = '';
    H.forEach((s) => { if (s.group !== g) { g = s.group; toc += '<div class="help-group">' + esc(g) + '</div>'; } toc += '<a href="#help-' + s.id + '" data-help-link="' + s.id + '" title="' + esc(s.summary) + '">' + esc(s.title) + '</a>'; });
    list.innerHTML = toc;
    body.innerHTML = H.map(sectionHtml).join('') + '<p class="help-empty" hidden>没有找到匹配的内容</p>';
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.closest('[data-help-close]')) close();
      const a = e.target.closest('[data-help-link]'); if (a) { e.preventDefault(); go(a.dataset.helpLink); }
    });
    search.addEventListener('input', filter);
  }

  function filter() {
    const q = search.value.trim().toLowerCase(); let n = 0;
    H.forEach((s) => {
      const hit = !q || JSON.stringify(s).toLowerCase().includes(q);
      body.querySelector('#help-' + s.id).hidden = !hit;
      list.querySelector('[data-help-link="' + s.id + '"]').hidden = !hit;
      if (hit) n++;
    });
    body.querySelector('.help-empty').hidden = n > 0;
  }

  function go(id) {
    const el = body.querySelector('#help-' + id); if (!el) return;
    list.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.helpLink === id));
    body.scrollTop = el.offsetTop - body.offsetTop - 4;
  }

  function open(id) {
    if (!root) build();
    root.classList.remove('hidden');
    if (id && byId[id]) { search.value = ''; filter(); requestAnimationFrame(() => go(id)); } else search.focus();
  }
  function close() { if (root) root.classList.add('hidden'); }
  const isOpen = () => root && !root.classList.contains('hidden');

  function icon(id, extraClass) {
    const s = byId[id]; const b = document.createElement('button');
    b.type = 'button'; b.className = 'help-q' + (extraClass ? ' ' + extraClass : ''); b.textContent = '?';
    b.dataset.helpTopic = id; b.title = s ? s.title + '：' + s.summary + '（点击查看详解）' : '帮助';
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); open(id); });
    return b;
  }

  function init() {
    const toolbar = document.querySelector('.topbar .brand');
    if (toolbar) { const b = icon('start', 'help-main'); b.title = '帮助（F1 或 ?）：每个功能是什么、为什么、怎么做'; b.textContent = '?'; toolbar.appendChild(b); b.onclick = (e) => { e.preventDefault(); open(); }; }
    const heads = [['.layers-section', 'layers'], ['.map-section', 'map'], ['.objects-section', 'objects'], ['.tileset-section', 'tileset'],
      ['.terrain-section', 'terrain'], ['.wang-section', 'terrain'], ['.automap-section', 'automap'], ['.world-section', 'world'], ['.console-section', 'cli']];
    heads.forEach(([sel, id]) => { const h = document.querySelector(sel + ' .section-head > span:first-child'); if (h) h.appendChild(icon(id, 'help-inline')); });
    const p = document.querySelector('[data-props-for="map"] .props-head'); if (p) p.insertBefore(icon('properties', 'help-inline'), p.lastElementChild);
    const tp = document.querySelector('[data-props-for="tile"] .props-head'); if (tp) tp.insertBefore(icon('tile-props', 'help-inline'), tp.lastElementChild);
    const tg = document.querySelector('[data-tool-group="tile"]'); if (tg) tg.appendChild(icon('tools', 'help-inline'));
    const og = document.querySelector('[data-tool-group="object"]'); if (og) og.appendChild(icon('tool-object', 'help-inline'));
    // 工具按钮悬停一句话说明
    const toolTopic = { pencil: 'tool-pencil', eraser: 'tool-eraser', bucket: 'tool-bucket', select: 'tool-select', 'tile-select': 'tool-select', terrain: 'terrain', wang: 'terrain' };
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const s = byId[toolTopic[b.dataset.tool] || 'tool-object']; if (s && !b.dataset.helpTitled) { b.dataset.helpTitled = '1'; b.title = (b.title || '') + ' — ' + s.summary + '（F1 帮助）'; }
    });
    window.addEventListener('keydown', (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === 'F1') { e.preventDefault(); isOpen() ? close() : open(); return; }
      if (e.key === 'Escape' && isOpen()) { close(); return; }
      if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); open(); }
    });
    window.TiledHelp = { open, close, sections: H };
    const m = /[#&]help(?:=([\w-]+))?/.exec(location.hash); if (m) open(m[1]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

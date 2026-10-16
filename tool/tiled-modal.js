/* Tiled 网页版 · 统一弹窗：所有 .collision-editor 弹窗套用同一结构
 * （吸顶标题 + ✕、可滚动内容、底部按钮栏；最大 90vh / 视口宽；Esc 与点遮罩关闭）。 */
(function () {
  'use strict';
  const GROUPS = [
    ['网格与吸附', ['显示网格', '网格颜色', '细网格细分', '吸附到网格', '吸附到细网格', '吸附到像素']],
    ['显示', ['高亮当前图层', '图块对象描边', '图块动画', '对象标签', '对象线宽', '滚轮缩放']],
    ['编辑与导出', ['绘制时自动地图', '默认图层数据格式', '导出时嵌入图块集', '导出时分离模板实例', '默认导出格式']],
  ];
  const isOpen = (m) => !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none';
  function closeModal(m) {
    const btn = m.querySelector('.modal-foot [data-action^="close"], .modal-head [data-action^="close"]');
    if (btn) btn.click(); else m.classList.add('hidden');
    if (!isOpen(m)) m.setAttribute('aria-hidden', 'true');
  }
  function enhance(m) {
    if (m.dataset.modal) return; m.dataset.modal = '1';
    m.classList.add('modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const inner = m.querySelector(':scope > .collision-editor-inner'); if (!inner) return;
    inner.classList.add('modal-inner');
    const mw = parseInt(inner.style.minWidth, 10); if (mw) inner.style.setProperty('--mw', mw + 'px');
    inner.style.minWidth = ''; inner.style.maxWidth = '';
    const head = inner.querySelector(':scope > header');
    const title = head ? (head.querySelector('span') || head).textContent.trim() : '';
    if (title) m.setAttribute('aria-label', title);
    // 标题栏：只留标题 + ✕；其余按钮放到底部
    const newHead = document.createElement('header'); newHead.className = 'modal-head';
    const t = document.createElement('span'); t.className = 'modal-title'; t.textContent = title;
    const x = document.createElement('button'); x.type = 'button'; x.className = 'modal-x'; x.title = '关闭（Esc）'; x.setAttribute('aria-label', '关闭'); x.textContent = '✕';
    x.onclick = () => closeModal(m);
    newHead.append(t, x);
    const foot = document.createElement('footer'); foot.className = 'modal-foot';
    const body = document.createElement('div'); body.className = 'modal-body';
    if (head) {
      const btns = [...head.querySelectorAll('button')];
      const closers = btns.filter((b) => /^close/.test(b.dataset.action || ''));
      btns.filter((b) => !closers.includes(b)).forEach((b) => foot.appendChild(b));
      const sp = document.createElement('span'); sp.className = 'modal-foot-sp'; foot.appendChild(sp);
      closers.forEach((b) => { b.classList.add('modal-close'); foot.appendChild(b); });
      head.remove();
    }
    while (inner.firstChild) body.appendChild(inner.firstChild);
    inner.append(newHead, body);
    if (foot.querySelector('button')) inner.appendChild(foot);
    m.addEventListener('mousedown', (e) => { if (e.target === m) m._downOnBackdrop = true; });
    m.addEventListener('click', (e) => { if (e.target === m && m._downOnBackdrop) closeModal(m); m._downOnBackdrop = false; });
  }
  function groupPrefs(form) {
    if (!form || form.querySelector('.prefs-sec') || !form.querySelector(':scope > label')) return;
    const labels = [...form.querySelectorAll(':scope > label')];
    const byText = new Map(labels.map((l) => [(l.firstChild && l.firstChild.textContent || '').trim(), l]));
    const used = new Set();
    GROUPS.forEach(([name, keys]) => {
      const sec = document.createElement('section'); sec.className = 'prefs-sec';
      const h = document.createElement('h4'); h.textContent = name; const g = document.createElement('div'); g.className = 'prefs-rows';
      keys.forEach((k) => { const l = byText.get(k); if (l) { l.classList.remove('wide'); g.appendChild(l); used.add(l); } });
      if (g.children.length) { sec.append(h, g); form.appendChild(sec); }
    });
    const rest = labels.filter((l) => !used.has(l));
    if (rest.length) { const sec = document.createElement('section'); sec.className = 'prefs-sec'; sec.innerHTML = '<h4>其他</h4><div class="prefs-rows"></div>'; rest.forEach((l) => sec.lastChild.appendChild(l)); form.appendChild(sec); }
  }
  function init() {
    document.querySelectorAll('.collision-editor').forEach(enhance);
    new MutationObserver((muts) => {
      muts.forEach((mu) => mu.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList.contains('collision-editor')) enhance(n); }));
      groupPrefs(document.querySelector('#prefsForm'));
    }).observe(document.body, { childList: true, subtree: true });
    const pf = document.querySelector('#prefsForm'); if (pf) groupPrefs(pf);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = [...document.querySelectorAll('.collision-editor.modal')].filter(isOpen);
      if (!open.length) return;
      e.preventDefault(); e.stopPropagation(); closeModal(open[open.length - 1]);
    }, true);
    // 原生 <dialog>（打开文件夹选地图）：点遮罩关闭
    document.addEventListener('click', (e) => { const d = e.target; if (d && d.tagName === 'DIALOG' && d.open) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
    window.TiledModal = { closeModal, enhance };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

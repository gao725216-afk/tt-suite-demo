// Application frame: navigation rail (wide/medium), top bar, bottom tab bar
// (compact), docked assistant (wide) and the routed page.
import {html, raw, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from './overlays.js';
import {companionAvatar} from '../features/companion.js';

export const NAV = [
  {view: 'today', label: '今天', icon: 'today'},
  {view: 'calendar', label: '日历', icon: 'calendar'},
  {view: 'tasks', label: '任务', icon: 'tasks'},
  {view: 'focus', label: '专注', icon: 'focus'},
  {view: 'growth', label: '成长', icon: 'growth'},
  {view: 'notes', label: '笔记', icon: 'notes'},
];
const MARKS = {today: 'today', calendar: 'calendar', tasks: 'tasks', focus: 'focus', growth: 'growth', notes: 'notes', period: 'period', settings: 'settings'};
const PRIVATE = [];
const TABS = ['today', 'calendar', 'tasks', 'growth'];

function syncDot(sync) {
  const tone = sync.conflict ? 'conflict' : sync.status === 'offline' ? 'offline' : sync.status === 'error' ? 'error' : sync.pending || sync.status === 'saving' ? 'saving' : 'ok';
  return tone;
}

function railItem(item, route, app) {
  const current = route.view === item.view;
  const badge = item.badge?.(app.state);
  return html`<a class="${'rail-item mod-' + item.view}" href="${'?view=' + item.view}" data-act="nav.go" data-view="${item.view}"${attr('aria-current', current ? 'page' : false)} title="${item.label}"><span class="rail-tile">${icon(item.icon)}</span><span class="rail-label">${item.label}</span>${badge ? html`<span class="rail-badge">${badge}</span>` : ''}</a>`;
}

function rail(state, app) {
  const {route, sync, session} = state;
  const collapsed = state.layout.medium || state.layout.landscapePhone || app.ui('shell').railCollapsed;
  const tone = syncDot(sync);
  return html`<aside class="rail" data-collapsed="${collapsed ? 'true' : 'false'}" aria-label="主导航"><div class="rail-inner">
  <div class="rail-brand">
    <span class="brand-mark" aria-hidden="true">${raw(BRAND)}</span><span class="rail-label brand-name">Auto Timetable</span>
    ${state.layout.wide ? html`<button type="button" class="icon-btn sm rail-collapse" data-act="shell.rail" aria-label="${collapsed ? '展开导航' : '收起导航'}">${icon('panel')}</button>` : ''}
  </div>
  <nav class="rail-nav">
    ${NAV.map(item => railItem(item, route, app))}

    ${PRIVATE.map(item => railItem(item, route, app))}
  </nav>
  <div class="rail-foot">
    ${railItem({view: 'settings', label: '设置', icon: 'settings'}, route, app)}
    <button type="button" class="rail-sync" data-act="sync.open" data-tone="${tone}" title="${sync.message}">
      <span class="avatar" aria-hidden="true">${(session.user.username || '?').slice(0, 1).toUpperCase()}</span>
      <span class="rail-label rail-sync-copy"><b>${session.user.username}</b><small data-sync-message><i class="dot" data-tone="${tone}"></i>${sync.message}</small></span>
    </button>
  </div>
</div></aside>`;
}

function tabbar(state) {
  const {route} = state;
  const more = !TABS.includes(route.view);
  return html`<nav class="tabbar" aria-label="主导航">
  ${TABS.map(view => { const item = NAV.find(n => n.view === view); return html`<a class="${'tab mod-' + view}" href="${'?view=' + view}" data-act="nav.go" data-view="${view}"${attr('aria-current', route.view === view ? 'page' : false)}><span class="tab-bean">${icon(item.icon)}</span><span>${item.label}</span></a>`; })}
  <button type="button" class="${'tab mod-' + (more ? route.view : 'settings')}" data-act="shell.more"${attr('aria-current', more ? 'page' : false)} aria-haspopup="dialog"><span class="tab-bean">${icon('menu')}</span><span>更多</span></button>
</nav>`;
}

function topbar(state, page, app) {
  const {layout, sync} = state;
  const tone = syncDot(sync);
  const assistantOpen = app.ui('assistant').open;
  return html`<header class="topbar">
  ${page.back ? html`<button type="button" class="icon-btn" data-act="nav.back" data-view="${page.back.view}" data-params="${JSON.stringify(page.back.params || {})}" aria-label="${'返回' + (page.back.label || '')}">${icon('back')}</button>` : ''}
  ${page.back ? '' : html`<span class="topbar-mark" aria-hidden="true">${icon(page.mark || MARKS[state.route.view] || 'today')}</span>`}
  <div class="topbar-title">
    <h1>${page.title}</h1>
    ${page.subtitle ? html`<p>${page.subtitle}</p>` : ''}
  </div>
  ${layout.compact && tone !== 'ok' ? html`<button type="button" class="sync-pill" data-act="sync.open" data-tone="${tone}"><i class="dot" data-tone="${tone}"></i><span>${tone === 'saving' ? '保存中' : tone === 'offline' ? '离线' : tone === 'conflict' ? '需处理' : '未保存'}</span></button>` : ''}
  <div class="topbar-actions">
    ${app.getView('focus')?.pill?.(state) || ''}
    ${page.actions || ''}
    <button type="button" class="btn btn-primary capture-btn" data-act="capture.open" aria-label="新建事项" title="新建事项（N）">${icon('plus')}<span class="label">新建</span></button>
    <button type="button" class="assistant-btn" data-act="assistant.toggle" aria-label="${assistantOpen ? '收起 AI 助手' : '打开 AI 助手'}" aria-expanded="${assistantOpen ? 'true' : 'false'}" title="AI 助手（Ctrl + K）">${companionAvatar(state, app)}<span class="assistant-label">AI 助手</span></button>
  </div>
</header>`;
}

export function renderShell(state, app) {
  const {route, layout} = state;
  const view = app.getView(route.view) || app.getView('today');
  let page;
  try { page = view.render(state, app); }
  catch (error) {
    console.error(error);
    page = {title: '页面暂时无法显示', body: html`<div class="empty"><div class="empty-mark">${icon('alert')}</div><h3>这个页面加载时出错</h3><p>${error.message}</p><button type="button" class="btn btn-quiet" data-act="nav.go" data-view="today">回到今天</button></div>`};
  }
  const assistantDocked = layout.wide && app.ui('assistant').open;
  const classes = cx('app', assistantDocked && 'has-assistant', !layout.compact && 'has-rail', (layout.medium || layout.landscapePhone || app.ui('shell').railCollapsed) && 'rail-collapsed');
  return html`<div class="${classes}" data-view="${route.view}">
  ${layout.compact ? '' : rail(state, app)}
  <div class="main">
    ${layout.landscapePhone && page.immersive ? '' : topbar(state, page, app)}
    <main class="${cx('view', 'view-' + route.view, page.className)}" id="view" data-key="${'view-' + route.view}"${page.private ? raw(' data-private-period') : ''} tabindex="-1">
      ${page.body}
    </main>
  </div>
  ${assistantDocked ? app.getView('assistant').panel(state, app) : ''}
  ${layout.compact ? tabbar(state) : ''}
</div>`;
}

export function registerShell(app) {
  app.on('shell.rail', () => app.setUi('shell', s => ({railCollapsed: !s.railCollapsed})));
  app.on('nav.back', el => app.go(el.dataset.view, JSON.parse(el.dataset.params || '{}')));
  app.on('shell.more', () => {
    const items = [
      {view: 'focus', label: '专注与回顾', icon: 'focus', hint: '番茄钟、正计时与日周回顾'},
      {view: 'notes', label: '笔记', icon: 'notes', hint: 'Markdown 笔记与回收站'},
      {view: 'settings', label: '设置', icon: 'settings', hint: '演示说明、主题与本地数据'},
    ];
    app.overlays.show('more', {size: 'small', label: '更多页面', render: state => frame({title: '更多', body: html`<div class="action-list">${items.map(item => html`<button type="button" data-act="shell.moreGo" data-view="${item.view}"${attr('aria-current', state.route.view === item.view ? 'page' : false)}>${icon(item.icon)}<span>${item.label}</span><small>${item.hint}</small></button>`)}</div>`})});
  });
  app.on('shell.moreGo', el => { app.overlays.close('more', {restoreFocus: false}); app.go(el.dataset.view); });
  // While typing on a phone the on-screen keyboard takes the bottom of the
  // screen: hide the floating tab bar so it never covers the field.
  const typing = el => el?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]), textarea, select, [contenteditable="true"]');
  document.addEventListener('focusin', event => document.documentElement.classList.toggle('is-typing', !!typing(event.target)));
  document.addEventListener('focusout', () => requestAnimationFrame(() => document.documentElement.classList.toggle('is-typing', !!typing(document.activeElement))));
  // Keyboard: N = new item, Ctrl/Cmd+K = assistant, g then letter = navigate.
  let chord = 0;
  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target.matches?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'k') { event.preventDefault(); app.attempt(() => app.getView('assistant').toggle(app, true)); return; }
    if (typing || event.ctrlKey || event.metaKey || event.altKey || app.overlays.any()) return;
    if (event.key === 'n' || event.key === 'N') { event.preventDefault(); document.querySelector('[data-act="capture.open"]')?.click(); return; }
    if (event.key === 'g') { chord = Date.now(); return; }
    if (Date.now() - chord < 900) {
      const map = {t: 'today', c: 'calendar', r: 'tasks', f: 'focus', g: 'growth', n: 'notes', s: 'settings'};
      if (map[event.key]) { event.preventDefault(); app.go(map[event.key]); }
      chord = 0;
    }
  });
}

// Seedling-in-a-square brand mark (original).
const BRAND = '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="var(--pine)"/><path d="M16 25v-8.5" stroke="var(--on-pine)" stroke-width="2.2" stroke-linecap="round"/><path d="M16 17c0-4.3-2.9-7-7.2-7 0 4.3 2.9 7 7.2 7Z" fill="var(--on-pine)" opacity=".92"/><path d="M16 15c0-3.7 2.5-6.2 6.8-6.2 0 3.7-2.5 6.2-6.8 6.2Z" fill="var(--on-pine)"/></svg>';
export const brandMark = () => raw(BRAND);

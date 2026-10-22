// 任务: smart lists, lists, tags and saved filters on one side; the same task
// set as a list, board or priority quadrant; an inspector on wide screens.
// Layout changes never copy or re-create tasks — they are projections.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {organizer, workspace, taskViews} from '../core.js';
import {childCounts, uid} from '../domain/items.js';
import {taskRow, PRIORITY_LABEL, planChip, deadlineChip} from './item-row.js';
import {addDays} from '../lib/dates.js';

export const SMART = [
  ['todo', '全部待办', 'tasks'], ['inbox', '收集箱', 'inbox'], ['today', '今天', 'today'], ['tomorrow', '明天', 'calendar'],
  ['next7', '最近 7 天', 'calendar'], ['overdue', '逾期', 'flag'], ['unscheduled', '未安排', 'hourglass'], ['done', '已完成', 'check'], ['all', '全部', 'layers'],
];
const LAYOUTS = [['list', '列表', 'list'], ['board', '看板', 'board'], ['quadrant', '四象限', 'quadrant']];

function currentList(state) {
  const list = state.route.params.list || 'todo';
  const org = organizer.get(state.doc.schedule);
  const valid = SMART.some(([id]) => id === list) || org.lists.some(l => 'list:' + l.id === list) || org.tags.some(t => 'tag:' + t.id === list);
  return valid ? list : 'todo';
}
export function listName(state, view) {
  const org = organizer.get(state.doc.schedule);
  return SMART.find(([id]) => id === view)?.[1] || org.lists.find(l => 'list:' + l.id === view)?.name || ('#' + (org.tags.find(t => 'tag:' + t.id === view)?.name || '')) ;
}
function options(state, app) {
  const ui = app.ui('tasks');
  return {view: currentList(state), query: ui.query || '', tagId: ui.tagId || '', priority: ui.priority ?? '', sort: ui.sort || 'date'};
}
const count = (state, view) => organizer.selectTasks(state.doc.schedule, state.doc.progress.records, state.today, {view}).length;

function listNav(state, app, {inSheet = false} = {}) {
  const org = organizer.get(state.doc.schedule);
  const current = currentList(state);
  const folded = app.ui('tasks').folded || [];
  const link = (view, label, iconName, extra = '') => html`<button type="button" class="list-link" data-act="tasks.list" data-list="${view}"${attr('aria-current', current === view ? 'page' : false)}>${icon(iconName)}<span class="ellipsis">${label}</span>${extra}<span class="list-count">${count(state, view) || ''}</span></button>`;
  const lists = org.lists.filter(l => !l.archived), folders = org.folders.filter(f => !f.archived);
  const filters = workspace.get(state.doc.schedule).filters;
  return html`<nav class="${cx('list-nav', inSheet && 'in-sheet')}" aria-label="任务清单">
    <div class="list-group">${SMART.filter(([id]) => !['done', 'all'].includes(id)).map(([id, label, ic]) => link(id, label, ic))}</div>
    <div class="list-group"><p class="list-group-title">清单</p>
      ${lists.filter(l => !l.folderId).map(l => link('list:' + l.id, l.name, 'list'))}
      ${folders.map(f => html`<details class="folder" data-key="${'folder-' + f.id}"${attr('open', !folded.includes(f.id))} data-folder="${f.id}"><summary>${icon('folder')}<span class="ellipsis">${f.name}</span>${icon('down')}</summary>${lists.filter(l => l.folderId === f.id).map(l => link('list:' + l.id, l.name, 'list'))}</details>`)}
      ${!lists.length ? html`<p class="list-empty">还没有清单</p>` : ''}
    </div>
    ${org.tags.filter(t => !t.archived).length ? html`<div class="list-group"><p class="list-group-title">标签</p>${org.tags.filter(t => !t.archived).map(t => link('tag:' + t.id, '#' + t.name, 'tag'))}</div>` : ''}
    ${filters.length ? html`<div class="list-group"><p class="list-group-title">保存的筛选</p>${filters.map(f => html`<button type="button" class="list-link" data-act="tasks.applyFilter" data-id="${f.id}">${icon('filter')}<span class="ellipsis">${f.name}</span></button>`)}</div>` : ''}
    <div class="list-group">${link('done', '已完成', 'check')}${link('all', '全部', 'layers')}</div>
    <div class="list-group list-actions"><button type="button" class="list-link" data-act="tasks.manage">${icon('settings')}<span>管理清单与标签</span></button><button type="button" class="list-link" data-act="tasks.templates">${icon('template')}<span>任务模板</span></button></div>
  </nav>`;
}

function filterBar(state, app) {
  const ui = app.ui('tasks'), org = organizer.get(state.doc.schedule);
  const active = (ui.query ? 1 : 0) + (ui.tagId ? 1 : 0) + (ui.priority !== undefined && ui.priority !== '' ? 1 : 0) + (ui.sort === 'priority' ? 1 : 0);
  return html`<div class="filter-bar">
    <label class="search"><span class="sr-only">搜索任务</span>${icon('search')}<input class="input" type="search" placeholder="搜索标题或备注" value="${ui.query || ''}" data-input="tasks.query" maxlength="200"></label>
    <details class="filter-pop" data-key="filter-pop"><summary class="btn btn-quiet">${icon('filter')}筛选${active ? html`<span class="count">${active}</span>` : ''}</summary>
      <div class="filter-pop-body">
        <label class="field"><span>标签</span><select class="select" data-change="tasks.filter" name="tagId"><option value="">全部标签</option>${org.tags.filter(t => !t.archived).map(t => html`<option value="${t.id}"${attr('selected', ui.tagId === t.id)}>#${t.name}</option>`)}</select></label>
        <label class="field"><span>优先级</span><select class="select" data-change="tasks.filter" name="priority">${[['', '全部'], ['3', '高'], ['2', '中'], ['1', '低'], ['0', '未设置']].map(([v, l]) => html`<option value="${v}"${attr('selected', String(ui.priority ?? '') === v)}>${l}</option>`)}</select></label>
        <label class="field"><span>排序</span><select class="select" data-change="tasks.filter" name="sort"><option value="date"${attr('selected', ui.sort !== 'priority')}>按日期</option><option value="priority"${attr('selected', ui.sort === 'priority')}>按优先级</option></select></label>
        <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-act="tasks.clearFilter"${attr('disabled', !active)}>清除筛选</button><span class="spacer"></span><button type="button" class="btn btn-quiet btn-sm" data-act="tasks.saveFilter">${icon('save')}保存为筛选</button></div>
      </div>
    </details>
    <button type="button" class="btn btn-quiet" data-act="tasks.bulk" aria-pressed="${ui.bulk ? 'true' : 'false'}">${icon('steps')}${ui.bulk ? '完成整理' : '批量整理'}</button>
  </div>`;
}

function listView(state, app, visible) {
  const records = state.doc.progress.records, counts = childCounts(state.doc), ui = app.ui('tasks');
  const view = currentList(state);
  const outline = workspace.outline(state.doc.schedule, visible.filter(e => e.type === 'task'));
  const doneKeys = new Set(records.map(r => r.key));
  const deferredOnce = visible.filter(e => e.type === 'once');
  const showDone = ['done', 'all'].includes(view);
  const rows = outline.map(info => ({...info, done: doneKeys.has('task:' + info.event.id)}));
  const pending = showDone ? rows : rows.filter(r => !r.done);
  const selected = new Set(ui.selected || []);
  const row = info => taskRow(info.event, state, {...info, childCount: counts.get(info.event.id), selecting: ui.bulk, selected: selected.has(info.event.id), hideList: view.startsWith('list:')});
  if (!rows.length && !deferredOnce.length) return emptyFor(view, ui);
  return html`${pending.length ? html`<ul class="items">${pending.map(row)}</ul>` : ''}
  ${deferredOnce.length ? html`<p class="list-label">${icon('hourglass')}暂不安排的日程</p><ul class="items">${deferredOnce.map(e => html`<li class="item" data-key="${'d-' + e.id}" data-item-menu="${e.id}"><span class="done-btn" aria-hidden="true"><i>${icon('calendar')}</i></span><button type="button" class="item-body" data-act="item.defer" data-id="${e.id}"><span class="item-title"><b>${e.title}</b></span><span class="item-meta"><span class="chip chip-outline">${icon('hourglass')}暂不安排 · 点按重新安排</span></span></button><button type="button" class="icon-btn sm item-more" data-act="item.menu" data-id="${e.id}" aria-label="${'更多操作：' + e.title}">${icon('more')}</button></li>`)}</ul>` : ''}`;
}

function emptyFor(view, ui) {
  if (ui.query || ui.tagId || (ui.priority ?? '') !== '') return html`<div class="empty"><div class="empty-mark">${icon('search')}</div><h3>没有符合筛选条件的任务</h3><button type="button" class="btn btn-quiet" data-act="tasks.clearFilter">清除筛选</button></div>`;
  const copy = {inbox: ['收集箱是空的', '想到什么先记在这里，稍后再决定放到哪个清单、安排在哪天。'], today: ['今天没有到期或计划中的待办', '可以从收集箱里挑一件安排到今天。'], overdue: ['没有逾期的任务', '截止日期都还来得及。'], unscheduled: ['所有待办都安排了日期', ''], done: ['还没有完成记录', '完成一项待办后会出现在这里。'], tomorrow: ['明天还没有安排', ''], next7: ['最近 7 天没有安排', '']}[view] || ['这里还没有任务', '在上方输入框记下一件事。'];
  return html`<div class="empty"><div class="empty-mark">${icon(view === 'done' ? 'check' : view === 'inbox' ? 'inbox' : 'tasks')}</div><h3>${copy[0]}</h3>${copy[1] ? html`<p>${copy[1]}</p>` : ''}</div>`;
}

function card(info, state, app) {
  const e = info.event, steps = e.steps || [];
  const org = organizer.get(state.doc.schedule), list = org.lists.find(l => l.id === e.listId);
  return html`<article class="${cx('board-card', info.done && 'is-done')}" data-key="${'bc-' + e.id}" data-item-menu="${e.id}" data-card="${e.id}" draggable="${info.done ? 'false' : 'true'}">
    <div class="board-card-top">
      <button type="button" class="${cx('done-btn', !info.done && e.priority && 'prio-ring-' + e.priority)}" data-act="item.complete" data-id="${e.id}" data-date="${state.today}" aria-pressed="${info.done ? 'true' : 'false'}" aria-label="${(info.done ? '撤销完成：' : '完成：') + e.title}"><i>${icon('check')}</i></button>
      <button type="button" class="item-body" data-act="item.open" data-id="${e.id}"><span class="item-title"><b>${e.title}</b></span>${info.parentTitle ? html`<span class="item-parent">${icon('subtask')}${info.parentTitle}</span>` : ''}</button>
    </div>
    <div class="item-meta">${planChip(e, state.today)}${deadlineChip(e, state.today, info.done)}${list ? html`<span class="chip">${list.name}</span>` : ''}${steps.length ? html`<span class="chip">${icon('steps')}${steps.filter(s => s.done).length}/${steps.length}</span>` : ''}</div>
    <div class="board-card-foot"><button type="button" class="btn btn-ghost btn-sm" data-act="tasks.move" data-id="${e.id}"${attr('disabled', info.done)} aria-label="${'移动到其他分组：' + e.title}">${icon('move')}移动到…</button><span class="spacer"></span><button type="button" class="icon-btn sm" data-act="item.menu" data-id="${e.id}" aria-label="${'更多操作：' + e.title}">${icon('more')}</button></div>
  </article>`;
}

function boardView(state, app, mode) {
  const ui = app.ui('tasks');
  const projection = taskViews.project(state.doc.schedule, state.doc.progress.records, state.today, {...options(state, app), mode, groupBy: ui.groupBy || 'priority'});
  const done = new Set(state.doc.progress.records.map(r => r.key));
  return html`${mode === 'board' ? html`<div class="board-head"><span class="small">${projection.total} 个待办</span><label class="inline-field">分组<select class="select" data-change="tasks.groupBy"><option value="priority"${attr('selected', (ui.groupBy || 'priority') === 'priority')}>按优先级</option><option value="list"${attr('selected', ui.groupBy === 'list')}>按清单</option></select></label></div>` : html`<p class="hint quadrant-rule">中、高优先级算“重要”；截止日期在今天及以前算“紧急”。没有截止日期的任务归入不紧急。</p>`}
  ${projection.excluded ? html`<p class="hint">另有 ${projection.excluded} 项暂不安排的日程只在列表中显示。</p>` : ''}
  <div class="${cx('board', 'board-' + mode)}" role="list">${projection.columns.map((column, index) => html`<section class="${cx('board-col', 'col-' + (mode === 'quadrant' ? column.id : 'n' + (index % 4)))}" data-key="${'col-' + column.id}" data-drop="${column.id}" role="listitem" aria-label="${column.name + '，' + column.tasks.length + ' 项'}">
      <header><div><h3>${column.name}</h3><p>${column.hint}</p></div><span class="count">${column.tasks.length}</span></header>
      <div class="board-col-body">${column.tasks.length ? column.tasks.map(info => card({...info, done: done.has('task:' + info.event.id)}, state, app)) : html`<p class="board-empty">拖到这里，或用“移动到…”</p>`}</div>
    </section>`)}</div>`;
}

function inspector(state, app) {
  const id = state.route.params.task;
  if (!id) return '';
  const editor = app.getView('editor');
  return html`<aside class="inspector" aria-label="待办详情" data-key="inspector">
    <div class="overlay-head"><h2>待办详情</h2><button type="button" class="icon-btn" data-act="tasks.closeInspector" aria-label="关闭详情">${icon('close')}</button></div>
    <div class="overlay-body">${editor.taskForm(state, app, id)}</div>
    <div class="overlay-foot">${editor.taskFoot(state, app, id)}</div>
  </aside>`;
}

export function registerTasks(app) {
  app.view('tasks', {
    render(state, app) {
      const ui = app.ui('tasks');
      const view = currentList(state);
      const layout = ['board', 'quadrant'].includes(state.route.params.layout) ? state.route.params.layout : 'list';
      const visible = organizer.selectTasks(state.doc.schedule, state.doc.progress.records, state.today, options(state, app));
      const wide = state.layout.wide;
      const showSide = !state.layout.compact;
      const inspect = wide && state.route.params.task && layout === 'list';
      const selected = (ui.selected || []).filter(id => visible.some(e => e.id === id));
      return {
        title: listName(state, view),
        subtitle: state.layout.compact ? '' : visible.length + ' 项',
        className: 'full-bleed',
        actions: html`<div class="seg layout-seg" role="group" aria-label="任务布局">${LAYOUTS.map(([id, label, ic]) => html`<button type="button" data-act="tasks.layout" data-layout="${id}" aria-pressed="${layout === id ? 'true' : 'false'}" title="${label}">${icon(ic)}<span class="seg-label">${label}</span></button>`)}</div>`,
        body: html`<div class="${cx('tasks', showSide && 'has-lists', inspect && 'has-inspector')}">
  ${showSide ? html`<div class="tasks-lists">${listNav(state, app)}</div>` : ''}
  <div class="tasks-main">
    ${state.layout.compact ? html`<div class="list-chips" role="group" aria-label="快速切换">${SMART.slice(0, 7).map(([id, label]) => html`<button type="button" class="chip-btn" data-act="tasks.list" data-list="${id}"${attr('aria-current', view === id ? 'page' : false)}>${label}${count(state, id) ? html` <b>${count(state, id)}</b>` : ''}</button>`)}<button type="button" class="chip-btn" data-act="tasks.allLists">${icon('list')}清单与标签</button></div>` : ''}
    <form class="quick-add" data-submit="tasks.capture" data-key="tasks-capture"><span aria-hidden="true">${icon('plus')}</span><input class="quick-add-input" name="title" maxlength="200" autocomplete="off" placeholder="${'添加到“' + listName(state, view) + '”，回车保存'}" aria-label="快速添加待办" data-uncontrolled><button type="submit" class="btn btn-ghost btn-sm">添加</button></form>
    ${filterBar(state, app)}
    ${ui.bulk ? html`<div class="bulk-bar" role="group" aria-label="批量整理"><b>已选 ${selected.length} 项</b><button type="button" class="btn btn-ghost btn-sm" data-act="tasks.selectAll">选择当前全部（最多 500）</button><button type="button" class="btn btn-ghost btn-sm" data-act="tasks.selectNone"${attr('disabled', !selected.length)}>清空</button><span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" data-act="tasks.batch"${attr('disabled', !selected.length)}>整理所选</button></div>` : ''}
    ${ui.lastMove ? html`<div class="callout callout-pine move-undo" role="status">${icon('move')}<span>已把「${ui.lastMove.title}」移到 ${ui.lastMove.target}</span><button type="button" class="btn btn-quiet btn-sm" data-act="tasks.undoMove">撤销这次移动</button><button type="button" class="icon-btn sm" data-act="tasks.dismissMove" aria-label="关闭提示">${icon('close')}</button></div>` : ''}
    ${layout === 'list' ? listView(state, app, visible) : boardView(state, app, layout)}
  </div>
  ${inspect ? inspector(state, app) : ''}
</div>`,
      };
    },
    reveal(app, id) { /* newly created tasks are visible in their list; nothing to scroll in a short list */ },
  });

  app.on('tasks.list', el => { app.overlays.close('lists', {restoreFocus: false}); app.setUi('tasks', {selected: [], bulk: false}); app.go('tasks', {...app.state.route.params, list: el.dataset.list, task: undefined}); });
  app.on('tasks.allLists', () => app.overlays.show('lists', {label: '清单与标签', render: state => frame({title: '清单与标签', body: listNav(state, app, {inSheet: true})})}));
  app.on('tasks.layout', el => app.setParams({layout: el.dataset.layout === 'list' ? '' : el.dataset.layout, task: ''}));
  app.on('tasks.groupBy', el => app.setUi('tasks', {groupBy: el.value}));
  let queryTimer = 0;
  app.on('tasks.query', el => { clearTimeout(queryTimer); const value = el.value; queryTimer = setTimeout(() => app.setUi('tasks', {query: value}), 160); });
  app.on('tasks.filter', el => app.setUi('tasks', {[el.name]: el.value}));
  app.on('tasks.clearFilter', () => { app.setUi('tasks', {query: '', tagId: '', priority: '', sort: 'date'}); const input = document.querySelector('.filter-bar input[type=search]'); if (input) input.value = ''; });
  app.on('tasks.applyFilter', el => {
    const filter = workspace.get(app.state.doc.schedule).filters.find(f => f.id === el.dataset.id);
    if (!filter) return;
    const o = filter.options;
    app.setUi('tasks', {query: o.query, tagId: o.tagId, priority: o.priority, sort: o.sort});
    app.overlays.close('lists', {restoreFocus: false});
    app.go('tasks', {...app.state.route.params, list: o.view, task: undefined});
    app.toast('已应用筛选「' + filter.name + '」');
  });
  app.on('tasks.saveFilter', () => {
    app.overlays.show('save-filter', {size: 'small', editing: true, render: state => frame({title: '保存当前筛选', subtitle: '保存清单、搜索、标签、优先级和排序组合；不复制任务。', body: html`<form id="filterForm" data-submit="tasks.saveFilterSubmit" class="stack" data-key="filter-form"><label class="field">名称<input class="input" name="name" maxlength="80" required autofocus data-uncontrolled value="${listName(state, currentList(state))}"></label><p class="form-error" role="alert">${app.ui('tasks').filterError || ''}</p></form>`, foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="filterForm" class="btn btn-primary">保存</button>`})});
  });
  app.on('tasks.saveFilterSubmit', form => {
    const name = form.elements.name.value.trim();
    if (!name) return;
    const o = options(app.state, app);
    try {
      app.commit(draft => { const next = workspace.put(draft.schedule, 'filters', {id: uid('filter'), name, options: {view: o.view, query: o.query, tagId: o.tagId, priority: String(o.priority ?? ''), sort: o.sort}}); draft.schedule.library = next.library; }, {message: '已保存筛选「' + name + '」'});
      app.overlays.close('save-filter');
    } catch (error) { if (!error.handled) app.setUi('tasks', {filterError: error.message}); }
  });
  app.on('tasks.capture', form => {
    const input = form.elements.title, title = input.value.trim();
    if (!title) { input.focus(); return; }
    const view = currentList(app.state);
    const preset = {title};
    if (view.startsWith('list:')) { preset.listId = view.slice(5); preset.inbox = false; }
    else if (view.startsWith('tag:')) preset.tagIds = [view.slice(4)];
    if (view === 'today') preset.plannedDate = app.today;
    if (view === 'tomorrow') preset.plannedDate = addDays(app.today, 1);
    app.commit(draft => app.getView('editor').createQuickTask(draft, preset), {message: '已添加', detail: title + ' · ' + (preset.listId ? listName(app.state, view) : preset.plannedDate ? listName(app.state, view) : '收集箱')});
    input.value = ''; input.focus({preventScroll: true});
  });
  app.on('tasks.closeInspector', () => app.setParams({task: ''}));
  app.on('tasks.bulk', () => app.setUi('tasks', s => ({bulk: !s.bulk, selected: []})));
  app.on('tasks.select', el => app.setUi('tasks', s => {
    const set = new Set(s.selected || []);
    if (el.checked) { if (set.size >= 500) { el.checked = false; app.toast('一次最多整理 500 个待办。', {tone: 'error'}); return {}; } set.add(el.value); } else set.delete(el.value);
    return {selected: [...set]};
  }));
  app.on('tasks.selectAll', () => {
    const visible = organizer.selectTasks(app.state.doc.schedule, app.state.doc.progress.records, app.today, options(app.state, app)).filter(e => e.type === 'task').slice(0, 500);
    app.setUi('tasks', {selected: visible.map(e => e.id)});
  });
  app.on('tasks.selectNone', () => app.setUi('tasks', {selected: []}));
  app.on('tasks.batch', () => batchDialog(app));
  app.on('tasks.batchSubmit', form => {
    const f = new FormData(form), patch = {}, list = f.get('list');
    try {
      if (list !== '@keep') { patch.listId = list.startsWith('@') ? '' : list; patch.inbox = list === '@inbox'; }
      if (f.get('priority') !== '') patch.priority = Number(f.get('priority'));
      if (f.get('tagMode') !== 'keep') patch.tagIds = f.get('tagMode') === 'clear' ? [] : f.getAll('tag');
      if (f.get('dateMode') !== 'keep') { patch.plannedDate = f.get('dateMode') === 'clear' ? '' : f.get('date'); if (f.get('dateMode') === 'set' && !patch.plannedDate) throw new Error('请选择新的执行日期。'); }
      if (!Object.keys(patch).length) throw new Error('请选择至少一项整理方式。');
      const ids = app.ui('tasks').selected || [];
      const before = app.state.doc.schedule.events.filter(e => ids.includes(e.id)).map(e => structuredClone(e));
      app.commit(draft => { const next = workspace.batch(draft.schedule, ids, patch); draft.schedule.events = next.events; }, {message: '已整理 ' + ids.length + ' 个待办', undo: () => app.commit(draft => {
        for (const old of before) { const index = draft.schedule.events.findIndex(e => e.id === old.id); if (index >= 0) draft.schedule.events[index] = old; }
      }, {message: '已撤销批量整理'})});
      app.overlays.close('batch');
      app.setUi('tasks', {selected: [], bulk: false});
    } catch (error) { if (!error.handled) app.setUi('tasks', {batchError: error.message}); }
  });
  app.on('tasks.move', el => moveDialog(app, el.dataset.id));
  app.on('tasks.moveTarget', el => app.setUi('tasks', {moveChosen: el.value, moveDeadline: null, moveError: ''}));
  app.on('tasks.moveDeadline', el => app.setUi('tasks', {moveDeadline: el.value, moveError: ''}));
  app.on('tasks.moveSubmit', form => {
    const ui = app.ui('tasks'), move = ui.move;
    try {
      const plan = planFromForm(app, form);
      if (!plan.changes.length) throw new Error('已经在这个分组，无需修改。');
      if (app.today !== move.today) throw new Error('日期已变化，请重新打开移动窗口。');
      app.commit(draft => { draft.schedule = taskViews.apply(draft.schedule, draft.progress.records, plan); });
      app.setUi('tasks', {lastMove: {plan, title: plan.title, target: plan.target}, moveError: ''});
      app.overlays.close('move');
      app.toast('已移到 ' + plan.target, {detail: plan.title, action: {label: '撤销', run: () => undoMove(app)}});
    } catch (error) { if (!error.handled) app.setUi('tasks', {moveError: error.message}); }
  });
  app.on('tasks.undoMove', () => undoMove(app));
  app.on('tasks.dismissMove', () => app.setUi('tasks', {lastMove: null}));
  app.on('tasks.manage', () => manageDialog(app));
  app.on('tasks.templates', () => templatesDialog(app));
  app.on('tasks.useTemplate', el => {
    app.commit(draft => { draft.schedule = workspace.instantiate(draft.schedule, el.dataset.id, () => uid('task')); }, {message: '已用模板创建任务', detail: '放在收集箱，可以再安排日期'});
    app.overlays.close('templates');
    app.go('tasks', {list: 'inbox'});
  });
  app.on('tasks.deleteTemplate', el => {
    const lib = workspace.get(app.state.doc.schedule), template = lib.templates.find(t => t.id === el.dataset.id);
    if (!template) return;
    app.commit(draft => { draft.schedule.library = {...workspace.get(draft.schedule), templates: workspace.get(draft.schedule).templates.filter(t => t.id !== template.id)}; }, {message: '已删除模板「' + template.name + '」', undo: () => app.commit(draft => { const next = workspace.put(draft.schedule, 'templates', template); draft.schedule.library = next.library; }, {message: '已恢复模板'})});
  });
  app.on('org.edit', el => app.setUi('org', {kind: el.dataset.kind, id: el.dataset.id || '', error: '', serial: (app.ui('org').serial || 0) + 1}));
  app.on('org.kind', el => app.setUi('org', {kind: el.value}));
  app.on('org.submit', form => {
    const f = new FormData(form), ui = app.ui('org'), kind = f.get('kind') || ui.kind || 'lists', id = ui.id || uid('org'), name = String(f.get('name') || '').trim();
    try {
      if (!name) throw new Error('请填写名称。');
      if (organizer.get(app.state.doc.schedule)[kind].some(row => row.id !== id && row.name === name)) throw new Error('已经有同名分类，请换一个名称。');
      app.commit(draft => { draft.schedule = organizer.upsert(draft.schedule, kind, {id, name, ...(kind === 'lists' ? {folderId: f.get('folderId') || ''} : {})}); }, {message: ui.id ? '已更新「' + name + '」' : '已添加「' + name + '」'});
      app.setUi('org', {id: '', error: '', serial: (ui.serial || 0) + 1});
    } catch (error) { if (!error.handled) app.setUi('org', {error: error.message}); }
  });
  app.on('org.archive', el => {
    const {kind, id} = el.dataset, row = organizer.get(app.state.doc.schedule)[kind].find(r => r.id === id);
    if (!row) return;
    const archived = !row.archived;
    app.commit(draft => { draft.schedule = organizer.upsert(draft.schedule, kind, {...row, archived}); }, {message: archived ? '已归档「' + row.name + '」' : '已恢复「' + row.name + '」', detail: archived ? '任务保留原分类；归档后不再出现在导航中' : ''});
  });
  document.addEventListener('toggle', event => {
    const id = event.target.dataset?.folder;
    if (!id) return;
    app.setUi('tasks', s => { const set = new Set(s.folded || []); if (event.target.open) set.delete(id); else set.add(id); return {folded: [...set]}; });
  }, true);

  // Drag and drop on the board (mouse). Touch and keyboard use "移动到…".
  let dragId = '';
  document.addEventListener('dragstart', event => { const card = event.target.closest?.('[data-card]'); if (!card) return; dragId = card.dataset.card; event.dataTransfer.setData('text/plain', dragId); event.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); });
  document.addEventListener('dragover', event => { const col = event.target.closest?.('[data-drop]'); if (!col || !dragId) return; event.preventDefault(); document.querySelectorAll('.is-drop-target').forEach(el => el !== col && el.classList.remove('is-drop-target')); col.classList.add('is-drop-target'); });
  document.addEventListener('drop', event => { const col = event.target.closest?.('[data-drop]'); if (!col || !dragId) return; event.preventDefault(); const id = dragId; dragId = ''; clearDrag(); moveDialog(app, id, col.dataset.drop); });
  document.addEventListener('dragend', () => { dragId = ''; clearDrag(); });
  const clearDrag = () => document.querySelectorAll('.is-drop-target, .is-dragging').forEach(el => el.classList.remove('is-drop-target', 'is-dragging'));
}

function undoMove(app) {
  app.attempt(() => {
    const last = app.ui('tasks').lastMove;
    if (!last) return;
    app.commit(draft => { draft.schedule = taskViews.apply(draft.schedule, draft.progress.records, last.plan, true); }, {message: '已撤销移动', tone: 'info'});
    app.setUi('tasks', {lastMove: null});
  });
}

function planFromForm(app, form) {
  const ui = app.ui('tasks'), move = ui.move;
  const destination = {mode: move.mode, groupBy: move.groupBy, target: form.elements.target.value};
  if (move.mode === 'quadrant' && form.elements.deadline) destination.deadline = form.elements.deadline.value;
  return taskViews.planMove(move.schedule, move.records, move.today, move.id, destination);
}

function moveDialog(app, id, target) {
  const state = app.state, layout = state.route.params.layout === 'quadrant' ? 'quadrant' : 'board';
  const ui = app.ui('tasks');
  const event = state.doc.schedule.events.find(e => e.id === id && e.type === 'task');
  if (!event) return;
  if (state.doc.progress.records.some(r => r.key === 'task:' + id)) { app.toast('已完成的任务请先撤销完成，再移动。', {tone: 'error'}); return; }
  const projection = taskViews.project(state.doc.schedule, state.doc.progress.records, state.today, {view: 'all', mode: layout, groupBy: ui.groupBy || 'priority'});
  const current = projection.columns.find(c => c.tasks.some(t => t.event.id === id));
  const move = {id, mode: layout, groupBy: ui.groupBy || 'priority', today: state.today, schedule: structuredClone(state.doc.schedule), records: structuredClone(state.doc.progress.records)};
  app.setUi('tasks', {move, moveError: '', moveInitial: target || current?.id, moveChosen: '', moveDeadline: null});
  app.overlays.show('move', {size: 'small', editing: true, render: () => {
    const mui = app.ui('tasks');
    const chosen = mui.moveChosen || mui.moveInitial;
    let plan = null, error = mui.moveError || '';
    try {
      const destination = {mode: move.mode, groupBy: move.groupBy, target: chosen};
      if (move.mode === 'quadrant' && mui.moveDeadline !== undefined && mui.moveDeadline !== null) destination.deadline = mui.moveDeadline;
      plan = taskViews.planMove(move.schedule, move.records, move.today, id, destination);
    } catch (e) { error = e.message; }
    const deadlineChange = plan?.changes.find(c => c.field === 'deadline');
    const suggested = deadlineChange ? deadlineChange.after.value : (event.deadline || '');
    return frame({title: '移动任务', subtitle: event.title, body: html`<form id="moveForm" data-submit="tasks.moveSubmit" class="stack" data-key="move-form">
      <label class="field">目标分组<select class="select" name="target" data-change="tasks.moveTarget">${projection.columns.filter(c => !c.archived).map(c => html`<option value="${c.id}"${attr('selected', chosen === c.id)}>${c.name}</option>`)}</select></label>
      ${move.mode === 'quadrant' ? html`<label class="field">移动后的截止日期<input class="input" type="date" name="deadline" value="${mui.moveDeadline ?? suggested}" data-change="tasks.moveDeadline"><small>紧急：今天或以前；不紧急：晚于今天或留空。可以修改建议日期。</small></label>` : ''}
      <div class="change-list" aria-live="polite">${plan ? (plan.changes.length ? taskViews.describe(move.schedule, plan).map(c => html`<div><span>${c.label}</span><del>${c.before}</del>${icon('forward')}<b>${c.after}</b></div>`) : html`<p class="small">已经在这个分组，无需修改。</p>`) : ''}</div>
      <p class="hint">只修改上面列出的字段。完成记录、执行计划和子任务关系不变。</p>
      <p class="form-error" role="alert">${error}</p></form>`,
      foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="moveForm" class="btn btn-primary"${attr('disabled', !plan || !plan.changes.length)}>确认移动</button>`});
  }, onClose: () => app.setUi('tasks', {move: null, moveError: ''})});
}

function batchDialog(app) {
  app.setUi('tasks', {batchError: ''});
  app.overlays.show('batch', {editing: true, render: state => {
    const org = organizer.get(state.doc.schedule), n = (app.ui('tasks').selected || []).length;
    return frame({title: '整理 ' + n + ' 个待办', subtitle: '只修改所选任务；子任务、完成记录、附件和专注记录保持不变。', body: html`<form id="batchForm" data-submit="tasks.batchSubmit" class="stack" data-key="batch-form">
      <label class="field">归入<select class="select" name="list" data-uncontrolled><option value="@keep">保持原样</option><option value="@inbox">收集箱</option><option value="@none">不归清单（已整理）</option>${org.lists.filter(l => !l.archived).map(l => html`<option value="${l.id}">${l.name}</option>`)}</select></label>
      <label class="field">优先级<select class="select" name="priority" data-uncontrolled><option value="">保持原样</option>${[[3, '高'], [2, '中'], [1, '低'], [0, '不设置']].map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <label class="field">标签<select class="select" name="tagMode" data-uncontrolled><option value="keep">保持原样</option><option value="replace">替换为下面选中的标签</option><option value="clear">清空标签</option></select></label>
      ${org.tags.length ? html`<div class="toggle-chips">${org.tags.filter(t => !t.archived).map(t => html`<label><input type="checkbox" name="tag" value="${t.id}" data-uncontrolled><span>#${t.name}</span></label>`)}</div>` : ''}
      <div class="field-row"><label class="field">执行日期<select class="select" name="dateMode" data-uncontrolled><option value="keep">保持原样</option><option value="set">安排到</option><option value="clear">清除执行日期和时段</option></select></label><label class="field">新日期<input class="input" type="date" name="date" data-uncontrolled></label></div>
      <p class="hint">安排到新日期时保留原时段；截止日期不变。</p>
      <p class="form-error" role="alert">${app.ui('tasks').batchError || ''}</p></form>`,
      foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="batchForm" class="btn btn-primary">应用到 ${n} 项</button>`});
  }});
}

function manageDialog(app) {
  app.setUi('org', {kind: 'lists', id: '', error: ''});
  app.overlays.show('org', {editing: true, size: 'wide', render: state => {
    const org = organizer.get(state.doc.schedule), ui = app.ui('org');
    const editing = ui.id ? org[ui.kind]?.find(r => r.id === ui.id) : null;
    const kind = ui.kind || 'lists';
    const section = (k, label) => html`<section><h3 class="sub">${label}</h3>${org[k].length ? html`<ul class="plain-list">${org[k].map(row => html`<li data-key="${'org-' + row.id}"><div><b>${k === 'tags' ? '#' : ''}${row.name}</b><small>${row.archived ? '已归档' : k === 'lists' && row.folderId ? '文件夹：' + (org.folders.find(f => f.id === row.folderId)?.name || '') : ''}</small></div><button type="button" class="btn btn-ghost btn-sm" data-act="org.edit" data-kind="${k}" data-id="${row.id}">编辑</button><button type="button" class="btn btn-ghost btn-sm" data-act="org.archive" data-kind="${k}" data-id="${row.id}">${row.archived ? '恢复' : '归档'}</button></li>`)}</ul>` : html`<p class="small">还没有${label}。</p>`}</section>`;
    return frame({title: '管理清单与标签', subtitle: '分类仅本机保存。清单和执行日期相互独立，移动分类不会改变时间。', body: html`<div class="org-layout">
      <form class="panel panel-pad stack" data-submit="org.submit" data-key="${'org-form-' + (ui.serial || 0)}">
        <h3 class="sub">${editing ? '编辑「' + editing.name + '」' : '新建'}</h3>
        ${editing ? '' : html`<label class="field">类型<select class="select" name="kind" data-change="org.kind"><option value="lists"${attr('selected', kind === 'lists')}>清单</option><option value="folders"${attr('selected', kind === 'folders')}>文件夹</option><option value="tags"${attr('selected', kind === 'tags')}>标签</option></select></label>`}
        ${editing ? html`<input type="hidden" name="kind" value="${kind}">` : ''}
        <label class="field">名称<input class="input" name="name" maxlength="80" required value="${editing?.name || ''}" placeholder="例如：工作、学习" data-uncontrolled></label>
        ${kind === 'lists' ? html`<label class="field">所属文件夹<select class="select" name="folderId" data-uncontrolled><option value="">不放进文件夹</option>${org.folders.filter(f => !f.archived).map(f => html`<option value="${f.id}"${attr('selected', editing?.folderId === f.id)}>${f.name}</option>`)}</select></label>` : ''}
        <p class="form-error" role="alert">${ui.error || ''}</p>
        <div class="row">${editing ? html`<button type="button" class="btn btn-ghost" data-act="org.edit" data-kind="${kind}" data-id="">取消编辑</button>` : ''}<span class="spacer"></span><button type="submit" class="btn btn-primary">${editing ? '保存' : '添加'}</button></div>
      </form>
      <div class="stack">${section('lists', '清单')}${section('folders', '文件夹')}${section('tags', '标签')}</div>
    </div>`});
  }});
}

function templatesDialog(app) {
  app.overlays.show('templates', {render: state => {
    const templates = workspace.get(state.doc.schedule).templates;
    return frame({title: '任务模板', subtitle: '每次使用都会生成新的任务和子任务，放在收集箱；不复制日期、附件和完成状态。', body: templates.length ? html`<ul class="plain-list">${templates.map(t => html`<li data-key="${'tpl-' + t.id}"><div><b>${t.name}</b><small>${t.items.length} 条任务 · ${t.items.find(i => !i.parentKey)?.title || ''}</small></div><button type="button" class="btn btn-ghost btn-sm" data-act="tasks.deleteTemplate" data-id="${t.id}" aria-label="${'删除模板 ' + t.name}">${icon('trash')}</button><button type="button" class="btn btn-primary btn-sm" data-act="tasks.useTemplate" data-id="${t.id}">使用</button></li>`)}</ul>` : html`<div class="empty compact"><div class="empty-mark">${icon('template')}</div><h3>还没有模板</h3><p>打开一个待办，在底部点“保存为模板”，下级任务会一起保存。</p></div>`});
  }});
}

export {currentList, PRIORITY_LABEL};

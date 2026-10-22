// Item actions shared by every list: complete/undo, open, the action menu
// (long press, right click, Shift+F10 or the ⋯ button), deferral, deletion,
// restoration and checklist steps.
import {createLongPress} from '../lib/gestures.js';
import {html, attr} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {toggleCompletion, isDone} from '../domain/progress.js';
import {eventById, isRepeating, deferItem, trashItem, restoreItem, toggleStep} from '../domain/items.js';
import {gardenWorld} from '../core.js';
import {addDays, monthDay} from '../lib/dates.js';

const KIND_LABEL = {tree: '树木', flower: '花', stone: '石头'};

export function completeItem(app, id, date) {
  const before = app.state.doc.schedule.events.find(e => e.id === id);
  if (!before) throw new Error('这条事项已不在清单中，请刷新。');
  const result = app.commit(draft => toggleCompletion(draft, id, date, {today: app.today}));
  if (result.done) {
    const record = app.state.doc.progress.records.find(r => r.key === result.record.key);
    const kind = record?.gardenReward?.kind;
    app.toast('完成「' + before.title + '」', {tone: 'growth', iconName: 'growth', detail: kind ? '花园里多了一份' + KIND_LABEL[kind] + '素材' : '', action: {label: '撤销', run: () => undoCompletion(app, id, date, record.key)}});
    app.getView('companion')?.celebrate(app);
  } else {
    app.toast('已撤销完成「' + before.title + '」', {detail: '统计和花园素材已一并恢复', action: {label: '重新完成', run: () => app.attempt(() => completeItem(app, id, date))}});
  }
  return result;
}

function undoCompletion(app, id, date, key) {
  app.attempt(() => {
    if (!app.state.doc.progress.records.some(r => r.key === key)) throw new Error('这项完成已在另一处撤销。');
    app.commit(draft => toggleCompletion(draft, id, date, {today: app.today}), {message: '已撤销完成', tone: 'info'});
  });
}

export function openItem(app, id, date) {
  const event = eventById(app.state.doc.schedule, id);
  if (!event) { app.toast('这条事项已被删除，请刷新。', {tone: 'error'}); return; }
  if (event.type === 'task' || (event.type === 'once' && event.deferred)) app.getView('editor').openTask(app, id);
  else app.getView('editor').openEvent(app, id, date);
}

function menuItems(app, event, date) {
  const progress = app.state.doc.progress;
  const done = event.type === 'task' ? isDone(progress, event, date) : progress.records.some(r => r.eventId === event.id);
  const series = isRepeating(event);
  return [
    {act: 'item.open', icon: 'edit', label: series ? '编辑整个系列' : '编辑'},
    !series && {act: 'item.defer', icon: 'defer', label: '延期或暂不安排', disabled: done, hint: done ? '先撤销完成' : ''},
    {act: 'item.focus', icon: 'focus', label: '开始专注'},
    event.type === 'task' && {act: 'item.breakdown', icon: 'sparkle', label: 'AI 助手拆解（演示）'},
    event.type === 'task' && {act: 'item.subtask', icon: 'subtask', label: '添加子任务'},
    {sep: true},
    {act: 'item.delete', icon: 'trash', label: series ? '删除整个系列' : '删除', danger: true},
  ].filter(Boolean);
}

function actionMenu(app, id, date, anchor) {
  const event = eventById(app.state.doc.schedule, id);
  if (!event) return;
  const items = menuItems(app, event, date);
  const render = state => {
    const current = eventById(state.doc.schedule, id);
    if (!current) return null;
    return frame({title: current.title, subtitle: isRepeating(current) ? '重复日程 · 操作作用于整个系列' : '', body: html`<div class="action-list">${items.map(item => item.sep ? html`<hr class="sep">` : html`<button type="button" class="${item.danger ? 'danger' : ''}" data-act="${item.act}" data-id="${id}" data-date="${date}"${attr('disabled', item.disabled)}>${icon(item.icon)}<span>${item.label}</span>${item.hint ? html`<small>${item.hint}</small>` : ''}</button>`)}</div>`});
  };
  app.overlays.show('item-menu', {size: 'small', className: 'menu-sheet', render, label: '事项操作'});
}

function deferDialog(app, id) {
  const event = eventById(app.state.doc.schedule, id);
  if (!event) return;
  const snapshot = JSON.stringify(event);
  const task = event.type === 'task';
  app.overlays.show('defer', {size: 'small', editing: true, render: state => {
    const ui = app.ui('defer');
    const mode = ui.mode || 'date';
    const tomorrow = addDays(state.today, 1);
    return frame({
      title: '延期', subtitle: event.title,
      body: html`<form id="deferForm" data-submit="item.deferSave" data-id="${id}" data-key="${'defer-' + id}" class="stack">
        <div class="seg" role="group" aria-label="延期方式">
          <button type="button" data-act="defer.mode" data-mode="date" aria-pressed="${mode === 'date' ? 'true' : 'false'}">安排到某天</button>
          <button type="button" data-act="defer.mode" data-mode="hold" aria-pressed="${mode === 'hold' ? 'true' : 'false'}">暂不安排</button>
        </div>
        ${mode === 'date' ? html`<div class="quick-dates">${[['明天', tomorrow], ['后天', addDays(state.today, 2)], ['下周一', nextMonday(state.today)]].map(([label, value]) => html`<button type="button" class="btn btn-quiet btn-sm" data-act="defer.quick" data-date="${value}">${label} · ${monthDay(value)}</button>`)}</div>
        <label class="field">执行日期<input class="input" type="date" name="date" min="${state.today}" value="${ui.date || tomorrow}" data-uncontrolled required></label>
        <div class="field-row"><label class="field">开始<input class="input" type="time" name="start" value="${task ? event.plannedStart || '' : event.start}" data-uncontrolled${attr('required', !task)}></label><label class="field">结束<input class="input" type="time" name="end" value="${task ? event.plannedEnd || '' : event.end}" data-uncontrolled${attr('required', !task)}></label></div>
        <p class="hint">${task ? '时间可以留空，只安排日期。' : '沿用原时段，也可以调整。'}${event.deadline ? ' 截止日期仍是 ' + event.deadline + '，不会改变。' : ''}</p>`
        : html`<p class="callout callout-pine">${icon('hourglass')}<span>保留原事项，放进任务的“未安排”，暂停提醒。截止日期、步骤、附件和完成历史都不变。</span></p>`}
        <p class="form-error" role="alert">${ui.error || ''}</p>
      </form>`,
      foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="deferForm" class="btn btn-primary">保存</button>`,
    });
  }, onClose: () => app.setUi('defer', {mode: 'date', date: '', error: '', snapshot: ''})});
  app.setUi('defer', {mode: 'date', date: '', error: '', snapshot});
}
const nextMonday = date => { let d = addDays(date, 1); while (new Date(d + 'T12:00:00').getDay() !== 1) d = addDays(d, 1); return d; };

function deleteDialog(app, id) {
  const event = eventById(app.state.doc.schedule, id);
  if (!event) return;
  const snapshot = JSON.stringify(event), series = isRepeating(event);
  const children = app.state.doc.schedule.events.filter(e => e.parentId === id).length;
  app.overlays.show('delete', {size: 'small', render: () => frame({
    title: series ? '删除整个系列？' : '删除这条事项？', subtitle: event.title,
    body: html`<p>${series ? '所有日期的安排都会移出日程。' : '事项会移到“最近删除”，可以恢复。'}已完成记录和花园素材保留。${children ? ' ' + children + ' 个子任务不会被删除，会变成独立任务。' : ''}</p><p class="form-error" role="alert">${app.ui('delete').error || ''}</p>`,
    foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">保留</button><button type="button" class="btn btn-danger" data-act="item.deleteConfirm" data-id="${id}">${series ? '删除整个系列' : '删除'}</button>`,
  }), onClose: () => app.setUi('delete', {error: ''})});
  app.setUi('delete', {error: '', snapshot});
}

export function trashDialog(app) {
  app.overlays.show('trash', {render: state => {
    const rows = (state.doc.schedule.trash || []).slice().sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return frame({title: '最近删除', subtitle: '恢复后回到原来的位置，保留原 ID、步骤与附件。', body: rows.length ? html`<ul class="plain-list">${rows.map(row => html`<li data-key="${'trash-' + row.id}"><div><b>${row.event.title}</b><small>${row.event.type === 'task' ? '待办' : isRepeating(row.event) ? '重复日程' : '日程'} · 删除于 ${new Date(row.deletedAt).toLocaleString('zh-CN')}</small></div><button type="button" class="btn btn-quiet btn-sm" data-act="item.restore" data-id="${row.id}">${icon('restore')}恢复</button></li>`)}</ul>` : html`<div class="empty compact"><div class="empty-mark">${icon('trash')}</div><h3>没有已删除的事项</h3></div>`});
  }});
}

export function registerItemMenu(app) {
  app.on('item.complete', el => {
    el.classList.add('just-done');
    completeItem(app, el.dataset.id, el.dataset.date || app.today);
  });
  app.on('item.open', el => { app.overlays.close('item-menu', {restoreFocus: false}); openItem(app, el.dataset.id, el.dataset.date); });
  app.on('item.menu', el => actionMenu(app, el.dataset.id, el.dataset.date || app.today, el));
  app.on('item.defer', el => { app.overlays.close('item-menu', {restoreFocus: false}); deferDialog(app, el.dataset.id); });
  app.on('defer.mode', el => app.setUi('defer', {mode: el.dataset.mode, error: ''}));
  app.on('defer.quick', el => { const input = document.querySelector('#deferForm [name=date]'); if (input) input.value = el.dataset.date; });
  app.on('item.deferSave', form => {
    const id = form.dataset.id, ui = app.ui('defer'), fields = new FormData(form);
    const choice = {mode: ui.mode || 'date', date: fields.get('date') || '', start: fields.get('start') || '', end: fields.get('end') || ''};
    try {
      const next = app.commit(draft => deferItem(draft.schedule, draft.progress, id, choice, app.today, ui.snapshot));
      app.overlays.close('defer');
      app.toast(next.deferred ? '已放入“未安排”' : '已安排到 ' + monthDay(choice.date), {tone: 'success'});
    } catch (error) { if (!error.handled) app.setUi('defer', {error: error.message}); }
  });
  app.on('item.delete', el => { app.overlays.close('item-menu', {restoreFocus: false}); deleteDialog(app, el.dataset.id); });
  app.on('item.deleteConfirm', el => {
    const id = el.dataset.id;
    try {
      const removed = app.commit(draft => trashItem(draft, id, app.ui('delete').snapshot));
      app.overlays.close('delete');
      app.toast('已删除「' + removed.title + '」', {detail: '可在 设置 › 最近删除 中恢复', action: {label: '撤销', run: () => app.attempt(() => app.commit(draft => restoreItem(draft, id), {message: '已恢复「' + removed.title + '」'}))}});
      if (app.state.route.params.task === id) app.setParams({task: ''});
    } catch (error) { if (!error.handled) app.setUi('delete', {error: error.message}); }
  });
  app.on('item.restore', el => app.commit(draft => restoreItem(draft, el.dataset.id), {message: '已恢复'}));
  app.on('trash.open', () => trashDialog(app));
  app.on('item.breakdown', el => { app.overlays.closeAll(); app.getView('assistant').breakdown(app, el.dataset.id, el.dataset.date); });
  app.on('item.focus', el => { app.overlays.closeAll(); app.getView('focus').prepare(app, el.dataset.id); });
  app.on('item.subtask', el => { app.overlays.close('item-menu', {restoreFocus: false}); app.getView('editor').openTask(app, el.dataset.id, {focusSubtask: true}); });
  app.on('item.step', el => {
    const step = app.commit(draft => toggleStep(draft.schedule, el.dataset.id, el.dataset.step));
    app.toast(step.done ? '这一步完成了' : '已撤销这一步', {detail: '事项本身的完成状态不变'});
  });

  // Long press (touch, 500 ms), right click and Shift+F10 open the same menu.
  const press = createLongPress({delay: 500});
  window.addEventListener('pointerdown', event => {
    press.cancel();
    if (event.button !== 0 || event.isPrimary === false || event.pointerType === 'mouse' || app.overlays.any()) return;
    const row = event.target.closest?.('[data-item-menu]');
    if (!row || event.target.closest('.done-btn, .item-more, input, select, a')) return;
    press.down({x: event.clientX, y: event.clientY}, () => {
      if (!row.isConnected) return;
      navigator.vibrate?.(10);
      actionMenu(app, row.dataset.itemMenu, row.querySelector('[data-date]')?.dataset.date || app.today);
    });
  }, true);
  window.addEventListener('pointermove', event => press.move({x: event.clientX, y: event.clientY}), {passive: true, capture: true});
  window.addEventListener('pointerup', () => press.up(), {capture: true, passive: true});
  for (const type of ['pointercancel', 'scroll', 'blur']) window.addEventListener(type, () => press.cancel(), {capture: true, passive: true});
  document.addEventListener('visibilitychange', () => { if (document.hidden) press.cancel(); });
  // The click that follows a long press must not complete or open the item.
  window.addEventListener('click', event => { if (press.shouldSuppressClick() && event.target.closest?.('[data-item-menu]')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  window.addEventListener('contextmenu', event => {
    const row = event.target.closest?.('[data-item-menu]');
    if (!row || event.target.closest('input, textarea')) return;
    if (String(window.getSelection?.() || '').trim()) return;
    event.preventDefault();
    actionMenu(app, row.dataset.itemMenu, row.querySelector('[data-date]')?.dataset.date || app.today);
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    const row = event.target.closest?.('[data-item-menu]');
    if (!row) return;
    event.preventDefault();
    actionMenu(app, row.dataset.itemMenu, row.querySelector('[data-date]')?.dataset.date || app.today);
  });
}

export const gardenKinds = KIND_LABEL;
export {gardenWorld};

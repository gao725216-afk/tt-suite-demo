// Editors for tasks and schedule items. Desktop: dialog (or the Tasks page
// inspector); compact screens: a full-height sheet. Form fields are
// uncontrolled while editing, and saving checks the item was not changed
// elsewhere in the meantime.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {occur, organizer, workspace} from '../core.js';
import {createTask, updateTask, createEvent, updateEvent, eventById, isRepeating, uid, setSteps, childCounts} from '../domain/items.js';
import {isDone, completionKey} from '../domain/progress.js';
import {addDays, monthDay, durationLabel, duration, isDate, WEEKDAYS, weekdayIndex, clock, nowMinutes} from '../lib/dates.js';
import {PRIORITY_LABEL} from './item-row.js';

const EDITABLE = ['title', 'note', 'deadline', 'plannedDate', 'plannedStart', 'plannedEnd', 'estimatedMinutes', 'listId', 'inbox', 'priority', 'tagIds', 'parentId', 'deferred', 'start', 'end', 'date', 'location', 'remindLead', 'weekday', 'repeat', 'type'];
export const signature = event => event ? JSON.stringify(EDITABLE.map(key => event[key] ?? null)) + JSON.stringify((event.steps || []).map(s => s.title)) : '';

const nextMonday = date => { let d = addDays(date, 1); while (new Date(d + 'T12:00:00').getDay() !== 1) d = addDays(d, 1); return d; };
const roundedNow = () => { const m = Math.ceil((nowMinutes() + 5) / 30) * 30; return Math.min(m, 22 * 60); };

export function createQuickTask(draft, {title, plannedDate = '', listId = '', tagIds = [], priority = 0, inbox}) {
  return createTask(draft.schedule, {title, plannedDate, listId, inbox: inbox ?? !listId, tagIds, priority});
}

function sizeBytes(size) { return size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.ceil(size / 1024)) + ' KB'; }

function listSelect(state, value) {
  const org = organizer.get(state.doc.schedule);
  const folders = org.folders.filter(f => !f.archived);
  const lists = org.lists.filter(l => !l.archived || l.id === value.listId);
  const current = value.listId || (organizer.isInbox(value) ? '@inbox' : '@none');
  const option = l => html`<option value="${l.id}"${attr('selected', current === l.id)}>${l.name}</option>`;
  return html`<select class="select" name="list" data-uncontrolled>
    <option value="@inbox"${attr('selected', current === '@inbox')}>收集箱（尚未整理）</option>
    <option value="@none"${attr('selected', current === '@none')}>不归清单（已整理）</option>
    ${lists.filter(l => !l.folderId).map(option)}
    ${folders.map(f => html`<optgroup label="${f.name}">${lists.filter(l => l.folderId === f.id).map(option)}</optgroup>`)}
  </select>`;
}

function parentSelect(state, event) {
  const tree = event.id ? workspace.descendants(state.doc.schedule, event.id) : new Set();
  const candidates = state.doc.schedule.events.filter(e => e.type === 'task' && !tree.has(e.id));
  const outline = workspace.outline(state.doc.schedule, candidates).filter(info => info.depth < 4);
  return html`<select class="select" name="parentId" data-uncontrolled>
    <option value="">无（顶层任务）</option>
    ${outline.map(info => html`<option value="${info.event.id}"${attr('selected', info.event.id === event.parentId)}>${'　'.repeat(info.depth)}${info.event.title}</option>`)}
  </select>`;
}

function taskForm(state, app, id, mode) {
  const schedule = state.doc.schedule;
  const existing = id ? eventById(schedule, id) : null;
  if (id && !existing) return html`<div class="empty"><div class="empty-mark">${icon('trash')}</div><h3>这条待办已被删除</h3><p>可在 设置 › 最近删除 中恢复。</p></div>`;
  const ui = app.ui('editor');
  const event = existing || ui.newTask || {};
  const org = organizer.get(schedule);
  const done = existing ? isDone(state.doc.progress, existing, state.today) : false;
  const changedElsewhere = existing && ui.signature && ui.signature !== signature(existing);
  const planned = occur.taskPlannedDate(event);
  const children = existing ? schedule.events.filter(e => e.parentId === existing.id) : [];
  const parent = existing?.parentId ? eventById(schedule, existing.parentId) : null;
  const steps = existing?.steps || [];
  const files = existing?.attachments || [];
  const depth = existing ? workspace.outline(schedule, [existing])[0]?.depth ?? 0 : 0;
  const formKey = 'task-form-' + (existing?.id || 'new') + '-' + (ui.formSerial || 0);
  return html`<form class="editor" id="taskForm" data-submit="editor.saveTask" data-id="${existing?.id || ''}" data-key="${formKey}" novalidate>
  ${changedElsewhere ? html`<div class="callout callout-warn">${icon('sync')}<div><b>这条待办已在另一处更新</b>你在这里的修改尚未保存。载入最新内容会丢弃这些修改。<div class="actions"><button type="button" class="btn btn-quiet btn-sm" data-act="editor.reload">载入最新</button></div></div></div>` : ''}
  <div class="editor-title-row">
    ${existing ? html`<button type="button" class="${cx('done-btn', 'big')}" data-act="item.complete" data-id="${existing.id}" data-date="${state.today}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${(done ? '撤销完成：' : '完成：') + existing.title}"><i>${icon('check')}</i></button>` : ''}
    <label class="sr-only" for="taskTitle">待办名称</label>
    <textarea id="taskTitle" class="title-input" name="title" rows="1" maxlength="200" required placeholder="要做什么？" data-uncontrolled${attr('autofocus', !existing)}>${event.title || ''}</textarea>
  </div>
  ${parent ? html`<p class="editor-parent">${icon('subtask')}上级任务：<button type="button" class="link-btn" data-act="editor.openTask" data-id="${parent.id}">${parent.title}</button></p>` : ''}
  <div class="editor-grid">
    <div class="editor-main">
      <label class="field"><span>备注</span><textarea class="textarea" name="note" rows="3" maxlength="1000" placeholder="补充细节、链接或想法" data-uncontrolled>${event.note || ''}</textarea></label>

      <section class="editor-block">
        <div class="block-head"><h3>${icon('steps')}检查项</h3><small>只记录步骤，不另计完成和花园素材</small></div>
        ${steps.length ? html`<ul class="steps">${steps.map(s => html`<li data-key="${'s-' + s.id}"><button type="button" class="${cx('step', s.done && 'is-done')}" data-act="item.step" data-id="${existing.id}" data-step="${s.id}" aria-pressed="${s.done ? 'true' : 'false'}"><i>${icon('check')}</i><span>${s.title}</span></button></li>`)}</ul>` : ''}
        <details class="disclosure"${attr('open', !steps.length && !!existing && false)}><summary>${steps.length ? '编辑检查项' : '添加检查项'}</summary>
          <label class="field"><span class="sr-only">检查项，每行一项</span><textarea class="textarea" name="steps" rows="4" maxlength="6030" placeholder="每行一项，最多 30 行" data-uncontrolled>${steps.map(s => s.title).join('\n')}</textarea><small>保留已有项的完成状态；删除一行即移除该项。</small></label>
        </details>
      </section>

      ${existing ? html`<section class="editor-block">
        <div class="block-head"><h3>${icon('subtask')}子任务</h3><small>${depth >= 4 ? '已达五层上限' : '各自完成，删除上级不会删除子任务'}</small>${depth < 4 ? html`<button type="button" class="btn btn-quiet btn-sm" data-act="assistant.decomposeItem" data-id="${existing.id}">AI 拆解 · 演示</button>` : ''}</div>
        ${children.length ? html`<ul class="items mini">${children.map(c => { const cd = isDone(state.doc.progress, c, state.today); return html`<li class="${cx('item', cd && 'is-done')}" data-key="${'c-' + c.id}"><button type="button" class="done-btn" data-act="item.complete" data-id="${c.id}" data-date="${state.today}" aria-pressed="${cd ? 'true' : 'false'}" aria-label="${(cd ? '撤销完成：' : '完成：') + c.title}"><i>${icon('check')}</i></button><button type="button" class="item-body" data-act="editor.openTask" data-id="${c.id}"><span class="item-title"><b>${c.title}</b></span></button></li>`; })}</ul>` : ''}
        ${depth < 4 ? html`<div class="inline-add"><input class="input" id="childTitle" maxlength="200" placeholder="添加子任务，回车保存" data-uncontrolled data-enter="editor.addChild" data-id="${existing.id}"${attr('autofocus', ui.focusSubtask)}><button type="button" class="btn btn-quiet btn-sm" data-act="editor.addChild" data-id="${existing.id}">添加</button></div>` : ''}
      </section>` : ''}

      <p class="hint">演示不支持附件上传；请勿输入真实隐私信息。</p>
    </div>

    <div class="editor-side">
      <fieldset class="editor-block plan-block">
        <legend>${icon('clock')}执行计划</legend>
        ${event.deferred ? html`<p class="chip chip-outline">${icon('hourglass')}暂不安排 · 设定日期后恢复</p>` : ''}
        <div class="quick-dates">${[['今天', state.today], ['明天', addDays(state.today, 1)], ['下周一', nextMonday(state.today)]].map(([label, value]) => html`<button type="button" class="chip-btn" data-act="editor.setDate" data-field="plannedDate" data-value="${value}">${label}</button>`)}<button type="button" class="chip-btn" data-act="editor.setDate" data-field="plannedDate" data-value="">不安排</button></div>
        <label class="field"><span>执行日期</span><input class="input" type="date" name="plannedDate" value="${planned}" data-uncontrolled data-input="editor.check"></label>
        <div class="field-row"><label class="field"><span>开始</span><input class="input" type="time" name="plannedStart" value="${event.plannedStart || ''}" data-uncontrolled data-input="editor.check"></label><label class="field"><span>结束</span><input class="input" type="time" name="plannedEnd" value="${event.plannedEnd || ''}" data-uncontrolled data-input="editor.check"></label></div>
        <label class="field"><span>预计耗时（分钟）</span><input class="input" type="number" inputmode="numeric" min="1" max="1440" step="1" name="estimatedMinutes" value="${event.estimatedMinutes || ''}" placeholder="可选" data-uncontrolled></label>
      </fieldset>
      <fieldset class="editor-block due-block">
        <legend>${icon('flag')}截止日期</legend>
        <div class="quick-dates">${[['今天', state.today], ['明天', addDays(state.today, 1)], ['一周后', addDays(state.today, 7)]].map(([label, value]) => html`<button type="button" class="chip-btn" data-act="editor.setDate" data-field="deadline" data-value="${value}">${label}</button>`)}<button type="button" class="chip-btn" data-act="editor.setDate" data-field="deadline" data-value="">无</button></div>
        <label class="field"><span class="sr-only">截止日期</span><input class="input" type="date" name="deadline" value="${event.deadline || ''}" data-uncontrolled data-input="editor.check"></label>
        <p class="hint" data-plan-warning></p>
      </fieldset>
      <fieldset class="editor-block">
        <legend>${icon('list')}整理</legend>
        <label class="field"><span>归入</span>${listSelect(state, event)}</label>
        <div class="field"><span>优先级</span><div class="seg prio-seg" role="radiogroup" aria-label="优先级">${[3, 2, 1, 0].map(p => html`<label><input type="radio" name="priority" value="${p}"${attr('checked', (event.priority || 0) === p)} data-uncontrolled><span><i class="${'prio prio-' + p}"></i>${['无', '低', '中', '高'][p]}</span></label>`)}</div></div>
        <div class="field"><span>标签</span>${org.tags.filter(t => !t.archived || (event.tagIds || []).includes(t.id)).length ? html`<div class="toggle-chips">${org.tags.filter(t => !t.archived || (event.tagIds || []).includes(t.id)).map(t => html`<label><input type="checkbox" name="tagIds" value="${t.id}"${attr('checked', (event.tagIds || []).includes(t.id))} data-uncontrolled><span>#${t.name}</span></label>`)}</div>` : html`<small>还没有标签，可在任务页“管理分类”中添加。</small>`}</div>
        ${existing ? html`<label class="field"><span>上级任务</span>${parentSelect(state, existing)}<small>最多五层（含顶层）</small></label>` : ''}
      </fieldset>
    </div>
  </div>
  <p class="form-error" role="alert">${ui.error || ''}</p>
</form>`;
}

function taskFoot(state, app, id) {
  const existing = id ? eventById(state.doc.schedule, id) : null;
  if (id && !existing) return html`<button type="button" class="btn btn-quiet" data-act="overlay.close">关闭</button>`;
  return html`${existing ? html`<div class="left row"><button type="button" class="icon-btn" data-act="item.delete" data-id="${existing.id}" aria-label="删除这条待办" title="删除">${icon('trash')}</button><button type="button" class="icon-btn" data-act="editor.template" data-id="${existing.id}" aria-label="保存为模板" title="保存为模板">${icon('template')}</button><button type="button" class="icon-btn" data-act="item.focus" data-id="${existing.id}" aria-label="开始专注" title="开始专注">${icon('focus')}</button><button type="button" class="icon-btn" data-act="item.defer" data-id="${existing.id}" aria-label="延期" title="延期或暂不安排">${icon('defer')}</button></div>` : ''}
  <button type="button" class="btn btn-quiet" data-act="overlay.close">${existing ? '关闭' : '取消'}</button>
  <button type="submit" form="taskForm" class="btn btn-primary">${existing ? '保存修改' : '添加待办'}</button>`;
}

// --- Schedule item editor ------------------------------------------------
function eventForm(state, app, id) {
  const schedule = state.doc.schedule;
  const existing = id ? eventById(schedule, id) : null;
  if (id && !existing) return html`<div class="empty"><div class="empty-mark">${icon('trash')}</div><h3>这条日程已被删除</h3></div>`;
  const ui = app.ui('editor');
  const event = existing || ui.newEvent || {};
  const type = existing ? existing.type : (ui.repeat || 'once');
  const series = isRepeating(existing);
  const changedElsewhere = existing && ui.signature && ui.signature !== signature(existing);
  const repeat = event.repeat || {interval: 1, unit: 'week', start: event.date || ui.date || state.today, days: []};
  const len = duration(event.start || '09:00', event.end || '10:00');
  const steps = existing?.steps || [];
  const files = existing?.attachments || [];
  const formKey = 'event-form-' + (existing?.id || 'new') + '-' + (ui.formSerial || 0);
  return html`<form class="editor" id="eventForm" data-submit="editor.saveEvent" data-id="${existing?.id || ''}" data-key="${formKey}" novalidate>
  ${changedElsewhere ? html`<div class="callout callout-warn">${icon('sync')}<div><b>这条日程已在另一处更新</b><div class="actions"><button type="button" class="btn btn-quiet btn-sm" data-act="editor.reload">载入最新</button></div></div></div>` : ''}
  ${series ? html`<p class="callout">${icon('repeat')}<span>这是重复日程，修改会应用到整个系列，包括已出现的日期；已有完成记录保留。</span></p>` : ''}
  <div class="editor-title-row"><label class="sr-only" for="eventTitle">日程名称</label><textarea id="eventTitle" class="title-input" name="title" rows="1" maxlength="120" required placeholder="这段时间做什么？" data-uncontrolled${attr('autofocus', !existing)}>${event.title || ''}</textarea></div>
  <div class="editor-grid">
    <div class="editor-main">
      <fieldset class="editor-block plan-block">
        <legend>${icon('clock')}时间</legend>
        ${!existing ? html`<div class="seg" role="group" aria-label="重复方式">${[['once', '单次'], ['weekly', '每周'], ['custom', '自定义重复']].map(([value, label]) => html`<button type="button" data-act="editor.repeat" data-value="${value}" aria-pressed="${type === value ? 'true' : 'false'}">${label}</button>`)}</div>` : ''}
        ${type === 'once' ? html`<label class="field"><span>日期</span><input class="input" type="date" name="date" value="${event.date || ui.date || state.today}" required data-uncontrolled data-input="editor.check"></label>` : ''}
        ${type === 'weekly' ? html`<div class="field"><span>每周</span><div class="toggle-chips" role="radiogroup">${WEEKDAYS.map((w, i) => html`<label><input type="radio" name="weekday" value="${i + 1}"${attr('checked', Number(event.weekday || weekdayIndex(ui.date || state.today) + 1) === i + 1)} data-uncontrolled><span>周${w}</span></label>`)}</div>${event.weekPattern ? html`<small>单双周规则（${event.weekPattern.odd ? '单周' : '双周'}）保持不变。</small>` : ''}</div>` : ''}
        ${type === 'custom' ? html`<div class="field-row"><label class="field"><span>每</span><input class="input" type="number" min="1" max="365" name="interval" value="${repeat.interval || 1}" data-uncontrolled></label><label class="field"><span>单位</span><select class="select" name="unit" data-uncontrolled>${[['day', '天'], ['week', '周'], ['month', '月']].map(([v, l]) => html`<option value="${v}"${attr('selected', repeat.unit === v)}>${l}</option>`)}</select></label></div>
          <div class="field"><span>按周重复时的星期（可多选，不选则按开始日）</span><div class="toggle-chips">${WEEKDAYS.map((w, i) => html`<label><input type="checkbox" name="days" value="${i + 1}"${attr('checked', (repeat.days || []).includes(i + 1))} data-uncontrolled><span>周${w}</span></label>`)}</div></div>
          <div class="field-row"><label class="field"><span>开始日期</span><input class="input" type="date" name="repeatStart" value="${repeat.start}" required data-uncontrolled></label><label class="field"><span>结束日期（可选）</span><input class="input" type="date" name="until" value="${repeat.until || ''}" data-uncontrolled></label></div>` : ''}
        <div class="field-row"><label class="field"><span>开始</span><input class="input" type="time" name="start" value="${event.start || clock(roundedNow())}" required data-uncontrolled data-input="editor.check"></label><label class="field"><span>结束</span><input class="input" type="time" name="end" value="${event.end || clock(roundedNow() + 60)}" required data-uncontrolled data-input="editor.check"></label></div>
        <p class="hint" data-duration>${durationLabel(len)}${event.end && event.start && event.end < event.start ? '，结束在次日' : ''}</p>
      </fieldset>
      <label class="field"><span>地点（可选）</span><input class="input" name="location" maxlength="120" value="${event.location || ''}" placeholder="添加地点" data-uncontrolled></label>
      <label class="field"><span>备注（可选）</span><textarea class="textarea" name="note" rows="2" maxlength="1000" data-uncontrolled>${event.note || ''}</textarea></label>
      ${existing && steps.length ? html`<section class="editor-block"><div class="block-head"><h3>${icon('steps')}${series ? '系列步骤' : '步骤'}</h3></div><ul class="steps">${steps.map(s => html`<li data-key="${'s-' + s.id}"><button type="button" class="${cx('step', s.done && 'is-done')}" data-act="item.step" data-id="${existing.id}" data-step="${s.id}" aria-pressed="${s.done ? 'true' : 'false'}"><i>${icon('check')}</i><span>${s.title}</span></button></li>`)}</ul></section>` : ''}
    </div>
    <div class="editor-side">
      <input type="hidden" name="remindLead" value="0"><p class="hint">公开演示不发送提醒或通知。</p>
      ${existing && !series ? html`<p class="hint">需要换一天？使用“延期”可保留完成历史并提示截止日期。</p>` : ''}
    </div>
  </div>
  <p class="form-error" role="alert">${ui.error || ''}</p>
</form>`;
}

function eventFoot(state, app, id) {
  const existing = id ? eventById(state.doc.schedule, id) : null;
  if (id && !existing) return html`<button type="button" class="btn btn-quiet" data-act="overlay.close">关闭</button>`;
  return html`${existing ? html`<div class="left row"><button type="button" class="icon-btn" data-act="item.delete" data-id="${existing.id}" aria-label="${isRepeating(existing) ? '删除整个系列' : '删除这条日程'}" title="删除">${icon('trash')}</button>${!isRepeating(existing) ? html`<button type="button" class="icon-btn" data-act="item.defer" data-id="${existing.id}" aria-label="延期" title="延期">${icon('defer')}</button>` : ''}<button type="button" class="icon-btn" data-act="item.focus" data-id="${existing.id}" aria-label="开始专注" title="开始专注">${icon('focus')}</button></div>` : ''}
  <button type="button" class="btn btn-quiet" data-act="overlay.close">${existing ? '关闭' : '取消'}</button>
  <button type="submit" form="eventForm" class="btn btn-primary">${existing ? (isRepeating(existing) ? '保存整个系列' : '保存修改') : '添加日程'}</button>`;
}

function newKindTabs(app, kind) {
  return html`<div class="seg kind-seg" role="tablist" aria-label="新建类型"><button type="button" role="tab" data-act="editor.kind" data-kind="task" aria-selected="${kind === 'task' ? 'true' : 'false'}">${icon('tasks')}待办</button><button type="button" role="tab" data-act="editor.kind" data-kind="event" aria-selected="${kind === 'event' ? 'true' : 'false'}">${icon('calendar')}日程</button></div>`;
}

function readTaskForm(form) {
  const f = new FormData(form), list = f.get('list') || '@inbox';
  const estimate = String(f.get('estimatedMinutes') || '').trim();
  return {
    title: f.get('title'), note: f.get('note'), deadline: f.get('deadline') || '',
    plannedDate: f.get('plannedDate') || '', plannedStart: f.get('plannedStart') || '', plannedEnd: f.get('plannedEnd') || '',
    estimatedMinutes: estimate === '' ? '' : Number(estimate),
    listId: list.startsWith('@') ? '' : list, inbox: list === '@inbox', priority: Number(f.get('priority') || 0), tagIds: f.getAll('tagIds'),
    parentId: f.has('parentId') ? f.get('parentId') : undefined, steps: f.get('steps'),
  };
}

export function registerTaskEditor(app) {
  const editor = {
    openTask(app, id, options = {}) {
      const event = id ? eventById(app.state.doc.schedule, id) : null;
      app.setUi('editor', {kind: 'task', id: id || '', signature: signature(event), error: '', focusSubtask: !!options.focusSubtask, newTask: options.preset || null, formSerial: (app.ui('editor').formSerial || 0) + 1});
      // On the Tasks page with room for it, the inspector column shows the task.
      if (id && app.state.route.view === 'tasks' && app.state.layout.wide && !options.dialog) { app.setParams({task: id}); return; }
      app.overlays.show('editor', {size: 'wide', editing: true, label: id ? '编辑待办' : '新建', render: state => {
        const ui = app.ui('editor');
        if (ui.kind === 'event') return frame({title: ui.id ? '编辑日程' : '新建', headExtra: ui.id ? '' : newKindTabs(app, 'event'), body: eventForm(state, app, ui.id), foot: eventFoot(state, app, ui.id)});
        return frame({title: ui.id ? '待办' : '新建', headExtra: ui.id ? '' : newKindTabs(app, 'task'), body: taskForm(state, app, ui.id), foot: taskFoot(state, app, ui.id)});
      }, onClose: () => app.setUi('editor', {id: '', error: '', newTask: null, newEvent: null, focusSubtask: false})});
    },
    openEvent(app, id, date, options = {}) {
      const event = id ? eventById(app.state.doc.schedule, id) : null;
      app.setUi('editor', {kind: 'event', id: id || '', date: date || app.today, signature: signature(event), error: '', repeat: 'once', newEvent: options.preset || null, formSerial: (app.ui('editor').formSerial || 0) + 1});
      app.overlays.show('editor', {size: 'wide', editing: true, label: id ? '编辑日程' : '新建', render: state => {
        const ui = app.ui('editor');
        if (ui.kind === 'task') return frame({title: ui.id ? '待办' : '新建', headExtra: ui.id ? '' : newKindTabs(app, 'task'), body: taskForm(state, app, ui.id), foot: taskFoot(state, app, ui.id)});
        return frame({title: ui.id ? (isRepeating(eventById(state.doc.schedule, ui.id)) ? '编辑重复日程' : '编辑日程') : '新建', headExtra: ui.id ? '' : newKindTabs(app, 'event'), body: eventForm(state, app, ui.id), foot: eventFoot(state, app, ui.id)});
      }, onClose: () => app.setUi('editor', {id: '', error: '', newTask: null, newEvent: null})});
    },
    createQuickTask,
    taskForm, taskFoot,
  };
  app.view('editor', {render: () => ({title: ''}), ...editor});

  app.on('editor.kind', el => {
    // Keep the typed title when switching between task and schedule item.
    const title = document.querySelector('#taskTitle, #eventTitle')?.value || '';
    const kind = el.dataset.kind;
    app.setUi('editor', ui => ({kind, error: '', formSerial: (ui.formSerial || 0) + 1, newTask: kind === 'task' ? {...(ui.newTask || {}), title} : ui.newTask, newEvent: kind === 'event' ? {...(ui.newEvent || {}), title} : ui.newEvent}));
  });
  app.on('editor.repeat', el => {
    const form = document.getElementById('eventForm');
    const f = form ? new FormData(form) : null;
    app.setUi('editor', ui => ({repeat: el.dataset.value, formSerial: (ui.formSerial || 0) + 1, newEvent: f ? {...(ui.newEvent || {}), title: f.get('title'), start: f.get('start'), end: f.get('end'), location: f.get('location'), note: f.get('note'), date: f.get('date') || ui.date} : ui.newEvent}));
  });
  app.on('editor.openTask', el => { editor.openTask(app, el.dataset.id, {dialog: app.overlays.isOpen('editor')}); });
  app.on('editor.reload', () => {
    const ui = app.ui('editor');
    app.setUi('editor', {signature: signature(eventById(app.state.doc.schedule, ui.id)), error: '', formSerial: (ui.formSerial || 0) + 1});
  });
  app.on('editor.setDate', el => {
    const input = el.closest('form, .overlay-body, .inspector')?.querySelector('[name="' + el.dataset.field + '"]') || document.querySelector('#taskForm [name="' + el.dataset.field + '"]');
    if (!input) return;
    input.value = el.dataset.value;
    if (el.dataset.field === 'plannedDate' && !el.dataset.value) { const form = input.form; form.plannedStart.value = ''; form.plannedEnd.value = ''; }
    checkForm(input.form);
  });
  app.on('editor.check', el => checkForm(el.form));

  function checkForm(form) {
    if (!form) return;
    const warn = form.querySelector('[data-plan-warning]');
    if (warn && form.plannedDate) {
      const planned = form.plannedDate.value, deadline = form.deadline.value, start = form.plannedStart.value, end = form.plannedEnd.value;
      warn.textContent = planned && deadline && planned > deadline ? '执行日期晚于截止日期，请核对。' : start && end && end < start ? '结束时间在次日。' : (start || end) && !planned ? '设置时段前请先选执行日期。' : '';
      warn.classList.toggle('is-warning', !!warn.textContent);
    }
    const label = form.querySelector('[data-duration]');
    if (label && form.start && form.end) {
      const s = form.start.value, e = form.end.value;
      label.textContent = s && e ? (s === e ? '开始和结束不能相同' : durationLabel(duration(s, e)) + (e < s ? '，结束在次日' : '')) : '';
    }
  }

  app.on('editor.saveTask', form => {
    const id = form.dataset.id, input = readTaskForm(form), ui = app.ui('editor');
    try {
      if (!String(input.title || '').trim()) throw new Error('请填写待办名称。');
      if (input.estimatedMinutes !== '' && (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 1 || input.estimatedMinutes > 1440)) throw new Error('预计耗时请填写 1–1440 分钟的整数。');
      if (id) {
        const current = eventById(app.state.doc.schedule, id);
        if (!current) throw new Error('这条待办已被删除。');
        if (ui.signature && ui.signature !== signature(current)) throw new Error('这条待办已在另一处更新，请先载入最新内容。');
        app.commit(draft => {
          const task = updateTask(draft.schedule, id, input);
          if (input.parentId !== undefined && input.parentId !== (current.parentId || '')) {
            draft.schedule = workspace.setParent(draft.schedule, id, input.parentId);
          }
          if (input.steps !== undefined && input.steps.trim() !== (current.steps || []).map(s => s.title).join('\n').trim()) setSteps(draft.schedule, id, input.steps);
          return task;
        }, {message: '已保存「' + input.title.trim() + '」'});
        app.setUi('editor', {signature: signature(eventById(app.state.doc.schedule, id)), error: ''});
        if (app.overlays.isOpen('editor')) app.overlays.close('editor');
      } else {
        const preset = ui.newTask || {};
        const created = app.commit(draft => {
          const task = createTask(draft.schedule, {...input, parentId: preset.parentId || undefined});
          if (input.steps?.trim()) setSteps(draft.schedule, task.id, input.steps);
          return task;
        }, {message: '已添加待办', detail: input.title.trim() + (input.inbox ? ' · 收集箱' : '')});
        app.overlays.close('editor');
        app.getView('tasks')?.reveal?.(app, created.id);
      }
    } catch (error) { if (!error.handled) app.setUi('editor', {error: error.message}); }
  });

  app.on('editor.saveEvent', form => {
    const id = form.dataset.id, f = new FormData(form), ui = app.ui('editor');
    try {
      const title = String(f.get('title') || '').trim();
      if (!title) throw new Error('请填写日程名称。');
      if (f.get('start') === f.get('end')) throw new Error('开始和结束时间不能相同。');
      const input = {title, start: f.get('start'), end: f.get('end'), location: f.get('location'), note: f.get('note'), remindLead: Number(f.get('remindLead'))};
      if (id) {
        const current = eventById(app.state.doc.schedule, id);
        if (!current) throw new Error('这条日程已被删除。');
        if (ui.signature && ui.signature !== signature(current)) throw new Error('这条日程已在另一处更新，请先载入最新内容。');
        if (current.type === 'once') input.date = f.get('date') || current.date;
        if (current.type === 'weekly' && f.get('weekday')) input.weekday = Number(f.get('weekday'));
        if (current.type === 'weekly' && current.weekPattern) input.weekPattern = current.weekPattern;
        if (current.type === 'custom') input.repeat = current.repeat;
        app.commit(draft => updateEvent(draft.schedule, id, input), {message: isRepeating(current) ? '已保存整个系列' : '已保存「' + title + '」'});
        app.overlays.close('editor');
      } else {
        const type = ui.repeat || 'once';
        input.type = type;
        if (type === 'once') { input.date = f.get('date'); if (!isDate(input.date)) throw new Error('请选择日期。'); }
        if (type === 'weekly') input.weekday = Number(f.get('weekday') || weekdayIndex(ui.date || app.today) + 1);
        if (type === 'custom') {
          const interval = Number(f.get('interval')), until = f.get('until') || '';
          input.repeat = {interval, unit: f.get('unit'), start: f.get('repeatStart'), ...(until ? {until} : {}), ...(f.get('unit') === 'week' && f.getAll('days').length ? {days: f.getAll('days').map(Number)} : {})};
        }
        const created = app.commit(draft => createEvent(draft.schedule, input), {message: '已添加日程', detail: title + (type === 'once' ? ' · ' + monthDay(input.date) : type === 'weekly' ? ' · 每周' : ' · 自定义重复')});
        app.overlays.close('editor');
        if (type === 'once' && input.date !== app.today && app.state.route.view === 'calendar') app.setParams({date: input.date});
        return created;
      }
    } catch (error) { if (!error.handled) app.setUi('editor', {error: error.message}); }
  });

  app.on('editor.addChild', el => {
    const input = document.getElementById('childTitle');
    const title = input?.value.trim();
    if (!title) { input?.focus(); return; }
    app.commit(draft => { const next = workspace.addChild(draft.schedule, el.dataset.id, title, uid('task')); draft.schedule.events = next.events; }, {message: '已添加子任务', detail: title});
    input.value = ''; input.focus({preventScroll: true});
    app.setUi('editor', {signature: signature(eventById(app.state.doc.schedule, app.ui('editor').id))});
  });
  document.addEventListener('keydown', event => {
    const el = event.target;
    if (event.key === 'Enter' && !event.isComposing && el.matches?.('[data-enter]')) { event.preventDefault(); app.attempt(() => app.getView('editor') && dispatchEnter(el)); }
    // Enter in a title field saves; Shift+Enter is a newline-free title, so block it.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && el.matches?.('.title-input')) { event.preventDefault(); el.form?.requestSubmit(); }
  });
  function dispatchEnter(el) { const handler = el.dataset.enter; document.querySelector('[data-act="' + handler + '"][data-id="' + el.dataset.id + '"]')?.click(); }

  app.on('editor.template', el => {
    const task = eventById(app.state.doc.schedule, el.dataset.id);
    if (!task) return;
    app.commit(draft => { const next = workspace.capture(draft.schedule, task.id, uid('template'), task.title.slice(0, 80)); draft.schedule.library = next.library; }, {message: '已保存为模板', detail: '包含下级任务；不复制日期、附件和完成状态'});
  });
}

export {completionKey, PRIORITY_LABEL, childCounts};

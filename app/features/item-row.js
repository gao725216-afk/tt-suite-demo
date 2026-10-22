// Shared presentation for one schedule item or task. Execution plans (indigo,
// clock) and deadlines (carmine, flag) are always shown as different things.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {occur, organizer} from '../core.js';
import {deadlineState, isRepeating} from '../domain/items.js';
import {shortDate, relativeDay} from '../lib/dates.js';

export const PRIORITY_LABEL = ['无优先级', '低优先级', '中优先级', '高优先级'];

export function planChip(event, today) {
  const planned = occur.taskPlannedDate(event);
  if (event.deferred) return html`<span class="chip chip-outline">${icon('hourglass')}暂不安排</span>`;
  if (!planned) return '';
  const rel = relativeDay(planned, today);
  const label = (rel || shortDate(planned)) + (event.plannedStart && event.plannedEnd ? ' ' + event.plannedStart + '–' + event.plannedEnd : '');
  return html`<span class="chip chip-plan" title="计划执行">${icon('clock')}<span class="sr-only">计划</span>${label}</span>`;
}

export function deadlineChip(event, today, done) {
  const d = deadlineState(event, today);
  if (!d) return '';
  if (done) return html`<span class="chip chip-outline" title="截止日期">${icon('flag')}截止 ${shortDate(event.deadline)}</span>`;
  // Only overdue is a solid alarm; due soon is a soft tint; later is a quiet chip.
  const cls = d.overdue ? 'chip-due is-overdue' : d.days <= 1 ? 'chip-due-soon' : 'chip-due-later';
  return html`<span class="${'chip ' + cls}" title="截止日期">${icon('flag')}<span class="sr-only">截止</span>${d.label}</span>`;
}

export function metaChips(event, state, {done = false, hideList = false} = {}) {
  const org = organizer.get(state.doc.schedule);
  const list = event.listId && org.lists.find(l => l.id === event.listId);
  const tags = (event.tagIds || []).map(id => org.tags.find(t => t.id === id)).filter(Boolean);
  const steps = Array.isArray(event.steps) ? event.steps : [];
  const files = Array.isArray(event.attachments) ? event.attachments : [];
  return [
    planChip(event, state.today),
    deadlineChip(event, state.today, done),
    event.estimatedMinutes && occur.taskTiming(event)?.minutes !== event.estimatedMinutes ? html`<span class="chip">${icon('hourglass')}预计 ${event.estimatedMinutes} 分钟</span>` : '',
    !hideList && list ? html`<span class="chip">${icon('list')}${list.name}</span>` : '',
    !hideList && event.type === 'task' && organizer.isInbox(event) ? html`<span class="chip">${icon('inbox')}收集箱</span>` : '',
    tags.map(t => html`<span class="chip chip-outline">#${t.name}</span>`),
    steps.length ? html`<span class="chip">${icon('steps')}${steps.filter(s => s.done).length}/${steps.length}</span>` : '',
    files.length ? html`<span class="chip">${icon('clip')}${files.length}</span>` : '',
  ];
}

export function doneButton(event, date, done, extra = '') {
  return html`<button type="button" class="${cx('done-btn', !done && event.priority && 'prio-ring-' + event.priority, extra)}" data-act="item.complete" data-id="${event.id}" data-date="${date}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${(done ? '撤销完成：' : '完成：') + event.title}"><i>${icon('check')}</i></button>`;
}

// A task in a list. `depth` indents subtasks (max five levels).
export function taskRow(event, state, {done, depth = 0, parentTitle = '', parentDeleted = false, childCount = null, selecting = false, selected = false, date, hideList = false, compact = false} = {}) {
  const day = date || state.today;
  return html`<li class="${cx('item', 'item-task', done && 'is-done', compact && 'is-compact')}" data-key="${'t-' + event.id}" style="${'--depth:' + Math.min(depth, 4)}" data-item-menu="${event.id}">
  ${selecting ? html`<label class="item-select"><input type="checkbox" data-change="tasks.select" value="${event.id}"${attr('checked', selected)} aria-label="${'选择：' + event.title}"></label>` : doneButton(event, day, done)}
  <button type="button" class="item-body" data-act="item.open" data-id="${event.id}" data-date="${day}">
    <span class="item-title">${event.priority ? html`<i class="${'prio prio-' + event.priority}" title="${PRIORITY_LABEL[event.priority]}"></i>` : ''}<b>${event.title}</b></span>
    ${parentTitle ? html`<span class="item-parent">${icon('subtask')}${parentTitle}${parentDeleted ? '（上级已删除）' : ''}</span>` : ''}
    ${event.note && !compact ? html`<span class="item-note">${event.note.slice(0, 140)}</span>` : ''}
    <span class="item-meta">${metaChips(event, state, {done, hideList})}${childCount ? html`<span class="chip">${icon('subtask')}${childCount.done}/${childCount.total} 子任务</span>` : ''}</span>
  </button>
  <button type="button" class="icon-btn sm item-more" data-act="item.menu" data-id="${event.id}" data-date="${day}" aria-label="${'更多操作：' + event.title}">${icon('more')}</button>
</li>`;
}

// A timed row from the shared day projection (schedule, timed task or continuation).
export function timedRow(row, state, {now = -1} = {}) {
  const event = state.doc.schedule.events.find(e => e.id === row.eventId);
  if (!event) return '';
  const isTask = event.type === 'task';
  const current = now >= 0 && row.startMinute <= now && now < (row.end === '24:00' ? 1440 : (Number(row.end.slice(0, 2)) * 60 + Number(row.end.slice(3))));
  return html`<li class="${cx('item', 'item-timed', isTask && 'is-task-slot', row.done && 'is-done', current && 'is-now', row.continued && 'is-continued', 'tone-' + toneOf(event))}" data-key="${'r-' + row.key}" data-item-menu="${event.id}">
  <div class="item-time"><b>${row.start}</b><small>${row.end}</small></div>
  ${doneButton(event, row.sourceDate, row.done)}
  <button type="button" class="item-body" data-act="item.open" data-id="${event.id}" data-date="${row.sourceDate}">
    <span class="item-title"><b>${row.title}</b>${current ? html`<span class="chip chip-now">进行中</span>` : ''}</span>
    <span class="item-meta">
      ${isTask ? html`<span class="chip chip-plan">${icon('tasks')}待办 · 计划时段</span>` : ''}
      ${row.continued ? html`<span class="chip chip-outline">${icon('back')}接上一天 ${row.sourceDate.slice(5).replace('-', '/')}</span>` : ''}
      ${isRepeating(event) ? html`<span class="chip chip-outline">${icon('repeat')}重复</span>` : ''}
      ${row.location ? html`<span class="chip">${icon('pin')}${row.location}</span>` : ''}
      ${row.deadlineToday && !row.done ? html`<span class="chip chip-due-soon">${icon('flag')}今天截止</span>` : ''}
      ${Array.isArray(event.steps) && event.steps.length ? html`<span class="chip">${icon('steps')}${event.steps.filter(s => s.done).length}/${event.steps.length}</span>` : ''}
    </span>
  </button>
  <button type="button" class="icon-btn sm item-more" data-act="item.menu" data-id="${event.id}" data-date="${row.sourceDate}" aria-label="${'更多操作：' + row.title}">${icon('more')}</button>
</li>`;
}

// Colour family: explicit colours win; tasks are indigo; otherwise a keyword category.
const CATEGORY = [
  [/会议|会谈|讨论|组会|例会|开会|沟通|面试|meeting/i, 'rose'],
  [/跑步|散步|运动|健身|锻炼|瑜伽|游泳|体检|就医|睡眠|冥想|workout|run|yoga/i, 'sage'],
  [/阅读|读书|学习|复习|背诵|课程|上课|作业|论文|备考|笔记|实验|study|reading|lesson/i, 'blue'],
  [/买菜|购物|家务|洗衣|打扫|做饭|吃饭|早餐|午餐|晚餐|旅行|聚餐|约会|生日|shopping|dinner/i, 'peach'],
];
export function toneOf(event) {
  if (event.type === 'task') return 'task';
  if (['blue', 'sage', 'rose', 'peach', 'slate'].includes(event.color)) return event.color;
  let hex = String(event.color || '').replace('#', '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = hex.split('').map(c => c + c).join('');
  if (/^[0-9a-f]{6}$/.test(hex) && !(event.type === 'once' && hex === 'c95759')) {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta < 24) return 'slate';
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    return hue < 15 || hue >= 300 ? 'rose' : hue < 65 ? 'peach' : hue < 180 ? 'sage' : hue < 260 ? 'blue' : 'rose';
  }
  const title = String(event.title || '');
  for (const [pattern, tone] of CATEGORY) if (pattern.test(title)) return tone;
  return event.type === 'custom' ? 'peach' : 'slate';
}
export const TONE_LABEL = {blue: '学习', rose: '会议', sage: '健康', peach: '生活', slate: '工作', task: '待办'};

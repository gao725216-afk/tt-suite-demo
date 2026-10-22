// Schedule and task operations over a draft {schedule, progress}. All shape and
// date rules come from packages/core; this module only composes them.
import {occur, organizer, workspace, calendarViews} from '../core.js';
import {parseDate, minutes} from '../lib/dates.js';
import {completionKey} from './progress.js';

export const uid = prefix => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
export const isRepeating = event => event?.type === 'weekly' || event?.type === 'custom';
export const eventById = (schedule, id) => schedule.events.find(e => e.id === id) || null;

// Timed things on a day, including the after-midnight part of yesterday's
// cross-midnight items. Uses the shared projection so every view agrees.
export function dayRows(doc, date, options = {}) {
  return calendarViews.day(doc.schedule, doc.progress.records, date, options);
}

export function eventsOn(schedule, date) {
  const day = parseDate(date);
  return schedule.events.filter(e => e.type !== 'task' && occur.occursOn(e, day)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function plannedLabel(event) {
  const planned = occur.taskPlannedDate(event);
  if (!planned) return '';
  return planned + (event.plannedStart && event.plannedEnd ? ' ' + event.plannedStart + '–' + event.plannedEnd : '');
}

export function deadlineState(event, today) {
  if (!occur.isDateStr(event.deadline)) return null;
  const days = Math.round((parseDate(event.deadline) - parseDate(today)) / 86400000);
  return {days, overdue: days < 0, label: days < 0 ? '逾期 ' + -days + ' 天' : days === 0 ? '今天截止' : days === 1 ? '明天截止' : event.deadline.slice(5).replace('-', '/') + ' 截止'};
}

const clean = value => String(value ?? '').trim();

// Task fields accepted from editors. Execution plan and deadline stay separate.
export function taskFields(input) {
  const estimate = input.estimatedMinutes === '' || input.estimatedMinutes === undefined || input.estimatedMinutes === null ? undefined : Number(input.estimatedMinutes);
  const out = {
    title: clean(input.title), note: clean(input.note), deadline: input.deadline || '',
    plannedDate: input.plannedDate || '', plannedStart: input.plannedDate ? input.plannedStart || '' : '', plannedEnd: input.plannedDate ? input.plannedEnd || '' : '',
    listId: input.listId || '', inbox: !!input.inbox, priority: Number(input.priority) || 0, tagIds: Array.isArray(input.tagIds) ? input.tagIds : [],
  };
  if (estimate !== undefined) out.estimatedMinutes = estimate;
  return out;
}

function validated(event) {
  const errors = occur.validateEvent(event);
  if (errors.length) throw new Error(errors[0]);
  return event;
}

export function createTask(schedule, input, id = uid('task')) {
  const task = validated({id, type: 'task', ...taskFields(input), ...(input.parentId ? {parentId: input.parentId} : {})});
  if (task.estimatedMinutes === undefined) delete task.estimatedMinutes;
  schedule.events.push(task);
  return task;
}

export function updateTask(schedule, id, input, snapshot) {
  const current = eventById(schedule, id);
  if (!current) throw new Error('事项已被删除，请关闭后刷新。');
  if (snapshot && JSON.stringify(current) !== snapshot) throw new Error('这条事项已在另一处更新，请重新打开再修改。');
  const candidate = {...current, ...taskFields(input)};
  if (input.estimatedMinutes === '' || input.estimatedMinutes === undefined) delete candidate.estimatedMinutes;
  if (current.deferred && candidate.plannedDate) candidate.deferred = false;
  if (occur.isDateStr(candidate.start)) delete candidate.start; // migrate legacy start date
  validated(candidate);
  Object.keys(current).forEach(k => delete current[k]);
  Object.assign(current, candidate);
  return current;
}

export function eventFields(input) {
  const out = {title: clean(input.title), start: input.start, end: input.end, location: clean(input.location), note: clean(input.note), remindLead: Number(input.remindLead ?? 20)};
  if (input.type === 'once' || !input.type) out.date = input.date;
  if (input.type === 'weekly') { out.weekday = Number(input.weekday); if (input.weekPattern) out.weekPattern = input.weekPattern; }
  if (input.type === 'custom') out.repeat = input.repeat;
  if (input.deadline !== undefined) out.deadline = input.deadline || '';
  return out;
}

export function createEvent(schedule, input, id = uid('event')) {
  const event = validated({id, type: input.type || 'once', ...eventFields(input)});
  if (!event.note) delete event.note;
  schedule.events.push(event);
  return event;
}

// Repeating events are edited as a whole series; there is no per-occurrence override.
export function updateEvent(schedule, id, input, snapshot) {
  const current = eventById(schedule, id);
  if (!current) throw new Error('事项已被删除，请关闭后刷新。');
  if (snapshot && JSON.stringify(current) !== snapshot) throw new Error('这条事项已在另一处更新，请重新打开再修改。');
  const fields = eventFields({...input, type: current.type});
  if (current.type !== 'once') delete fields.date;
  const candidate = {...current, ...fields};
  if (!fields.note && current.note === undefined) delete candidate.note;
  validated(candidate);
  Object.assign(current, candidate);
  return current;
}

export function deferItem(schedule, progress, id, choice, today, snapshot) {
  const current = eventById(schedule, id);
  if (!current || (snapshot && JSON.stringify(current) !== snapshot)) throw new Error('这条事项已发生变化，请关闭后重新选择。');
  if (isRepeating(current)) throw new Error('重复日程请编辑整个系列。');
  if (current.type === 'task' ? progress.records.some(r => r.key === 'task:' + id) : progress.records.some(r => r.eventId === id)) throw new Error('已完成的事项请先撤销完成。');
  if (choice.mode === 'date' && choice.date < today) throw new Error('请选择今天或之后的执行日期。');
  const next = occur.deferEvent(current, choice);
  Object.assign(current, next);
  if (current.type === 'task') delete current.start;
  return current;
}

export function trashItem(state, id, snapshot) {
  const current = eventById(state.schedule, id);
  if (!current || (snapshot && JSON.stringify(current) !== snapshot)) throw new Error('这条事项已变化，请重新选择。');
  const next = occur.trashEvent(state.schedule, id);
  state.schedule.events = next.events; state.schedule.trash = next.trash;
  return current;
}

export function restoreItem(state, id) {
  const next = occur.restoreEvent(state.schedule, id);
  state.schedule.events = next.events; state.schedule.trash = next.trash;
  return eventById(state.schedule, id);
}

export function toggleStep(schedule, id, stepId) {
  const step = eventById(schedule, id)?.steps?.find(s => s.id === stepId);
  if (!step) throw new Error('这一步已不存在，请刷新。');
  step.done = !step.done; step.doneAt = step.done ? new Date().toISOString() : null;
  return step;
}

export function setSteps(schedule, id, text) {
  const event = eventById(schedule, id);
  if (!event) throw new Error('事项已不存在。');
  event.steps = workspace.steps(event, text, () => uid('step'));
  return event.steps;
}

// Children counts for the outline (completion is per item; parents never auto-complete).
export function childCounts(doc) {
  const done = new Set(doc.progress.records.map(r => r.key)), counts = new Map();
  for (const e of doc.schedule.events) {
    if (!e.parentId) continue;
    const c = counts.get(e.parentId) || {total: 0, done: 0};
    c.total++; if (done.has('task:' + e.id)) c.done++;
    counts.set(e.parentId, c);
  }
  return counts;
}

export function taskList(doc, today, options) {
  return organizer.selectTasks(doc.schedule, doc.progress.records, today, options);
}

export const isTaskDone = (doc, event, date) => doc.progress.records.some(r => r.key === completionKey(event, date));

// Day overlap lanes for timed blocks (presentation only; stored times unchanged).
export function lanes(blocks, minimum = 0) {
  blocks.sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  let group = [], end = -1;
  const distribute = () => {
    const ends = [];
    for (const block of group) {
      let lane = ends.findIndex(until => until <= block.startMinute);
      if (lane < 0) lane = ends.length;
      ends[lane] = Math.min(1440, Math.max(block.endMinute, block.startMinute + minimum));
      block.lane = lane;
    }
    for (const block of group) block.lanes = ends.length;
  };
  for (const block of blocks) {
    if (group.length && block.startMinute >= end) { distribute(); group = []; end = -1; }
    group.push(block); end = Math.max(end, Math.min(1440, Math.max(block.endMinute, block.startMinute + minimum)));
  }
  distribute();
  return blocks;
}

export const rowStartMinute = row => row.start ? minutes(row.start) : -1;

// Completion, habit and growth rules for the web client. These functions mutate
// a draft {schedule, progress} that the caller cloned; they never touch the DOM.
// Formats match the mini program (apps/wechat-miniapp/lib/model.js) and the
// server validation: records are completion snapshots and are never rebuilt.
import {occur, gardenWorld} from '../core.js';
import {addDays, duration, weekOf} from '../lib/dates.js';

export const FLOWER_CHOICES = [['auto', '按事项分类', 'flowerBlue'], ['blue', '蓝色小花', 'flowerBlue'], ['white', '白色小花', 'flowerWhite'], ['yellow', '黄色小花', 'flowerYellow'], ['red', '红色小花', 'flowerRed'], ['green', '绿色小花', 'flowerGreen']];
export const normalizeFlower = value => FLOWER_CHOICES.some(([id]) => id === value) ? value : 'auto';

export const completionKey = (event, date) => event.type === 'task' ? 'task:' + event.id : event.id + ':' + date;
export const recordFor = (progress, event, date) => progress.records.find(r => r.key === completionKey(event, date));
export const isDone = (progress, event, date) => !!recordFor(progress, event, date);

// Planned minutes captured at completion: an event's slot, or a task's timed
// execution plan. Actual focus time is stored separately and never mixed in.
export function plannedMinutes(event) {
  if (event.type === 'task') return occur.taskTiming(event)?.minutes || 0;
  return duration(event.start, event.end);
}

function moment(progress, type, title, detail, date, extra = {}) {
  progress.feedback = Array.isArray(progress.feedback) ? progress.feedback : [];
  const entry = {id: 'moment-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6), type, title, detail, date, ...extra};
  const merge = ['closure', 'streak', 'goal', 'badge'].includes(type) && progress.feedback.find(item => item.date === date && item.type === type && (item.milestone || '') === (entry.milestone || ''));
  if (merge) { Object.assign(merge, {...entry, id: merge.id}); return merge; }
  progress.feedback.unshift(entry);
  progress.feedback = progress.feedback.slice(0, 60);
  return entry;
}

export const weekRecords = (progress, date) => { const days = weekOf(date); return progress.records.filter(r => days.includes(r.date)); };

export function completionStreak(progress, today) {
  const dates = new Set(progress.records.map(r => r.date));
  let day = dates.has(today) ? today : addDays(today, -1), count = 0;
  while (dates.has(day) && count < 3660) { count++; day = addDays(day, -1); }
  return count;
}

// Habits ------------------------------------------------------------------
export function ensureHabits(progress) {
  if (!progress.habits || !Array.isArray(progress.habits.items)) progress.habits = {items: [], entries: []};
  if (!Array.isArray(progress.habits.entries)) progress.habits.entries = [];
  if (!Array.isArray(progress.feedback)) progress.feedback = [];
  return progress.habits;
}
export const habitEntry = (progress, habit, date) => (progress.habits?.entries || []).find(e => e.habitId === habit.id && e.date === date);
export const habitValue = (progress, habit, date) => habitEntry(progress, habit, date)?.value || 0;
export const habitClosed = (progress, habit, date) => { const e = habitEntry(progress, habit, date); return !!e && e.value >= e.goal; };
export const dailyHabits = (progress, date) => (progress.habits?.items || []).filter(h => !h.createdOn || h.createdOn <= date);
export const dayClosed = (progress, date) => { const list = dailyHabits(progress, date); return list.length > 0 && list.every(h => habitClosed(progress, h, date)); };
export function habitStreak(progress, date) {
  let day = dayClosed(progress, date) ? date : addDays(date, -1), n = 0;
  while (n < 366 && dayClosed(progress, day)) { n++; day = addDays(day, -1); }
  return n;
}
export const totalXP = progress => progress.records.length * 10 + (progress.habits?.entries || []).filter(e => e.value >= e.goal).length * 5;

export function achievements(progress, today) {
  const week = weekRecords(progress, today).length;
  return [
    {id: 'first', name: '迈出第一步', detail: '完成第一项安排', on: progress.records.length > 0},
    {id: 'ten', name: '十项推进', detail: '一周完成 10 项安排', on: week >= 10},
    {id: 'steady', name: '稳定前行', detail: '连续 3 天留下完成记录', on: completionStreak(progress, today) >= 3},
    {id: 'circle', name: '合成一个圆', detail: '一天完成所有小习惯', on: (progress.habits?.entries || []).some(e => dayClosed(progress, e.date))},
    {id: 'rhythm', name: '自己的节奏', detail: '连续 3 天习惯合圆', on: habitStreak(progress, today) >= 3},
  ];
}

// Toggle completion of one occurrence. Returns {done, record, moments}.
export function toggleCompletion(state, eventId, occurrenceDate, {today, now = new Date()}) {
  const {schedule, progress} = state;
  const event = schedule.events.find(e => e.id === eventId);
  if (!event) throw new Error('这条事项已不在清单中，请刷新。');
  const key = completionKey(event, occurrenceDate);
  const index = progress.records.findIndex(r => r.key === key);
  const before = achievements(progress, today).filter(a => a.on).map(a => a.id);
  const weekBefore = weekRecords(progress, today).length;
  if (index >= 0) {
    const [removed] = progress.records.splice(index, 1);
    moment(progress, 'undo', '按实际完成调整', event.title + '已撤销完成', today);
    gardenWorld.reconcile(progress);
    return {done: false, record: removed, moments: []};
  }
  const record = {key, eventId, date: today, occurrenceDate, title: event.title, kind: event.type === 'task' ? 'task' : 'event', minutes: plannedMinutes(event), doneAt: now.toISOString(), gardenFlower: normalizeFlower(progress.garden?.defaultFlower)};
  progress.records.push(record);
  const moments = [moment(progress, 'complete', event.title + '，完成了', '主动记录完成 · +10 XP', today)];
  const goal = progress.goal || 15, weekAfter = weekRecords(progress, today).length;
  if (weekBefore < goal && weekAfter >= goal) moments.push(moment(progress, 'goal', '本周的小目标，达成了。', weekAfter + ' / ' + goal + ' 项完成', today));
  for (const badge of achievements(progress, today).filter(a => a.on && !before.includes(a.id))) moments.push(moment(progress, 'badge', badge.name + '，值得记住。', badge.detail, today, {milestone: badge.id}));
  gardenWorld.reconcile(progress);
  return {done: true, record: progress.records.find(r => r.key === key), moments};
}

// One habit step forward (+1) or the last recorded step back (-1).
export function changeHabit(progress, habitId, sign, today) {
  ensureHabits(progress);
  const habit = progress.habits.items.find(h => h.id === habitId);
  if (!habit) throw new Error('这个习惯已不存在。');
  let entry = habitEntry(progress, habit, today);
  if (!entry) { entry = {habitId, date: today, value: 0, goal: habit.target}; progress.habits.entries.push(entry); }
  entry.increments ||= [];
  const wasClosed = habitClosed(progress, habit, today), wasDay = dayClosed(progress, today), previousStreak = habitStreak(progress, today);
  const delta = sign > 0 ? Math.min(habit.step, habit.target - entry.value) : (entry.increments.at(-1) || entry.value % habit.step || habit.step);
  const value = Math.max(0, Math.min(habit.target, entry.value + sign * delta));
  if (value === entry.value) return {changed: false, closed: wasClosed};
  if (sign > 0) entry.increments.push(delta); else entry.increments.pop();
  entry.value = value; entry.goal = habit.target;
  if (sign < 0) { moment(progress, 'undo', '按实际进展记录', habit.name + '已撤销一次记录', today); return {changed: true, closed: habitClosed(progress, habit, today), undone: true}; }
  const closed = habitClosed(progress, habit, today);
  moment(progress, closed && !wasClosed ? 'habit' : 'progress', closed && !wasClosed ? habit.name + '，今天完成了' : habit.name + '，又往前一点', value + ' / ' + habit.target + ' ' + habit.unit + (closed ? ' · +5 XP' : ''), today);
  let dayMoment = null;
  if (dayClosed(progress, today) && !wasDay) {
    dayMoment = moment(progress, 'closure', '今天的圆，合上了。', dailyHabits(progress, today).length + ' 个习惯已完成', today);
    if (habitStreak(progress, today) >= 3 && previousStreak < 3) moment(progress, 'streak', '连续三天，找到自己的节奏', '连续 ' + habitStreak(progress, today) + ' 天合圆', today);
  }
  return {changed: true, closed, newlyClosed: closed && !wasClosed, dayMoment};
}

export function saveHabit(progress, input, today, makeId) {
  ensureHabits(progress);
  const name = String(input.name || '').trim(), target = Number(input.target), step = Number(input.step);
  if (!name || name.length > 40 || !Number.isInteger(target) || !Number.isInteger(step) || target < 1 || target > 500 || step < 1 || step > target) throw new Error('填写名称，目标为 1–500，每次记录不超过目标。');
  let habit = input.id ? progress.habits.items.find(h => h.id === input.id) : null;
  if (input.id && !habit) throw new Error('这个习惯已不存在，请刷新。');
  if (!habit) {
    if (progress.habits.items.length >= 6) throw new Error('最多保留 6 个习惯，可以先调整已有目标。');
    habit = {id: makeId(), createdOn: today, icon: 'circle'};
    progress.habits.items.push(habit);
  }
  Object.assign(habit, {name, detail: String(input.detail || '').trim().slice(0, 80), target, step, unit: String(input.unit || '次').slice(0, 8), color: ['blue', 'sage', 'rose', 'peach'].includes(input.color) ? input.color : 'blue'});
  // Today's entry adopts the new goal; history keeps the goal it was recorded with.
  const entry = habitEntry(progress, habit, today);
  if (entry) { entry.goal = target; entry.value = Math.min(entry.value, target); entry.increments = []; }
  return habit;
}

export function setGoal(progress, goal) {
  if (!Number.isInteger(goal) || goal < 1 || goal > 100) throw new Error('每周目标请填写 1–100。');
  progress.goal = goal;
}

export function setFlower(progress, value, key = null) {
  if (!FLOWER_CHOICES.some(([id]) => id === value)) throw new Error('花色无效。');
  if (key === null) { progress.garden = {...(progress.garden || {}), defaultFlower: value}; return; }
  const record = progress.records.find(r => r.key === key);
  if (!record) throw new Error('这项完成记录已撤销，请刷新花园。');
  record.gardenFlower = value;
}

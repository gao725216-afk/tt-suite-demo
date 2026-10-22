// Public, synthetic fixture. No production data, account identifiers or network APIs.
import {gardenWorld, occur, focusCore} from '../core.js';
export const STORAGE_KEY = 'tt-public-demo-workspace-v1';
export const FOCUS_KEY = 'tt-public-demo-focus-v1';
export const DEMO_USER = Object.freeze({id: 'public-demo', username: '演示访客'});
const clone = value => structuredClone(value);
export function dateAt(offset = 0) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function seedDemo() {
  const today = dateAt(), now = new Date().toISOString();
  const schedule = {
    events: [
      {id: 'demo-reading', type: 'once', title: '阅读与灵感笔记', date: today, start: '09:00', end: '09:40', location: '书桌', note: '这是虚构的演示日程，可以点击编辑。'},
      {id: 'demo-design-review', type: 'once', title: '产品方案讨论', date: today, start: '14:00', end: '15:00', location: '线上', note: '虚构演示内容，不连接真实会议。'},
      {id: 'demo-walk', type: 'once', title: '傍晚散步', date: today, start: '18:00', end: '18:30', location: '公园'},
      {id: 'demo-tomorrow', type: 'once', title: '整理一周的灵感', date: dateAt(1), start: '10:00', end: '11:00', location: '书桌'},
      {id: 'demo-week-event', type: 'once', title: '周末创意练习', date: dateAt(3), start: '15:00', end: '16:30'},
      {id: 'demo-project', type: 'task', title: '整理产品改进方案', deadline: dateAt(2), plannedDate: today, estimatedMinutes: 90, listId: 'demo-design', tagIds: ['demo-ui'], priority: 3, inbox: false, note: '虚构演示项目。可以展开子任务、修改日期或勾选完成。'},
      {id: 'demo-child-a', type: 'task', title: '梳理主要页面入口', parentId: 'demo-project', listId: 'demo-design', tagIds: ['demo-ui'], priority: 2, inbox: false, deadline: today, plannedDate: today, plannedStart: '10:30', plannedEnd: '11:15', estimatedMinutes: 45},
      {id: 'demo-child-b', type: 'task', title: '整理组件与交互状态', parentId: 'demo-project', listId: 'demo-design', priority: 1, inbox: false, plannedDate: dateAt(1), estimatedMinutes: 30},
      {id: 'demo-overdue', type: 'task', title: '回顾上周的学习笔记', deadline: dateAt(-1), listId: 'demo-life', priority: 2, inbox: false},
      {id: 'demo-next-step', type: 'task', title: '写下今天的三个要点', deadline: today, plannedDate: today, priority: 2, inbox: true, note: '完成后，去成长花园看看新增的素材。'},
      {id: 'demo-inbox', type: 'task', title: '想到一个新的页面布局', inbox: true, priority: 0},
      {id: 'demo-unscheduled', type: 'task', title: '整理读书清单', deadline: dateAt(7), listId: 'demo-life', tagIds: ['demo-study'], inbox: false, estimatedMinutes: 30},
    ],
    trash: [],
    organizer: {version: 1, folders: [{id: 'demo-projects', name: '项目'}], lists: [{id: 'demo-design', name: '产品改进', folderId: 'demo-projects'}, {id: 'demo-life', name: '日常'}], tags: [{id: 'demo-ui', name: '界面'}, {id: 'demo-study', name: '学习'}]},
    library: {version: 1, notes: [{id: 'demo-note', title: '把想法变成可行动的一天', body: '# 演示使用指南\n\n这些内容都是虚构的，与你的真实日程无关。\n\n- 在今天页勾选一个事项\n- 在日历切换日视图和周视图\n- 给任务设置计划时间和截止日期\n- 到成长花园摆放完成奖励\n\n所有修改只保存在当前浏览器。没有真实 AI、账号、云同步或上传功能。请勿填写真实隐私信息。', updatedAt: now}], templates: [{id: 'demo-template', name: '整理一个小项目', items: [{key: 'demo-root', parentKey: '', title: '整理项目', note: '演示模板', priority: 2, estimatedMinutes: 30, steps: ['收集材料', '写出三个要点']}]}], filters: []},
  };
  const progress = {records: [], goal: 25, feedback: [], habits: {items: [{id: 'demo-reading-habit', name: '阅读', detail: '虚构演示习惯', target: 10, step: 5, color: 'blue', icon: 'circle', unit: '页'}, {id: 'demo-stretch-habit', name: '整理桌面', detail: '虚构演示习惯', target: 1, step: 1, color: 'sage', icon: 'circle', unit: '次'}], entries: [{habitId: 'demo-reading-habit', date: today, value: 5, goal: 10, increments: [5]}, {habitId: 'demo-reading-habit', date: dateAt(-1), value: 10, goal: 10, increments: [5, 5]}]}, periodTracker: {records: []}};
  const titles = ['整理书桌', '阅读一章', '完成练习', '准备材料', '整理文件', '写下想法', '复盘今天', '整理花架', '复习笔记', '画一个草图', '完成小实验'];
  for (let i = 0; i < 22; i++) {
    const id = 'demo-completed-' + i, day = dateAt(-Math.floor((21 - i) / 4)), title = titles[i % titles.length] + (i >= titles.length ? ' · 第二次' : '');
    schedule.events.push({id, type: 'task', title, deadline: day, listId: 'demo-life', inbox: false, note: '虚构演示完成记录，用于展示花园。'});
    progress.records.push({key: 'task:' + id, eventId: id, date: day, title, kind: 'task', minutes: 0, doneAt: day + 'T' + String(9 + i % 10).padStart(2, '0') + ':00:00.000Z', gardenFlower: ['blue', 'white', 'yellow', 'red', 'green'][i % 5]});
  }
  gardenWorld.reconcile(progress, 'public-synthetic-demo');
  const first = gardenWorld.view(progress, 0);
  first.items.forEach((record, slot) => gardenWorld.place(progress, record.key, slot));
  const second = gardenWorld.view(progress, 1);
  if (second.page === 1) second.inventory.slice(0, 3).forEach((record, slot) => gardenWorld.place(progress, record.key, slot));
  const problems = occur.validateSchedule(schedule);
  if (problems.length) throw new Error('演示数据校验失败：' + problems[0].errors[0]);
  return {schedule, progress};
}
export function loadDemo() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved?.schema === 1 && saved.doc?.schedule && Array.isArray(saved.doc?.progress?.records) && !occur.validateSchedule(saved.doc.schedule).length) return saved.doc;
  } catch {}
  return seedDemo();
}
export function createLocalSync({onStatus}) {
  let latest = loadDemo(), message = '仅保存在当前浏览器', status = 'synced';
  function save(doc = latest) {
    latest = clone(doc);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({schema: 1, doc: latest})); status = 'synced'; message = '已保存到当前浏览器'; }
    catch { status = 'error'; message = '浏览器存储不可用，请导出备份'; }
    onStatus?.({status, message, pending: false, conflict: null});
  }
  return {doc: clone(latest), changed: save, start: () => save(), retry: () => save(), flush: async () => save(), conflict: () => null, status: () => ({status, message, pending: false}), reset: () => { latest = seedDemo(); save(); try { localStorage.removeItem(FOCUS_KEY); localStorage.removeItem('tt-focus-pending:public-demo'); } catch {} return clone(latest); }};
}
export function loadFocus() {
  try { const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null'); if (saved && Array.isArray(saved.sessions) && Array.isArray(saved.reviews) && Array.isArray(saved.commands)) return saved; } catch {}
  return focusCore.empty();
}

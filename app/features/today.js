// 今天: one place to see what is scheduled, what is due, and what's next.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {occur, gardenWorld, focusCore} from '../core.js';
import {dayRows} from '../domain/items.js';
import {weekRecords, dailyHabits, habitValue, habitClosed, isDone} from '../domain/progress.js';
import {parseDate, nowMinutes, minutes, WEEKDAYS, weekdayIndex} from '../lib/dates.js';
import {taskRow, timedRow, toneOf} from './item-row.js';
import {organizer, workspace} from '../core.js';
import {childCounts} from '../domain/items.js';
import {companionStage} from './companion.js';

const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

function dayRuler(rows, state, now) {
  const blocks = rows.filter(r => r.start).map(r => {
    const event = state.doc.schedule.events.find(e => e.id === r.eventId);
    const start = minutes(r.start), end = r.end === '24:00' ? 1440 : minutes(r.end);
    return {r, event, start, end: end > start ? end : 1440};
  });
  const first = Math.min(7 * 60, ...blocks.map(b => b.start)), last = Math.max(22 * 60, ...blocks.map(b => b.end));
  const span = last - first;
  const pos = m => ((m - first) / span * 100).toFixed(2) + '%';
  const hours = [];
  for (let h = Math.ceil(first / 60); h * 60 <= last; h += 3) hours.push(h);
  return html`<div class="day-ruler" aria-hidden="true">
    <div class="day-ruler-track">${blocks.map(b => html`<i class="${cx('ruler-block', 'tone-' + toneOf(b.event || {}), b.r.done && 'is-done')}" style="${'left:' + pos(b.start) + ';width:calc(' + pos(b.end) + ' - ' + pos(b.start) + ')'}"></i>`)}${now >= first && now <= last ? html`<b class="ruler-now" style="${'left:' + pos(now)}"></b>` : ''}</div>
    <div class="day-ruler-hours">${hours.map(h => html`<span style="${'left:' + pos(h * 60)}">${String(h).padStart(2, '0')}</span>`)}</div>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}

function masthead(state, rows, tasks, now, app) {
  const d = parseDate(state.today);
  const done = state.doc.progress.records.filter(r => r.date === state.today).length;
  const next = rows.find(r => r.start && !r.done && minutes(r.start) > now);
  const currentRow = rows.find(r => r.start && !r.done && minutes(r.start) <= now && now < (r.end === '24:00' ? 1440 : minutes(r.end)));
  const pending = tasks.filter(t => !t.done).length;
  return html`<header class="hello">
  <div class="date-bubble" aria-label="${(d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEKDAYS[weekdayIndex(state.today)]}">
    <i class="db-shine" aria-hidden="true"></i><i class="db-star" aria-hidden="true">✦</i><span class="db-month">${MONTHS[d.getMonth()]}</span><b class="db-day">${d.getDate()}</b><span class="db-week">周${WEEKDAYS[weekdayIndex(state.today)]}</span>
  </div>
  <div class="hello-copy">
    <h2>${greeting()}，${state.session.user.username}</h2>
    <p class="hello-next">${currentRow ? html`正在进行：<b>${currentRow.title}</b>` : next ? html`接下来 <b class="time-tag">${next.start}</b> ${next.title}` : rows.length ? '今天的时间安排都过去啦。' : '今天还没有时间安排，给自己留点白也很好。'}</p>
    <div class="stat-row">
      <span class="stat"><b>${rows.length}</b>项安排</span>
      <span class="stat"><b>${pending}</b>件待办</span>
      <span class="stat is-done"><b>${done}</b>已完成</span>
    </div>
  </div>
  <button type="button" class="buddy" data-act="companion.poke" aria-label="${'戳一戳小伙伴（' + (app.getView('companion').label?.() || '') + '）'}">${companionStage(state, app, state.layout.compact ? 'md' : 'lg', 'today')}</button>
</header>`;
}

function habitsCard(state) {
  const progress = state.doc.progress, habits = dailyHabits(progress, state.today);
  if (!habits.length) return html`<section class="panel panel-pad side-card tint-habits"><div class="section-title"><h2>习惯</h2><button type="button" class="link-btn" data-act="nav.go" data-view="growth" data-params='{"tab":"habits"}'>添加</button></div><p class="small">给每天留几个愿意重复的小动作。</p></section>`;
  return html`<section class="panel panel-pad side-card tint-habits"><div class="section-title"><h2>习惯</h2><span class="spacer"></span><button type="button" class="link-btn" data-act="nav.go" data-view="growth" data-params='{"tab":"habits"}'>全部</button></div>
  <ul class="habit-quick">${habits.map(h => { const value = habitValue(progress, h, state.today), closed = habitClosed(progress, h, state.today), ratio = Math.min(1, value / h.target); return html`<li data-key="${'h-' + h.id}" class="${cx('tone-' + (h.color || 'blue'), closed && 'is-closed')}">
    <svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-track"/><circle cx="18" cy="18" r="15" class="ring-arc" pathLength="100" stroke-dasharray="100 100" style="${'stroke-dashoffset:' + (100 - ratio * 100)}" transform="rotate(-90 18 18)"/></svg>
    <div class="habit-quick-copy"><b>${h.name}</b><small class="num">${value} / ${h.target} ${h.unit}${closed ? ' · 已完成' : ''}</small></div>
    <button type="button" class="btn btn-quiet btn-sm" data-act="habit.add" data-id="${h.id}"${attr('disabled', closed)} aria-label="${'记录 ' + h.name + ' +' + Math.min(h.step, h.target - value) + h.unit}">+${Math.min(h.step, Math.max(1, h.target - value))}</button>
  </li>`; })}</ul></section>`;
}

function focusCard(state, app) {
  const focus = app.getView('focus').snapshot(app);
  const session = focus?.state && focusCore.active(focus.state);
  if (session) {
    const ms = focusCore.elapsed(session, focus.now);
    return html`<section class="panel panel-pad side-card tint-focus focus-mini is-active"><div class="section-title"><h2>专注中</h2></div><p class="focus-mini-title">${session.title}</p><p class="focus-mini-clock serif num" data-focus-clock>${focusCore.format(session.mode === 'stopwatch' ? ms : Math.max(0, session.targetMs - ms))}</p><button type="button" class="btn btn-quiet btn-block" data-act="nav.go" data-view="focus">回到计时</button></section>`;
  }
  return html`<section class="panel panel-pad side-card tint-focus focus-mini"><div class="section-title"><h2>专注</h2></div><p class="small">选一件事，开始一段不被打扰的时间。实际用时单独记录。</p><button type="button" class="btn btn-quiet btn-block" data-act="nav.go" data-view="focus">${icon('focus')}开始专注</button></section>`;
}

function weekCard(state) {
  const progress = state.doc.progress, count = weekRecords(progress, state.today).length, goal = progress.goal || 15;
  const view = gardenWorld.view(progress, 0);
  const waiting = gardenWorld.view(progress, view.unlocked - 1).inventory.length;
  return html`<section class="panel panel-pad side-card tint-week"><div class="section-title"><h2>本周</h2><span class="spacer"></span><button type="button" class="link-btn" data-act="nav.go" data-view="growth">成长</button></div>
  <p class="week-figure"><b class="serif num">${count}</b><span>/ ${goal} 项完成</span></p>
  <div class="meter" role="progressbar" aria-label="本周目标" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(count, goal)}"><i style="${'width:' + Math.min(100, count / goal * 100) + '%'}"></i></div>
  ${waiting ? html`<button type="button" class="garden-nudge" data-act="nav.go" data-view="growth" data-params='{"tab":"garden"}'>${icon('leaf')}<span>${waiting} 份花园素材等你摆放</span>${icon('forward')}</button>` : ''}
</section>`;
}

export function registerToday(app) {
  app.view('today', {
    render(state, app) {
      const now = nowMinutes();
      const projection = dayRows(state.doc, state.today);
      const rows = projection.rows.filter(r => r.kind !== 'deadline' && r.start);
      const records = state.doc.progress.records;
      const counts = childCounts(state.doc);
      // Untimed tasks for today: planned today/earlier or due today/earlier.
      const timedToday = e => !!occur.taskTiming(e) && occur.taskPlannedDate(e) === state.today;
      const untimed = state.doc.schedule.events.filter(e => e.type === 'task' && !timedToday(e) && occur.taskMatchesFilter(e, records.some(r => r.key === 'task:' + e.id), 'today', state.today));
      const doneToday = state.doc.schedule.events.filter(e => e.type === 'task' && !timedToday(e) && records.some(r => r.key === 'task:' + e.id && r.date === state.today));
      const overdue = untimed.filter(e => e.deadline && e.deadline < state.today);
      const due = untimed.filter(e => !overdue.includes(e));
      const tasks = [...due, ...doneToday].map(e => ({e, done: isDone(state.doc.progress, e, state.today)}));
      const pending = tasks.filter(t => !t.done), finished = tasks.filter(t => t.done);
      const inbox = organizer.selectTasks(state.doc.schedule, records, state.today, {view: 'inbox'}).length;
      const outline = list => workspace.outline(state.doc.schedule, list).map(info => ({...info, done: records.some(r => r.key === 'task:' + info.event.id)}));
      const wide = !state.layout.compact;
      return {
        title: '今天',
        subtitle: wide ? '' : '',
        body: html`<div class="today">
  ${masthead(state, rows, tasks, now, app)}
  ${rows.length ? dayRuler(rows, state, now) : ''}
  <div class="${cx('today-grid', wide && 'is-split')}">
    <div class="today-main">
      <section class="today-section">
        <div class="section-title"><h2>时间安排</h2><span class="count">${rows.length}</span><span class="spacer"></span><button type="button" class="link-btn" data-act="nav.go" data-view="calendar" data-params='{"mode":"day"}'>日历</button></div>
        ${rows.length ? html`<ol class="items timed">${rows.map(r => timedRow(r, state, {now}))}</ol>` : html`<div class="empty compact"><div class="empty-mark">${icon('calendar')}</div><h3>今天没有时间安排</h3><p>点“新建”添加日程，或给待办安排一个时段。</p></div>`}
      </section>
      <section class="today-section">
        <div class="section-title"><h2>今天要做</h2><span class="count">${due.length}</span><span class="spacer"></span><button type="button" class="link-btn" data-act="nav.go" data-view="tasks" data-params='{"list":"today"}'>全部任务</button></div>
        <form class="quick-add" data-submit="today.capture" data-key="today-capture"><span aria-hidden="true">${icon('plus')}</span><input class="quick-add-input" name="title" maxlength="200" autocomplete="off" placeholder="记下今天要做的事，回车保存" aria-label="添加今天的待办" data-uncontrolled><button type="submit" class="btn btn-ghost btn-sm">添加</button></form>
        ${overdue.length ? html`<p class="list-label due">${icon('flag')}已逾期 ${overdue.length} 项</p><ul class="items">${outline(overdue).map(info => taskRow(info.event, state, {...info, childCount: counts.get(info.event.id)}))}</ul>` : ''}
        ${pending.length ? html`<ul class="items">${outline(pending.map(t => t.e)).map(info => taskRow(info.event, state, {...info, childCount: counts.get(info.event.id)}))}</ul>` : overdue.length || finished.length ? '' : html`<div class="empty compact"><p>今天没有到期或计划中的待办。${inbox ? '收集箱里还有 ' + inbox + ' 件事等着整理。' : ''}</p>${inbox ? html`<button type="button" class="btn btn-quiet btn-sm" data-act="nav.go" data-view="tasks" data-params='{"list":"inbox"}'>${icon('inbox')}整理收集箱</button>` : ''}</div>`}
        ${finished.length ? html`<details class="done-group"><summary>${icon('down')}今天已完成 ${finished.length} 项</summary><ul class="items">${finished.map(t => taskRow(t.e, state, {done: true, compact: true}))}</ul></details>` : ''}
      </section>
    </div>
    <aside class="today-side">
      ${focusCard(state, app)}
      ${habitsCard(state)}
      ${weekCard(state)}
    </aside>
  </div>
</div>`,
      };
    },
  });
  app.on('today.capture', form => {
    const input = form.elements.title, title = input.value.trim();
    if (!title) { input.focus(); return; }
    app.commit(draft => app.getView('editor').createQuickTask(draft, {title, plannedDate: app.today}), {message: '已添加到今天', detail: title});
    input.value = '';
    input.focus({preventScroll: true});
  });
}

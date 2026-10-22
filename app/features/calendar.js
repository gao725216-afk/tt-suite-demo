// 日历: day, week and month grids plus multi-day, multi-week and year
// overviews. All placements come from the shared projection (cross-midnight
// continuations, recurrence, planned task slots and deadlines).
import {html, attr, cx, raw} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {calendarViews} from '../core.js';
import {dayRows, lanes} from '../domain/items.js';
import {addDays, addMonths, weekOf, monthCells, minutes, nowMinutes, parseDate, WEEKDAYS, weekdayIndex, isDate, clock, monthDay} from '../lib/dates.js';
import {toneOf, timedRow, taskRow} from './item-row.js';
import {registerPlanning} from './planning.js';

const MODES = [['day', '日'], ['week', '周'], ['month', '月'], ['days3', '3 日'], ['days5', '5 日'], ['weeks2', '2 周'], ['weeks4', '4 周'], ['year', '年']];
const endMinute = row => row.end === '24:00' ? 1440 : minutes(row.end);

function anchor(state) { const d = state.route.params.date; return isDate(d) ? d : state.today; }
function mode(state) {
  const m = state.route.params.mode;
  if (state.layout.landscapePhone && (!m || m === 'day')) return 'week';
  return MODES.some(([id]) => id === m) ? m : (state.layout.compact ? 'day' : 'week');
}

function rangeTitle(m, date) {
  const d = parseDate(date);
  if (m === 'day') return (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEKDAYS[weekdayIndex(date)];
  if (m === 'week' || m === 'weeks2' || m === 'weeks4') { const w = weekOf(date), end = m === 'week' ? w[6] : addDays(w[0], (m === 'weeks2' ? 14 : 28) - 1); return monthDay(w[0]) + ' – ' + monthDay(end); }
  if (m === 'month') return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
  if (m === 'year') return d.getFullYear() + '年';
  const days = m === 'days3' ? 3 : 5; return monthDay(date) + ' – ' + monthDay(addDays(date, days - 1));
}

function shift(m, date, delta) {
  if (m === 'day') return addDays(date, delta);
  if (m === 'week') return addDays(date, 7 * delta);
  if (m === 'month') return addMonths(date, delta);
  return calendarViews.shift(date, m, delta);
}

// Hour grid for one or more days.
function timeGrid(state, dates, {compact = false} = {}) {
  const now = nowMinutes();
  const perDay = dates.map(date => {
    const rows = dayRows(state.doc, date).rows;
    const timed = lanes(rows.filter(r => r.start).map(r => ({r, startMinute: minutes(r.start), endMinute: Math.max(minutes(r.start) + 15, endMinute(r))})), 22);
    // Pending all-day items first; finished deadlines sink to the bottom.
    return {date, timed, allDay: rows.filter(r => !r.start).sort((a, b) => Number(a.done) - Number(b.done))};
  });
  const all = perDay.flatMap(d => d.timed);
  const first = Math.max(0, Math.min(7, ...all.map(b => Math.floor(b.startMinute / 60)))), last = Math.min(24, Math.max(22, ...all.map(b => Math.ceil(b.endMinute / 60))));
  const hourH = compact ? 40 : 48, height = (last - first) * hourH;
  const hours = Array.from({length: last - first}, (_, i) => first + i);
  const hasAllDay = perDay.some(d => d.allDay.length);
  const allDayOpen = !!state.ui.calendar?.allDayOpen, allDayLimit = allDayOpen ? Infinity : 3;
  const top = m => ((m - first * 60) / 60 * hourH).toFixed(1) + 'px';
  return html`<div class="${cx('tgrid', dates.length === 1 && 'is-single')}" style="${'--cols:' + dates.length + ';--hour-h:' + hourH + 'px'}">
    <div class="tgrid-head">
      <span class="tgrid-corner"></span>
      ${perDay.map(({date}) => html`<button type="button" class="${cx('tgrid-day', date === state.today && 'is-today')}" data-act="cal.pick" data-date="${date}" aria-label="${monthDay(date) + ' 周' + WEEKDAYS[weekdayIndex(date)] + '，打开当天'}"><small>周${WEEKDAYS[weekdayIndex(date)]}</small><b>${parseDate(date).getDate()}</b></button>`)}
    </div>
    ${hasAllDay ? html`<div class="tgrid-allday"><span class="tgrid-corner">全天</span>${perDay.map(({date, allDay}) => html`<div class="tgrid-allday-cell">${allDay.slice(0, allDayLimit).map(r => html`<button type="button" class="${cx('pill', r.kind === 'deadline' ? 'pill-due' : 'pill-plan', r.done && 'is-done')}" data-act="item.open" data-id="${r.eventId}" data-date="${r.sourceDate}" data-item-menu="${r.eventId}" title="${(r.kind === 'deadline' ? '截止：' : '计划：') + r.title}">${icon(r.kind === 'deadline' ? 'flag' : 'tasks')}<span class="ellipsis">${r.title}</span></button>`)}${allDay.length > allDayLimit ? html`<button type="button" class="pill pill-more" data-act="cal.allDay" aria-expanded="false">还有 ${allDay.length - allDayLimit} 项</button>` : ''}</div>`)}${allDayOpen ? html`<span></span><button type="button" class="pill pill-more is-less" data-act="cal.allDay" aria-expanded="true" style="grid-column: 2 / -1">收起全天事项</button>` : ''}</div>` : ''}
    <div class="tgrid-body" style="${'height:' + height + 'px'}">
      <div class="tgrid-hours">${hours.map(h => html`<span style="${'top:' + top(h * 60)}">${String(h).padStart(2, '0')}:00</span>`)}</div>
      ${perDay.map(({date, timed}) => html`<div class="tgrid-col" data-key="${'col-' + date}" data-slot-date="${date}" data-first="${first}" data-hour-h="${hourH}">
        ${hours.map(h => html`<i class="tgrid-line" style="${'top:' + top(h * 60)}"></i>`)}
        ${timed.map(b => {
          const ev=state.doc.schedule.events.find(e=>e.id===b.r.eventId)||{},short=b.endMinute-b.startMinute<45;
          const movable=['task','once'].includes(ev.type)&&!b.r.done&&!b.r.continued&&!state.doc.schedule.events.some(e=>e.parentId===ev.id);
          return html`<div class="${cx('block','tone-'+toneOf(ev),b.r.done&&'is-done',b.r.continued&&'is-continued',short&&'is-short',ev.type==='task'&&'is-task')}" data-key="${'b-'+b.r.key}" data-id="${b.r.eventId}" data-date="${b.r.sourceDate}" data-item-menu="${b.r.eventId}" style="${'top:'+top(b.startMinute)+';height:calc('+((b.endMinute-b.startMinute)/60*hourH).toFixed(1)+'px - 2px);left:calc('+(b.lane/b.lanes*100)+'% + 2px);width:calc('+(100/b.lanes)+'% - 4px)'}" role="group" aria-label="${b.r.title+'，'+b.r.start+'–'+b.r.end+(b.r.continued?'，接上一天':'')+(b.r.done?'，已完成':'')}"><button type="button" class="block-content" data-act="item.open" data-id="${b.r.eventId}" data-date="${b.r.sourceDate}"><b>${b.r.title}</b>${short?'':html`<small>${b.r.continued?'接上一天 · ':''}${b.r.start}–${b.r.end}</small>`}</button>${movable?html`<button type="button" class="block-move" data-plan-drag="${ev.id}" data-act="planning.edit" data-id="${ev.id}" aria-label="${'移动时间块：'+ev.title}">${icon('move')}</button><button type="button" class="block-resize" data-plan-resize="${ev.id}" data-act="planning.edit" data-id="${ev.id}" aria-label="${'调整时长：'+ev.title}"></button>`:''}</div>`;
        })}
        ${date === state.today && now >= first * 60 && now <= last * 60 ? html`<b class="now-line" style="${'top:' + top(now)}" aria-hidden="true"></b>` : ''}
      </div>`)}
    </div>
  </div>`;
}

function monthGrid(state, date) {
  const cells = monthCells(date);
  return html`<div class="mgrid">
    <div class="mgrid-weekdays">${WEEKDAYS.map(w => html`<span>${w}</span>`)}</div>
    <div class="mgrid-cells">${cells.map(c => {
      const rows = dayRows(state.doc, c.date).rows;
      const shown = rows.slice(0, state.layout.compact ? 0 : 3);
      return html`<button type="button" class="${cx('mcell', !c.inMonth && 'is-outside', c.date === state.today && 'is-today', c.date === anchor(state) && 'is-selected')}" data-act="cal.select" data-date="${c.date}" aria-label="${monthDay(c.date) + '，' + rows.length + ' 项'}" aria-pressed="${c.date === anchor(state) ? 'true' : 'false'}">
        <span class="mcell-num">${c.number}</span>
        ${shown.map(r => { const ev = state.doc.schedule.events.find(e => e.id === r.eventId) || {}; return html`<span class="${cx('mcell-entry', 'tone-' + toneOf(ev), r.kind === 'deadline' && 'is-due', r.done && 'is-done')}">${r.start ? html`<time>${r.start}</time>` : r.kind === 'deadline' ? icon('flag') : ''}<span class="ellipsis">${r.title}</span></span>`; })}
        ${rows.length > shown.length ? html`<span class="${cx('mcell-more', state.layout.compact && 'dots')}">${state.layout.compact ? raw('<i></i>'.repeat(Math.min(3, rows.length))) : '还有 ' + (rows.length - shown.length) + ' 项'}</span>` : ''}
      </button>`;
    })}</div>
  </div>`;
}

function overview(state, m, date) {
  const view = calendarViews.project(state.doc.schedule, state.doc.progress.records, {anchor: date, mode: m, today: state.today});
  if (m === 'year') return html`<div class="year-wrap"><div class="year">${view.months.map(month => html`<section class="year-month"><h3>${month.label}<small>${month.activeDays} 天有安排</small></h3><div class="year-weekdays">${WEEKDAYS.map(w => html`<span>${w}</span>`)}</div><div class="year-grid">${month.cells.map(c => c.blank ? html`<span></span>` : html`<button type="button" class="${cx('yday', 'lv' + c.level, c.today && 'is-today', c.date === anchor(state) && 'is-selected')}" data-act="cal.select" data-date="${c.date}" aria-label="${c.date + '，' + c.count + ' 项'}" title="${c.date + ' · ' + c.count + ' 项'}">${c.number}</button>`)}</div></section>`)}</div>
    <p class="year-legend"><span>每天的安排数量</span><i class="lv0"></i>0<i class="lv1"></i>1–2<i class="lv2"></i>3–5<i class="lv3"></i>6+</p></div>`;
  return html`<div class="${cx('span-days', m.startsWith('weeks') && 'is-weeks')}">${view.days.map(day => html`<section class="${cx('span-day', day.today && 'is-today', day.date === anchor(state) && 'is-selected')}" data-key="${'sd-' + day.date}">
    <button type="button" class="span-day-head" data-act="cal.select" data-date="${day.date}" aria-pressed="${day.date === anchor(state) ? 'true' : 'false'}"><b>${day.date.slice(5).replace('-', '/')}</b><span>周${day.weekday}</span>${day.count ? html`<span class="count">${day.count}</span>` : ''}</button>
    <div class="span-day-body">${day.rows.map(r => { const ev = state.doc.schedule.events.find(e => e.id === r.eventId) || {}; return html`<button type="button" class="${cx('span-entry', 'tone-' + toneOf(ev), r.kind === 'deadline' && 'is-due', r.done && 'is-done')}" data-act="item.open" data-id="${r.eventId}" data-date="${r.sourceDate}"><small>${r.kind === 'deadline' ? '截止' : r.start ? (r.continued ? '续 ' : '') + r.start : '待办'}</small><span class="ellipsis">${r.title}</span></button>`; })}${day.hidden ? html`<button type="button" class="link-btn" data-act="cal.select" data-date="${day.date}">还有 ${day.hidden} 项</button>` : ''}${!day.count ? html`<p class="span-empty">—</p>` : ''}</div>
  </section>`)}</div>`;
}

function dayDetail(state, date, {heading = true} = {}) {
  const rows = dayRows(state.doc, date).rows;
  const timed = rows.filter(r => r.start), others = rows.filter(r => !r.start);
  return html`<section class="day-detail" aria-label="${monthDay(date) + '的安排'}">
    ${heading ? html`<div class="section-title"><h2>${monthDay(date)} 周${WEEKDAYS[weekdayIndex(date)]}</h2><span class="count">${rows.length}</span><span class="spacer"></span><button type="button" class="btn btn-quiet btn-sm" data-act="cal.new" data-date="${date}">${icon('plus')}新建日程</button></div>` : ''}
    ${timed.length ? html`<ol class="items timed">${timed.map(r => timedRow(r, state, {now: date === state.today ? nowMinutes() : -1}))}</ol>` : ''}
    ${others.length ? html`<p class="list-label">${icon('tasks')}待办与截止</p><ul class="items">${others.map(r => { const ev = state.doc.schedule.events.find(e => e.id === r.eventId); return ev ? taskRow(ev, state, {done: r.done, date}) : ''; })}</ul>` : ''}
    ${!rows.length ? html`<div class="empty compact"><div class="empty-mark">${icon('calendar')}</div><h3>这一天没有安排</h3><button type="button" class="btn btn-quiet btn-sm" data-act="cal.new" data-date="${date}">${icon('plus')}新建日程</button></div>` : ''}
  </section>`;
}

export function registerCalendar(app) {
  registerPlanning(app);
  app.view('calendar', {
    render(state) {
      const m = mode(state), date = anchor(state);
      const compact = state.layout.compact, landscape = state.layout.landscapePhone;
      let body;
      if (m === 'day') body = html`${timeGrid(state, [date], {compact})}${compact ? dayDetail(state, date, {heading: false}) : ''}`;
      else if (m === 'week') body = timeGrid(state, weekOf(date), {compact: compact || landscape});
      else if (m === 'month') body = html`<div class="${cx('split', !compact && 'is-split')}">${monthGrid(state, date)}${dayDetail(state, date)}</div>`;
      else body = html`<div class="${cx('split', !compact && m !== 'year' && 'is-split', m === 'year' && !compact && 'is-split-year')}">${overview(state, m, date)}${dayDetail(state, date)}</div>`;
      const nav = html`<div class="cal-nav">
        <button type="button" class="icon-btn" data-act="cal.shift" data-delta="-1" aria-label="上一段">${icon('back')}</button>
        <button type="button" class="btn btn-quiet btn-sm" data-act="cal.today"${attr('disabled', date === state.today && m !== 'year')}>今天</button>
        <button type="button" class="icon-btn" data-act="cal.shift" data-delta="1" aria-label="下一段">${icon('forward')}</button>
        <label class="date-jump"><span class="sr-only">跳转到日期</span><input class="input" type="date" value="${date}" data-change="cal.jump"></label>
      </div>`;
      return {
        title: rangeTitle(m, date),
        subtitle: '',
        className: cx('full-bleed', landscape && 'is-landscape'),
        immersive: landscape,
        actions: state.layout.wide ? nav : '',
        body: html`<div class="${cx('calendar', 'mode-' + m)}">
          ${landscape ? html`<div class="cal-landscape-bar"><b>${rangeTitle(m, date)}</b>${nav}<div class="seg">${MODES.slice(0, 3).map(([id, label]) => html`<button type="button" data-act="cal.mode" data-mode="${id}" aria-pressed="${m === id ? 'true' : 'false'}">${label}</button>`)}</div><button type="button" class="icon-btn" data-act="capture.open" aria-label="新建">${icon('plus')}</button></div>` : html`<div class="cal-toolbar">
            <div class="seg cal-modes" role="group" aria-label="日历视图">${MODES.filter(([id]) => !(compact && id === 'week')).map(([id, label]) => html`<button type="button" data-act="cal.mode" data-mode="${id}" aria-pressed="${m === id ? 'true' : 'false'}">${label}</button>`)}</div>
            ${state.layout.wide ? '' : nav}
          </div>`}
          ${compact && m === 'week' ? html`<p class="hint rotate-hint">${icon('phone')}横过手机可查看完整的一周。</p>` : ''}
          <div class="planning-workspace">${app.getView('planning').renderPool(state,date)}<div class="planning-calendar">${body}</div></div>
        </div>`,
      };
    },
  });
  const go = params => app.go('calendar', {...app.state.route.params, ...params}, {keepScroll: true});
  app.on('cal.mode', el => go({mode: el.dataset.mode}));
  app.on('cal.allDay', () => app.setUi('calendar', s => ({allDayOpen: !s.allDayOpen})));
  app.on('cal.shift', el => { const s = app.state; go({date: shift(mode(s), anchor(s), Number(el.dataset.delta))}); });
  app.on('cal.today', () => go({date: app.today}));
  app.on('cal.jump', el => { if (isDate(el.value)) go({date: el.value}); });
  app.on('cal.select', el => go({date: el.dataset.date}));
  app.on('cal.pick', el => go({date: el.dataset.date, mode: 'day'}));
  app.on('cal.new', el => app.getView('editor').openEvent(app, '', el.dataset.date));

  // Click an empty slot in the hour grid to create an item at that time.
  document.addEventListener('click', event => {
    const col = event.target.closest?.('.tgrid-col');
    if (!col || event.target.closest('.block') || app.overlays.any()) return;
    const rect = col.getBoundingClientRect(), hourH = Number(col.dataset.hourH), first = Number(col.dataset.first);
    const m = Math.max(0, Math.min(1410, Math.floor(((event.clientY - rect.top) / hourH * 60 + first * 60) / 30) * 30));
    app.getView('editor').openEvent(app, '', col.dataset.slotDate, {preset: {start: clock(m), end: clock(Math.min(m + 60, 1439)), date: col.dataset.slotDate}});
  });
  // Swipe left/right on compact calendars to move between ranges.
  let swipe = null;
  document.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch' || app.state.route.view !== 'calendar' || !event.target.closest('.tgrid, .mgrid')) { swipe = null; return; } swipe = {x: event.clientX, y: event.clientY, t: Date.now()}; }, {passive: true});
  document.addEventListener('pointerup', event => {
    if (!swipe) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y, quick = Date.now() - swipe.t < 600;
    swipe = null;
    if (quick && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.8) { const s = app.state; go({date: shift(mode(s), anchor(s), dx < 0 ? 1 : -1)}); }
  }, {passive: true});
  // Keep the pool visible on entry; scrolling to "now" would hide it on phones.
}

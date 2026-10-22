// 成长: what got done, how the week is going, the garden built from real
// completions, small habits, and actual-vs-planned work hours.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {weekRecords, totalXP, achievements, completionStreak, setGoal} from '../domain/progress.js';
import {addDays, weekOf, WEEKDAYS, weekdayIndex, shortDate, relativeDay} from '../lib/dates.js';
import {workHoursBounds, workHoursUsage, workHoursCsv} from '../domain/work-hours.js';
import {ring} from './habits.js';
import {downloadText} from '../lib/download.js';

const TABS = [['overview', '概览', 'chart'], ['garden', '花园', 'leaf'], ['habits', '习惯', 'heart'], ['hours', '工作时长', 'clock']];
const PERIODS = [['today', '今天'], ['week', '本周'], ['month', '本月'], ['all', '全部']];
const MOMENT_ICON = {complete: 'check', goal: 'flag', badge: 'sparkle', habit: 'heart', closure: 'heart', streak: 'sparkle', progress: 'plus', undo: 'undo'};

export function registerGrowth(app) {
  const ui = () => ({offset: 0, day: null, mode: 'day', limit: 6, period: 'month', group: 'item', ...app.ui('growth')});
  const tabOf = state => TABS.some(([id]) => id === state.route.params.tab) ? state.route.params.tab : 'overview';

  function hero(state) {
    const progress = state.doc.progress, goal = progress.goal || 15;
    const week = weekRecords(progress, state.today).length, xp = totalXP(progress);
    const level = Math.floor(xp / 100) + 1, levelRatio = (xp % 100) / 100;
    const streak = completionStreak(progress, state.today);
    return html`<section class="growth-hero">
  <div class="gh-ring">${ring(week / goal, 132)}<div class="gh-ring-copy"><b class="num">${week}</b><span>/ ${goal} 项</span></div></div>
  <div class="gh-copy">
    <h2>${week >= goal ? '本周目标达成啦！' : '本周还差 ' + (goal - week) + ' 项'}</h2>
    <p class="small">完成日程或待办都会计入，撤销完成会一起扣除。</p>
    <div class="gh-stats">
      <span class="stat"><b>${streak}</b>天连续完成</span>
      <span class="stat"><b>Lv.${level}</b><i class="gh-level"><i style="${'width:' + Math.round(levelRatio * 100) + '%'}"></i></i>${xp} XP</span>
    </div>
    <button type="button" class="btn btn-quiet btn-sm" data-act="growth.goal">${icon('flag')}调整每周目标</button>
  </div>
</section>`;
  }

  function weekChart(state) {
    const u = ui(), progress = state.doc.progress;
    const days = weekOf(addDays(state.today, u.offset * 7));
    const counts = days.map(d => progress.records.filter(r => r.date === d).length);
    const max = Math.max(3, ...counts);
    const selected = u.day && days.includes(u.day) ? u.day : (days.includes(state.today) ? state.today : days[6]);
    return html`<section class="panel panel-pad growth-week">
  <div class="section-title"><h2>每天完成</h2><span class="spacer"></span>
    <button type="button" class="icon-btn sm" data-act="growth.week" data-delta="-1"${attr('disabled', u.offset <= -8)} aria-label="上一周">${icon('back')}</button>
    <button type="button" class="btn btn-ghost btn-sm" data-act="growth.week" data-delta="0"${attr('disabled', u.offset === 0)}>本周</button>
    <button type="button" class="icon-btn sm" data-act="growth.week" data-delta="1"${attr('disabled', u.offset >= 0)} aria-label="下一周">${icon('forward')}</button>
  </div>
  <div class="gw-bars" role="group" aria-label="${days[0].slice(5) + ' 至 ' + days[6].slice(5) + ' 每天完成数量'}">${days.map((d, i) => html`<button type="button" class="${cx('gw-bar', d === state.today && 'is-today', d === selected && 'is-selected', d > state.today && 'is-future')}" data-act="growth.day" data-date="${d}" aria-pressed="${d === selected ? 'true' : 'false'}" aria-label="${shortDate(d) + '，完成 ' + counts[i] + ' 项'}">
    <span class="gw-num">${counts[i] || ''}</span><i style="${'height:' + Math.max(6, Math.round(counts[i] / max * 96)) + 'px'}"></i><small>周${WEEKDAYS[weekdayIndex(d)]}</small></button>`)}</div>
</section>`;
  }

  function records(state) {
    const u = ui(), all = state.doc.progress.records.slice().sort((a, b) => String(b.doneAt || b.date).localeCompare(String(a.doneAt || a.date)));
    const days = weekOf(addDays(state.today, u.offset * 7));
    const day = u.day && days.includes(u.day) ? u.day : (days.includes(state.today) ? state.today : days[6]);
    const list = u.mode === 'all' ? all : all.filter(r => r.date === day);
    const shown = list.slice(0, u.limit);
    return html`<section class="growth-records">
  <div class="section-title"><h2>做过的事</h2><span class="count">${list.length}</span><span class="spacer"></span>
    <div class="seg" role="group" aria-label="完成记录范围">${[['day', relativeDay(day, state.today) || shortDate(day)], ['all', '全部']].map(([id, label]) => html`<button type="button" data-act="growth.mode" data-mode="${id}" aria-pressed="${u.mode === id ? 'true' : 'false'}">${label}</button>`)}</div></div>
  ${shown.length ? html`<ul class="items mini">${shown.map(r => html`<li class="item record-row" data-key="${'rec-' + r.key}">
    <span class="record-check">${icon('check')}</span>
    <button type="button" class="item-body" data-act="growth.record" data-key="${r.key}"><span class="item-title"><b>${r.title}</b></span><span class="item-meta"><span class="chip">${shortDate(r.date)}</span><span class="chip">${r.kind === 'task' ? '待办' : '日程'}</span>${r.gardenReward ? html`<span class="chip chip-mint">${icon('leaf')}${({tree: '树木', flower: '花', stone: '石头'})[r.gardenReward.kind]}</span>` : ''}</span></button>
    ${icon('forward')}
  </li>`)}</ul>` : html`<div class="empty compact"><p>${u.mode === 'all' ? '在日程或待办中勾选完成，就会出现在这里。' : day > state.today ? '这一天还没到，先过好今天。' : '这一天没有完成记录，可以点其他日期看看。'}</p></div>`}
  ${list.length > shown.length ? html`<button type="button" class="btn btn-ghost btn-block" data-act="growth.more">再看 ${Math.min(6, list.length - shown.length)} 项</button>` : ''}
</section>`;
  }

  function badges(state) {
    const list = achievements(state.doc.progress, state.today);
    return html`<section class="panel panel-pad growth-badges">
  <div class="section-title"><h2>小成就</h2><span class="count">${list.filter(a => a.on).length}/${list.length}</span></div>
  <ul class="badge-grid">${list.map(a => html`<li class="${cx('badge', a.on && 'is-on')}"><span class="badge-medal">${icon(a.on ? 'sparkle' : 'lock')}</span><b>${a.name}</b><small>${a.detail}</small></li>`)}</ul>
</section>`;
  }

  function moments(state) {
    const list = (state.doc.progress.feedback || []).filter(m => m.type !== 'undo').slice(0, 5);
    if (!list.length) return '';
    return html`<section class="panel panel-pad growth-moments">
  <div class="section-title"><h2>最近的小时刻</h2></div>
  <ol class="moment-list">${list.map(m => html`<li class="${'moment-' + m.type}"><span>${icon(MOMENT_ICON[m.type] || 'check')}</span><div><b>${m.title}</b><small>${shortDate(m.date)}，${m.detail}</small></div></li>`)}</ol>
</section>`;
  }

  function hours(state) {
    const u = ui(), bounds = workHoursBounds(state.today, u.period);
    const focus = app.getView('focus');
    return html`<section class="panel panel-pad growth-hours">
  <div class="section-title"><h2>计划与实际</h2><span class="spacer"></span><button type="button" class="btn btn-quiet btn-sm" data-act="focus.exportCsv" data-period="${u.period}" data-group="${u.group}">${icon('download')}导出 CSV</button></div>
  <div class="row wrap hours-controls">
    <div class="seg" role="group" aria-label="分组">${[['item', '按事项'], ['day', '按日期']].map(([id, label]) => html`<button type="button" data-act="growth.group" data-group="${id}" aria-pressed="${u.group === id ? 'true' : 'false'}">${label}</button>`)}</div>
    <div class="seg" role="group" aria-label="统计范围">${PERIODS.map(([id, label]) => html`<button type="button" data-act="growth.period" data-period="${id}" aria-pressed="${u.period === id ? 'true' : 'false'}">${label}</button>`)}</div>
  </div>
  ${focus.usageTable(state, bounds, u.group)}
</section>
${plannedSummary(state, bounds, u)}`;
  }

  // Planned hours from completion snapshots, same rules as the mini program.
  function plannedSummary(state, bounds, u) {
    const report = workHoursUsage(state.doc.progress.records, {...bounds, group: u.group});
    return html`<section class="panel panel-pad growth-planned">
  <div class="section-title"><h2>完成计划时长</h2><span class="spacer"></span><button type="button" class="btn btn-quiet btn-sm" data-act="growth.plannedCsv">${icon('download')}导出明细</button></div>
  <div class="pi-metrics">
    <div><span>累计计划时长</span><b>${(report.totalMinutes / 60).toFixed(2)}<small> 小时</small></b><small>${report.trackedCount} 项日程有时长</small></div>
    <div><span>完成次数</span><b>${report.recordCount}<small> 项</small></b><small>${report.unknownCount ? report.unknownCount + ' 项待办未记录时长，不做推算' : '全部有记录时长'}</small></div>
  </div>
  <p class="hint">按完成时的快照统计；之后修改事项不会改写历史。</p>
</section>`;
  }

  app.view('growth', {
    render(state) {
      const tab = tabOf(state);
      const tabs = html`<div class="seg growth-tabs" role="tablist" aria-label="成长">${TABS.map(([id, label, ic]) => html`<button type="button" role="tab" data-act="growth.tab" data-tab="${id}" aria-selected="${tab === id ? 'true' : 'false'}">${icon(ic)}${label}</button>`)}</div>`;
      let body;
      if (tab === 'garden') body = app.getView('garden').section(state);
      else if (tab === 'habits') body = app.getView('habits').section(state);
      else if (tab === 'hours') body = hours(state);
      else body = html`<div class="growth-grid">
  <div class="growth-col">${hero(state)}${weekChart(state)}${records(state)}</div>
  <div class="growth-col">${app.getView('garden').preview(state)}${badges(state)}${moments(state)}</div>
</div>`;
      return {title: '成长', subtitle: state.layout.compact ? '' : '每一份积累，都来自演示中完成的事', body: html`<div class="${'growth tab-' + tab}">${tabs}${body}</div>`};
    },
  });

  app.on('growth.tab', el => app.go('growth', el.dataset.tab === 'overview' ? {} : {tab: el.dataset.tab}));
  app.on('growth.week', el => { const d = Number(el.dataset.delta); app.setUi('growth', s => ({offset: d === 0 ? 0 : Math.max(-8, Math.min(0, (s.offset || 0) + d)), day: null, limit: 6})); });
  app.on('growth.day', el => app.setUi('growth', {day: el.dataset.date, mode: 'day', limit: 6}));
  app.on('growth.mode', el => app.setUi('growth', {mode: el.dataset.mode, limit: 6}));
  app.on('growth.more', () => app.setUi('growth', s => ({limit: (s.limit || 6) + 6})));
  app.on('growth.period', el => app.setUi('growth', {period: el.dataset.period}));
  app.on('growth.group', el => app.setUi('growth', {group: el.dataset.group}));
  app.on('growth.record', el => {
    const record = app.state.doc.progress.records.find(r => r.key === el.dataset.key);
    if (!record) return;
    app.setUi('garden', {detail: record.key, selected: null, page: record.gardenReward?.scene ?? null});
    app.go('growth', {tab: 'garden'});
  });
  app.on('growth.plannedCsv', () => {
    const u = ui(), report = workHoursUsage(app.state.doc.progress.records, {...workHoursBounds(app.today, u.period), group: u.group});
    downloadText(workHoursCsv(report.rows, app.user.username, u.group), '计划时长-' + app.today + '.csv', 'text/csv;charset=utf-8');
  });
  app.on('growth.goal', () => {
    app.overlays.show('goal', {size: 'small', label: '每周目标', focus: 'input', render: state => frame({
      title: '每周目标',
      body: html`<form id="goal-form" class="stack" data-submit="growth.saveGoal"><label class="field">每周完成多少项<input class="input" type="number" name="goal" min="1" max="100" required value="${state.doc.progress.goal || 15}" data-uncontrolled></label><p class="hint">1–100 项。日程和待办的完成都会计入。</p></form>`,
      foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="goal-form" class="btn btn-primary">保存</button>`,
    })});
  });
  app.on('growth.saveGoal', form => {
    const goal = Math.round(Number(form.elements.goal.value));
    app.commit(draft => setGoal(draft.progress, goal), {message: '每周目标已更新', detail: goal + ' 项', iconName: 'flag'});
    app.overlays.close('goal');
  });
}

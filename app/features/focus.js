// Local-only focus timer and review, backed by browser storage.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {focusCore} from '../core.js';
import {request} from '../data/api.js';
import {downloadText} from '../lib/download.js';
import {companionStage} from './companion.js';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
const MODES = [['pomodoro', '番茄钟', 'focus'], ['stopwatch', '正计时', 'clock'], ['break', '休息', 'cup']];
const QUICK = [15, 25, 45, 60];
export const minutesLabel = ms => (ms / 60000).toLocaleString('zh-CN', {maximumFractionDigits: 1}) + ' 分钟';

// Work-hours windows (today / this week / this month / all) live with the
// planned-hours rules so the web and mini program share one definition.
export {workHoursBounds} from '../domain/work-hours.js';
import {workHoursBounds} from '../domain/work-hours.js';

export function registerFocus(app) {
  const pendingKey = 'tt-focus-pending:' + app.user.id;
  let rev = 0, lastVersion = -1, lastBusy = false;
  const client = focusCore.controller({
    request: body => request('local:focus', body),
    uuid: () => crypto.randomUUID(),
    monotonic: () => performance.now(),
    loadPending: () => { try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; } },
    savePending: value => { try { if (value) localStorage.setItem(pendingKey, JSON.stringify(value)); else localStorage.removeItem(pendingKey); } catch {} },
    onChange: view => {
      const changed = view.state?.version !== lastVersion || view.busy !== lastBusy;
      lastVersion = view.state?.version; lastBusy = view.busy;
      if (changed) app.setUi('focus', {rev: ++rev});
      tick();
    },
  });
  const ui = () => ({mode: 'pomodoro', minutes: 25, eventId: '', reviewPeriod: 'day', reviewDate: today(), reviewDraft: null, reviewVersion: null, ...app.ui('focus')});
  const today = () => focusCore.dateAt(client.view().now || Date.now(), ZONE);
  const snapshot = () => client.view();
  const active = () => { const v = client.view(); return v.state && focusCore.active(v.state); };

  // Live clock: update text and the ring without a full render.
  function tick() {
    const v = client.view(), s = v.state && focusCore.active(v.state);
    for (const el of document.querySelectorAll('[data-focus-message]')) el.textContent = v.message || '仅本机计时，暂停期间不计时';
    if (!s) return;
    const ms = focusCore.elapsed(s, v.now), capped = ms >= focusCore.limit(s);
    const text = focusCore.format(s.mode === 'stopwatch' ? ms : Math.max(0, s.targetMs - ms));
    for (const el of document.querySelectorAll('[data-focus-clock]')) el.textContent = text;
    const ratio = s.mode === 'stopwatch' ? (ms % 3600000) / 3600000 : Math.min(1, ms / s.targetMs);
    for (const el of document.querySelectorAll('[data-focus-ring]')) el.style.strokeDashoffset = String(100 - ratio * 100);
    const phase = capped ? '本段计时已到，请结束保存' : s.status === 'paused' ? '已暂停，暂停时间不计入' : '进行中，可以离开页面，稍后回来';
    for (const el of document.querySelectorAll('[data-focus-phase]')) el.textContent = phase;
  }
  setInterval(tick, 1000);
  setInterval(() => { if (!document.hidden) client.refresh(); }, 5000);
  window.addEventListener('online', () => client.refresh());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) client.refresh(); });
  client.refresh();

  async function send(action, fields = {}) {
    const ok = await client.send(action, fields);
    app.setUi('focus', {rev: ++rev});
    return ok;
  }

  // ----- Hero: the timer -----------------------------------------------------
  function dial(text, ratio, {live = false, label = ''} = {}) {
    return html`<div class="dial" role="timer" aria-label="${label}">
  <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="dial-track" cx="60" cy="60" r="52"/><circle class="dial-arc" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100 100" transform="rotate(-90 60 60)" style="${'stroke-dashoffset:' + (100 - ratio * 100)}"${live ? html` data-focus-ring` : ''}/></svg>
  <b class="dial-time num"${live ? html` data-focus-clock` : ''}>${text}</b>
</div>`;
  }
  function statusLine(v) {
    return html`<p class="focus-status" role="status"><i class="dot" data-tone="${!v.online ? 'offline' : v.pending ? 'error' : v.busy ? 'saving' : 'ok'}"></i><span data-focus-message>${v.message || '仅本机计时，暂停期间不计时'}</span>${v.pending ? html`<button type="button" class="link-btn" data-act="focus.cmd" data-cmd="retry"${attr('disabled', v.busy)}>重试上次操作</button>` : ''}</p>`;
  }
  function hero(state) {
    const v = client.view(), s = v.state && focusCore.active(v.state), u = ui();
    const disabled = v.busy || v.pending;
    if (!v.state) return html`<section class="focus-hero is-offline"><div class="focus-hero-copy"><h2>连接专注记录</h2>${statusLine(v)}<button type="button" class="btn btn-primary" data-act="focus.cmd" data-cmd="refresh"${attr('disabled', v.busy)}>${icon('sync')}重新连接</button></div></section>`;
    if (!s) {
      const tasks = state.doc.schedule.events.filter(e => !e.deletedAt && (e.type === 'task' || e.date >= state.today || e.type !== 'once'));
      const preview = u.mode === 'stopwatch' ? '00:00:00' : focusCore.format(u.minutes * 60000);
      return html`<section class="focus-hero">
  <form class="focus-start" data-submit="focus.start">
    <div class="focus-hero-top">
      <div class="seg focus-modes" role="group" aria-label="计时方式">${MODES.map(([id, label, ic]) => html`<button type="button" data-act="focus.mode" data-mode="${id}" aria-pressed="${u.mode === id ? 'true' : 'false'}">${icon(ic)}${label}</button>`)}</div>
    </div>
    <div class="focus-stage">
      ${dial(preview, u.mode === 'stopwatch' ? 0 : 1, {label: '准备开始：' + preview})}
      <span class="focus-buddy">${companionStage(state, app, 'md', 'focus')}</span>
    </div>
    ${u.mode !== 'stopwatch' ? html`<div class="focus-length"><div class="quick-dates" role="group" aria-label="常用时长">${(u.mode === 'break' ? [5, 10, 15] : QUICK).map(n => html`<button type="button" class="chip-btn" data-act="focus.minutes" data-minutes="${n}" aria-pressed="${u.minutes === n ? 'true' : 'false'}">${n} 分钟</button>`)}</div>
      <label class="field focus-minutes">自定义<input class="input" type="number" name="minutes" min="1" max="180" value="${u.minutes}" data-change="focus.minutesInput" required><small>分钟，1–180</small></label></div>` : html`<p class="hint focus-note">正计时最多记录 12 小时，到时请结束保存。</p>`}
    ${u.mode !== 'break' ? html`<label class="field">关联事项<select class="select" name="eventId" data-change="focus.task"><option value="">自由专注</option>${tasks.map(e => html`<option value="${e.id}"${attr('selected', u.eventId === e.id)}>${e.title}</option>`)}</select></label>` : ''}
    <button type="submit" class="btn btn-primary btn-lg btn-block"${attr('disabled', disabled)}>${icon(u.mode === 'break' ? 'cup' : 'play')}开始${u.mode === 'break' ? '休息' : '专注'}</button>
  </form>
  ${statusLine(v)}
</section>`;
    }
    const ms = focusCore.elapsed(s, v.now), capped = ms >= focusCore.limit(s);
    const text = focusCore.format(s.mode === 'stopwatch' ? ms : Math.max(0, s.targetMs - ms));
    const ratio = s.mode === 'stopwatch' ? (ms % 3600000) / 3600000 : Math.min(1, ms / s.targetMs);
    return html`<section class="${cx('focus-hero', 'is-active', s.status === 'paused' && 'is-paused', s.mode === 'break' && 'is-break')}">
  <p class="focus-kind">${icon(s.mode === 'break' ? 'cup' : s.mode === 'pomodoro' ? 'focus' : 'clock')}${s.mode === 'break' ? '休息' : s.mode === 'pomodoro' ? '番茄钟' : '正计时'}<span>${s.device || '一台设备'}控制</span></p>
  <h2 class="focus-title">${s.title}</h2>
  <div class="focus-stage">
    ${dial(text, ratio, {live: true, label: s.title + '，' + text})}
    <span class="focus-buddy">${companionStage(state, app, 'md', 'focus')}</span>
  </div>
  <p class="focus-phase" data-focus-phase>${capped ? '本段计时已到，请结束保存' : s.status === 'paused' ? '已暂停，暂停时间不计入' : '进行中，可以离开页面，稍后回来'}</p>
  <div class="focus-actions">
    ${!v.state.canControl ? html`<button type="button" class="btn btn-primary btn-lg" data-act="focus.cmd" data-cmd="takeover"${attr('disabled', disabled)}>${icon('phone')}在这台设备接管</button>` : html`
      ${!capped ? html`<button type="button" class="btn btn-quiet btn-lg" data-act="focus.cmd" data-cmd="${s.status === 'running' ? 'pause' : 'resume'}"${attr('disabled', disabled)}>${icon(s.status === 'running' ? 'pause' : 'play')}${s.status === 'running' ? '暂停' : '继续'}</button>` : ''}
      <button type="button" class="btn btn-primary btn-lg" data-act="focus.cmd" data-cmd="finish"${attr('disabled', disabled)}>${icon('stop')}结束${s.mode === 'break' ? '休息' : '并保存'}</button>`}
  </div>
  ${statusLine(v)}
  <p class="hint">休息不计入专注时长。结束专注后，事项仍由你勾选完成。</p>
</section>`;
  }

  // ----- Review and history --------------------------------------------------
  function review(state) {
    const v = client.view(), st = v.state;
    if (!st) return '';
    const u = ui();
    const bounds = focusCore.bounds(u.reviewDate, u.reviewPeriod), report = focusCore.report(st, bounds);
    const saved = st.reviews.find(r => r.id === u.reviewPeriod + ':' + bounds.from);
    const records = state.doc.progress.records.filter(r => r.date >= bounds.from && r.date <= bounds.to);
    const planned = records.reduce((sum, r) => sum + (r.minutes || 0), 0);
    const days = Array.from({length: u.reviewPeriod === 'day' ? 1 : 7}, (_, i) => { const d = new Date(bounds.from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); const date = d.toISOString().slice(0, 10); return {date, ms: report.days.find(r => r.date === date)?.ms || 0}; });
    const max = Math.max(60000, ...days.map(d => d.ms));
    const conflict = v.conflict === 'review' && u.reviewDraft !== null;
    return html`<section class="panel panel-pad focus-review">
  <div class="section-title"><h2>回顾</h2><span class="spacer"></span><div class="seg" role="group" aria-label="回顾周期">${[['day', '日回顾'], ['week', '周回顾']].map(([id, label]) => html`<button type="button" data-act="focus.period" data-period="${id}" aria-pressed="${u.reviewPeriod === id ? 'true' : 'false'}">${label}</button>`)}</div></div>
  <label class="field focus-date">回顾日期<input class="input" type="date" max="${today()}" value="${u.reviewDate}" data-change="focus.reviewDate"><small>${bounds.from === bounds.to ? bounds.from : bounds.from + ' 至 ' + bounds.to}</small></label>
  <div class="focus-metrics">
    <div><span>实际专注</span><b>${minutesLabel(report.totalMs)}</b></div>
    <div><span>完成事项</span><b>${records.length} 项</b></div>
    <div><span>完成计划</span><b>${minutesLabel(planned * 60000)}</b></div>
  </div>
  ${days.length > 1 ? html`<div class="focus-bars" role="img" aria-label="${'每日实际专注：' + days.map(d => d.date.slice(5) + ' ' + minutesLabel(d.ms)).join('，')}">${days.map(d => html`<div class="${cx('focus-bar', d.date === today() && 'is-today')}"><span>${d.ms ? Math.round(d.ms / 60000) : ''}</span><i style="${'height:' + Math.max(4, Math.round(d.ms / max * 84)) + 'px'}"></i><small>${d.date.slice(5).replace('-', '/')}</small></div>`)}</div>` : ''}
  ${conflict ? html`<div class="callout callout-warn" role="alert">${icon('alert')}<div><b>回顾已在另一端修改</b><p>本地内容：${saved?.text || '（空）'}</p><div class="actions"><button type="button" class="btn btn-quiet btn-sm" data-act="focus.reviewRemote">采用本地回顾</button><button type="button" class="btn btn-quiet btn-sm" data-act="focus.reviewLocal">用下方草稿覆盖</button></div></div></div>` : ''}
  <form class="stack" data-submit="focus.review">
    <label class="field">留下回顾<textarea class="textarea" name="text" rows="3" maxlength="2000" data-uncontrolled data-input="focus.reviewDraft" placeholder="今天推进了什么，下次想怎样调整？">${u.reviewDraft ?? saved?.text ?? ''}</textarea></label>
    <div class="row"><span class="hint">回顾仅本机保存；计时结束和任务完成分别记录。</span><span class="spacer"></span><button type="submit" class="btn btn-quiet"${attr('disabled', v.busy || v.pending)}>${icon('save')}保存回顾</button></div>
  </form>
</section>`;
  }
  function history() {
    const st = client.view().state;
    if (!st) return '';
    const u = ui(), bounds = focusCore.bounds(u.reviewDate, u.reviewPeriod);
    const list = st.sessions.filter(s => s.status === 'finished' && s.mode !== 'break' && focusCore.daily(s).some(d => d.date >= bounds.from && d.date <= bounds.to)).slice().reverse();
    return html`<section class="focus-history">
  <div class="section-title"><h2>专注记录</h2><span class="count">${list.length}</span></div>
  ${list.length ? html`<ul class="items mini">${list.slice(0, 30).map(s => html`<li class="item focus-session" data-key="${'fs-' + s.id}">
    <span class="focus-session-icon">${icon(s.mode === 'pomodoro' ? 'focus' : 'clock')}</span>
    <div class="item-body"><span class="item-title"><b>${s.title}</b></span><span class="item-meta"><span class="chip">${focusCore.dateAt(s.startedAt, s.timezone)}</span><span class="chip chip-mint">${minutesLabel(focusCore.actual(s))}</span>${s.timezone !== ZONE ? html`<span class="chip chip-outline">${s.timezone}</span>` : ''}</span>
    ${s.corrections.length ? html`<details class="focus-corrections"><summary>已修正 ${s.corrections.length} 次</summary>${s.corrections.map(c => html`<p>${new Date(c.at).toLocaleString('zh-CN')}：${minutesLabel(c.fromMs)} → ${minutesLabel(c.toMs)}<br>${c.reason}</p>`)}</details>` : ''}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-act="focus.correct" data-id="${s.id}">${icon('edit')}修正</button>
  </li>`)}</ul>${list.length > 30 ? html`<p class="hint">显示最近 30 段；时间汇总包含全部记录。</p>` : ''}` : html`<div class="empty compact"><div class="empty-mark">${icon('clock')}</div><h3>还没有专注记录</h3><p>结束第一段专注后，这里会保存实际用时。</p></div>`}
</section>`;
  }

  // Actual vs planned table (also used by the growth page's 工作时长 tab).
  function usage(state, bounds, group = 'item') {
    const st = client.view().state || {sessions: []};
    const rows = focusCore.compare(st, state.doc.progress.records, {...bounds, group});
    const totals = rows.reduce((a, r) => ({planned: a.planned + r.planned, ms: a.ms + r.ms}), {planned: 0, ms: 0});
    return {rows, totals, csv: () => focusCore.csv(rows)};
  }
  function usageTable(state, bounds, group) {
    const {rows, totals} = usage(state, bounds, group);
    return html`<div class="table-scroll"><table class="hours-table">
  <thead><tr><th scope="col">${group === 'day' ? '日期' : '事项'}</th><th scope="col">已完成事项的计划时长</th><th scope="col">已保存的实际专注</th></tr></thead>
  <tbody>${rows.length ? rows.slice(0, 50).map(r => html`<tr><th scope="row">${r.title}</th><td>${minutesLabel(r.planned * 60000)}</td><td>${minutesLabel(r.ms)}</td></tr>`) : html`<tr><td colspan="3" class="muted">这段时间还没有记录。</td></tr>`}</tbody>
  <tfoot><tr><th scope="row">合计</th><td>${minutesLabel(totals.planned * 60000)}</td><td>${minutesLabel(totals.ms)}</td></tr></tfoot>
</table></div>
<p class="hint">${rows.length > 50 ? '仅显示前 50 行，导出包含全部明细。' : ''}计划来自完成快照；实际只统计已结束的专注，按计时开始时的时区拆分跨日时段。</p>`;
  }

  // ----- Corrections dialog ---------------------------------------------------
  function openCorrection(id) {
    const version = client.view().state?.version;
    app.overlays.show('focus-correct', {size: 'small', label: '修正专注记录', render: () => {
      const s = client.view().state?.sessions.find(x => x.id === id);
      if (!s) return null;
      const v = client.view();
      return frame({title: '修正专注记录', subtitle: s.title,
        body: html`<form id="focus-correct-form" class="stack" data-submit="focus.saveCorrection" data-id="${s.id}" data-version="${version}">
  <label class="field">实际时长（分钟）<input class="input" name="minutes" type="number" min="0" max="720" step="0.01" value="${(focusCore.actual(s) / 60000).toFixed(2)}" required data-uncontrolled></label>
  <label class="field">修正原因<input class="input" name="reason" maxlength="200" required data-uncontrolled placeholder="例如：中途离开忘了暂停"></label>
  <p class="hint">保留原始计时及每次修正。填 0 可取消这段用时。</p>
  ${v.conflict === 'correct' ? html`<p class="form-error" role="alert">这条记录已在另一端更新，请载入最新时长后再保存。</p>` : ''}
</form>`,
        foot: html`<button type="button" class="btn btn-ghost left" data-act="focus.reloadCorrection" data-id="${s.id}">载入最新时长</button><button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="focus-correct-form" class="btn btn-primary"${attr('disabled', v.busy)}>保存修正</button>`});
    }});
  }

  // ----- View -----------------------------------------------------------------
  app.view('focus', {
    snapshot,
    usage, usageTable,
    // Small "专注中" pill for the top bar on other pages.
    pill(state) {
      const s = active();
      if (!s || state.route.view === 'focus') return '';
      const v = client.view(), ms = focusCore.elapsed(s, v.now);
      return html`<button type="button" class="${cx('focus-pill', s.status === 'paused' && 'is-paused')}" data-act="nav.go" data-view="focus" aria-label="${'回到计时：' + s.title}">${icon(s.mode === 'break' ? 'cup' : 'focus')}<b class="num" data-focus-clock>${focusCore.format(s.mode === 'stopwatch' ? ms : Math.max(0, s.targetMs - ms))}</b></button>`;
    },
    prepare(_app, eventId) { app.setUi('focus', {eventId: eventId || '', mode: 'pomodoro', minutes: ui().minutes || 25}); app.go('focus'); },
    render(state) {
      return {
        title: '专注',
        subtitle: state.layout.compact ? '' : '留一段时间，做一件事',
        actions: state.layout.compact ? '' : html`<button type="button" class="btn btn-ghost" data-act="focus.export">${icon('download')}导出原始记录</button><button type="button" class="btn btn-ghost" data-act="nav.go" data-view="growth" data-params='{"tab":"hours"}'>${icon('chart')}工作时长</button>`,
        body: html`<div class="focus-page">
  <div class="focus-main">${hero(state)}${history()}</div>
  <aside class="focus-side">${review(state)}
    ${state.layout.compact ? html`<div class="row wrap"><button type="button" class="btn btn-quiet btn-sm" data-act="focus.export">${icon('download')}导出原始记录</button><button type="button" class="btn btn-quiet btn-sm" data-act="nav.go" data-view="growth" data-params='{"tab":"hours"}'>${icon('chart')}工作时长</button></div>` : ''}
  </aside>
</div>`,
      };
    },
  });

  app.on('focus.mode', el => app.setUi('focus', {mode: el.dataset.mode, minutes: el.dataset.mode === 'break' ? 5 : 25}));
  app.on('focus.minutes', el => app.setUi('focus', {minutes: Number(el.dataset.minutes)}));
  app.on('focus.minutesInput', el => { const n = Math.round(Number(el.value)); if (n >= 1 && n <= 180) app.setUi('focus', {minutes: n}); });
  app.on('focus.task', el => app.setUi('focus', {eventId: el.value}));
  app.on('focus.start', async form => {
    const u = ui(), minutes = Math.round(Number(form.elements.minutes?.value || u.minutes));
    if (u.mode !== 'stopwatch' && !(minutes >= 1 && minutes <= 180)) { app.toast('倒计时请填 1–180 分钟。', {tone: 'error'}); return; }
    form.dataset.busy = 'true';
    const ok = await send('start', {mode: u.mode, ...(u.mode !== 'stopwatch' ? {minutes} : {}), eventId: u.mode === 'break' ? '' : (form.elements.eventId?.value || ''), timezone: ZONE, sessionId: crypto.randomUUID()});
    form.dataset.busy = 'false';
    if (ok && u.mode !== 'break') app.getView('companion')?.say?.('开始专注！我在旁边陪你。');
  });
  app.on('focus.cmd', async el => {
    const cmd = el.dataset.cmd;
    if (cmd === 'refresh') { await client.refresh(); return; }
    const s = active();
    const ok = await send(cmd, s ? {sessionId: s.id} : {});
    if (ok && cmd === 'finish' && s?.mode !== 'break') { app.toast('专注已保存', {detail: s.title + '，' + minutesLabel(focusCore.elapsed(s, client.view().now)), iconName: 'focus'}); app.getView('companion')?.say?.('辛苦啦，休息一下吧～'); }
  });
  app.on('focus.period', el => app.setUi('focus', {reviewPeriod: el.dataset.period, reviewDraft: null, reviewVersion: null}));
  app.on('focus.reviewDate', el => { if (el.value) app.setUi('focus', {reviewDate: el.value, reviewDraft: null, reviewVersion: null}); });
  app.on('focus.reviewDraft', el => {
    const u = ui();
    app.store.set('ui', all => ({...all, focus: {...u, reviewDraft: el.value, reviewVersion: u.reviewDraft === null ? client.view().state?.version : u.reviewVersion}}));
  });
  app.on('focus.reviewRemote', () => { app.setUi('focus', {reviewDraft: null, reviewVersion: null}); for (const t of document.querySelectorAll('.focus-review textarea')) t.value = ''; });
  app.on('focus.reviewLocal', () => app.setUi('focus', {reviewVersion: client.view().state?.version}));
  app.on('focus.review', async form => {
    const u = ui();
    const ok = await send('review', {period: u.reviewPeriod, date: u.reviewDate, timezone: ZONE, version: u.reviewVersion ?? client.view().state?.version, text: form.elements.text.value});
    if (ok) { app.setUi('focus', {reviewDraft: null, reviewVersion: null}); app.toast('回顾已保存', {iconName: 'save'}); }
  });
  app.on('focus.correct', el => openCorrection(el.dataset.id));
  app.on('focus.reloadCorrection', el => { app.overlays.close('focus-correct', {restoreFocus: false}); setTimeout(() => openCorrection(el.dataset.id), 340); });
  app.on('focus.saveCorrection', async form => {
    const fields = new FormData(form);
    const ok = await send('correct', {sessionId: form.dataset.id, version: Number(form.dataset.version), seconds: Math.round(Number(fields.get('minutes')) * 60), reason: String(fields.get('reason') || '')});
    if (ok) { app.overlays.close('focus-correct'); app.toast('专注记录已修正'); }
    else app.overlays.refresh();
  });
  app.on('focus.export', () => {
    const st = client.view().state;
    if (!st) { app.toast('专注记录尚未连接。', {tone: 'error'}); return; }
    downloadText(JSON.stringify({schema: 'tt-focus-export-v1', ...st}, null, 2), '专注原始记录-' + today() + '.json', 'application/json;charset=utf-8');
  });
  app.on('focus.exportCsv', el => {
    const {csv} = usage(app.state, workHoursBounds(app.today, el.dataset.period || 'month'), el.dataset.group || 'item');
    downloadText(csv(), '实际专注-' + today() + '.csv', 'text/csv;charset=utf-8');
  });
}

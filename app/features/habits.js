// 小习惯: up to six small daily habits. Each tap records one step; undo
// removes the last step that was actually recorded. History keeps the goal
// each day was recorded against.
import {html, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {changeHabit, saveHabit, dailyHabits, habitValue, habitClosed, habitEntry, habitStreak, dayClosed} from '../domain/progress.js';
import {addDays, WEEKDAYS, weekdayIndex} from '../lib/dates.js';
import {uid} from '../domain/items.js';

const COLORS = [['blue', '天蓝'], ['sage', '薄荷'], ['rose', '樱粉'], ['peach', '橘子']];
const MAX = 6;

export function ring(ratio, size = 40) {
  return html`<svg class="ring" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-track"/><circle cx="18" cy="18" r="15" class="ring-arc" pathLength="100" stroke-dasharray="100 100" style="${'stroke-dashoffset:' + (100 - Math.min(1, ratio) * 100)}" transform="rotate(-90 18 18)"/></svg>`;
}

export function registerHabits(app) {
  function add(id, sign = 1) {
    const today = app.today;
    const habit = app.state.doc.progress.habits?.items?.find(h => h.id === id);
    if (!habit) return;
    let result;
    const before = habitValue(app.state.doc.progress, habit, today);
    app.commit(draft => { result = changeHabit(draft.progress, id, sign, today); }, {quiet: true});
    if (!result?.changed) return;
    if (sign < 0) { app.toast('已撤销一次记录', {detail: habit.name, iconName: 'undo'}); return; }
    const value = habitValue(app.state.doc.progress, habit, today);
    if (result.dayMoment) { app.toast('今天的圆，合上了', {detail: '所有小习惯都完成啦', iconName: 'heart', action: {label: '撤销', run: () => app.attempt(() => add(id, -1))}}); app.getView('companion')?.celebrate?.(); return; }
    app.toast(result.newlyClosed ? habit.name + '，今天完成了' : habit.name + ' +' + (value - before) , {detail: value + ' / ' + habit.target + ' ' + habit.unit, iconName: result.newlyClosed ? 'check' : 'plus', action: {label: '撤销', run: () => app.attempt(() => add(id, -1))}});
    if (result.newlyClosed) app.getView('companion')?.say?.(habit.name + '完成啦！');
  }

  function editor(id) {
    const progress = app.state.doc.progress;
    const habit = id ? progress.habits?.items?.find(h => h.id === id) : null;
    if (!habit && (progress.habits?.items?.length || 0) >= MAX) { app.toast('先照顾好这 6 个小习惯，已有目标可以继续调整。'); return; }
    app.overlays.show('habit-editor', {size: 'small', label: habit ? '调整习惯' : '添加小习惯', focus: 'input[name="name"]', editing: true, render: () => frame({
      title: habit ? '调整习惯' : '添加一个小习惯',
      body: html`<form id="habit-form" class="stack" data-submit="habit.save" data-id="${habit?.id || ''}">
  <label class="field">名称<input class="input" name="name" maxlength="40" required value="${habit?.name || ''}" placeholder="例如：喝水、阅读、拉伸" data-uncontrolled></label>
  <label class="field">一句提醒<input class="input" name="detail" maxlength="80" value="${habit?.detail || ''}" placeholder="可不填" data-uncontrolled></label>
  <div class="field-row">
    <label class="field">每天目标<input class="input" name="target" type="number" min="1" max="500" required value="${habit?.target || 1}" data-uncontrolled></label>
    <label class="field">每次记录<input class="input" name="step" type="number" min="1" max="500" required value="${habit?.step || 1}" data-uncontrolled></label>
    <label class="field">单位<input class="input" name="unit" maxlength="8" value="${habit?.unit || '次'}" data-uncontrolled></label>
  </div>
  <fieldset class="fieldset"><legend>颜色</legend><div class="toggle-chips habit-colors">${COLORS.map(([c, name]) => html`<label class="${'tone-' + c}"><input type="radio" name="color" value="${c}"${attr('checked', (habit?.color || 'blue') === c)} data-uncontrolled><span><i class="habit-dot"></i>${name}</span></label>`)}</div></fieldset>
  ${habit ? html`<p class="hint">修改目标会从今天开始生效；之前的记录保留当天的目标。</p>` : ''}
</form>`,
      foot: html`<button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="submit" form="habit-form" class="btn btn-primary">${habit ? '保存' : '添加'}</button>`,
    })});
  }

  function card(state, habit) {
    const progress = state.doc.progress, today = state.today;
    const value = habitValue(progress, habit, today), closed = habitClosed(progress, habit, today);
    const entry = habitEntry(progress, habit, today);
    const step = Math.min(habit.step, Math.max(1, habit.target - value));
    const days = Array.from({length: 7}, (_, i) => addDays(today, i - 6));
    return html`<li class="${cx('habit-card', 'tone-' + (habit.color || 'blue'), closed && 'is-closed')}" data-key="${'hc-' + habit.id}">
  <div class="habit-ring">${ring(value / habit.target, 64)}<b class="num">${value}</b></div>
  <div class="habit-copy">
    <h3>${habit.name}</h3>
    <p>${value} / ${habit.target} ${habit.unit}${habit.detail ? '，' + habit.detail : ''}</p>
    <ol class="habit-week" aria-label="最近 7 天">${days.map(d => { const e = (progress.habits?.entries || []).find(x => x.habitId === habit.id && x.date === d); const done = e && e.value >= e.goal; return html`<li class="${cx(done && 'is-done', e && !done && e.value > 0 && 'is-part', d === today && 'is-today')}" title="${d + (e ? '：' + e.value + ' / ' + e.goal : '：未记录')}"><i></i><small>${WEEKDAYS[weekdayIndex(d)]}</small></li>`; })}</ol>
  </div>
  <div class="habit-actions">
    <button type="button" class="btn btn-primary habit-plus" data-act="habit.add" data-id="${habit.id}"${attr('disabled', closed)} aria-label="${'记录 ' + habit.name + ' +' + step + habit.unit}">${closed ? icon('check') : '+' + step}</button>
    <div class="row">
      <button type="button" class="icon-btn sm" data-act="habit.undo" data-id="${habit.id}"${attr('disabled', !entry?.value)} aria-label="${'撤销 ' + habit.name + ' 的上一次记录'}" title="撤销上一次">${icon('undo')}</button>
      <button type="button" class="icon-btn sm" data-act="habit.edit" data-id="${habit.id}" aria-label="${'调整 ' + habit.name}" title="调整">${icon('edit')}</button>
    </div>
  </div>
</li>`;
  }

  function section(state) {
    const progress = state.doc.progress, list = dailyHabits(progress, state.today);
    const all = progress.habits?.items || [];
    const closedCount = list.filter(h => habitClosed(progress, h, state.today)).length;
    const streak = habitStreak(progress, state.today);
    return html`<div class="habits">
  <div class="habit-summary">
    <div class="habit-day ${dayClosed(progress, state.today) ? 'is-closed' : ''}">${ring(list.length ? closedCount / list.length : 0, 72)}<b class="num">${closedCount}/${list.length}</b></div>
    <div><h3>${dayClosed(progress, state.today) ? '今天的圆合上啦' : list.length ? '今天还差 ' + (list.length - closedCount) + ' 个' : '还没有小习惯'}</h3><p class="small">${streak ? '已连续 ' + streak + ' 天合圆' : '每天完成全部小习惯，就能合上一个圆。'}</p></div>
    <span class="spacer"></span>
    <button type="button" class="btn btn-quiet" data-act="habit.new"${attr('disabled', all.length >= MAX)}>${icon('plus')}添加习惯</button>
  </div>
  ${list.length ? html`<ul class="habit-list">${list.map(h => card(state, h))}</ul>` : html`<div class="empty"><div class="empty-mark">${icon('heart')}</div><h3>给每天留几个小动作</h3><p>比如喝 6 杯水、读 10 页书。最多 6 个，轻轻松松。</p><button type="button" class="btn btn-primary" data-act="habit.new">${icon('plus')}添加第一个习惯</button></div>`}
  ${all.length >= MAX ? html`<p class="hint">最多保留 6 个习惯，可以调整已有目标。</p>` : ''}
</div>`;
  }

  app.view('habits', {section, add});
  app.on('habit.add', el => add(el.dataset.id, 1));
  app.on('habit.undo', el => add(el.dataset.id, -1));
  app.on('habit.new', () => editor(null));
  app.on('habit.edit', el => editor(el.dataset.id));
  app.on('habit.save', form => {
    const data = Object.fromEntries(new FormData(form));
    const id = form.dataset.id || '';
    app.commit(draft => saveHabit(draft.progress, {...data, id, target: Number(data.target), step: Number(data.step)}, app.today, () => uid('habit')), {message: id ? '习惯已调整' : '已添加习惯', detail: String(data.name || ''), iconName: 'heart'});
    app.overlays.close('habit-editor');
  });
}

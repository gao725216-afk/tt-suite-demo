/* occur.js — 智能工作表领域判定核心（JS 侧单一实现）。
 *
 * 供 mobile-server.mjs / mobile.html / schedule.html / 测试共用，禁止再各自拷贝
 * （历史教训：occursOn 曾在 3 个 JS 端各存一份且已现漂移，其中一份漏了 deadline 截止）。
 *
 * 日程重复规则沿用原协议；以下 task 执行计划字段供云端、网页、小程序共同使用：
 * - weekly: weekday 1=周一..7=周日；可选 weekPattern{start, odd} 单双周（start 所在周为第 1 教学周）
 * - once:   date = "YYYY-MM-DD"
 * - custom: repeat{interval(>=1), unit(day|week|month), start, days[](仅 week), until}
 *           week 未指定 days → 仅起始日的星期几；month 按「几号」匹配（起始日 > 28 时小月自然跳过）
 * - deadline: 日程到该日（含）为止生效；task 为可选的最晚完成日，不会抹掉逾期的执行计划
 * - task:     可先只记录标题；plannedDate 为执行日，plannedStart/End 为可选的执行时间段；
 *             estimatedMinutes 为可选预计耗时（分钟），不代表实际专注时间。
 *             兼容旧 start = 开始日期（YYYY-MM-DD），无 plannedDate 时沿用原日期范围判定。
 *             未安排日期的待办留在清单中，不凭截止日生成日历时间段；
 *             时刻提醒不涉及 task（调用方按类型跳过）
 * - skip: ["YYYY-MM-DD", ...] 例外日期（停课/调休），该事件在这些日期不发生（先于类型判定）
 * - remindLead: 提醒提前分钟数（>=0；0 = 不提醒；缺失/非法回落默认，由 leadMinutes(ev, def) 提供）
 * - isPurgeable/archiveFor: 过期归档判定与归档纯函数（服务端 purgeExpired 接入走共享模块）
 *
 * 双环境（UMD 风格小包装，无依赖）：
 * - Node：require / ESM default import（package.json 无 type，.js 按 CJS 加载，module.exports 生效）
 * - 浏览器 / vm 沙箱：全局 window.TTOccur（页面 <script src="occur.js"> 直引）
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; // Node
  if (root && typeof root === 'object') root.TTOccur = api;               // 浏览器全局 / vm 沙箱全局
  try { if (typeof window !== 'undefined') window.TTOccur = api; } catch (e) {}
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var organizer = typeof module === 'object' && module.exports ? require('./organizer.js') : root && root.TTOrganizer;
  var workspace = typeof module === 'object' && module.exports ? require('./task-workspace.js') : root && root.TTTaskWorkspace;

  // ---------- 基础工具 ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDate(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function isoWeekday(d) { return (d.getDay() + 6) % 7 + 1; } // 周一=1 … 周日=7
  /** 解析 "HH:MM" 为当日分钟数；非法/缺失回落 0（与各端 toMin 容错一致）。 */
  function parseHHMM(hhmm) {
    var p = String(hhmm || '0:0').split(':');
    return (+p[0]) * 60 + (+p[1] || 0);
  }
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  /** 严格日期串校验：YYYY-MM-DD 且为真实日历日期。 */
  function isDateStr(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  }
  /** d 所在教学周的周一（教学周按周一起算）。 */
  function mondayOf(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  // ---------- 单双周（weekPattern，仅 weekly）：以 start 所在周为第 1 教学周 ----------
  // odd=true → 仅单数教学周（1,3,5,…）发生；odd=false → 仅双数教学周（2,4,6,…）发生。
  // start 非法/缺失视为无模式；早于基准周不发生。
  function weekPatternOk(ev, day, preparedMonday) {
    var wp = ev && ev.weekPattern;
    if (!wp || typeof wp !== 'object' || !isDateStr(wp.start)) return true;
    var base = preparedMonday || mondayOf(parseDate(wp.start));
    // Compare calendar dates so the spring clock change cannot turn week 2 into week 1.
    var diff = Math.floor((Date.UTC(day.getFullYear(),day.getMonth(),day.getDate()) - Date.UTC(base.getFullYear(),base.getMonth(),base.getDate())) / 86400000 / 7);
    if (diff < 0) return false; // 早于基准周（termStart 之前）
    var weekNo = diff + 1;
    return (weekNo % 2 === 1) === !!wp.odd;
  }

  // ---------- 事件是否发生在日期 day（Date，本地墙上时间） ----------
  function occursOn(ev, day, prepared) {
    if (ev.deferred === true) return false;
    var ds = fmtDate(day);
    if (ev.type === 'task') {
      if (Array.isArray(ev.skip) && ev.skip.indexOf(ds) !== -1) return false;
      if (ev.plannedDate) return ev.plannedDate === ds;
      if (ev.start && ds < ev.start) return false;
      if (ev.deadline && ds > ev.deadline) return false;
      return !!(ev.deadline || ev.start);
    }
    if (ev.deadline && ds > ev.deadline) return false; // 截止日期：到该日（含）为止生效
    if (Array.isArray(ev.skip) && ev.skip.indexOf(ds) !== -1) return false; // 例外日期：停课/调休，该日不发生
    var type = ev.type || 'once';
    if (type === 'weekly') {
      if (isoWeekday(day) !== (parseInt(ev.weekday, 10) || 1)) return false;
      return weekPatternOk(ev, day, prepared && prepared.weekMonday); // 单双周（未配置 = 恒真）
    }
    if (type === 'once') return ev.date === ds;
    if (type === 'custom') {
      var r = ev.repeat || {};
      if (!r.start || ds < r.start) return false;
      if (r.until && ds > r.until) return false; // until 含当日
      var s = prepared && prepared.repeatStart || parseDate(r.start);
      var diffDays = Math.round((day - s) / 86400000);
      if (diffDays < 0) return false;
      var interval = Math.max(1, parseInt(r.interval, 10) || 1);
      var unit = r.unit || 'day';
      if (unit === 'day') return diffDays % interval === 0;
      if (unit === 'week') {
        var weekDiff = Math.floor(diffDays / 7);
        if (weekDiff % interval !== 0) return false;
        if (Array.isArray(r.days) && r.days.length) return r.days.indexOf(isoWeekday(day)) !== -1;
        return isoWeekday(day) === isoWeekday(s); // 未指定 days：仅起始日的星期几
      }
      if (unit === 'month') {
        var months = (day.getFullYear() - s.getFullYear()) * 12 + (day.getMonth() - s.getMonth());
        if (months % interval !== 0) return false;
        return day.getDate() === s.getDate(); // 按「几号」匹配
      }
    }
    return false;
  }

  // A projection can reuse parsed dates; a matcher owns a snapshot of date rules.
  function occurrenceMatcher(event) {
    var ev = Object.assign({}, event);
    if (Array.isArray(ev.skip)) ev.skip = ev.skip.slice();
    if (ev.repeat) ev.repeat = Object.assign({}, ev.repeat, Array.isArray(ev.repeat.days) ? {days:ev.repeat.days.slice()} : {});
    if (ev.weekPattern) ev.weekPattern = Object.assign({}, ev.weekPattern);
    var prepared = {repeatStart:ev.type==='custom' && ev.repeat && isDateStr(ev.repeat.start) ? parseDate(ev.repeat.start) : null,weekMonday:ev.type==='weekly' && ev.weekPattern && isDateStr(ev.weekPattern.start) ? mondayOf(parseDate(ev.weekPattern.start)) : null};
    return function(day) { return occursOn(ev,day,prepared); };
  }

  // A deadline does not imply an execution slot. Legacy task.start is a date.
  function taskPlannedDate(ev) {
    if (ev.deferred === true) return '';
    return isDateStr(ev.plannedDate) ? ev.plannedDate : isDateStr(ev.start) ? ev.start : '';
  }
  function taskTiming(ev) {
    if (ev.deferred === true || ev.type !== 'task' || !isDateStr(ev.plannedDate) ||
        !HHMM_RE.test(String(ev.plannedStart || '')) || !HHMM_RE.test(String(ev.plannedEnd || ''))) return null;
    var duration = (parseHHMM(ev.plannedEnd) - parseHHMM(ev.plannedStart) + 1440) % 1440;
    return duration ? { date: ev.plannedDate, start: ev.plannedStart, end: ev.plannedEnd, minutes: duration } : null;
  }
  function taskMatchesFilter(ev, done, filter, today) {
    if (filter === 'all') return true;
    if (filter === 'done') return !!done;
    if (done) return false;
    if (ev.deferred === true) return filter !== 'today';
    var planned = taskPlannedDate(ev);
    if (filter === 'unscheduled') return !planned;
    if (filter === 'today') return planned ? planned <= today : !!ev.deadline && ev.deadline <= today;
    return true;
  }

  // Return the same item with a new execution plan; never modify a deadline,
  // attachments, steps or completion records as part of postponing.
  function deferEvent(ev, choice) {
    if (!ev || (ev.type !== 'task' && ev.type !== 'once')) throw new Error('重复日程请在编辑器中调整整个系列。');
    if (!choice || (choice.mode !== 'hold' && choice.mode !== 'date')) throw new Error('请选择延期方式。');
    var next = Object.assign({}, ev, { deferred: choice.mode === 'hold' });
    if (choice.mode === 'hold') {
      if (ev.type === 'task') {
        next.plannedDate = ''; next.plannedStart = ''; next.plannedEnd = '';
        delete next.start;
      }
    } else {
      if (!isDateStr(choice.date)) throw new Error('请选择有效的执行日期。');
      if (ev.type === 'task') {
        next.plannedDate = choice.date;
        next.plannedStart = choice.start || ''; next.plannedEnd = choice.end || '';
        delete next.start;
      } else {
        next.date = choice.date; next.start = choice.start; next.end = choice.end;
      }
    }
    var errors = validateEvent(next);
    if (errors.length) throw new Error(errors[0]);
    return next;
  }

  // ---------- 提醒提前分钟数 ----------
  /** remindLead 为数字（含数字字符串）且 >= 0 → 原值（显式 0 = 不提醒，由调用方按 >0 过滤）；
   *  缺失 / 非法（非数字、负数、NaN、bool）→ def（缺省 20）。 */
  function leadMinutes(ev, def) {
    var raw = (ev && typeof ev === 'object') ? ev.remindLead : undefined;
    if (typeof raw === 'boolean') return def === undefined ? 20 : def;
    var v = parseFloat(raw);
    if (isFinite(v) && v >= 0) return v;
    return def === undefined ? 20 : def;
  }

  // ---------- 事件结构校验（P1-2：拦截 custom 缺 repeat 等结构性损坏） ----------
  /** 返回错误列表（空数组 = 通过）。end < start 视为跨午夜一段，合法；end == start 非法。 */
  function validateEvent(ev) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return ['事件必须是对象'];
    var errs = organizer ? organizer.metadataErrors(ev) : [];
    if(workspace)errs=errs.concat(workspace.metadataErrors(ev));
    var type = ev.type;
    if (ev.deferred !== undefined && typeof ev.deferred !== 'boolean') errs.push('deferred 必须是布尔值');
    if (ev.deferred === true && type !== 'task' && type !== 'once') errs.push('暂不安排仅支持待办或单次日程');
    if (type !== 'weekly' && type !== 'once' && type !== 'custom' && type !== 'task') {
      errs.push('type 必须是 weekly/once/custom/task');
    }
    if (!ev.title || !String(ev.title).trim()) errs.push('title 不能为空');
    if (type === 'task') {
      if (ev.start !== undefined && ev.start !== null && ev.start !== '') {
        if (!isDateStr(ev.start)) errs.push('task 开始日期格式非法（YYYY-MM-DD）');
        else if (isDateStr(ev.deadline) && ev.start > ev.deadline) errs.push('task 开始日期不能晚于截止日期');
      }
      if (ev.plannedDate !== undefined && ev.plannedDate !== null && ev.plannedDate !== '' && !isDateStr(ev.plannedDate)) {
        errs.push('计划执行日期必须是有效日期（YYYY-MM-DD）');
      }
      var ps = ev.plannedStart, pe = ev.plannedEnd;
      if (ps || pe) {
        if (!isDateStr(ev.plannedDate)) errs.push('填写计划时间前，请选择执行日期');
        if (!HHMM_RE.test(String(ps || '')) || !HHMM_RE.test(String(pe || ''))) errs.push('计划开始和结束时间需成对填写（HH:MM）');
        else if (parseHHMM(ps) === parseHHMM(pe)) errs.push('计划开始和结束时间不能相同');
      }
      if (ev.estimatedMinutes !== undefined && ev.estimatedMinutes !== null && ev.estimatedMinutes !== '' &&
          (!Number.isInteger(ev.estimatedMinutes) || ev.estimatedMinutes < 1 || ev.estimatedMinutes > 1440)) {
        errs.push('预计耗时请填写 1–1440 分钟的整数');
      }
    } else {
      if (!HHMM_RE.test(String(ev.start || ''))) errs.push('start 必须是 HH:MM（00:00–23:59）');
      if (!HHMM_RE.test(String(ev.end || ''))) errs.push('end 必须是 HH:MM（00:00–23:59）');
      if (HHMM_RE.test(String(ev.start || '')) && HHMM_RE.test(String(ev.end || ''))) {
        if (parseHHMM(ev.end) === parseHHMM(ev.start)) errs.push('end 不能等于 start（跨天日程请 end < start，如 23:00–01:00）');
      }
    }
    var wd = parseInt(ev.weekday, 10);
    if (type === 'weekly' && !(wd >= 1 && wd <= 7)) errs.push('weekly 事件需要 weekday（1=周一 … 7=周日）');
    if (type === 'once' && !isDateStr(ev.date)) errs.push('once 事件需要有效 date（YYYY-MM-DD，须为真实日期）');
    if (type === 'custom') {
      var r = ev.repeat;
      if (!r || typeof r !== 'object' || Array.isArray(r)) {
        errs.push('custom 事件必须带 repeat 对象（缺 repeat 将不被渲染/提醒）');
      } else {
        var iv = parseInt(r.interval, 10);
        if (!(iv >= 1)) errs.push('repeat.interval 必须是 >= 1 的整数');
        if (r.unit !== 'day' && r.unit !== 'week' && r.unit !== 'month') errs.push('repeat.unit 必须是 day/week/month');
        if (!isDateStr(r.start)) errs.push('repeat.start 必须是有效日期（YYYY-MM-DD）');
        if (r.until !== undefined && r.until !== null && r.until !== '' && !isDateStr(r.until)) errs.push('repeat.until 必须是有效日期');
        if (r.unit === 'week' && r.days !== undefined && r.days !== null) {
          if (!Array.isArray(r.days)) errs.push('repeat.days 必须是数组（1-7）');
          else {
            for (var i = 0; i < r.days.length; i++) {
              var d = parseInt(r.days[i], 10);
              if (!(d >= 1 && d <= 7)) { errs.push('repeat.days 取值必须是 1-7'); break; }
            }
          }
        }
      }
    }
    if (ev.deadline !== undefined && ev.deadline !== null && ev.deadline !== '' && !isDateStr(ev.deadline)) {
      errs.push('deadline 必须是有效日期（YYYY-MM-DD）');
    }
    if (ev.remindLead !== undefined && ev.remindLead !== null && ev.remindLead !== '') {
      if (typeof ev.remindLead === 'boolean' || !isFinite(parseFloat(ev.remindLead)) || parseFloat(ev.remindLead) < 0) {
        errs.push('remindLead 必须是 >= 0 的数字（0 = 不提醒）');
      }
    }
    // 例外日期（stop 课/调休）：必须是合法日期数组
    if (ev.skip !== undefined && ev.skip !== null) {
      if (!Array.isArray(ev.skip)) errs.push('skip 必须是日期数组（YYYY-MM-DD）');
      else {
        for (var si = 0; si < ev.skip.length; si++) {
          if (!isDateStr(ev.skip[si])) { errs.push('skip 数组元素必须是有效日期（YYYY-MM-DD）'); break; }
        }
      }
    }
    // 单双周（仅 weekly）
    if (ev.weekPattern !== undefined && ev.weekPattern !== null) {
      var wp = ev.weekPattern;
      if (type !== 'weekly') errs.push('weekPattern 仅适用于 weekly 事件');
      if (!wp || typeof wp !== 'object' || Array.isArray(wp)) errs.push('weekPattern 必须是对象 { start, odd }');
      else {
        if (!isDateStr(wp.start)) errs.push('weekPattern.start 必须是有效日期（YYYY-MM-DD）');
        if (wp.odd !== undefined && typeof wp.odd !== 'boolean') errs.push('weekPattern.odd 必须是 true/false');
      }
    }
    return errs;
  }

  /** 顶层校验：返回问题列表（空 = 通过）。每项 { index?, id?, title?, errors: [...] }。 */
  function validateSchedule(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return [{ errors: ['顶层必须是 JSON 对象'] }];
    }
    var problems = [];
    if (!Array.isArray(data.events)) {
      problems.push({ errors: ['缺少 events 数组'] });
      return problems;
    }
    data.events.forEach(function (ev, i) {
      var errs = validateEvent(ev);
      if (errs.length) {
        problems.push({ index: i, id: ev && ev.id, title: ev && ev.title, errors: errs });
      }
    });
    if (data.trash !== undefined) {
      if (!Array.isArray(data.trash) || data.trash.length > 5000) problems.push({errors:['最近删除必须是最多 5000 项的数组']});
      else {
        var seen = new Set(), active = new Set(data.events.map(function(ev){return ev && ev.id;}));
        data.trash.forEach(function(row, i){
          var errors = [];
          if (!row || typeof row !== 'object' || Array.isArray(row)) errors.push('删除记录必须是对象');
          else {
            if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(row.id) || row.id !== (row.event && row.event.id)) errors.push('删除记录 ID 与事项不一致');
            if (seen.has(row.id) || active.has(row.id)) errors.push('事项不能同时存在于清单和最近删除中');
            seen.add(row.id);
            if (typeof row.deletedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.deletedAt) || !isFinite(Date.parse(row.deletedAt)) || new Date(row.deletedAt).toISOString() !== row.deletedAt) errors.push('删除时间无效');
            if (!Number.isInteger(row.position) || row.position < 0) errors.push('原始位置无效');
            errors = errors.concat(validateEvent(row.event));
          }
          if (errors.length) problems.push({index:i,id:row && row.id,errors:errors});
        });
      }
    }
    if (organizer) {
      var organizationErrors=organizer.validate(data);
      if(organizationErrors.length)problems.push({errors:organizationErrors});
    }
    if(workspace){var workspaceErrors=workspace.validate(data);if(workspaceErrors.length)problems.push({errors:workspaceErrors});}
    return problems;
  }

  // Delete only the active item; completion history belongs to progress and is
  // deliberately untouched. Keep the exact event for cross-device restoration.
  function trashEvent(data, id, nowMs) {
    var index = data.events.findIndex(function(ev){return ev.id === id;});
    if (index < 0) throw new Error('这条事项已不在清单中。');
    var trash = Array.isArray(data.trash) ? data.trash : [];
    if (trash.some(function(row){return row.id === id;})) throw new Error('这条事项已有删除记录，请先同步。');
    if (trash.length >= 5000) throw new Error('最近删除已满，请先恢复部分事项。');
    var row = {id:id,event:JSON.parse(JSON.stringify(data.events[index])),position:index,deletedAt:new Date(nowMs === undefined ? Date.now() : nowMs).toISOString()};
    return Object.assign({},data,{events:data.events.filter(function(ev){return ev.id !== id;}),trash:trash.concat([row])});
  }
  function restoreEvent(data, id) {
    var trash = Array.isArray(data.trash) ? data.trash : [], row = trash.find(function(item){return item.id === id;});
    if (!row) throw new Error('这条事项已恢复或删除记录已变化，请刷新后查看。');
    if (data.events.some(function(ev){return ev.id === id;})) throw new Error('清单里已有这条事项，请先同步，避免覆盖修改。');
    var events = data.events.slice();
    events.splice(Math.min(row.position,events.length),0,JSON.parse(JSON.stringify(row.event)));
    return Object.assign({},data,{events:events,trash:trash.filter(function(item){return item.id !== id;})});
  }

  // ---------- 过期归档（P2-3）：purge 判定与归档纯函数 ----------
  /** 是否可归档：截止日期（deadline / once 的 date / custom 的 repeat.until）早于 cutoff（严格小于）。 */
  function isPurgeable(ev, cutoff) {
    if (ev.deferred === true) return false;
    var dl = (typeof ev.deadline === 'string' && DATE_RE.test(ev.deadline)) ? ev.deadline : null;
    if (!dl && (ev.type || 'once') === 'once') dl = (typeof ev.date === 'string' && DATE_RE.test(ev.date)) ? ev.date : null;
    if (!dl && ev.type === 'custom' && ev.repeat && typeof ev.repeat.until === 'string') dl = ev.repeat.until;
    return !!dl && dl < cutoff;
  }

  /**
   * 归档纯函数：把 data.events 中过期的（isPurgeable）移入 data.archive（附 archivedAt 时间戳），
   * 返回新 data（不修改入参）；无可归档项时原样返回。archive 节点不渲染、不提醒（调用方只遍历 events）。
   * nowMs 可注入（测试用）；缺省取当前时间。
   */
  function archiveFor(data, cutoff, nowMs) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.events)) return data;
    var ts = new Date(nowMs === undefined ? Date.now() : nowMs).toISOString();
    var kept = [], moved = [];
    for (var i = 0; i < data.events.length; i++) {
      var ev = data.events[i];
      if (isPurgeable(ev, cutoff)) moved.push(Object.assign({}, ev, { archivedAt: ts }));
      else kept.push(ev);
    }
    if (!moved.length) return data;
    var out = Object.assign({}, data);
    out.events = kept;
    out.archive = (Array.isArray(data.archive) ? data.archive.slice() : []).concat(moved);
    return out;
  }

  return {
    occursOn: occursOn,
    occurrenceMatcher: occurrenceMatcher,
    taskPlannedDate: taskPlannedDate,
    taskTiming: taskTiming,
    taskMatchesFilter: taskMatchesFilter,
    deferEvent: deferEvent,
    trashEvent: trashEvent,
    restoreEvent: restoreEvent,
    leadMinutes: leadMinutes,
    parseHHMM: parseHHMM,
    fmtDate: fmtDate,
    isoWeekday: isoWeekday,
    isDateStr: isDateStr,
    mondayOf: mondayOf,
    weekPatternOk: weekPatternOk,
    validateEvent: validateEvent,
    validateSchedule: validateSchedule,
    isPurgeable: isPurgeable,
    archiveFor: archiveFor,
  };
});

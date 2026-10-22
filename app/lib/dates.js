// Wall-calendar helpers. Dates stay YYYY-MM-DD strings and times HH:mm, as in
// the shared domain rules; nothing here converts dates through UTC midnight.
export const pad = n => String(n).padStart(2, '0');
export const fmtDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const parseDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => fmtDate(new Date());
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmtDate(parseDate(s)) === s;
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); }
export function addMonths(s, n) {
  const d = parseDate(s), target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  target.setDate(Math.min(d.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return fmtDate(target);
}
export const minutes = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const clock = m => pad(Math.floor(((m % 1440) + 1440) % 1440 / 60)) + ':' + pad(((m % 60) + 60) % 60);
export const duration = (start, end) => (minutes(end) - minutes(start) + 1440) % 1440;
export function weekOf(s) {
  const d = parseDate(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return Array.from({length: 7}, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return fmtDate(x); });
}
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
export const weekdayIndex = s => (parseDate(s).getDay() + 6) % 7;
export const weekdayName = s => '周' + WEEKDAYS[weekdayIndex(s)];
export const monthDay = s => { const d = parseDate(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
export const shortDate = s => s ? s.slice(5).replace('-', '/') : '';
export const dotted = s => s ? s.replaceAll('-', '.') : '';
export function relativeDay(s, base = today()) {
  const diff = Math.round((parseDate(s) - parseDate(base)) / 86400000);
  return diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天' : diff === 2 ? '后天' : '';
}
export function durationLabel(total) {
  if (!Number.isFinite(total) || total <= 0) return '';
  const h = Math.floor(total / 60), m = total % 60;
  return (h ? h + ' 小时' : '') + (m ? (h ? ' ' : '') + m + ' 分钟' : '');
}
export function monthCells(s) {
  const d = parseDate(s), first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const start = new Date(first); start.setDate(1 - offset);
  return Array.from({length: Math.ceil((offset + days) / 7) * 7}, (_, i) => {
    const x = new Date(start); x.setDate(start.getDate() + i);
    return {date: fmtDate(x), number: x.getDate(), inMonth: x.getMonth() === first.getMonth()};
  });
}
export const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch { return 'Asia/Shanghai'; } };

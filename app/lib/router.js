// Static demo uses query routes and preserves its deployed base path.
import {isDate} from './dates.js';

export const VIEWS = ['today', 'calendar', 'tasks', 'focus', 'growth', 'notes', 'settings'];
const PARAMS = ['date', 'mode', 'list', 'layout', 'task', 'tab', 'section', 'note', 'q'];

export function parse(loc = location) {
  const url = new URL(loc.href);
  const q = url.searchParams;
  let view = q.get('view') || '';
  const params = {};
  for (const key of PARAMS) if (q.get(key)) params[key] = q.get(key);
  if (view === 'board' || view === 'quadrant') { params.layout = view; view = 'tasks'; }
  if (view === 'feedback') { view = 'growth'; params.tab = 'hours'; }
  if (view === 'workspace') view = params.date ? 'calendar' : 'today';
  if (view === 'account') view = 'settings';
  if (view === 'habits') { view = 'growth'; params.tab = 'habits'; }
  if (!VIEWS.includes(view)) view = 'today';
  if (params.date && !isDate(params.date)) delete params.date;
  // A reminder notification opens the reminded day.
  if (!q.get('view') && params.date) view = 'calendar';
  return {view, params};
}

export function href(view, params = {}) {
  const base = location.pathname;
  const q = new URLSearchParams();
  if (view && view !== 'today') q.set('view', view);
  for (const key of PARAMS) if (params[key] !== undefined && params[key] !== '' && params[key] !== null) q.set(key, params[key]);
  const search = q.toString();
  return base + (search ? '?' + search : '');
}

export function navigate(view, params, {replace = false} = {}) {
  const next = href(view, params);
  if (next === location.pathname + location.search) return false;
  history[replace ? 'replaceState' : 'pushState']({view, params}, '', next);
  return true;
}

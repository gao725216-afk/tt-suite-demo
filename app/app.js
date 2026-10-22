// Application context: state ownership, the single write path for synced data,
// delegated UI events, and the render loop. Feature modules register views and
// actions here instead of patching each other.
import {createStore} from './lib/store.js';
import {morph} from './lib/morph.js';
import {navigate, parse} from './lib/router.js';
import {occur, gardenWorld} from './core.js';
import {createOverlays} from './shell/overlays.js';
import {createToasts} from './shell/toast.js';
import {today as todayDate} from './lib/dates.js';

const clone = value => structuredClone(value);

export function createApp({user, doc, sync}) {
  const store = createStore({
    doc,                                   // {schedule, progress}: synced workspace
    session: {user, devices: []},
    sync: {status: 'connecting', message: '正在连接', pending: false, conflict: null},
    route: parse(),
    layout: layoutFor(),
    today: todayDate(),
    ui: {},                                // per-feature view state, keyed by feature
  });
  const overlays = createOverlays(() => store.get());
  const toast = createToasts();
  const views = new Map(), handlers = new Map(), afterRender = new Set();
  let root = null, renderShell = null;

  const app = {
    store, overlays, toast, sync, user,
    get state() { return store.get(); },
    get today() { return store.get().today; },
    view(name, definition) { views.set(name, definition); },
    getView: name => views.get(name),
    views,
    on(name, handler) { handlers.set(name, handler); },
    onRender(fn) { afterRender.add(fn); return () => afterRender.delete(fn); },
    ui(feature) { return store.get().ui[feature] || {}; },
    setUi(feature, patch) {
      store.set('ui', ui => ({...ui, [feature]: {...(ui[feature] || {}), ...(typeof patch === 'function' ? patch(ui[feature] || {}) : patch)}}));
    },
    go(view, params = {}, options = {}) {
      navigate(view, params, options);
      store.replace('route', {view, params});
      if (!options.keepScroll) requestAnimationFrame(() => document.querySelector('.view')?.scrollTo?.({top: 0}) || window.scrollTo({top: 0}));
    },
    setParams(patch, options = {replace: true}) {
      const {view, params} = store.get().route;
      const next = {...params, ...patch};
      for (const key of Object.keys(next)) if (next[key] === undefined || next[key] === null || next[key] === '') delete next[key];
      navigate(view, next, options);
      store.replace('route', {view, params: next});
    },
    // The only path that changes synced data. The mutator edits a clone; the
    // shared validation runs before anything is shown or queued for upload.
    commit(mutator, {message, detail, undo, tone = 'success', quiet = false, iconName} = {}) {
      if (store.get().sync.conflict) {
        toast('请先处理同步冲突，再继续修改。', {tone: 'error'});
        openConflict();
        throw Object.assign(new Error('请先处理同步冲突。'), {handled: true});
      }
      const draft = clone(store.get().doc);
      const result = mutator(draft);
      const problems = occur.validateSchedule(draft.schedule);
      if (problems.length) throw new Error(problems[0].errors[0]);
      gardenWorld.reconcile(draft.progress);
      store.replace('doc', draft);
      sync.changed(draft);
      if (message && !quiet) toast(message, {tone, detail, iconName, action: undo ? {label: '撤销', run: () => safely(undo)} : null});
      return result;
    },
    // Run a commit and show its error as a toast instead of throwing.
    attempt(fn) { return safely(fn); },
    render() { store.flushSync(); },
  };

  function safely(fn) {
    try { return fn(); }
    catch (error) { if (!error.handled) toast(error.message || '操作未完成，请重试。', {tone: 'error'}); return undefined; }
  }

  function openConflict() { handlers.get('sync.conflict')?.(null, null, app); }

  // Delegated events: data-act on click, data-submit on forms, data-change/data-input on controls.
  function dispatch(name, el, event) {
    const handler = handlers.get(name);
    if (!handler) { console.warn('No handler for', name); return; }
    const result = safely(() => handler(el, event, app));
    if (result && typeof result.catch === 'function') result.catch(error => { if (!error?.handled) toast(error?.message || '操作未完成，请重试。', {tone: 'error'}); });
  }
  document.addEventListener('click', event => {
    const el = event.target.closest?.('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
    if (el.closest('[data-suppress-click]')?.dataset.suppressUntil > Date.now()) { event.preventDefault(); return; }
    event.preventDefault();
    dispatch(el.dataset.act, el, event);
  });
  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-submit]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.busy === 'true') return;
    dispatch(form.dataset.submit, form, event);
  });
  document.addEventListener('change', event => {
    const el = event.target.closest?.('[data-change]');
    if (el) dispatch(el.dataset.change, el, event);
  });
  document.addEventListener('input', event => {
    const el = event.target.closest?.('[data-input]');
    if (el) dispatch(el.dataset.input, el, event);
  });
  window.addEventListener('popstate', () => { overlays.closeAll(); store.replace('route', parse()); });

  app.on('overlay.close', el => { const dialog = el.closest('dialog'); if (dialog) overlays.close(dialog.id.replace(/^overlay-/, '')); });
  app.on('nav.go', el => app.go(el.dataset.view, el.dataset.params ? JSON.parse(el.dataset.params) : {}));

  // Layout breakpoints drive structure; CSS handles finer adjustments.
  function layoutFor() {
    const w = window.innerWidth, h = window.innerHeight;
    const landscapePhone = matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse)').matches;
    return {compact: w < 720 && !landscapePhone, medium: w >= 720 && w < 1180, wide: w >= 1180, landscapePhone, short: h < 640, width: w};
  }
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const next = layoutFor(), current = store.get().layout;
      if (Object.keys(next).some(key => key !== 'width' && next[key] !== current[key])) store.replace('layout', next);
    });
  });
  // Date rollover while the page stays open.
  setInterval(() => { const now = todayDate(); if (now !== store.get().today) store.replace('today', now); }, 30_000);

  app.mount = (element, shell) => {
    root = element; renderShell = shell;
    store.subscribe(state => {
      const html = document.documentElement, l = state.layout;
      html.classList.toggle('is-compact', l.compact); html.classList.toggle('is-medium', l.medium); html.classList.toggle('is-wide', l.wide); html.classList.toggle('is-landscape-phone', l.landscapePhone); html.dataset.view = state.route.view;
      morph(root, renderShell(state, app));
      overlays.refresh();
      for (const fn of afterRender) fn(state);
    });
    store.flushSync();
  };
  return app;
}

// Native <dialog> overlays. On compact screens CSS presents them as bottom
// sheets. Android's back key dispatches `cancel` on dialog[open]; we intercept
// it to run the same animated close used by buttons and Escape.
import {morph} from '../lib/morph.js';
import {runExit} from '../lib/motion.js';
import {html} from '../lib/html.js';
import {icon} from '../lib/icons.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createOverlays(getState) {
  const open = new Map();

  function paint(entry) {
    const state = getState();
    const markup = entry.render(state, entry);
    if (markup === null) { close(entry.id); return; }
    morph(entry.el, markup);
  }

  function show(id, options) {
    let entry = open.get(id);
    if (entry) { Object.assign(entry, options); paint(entry); return entry; }
    const el = document.createElement('dialog');
    el.className = 'overlay ' + (options.className || '');
    el.id = 'overlay-' + id;
    if (options.size) el.dataset.size = options.size;
    if (options.private) el.setAttribute('data-private-period', '');
    if (options.label) el.setAttribute('aria-label', options.label);
    entry = {id, el, opener: document.activeElement, ...options};
    open.set(id, entry);
    el.addEventListener('cancel', event => { event.preventDefault(); close(id); });
    // Click on the backdrop (outside the dialog box) closes it.
    el.addEventListener('mousedown', event => { entry.downOnBackdrop = event.target === el; });
    el.addEventListener('click', event => {
      if (event.target !== el || !entry.downOnBackdrop) return;
      const r = el.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(id);
    });
    el.addEventListener('scroll', () => {}, true);
    document.body.append(el);
    paint(entry);
    el.showModal();
    const body = el.querySelector('.overlay-body');
    body?.addEventListener('scroll', () => el.classList.toggle('scrolled', body.scrollTop > 2), {passive: true});
    const target = options.focus ? el.querySelector(options.focus) : el.querySelector('[autofocus]');
    const heading = el.querySelector('.overlay-head h2');
    if (heading && !target) heading.tabIndex = -1;
    (target || heading || el).focus?.({preventScroll: true});
    return entry;
  }

  function close(id, {restoreFocus = true} = {}) {
    const entry = open.get(id);
    if (!entry || entry.closing) return;
    if (entry.beforeClose && entry.beforeClose() === false) return;
    entry.closing = true;
    const finish = () => {
      open.delete(id);
      if (entry.el.open) entry.el.close();
      entry.el.remove();
      entry.onClose?.();
      if (restoreFocus && entry.opener?.isConnected) entry.opener.focus?.({preventScroll: true});
    };
    runExit(entry.el, {reduced: reduced(), finish});
  }

  return {
    show, close,
    refresh() { for (const entry of open.values()) if (!entry.closing) paint(entry); },
    isOpen: id => open.has(id),
    any: () => open.size > 0,
    editing: () => [...open.values()].some(entry => entry.editing),
    closeAll() { for (const id of [...open.keys()]) close(id, {restoreFocus: false}); },
  };
}

// Standard overlay frame shared by every dialog/sheet.
export function frame({title, subtitle, body, foot, closeLabel = '关闭', headExtra}) {
  return html`<div class="overlay-head"><div style="flex:1;min-width:0"><h2>${title}</h2>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>${headExtra || ''}<button type="button" class="icon-btn" data-act="overlay.close" aria-label="${closeLabel}">${icon('close')}</button></div>
<div class="overlay-body">${body}</div>${foot ? html`<div class="overlay-foot">${foot}</div>` : ''}`;
}

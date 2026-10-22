// Patch live DOM toward a freshly rendered tree instead of replacing innerHTML.
// Node identity survives renders, so focus, caret, scroll offsets, running
// animations and native control state are not reset by synchronisation.
//
// Matching rules: an element with data-key (or id) matches the same key among
// its siblings; other nodes match by position and tag. `data-morph="skip"`
// keeps a subtree untouched once mounted (used by canvases and live editors).

const keyOf = node => node.nodeType === 1 ? (node.getAttribute('data-key') || node.id || null) : null;

// Dialogs and uncontrolled <details> own their open state after mounting:
// disclosure state is user state and must survive background re-renders.
const ownsOpen = (from, to) => from.tagName === 'DIALOG' || (from.tagName === 'DETAILS' && !to.hasAttribute('data-open-controlled'));

function syncAttributes(from, to) {
  const keep = new Set();
  const skipOpen = ownsOpen(from, to);
  for (const {name, value} of Array.from(to.attributes)) {
    keep.add(name);
    if (name === 'open' && skipOpen) continue;
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  for (const {name} of Array.from(from.attributes)) {
    if (keep.has(name)) continue;
    if (name === 'open' && skipOpen) continue;
    if (name.startsWith('data-motion-') || name === 'data-mounted') continue;
    from.removeAttribute(name);
  }
}

function syncFormState(from, to) {
  const focused = from === document.activeElement;
  if (from.tagName === 'INPUT') {
    const type = from.type;
    if (type === 'checkbox' || type === 'radio') {
      const checked = to.hasAttribute('checked');
      if (from.checked !== checked && !from.hasAttribute('data-uncontrolled')) from.checked = checked;
    } else if (type !== 'file' && !focused && !from.hasAttribute('data-uncontrolled')) {
      const value = to.getAttribute('value') ?? '';
      if (from.value !== value) from.value = value;
    }
  } else if (from.tagName === 'TEXTAREA') {
    if (!focused && !from.hasAttribute('data-uncontrolled')) {
      const value = to.textContent;
      if (from.value !== value) from.value = value;
    }
  } else if (from.tagName === 'SELECT') {
    if (!focused && !from.hasAttribute('data-uncontrolled')) {
      const chosen = Array.from(to.options).find(o => o.hasAttribute('selected'));
      if (chosen && from.value !== chosen.value) from.value = chosen.value;
    }
  }
}

function sameKind(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && keyOf(a) === keyOf(b) && (a.tagName !== 'INPUT' || a.type === b.type);
}

function patch(from, to) {
  if (from.nodeType === 3 || from.nodeType === 8) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.getAttribute('data-morph') === 'skip' && from.dataset.mounted === 'true') return;
  syncAttributes(from, to);
  if (from.tagName === 'TEXTAREA') { syncFormState(from, to); return; }
  patchChildren(from, to);
  if (from.tagName === 'INPUT' || from.tagName === 'SELECT') syncFormState(from, to);
  if (from.getAttribute('data-morph') === 'skip') from.dataset.mounted = 'true';
}

function patchChildren(parent, target) {
  const incoming = Array.from(target.childNodes);
  const keyed = new Map();
  for (const child of Array.from(parent.childNodes)) {
    const key = keyOf(child);
    if (key) keyed.set(key, child);
  }
  let cursor = parent.firstChild;
  for (const next of incoming) {
    const key = keyOf(next);
    let match = null;
    if (key) {
      match = keyed.get(key) || null;
      if (match && !sameKind(match, next)) match = null;
    } else if (cursor && !keyOf(cursor) && sameKind(cursor, next)) {
      match = cursor;
    }
    if (match) {
      if (match !== cursor) parent.insertBefore(match, cursor);
      else cursor = cursor.nextSibling;
      if (key) keyed.delete(key);
      patch(match, next);
    } else {
      const node = document.importNode(next, true);
      parent.insertBefore(node, cursor);
    }
  }
  while (cursor) {
    const following = cursor.nextSibling;
    if (!(cursor.nodeType === 1 && cursor.hasAttribute('data-morph-persist'))) parent.removeChild(cursor);
    cursor = following;
  }
}

const parser = typeof document !== 'undefined' ? document.createElement('template') : null;

export function morph(container, markup) {
  parser.innerHTML = String(markup);
  patchChildren(container, parser.content);
  parser.innerHTML = '';
}

// Replace a single element's content (used for detached overlays).
export function morphInto(element, markup) { morph(element, markup); }

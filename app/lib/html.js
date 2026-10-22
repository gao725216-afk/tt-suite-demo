// Escaped HTML templates. Every interpolated value is text unless it was itself
// produced by `html` or explicitly marked with `raw` (used only for trusted
// markup such as icons or the shared Markdown renderer, which escapes its input).
const SAFE = Symbol('safe-html');

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function part(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(part).join('');
  if (value && value[SAFE]) return value.text;
  return escapeHtml(value);
}

export function raw(text) {
  return {[SAFE]: true, text: String(text ?? ''), toString() { return this.text; }};
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return raw(out);
}

// Boolean and optional attributes: attr('disabled', busy) -> ' disabled'.
export function attr(name, value) {
  if (value === false || value === null || value === undefined) return raw('');
  if (value === true) return raw(' ' + name);
  return raw(' ' + name + '="' + escapeHtml(value) + '"');
}

export function cx(...names) {
  return names.flat().filter(Boolean).join(' ');
}

export function join(items, separator = '') {
  return raw(items.map(part).filter(Boolean).join(part(separator)));
}

export function isSafe(value) { return !!(value && value[SAFE]); }

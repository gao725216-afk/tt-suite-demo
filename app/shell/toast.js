// Transient feedback with an optional single action (usually 撤销).
import {icon} from '../lib/icons.js';
import {escapeHtml} from '../lib/html.js';

export function createToasts() {
  let host = null, serial = 0;
  const live = [];
  function ensure() {
    if (host?.isConnected) return host;
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
    return host;
  }
  function dismiss(item) {
    const index = live.indexOf(item);
    if (index < 0) return;
    live.splice(index, 1);
    clearTimeout(item.timer);
    item.el.classList.add('leaving');
    setTimeout(() => item.el.remove(), 220);
  }
  function toast(message, {tone = 'info', detail = '', action = null, duration, iconName} = {}) {
    ensure();
    while (live.length >= 3) dismiss(live[0]);
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.tone = tone;
    el.dataset.id = String(++serial);
    const glyph = iconName || (tone === 'error' ? 'alert' : tone === 'success' ? 'check' : tone === 'growth' ? 'growth' : 'info');
    el.innerHTML = icon(glyph).text + '<div class="msg">' + escapeHtml(message) + (detail ? '<small>' + escapeHtml(detail) + '</small>' : '') + '</div>';
    const item = {el};
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.onclick = () => { dismiss(item); action.run(); };
      el.append(button);
    }
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'toast-close'; close.setAttribute('aria-label', '关闭提示');
    close.innerHTML = icon('close').text;
    close.onclick = () => dismiss(item);
    el.append(close);
    item.timer = setTimeout(() => dismiss(item), duration ?? (action ? 6500 : tone === 'error' ? 6000 : 3200));
    el.addEventListener('mouseenter', () => clearTimeout(item.timer));
    el.addEventListener('mouseleave', () => { item.timer = setTimeout(() => dismiss(item), 2500); });
    host.append(el);
    live.push(item);
    return () => dismiss(item);
  }
  return toast;
}

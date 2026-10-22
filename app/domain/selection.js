// Selected text handed to the assistant (desktop host hotkey, browser extension,
// in-page context menu). Text only ever enters the editable draft; it is never
// sent automatically, never replaces an existing draft and is idempotent per
// delivery ID so a retried host delivery cannot append twice.
export const SELECTION_LIMIT = 2000;

export function selectedText(doc = globalThis.document, win = globalThis.window) {
  const active = doc?.activeElement;
  if (active?.matches?.('input[type=password]')) return '';
  if (active?.closest?.('[data-private-period]')) return '';
  if (active?.matches?.('textarea,input[type=text],input:not([type])') && Number.isInteger(active.selectionStart)) return active.value.slice(active.selectionStart, active.selectionEnd).trim();
  const selection = win?.getSelection?.();
  if (selection?.anchorNode?.parentElement?.closest?.('[data-private-period]')) return '';
  return selection?.toString().trim() || '';
}

export function createSelectionInbox({getDraft, setDraft, onAccepted, onRejected}) {
  const accepted = new Set();
  return function receive(value, metadata = {}) {
    const id = typeof metadata?.id === 'string' && metadata.id.length <= 100 ? metadata.id : '';
    if (id && accepted.has(id)) return true;
    if (typeof value !== 'string' || !value.trim()) return false;
    const text = value.trim();
    if (text.length > SELECTION_LIMIT) { onRejected?.('选中文字超过 2000 字，请缩小选区后再试。'); return false; }
    const draft = getDraft();
    const next = draft.trim() === text ? draft : [draft, text].filter(Boolean).join('\n\n');
    if (next.length > SELECTION_LIMIT) { onRejected?.('输入框已有草稿，请先发送或缩短草稿后再传入文字。', true); return false; }
    setDraft(next);
    onAccepted?.(next);
    if (id) { accepted.add(id); if (accepted.size > 100) accepted.delete(accepted.values().next().value); }
    return true;
  };
}

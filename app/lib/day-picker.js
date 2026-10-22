// Gesture rules for picking days on a calendar grid (period calendar):
//   tap           -> {type:'tap', date}
//   hold, release -> {type:'edit', date}           (long press opens the editor)
//   drag          -> {type:'range', from, to}      (mouse: drag directly;
//                                                  touch: hold first, so an
//                                                  ordinary scroll never writes)
// Cancel (pointercancel, blur, Escape, hidden page) always yields nothing.
// DOM-free; the page feeds it pointer facts and applies the result once.
export function createDayPicker({hold = 450, slop = 10, setTimeout: later = globalThis.setTimeout, clearTimeout: stop = globalThis.clearTimeout, onHold, onPreview} = {}) {
  let g = null;
  const preview = () => onPreview?.(g?.dragging ? [g.date, g.to].sort() : null);
  return {
    down({date, x, y, mouse = false, disabled = false}) {
      this.cancel();
      if (disabled || !date) return false;
      g = {date, to: date, x, y, mouse, held: false, dragging: false};
      const current = g;
      g.timer = later(() => { if (g !== current) return; g.held = true; onHold?.(date); }, hold);
      return true;
    },
    // `date` is the enabled day under the pointer, or null when outside the grid.
    move({x, y, date}) {
      if (!g) return 'idle';
      const moved = Math.hypot(x - g.x, y - g.y) > slop;
      if (!moved && !g.dragging) return 'still';
      if (!g.mouse && !g.held && !g.dragging) { this.cancel(); return 'scroll'; }
      g.dragging = true; stop(g.timer);
      if (date) g.to = date;
      preview();
      return 'drag';
    },
    up() {
      const current = g;
      if (!current) return null;
      stop(current.timer); g = null; onPreview?.(null);
      if (current.dragging && current.to !== current.date) return {type: 'range', from: current.date, to: current.to};
      if (current.held) return {type: 'edit', date: current.date};
      if (current.dragging) return null;              // dragged out and back to the start: no write
      return {type: 'tap', date: current.date};
    },
    cancel() { if (g) { stop(g.timer); g = null; onPreview?.(null); } },
    get active() { return !!g; },
  };
}

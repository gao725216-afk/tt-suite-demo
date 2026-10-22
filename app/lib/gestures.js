// Long-press recognition shared by item rows (action menu) and the period
// calendar (day editor). DOM-free so its timing rules are testable:
//  - a press becomes "long" only after `delay` ms without moving more than
//    `slop` px; moving, scrolling, pointercancel, blur or hiding the page cancels;
//  - after a long press the synthetic click that follows is suppressed for
//    `suppress` ms, so a long press never also completes or opens the item.
export function createLongPress({delay = 500, slop = 10, suppress = 700, setTimeout: later = globalThis.setTimeout, clearTimeout: stop = globalThis.clearTimeout, now = Date.now} = {}) {
  let press = null, suppressUntil = 0;
  function cancel() { if (press && !press.fired) stop(press.timer); press = null; }
  return {
    down(point, onLong) {
      cancel();
      const current = {x: point.x, y: point.y, fired: false};
      current.timer = later(() => { if (press !== current) return; current.fired = true; suppressUntil = now() + suppress; onLong?.(); }, delay);
      press = current;
    },
    move(point) { if (press && !press.fired && Math.hypot(point.x - press.x, point.y - press.y) > slop) cancel(); },
    // Returns 'long' when the press already fired, otherwise 'tap' (or 'none').
    up() { const result = !press ? 'none' : press.fired ? 'long' : 'tap'; cancel(); return result; },
    cancel,
    get pending() { return !!press && !press.fired; },
    shouldSuppressClick: () => now() < suppressUntil,
  };
}

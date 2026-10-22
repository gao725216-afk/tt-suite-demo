// Motion policy, DOM-light so it can be tested:
//  - entrances play once per key (e.g. a garden scene) within `duration`;
//    re-renders during that window keep the same entrance, later renders and
//    reduced motion get none;
//  - exits finish exactly once (animation end or timeout), or immediately
//    when reduced motion is on.
export function createEntrances({duration = 1100, now = () => performance.now(), reduced = () => false} = {}) {
  const started = new Map();
  return {
    entering(key) {
      if (reduced()) return false;
      if (!started.has(key)) started.set(key, now());
      return now() - started.get(key) < duration;
    },
    forget(key) { started.delete(key); },
  };
}

export function runExit(el, {reduced, finish, wait = globalThis.setTimeout, timeout = 320}) {
  let done = false;
  const end = () => { if (!done) { done = true; finish(); } };
  if (reduced) { end(); return; }
  el.classList.add('closing');
  el.addEventListener('animationend', end, {once: true});
  wait(end, timeout);
}

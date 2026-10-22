// One state container. Domains own named slices; views read state and call
// actions. Renders are batched into one animation frame.
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  let queued = false;
  const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
  function notify() {
    if (queued) return;
    queued = true;
    schedule(() => { queued = false; for (const listener of listeners) listener(state); });
  }
  return {
    get: () => state,
    // Shallow-merge a slice: store.set('ui', {mode: 'board'}).
    set(slice, patch) {
      const previous = state[slice];
      const next = typeof patch === 'function' ? patch(previous) : {...previous, ...patch};
      if (next === previous) return;
      state = {...state, [slice]: next};
      notify();
    },
    replace(slice, value) { state = {...state, [slice]: value}; notify(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    notify,
    flushSync() { queued = false; for (const listener of listeners) listener(state); },
  };
}

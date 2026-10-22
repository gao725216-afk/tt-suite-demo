// Offline-only focus adapter. Deliberately contains no fetch, XHR or authentication.
import {focusCore} from '../core.js';
import {FOCUS_KEY, loadFocus, loadDemo} from './demo.js';
let focus = loadFocus();
export async function request(path, body) {
  if (path !== 'local:focus') throw new Error('此功能未在公开演示中开放。');
  if (body !== undefined) {
    const task = loadDemo().schedule.events.find(event => event.id === body.eventId);
    try { focus = focusCore.apply(focus, body, {now: Date.now(), owner: 'local-demo', device: '当前浏览器', task}); }
    catch (error) { error.current = {...structuredClone(focus), serverTime: Date.now(), canControl: true}; throw error; }
    try { localStorage.setItem(FOCUS_KEY, JSON.stringify(focus)); } catch { throw Object.assign(new Error('浏览器存储不可用，计时只保留在当前页面。'), {status: 507}); }
  }
  return {...structuredClone(focus), serverTime: Date.now(), canControl: true};
}

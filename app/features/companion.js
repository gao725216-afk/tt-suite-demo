// Original neutral sprout drawn only with basic SVG geometry. No third-party character art.
import {html, raw} from '../lib/html.js';
const SPROUT = '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><ellipse cx="60" cy="105" rx="35" ry="7" fill="#423a72" opacity=".09"/><path d="M60 89V45" stroke="#28876a" stroke-width="6" stroke-linecap="round"/><path d="M60 65C34 65 23 49 27 29C49 28 64 42 60 65Z" fill="#73d6a4"/><path d="M61 53C61 29 77 17 97 20C100 42 85 56 61 53Z" fill="#b0df77"/><path d="M40 43L58 62M78 35L64 49" stroke="#28876a" stroke-width="3" stroke-linecap="round" opacity=".4"/><path d="M34 80H86L80 105H40L34 80Z" fill="#b49beb"/><path d="M31 79C31 76 33 74 36 74H84C87 74 89 76 89 79V83H31V79Z" fill="#d8c6ff"/><path d="M47 87V98" stroke="#dfd3f8" stroke-width="5" stroke-linecap="round"/></svg>';
export const COMPANIONS = [{id: 'sprout', name: '小芽'}];
export function companionStage(state, app, size = 'md', key = 'panel') { return html`<span class="demo-sprout ${'sprout-' + size}" data-key="${'sprout-' + key}">${raw(SPROUT)}</span>`; }
export const companionAvatar = (state, app) => companionStage(state, app, 'sm', 'topbar');
export function registerCompanion(app) {
  const say = text => app.toast(text, {iconName: 'leaf'});
  app.view('companion', {current: () => 'sprout', label: () => '原创小芽', say, celebrate: () => {}, set: () => {}});
  app.on('companion.poke', el => { el?.querySelector('.demo-sprout')?.animate?.([{transform: 'rotate(0deg)'}, {transform: 'rotate(-9deg) translateY(-6px)'}, {transform: 'rotate(7deg)'}, {transform: 'rotate(0deg)'}], {duration: 650}); say('从一个小小的行动开始 🌱'); });
}

import {html} from '../lib/html.js';
import {frame} from './overlays.js';
import {downloadText} from '../lib/download.js';
import {today} from '../lib/dates.js';
export function exportBackup(app) {
  downloadText(JSON.stringify({schema: 'tt-public-demo-v1', ...app.state.doc}, null, 2), 'tt-demo-backup-' + today() + '.json', 'application/json');
}
export function registerSyncUi(app) {
  app.view('sync', {openConflict: () => {}, openExpired: () => {}});
  app.on('sync.open', () => app.overlays.show('sync', {size: 'small', render: state => frame({title: '本地演示数据', body: html`<div class="stack"><p>${state.sync.message}</p><p>修改只保存在当前浏览器，不会上传到服务器，也不会在设备之间同步。清除浏览器数据会丢失修改。</p><p class="hint">公开页面不包含任何真实用户数据。请勿输入真实隐私信息。</p></div>`, foot: html`<button type="button" class="btn btn-quiet" data-act="sync.export">导出演示备份</button><button type="button" class="btn btn-primary" data-act="overlay.close">知道了</button>`})}));
  app.on('sync.export', () => exportBackup(app));
  app.on('sync.retry', () => app.sync.retry());
}

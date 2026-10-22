import {html, attr} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {frame} from '../shell/overlays.js';
import {restoreItem} from '../domain/items.js';
import {exportBackup} from '../shell/sync-ui.js';
export function registerSettings(app) {
  app.view('settings', {render: state => ({title: '设置', subtitle: '前端演示与本地数据', body: html`<div class="demo-settings stack">
  <section class="panel panel-pad"><div class="section-title"><h2>关于这个演示</h2></div><p>TT 将日程、任务、专注和成长花园连接在一起。这是原应用界面的静态交互演示，所有初始内容均为虚构。</p><p class="hint">没有账号、云同步、真实 AI、微信通知或文件上传。所有修改仅保存在当前浏览器，请勿输入真实隐私信息。</p><div class="actions"><button type="button" class="btn btn-quiet" data-act="demo.about">查看演示说明</button></div></section>
  <section class="panel panel-pad"><div class="section-title"><h2>外观</h2></div><label class="field">主题<select class="select" data-change="settings.theme"><option value="light"${attr('selected', document.documentElement.dataset.theme === 'light')}>浅色</option><option value="dark"${attr('selected', document.documentElement.dataset.theme === 'dark')}>深色</option><option value="auto"${attr('selected', !document.documentElement.dataset.theme)}>跟随系统</option></select></label></section>
  <section class="panel panel-pad"><div class="section-title"><h2>本地数据</h2></div><p class="small">${state.sync.message}。导出文件仅保存到你的设备。重置会清除本浏览器中的演示修改。</p><div class="actions"><button type="button" class="btn btn-quiet" data-act="sync.export">${icon('download')}导出备份</button><button type="button" class="btn btn-danger-quiet" data-act="demo.resetPrompt">重置演示数据</button></div></section>
  <section class="panel panel-pad"><div class="section-title"><h2>最近删除</h2><span class="count">${(state.doc.schedule.trash || []).length}</span></div>${(state.doc.schedule.trash || []).length ? html`<ul class="items mini">${state.doc.schedule.trash.map(row => html`<li class="item"><span class="item-body">${row.event.title}</span><button type="button" class="btn btn-quiet btn-sm" data-act="settings.restore" data-id="${row.id}">恢复</button></li>`)}</ul>` : html`<p class="small">还没有已删除的演示事项。</p>`}</section>
  <section class="panel panel-pad"><div class="section-title"><h2>素材说明</h2></div><p class="small">花园使用 Kenney Hexagon Tiles（CC0）素材。小芽为本演示使用基础 SVG 几何绘制的原创中性图形，不使用第三方角色素材。</p><a class="link-btn" href="./assets/garden/kenney-hexagon/license.txt" target="_blank" rel="noopener">查看花园素材许可</a></section>
  </div>`})});
  app.on('settings.theme', input => { const v = input.value; if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v; try { localStorage.setItem('tt-public-demo-theme', v); } catch {} });
  app.on('settings.restore', el => app.commit(draft => restoreItem(draft, el.dataset.id), {message: '事项已恢复'}));
  app.on('demo.resetPrompt', () => app.overlays.show('demo-reset', {size: 'small', render: () => frame({title: '重置演示数据？', body: html`<p>这会清除当前浏览器中的任务、日程、笔记、习惯、花园修改与专注记录，重新生成虚构演示内容。可先导出备份。</p>`, foot: html`<button type="button" class="btn btn-quiet left" data-act="sync.export">导出备份</button><button type="button" class="btn btn-quiet" data-act="overlay.close">取消</button><button type="button" class="btn btn-primary" data-act="demo.reset">确认重置</button>`})}));
  app.on('demo.reset', () => { app.sync.reset(); location.reload(); });
  try { const theme = localStorage.getItem('tt-public-demo-theme'); if (theme === 'auto') delete document.documentElement.dataset.theme; else if (['light', 'dark'].includes(theme)) document.documentElement.dataset.theme = theme; } catch {}
}

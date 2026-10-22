// Informational placeholder, not a simulated AI conversation.
import {html} from '../lib/html.js';
import {frame} from '../shell/overlays.js';
export function registerAssistant(app) {
  const open = () => app.overlays.show('demo-about', {size: 'small', label: '前端演示说明', render: () => frame({title: 'TT · 前端交互演示', body: html`<div class="stack"><p>这是 TT 日程与成长应用的公开前端演示，使用虚构日程、任务与完成记录。</p><p>可以体验：任务新增与编辑、完成与撤销、日历排期、专注计时、笔记、习惯及成长花园。</p><div class="callout callout-warn"><div><b>仅当前浏览器保存</b><p>这里没有真实 AI 服务、账号登录、云同步、微信通知或文件上传。请勿填写真实隐私信息。清除浏览器数据会丢失修改。</p></div></div><p class="hint">你可以在设置中导出本地数据，或重置为全新的虚构演示数据。</p></div>`, foot: html`<button type="button" class="btn btn-primary" data-act="overlay.close">开始体验</button>`})});
  app.view('assistant', {toggle: open, panel: () => '', breakdown: open, decompose: open});
  app.on('assistant.toggle', open); app.on('demo.about', open);
}

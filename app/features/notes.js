// 笔记: independent Markdown notes stored in schedule.library.notes and synced
// with the account. The unsaved draft lives on this device
// (tt-note-draft:<uid>) together with the version it started from, so an
// edit made elsewhere is detected before it could be overwritten.
import {html, raw, attr, cx} from '../lib/html.js';
import {icon} from '../lib/icons.js';
import {workspace} from '../core.js';
import {downloadText, safeFilename} from '../lib/download.js';
import {relativeDay, shortDate} from '../lib/dates.js';

export function registerNotes(app) {
  const draftKey = 'tt-note-draft:' + app.user.id;
  let draft = null, base = null;
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if (saved?.id) { ({base = null, ...draft} = saved); }
  } catch {}
  const ui = () => ({id: draft?.id || '', trash: false, query: '', preview: false, conflict: false, open: !!draft, ...app.ui('notes')});
  const notes = () => workspace.get(app.state.doc.schedule).notes || [];
  const stored = id => notes().find(n => n.id === id) || null;
  const current = () => draft || stored(ui().id);
  const persist = () => { try { if (draft) localStorage.setItem(draftKey, JSON.stringify({...draft, base})); else localStorage.removeItem(draftKey); } catch {} };
  const bump = patch => app.setUi('notes', {...patch, rev: Date.now()});

  function guard(message = '请先保存当前草稿，或导出 Markdown 后载入本地记录。') {
    if (draft) { app.toast(message, {tone: 'error'}); return false; }
    return true;
  }
  function select(id) {
    if (draft && draft.id !== id && !guard()) return;
    if (draft && draft.id === id) { bump({id, open: true}); return; }
    bump({id, open: true, conflict: false, preview: false});
  }
  function create() {
    if (!guard()) return;
    if (app.state.route.view !== 'notes') app.go('notes');
    draft = {id: 'note-' + crypto.randomUUID(), title: '未命名笔记', body: '', updatedAt: new Date().toISOString(), deletedAt: ''};
    base = null; persist();
    bump({id: draft.id, trash: false, preview: false, open: true, conflict: false});
    requestAnimationFrame(() => { const t = document.querySelector('.note-title-input'); t?.focus(); t?.select(); });
  }
  function save(overwrite = false) {
    const note = current();
    if (!note || note.deletedAt) return;
    const latest = stored(note.id);
    if (latest?.deletedAt) throw new Error('这篇笔记已移入回收站，请先恢复。');
    if (!overwrite && draft && JSON.stringify(latest || null) !== JSON.stringify(base)) { bump({conflict: true}); return; }
    const title = String(note.title || '').trim();
    if (!title) throw new Error('请填写笔记标题。');
    const row = {id: note.id, title, body: note.body, updatedAt: new Date().toISOString(), deletedAt: ''};
    app.commit(doc => { doc.schedule = workspace.put(doc.schedule, 'notes', row); }, {message: '笔记已保存', detail: title, iconName: 'notes'});
    draft = null; base = null; persist();
    bump({conflict: false});
  }
  function edit(field, value) {
    if (!draft) { const note = stored(ui().id); if (!note || note.deletedAt) return; base = structuredClone(note); draft = structuredClone(note); }
    draft[field] = value;
    persist();
    for (const el of document.querySelectorAll('[data-note-count]')) el.textContent = draft.body.length.toLocaleString() + ' 字，草稿在本机';
    if (!app.ui('notes').dirty) bump({dirty: true});
  }

  function list(state) {
    const u = ui(), all = notes(), q = u.query.toLocaleLowerCase();
    const shown = all.filter(n => !!n.deletedAt === u.trash && (!q || (n.title + ' ' + n.body).toLocaleLowerCase().includes(q))).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const extra = draft && !stored(draft.id) && !u.trash ? [draft] : [];
    return html`<aside class="note-index" aria-label="笔记列表">
  <label class="note-search">${icon('search')}<span class="sr-only">搜索笔记</span><input type="search" class="input" value="${u.query}" placeholder="搜索标题或正文" maxlength="200" data-input="notes.query"></label>
  <div class="seg note-tabs" role="group" aria-label="笔记范围"><button type="button" data-act="notes.scope" data-trash="0" aria-pressed="${!u.trash ? 'true' : 'false'}">笔记 ${all.filter(n => !n.deletedAt).length}</button><button type="button" data-act="notes.scope" data-trash="1" aria-pressed="${u.trash ? 'true' : 'false'}">${icon('trash')}回收站 ${all.filter(n => n.deletedAt).length}</button></div>
  <ul class="note-rows">${[...extra, ...shown].map(n => { const d = draft?.id === n.id ? draft : n; return html`<li><button type="button" class="${cx('note-row', u.id === n.id && 'is-current')}" data-act="notes.open" data-id="${n.id}" aria-current="${u.id === n.id ? 'page' : 'false'}">
    <b>${d.title || '未命名笔记'}${draft?.id === n.id ? html`<i class="note-dirty" title="有未保存的草稿"></i>` : ''}</b><small>${(d.body || '').replace(/[#>*`\-\n]+/g, ' ').trim().slice(0, 64) || '空白笔记'}</small><time>${relativeDay(d.updatedAt.slice(0, 10), state.today) || shortDate(d.updatedAt.slice(0, 10))}</time></button></li>`; })}</ul>
  ${!shown.length && !extra.length ? html`<p class="note-empty-list">${u.trash ? '回收站是空的。' : u.query ? '没有找到相关笔记。' : '这里还没有笔记。'}</p>` : ''}
</aside>`;
  }

  function editor(state) {
    const u = ui(), note = current();
    if (!note) return html`<section class="note-editor is-empty"><div class="empty"><div class="empty-mark">${icon('notes')}</div><h3>记下值得留下的内容</h3><p>笔记独立保存，仅保存在当前浏览器。支持 Markdown。</p><button type="button" class="btn btn-primary" data-act="notes.create">${icon('plus')}新建笔记</button></div></section>`;
    const deleted = !!note.deletedAt, latest = stored(note.id);
    return html`<section class="note-editor" aria-label="笔记内容" data-key="${'note-' + note.id}">
  <div class="note-toolbar">
    ${state.layout.compact ? html`<button type="button" class="icon-btn" data-act="notes.back" aria-label="返回笔记列表">${icon('back')}</button>` : ''}
    <div class="seg" role="group" aria-label="编辑或预览"><button type="button" data-act="notes.preview" data-on="0" aria-pressed="${!u.preview ? 'true' : 'false'}">${icon('edit')}编辑</button><button type="button" data-act="notes.preview" data-on="1" aria-pressed="${u.preview ? 'true' : 'false'}">${icon('eye')}预览</button></div>
    <span class="spacer"></span>
    <button type="button" class="btn btn-ghost btn-sm" data-act="notes.export">${icon('download')}导出 Markdown</button>
  </div>
  ${u.conflict ? html`<div class="callout callout-warn" role="alert">${icon('alert')}<div><b>这篇笔记已在另一端修改</b><p>本机草稿还在。先看看本地版本，再决定载入还是覆盖。</p><details class="note-remote"><summary>查看本地正文</summary><pre>${latest?.body || '（空）'}</pre></details><div class="actions"><button type="button" class="btn btn-quiet btn-sm" data-act="notes.reload">载入本地</button><button type="button" class="btn btn-quiet btn-sm" data-act="notes.overwrite">保留草稿覆盖</button></div></div></div>` : ''}
  <form class="note-form" data-submit="notes.save">
    <input class="note-title-input" maxlength="200" value="${note.title}" aria-label="笔记标题" placeholder="标题" data-uncontrolled data-input="notes.title"${attr('disabled', deleted)} required>
    ${u.preview ? html`<article class="markdown">${note.body ? raw(workspace.markdown(note.body)) : html`<p class="muted">还没有正文。</p>`}</article>`
      : html`<textarea class="note-body" maxlength="20000" aria-label="正文（Markdown）" placeholder="${'# 标题\n\n写下想法、步骤或参考资料'}" data-uncontrolled data-input="notes.body"${attr('disabled', deleted)}>${note.body}</textarea>`}
    <div class="note-foot">
      <span class="hint" data-note-count>${note.body.length.toLocaleString()} 字，${draft ? '草稿在本机' : deleted ? '在回收站' : '已保存的版本'}</span>
      <span class="hint note-sync" data-sync-message><i class="dot" data-tone="${state.sync.pending ? 'saving' : state.sync.status === 'synced' ? 'ok' : state.sync.status === 'offline' ? 'offline' : 'saving'}"></i>${state.sync.message}</span>
      <span class="spacer"></span>
      ${deleted ? html`<button type="button" class="btn btn-quiet" data-act="notes.restore">${icon('restore')}恢复笔记</button>`
        : html`${latest ? html`<button type="button" class="btn btn-ghost" data-act="notes.trash">${icon('trash')}移入回收站</button>` : draft ? html`<button type="button" class="btn btn-ghost" data-act="notes.discard">放弃草稿</button>` : ''}<button type="submit" class="btn btn-primary"${attr('disabled', !draft)}>${icon('save')}保存笔记</button>`}
    </div>
  </form>
</section>`;
  }

  app.view('notes', {
    create: () => create(),
    render(state) {
      const u = ui(), compact = state.layout.compact;
      if (!u.id && !compact) { const first = notes().filter(n => !!n.deletedAt === u.trash).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]; if (first) queueMicrotask(() => app.setUi('notes', {id: first.id})); }
      const showEditor = !compact || u.open;
      return {
        title: compact && u.open ? (current()?.title || '笔记') : '笔记',
        subtitle: compact ? '' : 'Markdown 笔记，仅本机保存',
        actions: compact ? '' : html`<button type="button" class="btn btn-quiet" data-act="notes.create">${icon('plus')}新建笔记</button>`,
        body: html`<div class="${cx('notes', compact && (u.open ? 'show-editor' : 'show-list'))}">${!compact || !u.open ? list(state) : ''}${showEditor ? editor(state) : ''}</div>`,
      };
    },
  });
  app.on('notes.create', () => create());
  app.on('notes.open', el => select(el.dataset.id));
  app.on('notes.back', () => bump({open: false}));
  app.on('notes.query', el => app.setUi('notes', {query: el.value}));
  app.on('notes.scope', el => { if (!guard('请先保存当前草稿。')) return; bump({trash: el.dataset.trash === '1', id: '', open: false}); });
  app.on('notes.preview', el => bump({preview: el.dataset.on === '1'}));
  app.on('notes.title', el => edit('title', el.value));
  app.on('notes.body', el => edit('body', el.value));
  app.on('notes.save', () => save(false));
  app.on('notes.overwrite', () => save(true));
  app.on('notes.reload', () => { draft = null; base = null; persist(); bump({conflict: false}); });
  app.on('notes.discard', () => {
    const kept = draft;
    draft = null; base = null; persist();
    bump({id: stored(kept?.id) ? kept.id : '', conflict: false});
    app.toast('草稿已放弃', {action: {label: '撤销', run: () => { draft = kept; base = stored(kept.id) ? structuredClone(stored(kept.id)) : null; persist(); bump({id: kept.id, open: true}); }}});
  });
  app.on('notes.trash', () => {
    if (!guard('请先保存或导出当前草稿。')) return;
    const note = stored(ui().id); if (!note) return;
    const now = new Date().toISOString();
    app.commit(doc => { doc.schedule = workspace.put(doc.schedule, 'notes', {...note, updatedAt: now, deletedAt: now}); }, {message: '笔记已移入回收站', detail: note.title, iconName: 'trash', undo: () => app.commit(doc => { doc.schedule = workspace.put(doc.schedule, 'notes', {...note, updatedAt: new Date().toISOString(), deletedAt: ''}); }, {quiet: true})});
    bump({id: '', open: false});
  });
  app.on('notes.restore', () => {
    const note = stored(ui().id); if (!note) return;
    app.commit(doc => { doc.schedule = workspace.put(doc.schedule, 'notes', {...note, updatedAt: new Date().toISOString(), deletedAt: ''}); }, {message: '笔记已恢复', detail: note.title, iconName: 'restore'});
    bump({trash: false});
  });
  app.on('notes.export', () => {
    const note = current();
    if (note) downloadText('# ' + note.title + '\n\n' + note.body, safeFilename(note.title) + '.md', 'text/markdown;charset=utf-8');
  });
  // Leaving with an unsaved draft: the draft stays on this device.
  window.addEventListener('beforeunload', persist);
}

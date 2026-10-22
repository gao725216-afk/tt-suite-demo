// Global "新建": context-aware defaults. Tasks go to the inbox unless the
// current list says otherwise; schedule items use the date being viewed.
export function registerCapture(app) {
  app.on('capture.open', () => {
    const {route} = app.state;
    const editor = app.getView('editor');
    if (route.view === 'calendar') { editor.openEvent(app, '', route.params.date || app.today); return; }
    if (route.view === 'notes') { app.getView('notes').create(app); return; }
    if (route.view === 'period') { app.getView('period').openRecord(app); return; }
    const preset = {};
    const list = route.params.list || '';
    if (route.view === 'tasks' && list.startsWith('list:')) { preset.listId = list.slice(5); preset.inbox = false; }
    else if (route.view === 'tasks' && list.startsWith('tag:')) { preset.tagIds = [list.slice(4)]; preset.inbox = true; }
    else preset.inbox = true;
    if (route.view === 'today' || list === 'today') preset.plannedDate = app.today;
    if (list === 'tomorrow') preset.plannedDate = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');
    editor.openTask(app, '', {preset, dialog: true});
  });
}

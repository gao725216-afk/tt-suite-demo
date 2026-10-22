import {createApp} from './app.js';
import {renderShell, registerShell} from './shell/shell.js';
import {registerSyncUi} from './shell/sync-ui.js';
import {registerToday} from './features/today.js';
import {registerCalendar} from './features/calendar.js';
import {registerTasks} from './features/tasks.js';
import {registerTaskEditor} from './features/task-editor.js';
import {registerItemMenu} from './features/item-menu.js';
import {registerCapture} from './features/capture.js';
import {registerAssistant} from './features/assistant.js';
import {registerFocus} from './features/focus.js';
import {registerGrowth} from './features/growth.js';
import {registerGarden} from './features/garden.js';
import {registerHabits} from './features/habits.js';
import {registerNotes} from './features/notes.js';
import {registerSettings} from './features/settings.js';
import {registerCompanion} from './features/companion.js';
import {createLocalSync, DEMO_USER} from './data/demo.js';

const bootEl = document.getElementById('boot');
try {
  let app;
  const sync = createLocalSync({onStatus: status => app?.store.set('sync', status)});
  app = createApp({user: DEMO_USER, doc: sync.doc, sync});
  window.TTApp = app;
  registerShell(app);
  registerSyncUi(app);
  registerCompanion(app);
  registerToday(app);
  registerCalendar(app);
  registerTasks(app);
  registerTaskEditor(app);
  registerItemMenu(app);
  registerCapture(app);
  registerAssistant(app);
  registerFocus(app);
  registerGrowth(app);
  registerGarden(app);
  registerHabits(app);
  registerNotes(app);
  registerSettings(app);
  const root = document.getElementById('app');
  app.mount(root, renderShell);
  sync.start();
  bootEl?.remove();
  root.hidden = false;
  root.removeAttribute('aria-busy');
  for (const fn of app.ready || []) fn();
} catch (error) {
  console.error(error);
  if (bootEl) { bootEl.querySelector('.boot-error').textContent = '演示加载失败：' + error.message; bootEl.querySelector('.boot-retry').hidden = false; }
}
document.querySelector('.boot-retry')?.addEventListener('click', () => location.reload());

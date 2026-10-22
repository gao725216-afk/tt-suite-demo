// Explicit boundary to the shared business rules in packages/core. The build
// copies those files unchanged and the page loads them as classic scripts (they
// are also required by the server and copied into the mini program). This
// module fails loudly instead of depending on implicit global ordering.
function need(name) {
  const value = globalThis[name];
  if (!value) throw new Error('共享规则未加载：' + name);
  return value;
}
export const occur = need('TTOccur');
export const organizer = need('TTOrganizer');
export const workspace = need('TTTaskWorkspace');
export const taskViews = need('TTTaskViews');
export const calendarViews = need('TTCalendarViews');
export const taskPlanning = need('TTTaskPlanning');
export const focusCore = need('TTFocus');
export const gardenWorld = need('TTGardenWorld');
export const periodCore = need('TTPeriodTracker');

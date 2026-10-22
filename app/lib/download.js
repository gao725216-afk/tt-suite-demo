// File export. Inside the Android WebView the native bridge writes the file
// through the system document picker; elsewhere a Blob download is used.
export function downloadText(content, filename, type = 'text/plain;charset=utf-8') {
  if (type.startsWith('application/json') && window.TTAndroidBackup?.saveJson) { window.TTAndroidBackup.saveJson(content, filename); return; }
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const safeFilename = name => String(name || '未命名').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80);

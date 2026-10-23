const { globalShortcut, clipboard } = require('electron');
const { getMainWindow, setSidebarExpandedState, setWindowIgnoreMouseSafe } = require('./window');

const SHORTCUTS = ['CommandOrControl+Shift+D', 'CommandOrControl+Shift+V'];

function captureAndSendToRenderer() {
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;

  let rawText = clipboard.readText();
  if (!rawText) {
    const html = clipboard.readHTML();
    if (html) {
      rawText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  setSidebarExpandedState(true);
  setWindowIgnoreMouseSafe(false);

  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();

  win.webContents.send('clipboard-capture', rawText || '');
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  SHORTCUTS.forEach((sc) => {
    const registered = globalShortcut.register(sc, () => {
      captureAndSendToRenderer();
    });
    if (registered) {
      console.log(`[Shortcuts] Atajo global registrado: ${sc}`);
    }
  });
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = {
  registerShortcuts,
  unregisterShortcuts,
  captureAndSendToRenderer
};

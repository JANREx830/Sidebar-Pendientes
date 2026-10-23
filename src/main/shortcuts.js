const { globalShortcut, clipboard } = require('electron');
const { getMainWindow, setSidebarExpandedState, setWindowIgnoreMouseSafe } = require('./window');

const CAPTURE_SHORTCUT = 'CommandOrControl+Shift+D';

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
  const registered = globalShortcut.register(CAPTURE_SHORTCUT, () => {
    captureAndSendToRenderer();
  });

  if (!registered) {
    console.warn(`[Shortcuts] No se pudo registrar el atajo global: ${CAPTURE_SHORTCUT}`);
  } else {
    console.log(`[Shortcuts] Atajo global registrado: ${CAPTURE_SHORTCUT}`);
  }
}

function unregisterShortcuts() {
  globalShortcut.unregisterAll();
}

module.exports = {
  registerShortcuts,
  unregisterShortcuts,
  captureAndSendToRenderer
};

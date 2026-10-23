const { ipcMain, clipboard } = require('electron');
const storage = require('./storage');
const {
  getMainWindow,
  setSidebarExpandedState,
  setWindowIgnoreMouseSafe,
  startWindowDrag,
  stopWindowDrag
} = require('./window');
const { captureAndSendToRenderer } = require('./shortcuts');

function setupIpcHandlers() {
  ipcMain.handle('get-tasks', () => storage.getTasks());
  ipcMain.handle('save-tasks', (_event, tasks) => storage.saveTasks(tasks));

  ipcMain.handle('get-settings', () => storage.getSettings());
  ipcMain.handle('save-settings', (_event, settings) => storage.saveSettings(settings));

  ipcMain.handle('read-clipboard-now', () => clipboard.readText());

  ipcMain.handle('toggle-always-on-top', () => {
    const win = getMainWindow();
    if (!win) return false;
    const nextState = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(nextState);
    storage.saveSettings({ alwaysOnTop: nextState });
    return nextState;
  });

  ipcMain.on('minimize-window', () => {
    const win = getMainWindow();
    if (win) win.minimize();
  });

  ipcMain.on('close-window', () => {
    const win = getMainWindow();
    if (win) win.hide();
  });

  ipcMain.on('trigger-capture', () => {
    captureAndSendToRenderer();
  });

  ipcMain.on('set-expanded-state', (_event, expanded) => {
    setSidebarExpandedState(Boolean(expanded));
  });

  ipcMain.on('set-ignore-mouse-events', (_event, ignore) => {
    setWindowIgnoreMouseSafe(Boolean(ignore));
  });

  // Mover ventana cuando está encogida o expandida
  ipcMain.on('start-window-drag', () => {
    startWindowDrag();
  });

  ipcMain.on('stop-window-drag', () => {
    stopWindowDrag();
  });
}

module.exports = {
  setupIpcHandlers
};

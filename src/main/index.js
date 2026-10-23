const { app } = require('electron');
const { createMainWindow, getMainWindow } = require('./window');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterShortcuts } = require('./shortcuts');
const { setupIpcHandlers } = require('./ipc');

// Bandera para diferenciar cuando la app se cierra intencionalmente (Tray o Cmd+Q en Mac)
app.isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (!win.isVisible()) win.show();
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    createMainWindow();
    createTray();
    registerShortcuts();

    app.on('activate', () => {
      const win = getMainWindow();
      if (!win) {
        createMainWindow();
      } else {
        win.show();
      }
    });
  });

  // En macOS, permitir cerrar con Cmd+Q o desde el Dock
  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('will-quit', () => {
    unregisterShortcuts();
  });
}

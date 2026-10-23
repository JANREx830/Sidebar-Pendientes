const { app, Menu } = require('electron');
const { createMainWindow, getMainWindow } = require('./window');
const { createTray } = require('./tray');
const { registerShortcuts, unregisterShortcuts } = require('./shortcuts');
const { setupIpcHandlers } = require('./ipc');

// Bandera para diferenciar cuando la app se cierra intencionalmente (Tray o Cmd+Q en Mac)
app.isQuitting = false;

// En macOS es OBLIGATORIO definir el menú de edición para que el sistema operativo permita Cmd+C y Cmd+V
function setupAppMenu() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: app.name || 'SideTask Pro',
        submenu: [
          { role: 'about', label: 'Acerca de SideTask Pro' },
          { type: 'separator' },
          { role: 'services', label: 'Servicios' },
          { type: 'separator' },
          { role: 'hide', label: 'Ocultar SideTask Pro' },
          { role: 'hideOthers', label: 'Ocultar otros' },
          { role: 'unhide', label: 'Mostrar todo' },
          { type: 'separator' },
          { role: 'quit', label: 'Salir de SideTask Pro' }
        ]
      },
      {
        label: 'Edición',
        submenu: [
          { role: 'undo', label: 'Deshacer' },
          { role: 'redo', label: 'Rehacer' },
          { type: 'separator' },
          { role: 'cut', label: 'Cortar' },
          { role: 'copy', label: 'Copiar' },
          { role: 'paste', label: 'Pegar' },
          { role: 'selectAll', label: 'Seleccionar todo' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    Menu.setApplicationMenu(null);
  }
}

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
    setupAppMenu();
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

  // En macOS, permitir cerrar limpiamente con Cmd+Q o desde el Dock
  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.on('will-quit', () => {
    unregisterShortcuts();
  });
}

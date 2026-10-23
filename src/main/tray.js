const { Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const { toggleWindowVisibility } = require('./window');
const { captureAndSendToRenderer } = require('./shortcuts');

let tray = null;

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    console.warn('[Tray] Advertencia: No se pudo cargar el archivo de icono, usando fallback.');
    icon = nativeImage.createEmpty();
  } else if (process.platform === 'darwin') {
    // En macOS la barra de menú superior usa iconos de 16x16
    icon = icon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'SideTask Pro — Sistemas & Refacciones',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Mostrar / Ocultar Sidebar',
      click: () => toggleWindowVisibility()
    },
    {
      label: 'Capturar Portapapeles Ahora',
      accelerator: 'CmdOrCtrl+Shift+D',
      click: () => captureAndSendToRenderer()
    },
    { type: 'separator' },
    {
      label: 'Salir de SideTask Pro',
      accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('SideTask Pro');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    toggleWindowVisibility();
  });

  return tray;
}

module.exports = {
  createTray
};

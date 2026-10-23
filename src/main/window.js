const { BrowserWindow, screen, app } = require('electron');
const path = require('path');
const storage = require('./storage');

let mainWindow = null;
let isSidebarExpanded = false;
let currentIgnoreState = null;
let cursorPollInterval = null;
let dragInterval = null;

function setWindowIgnoreMouseSafe(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (currentIgnoreState === ignore) return;
  currentIgnoreState = ignore;
  mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
}

function setSidebarExpandedState(expanded) {
  isSidebarExpanded = Boolean(expanded);
  if (isSidebarExpanded) {
    setWindowIgnoreMouseSafe(false);
  }
}

// Función para arrastrar la ventana suavemente a cualquier parte de la pantalla (incluso encogida)
function startWindowDrag() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (dragInterval) clearInterval(dragInterval);

  setWindowIgnoreMouseSafe(false);
  const startCursor = screen.getCursorScreenPoint();
  const startBounds = mainWindow.getBounds();

  dragInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopWindowDrag();
      return;
    }
    try {
      const currentCursor = screen.getCursorScreenPoint();
      const dx = currentCursor.x - startCursor.x;
      const dy = currentCursor.y - startCursor.y;
      mainWindow.setPosition(startBounds.x + dx, startBounds.y + dy);
    } catch (e) {
      stopWindowDrag();
    }
  }, 16);
}

function stopWindowDrag() {
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
  }
}

function startCursorHitTestWatcher() {
  if (cursorPollInterval) clearInterval(cursorPollInterval);

  cursorPollInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

    // Si se está moviendo la barra o está expandida, nunca ignorar el mouse
    if (dragInterval || isSidebarExpanded) {
      setWindowIgnoreMouseSafe(false);
      return;
    }

    try {
      const cursor = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();

      const interactiveLeftEdge = bounds.x + bounds.width - 104;

      const isOverRailOrToggle = (
        cursor.x >= interactiveLeftEdge &&
        cursor.x <= bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y <= bounds.y + bounds.height
      );

      setWindowIgnoreMouseSafe(!isOverRailOrToggle);
    } catch (e) {
      // Ignorar errores transitorios
    }
  }, 40);
}

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const winWidth = 440;
  const winHeight = Math.min(760, height - 48);
  const winX = Math.max(0, width - winWidth);
  const winY = Math.max(16, Math.round((height - winHeight) / 2));

  const savedSettings = storage.getSettings();

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: savedSettings.alwaysOnTop ?? true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Soporte nativo en macOS para flotar sobre todos los escritorios
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  startCursorHitTestWatcher();

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    stopWindowDrag();
    if (cursorPollInterval) {
      clearInterval(cursorPollInterval);
      cursorPollInterval = null;
    }
    mainWindow = null;
  });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function toggleWindowVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    setWindowIgnoreMouseSafe(false);
    mainWindow.show();
    mainWindow.focus();
  }
}

module.exports = {
  createMainWindow,
  getMainWindow,
  toggleWindowVisibility,
  setSidebarExpandedState,
  setWindowIgnoreMouseSafe,
  startWindowDrag,
  stopWindowDrag
};

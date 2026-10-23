const { BrowserWindow, screen, app } = require('electron');
const path = require('path');
const storage = require('./storage');

let mainWindow = null;
let isSidebarExpanded = true;
let dragInterval = null;
let resizeInterval = null;

// Dimensiones mínimas y máximas ("achicar hasta cierto punto")
const COLLAPSED_THICKNESS = 76; // 68px de cápsula + 8px de margen para borde
const MIN_COLLAPSED_LENGTH = 250;
const MIN_EXPANDED_WIDTH = 300;
const MAX_EXPANDED_WIDTH = 680;
const MIN_EXPANDED_HEIGHT = 320;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function getActiveWorkArea() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    if (display && display.workArea) return display.workArea;
  }
  return screen.getPrimaryDisplay().workArea;
}

function notifyLayoutToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const settings = storage.getSettings();
  mainWindow.webContents.send('window-layout-updated', {
    orientation: settings.orientation || 'vertical',
    dockSide: settings.dockSide || 'right',
    isExpanded: isSidebarExpanded,
    collapsedLength: settings.collapsedLength || 460,
    expandedWidth: settings.expandedWidth || 400,
    expandedHeight: settings.expandedHeight || 600
  });
}

/**
 * Ajusta el tamaño real de la ventana de Electron exactamente al tamaño de la barra
 * para que en Mac y Windows NUNCA exista una segunda ventana fantasma detrás.
 */
function setSidebarExpandedState(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const prevExpanded = isSidebarExpanded;
  isSidebarExpanded = Boolean(expanded);

  const settings = storage.getSettings();
  const wa = getActiveWorkArea();
  const oldBounds = mainWindow.getBounds();

  const orientation = settings.orientation || 'vertical';
  const dockSide = settings.dockSide || 'right';

  const expW = clamp(settings.expandedWidth || 400, MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, wa.width - 16));
  const expH = clamp(settings.expandedHeight || 600, MIN_EXPANDED_HEIGHT, wa.height - 16);
  const colLen = clamp(
    settings.collapsedLength || 460,
    MIN_COLLAPSED_LENGTH,
    orientation === 'horizontal' ? wa.width - 16 : wa.height - 16
  );

  let targetW, targetH, targetX, targetY;

  if (isSidebarExpanded) {
    targetW = expW;
    targetH = expH;

    if (!prevExpanded) {
      // Expandiendo desde estado colapsado: mantener anclado el borde correspondiente
      if (dockSide === 'right') {
        targetX = oldBounds.x + oldBounds.width - targetW;
        targetY = oldBounds.y;
      } else if (dockSide === 'left') {
        targetX = oldBounds.x;
        targetY = oldBounds.y;
      } else if (dockSide === 'top') {
        targetX = oldBounds.x;
        targetY = oldBounds.y;
      } else if (dockSide === 'bottom') {
        targetX = oldBounds.x;
        targetY = oldBounds.y + oldBounds.height - targetH;
      }
    } else {
      targetX = oldBounds.x;
      targetY = oldBounds.y;
    }
  } else {
    // Colapsando a barra delgada (Vertical u Horizontal)
    if (orientation === 'horizontal') {
      targetW = colLen;
      targetH = COLLAPSED_THICKNESS;
    } else {
      targetW = COLLAPSED_THICKNESS;
      targetH = colLen;
    }

    if (prevExpanded) {
      if (dockSide === 'right') {
        targetX = oldBounds.x + oldBounds.width - targetW;
        targetY = oldBounds.y;
      } else if (dockSide === 'left') {
        targetX = oldBounds.x;
        targetY = oldBounds.y;
      } else if (dockSide === 'top') {
        targetX = oldBounds.x;
        targetY = oldBounds.y;
      } else if (dockSide === 'bottom') {
        targetX = oldBounds.x;
        targetY = oldBounds.y + oldBounds.height - targetH;
      }
    } else {
      targetX = oldBounds.x;
      targetY = oldBounds.y;
    }
  }

  targetX = clamp(Math.round(targetX), wa.x + 2, wa.x + wa.width - targetW - 2);
  targetY = clamp(Math.round(targetY), wa.y + 2, wa.y + wa.height - targetH - 2);

  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setBounds({
    x: targetX,
    y: targetY,
    width: Math.round(targetW),
    height: Math.round(targetH)
  }, false);

  storage.saveSettings({ winX: targetX, winY: targetY });
  notifyLayoutToRenderer();
}

/**
 * Arrastre libre de la barra:
 * - Si el usuario la lleva arriba o abajo de la pantalla -> se transforma en HORIZONTAL automáticamente.
 * - Si la lleva a la izquierda o derecha -> se transforma en VERTICAL automáticamente.
 * - Al soltar el mouse, se queda 100% estática donde la dejó.
 */
function startWindowDrag() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopWindowDrag();
  stopWindowResize();

  mainWindow.setIgnoreMouseEvents(false);
  const startCursor = screen.getCursorScreenPoint();
  const startBounds = mainWindow.getBounds();

  // Posición relativa del cursor dentro de la barra (0 a 1)
  const relX = clamp((startCursor.x - startBounds.x) / Math.max(1, startBounds.width), 0.15, 0.85);
  const relY = clamp((startCursor.y - startBounds.y) / Math.max(1, startBounds.height), 0.15, 0.85);

  let currentSettings = storage.getSettings();
  let liveOrientation = currentSettings.orientation || 'vertical';
  let liveDockSide = currentSettings.dockSide || 'right';

  dragInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopWindowDrag();
      return;
    }
    try {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const wa = display.workArea;

      // Detectar si está cerca de arriba/abajo (Horizontal) o izquierda/derecha (Vertical)
      const topThreshold = wa.y + 85;
      const bottomThreshold = wa.y + wa.height - 85;

      let nextOrientation = liveOrientation;
      let nextDockSide = liveDockSide;

      if (cursor.y <= topThreshold) {
        nextOrientation = 'horizontal';
        nextDockSide = 'top';
      } else if (cursor.y >= bottomThreshold) {
        nextOrientation = 'horizontal';
        nextDockSide = 'bottom';
      } else {
        nextOrientation = 'vertical';
        nextDockSide = cursor.x < (wa.x + wa.width / 2) ? 'left' : 'right';
      }

      const bounds = mainWindow.getBounds();
      let newW = bounds.width;
      let newH = bounds.height;

      // Si estamos en modo colapsado y cambió entre vertical y horizontal, girar dimensiones en vivo
      if (!isSidebarExpanded && nextOrientation !== liveOrientation) {
        const colLen = clamp(
          currentSettings.collapsedLength || 460,
          MIN_COLLAPSED_LENGTH,
          nextOrientation === 'horizontal' ? wa.width - 16 : wa.height - 16
        );
        if (nextOrientation === 'horizontal') {
          newW = colLen;
          newH = COLLAPSED_THICKNESS;
        } else {
          newW = COLLAPSED_THICKNESS;
          newH = colLen;
        }
      }

      let newX, newY;
      if (!isSidebarExpanded && nextOrientation !== (currentSettings.orientation || 'vertical')) {
        // Mantener la barra centrada bajo el cursor tras girar
        newX = Math.round(cursor.x - newW * relX);
        newY = Math.round(cursor.y - newH * relY);
      } else {
        const dx = cursor.x - startCursor.x;
        const dy = cursor.y - startCursor.y;
        newX = Math.round(startBounds.x + dx);
        newY = Math.round(startBounds.y + dy);
      }

      newX = clamp(newX, wa.x + 2, wa.x + wa.width - newW - 2);
      newY = clamp(newY, wa.y + 2, wa.y + wa.height - newH - 2);

      mainWindow.setBounds({ x: newX, y: newY, width: newW, height: newH }, false);

      if (nextOrientation !== liveOrientation || nextDockSide !== liveDockSide) {
        liveOrientation = nextOrientation;
        liveDockSide = nextDockSide;
        storage.saveSettings({
          orientation: liveOrientation,
          dockSide: liveDockSide,
          winX: newX,
          winY: newY
        });
        notifyLayoutToRenderer();
      }
    } catch (e) {
      stopWindowDrag();
    }
  }, 16);
}

function stopWindowDrag() {
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      storage.saveSettings({ winX: b.x, winY: b.y });
      notifyLayoutToRenderer();
    }
  }
}

/**
 * Redimensionar ("achicar hasta cierto punto" o agrandar) tanto en modo colapsado como expandido
 */
function startWindowResize(direction = 'bottom-right') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopWindowDrag();
  stopWindowResize();

  const startCursor = screen.getCursorScreenPoint();
  const startBounds = mainWindow.getBounds();
  const settings = storage.getSettings();
  const orientation = settings.orientation || 'vertical';

  resizeInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopWindowResize();
      return;
    }
    try {
      const cursor = screen.getCursorScreenPoint();
      const wa = getActiveWorkArea();
      const dx = cursor.x - startCursor.x;
      const dy = cursor.y - startCursor.y;

      let newX = startBounds.x;
      let newY = startBounds.y;
      let newW = startBounds.width;
      let newH = startBounds.height;

      if (!isSidebarExpanded || direction === 'collapsed-end') {
        // Achicar o alargar la cápsula colapsada
        if (orientation === 'horizontal') {
          newW = clamp(startBounds.width + dx, MIN_COLLAPSED_LENGTH, wa.width - 16);
          newH = COLLAPSED_THICKNESS;
        } else {
          newW = COLLAPSED_THICKNESS;
          newH = clamp(startBounds.height + dy, MIN_COLLAPSED_LENGTH, wa.height - 16);
        }
      } else {
        // Achicar o agrandar el panel expandido
        if (direction.includes('right')) {
          newW = clamp(startBounds.width + dx, MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, wa.width - 16));
        }
        if (direction.includes('left')) {
          const proposedW = clamp(startBounds.width - dx, MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, wa.width - 16));
          newX = startBounds.x + (startBounds.width - proposedW);
          newW = proposedW;
        }
        if (direction.includes('bottom')) {
          newH = clamp(startBounds.height + dy, MIN_EXPANDED_HEIGHT, wa.height - 16);
        }
        if (direction.includes('top')) {
          const proposedH = clamp(startBounds.height - dy, MIN_EXPANDED_HEIGHT, wa.height - 16);
          newY = startBounds.y + (startBounds.height - proposedH);
          newH = proposedH;
        }
      }

      mainWindow.setBounds({
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH)
      }, false);
    } catch (e) {
      stopWindowResize();
    }
  }, 16);
}

function stopWindowResize() {
  if (resizeInterval) {
    clearInterval(resizeInterval);
    resizeInterval = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      const settings = storage.getSettings();
      if (!isSidebarExpanded) {
        const len = (settings.orientation === 'horizontal') ? b.width : b.height;
        storage.saveSettings({ collapsedLength: len, winX: b.x, winY: b.y });
      } else {
        storage.saveSettings({
          expandedWidth: b.width,
          expandedHeight: b.height,
          winX: b.x,
          winY: b.y
        });
      }
      notifyLayoutToRenderer();
    }
  }
}

/**
 * Alternar manualmente entre Vertical y Horizontal con 1 clic
 */
function toggleOrientation() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const settings = storage.getSettings();
  const wa = getActiveWorkArea();
  const nextOrientation = settings.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  const nextDockSide = nextOrientation === 'horizontal' ? 'top' : 'right';

  storage.saveSettings({
    orientation: nextOrientation,
    dockSide: nextDockSide
  });

  if (!isSidebarExpanded) {
    const colLen = clamp(
      settings.collapsedLength || 460,
      MIN_COLLAPSED_LENGTH,
      nextOrientation === 'horizontal' ? wa.width - 16 : wa.height - 16
    );
    const b = mainWindow.getBounds();
    const newW = nextOrientation === 'horizontal' ? colLen : COLLAPSED_THICKNESS;
    const newH = nextOrientation === 'horizontal' ? COLLAPSED_THICKNESS : colLen;
    const newX = clamp(b.x, wa.x + 4, wa.x + wa.width - newW - 4);
    const newY = clamp(b.y, wa.y + 4, wa.y + wa.height - newH - 4);
    mainWindow.setBounds({ x: newX, y: newY, width: newW, height: newH }, false);
    storage.saveSettings({ winX: newX, winY: newY });
  }

  notifyLayoutToRenderer();
}

function setWindowIgnoreMouseSafe(_ignore) {
  // Como la ventana de Electron ahora mide exactamente lo mismo que la cápsula,
  // nunca necesitamos bloquear eventos ni crear zonas muertas transparentes.
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(false);
}

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const wa = primaryDisplay.workArea;
  const savedSettings = storage.getSettings();

  isSidebarExpanded = true;
  const winWidth = clamp(savedSettings.expandedWidth || 400, MIN_EXPANDED_WIDTH, Math.min(MAX_EXPANDED_WIDTH, wa.width - 16));
  const winHeight = clamp(savedSettings.expandedHeight || 600, MIN_EXPANDED_HEIGHT, wa.height - 24);

  const defaultX = wa.x + wa.width - winWidth - 8;
  const defaultY = wa.y + Math.max(12, Math.round((wa.height - winHeight) / 2));

  const winX = typeof savedSettings.winX === 'number'
    ? clamp(savedSettings.winX, wa.x + 2, wa.x + wa.width - winWidth - 2)
    : defaultX;
  const winY = typeof savedSettings.winY === 'number'
    ? clamp(savedSettings.winY, wa.y + 2, wa.y + wa.height - winHeight - 2)
    : defaultY;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 60,
    minHeight: 60,
    x: winX,
    y: winY,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: savedSettings.alwaysOnTop ?? true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Soporte nativo en macOS para flotar sobre todos los escritorios sin ventana fantasma detrás
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.webContents.on('did-finish-load', () => {
    notifyLayoutToRenderer();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    stopWindowDrag();
    stopWindowResize();
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
    mainWindow.setIgnoreMouseEvents(false);
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
  stopWindowDrag,
  startWindowResize,
  stopWindowResize,
  toggleOrientation
};

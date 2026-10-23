const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Cada computadora (Windows o Mac) guarda sus propios datos de forma independiente en su carpeta del sistema
const dataFilePath = path.join(app.getPath('userData'), 'sidetask-data.json');

const DEFAULT_STORE = {
  tasks: [],
  settings: {
    accentColor: '#06b6d4',
    opacity: 88,
    blur: 20,
    alwaysOnTop: true,
    geminiApiKey: '',
    autoCollapseOnLeave: false,
    areas: ['Refacciones', 'Sistemas'],
    orientation: 'vertical', // 'vertical' | 'horizontal'
    dockSide: 'right',       // 'right' | 'left' | 'top' | 'bottom'
    collapsedLength: 460,    // Largo de la cápsula encogida (achicable hasta 260px)
    expandedWidth: 400,      // Ancho del panel abierto (achicable hasta 300px)
    expandedHeight: 600,     // Alto del panel abierto (achicable hasta 320px)
    winX: null,
    winY: null
  }
};

function readStore() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf-8');
      const data = JSON.parse(raw);
      const settings = { ...DEFAULT_STORE.settings, ...(data.settings || {}) };
      if (!Array.isArray(settings.areas) || settings.areas.length === 0) {
        settings.areas = [...DEFAULT_STORE.settings.areas];
      }
      const cleanTasks = Array.isArray(data.tasks)
        ? data.tasks.filter(t => !String(t.id || '').startsWith('demo-'))
        : [];
      return {
        tasks: cleanTasks,
        settings
      };
    }
  } catch (err) {
    console.error('[Storage] Error leyendo datos locales:', err);
  }
  return {
    tasks: [],
    settings: { ...DEFAULT_STORE.settings, areas: [...DEFAULT_STORE.settings.areas] }
  };
}

function writeStore(data) {
  try {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(dataFilePath, jsonString, 'utf-8');
    return true;
  } catch (err) {
    console.error('[Storage] Error guardando datos locales:', err);
    return false;
  }
}

function getTasks() {
  return readStore().tasks;
}

function saveTasks(tasks) {
  const store = readStore();
  store.tasks = Array.isArray(tasks) ? tasks : [];
  return writeStore(store);
}

function getSettings() {
  return readStore().settings;
}

function saveSettings(settings) {
  const store = readStore();
  store.settings = { ...store.settings, ...settings };
  return writeStore(store);
}

module.exports = {
  getTasks,
  saveTasks,
  getSettings,
  saveSettings
};

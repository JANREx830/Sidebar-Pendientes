const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Ruta oficial en AppData del sistema operativo y respaldo directo en la carpeta del proyecto
const dataFilePath = path.join(app.getPath('userData'), 'sidetask-data.json');
const localBackupPath = path.join(__dirname, '../../datos-guardados.json');

const DEFAULT_STORE = {
  tasks: [],
  settings: {
    accentColor: '#06b6d4',
    opacity: 84,
    blur: 20,
    alwaysOnTop: true,
    geminiApiKey: '',
    autoCollapseOnLeave: false,
    areas: ['Refacciones', 'Sistemas']
  }
};

function readStore() {
  try {
    const targetPath = fs.existsSync(dataFilePath)
      ? dataFilePath
      : (fs.existsSync(localBackupPath) ? localBackupPath : null);

    if (targetPath) {
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const data = JSON.parse(raw);
      const settings = { ...DEFAULT_STORE.settings, ...(data.settings || {}) };
      if (!Array.isArray(settings.areas) || settings.areas.length === 0) {
        settings.areas = DEFAULT_STORE.settings.areas;
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
  return DEFAULT_STORE;
}

function writeStore(data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(dataFilePath, jsonString, 'utf-8');
    // Guardar copia de respaldo en la carpeta del proyecto
    try {
      fs.writeFileSync(localBackupPath, jsonString, 'utf-8');
    } catch (backupErr) {
      // Ignorar si la carpeta del proyecto es de solo lectura
    }
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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onClipboardCapture: (callback) => {
    ipcRenderer.on('clipboard-capture', (_event, text) => callback(text));
  },
  onTriggerPasteFromMenu: (callback) => {
    ipcRenderer.on('trigger-paste-from-menu', () => callback());
  },
  onWindowLayoutUpdated: (callback) => {
    ipcRenderer.on('window-layout-updated', (_event, layout) => callback(layout));
  },
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  saveTasks: (tasks) => ipcRenderer.invoke('save-tasks', tasks),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  readClipboardNow: () => ipcRenderer.invoke('read-clipboard-now'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  triggerCapture: () => ipcRenderer.send('trigger-capture'),
  setExpandedState: (expanded) => {
    ipcRenderer.send('set-expanded-state', Boolean(expanded));
  },
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
  startWindowDrag: () => ipcRenderer.send('start-window-drag'),
  stopWindowDrag: () => ipcRenderer.send('stop-window-drag'),
  startWindowResize: (direction) => ipcRenderer.send('start-window-resize', direction),
  stopWindowResize: () => ipcRenderer.send('stop-window-resize'),
  toggleOrientation: () => ipcRenderer.send('toggle-orientation')
});

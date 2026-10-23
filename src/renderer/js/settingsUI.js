/**
 * ============================================================================
 * CONFIGURACIÓN VISUAL, ORIENTACIÓN VERTICAL/HORIZONTAL Y ÁREAS DINÁMICAS
 * ============================================================================
 */

let editingAreaOldName = null;

function hexToRgbString(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r}, ${g}, ${b}`;
}

function applySettingsToDOM() {
  const { settings } = window.AppState;
  const hex = settings.accentColor || '#06b6d4';
  const rgb = hexToRgbString(hex);

  document.documentElement.style.setProperty('--accent-color', hex);
  document.documentElement.style.setProperty('--accent-rgb', rgb);
  document.documentElement.style.setProperty('--sidebar-opacity', (settings.opacity || 88) / 100);
  document.documentElement.style.setProperty('--sidebar-blur', `${settings.blur ?? 20}px`);

  const picker = document.getElementById('customColorPicker');
  if (picker) picker.value = hex;

  const sOp = document.getElementById('sliderOpacity');
  const lOp = document.getElementById('lblOpacity');
  if (sOp && lOp) {
    sOp.value = settings.opacity;
    lOp.textContent = `${settings.opacity}%`;
  }

  const sBl = document.getElementById('sliderBlur');
  const lBl = document.getElementById('lblBlur');
  if (sBl && lBl) {
    sBl.value = settings.blur;
    lBl.textContent = `${settings.blur}px`;
  }

  updatePinButtonUI();
  applyOrientationClasses(settings.orientation || 'vertical', settings.dockSide || 'right');

  if (window.AppTaskManager && window.AppTaskManager.populateAreaSelects) {
    window.AppTaskManager.populateAreaSelects();
  }
}

function applyOrientationClasses(orientation, dockSide) {
  const shell = document.getElementById('sidebarShell');
  if (!shell) return;

  const isHorizontal = orientation === 'horizontal';
  shell.classList.toggle('horizontal', isHorizontal);
  shell.classList.toggle('vertical', !isHorizontal);

  // Actualizar iconos según orientación y lado donde está pegada la barra
  const iconExpand = document.getElementById('iconExpandRail');
  const iconCollapse = document.getElementById('iconCollapseHeader');
  const iconOrient = document.getElementById('iconOrientationRail');
  const iconResize = document.getElementById('iconRailResize');

  if (iconExpand) {
    if (isHorizontal) {
      iconExpand.className = dockSide === 'bottom'
        ? 'fa-solid fa-angles-up text-sm'
        : 'fa-solid fa-angles-down text-sm';
    } else {
      iconExpand.className = dockSide === 'left'
        ? 'fa-solid fa-angles-right text-sm'
        : 'fa-solid fa-angles-left text-sm';
    }
  }

  if (iconCollapse) {
    if (isHorizontal) {
      iconCollapse.className = dockSide === 'bottom'
        ? 'fa-solid fa-angles-down'
        : 'fa-solid fa-angles-up';
    } else {
      iconCollapse.className = dockSide === 'left'
        ? 'fa-solid fa-angles-left'
        : 'fa-solid fa-angles-right';
    }
  }

  if (iconOrient) {
    iconOrient.className = isHorizontal
      ? 'fa-solid fa-arrows-up-down text-xs'
      : 'fa-solid fa-arrows-left-right text-xs';
  }

  if (iconResize) {
    iconResize.className = isHorizontal
      ? 'fa-solid fa-grip-lines-vertical'
      : 'fa-solid fa-grip-lines';
  }
}

function toggleOrientation() {
  if (window.electronAPI && window.electronAPI.toggleOrientation) {
    window.electronAPI.toggleOrientation();
  } else {
    const next = window.AppState.settings.orientation === 'horizontal' ? 'vertical' : 'horizontal';
    window.AppState.settings.orientation = next;
    applyOrientationClasses(next, next === 'horizontal' ? 'top' : 'right');
    persistSettings();
  }
}

async function persistSettings() {
  const { settings } = window.AppState;
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      await window.electronAPI.saveSettings(settings);
    } else {
      localStorage.setItem('sidetask_settings_v1', JSON.stringify(settings));
    }
  } catch (err) {
    console.error('[Settings] Error guardando ajustes:', err);
  }
}

function setAccentColor(hex) {
  window.AppState.settings.accentColor = hex;
  applySettingsToDOM();
  persistSettings();
}

function setOpacity(val) {
  window.AppState.settings.opacity = Number(val);
  applySettingsToDOM();
  persistSettings();
}

function setBlur(val) {
  window.AppState.settings.blur = Number(val);
  applySettingsToDOM();
  persistSettings();
}

function setApiKey(val) {
  window.AppState.settings.geminiApiKey = (val || '').trim();
  applySettingsToDOM();
  persistSettings();
}

// 2. GESTIÓN DINÁMICA DE OPCIONES (AGREGAR, EDITAR Y ELIMINAR)
function startEditCustomArea(areaName) {
  editingAreaOldName = areaName;

  const quickPanel = document.getElementById('quickAreasPanel');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const isSettingsOpen = settingsDrawer && !settingsDrawer.classList.contains('hidden');

  if (isSettingsOpen) {
    const input1 = document.getElementById('newAreaInput');
    const btn1 = document.getElementById('btnSaveAreaSettings');
    if (input1) {
      input1.value = areaName;
      input1.focus();
      input1.select();
    }
    if (btn1) btn1.innerHTML = '<i class="fa-solid fa-check"></i> Guardar';
  } else {
    if (quickPanel) quickPanel.classList.remove('hidden');
    const input2 = document.getElementById('quickNewAreaInput');
    const btn2 = document.getElementById('btnSaveAreaQuick');
    if (input2) {
      input2.value = areaName;
      input2.focus();
      input2.select();
    }
    if (btn2) btn2.innerHTML = '<i class="fa-solid fa-check"></i> Guardar';
  }

  window.AppTaskManager.triggerToast(`Editando opción: "${areaName}"`);
}

function resetAreaEditButtons() {
  editingAreaOldName = null;
  const btn1 = document.getElementById('btnSaveAreaSettings');
  const btn2 = document.getElementById('btnSaveAreaQuick');
  if (btn1) btn1.innerHTML = '<i class="fa-solid fa-plus"></i> Añadir';
  if (btn2) btn2.innerHTML = '<i class="fa-solid fa-plus"></i> Añadir';
}

async function addCustomArea(rawName) {
  const name = (rawName || '').trim();
  if (!name) {
    window.AppTaskManager.triggerToast('Escribe el nombre de la opción');
    return;
  }

  if (!Array.isArray(window.AppState.settings.areas)) {
    window.AppState.settings.areas = ['Refacciones', 'Sistemas'];
  }

  if (editingAreaOldName) {
    const oldName = editingAreaOldName;
    const idx = window.AppState.settings.areas.indexOf(oldName);
    if (idx !== -1) {
      window.AppState.settings.areas[idx] = name;
      window.AppState.tasks.forEach(t => {
        if (t.area === oldName) t.area = name;
      });
      if (window.AppState.filters.area === oldName) {
        window.AppState.filters.area = name;
      }
      resetAreaEditButtons();
      await persistSettings();
      await window.AppTaskManager.persistTasks();
      window.AppTaskManager.populateAreaSelects();
      window.AppTaskManager.renderTaskList();
      window.AppTaskManager.triggerToast(`Opción actualizada: ${name}`);

      const input1 = document.getElementById('newAreaInput');
      if (input1) input1.value = '';
      const input2 = document.getElementById('quickNewAreaInput');
      if (input2) input2.value = '';
      return;
    }
    resetAreaEditButtons();
  }

  const exists = window.AppState.settings.areas.some(
    a => a.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    window.AppTaskManager.triggerToast(`La opción "${name}" ya existe`);
    return;
  }

  window.AppState.settings.areas.push(name);
  await persistSettings();
  window.AppTaskManager.populateAreaSelects();

  const manualSelect = document.getElementById('manualArea');
  if (manualSelect) manualSelect.value = name;

  window.AppTaskManager.renderTaskList();
  window.AppTaskManager.triggerToast(`Opción añadida: ${name}`);

  const input1 = document.getElementById('newAreaInput');
  if (input1) input1.value = '';
  const input2 = document.getElementById('quickNewAreaInput');
  if (input2) input2.value = '';
}

async function removeCustomArea(areaName) {
  if (!Array.isArray(window.AppState.settings.areas)) return;
  if (window.AppState.settings.areas.length <= 1) {
    window.AppTaskManager.triggerToast('Debe quedar al menos 1 opción activa');
    return;
  }

  if (editingAreaOldName === areaName) {
    resetAreaEditButtons();
  }

  window.AppState.settings.areas = window.AppState.settings.areas.filter(a => a !== areaName);

  if (window.AppState.filters.area === areaName) {
    window.AppState.filters.area = 'all';
  }

  await persistSettings();
  window.AppTaskManager.populateAreaSelects();
  window.AppTaskManager.renderTaskList();
  window.AppTaskManager.triggerToast(`Opción eliminada: ${areaName}`);
}

function toggleQuickAreasPanel() {
  setExpanded(true);
  resetAreaEditButtons();
  const panel = document.getElementById('quickAreasPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const input = document.getElementById('quickNewAreaInput');
      if (input) input.focus();
    }
  }
}

// 3. CONTROL DE ESTADOS VISUALES (EXPANDIDO vs COLAPSADO)
function setExpanded(expanded) {
  window.AppState.isExpanded = Boolean(expanded);
  const shell = document.getElementById('sidebarShell');

  if (shell) {
    shell.classList.toggle('expanded', window.AppState.isExpanded);
    shell.classList.toggle('collapsed', !window.AppState.isExpanded);
  }

  if (window.electronAPI && window.electronAPI.setExpandedState) {
    window.electronAPI.setExpandedState(window.AppState.isExpanded);
  }

  applyOrientationClasses(
    window.AppState.settings.orientation || 'vertical',
    window.AppState.settings.dockSide || 'right'
  );

  if (window.AppTaskManager && typeof window.AppTaskManager.updateStatusCounters === 'function') {
    window.AppTaskManager.updateStatusCounters();
  }
}

function toggleExpand() {
  setExpanded(!window.AppState.isExpanded);
}

// 4. CANDADO / BARRA FIJADA PERMANENTE
function toggleAutoCollapseLock() {
  window.AppState.settings.autoCollapseOnLeave = false;
  updatePinButtonUI();
  persistSettings();
  window.AppTaskManager.triggerToast('Barra fijada: Se mantiene abierta siempre');
}

function updatePinButtonUI() {
  const btn = document.getElementById('btnAutoCollapseLock');
  if (!btn) return;
  btn.className = 'w-7 h-7 rounded-lg btn-accent-soft flex items-center justify-center text-[11px] transition';
  btn.innerHTML = '<i class="fa-solid fa-lock text-[10px]"></i>';
  btn.title = 'Barra fijada (No se cierra sola)';
}

function toggleSettingsDrawer() {
  setExpanded(true);
  resetAreaEditButtons();
  const drawer = document.getElementById('settingsDrawer');
  if (drawer) drawer.classList.toggle('hidden');
}

function minimizeWindow() {
  if (window.electronAPI && window.electronAPI.minimizeWindow) {
    window.electronAPI.minimizeWindow();
  }
}

function closeWindow() {
  if (window.electronAPI && window.electronAPI.closeWindow) {
    window.electronAPI.closeWindow();
  }
}

window.AppSettingsUI = {
  applySettingsToDOM,
  applyOrientationClasses,
  toggleOrientation,
  setAccentColor,
  setOpacity,
  setBlur,
  setApiKey,
  startEditCustomArea,
  addCustomArea,
  removeCustomArea,
  toggleQuickAreasPanel,
  setExpanded,
  toggleExpand,
  toggleAutoCollapseLock,
  toggleSettingsDrawer,
  minimizeWindow,
  closeWindow
};

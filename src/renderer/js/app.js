/**
 * ============================================================================
 * ORQUESTADOR PRINCIPAL: PEGAR, ARRASTRAR, ORIENTACIÓN ADAPTATIVA Y TAMAÑO
 * ============================================================================
 */

let leaveCollapseTimer = null;
let autoCaptureExpandTimer = null;
let isDraggingOrResizing = false;

window.addEventListener('DOMContentLoaded', async () => {
  await loadInitialStorage();
  window.AppSettingsUI.applySettingsToDOM();
  window.AppTaskManager.populateAreaSelects();
  window.AppTaskManager.renderTaskList();

  window.AppSettingsUI.setExpanded(true);

  setupEventListeners();
  setupPasteAndDragDrop();
  setupWindowDragAndResize();
  applyPlatformLabels();

  // Escuchar cambios de orientación desde el proceso principal (cuando el usuario mueve la barra arriba/abajo/lados)
  if (window.electronAPI && window.electronAPI.onWindowLayoutUpdated) {
    window.electronAPI.onWindowLayoutUpdated((layout) => {
      if (!layout) return;
      const prevOrientation = window.AppState.settings.orientation;
      window.AppState.settings.orientation = layout.orientation || 'vertical';
      window.AppState.settings.dockSide = layout.dockSide || 'right';
      window.AppState.settings.collapsedLength = layout.collapsedLength || 460;
      window.AppState.settings.expandedWidth = layout.expandedWidth || 400;
      window.AppState.settings.expandedHeight = layout.expandedHeight || 600;

      window.AppSettingsUI.applyOrientationClasses(
        window.AppState.settings.orientation,
        window.AppState.settings.dockSide
      );

      if (prevOrientation && prevOrientation !== layout.orientation) {
        const label = layout.orientation === 'horizontal'
          ? 'Barra adaptada a modo Horizontal ↔'
          : 'Barra adaptada a modo Vertical ↕';
        window.AppTaskManager.triggerToast(label);
      }
    });
  }

  // Revisar cada 30 segundos si ya dieron las 6:00 PM (18:00 hrs) para pasar los pendientes a URGENTES
  setInterval(() => {
    if (window.AppTaskManager && window.AppTaskManager.checkSixPmEscalation) {
      const escalated = window.AppTaskManager.checkSixPmEscalation();
      if (escalated) {
        window.AppTaskManager.renderTaskList();
      }
    }
  }, 30000);
});

// 1. Cargar datos iniciales independientes por computadora
async function loadInitialStorage() {
  try {
    if (window.electronAPI && window.electronAPI.getSettings) {
      const saved = await window.electronAPI.getSettings();
      if (saved) window.AppState.settings = { ...window.AppState.settings, ...saved };
    } else {
      const local = localStorage.getItem('sidetask_settings_v1');
      if (local) window.AppState.settings = { ...window.AppState.settings, ...JSON.parse(local) };
    }
  } catch (err) {
    console.warn('[App] Usando ajustes predeterminados:', err);
  }

  try {
    if (window.electronAPI && window.electronAPI.getTasks) {
      const savedTasks = await window.electronAPI.getTasks();
      window.AppState.tasks = Array.isArray(savedTasks)
        ? savedTasks.filter(t => !String(t.id || '').startsWith('demo-'))
        : [];
    } else {
      const local = localStorage.getItem('sidetask_tasks_v1');
      const parsed = local ? JSON.parse(local) : [];
      window.AppState.tasks = Array.isArray(parsed)
        ? parsed.filter(t => !String(t.id || '').startsWith('demo-'))
        : [];
    }
  } catch (err) {
    window.AppState.tasks = [];
  }
}

// 2. MOVER LA BARRA (ARRIBA/ABAJO = HORIZONTAL, IZQ/DER = VERTICAL) Y ACHICARLA HASTA CIERTO PUNTO
function setupWindowDragAndResize() {
  if (!window.electronAPI) return;

  const railMoveHandle = document.getElementById('railMoveHandle');
  const collapsedRail = document.getElementById('collapsedRail');
  const expandedHeaderDrag = document.getElementById('expandedHeaderDrag');
  const railResizeHandle = document.getElementById('railResizeHandle');

  let activeMode = null; // 'drag' | 'resize'

  const startDrag = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    activeMode = 'drag';
    isDraggingOrResizing = true;
    window.electronAPI.startWindowDrag();
  };

  const startResize = (direction) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    activeMode = 'resize';
    isDraggingOrResizing = true;
    window.electronAPI.startWindowResize(direction);
  };

  const stopAll = () => {
    if (!activeMode) return;
    if (activeMode === 'drag') {
      window.electronAPI.stopWindowDrag();
    } else if (activeMode === 'resize') {
      window.electronAPI.stopWindowResize();
    }
    activeMode = null;
    isDraggingOrResizing = false;
  };

  // Mover desde el botón de 4 flechas en modo colapsado
  if (railMoveHandle) {
    railMoveHandle.addEventListener('mousedown', startDrag);
  }

  // Mover arrastrando cualquier espacio libre del riel colapsado
  if (collapsedRail) {
    collapsedRail.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('#railResizeHandle')) return;
      startDrag(e);
    });
  }

  // Mover desde el encabezado superior cuando la barra está abierta
  if (expandedHeaderDrag) {
    expandedHeaderDrag.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      startDrag(e);
    });
  }

  // Achicar o alargar la barra cuando está encogida (cápsula vertical u horizontal)
  if (railResizeHandle) {
    railResizeHandle.addEventListener('mousedown', startResize('collapsed-end'));
  }

  // Achicar o agrandar el panel cuando está abierto (bordes y esquinas)
  const resizeMap = [
    { id: 'resizeLeft', dir: 'left' },
    { id: 'resizeRight', dir: 'right' },
    { id: 'resizeBottom', dir: 'bottom' },
    { id: 'resizeCornerBL', dir: 'bottom-left' },
    { id: 'resizeCornerBR', dir: 'bottom-right' }
  ];

  resizeMap.forEach(({ id, dir }) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('mousedown', startResize(dir));
  });

  window.addEventListener('mouseup', stopAll);
  window.addEventListener('blur', stopAll);
}

// 3. PEGAR DIRECTO (CTRL+V / CMD+V) Y ARRASTRAR CON EL MOUSE (DRAG & DROP)
function setupPasteAndDragDrop() {
  const pasteZone = document.getElementById('pasteDropZone');
  const quickPasteInput = document.getElementById('quickPasteInput');
  const shell = document.getElementById('sidebarShell');

  window.addEventListener('paste', async (e) => {
    const activeEl = document.activeElement;
    const isOtherInput = activeEl && (
      activeEl.id === 'searchInput' ||
      activeEl.id === 'manualSender' ||
      activeEl.id === 'manualText' ||
      activeEl.id === 'newAreaInput' ||
      activeEl.id === 'quickNewAreaInput' ||
      (activeEl.id && activeEl.id.startsWith('edit-'))
    );

    if (isOtherInput) return;

    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (pastedText && pastedText.trim()) {
      e.preventDefault();
      if (quickPasteInput) quickPasteInput.value = '';
      await handleAutomaticCapture(pastedText);
    }
  });

  if (quickPasteInput) {
    quickPasteInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && quickPasteInput.value.trim()) {
        e.preventDefault();
        const text = quickPasteInput.value.trim();
        quickPasteInput.value = '';
        await handleAutomaticCapture(text);
      }
    });
  }

  if (shell) {
    shell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (pasteZone) pasteZone.classList.add('drag-over');
    });

    shell.addEventListener('dragleave', () => {
      if (pasteZone) pasteZone.classList.remove('drag-over');
    });

    shell.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (pasteZone) pasteZone.classList.remove('drag-over');

      const droppedText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (droppedText && droppedText.trim()) {
        await handleAutomaticCapture(droppedText);
      }
    });
  }
}

// 4. EVENTOS GENERALES DE INTERFAZ
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const areaSelect = document.getElementById('areaFilterSelect');
  const btnCaptureNow = document.getElementById('btnCaptureNow');
  const shell = document.getElementById('sidebarShell');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      window.AppState.filters.search = val;
      if (btnClearSearch) btnClearSearch.classList.toggle('hidden', !val);
      window.AppTaskManager.renderTaskList();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      window.AppState.filters.search = '';
      btnClearSearch.classList.add('hidden');
      window.AppTaskManager.renderTaskList();
    });
  }

  if (areaSelect) {
    areaSelect.addEventListener('change', (e) => {
      window.AppState.filters.area = e.target.value;
      window.AppState.filters.urgencyOnly = null;
      window.AppTaskManager.renderTaskList();
    });
  }

  if (btnCaptureNow) {
    btnCaptureNow.addEventListener('click', captureClipboardManual);
  }

  if (shell) {
    shell.addEventListener('mouseenter', () => {
      if (leaveCollapseTimer) {
        clearTimeout(leaveCollapseTimer);
        leaveCollapseTimer = null;
      }
    });

    shell.addEventListener('mouseleave', () => {
      if (isDraggingOrResizing) return;
      if (window.AppState.settings.autoCollapseOnLeave && window.AppState.isExpanded) {
        leaveCollapseTimer = setTimeout(() => {
          window.AppSettingsUI.setExpanded(false);
        }, 450);
      }
    });
  }

  if (window.electronAPI && window.electronAPI.onClipboardCapture) {
    window.electronAPI.onClipboardCapture(async (rawText) => {
      await handleAutomaticCapture(rawText);
    });
  }
}

// 5. CAPTURA AUTOMÁTICA Y GUARDADO INMEDIATO
async function handleAutomaticCapture(rawText) {
  if (!rawText || !rawText.trim()) {
    window.AppTaskManager.triggerToast('El portapapeles está vacío');
    return;
  }

  const wasCollapsed = !window.AppState.isExpanded;
  window.AppSettingsUI.setExpanded(true);

  if (wasCollapsed && window.AppState.settings.autoCollapseOnLeave) {
    if (autoCaptureExpandTimer) clearTimeout(autoCaptureExpandTimer);
    autoCaptureExpandTimer = setTimeout(() => {
      window.AppSettingsUI.setExpanded(false);
    }, 5000);
  }

  const parsed = await window.AppParser.parseIncomingText(rawText);

  const selectedAreaFilter = window.AppState.filters.area;
  const finalArea = (selectedAreaFilter && selectedAreaFilter !== 'all')
    ? selectedAreaFilter
    : parsed.area;

  const newTask = {
    id: 't-' + Date.now(),
    createdAt: Date.now(),
    sender: parsed.sender,
    text: parsed.text,
    notes: '',
    area: finalArea,
    urgency: parsed.urgency,
    status: 'pendiente',
    dateTimeFormatted: parsed.dateTimeFormatted,
    timestamp: parsed.timestamp,
    date: parsed.date
  };

  window.AppState.tasks.unshift(newTask);
  await window.AppTaskManager.persistTasks();
  window.AppTaskManager.renderTaskList();
  window.AppTaskManager.triggerToast(`Guardado: ${newTask.sender} (${newTask.area})`);
}

async function captureClipboardManual() {
  try {
    let text = '';
    if (window.electronAPI && window.electronAPI.readClipboardNow) {
      text = await window.electronAPI.readClipboardNow();
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }
    if (!text || !text.trim()) {
      window.AppTaskManager.triggerToast('Copia un texto primero (Ctrl+C)');
      return;
    }
    await handleAutomaticCapture(text);
  } catch (err) {
    window.AppTaskManager.triggerToast('Presiona Ctrl+V directamente en la barra');
  }
}

// 6. FILTROS Y FORMULARIO MANUAL (+)
function setStatusFilter(status) {
  window.AppState.filters.status = status;
  window.AppState.filters.urgencyOnly = null;

  ['all', 'pendiente', 'proceso', 'resuelto'].forEach(st => {
    const btn = document.getElementById(`tab-${st}`);
    if (!btn) return;
    if (st === status) {
      btn.className = 'status-tab status-tab-active py-1 rounded-lg transition';
    } else {
      btn.className = 'status-tab status-tab-inactive py-1 rounded-lg transition';
    }
  });

  window.AppTaskManager.renderTaskList();
}

function toggleManualForm() {
  window.AppSettingsUI.setExpanded(true);
  const panel = document.getElementById('manualFormPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const isAfterSix = new Date().getHours() >= 18;
      setFormUrgency(isAfterSix ? 'Alta' : 'Media');
      const senderInput = document.getElementById('manualSender');
      if (senderInput) senderInput.focus();
    }
  }
}

function setFormUrgency(level) {
  window.AppState.manualUrgency = level;
  ['Alta', 'Media', 'Baja'].forEach(l => {
    const btn = document.getElementById(`uBtn-${l}`);
    if (!btn) return;
    if (l === level) {
      btn.className = 'px-2 py-0.5 rounded btn-accent text-[10px]';
    } else {
      btn.className = 'px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 text-[10px]';
    }
  });
}

async function submitManualTask() {
  const senderInput = document.getElementById('manualSender');
  const textInput = document.getElementById('manualText');
  const areaSelect = document.getElementById('manualArea');

  const text = (textInput ? textInput.value : '').trim();
  if (!text) {
    window.AppTaskManager.triggerToast('Escribe la descripción del pendiente');
    if (textInput) textInput.focus();
    return;
  }

  const sender = (senderInput ? senderInput.value : '').trim() || 'Manual';
  const area = areaSelect ? areaSelect.value : (window.AppState.settings.areas[0] || 'General');
  const isNowAfterSix = new Date().getHours() >= 18;
  const urgency = isNowAfterSix ? 'Alta' : (window.AppState.manualUrgency || 'Media');
  const nowTime = new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
  const nowDate = new Date().toLocaleDateString('es-MX');

  const newTask = {
    id: 't-' + Date.now(),
    createdAt: Date.now(),
    sender,
    text,
    notes: '',
    area,
    urgency,
    status: 'pendiente',
    dateTimeFormatted: `[${nowTime}, ${nowDate}]`,
    timestamp: nowTime,
    date: nowDate
  };

  window.AppState.tasks.unshift(newTask);
  await window.AppTaskManager.persistTasks();
  window.AppTaskManager.renderTaskList();

  if (senderInput) senderInput.value = '';
  if (textInput) textInput.value = '';
  toggleManualForm();
  window.AppTaskManager.triggerToast(`Guardado: ${sender} (${area})`);
}

function handleAddAreaSubmit() {
  const input = document.getElementById('newAreaInput');
  if (input && input.value.trim()) {
    window.AppSettingsUI.addCustomArea(input.value);
  }
}

function handleQuickAddAreaSubmit() {
  const input = document.getElementById('quickNewAreaInput');
  if (input && input.value.trim()) {
    window.AppSettingsUI.addCustomArea(input.value);
  }
}

// Adaptar textos de atajos automáticamente en macOS (Cmd en lugar de Ctrl)
function applyPlatformLabels() {
  const isMac = (window.electronAPI && window.electronAPI.platform === 'darwin') ||
                /Mac|iPod|iPhone|iPad/i.test(navigator.platform || '');
  if (!isMac) return;

  const quickInput = document.getElementById('quickPasteInput');
  if (quickInput && quickInput.placeholder) {
    quickInput.placeholder = quickInput.placeholder.replace(/Ctrl\+V/g, 'Cmd ⌘ + V');
  }

  document.querySelectorAll('kbd').forEach(k => {
    k.textContent = k.textContent.replace(/Ctrl/g, '⌘');
  });
}

window.setStatusFilter = setStatusFilter;
window.toggleManualForm = toggleManualForm;
window.setFormUrgency = setFormUrgency;
window.submitManualTask = submitManualTask;
window.captureClipboardManual = captureClipboardManual;
window.handleAddAreaSubmit = handleAddAreaSubmit;
window.handleQuickAddAreaSubmit = handleQuickAddAreaSubmit;

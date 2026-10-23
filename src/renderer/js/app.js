/**
 * ============================================================================
 * ORQUESTADOR PRINCIPAL: PEGAR (CTRL+V), ARRASTRAR CON MOUSE Y EVENTOS
 * ============================================================================
 */

let leaveCollapseTimer = null;
let autoCaptureExpandTimer = null;
let isMouseInsideShell = false;
let isDraggingHandle = false;
let lastIgnoreMouseState = null;

window.addEventListener('DOMContentLoaded', async () => {
  await loadInitialStorage();
  window.AppSettingsUI.applySettingsToDOM();
  window.AppTaskManager.populateAreaSelects();
  window.AppTaskManager.renderTaskList();

  // Iniciar expandido para que el usuario vea la barra lista, o colapsable con un clic
  window.AppSettingsUI.setExpanded(true);

  setupEventListeners();
  setupPasteAndDragDrop();
  setupClickThroughDetection();
  setupDragHandle();
  setupCollapsedRailDrag();
  applyPlatformLabels();

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

// 1. Cargar datos iniciales (Sin ejemplos demo)
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

// 2. CLICK-THROUGH EN ZONA TRANSPARENTE
function setMouseIgnoreSafe(shouldIgnore) {
  if (lastIgnoreMouseState === shouldIgnore) return;
  lastIgnoreMouseState = shouldIgnore;
  if (window.electronAPI && window.electronAPI.setIgnoreMouseEvents) {
    window.electronAPI.setIgnoreMouseEvents(shouldIgnore, { forward: true });
  }
}

function setupClickThroughDetection() {
  if (!window.electronAPI || !window.electronAPI.setIgnoreMouseEvents) return;

  const shell = document.getElementById('sidebarShell');

  window.addEventListener('mousemove', (e) => {
    if (!shell) return;

    if (window.AppState.isExpanded || isDraggingHandle) {
      setMouseIgnoreSafe(false);
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const overInteractive = (
      e.clientX >= (shellRect.left - 24) &&
      e.clientX <= shellRect.right &&
      e.clientY >= shellRect.top &&
      e.clientY <= shellRect.bottom
    );

    setMouseIgnoreSafe(!overInteractive);
  });
}

function isUserEditingOrFormOpen() {
  const manualPanel = document.getElementById('manualFormPanel');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const quickAreasPanel = document.getElementById('quickAreasPanel');

  if (manualPanel && !manualPanel.classList.contains('hidden')) return true;
  if (settingsDrawer && !settingsDrawer.classList.contains('hidden')) return true;
  if (quickAreasPanel && !quickAreasPanel.classList.contains('hidden')) return true;

  const openEditPanels = document.querySelectorAll('[id^="edit-panel-"]:not(.hidden)');
  if (openEditPanels.length > 0) return true;

  const activeEl = document.activeElement;
  if (activeEl && activeEl.id !== 'quickPasteInput' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName)) {
    return true;
  }

  return false;
}

// 3. PEGAR CON CTRL+V Y ARRASTRAR SELECCIÓN CON EL MOUSE (GUARDADO AUTOMÁTICO)
function setupPasteAndDragDrop() {
  const pasteZone = document.getElementById('pasteDropZone');
  const quickPasteInput = document.getElementById('quickPasteInput');

  // 3.1 Escuchar Ctrl+V (evento paste) en toda la ventana
  document.addEventListener('paste', async (e) => {
    const active = document.activeElement;
    // Si el usuario está pegando dentro del buscador, nueva área, edición o notas, permitir comportamiento normal
    if (
      active &&
      ['searchInput', 'newAreaInput', 'quickNewAreaInput', 'manualSender', 'manualText', 'geminiApiKeyInput'].includes(active.id)
    ) {
      return;
    }
    if (active && active.id && (active.id.startsWith('notes-input-') || active.id.startsWith('edit-'))) {
      return;
    }

    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    if (quickPasteInput) quickPasteInput.value = '';

    if (pastedText && pastedText.trim()) {
      await processIncomingText(pastedText);
    } else {
      await captureClipboardManual();
    }
  });

  // 3.2 Si el usuario escribe o pega directo en el cuadro de pegado rápido y presiona Enter
  if (quickPasteInput) {
    quickPasteInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = quickPasteInput.value.trim();
        if (val) {
          quickPasteInput.value = '';
          await processIncomingText(val);
        }
      }
    });
  }

  // 3.3 Arrastrar texto seleccionado con el mouse desde cualquier programa y soltarlo en la barra
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    setMouseIgnoreSafe(false);
    if (!window.AppState.isExpanded) {
      window.AppSettingsUI.setExpanded(true);
    }
    if (pasteZone) pasteZone.classList.add('drag-over');
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (pasteZone) pasteZone.classList.add('drag-over');
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null && pasteZone) {
      pasteZone.classList.remove('drag-over');
    }
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (pasteZone) pasteZone.classList.remove('drag-over');

    const droppedText = e.dataTransfer
      ? (e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text'))
      : '';

    if (droppedText && droppedText.trim()) {
      await processIncomingText(droppedText);
    }
  });
}

// 4. AUTO-ABRIR / AUTO-COLAPSAR CON EL MOUSE
function setupAutoCollapseHover() {
  const shell = document.getElementById('sidebarShell');
  if (!shell) return;

  shell.addEventListener('mouseenter', () => {
    isMouseInsideShell = true;
    setMouseIgnoreSafe(false);
    if (leaveCollapseTimer) {
      clearTimeout(leaveCollapseTimer);
      leaveCollapseTimer = null;
    }
    if (autoCaptureExpandTimer) {
      clearTimeout(autoCaptureExpandTimer);
      autoCaptureExpandTimer = null;
    }
  });

  shell.addEventListener('mouseleave', () => {
    isMouseInsideShell = false;
    if (
      window.AppState.settings.autoCollapseOnLeave &&
      window.AppState.isExpanded &&
      !isDraggingHandle &&
      !isUserEditingOrFormOpen()
    ) {
      leaveCollapseTimer = setTimeout(() => {
        if (!isMouseInsideShell && !isDraggingHandle && !isUserEditingOrFormOpen()) {
          window.AppSettingsUI.setExpanded(false);
        }
      }, 400);
    }
  });
}

// 5. TIRADOR DE ARRASTRE EN EL BORDE IZQUIERDO (DRAG HANDLE)
function setupDragHandle() {
  const handle = document.getElementById('dragHandle');
  const shell = document.getElementById('sidebarShell');
  if (!handle || !shell) return;

  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    isDraggingHandle = true;
    setMouseIgnoreSafe(false);
    startX = e.clientX;
    startWidth = shell.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDraggingHandle) return;
    const deltaX = startX - e.clientX;
    const newWidth = Math.min(410, Math.max(68, startWidth + deltaX));
    shell.style.width = `${newWidth}px`;
  });

  window.addEventListener('mouseup', () => {
    if (!isDraggingHandle) return;
    isDraggingHandle = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = 'default';

    const currentW = shell.offsetWidth;
    shell.style.width = '';
    if (currentW > 200) {
      window.AppSettingsUI.setExpanded(true);
    } else {
      window.AppSettingsUI.setExpanded(false);
    }
  });
}

// 5.B FUNCIÓN PARA MOVER LA BARRA LIBREMENTE CUANDO ESTÁ ENCOGIDA (68px)
function setupCollapsedRailDrag() {
  const moveHandle = document.getElementById('railMoveHandle');
  const rail = document.getElementById('collapsedRail');
  let isMovingWindow = false;

  function beginDrag(e) {
    if (e.button !== 0) return; // Solo clic izquierdo
    if (!window.electronAPI || !window.electronAPI.startWindowDrag) return;
    isMovingWindow = true;
    setMouseIgnoreSafe(false);
    document.body.style.cursor = 'grabbing';
    window.electronAPI.startWindowDrag();
    e.preventDefault();
  }

  function endDrag() {
    if (!isMovingWindow) return;
    isMovingWindow = false;
    document.body.style.cursor = 'default';
    if (window.electronAPI && window.electronAPI.stopWindowDrag) {
      window.electronAPI.stopWindowDrag();
    }
  }

  // Arrastrar desde el ícono de mover (✥)
  if (moveHandle) {
    moveHandle.addEventListener('mousedown', beginDrag);
  }

  // También permitir arrastrar desde cualquier espacio libre de la barra encogida
  if (rail) {
    rail.addEventListener('mousedown', (e) => {
      if (!e.target.closest('button')) {
        beginDrag(e);
      }
    });
  }

  window.addEventListener('mouseup', endDrag);
  window.addEventListener('blur', endDrag);
}

// 6. PROCESAR Y GUARDAR EN AUTOMÁTICO EL TEXTO PEGADO O CAPTURADO
async function processIncomingText(rawText) {
  setMouseIgnoreSafe(false);
  window.AppSettingsUI.setExpanded(true);

  if (!rawText || !rawText.trim()) {
    window.AppTaskManager.triggerToast('Copia un mensaje primero (Ctrl+C) y luego pega con Ctrl+V');
    return;
  }

  const parsed = await window.AppParser.parseMessageSmart(
    rawText,
    window.AppState.settings.geminiApiKey
  );

  const newTask = {
    id: 't-' + Date.now(),
    createdAt: Date.now(),
    sender: parsed.sender,
    text: parsed.text,
    notes: '',
    area: parsed.area,
    urgency: parsed.urgency,
    status: 'pendiente',
    dateTimeFormatted: parsed.dateTimeFormatted,
    timestamp: parsed.timestamp,
    date: parsed.date
  };

  window.AppState.tasks.unshift(newTask);
  await window.AppTaskManager.persistTasks();
  window.AppTaskManager.renderTaskList();

  const shell = document.getElementById('sidebarShell');
  if (shell) {
    shell.classList.remove('capture-flash');
    void shell.offsetWidth;
    shell.classList.add('capture-flash');
  }

  window.AppTaskManager.triggerToast(`Guardado: ${parsed.sender} (${parsed.area})`);
}

// 7. Captura desde el portapapeles con 1 clic
async function captureClipboardManual() {
  let clipText = '';
  if (window.electronAPI && window.electronAPI.readClipboardNow) {
    clipText = await window.electronAPI.readClipboardNow();
  } else {
    try {
      clipText = await navigator.clipboard.readText();
    } catch (e) {
      clipText = '';
    }
  }

  await processIncomingText(clipText);
}

// 8. Configuración de eventos
function setupEventListeners() {
  if (window.electronAPI && typeof window.electronAPI.onClipboardCapture === 'function') {
    window.electronAPI.onClipboardCapture(async (rawText) => {
      await processIncomingText(rawText);
    });
  }

  setupAutoCollapseHover();

  const btnCapture = document.getElementById('btnCaptureNow');
  if (btnCapture) btnCapture.addEventListener('click', captureClipboardManual);

  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      window.AppState.filters.search = e.target.value;
      if (btnClearSearch) btnClearSearch.classList.toggle('hidden', !e.target.value);
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

  const areaSelect = document.getElementById('areaFilterSelect');
  if (areaSelect) {
    areaSelect.addEventListener('change', (e) => {
      window.AppState.filters.area = e.target.value;
      window.AppState.filters.urgencyOnly = null;
      window.AppTaskManager.renderTaskList();
    });
  }
}

function setStatusFilter(status) {
  window.AppState.filters.status = status;
  ['all', 'pendiente', 'proceso', 'resuelto'].forEach(st => {
    const tab = document.getElementById(`tab-${st}`);
    if (tab) {
      tab.className = st === status
        ? 'status-tab status-tab-active py-1 rounded-lg transition'
        : 'status-tab status-tab-inactive py-1 rounded-lg transition';
    }
  });
  window.AppTaskManager.renderTaskList();
}

function toggleManualForm() {
  setMouseIgnoreSafe(false);
  window.AppSettingsUI.setExpanded(true);
  const panel = document.getElementById('manualFormPanel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const input = document.getElementById('manualText');
      if (input) setTimeout(() => input.focus(), 50);
    }
  }
}

function setFormUrgency(level) {
  window.AppState.manualUrgency = level;
  ['Alta', 'Media', 'Baja'].forEach(l => {
    const btn = document.getElementById(`uBtn-${l}`);
    if (btn) {
      btn.className = l === level
        ? 'px-2 py-0.5 rounded btn-accent text-[10px]'
        : 'px-2 py-0.5 rounded bg-slate-800 border border-white/10 text-slate-400 text-[10px]';
    }
  });
}

async function submitManualTask() {
  const senderInput = document.getElementById('manualSender');
  const areaSelect = document.getElementById('manualArea');
  const textInput = document.getElementById('manualText');

  const text = (textInput ? textInput.value : '').trim();
  if (!text) {
    window.AppTaskManager.triggerToast('Escribe la descripción del pendiente');
    if (textInput) textInput.focus();
    return;
  }

  const sender = (senderInput ? senderInput.value : '').trim() || 'Manual';
  const area = areaSelect ? areaSelect.value : (window.AppState.settings.areas[0] || 'General');
  const isNowAfterSix = new Date().getHours() >= 18;
  const urgency = isNowAfterSix ? 'Alta' : 'Media';
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

  const replaceCtrlWithCmd = (el) => {
    if (!el) return;
    if (el.title) el.title = el.title.replace(/Ctrl/g, 'Cmd ⌘');
    if (el.innerHTML && el.children.length <= 2) {
      el.innerHTML = el.innerHTML.replace(/Ctrl\s*\+\s*([CVD])/g, '⌘ + $1').replace(/Ctrl\+([CVD])/g, '⌘+$1');
    }
  };

  document.querySelectorAll('[title*="Ctrl"], .paste-drop-zone, .rail-paste-btn, .footer-status').forEach(replaceCtrlWithCmd);
}

window.setStatusFilter = setStatusFilter;
window.toggleManualForm = toggleManualForm;
window.setFormUrgency = setFormUrgency;
window.submitManualTask = submitManualTask;
window.captureClipboardManual = captureClipboardManual;
window.handleAddAreaSubmit = handleAddAreaSubmit;
window.handleQuickAddAreaSubmit = handleQuickAddAreaSubmit;

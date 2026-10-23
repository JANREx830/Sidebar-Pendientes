/**
 * ============================================================================
 * GESTOR DE TAREAS, REGLA DE LAS 6:00 PM, EDICIÓN Y RENDERIZADO VISUAL
 * ============================================================================
 */

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

function getAreaIcon(areaName) {
  const lower = String(areaName || '').toLowerCase();
  if (lower.includes('refacci') || lower.includes('taller') || lower.includes('mantenim')) {
    return 'fa-screwdriver-wrench';
  }
  if (lower.includes('sistema') || lower.includes('ti') || lower.includes('red') || lower.includes('soporte')) {
    return 'fa-laptop-code';
  }
  if (lower.includes('client') || lower.includes('venta') || lower.includes('comerc')) {
    return 'fa-user-tie';
  }
  return 'fa-tag';
}

// Verificar automáticamente si algún pendiente ya pasó de las 6:00 PM (18:00 hrs)
function checkSixPmEscalation() {
  const tasks = (window.AppState && Array.isArray(window.AppState.tasks)) ? window.AppState.tasks : [];
  const now = new Date();
  const isNowAfterSixPm = now.getHours() >= 18;
  let changed = false;

  tasks.forEach(task => {
    if (task.status === 'resuelto') return;

    // Verificar si la hora del mensaje o la hora actual pasa de las 6:00 PM
    const msgAfterSix = window.AppParser && window.AppParser.isAfterSixPm
      ? window.AppParser.isAfterSixPm(task.dateTimeFormatted || task.timestamp)
      : isNowAfterSixPm;

    // Verificar si fue creado en un día anterior y ya pasaron las 6:00 PM de ese día
    let passedCreatedDaySixPm = false;
    if (task.createdAt) {
      const createdDate = new Date(task.createdAt);
      const sixPmThatDay = new Date(
        createdDate.getFullYear(),
        createdDate.getMonth(),
        createdDate.getDate(),
        18, 0, 0, 0
      );
      if (now >= sixPmThatDay) {
        passedCreatedDaySixPm = true;
      }
    }

    if ((isNowAfterSixPm || msgAfterSix || passedCreatedDaySixPm) && task.urgency !== 'Alta') {
      task.urgency = 'Alta';
      changed = true;
    } else if (!isNowAfterSixPm && !msgAfterSix && !passedCreatedDaySixPm && !task.manualUrgencyOverride && task.urgency !== 'Media') {
      task.urgency = 'Media';
      changed = true;
    }
  });

  if (changed) {
    persistTasks();
  }
  return changed;
}

// 1. Sincronizar selectores de área, listas de opciones y botones del riel
function populateAreaSelects() {
  const areas = (window.AppState && window.AppState.settings && Array.isArray(window.AppState.settings.areas))
    ? window.AppState.settings.areas
    : ['Refacciones', 'Sistemas'];

  const filterSelect = document.getElementById('areaFilterSelect');
  if (filterSelect) {
    const currentVal = window.AppState.filters.area || 'all';
    filterSelect.innerHTML = `
      <option value="all">Todas las Opciones</option>
      ${areas.map(a => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join('')}
    `;
    filterSelect.value = areas.includes(currentVal) ? currentVal : 'all';
  }

  const manualSelect = document.getElementById('manualArea');
  if (manualSelect) {
    const prev = manualSelect.value;
    manualSelect.innerHTML = areas.map(a => `<option value="${escapeAttr(a)}">${escapeHtml(a)}</option>`).join('');
    if (areas.includes(prev)) {
      manualSelect.value = prev;
    }
  }

  const chipsHtml = areas.map(a => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg btn-accent-soft text-[11px] font-medium shadow-sm">
      <span>${escapeHtml(a)}</span>
      <button type="button" data-edit-area="${escapeAttr(a)}"
              class="btn-edit-area hover:text-white transition px-0.5"
              title="Editar nombre de '${escapeAttr(a)}'">
        <i class="fa-solid fa-pen text-[9px]"></i>
      </button>
      <button type="button" data-remove-area="${escapeAttr(a)}"
              class="btn-remove-area hover:text-rose-400 transition px-0.5"
              title="Eliminar '${escapeAttr(a)}'">
        <i class="fa-solid fa-xmark text-[10px]"></i>
      </button>
    </span>
  `).join('');

  const settingsList = document.getElementById('settingsAreasList');
  if (settingsList) settingsList.innerHTML = chipsHtml;

  const quickList = document.getElementById('quickAreasList');
  if (quickList) quickList.innerHTML = chipsHtml;

  document.querySelectorAll('.btn-remove-area').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetArea = btn.getAttribute('data-remove-area');
      if (targetArea) window.AppSettingsUI.removeCustomArea(targetArea);
    };
  });

  document.querySelectorAll('.btn-edit-area').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const targetArea = btn.getAttribute('data-edit-area');
      if (targetArea) window.AppSettingsUI.startEditCustomArea(targetArea);
    };
  });

  renderRailAreaButtons();
}

function renderRailAreaButtons() {
  const railAreasContainer = document.getElementById('railDynamicAreas');
  if (!railAreasContainer) return;

  const areas = (window.AppState && window.AppState.settings && Array.isArray(window.AppState.settings.areas))
    ? window.AppState.settings.areas
    : ['Refacciones', 'Sistemas'];

  const tasks = (window.AppState && Array.isArray(window.AppState.tasks)) ? window.AppState.tasks : [];

  railAreasContainer.innerHTML = areas.map(areaName => {
    const icon = getAreaIcon(areaName);
    const activeCount = tasks.filter(t => t.area === areaName && t.status !== 'resuelto').length;
    const isActive = window.AppState.filters.area === areaName && !window.AppState.filters.urgencyOnly;

    return `
      <button type="button" data-rail-area="${escapeAttr(areaName)}"
              class="rail-btn rail-area-btn ${isActive ? 'active' : ''}"
              title="${escapeAttr(areaName)} (${activeCount})">
        <i class="fa-solid ${icon}"></i>
        <span class="rail-badge ${activeCount === 0 ? 'hidden' : ''}">${activeCount}</span>
      </button>
    `;
  }).join('');

  railAreasContainer.querySelectorAll('.rail-area-btn').forEach(btn => {
    btn.onclick = () => {
      const areaName = btn.getAttribute('data-rail-area');
      filterFromRail('area', areaName);
    };
  });
}

// 2. Filtrar lista de tareas
function getFilteredTasks() {
  const { tasks, filters } = window.AppState;
  const q = (filters.search || '').toLowerCase().trim();

  return tasks.filter(t => {
    if (filters.urgencyOnly === 'Alta' && t.urgency !== 'Alta') {
      return false;
    }
    if (filters.status !== 'all' && t.status !== filters.status) {
      return false;
    }
    if (filters.area !== 'all' && t.area !== filters.area) {
      return false;
    }
    if (q) {
      const matchText = (t.text || '').toLowerCase().includes(q);
      const matchSender = (t.sender || '').toLowerCase().includes(q);
      const matchNotes = (t.notes || '').toLowerCase().includes(q);
      const matchArea = (t.area || '').toLowerCase().includes(q);
      if (!matchText && !matchSender && !matchNotes && !matchArea) {
        return false;
      }
    }
    return true;
  });
}

// 3. Actualizar contadores del riel y pestañas
function updateStatusCounters() {
  const tasks = (window.AppState && Array.isArray(window.AppState.tasks)) ? window.AppState.tasks : [];
  const allCount = tasks.length;
  const pendCount = tasks.filter(t => t.status === 'pendiente').length;
  const procCount = tasks.filter(t => t.status === 'proceso').length;
  const resCount = tasks.filter(t => t.status === 'resuelto').length;

  const activeAll = tasks.filter(t => t.status !== 'resuelto').length;
  const activeUrgent = tasks.filter(t => t.urgency === 'Alta' && t.status !== 'resuelto').length;

  const bAll = document.getElementById('railBadgeAll');
  const bUrg = document.getElementById('railBadgeUrgentes');

  if (bAll) {
    bAll.textContent = activeAll;
    bAll.classList.toggle('hidden', activeAll === 0);
  }
  if (bUrg) {
    bUrg.textContent = activeUrgent;
    bUrg.classList.toggle('hidden', activeUrgent === 0);
  }

  renderRailAreaButtons();

  const elAll = document.getElementById('cnt-all');
  const elPend = document.getElementById('cnt-pendiente');
  const elProc = document.getElementById('cnt-proceso');
  const elRes = document.getElementById('cnt-resuelto');

  if (elAll) elAll.textContent = allCount;
  if (elPend) elPend.textContent = pendCount;
  if (elProc) elProc.textContent = procCount;
  if (elRes) elRes.textContent = resCount;
}

// 4. Renderizar tarjetas de tareas (Amarillo por defecto, Urgente Rojo después de las 6:00 PM)
function renderTaskList() {
  checkSixPmEscalation();
  updateStatusCounters();

  const container = document.getElementById('tasksFeed');
  if (!container) return;

  const filtered = getFilteredTasks();
  const availableAreas = (window.AppState && window.AppState.settings && Array.isArray(window.AppState.settings.areas))
    ? window.AppState.settings.areas
    : ['Refacciones', 'Sistemas'];

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="h-48 flex flex-col items-center justify-center text-center p-5 text-slate-400">
        <div class="w-11 h-11 rounded-2xl btn-accent-soft flex items-center justify-center mb-2.5">
          <i class="fa-solid fa-paste text-base"></i>
        </div>
        <p class="text-xs font-semibold text-slate-200">Sin pendientes en esta vista</p>
        <p class="text-[11px] text-slate-400 mt-1 max-w-[250px]">
          Copia un mensaje (<kbd class="px-1 py-0.5 rounded bg-white/10 accent-text font-mono text-[10px]">Ctrl+C</kbd>) y presiona <kbd class="px-1 py-0.5 rounded bg-white/10 accent-text font-mono text-[10px]">Ctrl+V</kbd> aquí o arrástralo con el mouse.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(task => {
    const isUrgent = task.urgency === 'Alta' && task.status !== 'resuelto';

    // Etiqueta visual: Amarillo para pendientes normales, Rojo para Urgentes (> 6:00 PM)
    const urgencyBadge = task.status === 'resuelto'
      ? '<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]"><i class="fa-solid fa-check mr-1"></i>COMPLETADO</span>'
      : isUrgent
      ? '<span class="px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-200 border border-rose-500 font-bold text-[10px] animate-pulse"><i class="fa-solid fa-triangle-exclamation mr-1 text-rose-400"></i>URGENTE (+6 PM)</span>'
      : '<span class="px-2 py-0.5 rounded-md bg-amber-400/25 text-amber-200 border border-amber-400/60 font-bold text-[10px]"><span class="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>AMARILLO (PENDIENTE)</span>';

    // Borde lateral de la tarjeta: Amarillo en pendientes normales, Rojo si pasa de las 6 PM
    const cardBorderStyle = task.status === 'resuelto'
      ? 'border-white/10 border-l-4 border-l-emerald-500 opacity-65 hover:opacity-100'
      : isUrgent
      ? 'border-rose-500/40 border-l-4 border-l-rose-500 bg-rose-950/25 hover:bg-slate-900/95'
      : 'border-amber-400/35 border-l-4 border-l-amber-400 bg-amber-950/15 hover:bg-slate-900/95';

    const icon = getAreaIcon(task.area);

    const areaBadge = `
      <button type="button" onclick="window.AppTaskManager.cycleTaskArea('${task.id}')"
              class="px-2 py-0.5 rounded-md btn-accent-soft font-semibold text-[10px] flex items-center gap-1"
              title="Clic para cambiar de opción / categoría">
        <i class="fa-solid ${icon}"></i>
        <span>${escapeHtml(task.area || 'General')}</span>
      </button>
    `;

    let statusBtnHtml = '';
    if (task.status === 'pendiente') {
      statusBtnHtml = `
        <button type="button" onclick="window.AppTaskManager.cycleTaskStatus('${task.id}')"
                class="px-2.5 py-1 rounded-md bg-amber-400/25 hover:bg-amber-400/35 border border-amber-400/60 text-amber-200 text-[10px] font-bold transition flex items-center gap-1.5"
                title="Clic para pasar a 'En Proceso'">
          <span class="w-2 h-2 rounded-full bg-amber-400"></span> Pendiente
        </button>
      `;
    } else if (task.status === 'proceso') {
      statusBtnHtml = `
        <button type="button" onclick="window.AppTaskManager.cycleTaskStatus('${task.id}')"
                class="px-2.5 py-1 rounded-md bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[10px] font-semibold transition flex items-center gap-1.5"
                title="Clic para marcar 'Resuelto'">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span> En Proceso
        </button>
      `;
    } else {
      statusBtnHtml = `
        <button type="button" onclick="window.AppTaskManager.cycleTaskStatus('${task.id}')"
                class="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold transition flex items-center gap-1.5"
                title="Clic para reabrir pendiente">
          <i class="fa-solid fa-check text-emerald-400"></i> Resuelto
        </button>
      `;
    }

    const dateTimeDisplay = task.dateTimeFormatted || `[${task.timestamp || ''}, ${task.date || ''}]`;

    const areaOptionsHtml = availableAreas.map(a =>
      `<option value="${escapeAttr(a)}" ${a === task.area ? 'selected' : ''}>${escapeHtml(a)}</option>`
    ).join('');

    return `
      <div id="card-${task.id}" class="p-3 rounded-xl bg-slate-900/85 border transition-all duration-200 space-y-2 animate-card ${cardBorderStyle}">
        <!-- 1. PRIMERO EL MENSAJE COMO TÍTULO PRINCIPAL + BOTONES EDITAR Y ELIMINAR -->
        <div class="flex items-start justify-between gap-2">
          <div class="text-[13px] font-bold text-white leading-snug select-text break-words flex-1">
            ${escapeHtml(task.text || '')}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" onclick="window.AppTaskManager.toggleEditTask('${task.id}')"
                    class="w-6 h-6 rounded-md btn-accent-soft flex items-center justify-center transition"
                    title="Editar este pendiente">
              <i class="fa-solid fa-pen text-[10px]"></i>
            </button>
            <button type="button" onclick="window.AppTaskManager.deleteTask('${task.id}')"
                    class="w-6 h-6 rounded-md bg-white/5 hover:bg-rose-500/25 text-slate-400 hover:text-rose-300 flex items-center justify-center transition"
                    title="Eliminar pendiente">
              <i class="fa-solid fa-trash-can text-[10px]"></i>
            </button>
          </div>
        </div>

        <!-- 2. ABAJO DEL TÍTULO: AUTOR Y FECHA Y HORA -->
        <div class="bg-black/30 rounded-lg p-2 border border-white/5 space-y-1 text-[11px]">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="accent-text font-bold">autor:</span>
            <span class="text-slate-100 font-medium select-text">${escapeHtml(task.sender || 'Sin especificar')}</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="accent-text font-bold">fecha y hora:</span>
            <span class="font-mono text-slate-300 text-[10px] select-text">${escapeHtml(dateTimeDisplay)}</span>
          </div>
        </div>

        <!-- PANEL DESPLEGABLE DE EDICIÓN COMPLETA DEL PENDIENTE (✏️) -->
        <div id="edit-panel-${task.id}" class="hidden p-2.5 rounded-xl bg-slate-950/95 border border-white/15 space-y-2 animate-card">
          <div class="flex items-center justify-between text-[11px] font-semibold accent-text">
            <span><i class="fa-solid fa-pen-to-square mr-1"></i>Editar Pendiente</span>
            <button type="button" onclick="window.AppTaskManager.toggleEditTask('${task.id}')" class="text-slate-400 hover:text-white">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="space-y-1.5">
            <label class="block text-[10px] text-slate-400">Mensaje:</label>
            <textarea id="edit-text-${task.id}" rows="2"
                      class="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white accent-ring">${escapeHtml(task.text || '')}</textarea>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="block text-[10px] text-slate-400 mb-0.5">Autor:</label>
              <input id="edit-sender-${task.id}" type="text" value="${escapeAttr(task.sender || '')}"
                     class="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white accent-ring">
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-0.5">Fecha y hora:</label>
              <input id="edit-datetime-${task.id}" type="text" value="${escapeAttr(dateTimeDisplay)}"
                     class="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1 text-[11px] font-mono text-white accent-ring">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <div>
              <label class="block text-[10px] text-slate-400 mb-0.5">Opción / Área:</label>
              <select id="edit-area-${task.id}"
                      class="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white accent-ring">
                ${areaOptionsHtml}
              </select>
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-0.5">Estado de Urgencia:</label>
              <select id="edit-urgency-${task.id}"
                      class="w-full bg-slate-900 border border-white/15 rounded-lg px-2 py-1 text-xs text-white accent-ring">
                <option value="Media" ${task.urgency !== 'Alta' ? 'selected' : ''}>🟡 Amarillo (Normal)</option>
                <option value="Alta" ${task.urgency === 'Alta' ? 'selected' : ''}>🚨 Urgente (+6 PM)</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-1.5 pt-1">
            <button type="button" onclick="window.AppTaskManager.toggleEditTask('${task.id}')"
                    class="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 text-[10px]">
              Cancelar
            </button>
            <button type="button" onclick="window.AppTaskManager.saveTaskEdit('${task.id}')"
                    class="px-3 py-1 rounded-md btn-accent text-[10px]">
              Guardar Cambios
            </button>
          </div>
        </div>

        <!-- 3. BARRA INFERIOR: OPCIÓN, URGENCIA, ESTADO Y NOTAS -->
        <div class="pt-1 flex items-center justify-between gap-1.5 flex-wrap border-t border-white/5">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${areaBadge}
            ${urgencyBadge}
          </div>

          <div class="flex items-center gap-1.5">
            ${statusBtnHtml}
            <button type="button" onclick="window.AppTaskManager.toggleNotes('${task.id}')"
                    class="px-2 py-1 rounded-md btn-accent-soft text-[10px] font-medium flex items-center gap-1"
                    title="Agregar o ver notas">
              <i class="fa-regular fa-comment-dots"></i>
              <span>${task.notes ? 'Nota' : '+Nota'}</span>
            </button>
          </div>
        </div>

        <div id="notes-panel-${task.id}" class="hidden pt-2 border-t border-white/10 space-y-1.5">
          <textarea id="notes-input-${task.id}" rows="2"
                    placeholder="Escribe seguimiento, proveedor o comentario..."
                    class="w-full bg-slate-950/80 border border-white/10 rounded-lg p-2 text-[11px] text-slate-200 placeholder-slate-500 accent-ring">${escapeHtml(task.notes || '')}</textarea>
          <div class="flex justify-end gap-1.5">
            <button type="button" onclick="window.AppTaskManager.saveTaskNotes('${task.id}')"
                    class="px-3 py-1 rounded-md btn-accent text-[10px]">
              Guardar Nota
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleEditTask(taskId) {
  const panel = document.getElementById(`edit-panel-${taskId}`);
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const txtInput = document.getElementById(`edit-text-${taskId}`);
      if (txtInput) txtInput.focus();
    }
  }
}

async function saveTaskEdit(taskId) {
  const { tasks } = window.AppState;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const textEl = document.getElementById(`edit-text-${taskId}`);
  const senderEl = document.getElementById(`edit-sender-${taskId}`);
  const dtEl = document.getElementById(`edit-datetime-${taskId}`);
  const areaEl = document.getElementById(`edit-area-${taskId}`);
  const urgEl = document.getElementById(`edit-urgency-${taskId}`);

  if (textEl && textEl.value.trim()) {
    task.text = textEl.value.trim();
  }
  if (senderEl) {
    task.sender = senderEl.value.trim() || 'Sin especificar';
  }
  if (dtEl && dtEl.value.trim()) {
    const rawDt = dtEl.value.trim();
    task.dateTimeFormatted = rawDt.startsWith('[') ? rawDt : `[${rawDt}]`;
  }
  if (areaEl && areaEl.value) {
    task.area = areaEl.value;
  }
  if (urgEl && urgEl.value) {
    task.urgency = urgEl.value;
    task.manualUrgencyOverride = true;
  }

  await persistTasks();
  renderTaskList();
  triggerToast('Pendiente actualizado');
}

function filterFromRail(filterType, val) {
  window.AppSettingsUI.setExpanded(true);

  if (filterType === 'all') {
    window.AppState.filters.area = 'all';
    window.AppState.filters.urgencyOnly = null;
    window.AppState.filters.status = 'all';
  } else if (filterType === 'area') {
    window.AppState.filters.area = val;
    window.AppState.filters.urgencyOnly = null;
  } else if (filterType === 'urgente') {
    window.AppState.filters.urgencyOnly = 'Alta';
    window.AppState.filters.area = 'all';
  }

  const areaSel = document.getElementById('areaFilterSelect');
  if (areaSel) areaSel.value = window.AppState.filters.area;

  renderTaskList();
}

async function cycleTaskArea(taskId) {
  const { tasks, settings } = window.AppState;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const areas = settings.areas || ['Refacciones', 'Sistemas'];
  const currentIndex = areas.indexOf(task.area);
  const nextIndex = (currentIndex + 1) % areas.length;
  task.area = areas[nextIndex];

  await persistTasks();
  renderTaskList();
  triggerToast(`Opción: ${task.area}`);
}

async function cycleTaskStatus(taskId) {
  const { tasks } = window.AppState;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (task.status === 'pendiente') {
    task.status = 'proceso';
  } else if (task.status === 'proceso') {
    task.status = 'resuelto';
  } else {
    task.status = 'pendiente';
  }

  await persistTasks();
  renderTaskList();
}

function toggleNotes(taskId) {
  const panel = document.getElementById(`notes-panel-${taskId}`);
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const input = document.getElementById(`notes-input-${taskId}`);
      if (input) input.focus();
    }
  }
}

async function saveTaskNotes(taskId) {
  const { tasks } = window.AppState;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const input = document.getElementById(`notes-input-${taskId}`);
  if (input) task.notes = input.value.trim();

  await persistTasks();
  renderTaskList();
  triggerToast('Nota guardada');
}

async function deleteTask(taskId) {
  const { tasks } = window.AppState;
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    tasks.splice(idx, 1);
    await persistTasks();
    renderTaskList();
    triggerToast('Pendiente eliminado');
  }
}

async function persistTasks() {
  const { tasks } = window.AppState;
  try {
    if (window.electronAPI && window.electronAPI.saveTasks) {
      await window.electronAPI.saveTasks(tasks);
    } else {
      localStorage.setItem('sidetask_tasks_v1', JSON.stringify(tasks));
    }
  } catch (err) {
    console.error('[TaskManager] Error persistiendo tareas:', err);
  }
}

function exportTasksToExcelCSV() {
  const { tasks } = window.AppState;
  if (!tasks || tasks.length === 0) {
    triggerToast('No hay tareas para exportar');
    return;
  }

  const headers = ['ID', 'Mensaje', 'Autor', 'Fecha_y_Hora', 'Opcion_Area', 'Urgencia', 'Estado', 'Notas_Seguimiento'];
  const rows = tasks.map(t => [
    t.id,
    t.text || '',
    t.sender || '',
    t.dateTimeFormatted || `[${t.timestamp || ''}, ${t.date || ''}]`,
    t.area || '',
    t.urgency === 'Alta' ? 'URGENTE (+6 PM)' : 'AMARILLO (PENDIENTE)',
    t.status.toUpperCase(),
    t.notes || ''
  ]);

  const csvLines = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ];

  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `Reporte_SideTask_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  triggerToast('Reporte Excel descargado');
}

function triggerToast(message) {
  const toast = document.getElementById('toastCapture');
  const text = document.getElementById('toastCaptureText');
  if (toast && text) {
    text.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2600);
  }
}

window.AppTaskManager = {
  checkSixPmEscalation,
  populateAreaSelects,
  updateStatusCounters,
  renderTaskList,
  toggleEditTask,
  saveTaskEdit,
  cycleTaskStatus,
  cycleTaskArea,
  filterFromRail,
  toggleNotes,
  saveTaskNotes,
  deleteTask,
  persistTasks,
  exportTasksToExcelCSV,
  triggerToast
};

window.AppState = {
  tasks: [],
  settings: {
    accentColor: '#06b6d4',
    opacity: 84,
    blur: 20,
    alwaysOnTop: true,
    geminiApiKey: '',
    autoCollapseOnLeave: false,
    areas: ['Refacciones', 'Sistemas']
  },
  filters: {
    status: 'all',
    area: 'all',
    search: '',
    urgencyOnly: null
  },
  isExpanded: false, // Inicia colapsado (68px)
  manualUrgency: 'Alta',
  DEFAULT_TASKS: [] // Sin tareas de ejemplo
};

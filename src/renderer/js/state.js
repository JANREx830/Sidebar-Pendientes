window.AppState = {
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
    collapsedLength: 460,
    expandedWidth: 400,
    expandedHeight: 600
  },
  filters: {
    status: 'all',
    area: 'all',
    search: '',
    urgencyOnly: null
  },
  isExpanded: true,
  manualUrgency: 'Media',
  DEFAULT_TASKS: [] // Sin tareas de ejemplo
};

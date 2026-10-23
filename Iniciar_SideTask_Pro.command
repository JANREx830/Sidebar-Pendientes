#!/bin/bash
# ============================================================================
# LANZADOR DE SIDETASK PRO PARA MACOS (Doble clic para abrir sin ventana atrás)
# ============================================================================
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias por primera vez en tu Mac..."
  npm install
fi

echo "Abriendo SideTask Pro..."
nohup ./node_modules/.bin/electron . >/dev/null 2>&1 &
disown
sleep 1
osascript -e 'tell application "Terminal" to close (every window whose name contains "Iniciar_SideTask_Pro")' >/dev/null 2>&1 &
exit 0

#!/bin/bash
# ============================================================================
# LANZADOR DE SIDETASK PRO PARA MACOS (Soporta NVM, Homebrew e Instalador PKG)
# ============================================================================
cd "$(dirname "$0")"

# Cargar rutas de Node.js (NVM, Homebrew Apple Silicon / Intel y rutas estándar)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  \. "$NVM_DIR/nvm.sh"
fi

# Quitar cuarentena de Gatekeeper si existe
xattr -cr . 2>/dev/null || true

echo "Cerrando cualquier instancia anterior en segundo plano..."
pkill -9 -f "Sidebar-Pendientes" 2>/dev/null || true
pkill -9 -f "ProyectoPendientes" 2>/dev/null || true
killall -9 "Electron" 2>/dev/null || true
sleep 0.5

if [ -d ".git" ]; then
  echo "Verificando actualizaciones desde GitHub..."
  git pull origin main --ff-only 2>/dev/null || true
fi

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias por primera vez en tu Mac..."
  npm install
fi

echo "Abriendo SideTask Pro en macOS..."
nohup ./node_modules/.bin/electron . >/dev/null 2>&1 &
disown
sleep 1
osascript -e 'tell application "Terminal" to close (every window whose name contains "Iniciar_SideTask_Pro")' >/dev/null 2>&1 &
exit 0

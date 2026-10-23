#!/bin/bash
# ============================================================================
# LANZADOR DE SIDETASK PRO PARA MACOS (Doble clic para abrir)
# ============================================================================
cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias por primera vez en tu Mac..."
  npm install
fi

echo "Iniciando SideTask Pro en macOS..."
npm start

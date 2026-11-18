#!/bin/bash
# FlyNotes - arranque no Mac (duplo clique). Requer o Node.js 22 ou superior: https://nodejs.org
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo; echo "  O Node.js não está instalado. Instale a versão LTS em https://nodejs.org e volte a abrir este ficheiro."; echo
  read -r -p "  Prima Enter para fechar." _; exit 1
fi
if [ ! -d node_modules ]; then
  echo "  A instalar a FlyNotes pela primeira vez. Pode demorar alguns minutos..."
  npm install || { echo "  A instalação falhou."; read -r -p "  Prima Enter para fechar." _; exit 1; }
fi
( sleep 12; open "http://localhost:5173" ) &
npm start

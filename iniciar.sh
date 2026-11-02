#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js (se requiere Node 18 o superior)." >&2
  exit 1
fi
printf 'Iniciando laboratorio en http://127.0.0.1:${PORT:-3000}\n'
node servidor.js

#!/usr/bin/env bash
# ZIP limpio para compartir el proyecto: solo archivos versionados en git
# (nunca .env, node_modules, .next ni datos locales).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_exports/vip-guard-tienda-$(date +%Y%m%d).zip"
mkdir -p "$ROOT/_exports"
cd "$ROOT"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Hay cambios sin guardar en git. Haz commit antes de generar el ZIP." >&2
  exit 1
fi
git archive --format=zip --output "$OUT" HEAD
if unzip -l "$OUT" | grep -E '\.env($|\.local|\.production)|node_modules/|\.next/' >/dev/null; then
  echo "El ZIP contiene archivos que no debería. Revisa .gitignore." >&2
  rm -f "$OUT"
  exit 1
fi
echo "$OUT"

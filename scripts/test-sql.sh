#!/usr/bin/env bash
# Prueba las migraciones y las funciones SQL en un Postgres temporal y limpio.
# No necesita Docker ni Supabase: solo los binarios de Postgres (initdb/pg_ctl/psql).
# Uso: npm run test:sql
set -euo pipefail

export LC_ALL=C LANG=C
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SQL_TEST_PORT:-54399}"
DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vipguard-sql.XXXXXX")"
LOG="$DATA_DIR/postgres.log"

cleanup() {
  pg_ctl -D "$DATA_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

initdb -D "$DATA_DIR/data" -U postgres --auth=trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$DATA_DIR/data" -o "-p $PORT -k $DATA_DIR -c listen_addresses=''" -l "$LOG" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$DATA_DIR" -p "$PORT" -U postgres -d postgres)

# Roles que Supabase crea en cada proyecto.
"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
SQL

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "▸ migración $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

echo "▸ seed"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"

status=0
for test in "$ROOT"/supabase/tests/*.sql; do
  name="$(basename "$test")"
  if "${PSQL[@]}" -f "$test" >/dev/null 2>"$DATA_DIR/err.txt"; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name"
    sed 's/^/    /' "$DATA_DIR/err.txt"
    status=1
  fi
done

exit $status

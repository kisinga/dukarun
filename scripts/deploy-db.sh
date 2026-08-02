#!/usr/bin/env bash
# deploy-db.sh — manual deploy to the Coolify-hosted Supabase instance via a
# short-lived SSH tunnel. The tunnel ALWAYS closes on exit.
#
# What it does:
#   1. Opens an SSH tunnel to the host's private Postgres (no public exposure)
#   2. Applies pending migrations (supabase db push)
#   3. Optionally syncs edge functions into the edge-runtime volume (rsync)
#
# Usage:
#   scripts/deploy-db.sh                 # migrations only
#   scripts/deploy-db.sh --functions     # migrations + edge functions
#
# Env (sane defaults for this project):
#   SSH_HOST        ssh target          (default: root@***REMOVED***)
#   DB_PORT         local forward port  (default: 5433)
#   DB_NAME         target database     (default: postgres)
#   PG_PASSWORD     postgres password   (prompted if unset)
#   FUNCTIONS_VOLUME edge-runtime functions dir on the host
#                   (default: /opt/supabase/functions — override via env)

set -euo pipefail

SSH_HOST="${SSH_HOST:-root@***REMOVED***}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-postgres}"
FUNCTIONS_VOLUME="${FUNCTIONS_VOLUME:-/opt/supabase/functions}"
SYNC_FUNCTIONS=0

for arg in "$@"; do
  case "$arg" in
    --functions) SYNC_FUNCTIONS=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "${PG_PASSWORD:-}" ]; then
  read -rsp "Postgres password: " PG_PASSWORD
  echo
fi

SSH_OPTS=(-o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

echo "→ opening tunnel $SSH_HOST : localhost:$DB_PORT -> postgres:5432"
ssh "${SSH_OPTS[@]}" -N -L "$DB_PORT:127.0.0.1:5432" "$SSH_HOST" &
TUNNEL_PID=$!

# Always close the tunnel, whatever happens.
cleanup() {
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  echo "→ tunnel closed"
}
trap cleanup EXIT

# Wait for the forward to come up.
for _ in $(seq 1 15); do
  if nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null; then break; fi
  sleep 1
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "✗ ssh tunnel failed to open (check host/credentials)" >&2
    exit 1
  fi
done

echo "→ applying migrations"
npx supabase db push --db-url "postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}?sslmode=disable"

if [ "$SYNC_FUNCTIONS" = "1" ]; then
  echo "→ syncing edge functions to ${SSH_HOST}:${FUNCTIONS_VOLUME}"
  for fn in paystack-charge paystack-webhook notification-flush; do
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "supabase/functions/${fn}/" "${SSH_HOST}:${FUNCTIONS_VOLUME}/${fn}/"
  done
  echo "✓ functions synced (edge-runtime hot-reloads; restart it if your template doesn't watch the volume)"
fi

echo "✓ deploy complete"

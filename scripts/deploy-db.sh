#!/usr/bin/env bash
# deploy-db.sh — push supabase migrations to the Coolify-hosted instance via a
# short-lived SSH tunnel. The tunnel ALWAYS closes on exit.
#
# Usage:
#   SSH_HOST=root@<server-ip> scripts/deploy-db.sh
#   SSH_HOST=root@<server-ip> DB_PORT=5433 scripts/deploy-db.sh
#
# Env:
#   SSH_HOST   (required) ssh target, e.g. root@1.2.3.4 or an ~/.ssh/config alias
#   DB_PORT    local forward port (default 5433)
#   DB_NAME    target database (default postgres)
#   PG_PASSWORD postgres password (prompted if unset)

set -euo pipefail

SSH_HOST="${SSH_HOST:?Set SSH_HOST, e.g. SSH_HOST=root@1.2.3.4}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-postgres}"

if [ -z "${PG_PASSWORD:-}" ]; then
  read -rsp "Postgres password: " PG_PASSWORD
  echo
fi

# SSH auth: prefer the agent/key; fall back to interactive password prompt.
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
for i in $(seq 1 15); do
  if nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null; then break; fi
  sleep 1
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "✗ ssh tunnel failed to open (check host/credentials)" >&2
    exit 1
  fi
done

echo "→ pushing migrations"
npx supabase db push --db-url "postgresql://postgres:${PG_PASSWORD}@127.0.0.1:${DB_PORT}/${DB_NAME}"
echo "✓ done"

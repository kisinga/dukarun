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
# Env:
#   .env.deploy (gitignored; see .env.deploy.example) provides:
#     DEPLOY_SSH_HOST      ssh target for the Coolify host
#     COOLIFY_SERVICE_DIR  supabase service dir on the host
#   DB_PORT         local forward port  (default: 5433)
#   DB_NAME         target database     (default: postgres)
#   PG_PASSWORD     postgres password   (fetched from host; prompted as fallback)
#   STOREFRONT_PUBLIC_URL canonical URL synchronized into Database Vault
#                         (default: https://store.dukarun.com)
#   FUNCTIONS_VOLUME edge-runtime functions dir on the host
#                   (default: $COOLIFY_SERVICE_DIR/volumes/functions)

set -euo pipefail

# shellcheck source=/dev/null
[ -f .env.deploy ] && source .env.deploy
SSH_HOST="${DEPLOY_SSH_HOST:?missing DEPLOY_SSH_HOST — copy .env.deploy.example to .env.deploy and fill it in}"
COOLIFY_SERVICE_DIR="${COOLIFY_SERVICE_DIR:?missing COOLIFY_SERVICE_DIR — see .env.deploy.example}"
DB_PORT="${DB_PORT:-5433}"
# If the default port is occupied (e.g. a stale tunnel from an interrupted
# run), walk forward until a free one is found.
while nc -z 127.0.0.1 "$DB_PORT" 2>/dev/null; do DB_PORT=$((DB_PORT + 1)); done
DB_NAME="${DB_NAME:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-}"
STOREFRONT_PUBLIC_URL="${STOREFRONT_PUBLIC_URL:-https://store.dukarun.com}"
FUNCTIONS_VOLUME="${FUNCTIONS_VOLUME:-$COOLIFY_SERVICE_DIR/volumes/functions}"
SYNC_FUNCTIONS=0

case "$STOREFRONT_PUBLIC_URL" in
  http://*|https://*) ;;
  *) echo "STOREFRONT_PUBLIC_URL must be an http(s) URL" >&2; exit 2 ;;
esac
# Receipt links are joined with /document/<token>; keep one canonical origin.
STOREFRONT_PUBLIC_URL="${STOREFRONT_PUBLIC_URL%/}"

for arg in "$@"; do
  case "$arg" in
    --functions) SYNC_FUNCTIONS=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# One ssh connection, reused (ControlMaster) — a single password prompt.
SSH_SOCKET_DIR=$(mktemp -d -t dukarun-deploy-ssh)
SSH_OPTS=(
  -o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new
  -o ControlMaster=auto -o ControlPath="$SSH_SOCKET_DIR/s" -o ControlPersist=300
)

# PG password lives in the Coolify service .env on the host — fetch it
# automatically; prompt only if that fails.
if [ -z "${PG_PASSWORD:-}" ]; then
  PG_PASSWORD=$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    "grep '^SERVICE_PASSWORD_POSTGRES=' '$COOLIFY_SERVICE_DIR/.env' | cut -d= -f2-" 2>/dev/null || true)
fi
if [ -z "${PG_PASSWORD:-}" ]; then
  read -rsp "Postgres password: " PG_PASSWORD
  echo
fi

echo "→ resolving DB container address"
# The supabase DB container does not publish 5432 to the host — tunnel to its
# docker-network IP instead. Container name derives from the Coolify service dir.
DB_CONTAINER="supabase-db-$(basename "$COOLIFY_SERVICE_DIR")"
DB_IP=$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $DB_CONTAINER" 2>/dev/null || true)
if [ -z "${DB_IP:-}" ]; then
  echo "✗ could not resolve IP for container $DB_CONTAINER (is the supabase service up?)" >&2
  exit 1
fi

echo "→ opening tunnel $SSH_HOST : localhost:$DB_PORT -> $DB_CONTAINER:5432 ($DB_IP)"
ssh "${SSH_OPTS[@]}" -N -L "$DB_PORT:$DB_IP:5432" "$SSH_HOST" &
TUNNEL_PID=$!

# Always close the tunnel, whatever happens.
cleanup() {
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  rm -rf "$SSH_SOCKET_DIR" 2>/dev/null || true
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

echo "→ syncing STOREFRONT_PUBLIC_URL into Database Vault"
# Compose build args configure the static frontends only. Receipt messages are
# created by Postgres, so the same canonical origin must also live in Vault.
ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" \
    -v ON_ERROR_STOP=1 -v "secret_value=$STOREFRONT_PUBLIC_URL" <<'SQL'
select vault.create_secret(:'secret_value', 'STOREFRONT_PUBLIC_URL')
where not exists (
  select 1 from vault.secrets where name = 'STOREFRONT_PUBLIC_URL'
);

select vault.update_secret(id, :'secret_value')
from vault.secrets
where name = 'STOREFRONT_PUBLIC_URL';
SQL

if [ "$SYNC_FUNCTIONS" = "1" ]; then
  echo "→ syncing edge functions to ${SSH_HOST}:${FUNCTIONS_VOLUME}"
  for fn in paystack-charge paystack-webhook notification-flush; do
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "supabase/functions/${fn}/" "${SSH_HOST}:${FUNCTIONS_VOLUME}/${fn}/"
  done
  echo "✓ functions synced (edge-runtime hot-reloads; restart it if your template doesn't watch the volume)"
fi

echo "✓ deploy complete"

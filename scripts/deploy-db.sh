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
#   scripts/deploy-db.sh --vault-only    # sync runtime secrets into Vault only
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
#   SITE_DEPLOY_URL public site-deploy Edge Function URL (optional)
#   MPESA_PROCESS_URL service-only M-PESA processor URL (optional)
#   OPENWA_*       read from the Coolify service env (the runtime SSOT) and
#                  synchronized into Database Vault for the auth OTP hook
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
SITE_DEPLOY_URL="${SITE_DEPLOY_URL:-}"
MPESA_PROCESS_URL="${MPESA_PROCESS_URL:-}"
FUNCTIONS_VOLUME="${FUNCTIONS_VOLUME:-$COOLIFY_SERVICE_DIR/volumes/functions}"
SYNC_FUNCTIONS=0
VAULT_ONLY=0

case "$STOREFRONT_PUBLIC_URL" in
  http://*|https://*) ;;
  *) echo "STOREFRONT_PUBLIC_URL must be an http(s) URL" >&2; exit 2 ;;
esac
# Receipt links are joined with /document/<token>; keep one canonical origin.
STOREFRONT_PUBLIC_URL="${STOREFRONT_PUBLIC_URL%/}"
if [ -n "$SITE_DEPLOY_URL" ]; then
  case "$SITE_DEPLOY_URL" in
    https://*) ;;
    *) echo "SITE_DEPLOY_URL must be an https URL" >&2; exit 2 ;;
  esac
fi
if [ -n "$MPESA_PROCESS_URL" ]; then
  case "$MPESA_PROCESS_URL" in
    https://*) ;;
    *) echo "MPESA_PROCESS_URL must be an https URL" >&2; exit 2 ;;
  esac
fi

for arg in "$@"; do
  case "$arg" in
    --functions) SYNC_FUNCTIONS=1 ;;
    --vault-only) VAULT_ONLY=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done
if [ "$SYNC_FUNCTIONS" = "1" ] && [ "$VAULT_ONLY" = "1" ]; then
  echo "--functions and --vault-only cannot be used together" >&2
  exit 2
fi

# Shared SSH options. Keep the tunnel as a real background process so cleanup
# can reliably close it on every exit path.
SSH_OPTS=(
  -o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new
)
TUNNEL_PID=""

cleanup() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "→ tunnel closed"
  fi
}
trap cleanup EXIT

remote_service_env() {
  local key="$1"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    "grep '^${key}=' '$COOLIFY_SERVICE_DIR/.env' | tail -n 1 | cut -d= -f2-" \
    2>/dev/null || true
}

load_openwa_runtime_config() {
  OPENWA_BASE_URL=$(remote_service_env OPENWA_BASE_URL)
  OPENWA_API_KEY=$(remote_service_env OPENWA_API_KEY)
  OPENWA_SESSION=$(remote_service_env OPENWA_SESSION)

  if [ -z "$OPENWA_BASE_URL" ] || [ -z "$OPENWA_API_KEY" ]; then
    echo "OPENWA_BASE_URL and OPENWA_API_KEY must be configured in $COOLIFY_SERVICE_DIR/.env" >&2
    return 1
  fi
  case "$OPENWA_BASE_URL" in
    http://*|https://*) ;;
    *) echo "OPENWA_BASE_URL in the Coolify service env must be an http(s) URL" >&2; return 1 ;;
  esac
  OPENWA_BASE_URL="${OPENWA_BASE_URL%/}"
  OPENWA_SESSION="${OPENWA_SESSION:-default}"
}

sync_vault_secret() {
  local secret_name="$1"
  local secret_value="$2"
  local secret_b64
  secret_b64=$(printf '%s' "$secret_value" | base64 | tr -d '\r\n')

  echo "→ syncing $secret_name into Database Vault"
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
    docker exec -i "$DB_CONTAINER" psql -q -o /dev/null -U postgres -d "$DB_NAME" \
      -v ON_ERROR_STOP=1 -v "secret_name=$secret_name" -v "secret_b64=$secret_b64" <<'SQL'
select vault.create_secret(
  convert_from(decode(:'secret_b64', 'base64'), 'UTF8'),
  :'secret_name'
)
where not exists (select 1 from vault.secrets where name = :'secret_name');

select vault.update_secret(
  id,
  convert_from(decode(:'secret_b64', 'base64'), 'UTF8')
)
from vault.secrets
where name = :'secret_name';
SQL
}

sync_openwa_vault() {
  sync_vault_secret OPENWA_BASE_URL "$OPENWA_BASE_URL"
  sync_vault_secret OPENWA_API_KEY "$OPENWA_API_KEY"
  sync_vault_secret OPENWA_SESSION "$OPENWA_SESSION"
}

DB_CONTAINER="supabase-db-$(basename "$COOLIFY_SERVICE_DIR")"
load_openwa_runtime_config

if [ "$VAULT_ONLY" = "1" ]; then
  sync_openwa_vault
  echo "✓ runtime secrets synced into Database Vault"
  exit 0
fi

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
DB_IP=$(ssh "${SSH_OPTS[@]}" "$SSH_HOST" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $DB_CONTAINER" 2>/dev/null || true)
if [ -z "${DB_IP:-}" ]; then
  echo "✗ could not resolve IP for container $DB_CONTAINER (is the supabase service up?)" >&2
  exit 1
fi

echo "→ opening tunnel $SSH_HOST : localhost:$DB_PORT -> $DB_CONTAINER:5432 ($DB_IP)"
ssh "${SSH_OPTS[@]}" -o ExitOnForwardFailure=yes -N -L "$DB_PORT:$DB_IP:5432" "$SSH_HOST" &
TUNNEL_PID=$!

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

# Compose build args configure the static frontends only. Receipt messages are
# created by Postgres, so the same canonical origin must also live in Vault.
sync_vault_secret STOREFRONT_PUBLIC_URL "$STOREFRONT_PUBLIC_URL"

if [ -n "$SITE_DEPLOY_URL" ]; then
  sync_vault_secret SITE_DEPLOY_URL "$SITE_DEPLOY_URL"
fi

if [ -n "$MPESA_PROCESS_URL" ]; then
  sync_vault_secret MPESA_PROCESS_URL "$MPESA_PROCESS_URL"
fi

sync_openwa_vault

if [ "$SYNC_FUNCTIONS" = "1" ]; then
  echo "→ syncing edge functions to ${SSH_HOST}:${FUNCTIONS_VOLUME}"
  for fn in _shared paystack-charge paystack-webhook mpesa-initiate mpesa-callback mpesa-process mpesa-credentials notification-flush platform-message-test platform-sales-invitation-send public-content-renderer site-deploy usertour-identity; do
    rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
      "supabase/functions/${fn}/" "${SSH_HOST}:${FUNCTIONS_VOLUME}/${fn}/"
  done
  echo "✓ functions synced (edge-runtime hot-reloads; restart it if your template doesn't watch the volume)"
fi

echo "✓ deploy complete"

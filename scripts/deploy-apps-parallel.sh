#!/usr/bin/env bash
# deploy-apps-parallel.sh — run v2 app containers ALONGSIDE the live v1 stack,
# on v2.* subdomains, for pre-cutover testing. Does not touch v1 containers.
#
#   scripts/deploy-apps-parallel.sh                    # all three apps
#   scripts/deploy-apps-parallel.sh web super-admin    # selected apps only
#   FRESH_BUILD=1 scripts/deploy-apps-parallel.sh web  # rebuild without Docker cache
#   scripts/deploy-apps-parallel.sh stop               # stop all parallel containers
#
# Domains (point these subdomains at the host in Cloudflare afterwards):
#   web          -> v2.dukarun.com
#   super-admin  -> admin-v2.dukarun.com
#   storefront   -> store-v2.dukarun.com   (placeholder app — for plumbing tests)
set -euo pipefail

# shellcheck source=/dev/null
source .env.deploy
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
SUPABASE_URL="${SUPABASE_URL:-https://supa.dukarun.com}"

ssh_app() {
  case "$1" in
    web) echo "v2-web v2.dukarun.com" ;;
    super-admin) echo "v2-admin admin-v2.dukarun.com" ;;
    storefront) echo "v2-store store-v2.dukarun.com" ;;
  esac
}
if [ "${1:-}" = "stop" ]; then
  ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_HOST" \
    "docker rm -f v2-web v2-admin v2-store 2>/dev/null; echo stopped"
  exit 0
fi

APPS=("$@")
if [ "$#" -eq 0 ]; then
  APPS=(web super-admin storefront)
fi
for app in "${APPS[@]}"; do
  ssh_app "$app" >/dev/null || { echo "unknown app: $app" >&2; exit 2; }
done

ANON_KEY=$(ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_HOST" \
  "grep '^SERVICE_SUPABASEANON_KEY=' '$COOLIFY_SERVICE_DIR/.env' | cut -d= -f2-")
[ -n "$ANON_KEY" ] || { echo "✗ could not read SERVICE_SUPABASEANON_KEY from host" >&2; exit 1; }

BUILD_CACHE_ARGS=()
if [ "${FRESH_BUILD:-0}" = "1" ]; then
  BUILD_CACHE_ARGS=(--no-cache)
fi

for app in "${APPS[@]}"; do
  image="dukarun-$app:parallel"
  echo "▶ [$app] building (linux/amd64)"
  docker build -q "${BUILD_CACHE_ARGS[@]}" --platform linux/amd64 -f apps/Dockerfile \
    --build-arg "APP=$app" \
    --build-arg "SUPABASE_URL=$SUPABASE_URL" \
    --build-arg "SUPABASE_ANON_KEY=$ANON_KEY" \
    -t "$image" . > /dev/null
  echo "▶ [$app] shipping"
  docker save "$image" | gzip | ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_HOST" 'gunzip | docker load'
done

for app in "${APPS[@]}"; do
  read -r name domain <<<"$(ssh_app "$app")"
  image="dukarun-$app:parallel"
  echo "▶ starting $name"
  ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH_HOST" bash -s -- "$name" "$domain" "$image" <<'REMOTE'
set -euo pipefail
name="$1"
domain="$2"
image="$3"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network coolify --restart unless-stopped \
    --label "caddy=://$domain" \
    --label "caddy.reverse_proxy={{upstreams 80}}" \
    "$image" >/dev/null
  echo "  $name -> $domain"
REMOTE
done

echo "✓ selected parallel containers are up"

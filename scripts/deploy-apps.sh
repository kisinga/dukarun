#!/usr/bin/env bash
# deploy-apps.sh — manual deploy of v2 static apps to the Coolify host.
#
# Builds the app image locally (apps/Dockerfile), ships it via docker save |
# ssh docker load, then swaps the serving container: the OLD container is
# renamed to <name>-backup-<ts> (kept, stopped) and the new one takes its
# exact name, caddy labels, and networks — so the proxy keeps routing the
# domain and rollback is one command.
#
# Usage:
#   scripts/deploy-apps.sh site         # dukarun.com
#   scripts/deploy-apps.sh web          # app.dukarun.com
#   scripts/deploy-apps.sh storefront   # storefront public domain
#   scripts/deploy-apps.sh super-admin  # admin.dukarun.com
#   scripts/deploy-apps.sh all          # all four apps
#   scripts/deploy-apps.sh rollback web # restore the latest backup container
#
# Env:
#   .env.deploy (gitignored; see .env.deploy.example) provides:
#     DEPLOY_SSH_HOST      ssh target for the Coolify host
#     COOLIFY_SERVICE_DIR  supabase service dir on the host
#   SUPABASE_URL       public API URL baked into the bundle
#                      (default: https://supa.dukarun.com)

set -euo pipefail

# shellcheck source=/dev/null
[ -f .env.deploy ] && source .env.deploy
SSH_HOST="${DEPLOY_SSH_HOST:?missing DEPLOY_SSH_HOST — copy .env.deploy.example to .env.deploy and fill it in}"
COOLIFY_SERVICE_DIR="${COOLIFY_SERVICE_DIR:?missing COOLIFY_SERVICE_DIR — see .env.deploy.example}"
SUPABASE_URL="${SUPABASE_URL:-https://supa.dukarun.com}"
SITE_PUBLIC_URL="${SITE_PUBLIC_URL:-https://dukarun.com}"
APP_PUBLIC_URL="${APP_PUBLIC_URL:-https://app.dukarun.com}"
STOREFRONT_PUBLIC_URL="${STOREFRONT_PUBLIC_URL:-https://store.dukarun.com}"
MARKETING_VIDEO_BASE_URL="${SITE_PUBLIC_URL%/}/media/video/product-overview"
GITBOOK_SITE_URL="${GITBOOK_SITE_URL:-https://dukarun.gitbook.io/docs}"
USERTOUR_TOKEN="${USERTOUR_TOKEN:-cmtc4ejtu01yw72cdf7nfwhil}"
USERTOUR_CONTENT_IDS_JSON="${USERTOUR_CONTENT_IDS_JSON:-}"
MARKETING_MEDIA_HOST_DIR="/var/lib/dukarun/marketing-media"
MARKETING_MEDIA_LOCAL_DIR="apps/video/output/final/product-overview"
SSH_OPTS=(-o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)

# app -> container name prefix of the v1 container it replaces
container_prefix() {
  case "$1" in
    site) echo "site-" ;;
    web) echo "app-" ;;
    storefront) echo "storefront-" ;;
    super-admin) echo "super-admin-" ;;
    *) echo "unknown app: $1 (site|web|storefront|super-admin)" >&2; exit 2 ;;
  esac
}

app_domain() {
  case "$1" in
    site) echo "${SITE_PUBLIC_URL#*://}" ;;
    web) echo "${APP_PUBLIC_URL#*://}" ;;
    storefront) echo "${STOREFRONT_PUBLIC_URL#*://}" ;;
    super-admin) echo "admin.dukarun.com" ;;
  esac
}

ssh_cmd() { ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }

# The prod anon key is public-by-design (RLS guards data); fetch from the
# supabase service env on the host so no key ever lives in this repo.
fetch_anon_key() {
  ssh_cmd "grep '^SERVICE_SUPABASEANON_KEY=' '$COOLIFY_SERVICE_DIR/.env' | cut -d= -f2-"
}

sync_site_media() {
  local remote_dir="$MARKETING_MEDIA_HOST_DIR/video/product-overview"
  local files=(
    product-overview-full-wide.mp4
    product-overview-full-wide.png
    product-overview-full-square.mp4
    product-overview-full-square.png
    product-overview.en-KE.vtt
  )
  local file has_local_assets=true

  for file in "${files[@]}"; do
    if [ ! -f "$MARKETING_MEDIA_LOCAL_DIR/$file" ]; then
      has_local_assets=false
      break
    fi
  done

  if [ "$has_local_assets" = true ]; then
    echo "▶ [site] uploading same-origin marketing video"
    ssh_cmd "mkdir -p '$remote_dir'"
    tar --no-xattrs -C "$MARKETING_MEDIA_LOCAL_DIR" -czf - "${files[@]}" \
      | ssh "${SSH_OPTS[@]}" "$SSH_HOST" "tar -xzf - -C '$remote_dir'"
    return
  fi

  echo "▶ [site] no local render; checking persistent media on host"
  ssh_cmd "test -f '$remote_dir/${files[0]}' -a -f '$remote_dir/${files[1]}' -a -f '$remote_dir/${files[2]}' -a -f '$remote_dir/${files[3]}' -a -f '$remote_dir/${files[4]}'" || {
    echo "✗ site media is missing locally and on the host; render product-overview first" >&2
    exit 1
  }
}

deploy_one() {
  local app="$1" image="dukarun-$1:deploy"
  local learning_args=()
  local prefix; prefix=$(container_prefix "$app")
  local domain; domain=$(app_domain "$app")

  if [ "$app" = web ]; then
    learning_args=(
      --build-arg "GITBOOK_SITE_URL=$GITBOOK_SITE_URL"
      --build-arg "USERTOUR_TOKEN=$USERTOUR_TOKEN"
      --build-arg "USERTOUR_CONTENT_IDS_JSON=$USERTOUR_CONTENT_IDS_JSON"
    )
  fi

  [ "$app" != site ] || sync_site_media

  echo "▶ [$app] fetching prod anon key"
  local anon_key; anon_key=$(fetch_anon_key)
  [ -n "$anon_key" ] || { echo "✗ could not read SERVICE_SUPABASEANON_KEY from host" >&2; exit 1; }

  echo "▶ [$app] building image (linux/amd64)"
  docker build --platform linux/amd64 -f apps/Dockerfile \
    --build-arg "APP=$app" \
    --build-arg "SUPABASE_URL=$SUPABASE_URL" \
    --build-arg "SUPABASE_ANON_KEY=$anon_key" \
    --build-arg "SITE_PUBLIC_URL=$SITE_PUBLIC_URL" \
    --build-arg "APP_PUBLIC_URL=$APP_PUBLIC_URL" \
    --build-arg "STOREFRONT_PUBLIC_URL=$STOREFRONT_PUBLIC_URL" \
    --build-arg "MARKETING_VIDEO_BASE_URL=$MARKETING_VIDEO_BASE_URL" \
    "${learning_args[@]}" \
    --build-arg "PUBLIC_DATA_MODE=live" \
    -t "$image" .

  echo "▶ [$app] shipping image to $SSH_HOST"
  docker save "$image" | gzip | ssh "${SSH_OPTS[@]}" "$SSH_HOST" 'gunzip | docker load'

  echo "▶ [$app] swapping container (prefix $prefix)"
  # shellcheck disable=SC2087
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s -- \
    "$prefix" "$image" "$domain" "$app" "$MARKETING_MEDIA_HOST_DIR" <<'REMOTE'
set -euo pipefail
PREFIX="$1"; IMAGE="$2"; DOMAIN="$3"; APP="$4"; MEDIA_DIR="$5"

MEDIA_ARGS=()
if [ "$APP" = site ]; then
  mkdir -p "$MEDIA_DIR"
  MEDIA_ARGS=(--mount "type=bind,source=$MEDIA_DIR,target=/usr/share/nginx/html/media,readonly")
fi

wait_healthy() {
  local name="$1" status health attempt
  for attempt in $(seq 1 45); do
    status=$(docker inspect "$name" --format '{{.State.Status}}' 2>/dev/null || true)
    health=$(docker inspect "$name" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || true)
    case "$status" in
      running) [ "$health" = "healthy" ] && return 0 ;;
      exited|dead) return 1 ;;
    esac
    sleep 1
  done
  return 1
}

OLD=$(docker ps --format '{{.Names}}' | grep "^${PREFIX}" | head -1 || true)
if [ -z "$OLD" ]; then
  CONFLICT=$(docker ps --filter "label=caddy=://$DOMAIN" --format '{{.Names}}' | head -1)
  [ -z "$CONFLICT" ] || {
    echo "✗ $DOMAIN is still routed to $CONFLICT; move or remove that route before deployment" >&2
    exit 1
  }
  NAME="${PREFIX}primary"
  docker run -d --name "$NAME" --restart unless-stopped --network coolify \
    --label "caddy=://$DOMAIN" --label 'caddy.reverse_proxy={{upstreams 80}}' \
    "${MEDIA_ARGS[@]}" "$IMAGE" >/dev/null
  if ! wait_healthy "$NAME"; then
    echo "✗ $NAME did not become healthy" >&2
    docker logs --tail 50 "$NAME" >&2 || true
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    exit 1
  fi
  echo "  ✓ $NAME created for $DOMAIN"
  exit 0
fi

TS=$(date +%Y%m%d%H%M%S)
BACKUP="${OLD}-backup-${TS}"

# Capture labels in a file so values containing spaces (for example
# `caddy.encode=zstd gzip`) remain one label instead of becoming image args.
LABEL_FILE=$(mktemp)
docker inspect "$OLD" --format '{{range $k,$v := .Config.Labels}}{{printf "%s=%s\n" $k $v}}{{end}}' > "$LABEL_FILE"
NETWORKS=$(docker inspect "$OLD" --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}')
PRIMARY_NETWORK=$(printf '%s\n' "$NETWORKS" | head -1)

echo "  old: $OLD -> backup: $BACKUP"
docker rename "$OLD" "$BACKUP"
docker stop "$BACKUP" >/dev/null

# Run the new container with the old identity. Restore immediately if Docker
# rejects the launch; do not leave production without its serving container.
if ! docker run -d --name "$OLD" --restart unless-stopped \
  --label-file "$LABEL_FILE" --network "$PRIMARY_NETWORK" \
  "${MEDIA_ARGS[@]}" "$IMAGE"; then
  rm -f "$LABEL_FILE"
  docker rename "$BACKUP" "$OLD"
  docker start "$OLD" >/dev/null
  exit 1
fi
rm -f "$LABEL_FILE"
# Join any additional networks.
for net in $NETWORKS; do
  [ "$net" = "$PRIMARY_NETWORK" ] && continue
  docker network connect "$net" "$OLD" 2>/dev/null || true
done

if ! wait_healthy "$OLD"; then
  echo "✗ new container failed its health check; rolling back"
  docker logs --tail 50 "$OLD" >&2 || true
  docker rm -f "$OLD" >/dev/null 2>&1 || true
  docker rename "$BACKUP" "$OLD"
  docker start "$OLD" >/dev/null
  exit 1
fi
echo "  ✓ $OLD serving new image (backup: $BACKUP)"
REMOTE
}

rollback_one() {
  local app="$1" prefix; prefix=$(container_prefix "$app")
  ssh "${SSH_OPTS[@]}" "$SSH_HOST" bash -s -- "$prefix" <<'REMOTE'
set -euo pipefail
PREFIX="$1"
CUR=$(docker ps -a --format '{{.Names}}' | grep "^${PREFIX}" | grep -v backup | head -1 || true)
BACKUP=$(docker ps -a --format '{{.Names}}' | grep "^${CUR}-backup-" | sort -r | head -1 || true)
[ -n "$CUR" ] && [ -n "$BACKUP" ] || { echo "✗ no current/backup pair for prefix $PREFIX" >&2; exit 1; }
echo "  rollback: $CUR <- $BACKUP"
docker rm -f "$CUR" >/dev/null
docker rename "$BACKUP" "$CUR"
docker start "$CUR" >/dev/null
echo "  ✓ restored"
REMOTE
}

case "${1:-}" in
  site|web|storefront|super-admin) deploy_one "$1" ;;
  all) deploy_one web; deploy_one storefront; deploy_one super-admin; deploy_one site ;;
  rollback) rollback_one "${2:?usage: deploy-apps.sh rollback site|web|storefront|super-admin}" ;;
  *) echo "usage: scripts/deploy-apps.sh [site|web|storefront|super-admin|all|rollback <app>]" >&2; exit 2 ;;
esac

echo "✓ done"

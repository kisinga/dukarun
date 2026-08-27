#!/usr/bin/env bash
# Publish approved learning media to the persistent public-site media mount.
# Usage: REMOTION_COMMERCIAL_LICENSE_CONFIRMED=true scripts/publish-guide-media.sh all|<project-id>

set -euo pipefail

[ -f .env.deploy ] && source .env.deploy
[ "${REMOTION_COMMERCIAL_LICENSE_CONFIRMED:-}" = true ] || {
  echo "Confirm the applicable Remotion commercial licence before publishing." >&2
  exit 2
}

SSH_HOST="${DEPLOY_SSH_HOST:?missing DEPLOY_SSH_HOST}"
REMOTE_ROOT="/var/lib/dukarun/marketing-media/video/guides"
OUTPUT_ROOT="apps/video/output/final"
requested="${1:-}"
[ -n "$requested" ] || { echo "Usage: $0 all|<project-id>" >&2; exit 2; }

projects=(
  guide-product
  guide-supplier
  guide-credit-purchase
  guide-cash-sale
  guide-customer-credit
  guide-credit-sale
  guide-finance-recap
  guide-generate-barcodes
  guide-scan-barcode
)

topic_slug() {
  case "$1" in
    guide-product) echo creating-a-product ;;
    guide-supplier) echo creating-a-supplier ;;
    guide-credit-purchase) echo recording-a-credit-purchase ;;
    guide-cash-sale) echo making-a-cash-sale ;;
    guide-customer-credit) echo creating-a-customer-with-credit ;;
    guide-credit-sale) echo making-a-credit-sale ;;
    guide-finance-recap) echo understanding-the-financial-result ;;
    guide-generate-barcodes) echo generating-product-barcodes ;;
    guide-scan-barcode) echo selling-by-scanning-a-barcode ;;
    *) return 1 ;;
  esac
}

if [ "$requested" != all ]; then
  topic_slug "$requested" >/dev/null || { echo "Unknown learning project: $requested" >&2; exit 2; }
  projects=("$requested")
fi

stage_dir=$(mktemp -d)
trap 'rm -rf "$stage_dir"' EXIT

for project in "${projects[@]}"; do
  slug=$(topic_slug "$project")
  source_dir="$OUTPUT_ROOT/$project"
  target_dir="$stage_dir/$slug"
  mkdir -p "$target_dir"
  test -f "$source_dir/$project-full-wide.mp4"
  test -f "$source_dir/$project-full-wide.png"
  test -f "$source_dir/$project.en-KE.vtt"
  test -f "$source_dir/$project.en-KE.txt"
  cp "$source_dir/$project-full-wide.mp4" "$target_dir/$slug.mp4"
  cp "$source_dir/$project-full-wide.png" "$target_dir/$slug.png"
  cp "$source_dir/$project.en-KE.vtt" "$target_dir/$slug.en-KE.vtt"
  cp "$source_dir/$project.en-KE.txt" "$target_dir/$slug.en-KE.txt"
done

ssh -o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "$SSH_HOST" "mkdir -p '$REMOTE_ROOT'"
tar --no-xattrs -C "$stage_dir" -czf - . | \
  ssh -o BatchMode=no -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "$SSH_HOST" "tar -xzf - -C '$REMOTE_ROOT'"

echo "Published ${#projects[@]} learning video project(s) beneath /media/video/guides."

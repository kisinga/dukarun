#!/bin/sh
set -e

# Super Admin container: inject runtime config and start nginx (same pattern as frontend docker-entrypoint).
# API_URL: use full URL when backend is different origin (e.g. Docker Compose); use /admin-api for same-origin (reverse proxy).

export API_URL="${API_URL:-/admin-api}"

if [ -f /usr/share/nginx/html/index.html ]; then
  CONFIG_SCRIPT="<script>window.__APP_CONFIG__={apiUrl:'${API_URL}'};</script>"
  sed -i "s|</head>|${CONFIG_SCRIPT}</head>|" /usr/share/nginx/html/index.html
fi

nginx -t
exec nginx -g 'daemon off;'

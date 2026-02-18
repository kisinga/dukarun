#!/bin/sh
set -e

# Super Admin container: inject runtime config and start nginx

export API_URL="${API_URL:-/admin-api}"

if [ -f /usr/share/nginx/html/index.html ]; then
  CONFIG_SCRIPT="<script>window.__APP_CONFIG__={apiUrl:'${API_URL}'};</script>"
  sed -i "s|</head>|${CONFIG_SCRIPT}</head>|" /usr/share/nginx/html/index.html
fi

nginx -t
exec nginx -g 'daemon off;'

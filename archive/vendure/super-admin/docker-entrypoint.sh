#!/bin/sh
set -e

# Super Admin container: same pattern as frontend — nginx proxies /admin-api to backend.
# No API URL injection; app uses relative /admin-api. BACKEND_HOST/BACKEND_PORT from env (e.g. backend:3000).

export BACKEND_HOST="${BACKEND_HOST:-backend}"
export BACKEND_PORT="${BACKEND_PORT:-3000}"

echo "🔧 Configuring nginx for backend: ${BACKEND_HOST}:${BACKEND_PORT}"

if [ ! -f /etc/nginx/conf.d/default.conf.template ]; then
  echo "❌ Error: nginx template not found"
  exit 1
fi

envsubst '${BACKEND_HOST} ${BACKEND_PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'

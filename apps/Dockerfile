# ========================================
# v2 frontend apps (web | storefront | super-admin) — one Dockerfile for all.
# Build context: repository root (.)
#
# Required build args:
#   APP                web | storefront | super-admin
#   SUPABASE_URL       e.g. https://supa.dukarun.com
#   SUPABASE_ANON_KEY  the supabase service's anon key
# SUPABASE_* are baked into the bundle by scripts/generate-environment.mjs (prebuild).
# ========================================

FROM node:22-alpine AS builder
ARG APP
RUN test -n "$APP" || (echo "❌ APP build arg required (web|storefront|super-admin)" && exit 1)

WORKDIR /app

# Standalone per-app install (same pattern as the proven v1 frontend build)
COPY apps/$APP/package.json apps/$APP/package.json
RUN cd apps/$APP && npm install --quiet --no-audit --no-fund --include=dev

# Sources the build needs: the app, the env generator, the shared types
COPY scripts/generate-environment.mjs scripts/generate-environment.mjs
COPY packages/shared-types packages/shared-types
COPY apps/$APP apps/$APP

ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV SUPABASE_URL=$SUPABASE_URL SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

RUN cd apps/$APP && npm run build

RUN echo "🔍 Validating build output..." && \
    BUILD_DIR="/app/apps/$APP/dist/$APP/browser" && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "❌ ERROR: index.html not found in $BUILD_DIR" && \
      find /app/apps/$APP/dist -type d -maxdepth 3 2>/dev/null || true && \
      exit 1; \
    fi && \
    echo "✅ Build output validated"

# Stage 2: Production nginx server
FROM nginx:1.27-alpine
ARG APP

RUN apk add --no-cache curl
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=builder /app/apps/$APP/dist/$APP/browser /usr/share/nginx/html
COPY apps/nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80

# ========================================
# v2 frontend apps (site | web | storefront | super-admin) — one Dockerfile for all.
# Build context: repository root (.)
#
# Required build args:
#   APP                site | web | storefront | super-admin
#   SUPABASE_URL       e.g. https://supa.dukarun.com
#   SUPABASE_ANON_KEY  the supabase service's anon key
#   SITE_PUBLIC_URL    canonical public site URL
#   APP_PUBLIC_URL     authenticated merchant app URL
#   STOREFRONT_PUBLIC_URL public storefront URL
#   MARKETING_VIDEO_BASE_URL public base URL for optional marketing video assets
# SUPABASE_* are baked into the bundle by scripts/generate-environment.mjs (prebuild).
# ========================================

FROM node:22-alpine AS builder
ARG APP
RUN case "$APP" in site|web|storefront|super-admin) ;; *) echo "APP must be site|web|storefront|super-admin"; exit 1 ;; esac

WORKDIR /app

# Install the selected workspace from the committed dependency graph. All workspace
# manifests are required for npm to validate the root lockfile.
COPY package.json package-lock.json ./
COPY apps/site/package.json apps/site/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/storefront/package.json apps/storefront/package.json
COPY apps/super-admin/package.json apps/super-admin/package.json
COPY apps/video/package.json apps/video/package.json
RUN HUSKY=0 npm ci --quiet --no-audit --no-fund --include=dev \
    --workspace "@dukarun/$APP" --include-workspace-root=false

# Sources the build needs: the app, the env generator, and shared packages
COPY scripts/generate-environment.mjs scripts/generate-environment.mjs
COPY scripts/generate-site-seo-files.mjs scripts/generate-site-seo-files.mjs
COPY scripts/generate-storefront-sitemap.mjs scripts/generate-storefront-sitemap.mjs
COPY packages/shared-types packages/shared-types
COPY packages/legal-markdown.ts packages/legal-markdown.ts
COPY apps/$APP apps/$APP

ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG SITE_PUBLIC_URL
ARG APP_PUBLIC_URL
ARG STOREFRONT_PUBLIC_URL
ARG MARKETING_VIDEO_BASE_URL=""
ARG PUBLIC_DATA_MODE=live
ENV SUPABASE_URL=$SUPABASE_URL \
    SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
    SITE_PUBLIC_URL=$SITE_PUBLIC_URL \
    APP_PUBLIC_URL=$APP_PUBLIC_URL \
    STOREFRONT_PUBLIC_URL=$STOREFRONT_PUBLIC_URL \
    MARKETING_VIDEO_BASE_URL=$MARKETING_VIDEO_BASE_URL \
    PUBLIC_DATA_MODE=$PUBLIC_DATA_MODE

RUN cd apps/$APP && npm run build

RUN echo "🔍 Validating build output..." && \
    BUILD_DIR="/app/apps/$APP/dist/$APP/browser" && \
    if [ ! -f "$BUILD_DIR/index.html" ] && [ -f "$BUILD_DIR/index.csr.html" ]; then \
      cp "$BUILD_DIR/index.csr.html" "$BUILD_DIR/index.html"; \
    fi && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "❌ ERROR: index.html not found in $BUILD_DIR" && \
      find /app/apps/$APP/dist -type d -maxdepth 3 2>/dev/null || true && \
      exit 1; \
    fi && \
    echo "✅ Build output validated"

# Stage 2: Production nginx server
FROM nginx:1.27-alpine
ARG APP
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY

RUN apk add --no-cache curl
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=builder /app/apps/$APP/dist/$APP/browser /usr/share/nginx/html
COPY apps/nginx.conf /tmp/nginx-csr.conf
COPY apps/nginx-spa.conf /tmp/nginx-spa.conf
RUN case "$APP" in \
      site|storefront) test -n "$SUPABASE_URL" && test -n "$SUPABASE_ANON_KEY" ;; \
      web|super-admin) cp /tmp/nginx-spa.conf /etc/nginx/conf.d/default.conf ;; \
    esac && \
    if [ "$APP" = "site" ] || [ "$APP" = "storefront" ]; then \
      sed -e "s|__SUPABASE_URL__|${SUPABASE_URL%/}|g" \
          -e "s|__SUPABASE_ANON_KEY__|$SUPABASE_ANON_KEY|g" \
          -e "s|__APP__|$APP|g" \
          /tmp/nginx-csr.conf > /etc/nginx/conf.d/default.conf; \
    fi && \
    rm /tmp/nginx-csr.conf /tmp/nginx-spa.conf && nginx -t

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80

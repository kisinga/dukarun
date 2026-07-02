# ========================================
# Public Storefront Production Dockerfile
# Build context: repository root (.)
# Uses root package-lock.json for deterministic installs.
# Same pattern as frontend/super-admin: node build, nginx serve (port 4202).
# ========================================

# Stage 1: Build Angular application
FROM node:22-alpine AS builder

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

# Every workspace package.json must exist before npm ci so workspaces resolve
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY super-admin/package.json super-admin/
COPY storefront/package.json storefront/

RUN npm ci --quiet --no-audit --no-fund --include=dev

COPY . .

RUN npm run build -w @dukarun/storefront -- --configuration production

# Angular application builder outputs to storefront/dist/storefront/browser
RUN echo "Validating build output..." && \
    BUILD_DIR="/app/storefront/dist/storefront/browser" && \
    if [ ! -d "$BUILD_DIR" ]; then \
      echo "ERROR: Build directory not found at $BUILD_DIR" && find /app/storefront/dist -type d -maxdepth 3 2>/dev/null; exit 1; \
    fi && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "ERROR: index.html not found"; exit 1; \
    fi && echo "Build output OK"

# Stage 2: Production nginx server (port 4202)
FROM nginx:1.27-alpine

RUN apk add --no-cache curl

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=builder /app/storefront/dist/storefront/browser /usr/share/nginx/html

COPY --from=builder /app/storefront/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=builder /app/storefront/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4202/health || exit 1

EXPOSE 4202

ENTRYPOINT ["/docker-entrypoint.sh"]

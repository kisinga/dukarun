# ========================================
# Super Admin Production Dockerfile
# Build context: repository root (.)
# Uses root package-lock.json for deterministic installs.
# ========================================
# Same pattern as main frontend: node build, nginx serve on port 4201.

# Stage 1: Build Angular application
FROM node:22-alpine AS builder

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

# Workspace package.json files must exist before npm ci so workspaces are resolved
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY ml-trainer/package.json ml-trainer/
COPY super-admin/package.json super-admin/

RUN npm ci --quiet --no-audit --no-fund --include=dev

COPY . .

RUN npm run build -w super-admin -- --configuration production

# Angular application builder outputs to super-admin/dist/super-admin/browser
RUN echo "Validating build output..." && \
    BUILD_DIR="/app/super-admin/dist/super-admin/browser" && \
    if [ ! -d "$BUILD_DIR" ]; then \
      echo "ERROR: Build directory not found at $BUILD_DIR" && find /app/super-admin/dist -type d -maxdepth 3 2>/dev/null; exit 1; \
    fi && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "ERROR: index.html not found"; exit 1; \
    fi && echo "Build output OK"

# Stage 2: Production nginx server (port 4201)
FROM nginx:1.27-alpine

RUN apk add --no-cache curl

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=builder /app/super-admin/dist/super-admin/browser /usr/share/nginx/html

COPY --from=builder /app/super-admin/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=builder /app/super-admin/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4201/health || exit 1

EXPOSE 4201

ENTRYPOINT ["/docker-entrypoint.sh"]

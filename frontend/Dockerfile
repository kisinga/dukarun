# ========================================
# Frontend Production Dockerfile
# Build context: repository root (.)
# Uses root package-lock.json for deterministic installs.
# ========================================

FROM node:22-alpine AS builder

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

RUN npm ci --quiet --no-audit --no-fund

COPY . .

RUN npm run build -w @dukarun/frontend -- --configuration production

RUN echo "🔍 Validating build output..." && \
    BUILD_DIR="/app/frontend/dist/dukarun/browser" && \
    if [ ! -d "$BUILD_DIR" ]; then \
      echo "❌ ERROR: Build directory not found at $BUILD_DIR" && \
      find /app/frontend/dist -type d -maxdepth 3 2>/dev/null || true && \
      exit 1; \
    fi && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "❌ ERROR: index.html not found in $BUILD_DIR" && \
      ls -la "$BUILD_DIR" | head -20 && \
      exit 1; \
    fi && \
    echo "✅ Build output validated"

# Stage 2: Production nginx server
FROM nginx:1.27-alpine

RUN apk add --no-cache curl

RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

COPY --from=builder /app/frontend/dist/dukarun/browser /usr/share/nginx/html

RUN echo "✅ Verifying copied build output..." && \
    if [ ! -f /usr/share/nginx/html/index.html ]; then \
      echo "❌ ERROR: index.html not found after copy" && exit 1; \
    fi && \
    echo "✅ Build output copied successfully"

COPY --from=builder /app/frontend/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=builder /app/frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN mkdir -p /var/cache/nginx/proxy && \
    chown -R nginx:nginx /var/cache/nginx && \
    chmod -R 755 /var/cache/nginx

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4200/health || exit 1

EXPOSE 4200

ENTRYPOINT ["/docker-entrypoint.sh"]

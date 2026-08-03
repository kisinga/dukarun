# ========================================
# Public Storefront Production Dockerfile
# Build context: repository root (.)
# Legacy standalone build; excluded from the active root workspace.
# Vendure-era pattern: node build, nginx serve (port 4202).
# ========================================

# Stage 1: Build Angular application
FROM node:22-alpine AS builder

WORKDIR /app/storefront

COPY archive/vendure/storefront/package.json ./
RUN npm install --quiet --no-audit --no-fund --include=dev

COPY archive/vendure/storefront/ ./

RUN npm run build -- --configuration production

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

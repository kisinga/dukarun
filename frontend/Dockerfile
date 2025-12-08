# ========================================
# Frontend Production Dockerfile
# ========================================

# Stage 1: Build Angular application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies with clean install (faster, deterministic)
RUN npm ci --quiet --no-audit --no-fund

# Copy source code
COPY . .

# Build for production with optimizations
RUN npm run build -- --configuration production

# Validate build output (verified via docker build inspection)
# Angular CLI outputs to: /app/dist/dukarun/browser
RUN echo "🔍 Validating build output..." && \
    BUILD_DIR="/app/dist/dukarun/browser" && \
    if [ ! -d "$BUILD_DIR" ]; then \
      echo "❌ ERROR: Build directory not found at $BUILD_DIR" && \
      echo "Available directories in /app/dist:" && \
      find /app/dist -type d -maxdepth 2 2>/dev/null && \
      exit 1; \
    fi && \
    if [ ! -f "$BUILD_DIR/index.html" ]; then \
      echo "❌ ERROR: index.html not found in $BUILD_DIR" && \
      echo "Files in build directory:" && \
      ls -la "$BUILD_DIR" | head -20 && \
      exit 1; \
    fi && \
    echo "✅ Build output validated:" && \
    echo "  - Directory: $BUILD_DIR" && \
    echo "  - JS files: $(find "$BUILD_DIR" -name "*.js" -type f | wc -l)" && \
    echo "  - CSS files: $(find "$BUILD_DIR" -name "*.css" -type f | wc -l)" && \
    echo "  - Total files: $(find "$BUILD_DIR" -type f | wc -l)"

# Stage 2: Production nginx server
FROM nginx:1.27-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default nginx config and content
RUN rm -rf /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*

# Copy build output from builder stage (path verified via docker build inspection)
# Angular CLI outputs to: /app/dist/dukarun/browser
COPY --from=builder /app/dist/dukarun/browser /usr/share/nginx/html

# Verify copied files
RUN echo "✅ Verifying copied build output..." && \
    if [ ! -f /usr/share/nginx/html/index.html ]; then \
      echo "❌ ERROR: index.html not found after copy" && \
      echo "Contents of /usr/share/nginx/html:" && \
      ls -la /usr/share/nginx/html/ && \
      exit 1; \
    fi && \
    if [ ! -f /usr/share/nginx/html/assets/screenshots/dashboard_mobile.png ]; then \
      echo "❌ ERROR: assets/screenshots/dashboard_mobile.png not found after copy" && \
      echo "Contents of /usr/share/nginx/html/assets:" && \
      ls -la /usr/share/nginx/html/assets/ 2>/dev/null || echo "assets directory not found" && \
      exit 1; \
    fi && \
    echo "✅ Build output copied successfully:" && \
    echo "  - Total files: $(find /usr/share/nginx/html -type f | wc -l)" && \
    echo "  - JS files: $(find /usr/share/nginx/html -name "*.js" | wc -l)" && \
    echo "  - CSS files: $(find /usr/share/nginx/html -name "*.css" | wc -l)" && \
    echo "  - HTML files: $(find /usr/share/nginx/html -name "*.html" | wc -l)" && \
    echo "  - Screenshot files: $(find /usr/share/nginx/html/assets/screenshots -type f 2>/dev/null | wc -l)" && \
    echo "  - Logo files: $(find /usr/share/nginx/html/assets/logo -type f 2>/dev/null | wc -l)"

# Copy nginx configuration as template (will be processed at runtime)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy and make entrypoint executable
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create cache directories for nginx
RUN mkdir -p /var/cache/nginx/proxy && \
    chown -R nginx:nginx /var/cache/nginx && \
    chmod -R 755 /var/cache/nginx

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4200/health || exit 1

EXPOSE 4200

# Entrypoint will substitute env vars and start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
# ========================================
# Backend Production Dockerfile
# Build context: repository root (.)
# Legacy standalone build; excluded from the active root workspace.
# ========================================

FROM node:22-alpine AS builder

WORKDIR /app/backend

COPY archive/vendure/backend/package.json ./

ENV NODE_ENV=development

RUN --mount=type=cache,target=/root/.npm \
    npm install --quiet --no-audit --no-fund --include=dev

# Only backend source; frontend excluded via dockerignore.backend
COPY archive/vendure/backend ./

RUN npm run build

RUN echo "Build verification:" && \
    ls -la dist/ && \
    if [ ! -f "dist/src/index.js" ]; then echo "❌ dist/src/index.js not found!"; exit 1; fi && \
    if [ ! -f "dist/src/index-worker.js" ]; then echo "❌ dist/src/index-worker.js not found!"; exit 1; fi && \
    if [ ! -f "dist/src/entrypoint.js" ]; then echo "❌ dist/src/entrypoint.js not found!"; exit 1; fi && \
    echo "✅ Build verification successful"

# Stage 2: Production runtime
FROM node:22-alpine

RUN apk add --no-cache wget dumb-init && \
    addgroup -g 1001 -S vendure && \
    adduser -u 1001 -S vendure -G vendure

ENV NODE_ENV=production

# Preserve workspace layout so Node resolves backend/node_modules (p-limit, etc.)
# Copy with ownership so we avoid slow chown -R over node_modules
COPY --from=builder --chown=vendure:vendure /app/backend/node_modules /usr/src/app/backend/node_modules
COPY --from=builder --chown=vendure:vendure /app/backend /usr/src/app/backend

RUN mkdir -p /usr/src/app/backend/static/assets/cache /usr/src/app/backend/static/uploads && \
    chown -R vendure:vendure /usr/src/app/backend/static

WORKDIR /usr/src/app/backend

RUN echo "Verifying production files:" && \
    test -f dist/src/index.js && test -f dist/src/entrypoint.js && \
    echo "✅ Production stage verification successful"

USER vendure

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/entrypoint.js"]

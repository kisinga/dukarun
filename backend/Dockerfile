# ========================================
# Backend Production Dockerfile
# Build context: repository root (.)
# Uses root package-lock.json for deterministic installs.
# ========================================

FROM node:22-alpine AS builder

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

# Workspace package.json files must exist before npm ci so workspaces are resolved
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY ml-trainer/package.json ml-trainer/

ENV NODE_ENV=development

RUN --mount=type=cache,target=/root/.npm \
    npm ci --quiet --no-audit --no-fund --include=dev --workspace=@dukarun/backend

# Only backend source; frontend/ml-trainer excluded via dockerignore.backend
COPY backend ./backend

RUN npm run build -w @dukarun/backend

RUN echo "Build verification:" && \
    ls -la backend/dist/ && \
    if [ ! -f "backend/dist/src/index.js" ]; then echo "❌ backend/dist/src/index.js not found!"; exit 1; fi && \
    if [ ! -f "backend/dist/src/index-worker.js" ]; then echo "❌ backend/dist/src/index-worker.js not found!"; exit 1; fi && \
    if [ ! -f "backend/dist/src/entrypoint.js" ]; then echo "❌ backend/dist/src/entrypoint.js not found!"; exit 1; fi && \
    echo "✅ Build verification successful"

# Stage 2: Production runtime
FROM node:22-alpine

RUN apk add --no-cache wget dumb-init

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Preserve workspace layout so Node resolves backend/node_modules (p-limit, etc.)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/backend/static ./static
RUN mkdir -p static/assets/cache static/uploads

RUN echo "Verifying production files:" && \
    test -f backend/dist/src/index.js && test -f backend/dist/src/entrypoint.js && \
    echo "✅ Production stage verification successful"

RUN addgroup -g 1001 -S vendure && \
    adduser -u 1001 -S vendure -G vendure && \
    chown -R vendure:vendure /usr/src/app

USER vendure

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/dist/src/entrypoint.js"]

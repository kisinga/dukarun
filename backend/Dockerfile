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

RUN npm ci --quiet --no-audit --no-fund --include=dev

COPY . .

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

# Copy node_modules from builder (already has all deps that built successfully)
# Re-running npm ci in prod was missing packages; copying guarantees consistency
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/backend/package.json backend/
COPY --from=builder /app/frontend/package.json frontend/
COPY --from=builder /app/ml-trainer/package.json ml-trainer/
COPY --from=builder /app/node_modules ./node_modules

RUN npm prune --omit=dev

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/static ./static
RUN mkdir -p static/assets/cache static/uploads

RUN echo "Verifying production files:" && \
    ls -la dist/ && \
    if [ ! -f "dist/src/index.js" ]; then echo "❌ dist/src/index.js not found in production stage!"; exit 1; fi && \
    if [ ! -f "dist/src/index-worker.js" ]; then echo "❌ dist/src/index-worker.js not found in production stage!"; exit 1; fi && \
    if [ ! -f "dist/src/entrypoint.js" ]; then echo "❌ dist/src/entrypoint.js not found in production stage!"; exit 1; fi && \
    echo "✅ Production stage verification successful"

RUN addgroup -g 1001 -S vendure && \
    adduser -u 1001 -S vendure -G vendure && \
    chown -R vendure:vendure /usr/src/app

USER vendure

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/entrypoint.js"]

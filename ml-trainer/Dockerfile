# ========================================
# ML Trainer Production Dockerfile
# Build context: repository root (.)
# Multi-stage: builder (deps + build) -> runner (slim + Chromium + prod deps only).
# ========================================

# Stage 1: Build (no Chromium needed)
FROM node:20-bookworm-slim AS builder

ENV CI=1

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

# Workspace package.json files must exist before npm ci so workspaces are resolved
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY ml-trainer/package.json ml-trainer/
COPY super-admin/package.json super-admin/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --quiet --no-audit --no-fund --include=dev --workspace=@dukarun/ml-trainer

# Only ml-trainer source (other apps excluded via dockerignore.ml-trainer)
COPY ml-trainer ./ml-trainer

RUN npm run build -w @dukarun/ml-trainer

RUN test -f ml-trainer/dist/server.js || (echo "Build failed: ml-trainer/dist/server.js not found" && exit 1)

# Stage 2: Production runtime (slim + Chromium)
FROM node:20-bookworm-slim

ENV CI=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only manifests and built output (no source)
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/backend/package.json backend/
COPY --from=builder /app/frontend/package.json frontend/
COPY --from=builder /app/ml-trainer/package.json ml-trainer/
COPY --from=builder /app/ml-trainer/dist ml-trainer/dist
COPY --from=builder /app/super-admin/package.json super-admin/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --quiet --no-audit --no-fund --omit=dev --workspace=@dukarun/ml-trainer

EXPOSE 3005

CMD ["node", "ml-trainer/dist/server.js"]

# ========================================
# ML Trainer Production Dockerfile
# Build context: repository root (.)
# Uses root package-lock.json for deterministic installs.
# ========================================

FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

WORKDIR /app

# Root workspace manifests (single source of truth for lockfile)
COPY package.json package-lock.json ./

RUN npm ci --quiet --no-audit --no-fund

COPY . .

RUN npm run build -w @dukarun/ml-trainer

EXPOSE 3005

CMD ["npm", "start", "-w", "@dukarun/ml-trainer"]

# Node 20 + Chromium for Puppeteer (Teachable Machine automation)
FROM node:20-bullseye

# Install Chromium and dependencies for headless browser
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer will use this Chromium in Docker
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

EXPOSE 3005

CMD ["npm", "start"]

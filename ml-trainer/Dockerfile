FROM node:20-bullseye-slim

# Install system dependencies required for @tensorflow/tfjs-node
# python3, make, g++ are needed for native compilation if prebuilds fail
# libc6-dev, libssl-dev etc. are good to have for native addons
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first to leverage cache
COPY package.json ./

# Install dependencies
# We use npm ci for reliable builds
# If tfjs-node prebuilds fail, it will fall back to build-from-source (slow but reliable)
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]

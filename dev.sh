#!/bin/bash

# Dukarun Development Script
# Starts frontend, backend, and ml-trainer in dev mode

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Store PIDs for cleanup
PIDS=()

cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${GREEN}Starting Dukarun Development Environment${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Start Backend
echo -e "${BLUE}[Backend]${NC} Starting..."
cd "$SCRIPT_DIR/backend"
npm run dev 2>&1 | sed "s/^/$(printf "${BLUE}[Backend]${NC} ")/" &
PIDS+=($!)

# Start Frontend
echo -e "${GREEN}[Frontend]${NC} Starting..."
cd "$SCRIPT_DIR/frontend"
npm start 2>&1 | sed "s/^/$(printf "${GREEN}[Frontend]${NC} ")/" &
PIDS+=($!)

# Start ML Trainer
echo -e "${RED}[ML-Trainer]${NC} Starting..."
cd "$SCRIPT_DIR/ml-trainer"
npm run dev 2>&1 | sed "s/^/$(printf "${RED}[ML-Trainer]${NC} ")/" &
PIDS+=($!)

echo -e "\n${YELLOW}All services started. Logs will appear below:${NC}\n"

# Wait for all background processes
wait

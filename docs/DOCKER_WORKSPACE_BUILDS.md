# Docker builds for workspace projects

This document describes how Docker images for **backend**, **frontend**, and **ml-trainer** are built and why the build context is the repository root.

---

## Pattern: build from repository root

All workspace app images are built with:

- **Build context:** repository root (`.`)
- **Dockerfile:** `backend/Dockerfile`, `frontend/Dockerfile`, or `ml-trainer/Dockerfile`
- **Dependency install:** root `package.json` and `package-lock.json` only; `npm ci` at root
- **Build step:** `npm run build -w @dukarun/<workspace>` (or equivalent for that app)

Example (frontend):

```bash
docker build -f frontend/Dockerfile -t dukarun/frontend .
```

CI does the same: context `.`, file `frontend/Dockerfile` (see `.github/workflows/build-and-push.yml`).

---

## Why use the root context?

The repo is an **npm workspace** (root `package.json` has `"workspaces": ["backend", "frontend", "ml-trainer"]`). There is a **single** `package-lock.json` at the root that locks all workspace dependencies.

- **If we used each app’s directory as context** we would need a separate, fully resolved lockfile per app (e.g. `frontend/package-lock.json`). Those would drift from the root lockfile and from each other, and `npm ci` would often fail in CI with “package.json and package-lock.json are out of sync” or “Missing: … from lock file”.
- **Using the root as context** we always install from the same root `package-lock.json`, so installs are deterministic and stay in sync across local and CI.

So: **only the root `package-lock.json` is the source of truth.** Per-package lockfiles (e.g. under `frontend/`) are not used for Docker or CI and must not be relied on.

---

## What to do locally

- Run **`npm install` (or `npm i`) from the repository root** when you add or change dependencies in any workspace. That updates the root `package-lock.json` and keeps all workspace installs consistent.
- Do **not** rely on running `npm i` only inside `frontend/` (or `backend/` or `ml-trainer/`) to fix CI or Docker: from inside a workspace, npm still uses the root lockfile and may not change it in the way a root-only install would. For Docker/CI, the fix is to use root context and root lockfile (this pattern).

---

## ml-trainer: two-stage image

The ml-trainer image is built with a **two-stage** Dockerfile to keep the final image small:

- **Stage 1 (builder):** Uses `node:20-bookworm-slim` (no Chromium). Installs and builds only the ml-trainer workspace (`npm ci --include=dev --workspace=@dukarun/ml-trainer`, then `npm run build -w @dukarun/ml-trainer`). Produces `ml-trainer/dist`.
- **Stage 2 (runner):** Uses `node:20-bookworm-slim` plus Chromium and minimal Puppeteer runtime dependencies. Copies only root and workspace `package.json` files and `ml-trainer/dist` (no app source). Runs `npm ci --omit=dev --workspace=@dukarun/ml-trainer` so the final image has only production dependencies. The container runs `node ml-trainer/dist/server.js`.

The final image does not contain source code or devDependencies.

---

## Summary

| Aspect | Usage |
|--------|--------|
| **Build context** | Always repository root (`.`) |
| **Lockfile** | Root `package-lock.json` only |
| **Install in Dockerfile** | `COPY package.json package-lock.json ./` then `npm ci ...` |
| **Build in Dockerfile** | `npm run build -w @dukarun/backend` (or frontend / ml-trainer) |
| **Local dependency changes** | Run `npm install` at repo root so root lockfile is updated |

See also: root `.dockerignore` (reduces build context size) and `.github/workflows/build-and-push.yml` for the exact `context` and `file` used for each image.

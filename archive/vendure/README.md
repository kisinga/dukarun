# Vendure-era archive

This directory is a self-contained, cold archive of the application stack replaced by the
Angular + Supabase system in August 2026. It is deliberately independent of the active root
workspace.

## Contents

- `frontend/` — former `@dukarun/frontend` Angular/Apollo dashboard.
- `backend/`, `storefront/`, and `super-admin/` — Vendure services and companion apps.
- `ARCHITECTURE.md` and `DEPLOYMENT.md` — former root system documents.
- `docker-compose*.yml`, `dockerignore.*`, `.env.example` — former Vendure stack operations.
- `badges/` and `coverage-summary.mjs` — final legacy coverage presentation tooling.
- `FEATURE_CATALOG.md` and `GENERAL_TROUBLESHOOTING.md` — former product/operations references.

Generated `.angular`, `dist`, `coverage`, and `node_modules` directories were intentionally
removed during archival. They are reproducible and are not source artifacts.

## Status

The archive is excluded from the active root workspace and CI. Do not develop new product
features here. A narrowly scoped compatibility, migration, or incident-recovery change may be
made and tested in this directory without reconnecting Vendure to the current application.

## Working in the archive

From this directory, install the archived workspace independently:

```bash
cd archive/vendure
npm install
npm run build:backend
npm run test:backend
npm run build:frontend
```

Each application also retains its own `package.json`, so a focused install or test can be run
inside that application rather than restoring the entire stack. The archive-level scripts are
convenience entry points only; they are not exposed from the active root package.

For a full local Vendure dependency stack:

```bash
npm run services:up
npm run dev:backend
```

Prefer the last pre-archive image/commit when deterministic incident recovery is more important
than modifying source. Recreate generated dependencies and build output locally; do not commit
them into the archive.

Migration tooling in the active root may read this source/database during an explicit cutover;
that read-only migration dependency does not make Vendure part of the active product.

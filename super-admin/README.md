# Super Admin

Platform administration UI for Dukarun: channels, users, role templates, subscription tiers, platform data, login attempts, ML trainer.

## Setup

```bash
npm install   # from repo root (workspaces)
cd super-admin && npm start   # or from root: npm run dev:super-admin
```

Dev server: **http://localhost:4201** (main frontend is 4200).

## GraphQL Codegen

Codegen reads the backend schema from `admin-api` and generates types and document nodes into `src/app/core/graphql/generated/`. **Start the backend first** so the schema is available, then run:

```bash
# From repo root
npm run codegen:super-admin        # generate once
npm run codegen:super-admin:watch  # watch mode

# Or from super-admin/
npm run codegen
npm run codegen:watch
```

To generate both frontend and super-admin: `npm run codegen:all` (root).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for structure, auth, routing, and design notes.

## Deployment (Docker / production)

Same pattern as the main frontend: the app uses the relative URL `/admin-api`; **nginx in the container proxies** those requests to the backend (via `BACKEND_HOST` / `BACKEND_PORT`). No API URL is configured in the app — at admin.dukarun.com the browser hits admin.dukarun.com/admin-api and nginx forwards to the backend on the same network.

Docker Compose sets `BACKEND_HOST: backend` and `BACKEND_PORT: 3000` so the super-admin container resolves the backend by service name. On Coolify or another orchestrator, ensure the super-admin container can reach the backend (same network or correct BACKEND_HOST/BACKEND_PORT).

**`net::ERR_BLOCKED_BY_CLIENT`** is usually a browser extension (ad blocker). Try incognito or disable extensions if login fails despite correct setup.

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Dev server (port 4201) |
| `npm run build` | Production build |
| `npm run codegen` | Generate GraphQL types (backend must be running) |
| `npm run codegen:watch` | Codegen in watch mode |
| `npm test` | Unit tests (Karma) |

## Structure

- `src/app/core/` — Auth, Apollo, guards, GraphQL operations and generated types
- `src/app/layout/` — Shell (drawer, navbar, sidebar driven by nav config)
- `src/app/pages/` — Feature pages (dashboard, channels, users, etc.)
- `src/app/shared/` — Shared components (e.g. PageHeader)

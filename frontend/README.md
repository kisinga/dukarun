# Dukarun Frontend

Angular admin dashboard for Dukarun - Built for Kenyan SMEs.

## Setup

```bash
npm install
npm start  # http://localhost:4200
```

**⚠️ Note:** SigNoz observability tracing is **NOT available** in development mode (`ng serve`). The Angular dev server's `proxy.conf.json` is static and cannot proxy `/signoz/` requests. Use Docker Compose for testing observability features.

## Tech Stack

- Angular 20.3 (Standalone + Signals)
- Apollo Client (GraphQL)
- Tailwind CSS 4 + daisyUI 5
- Vendure Backend

## Authentication

**Endpoint:** `admin-api` (not shop-api)  
**Default credentials:** `superadmin` / `superadmin`

```typescript
// Services: inject() pattern + signals
authService.login({ username, password });
authService.user(); // Signal
authService.isAuthenticated(); // Computed signal
```

## GraphQL Codegen

Codegen reads the backend schema from `/admin-api` and generates types and document maps into `src/app/core/graphql/generated/`. **Start the backend first** so the schema is available, then run:

```bash
npm run codegen         # Generate types (backend must be running)
npm run codegen:watch   # Watch mode
```

If the backend is not running, codegen will fail. For CI or offline generation, you can point codegen at a schema file instead by changing `schema` in `codegen.ts` (e.g. to a dumped `schema.graphql`).

## Structure

```
src/app/
├── core/
│   ├── services/     # apollo, auth, cart
│   ├── guards/       # authGuard, noAuthGuard
│   ├── graphql/      # queries/mutations
│   └── models/       # types
├── pages/            # login, landing
└── dashboard/        # admin pages
```

## Scripts

```bash
npm start             # Dev server
npm run build         # Production build
npm test              # Run tests (requires Chrome)
npm run test:ci       # Run tests with coverage (CI mode)
npm run codegen       # Generate GraphQL types
```

## Testing

**Test Strategy:** We focus on **integration tests** for service behavior and critical workflows. UI/component tests are intentionally minimal at this stage as the UI may undergo significant changes.

**Test Types:**

- **Integration Tests:** Service integration, critical workflows, behavioral smoke tests
- **Component Tests:** Minimal - only essential component tests (e.g., app initialization)

**Test Commands:**

```bash
npm test              # Interactive mode (opens Chrome browser)
npm run test:headless # Headless mode (no browser window, for local CI-like testing)
npm run test:ci       # CI mode (headless + coverage, sets CI=true)
npm run test:coverage # Coverage report (interactive mode with coverage)
```

**How It Works:**

- **Local Development:** `npm test` uses regular Chrome (interactive mode)
- **Headless Mode:** `npm run test:headless` or `USE_HEADLESS=true npm test` runs without opening a browser
- **CI Environment:** Automatically detects CI environment variables and uses headless mode with `--no-sandbox` flags
- **Browser Override:** Set `KARMA_BROWSER=Chrome` to force a specific browser (only works locally, not in CI)

**Requirements:** Chrome must be installed to run tests.

- **Local development:** Install Chrome on your system
  - Install with: `sudo apt-get install google-chrome-stable` (Debian/Ubuntu) or download from [Google Chrome](https://www.google.com/chrome/)
  - Karma's chrome-launcher will automatically detect Chrome
- **CI:** Ensure Chrome/Chromium is installed in your CI environment. The karma config automatically uses headless mode with proper flags for CI environments.

## Environment

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: '/admin-api', // Relative URL - proxied to backend
};
```

## Remote Backend Development

**Problem:** Browsers don't send cookies between different domains (localhost → homelab).

**Solution:** Angular dev server proxy (`proxy.conf.json`) makes everything same-origin:

```
Browser → localhost:4200/admin-api → [Proxy] → homelab:3000/admin-api
```

Change target in `proxy.conf.json` to your backend URL. Cookies work because browser sees everything as localhost.

## Common Issues

**"Invalid credentials"**: Use `superadmin`/`superadmin` (admin-api, not shop-api)  
**CORS errors**: Check backend `vendure-config.ts` CORS settings  
**Codegen fails**: Ensure backend is running on port 3000

## More Info

- [Architecture](./ARCHITECTURE.md) - App structure
- [Dashboard UX](./DASHBOARD_UX.md) - Design principles
- [Migration Status](./MIGRATION_STATUS.md) - v1 → v2 progress

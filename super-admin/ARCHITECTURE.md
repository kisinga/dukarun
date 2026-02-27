# Super-Admin Architecture

Platform-level administration UI for Dukarun. Manages channels, users, role templates, subscription tiers, platform data (registration zone/tax), login attempts, and ML trainer. Design and patterns align with the main frontend dashboard where applicable.

## Structure

```
src/app/
├── core/           # Auth, Apollo, guards, GraphQL operations
├── layout/         # Shell: drawer, navbar, sidebar (nav as data)
├── pages/          # Feature routes: dashboard, channels, users, etc.
└── shared/         # Reusable UI: PageHeader, NavIcon
```

- **core**: `AuthService`, `ApolloService`, `authGuard`, and all GraphQL in `core/graphql/` (single `operations.graphql.ts` + codegen `generated/`).
- **layout**: One shell component with nav config (`nav.types.ts`, `navSections`). Sidebar is driven by data; same drawer/navbar/main pattern as the main frontend.
- **pages**: Lazy-loaded per route; each uses `app-page-header` for consistent titles.
- **shared**: Composition-friendly components (e.g. `PageHeaderComponent` with title, subtitle, optional refresh/actions slot).

## Auth

- **API**: Same backend `admin-api` (cookie-based session).
- **Guard**: `authGuard` protects the layout; unauthenticated users redirect to `/login`.
- **Login**: Native `authenticate` mutation; no OTP in this app.

## Routing

- **Public**: `/login`.
- **Protected**: `''` with `authGuard` and `LayoutComponent`, children: `dashboard`, `channels`, `channels/:id`, `users`, `platform-data`, `login-attempts`, `role-templates`, `pending-registrations`, `subscription-tiers`, `ml-trainer`. All children are lazy-loaded.

## GraphQL and codegen

- **Schema**: Backend `admin-api` (same as main frontend). Codegen config: `super-admin/codegen.ts`; schema URL `http://localhost:3000/admin-api` (backend must be running to generate).
- **Generated**: `src/app/core/graphql/generated/` (client preset: types + `graphql()` document nodes). Committed so the app builds without running codegen.
- **Operations**: Single file `operations.graphql.ts` imports `graphql` from `./generated` and defines all queries/mutations. Services and components import from `operations.graphql`.
- **When to run codegen**: After schema or operation changes: from repo root `npm run codegen:super-admin` or from `super-admin` `npm run codegen`. See README.

## Design

- **Stack**: Tailwind CSS 4 + daisyUI 5, same theme tokens as the main frontend (e.g. primary, base, semantic colors).
- **Layout**: Drawer with sticky navbar (`min-h-16`), sidebar with section labels, main area with `dashboard-main`-style padding and background.
- **Composition**: Nav items and sections are data (`NavItem`, `NavSection`); shared `PageHeader` and optional design rules (e.g. `.cursor/rules/design-language.mdc`) keep tables/KPI/collapsible patterns consistent with the main app where relevant.

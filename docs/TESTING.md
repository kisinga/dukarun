# Testing architecture

Tests are separated by what they execute. A test belongs to exactly one lane; production builds
do not double as tests.

| Lane        | Location and suffix                                 | Runner                     | Purpose                                            |
| ----------- | --------------------------------------------------- | -------------------------- | -------------------------------------------------- |
| Unit        | beside source, `*.unit.spec.ts`                     | Vitest in Node             | Pure functions and state logic; no DOM or TestBed  |
| Component   | beside source, `*.component.spec.ts`                | Angular TestBed + Vitest   | Rendering, projection, interaction, accessibility  |
| Contract    | `tests/contracts/*.contract.spec.mjs`               | Node test                  | Cross-package and generated-content contracts      |
| API         | `tests/api/*.api.spec.mjs`                          | Node test + local Supabase | PostgREST shape, relationship and status contracts |
| Database    | `supabase/tests/database/*.test.sql`                | pgTAP                      | SQL behaviour, RLS and RPC invariants              |
| Concurrency | `supabase/tests/concurrency/*.concurrency.spec.mjs` | Node + PostgreSQL          | Competing transaction behaviour                    |
| Browser     | `tests/e2e/*.e2e.spec.ts`                           | Playwright                 | Active-app journeys at desktop and mobile widths   |
| Artifact    | `tests/artifacts/*.artifact.spec.mjs`               | Node                       | Assertions against completed production builds     |
| Static      | `tools/**/**.check.mjs`                             | Node                       | Source policy and architecture boundaries only     |

`npm test` is the pull-request gate. `npm run test:full` additionally requires the local Supabase
stack and runs API, pgTAP, concurrency and critical browser checks. Browser screenshots and visual
snapshot assertions are disabled intentionally; assertions target behaviour and accessible UI.

After `npm install`, install the pinned browser once with `npx playwright install chromium`.
Run `npm run test:unit` or `npm run test:component` while developing, `npm test` before opening a
pull request, and `npm run test:full` before merging changes that affect persistence or financial
workflows.

The boundary check rejects tests under `scripts/`, DOM/TestBed use in unit specs, component specs
without TestBed, Angular unit targets, wrong lane suffixes, and snapshot assertions. New regression
tests should be placed in the narrowest lane capable of detecting the failure.

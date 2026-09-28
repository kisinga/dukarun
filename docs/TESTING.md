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

## Local operational-list fixtures

`supabase/seed-list-ux.sql` extends the base **Mama Mboga Stores** demo and is included in
`supabase db reset`. To hydrate an existing local database without resetting it:

```sh
docker exec -i supabase_db_Dukahub psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed-list-ux.sql
```

Sign in locally with **0700 000 001**, test code **123456**. Cashier, manager and delivery
personas use **0700 000 002 / 003 / 004** with the same code. Choose **Kiosk 1** for the fullest
stock-priority examples, and refresh open lists after hydration.

The fixtures cover 72 product families with manufacturers, cartons and all six stock decisions;
36 customers, 16 suppliers, 600 completed sales, 12 fulfillment sales, 12 parked sales and
16 proformas; 36 purchases and 8 drafts across three locations; 72 counts, 12 stock transfers,
18 expenses and 18 money transfers; pending/approved/denied requests, commission plans and
statements, and terminal messaging examples. They exercise 50-row Load more, expired records,
partial balances and three staff personas across ten selling days.

Hydration uses real domain posting commands in one transaction with deferred financial constraints.
It owns `UX-*` SKUs/references and `list-ux-v1-*` command references. Re-running skips existing
fixtures without replenishing stock, duplicating sales, changing display dates or replacing
user-entered data. Order/event display dates are relative to first hydration; accounting and tax
dates remain the actual posting date. These fixtures are not backdated accounting-close data.

The script enables demo cashier mode and local fulfillment settings, preserves existing open
sessions and periods, and leaves fixture sessions open. It cancels generated notifications in the
same transaction before workers can process them; it invokes no provider payment or delivery.

`supabase/tests/database/0132_list_ux_seed.test.sql` checks volume, manufacturers, stock decisions,
balanced entries, receivables and notification handling. The base-seed quantity assertions in
`0052_seed_demo.test.sql` require a fresh reset; do not overwrite stock changed by testers to make
those assertions pass. Apply `20260927000005_0197_product_decision_counts.sql` before deploying
the frontend that consumes its decision counts.

The fixture uses credit sales followed by receipts for partial balances. During local validation
on 28 September 2026, the mixed tender/credit path failed its deferred receivable check because
`MixedSaleTender` was absent from the settlement source list. Presentation/seed changes did not
alter financial functions to bypass that issue.

### Outstanding browser and accessibility checks

The September 2026 list changes have Chromium and WebKit coverage. Firefox could not launch on
the validation host because macOS denied its plugin-container sandbox extension; manual
screen-reader testing also remains outstanding. Automated semantics and keyboard checks do not
certify either of those checks.

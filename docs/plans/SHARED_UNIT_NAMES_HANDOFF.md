# Shared unit names: implementation plan

Status: agreed design; feature implementation has not started.
Revised: 2026-09-15. Seeded suggestions with company-specific additions.

## Decision and user outcome

Use **one company-owned unit-name table**. Seed each company with the same starter names.
Users authorized to edit the catalogue can type a valid new name and retain it when their
product or pack save succeeds. Seeded and custom names are ordinary rows with identical
ownership, matching, and read behavior.

1. A new or existing shop can select `Box` from its own list.
2. Someone types `Bundle` as a stock unit or pack name and saves.
3. That transaction also inserts `Bundle` into the company's name list if absent.
4. Other products, variants, and locations in the company can reuse it.
5. The name remains available after products are renamed, hidden, or deleted. Other companies
   receive it only if they independently save or seed that name.

Typing, cancelling, previewing an import, and failed saves create no names. No separate
creation dialog is needed.

## Product policy: suggestions with custom names

- Offer the company's existing names in the input so selecting a familiar name is easy.
  The starter list supplies those suggestions even before the company creates a product.
- Allow an authorized catalogue editor to type a name missing from that list, such as
  `Sachet`, `Bale`, `Bunch`, or a local label. Use the parent save's existing permissions;
  do not add a separate unit-creation permission or settings screen.
- Preserve current free-text compatibility in products, packs, and workbook imports. A valid
  name must not be rejected merely because it is absent from the suggestions.
- Keep names company-owned and reusable after their last catalogue use is removed.

A closed vocabulary improves spelling consistency but can force an inaccurate label or make
a shop wait for a platform update. These names appear in selling choices and customer-facing
documents. Stock correctness comes from validated pack contents and quantities, so restricting
the vocabulary would add little protection to inventory calculations.

The accepted tradeoff is that similar custom names can coexist. Existing suggestions, length
validation, trimming, and case-insensitive deduplication limit clutter. Do not add synonym
resolution or a name-management workflow to solve spelling differences in this release.

## Why this is the better fit

| Concern                | Decision                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Ownership              | Every name belongs to one company; use the existing company-access pattern.                  |
| Retention              | A saved name has its own lifetime and remains reusable when unused.                          |
| Lookup                 | Read a small indexed name table, independent of catalogue size or stock queries.             |
| Defaults               | Seed ordinary rows once; no global overlay, precedence rules, or default/custom distinction. |
| Automatic registration | Two narrow catalogue triggers cover all writers within their existing transactions.          |
| Compatibility          | Keep existing text fields and transaction snapshots; no unit-ID migration.                   |

The small cost of copying starter rows buys consistent behavior and a simpler data model.
Reusable vocabulary has a lifetime independent of catalogue edits. Keep the implementation
below focused on names.

## Data model and company isolation

Suggested table: `public.company_unit_names`.

| Column            | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `company_id`      | Required company foreign key; cascade on company deletion. |
| `name`            | Trimmed display name, 1–80 characters.                     |
| `normalized_name` | Generated `lower(btrim(name))` value.                      |

Use `(company_id, normalized_name)` as the primary key. Its index serves company lookups and
prevents duplicate names within a company. No separate UUID, default flag, alias table,
conversion factor, or per-location copy is needed.

- Enable row-level security. SELECT requires `company_id = current_company_id()` **and**
  existing catalogue-read access (`current_user_can_access_scope('data.catalog')`, with the
  applicable platform-admin access exception inside that company boundary).
- Grant authenticated callers SELECT only. Deny anonymous reads and direct client
  INSERT/UPDATE/DELETE. Private seed/registration functions perform writes.
- Server-side company access is authoritative. A client-supplied company filter cannot grant
  access to another company's rows. Registration takes the company from the saved catalogue
  row; seeding takes it from the newly created company.
- Use schema-qualified references and an empty search path in private `SECURITY DEFINER`
  trigger/helper functions; revoke public, anonymous, and authenticated execution access.

Trim outer whitespace and compare without case. `Box` and `box` share a row; conflict handling
keeps the existing display spelling. `Box` and `Boxes`, or `kg` and `Kilogram`, remain distinct.
Preserve internal whitespace. There is no plural guessing, fuzzy matching, or alias resolution.

Existing catalogue fields remain text:

- `product_variants.stock_unit` retains its 1–40-character limit.
- `variant_packs.name` retains its 1–80-character limit.

Selecting a name fills that field only. For example, `Box` can hold 12 bars on one product and
100 tablets on another. Contents, prices, barcodes, and stock remain on the existing definitions.
Do not rewrite product labels to match suggestion spelling. Existing restrictions on stock-unit
changes, immutable pack contents, fractional quantities, and transaction snapshots still apply.

## Seed existing and new companies

Put the starter vocabulary in one private seed helper, installed by a migration:

> Item, Piece, Egg, Tablet, Capsule, Pair, Bottle, Can, Tin, Jar, Bag, Sack, Packet, Pack,
> Box, Carton, Case, Crate, Tray, Roll, Strip, Kilogram, Gram, Litre, Millilitre, Metre.

1. Attach a small `AFTER INSERT` trigger to `companies` that calls the helper for the new row.
   Seed rows commit or roll back with company creation. Existing provisioning functions need
   no duplicated seed logic or changes to roles, subscriptions, or onboarding flows.
2. In the same migration, seed existing companies and then backfill distinct names from their
   variants and packs, including inactive variants and retired packs.
3. Use `ON CONFLICT (company_id, normalized_name) DO NOTHING` for seeds and backfill. Process
   existing custom spellings in a deterministic order. This preserves seeded spelling on an
   initial match and makes repeated inserts safe without rewriting any catalogue records.

Future additions to the starter vocabulary require updating the helper and an explicit additive
migration for existing companies. Preserve existing rows and their spelling. Do not introduce
background reseeding or default synchronization machinery.

## Register names at the database boundary

Add two small `AFTER INSERT` / name-change triggers:

- On `product_variants`, capture `stock_unit`.
- On `variant_packs`, capture `name`.

Use the saved row's company and trimmed name, with the same conflict-safe insert as seeding.
A shared private trigger function can handle these two known fields. Skip updates where the
name is unchanged; price, stock, and retirement-only changes should not register names again.

This covers product creation, new variants, pack edits, workbook application, and legacy
writers through the tables they already write. An error anywhere in the parent transaction
rolls back the new name too. Retries or concurrent saves of the same name retain one row.
Renaming a catalogue label adds its new name while retaining the old reusable name.

Retain existing parent-save permissions, validation, and idempotency. Preserve the company
`catalog-units` lock order established by migration 0171: catalogue locks precede name inserts.
The registration trigger only inserts into the name table; it must not lock catalogue rows,
call back into catalogue writers, or acquire a new advisory lock. Use existing pack concurrency
coverage to verify this integration.

For the current product/pack aggregate, the existing write permission is
`ManageStockAdjustments`; workbook and related catalogue operations retain their additional
checks. Reading suggestions does not grant permission to create names. A failed permission
check must leave both the catalogue and the name table unchanged.

## Read and editor behavior

Read the company's name table directly through a thin `PosService` method, ordered by name.
Use ordinary pagination to retrieve the full list. Generated database types provide the contract;
an effective-list RPC, catalogue scans, and a name-resolution API are unnecessary.

- Load once on editor opening, including create mode. Keep names in `ProductEditorStore` and
  pass them to the variant/pack components. Refresh after successful saves if the editor stays
  open. Other users' additions appear on the next lookup.
- Reuse the manufacturer's native `<input list="…">` / `<datalist>` pattern. Give each editor
  instance unique list IDs. Offer names up to 40 characters for stock units and 80 for packs.
  Preserve field validation and unrestricted entry of a valid new name.
- Use `Choose a name or type your own.` Keep explicit labels, keyboard and touch selection,
  and prevent suggestion selection with Enter from submitting the product form. Check the
  supported mobile browser and assistive technology; fix demonstrated issues locally.
- Loading suggestions must not block editing. On failure, retain typed values and display
  `Suggestions unavailable. You can still type a name.` The existing save remains authoritative.
- Clear suggestions on user/company changes or editor teardown. Check both the captured
  identity and request generation before accepting a response, including when switching away
  and back. Reuse the existing editor request guard.

Use editor memory only. Offline reopening may have no suggestions; manual entry follows the
existing product-save policy. No new shared cache, IndexedDB store, live subscription, or
catalogue write queue is needed for this feature.

## Workbook boundary

The [fresh workbook implementation plan](PRODUCT_WORKBOOK_IMPLEMENTATION_PLAN.md), agreed as
the delivery direction on 2026-09-16, is implemented with the `dukarun-products-1` contract.
It replaces formats 5/6/7 without compatibility readers. Recheck the implementation
before wiring tests, and add the unit-name migration after the latest migration present then.

Its text-name writes must hit the same catalogue triggers, so names register only on successful
application. Preview, cancellation, or rollback creates nothing. The new workbook uses Sold as
choices and a Pack sizes reference sheet; preserve that input contract. The company name table
can later supply suggestions through its adapter. Neither feature depends on shipping the other.

Preserve the workbook's atomic product/variant/pack/opening-stock creation, safe retries, row
identity and relationship checks, and existing stock-unit edit restrictions. Pack stock cells
remain grey `XXXX`; entered stock there is an error. Keep manufacturer validation, formulas,
batch links, and disable handling independent of unit-name suggestions.

## Scope limits

Deliver name suggestions and automatic company-owned persistence. Leave unit management,
global renaming, aliases, automatic measurement conversions, reusable pack-size templates,
shared prices/barcodes, and new offline infrastructure outside this change. Defaults and custom
names use the same list and alphabetical ordering; no source flag or ranking system is needed.

## Delivery and checks

1. **Database:** add the table, access policy, seed helper/company trigger, two registration
   triggers, and existing-data backfill in a migration after the latest existing migration.
   Regenerate database types. Leave unrelated working-tree changes intact.
2. **Editor:** wire the direct name read and existing select-or-type input pattern; update user
   guidance for selecting and saving a new name.
3. **Focused validation:** use the existing database, component, and concurrency lanes to cover:
   - Defaults for existing/new companies and rollback of company creation.
   - Cross-company read/write denial and catalogue-read permissions, including direct API reads.
   - An authorized save with an unseeded name succeeds; an unauthorized save creates no name.
   - Backfill of existing/retired names without changing catalogue or historical labels.
   - Case/outer-whitespace deduplication and retention after the final catalogue use is removed.
     Distinct valid labels such as `Box` and `Boxes` remain accepted without automatic merging.
   - Successful editor, legacy, and workbook saves; no new names after failed saves or previews.
   - Concurrent registration of the same name and unchanged catalogue/sale lock behavior.
   - Free entry, selection, field lengths, Enter, lookup failure, and stale responses after a
     company switch; check mobile usability and accessibility.
4. **Repository gates:** follow `docs/TESTING.md`, including existing pack concurrency tests
   and the persistence-change gates. Keep tests targeted while developing.

Completion means every company owns its seeded and successfully added names, names remain
reusable independently of catalogue edits, and stock/pricing/transaction behavior is unchanged.

## Code map

- `supabase/migrations/20260806000018_0034_product_manufacturers.sql`: company-name table precedent;
  do not copy its permissive standalone upsert endpoint.
- `supabase/migrations/20260824000003_0147_fulfillment_domain.sql`: company provisioning context.
- `supabase/migrations/20260826000000_0150_workspace_access_boundaries.sql`: catalogue-read access.
- `supabase/migrations/20260914000000_0163_product_packs.sql`: name fields, triggers, and saves.
- `supabase/migrations/20260915000000_0171_sale_catalog_lock_order.sql`: required lock order.
- `supabase/migrations/20260916000000_0173_product_workbook.sql`: current workbook snapshot and writes.
- `apps/web/src/app/pos/pos.service.ts`: catalogue API wrapper.
- `apps/web/src/app/products/product-editor.store.ts` and
  `apps/web/src/app/products/product-editor.component.ts`: editor lifecycle and datalist precedent.
- `apps/web/src/app/products/product-editor-variants.component.ts` and
  `apps/web/src/app/products/product-packs-editor.component.ts`: name inputs.
- `apps/web/src/app/products/product-transfer.service.ts` and
  `apps/web/src/app/products/product-workbook.ts` and `product-workbook-read.ts`: workbook integration boundary.
- `packages/shared-types/database.types.ts`: generated table contract.
- `docs/DESIGN_SYSTEM.md`, `docs/TRANSACTION_WORKFLOWS.md`, and `docs/TESTING.md`.

## Next implementation task

> Implement this plan using one company-owned unit-name table, starter seeding for existing/new
> companies, and transactional name registration through catalogue row triggers. Offer existing
> names as suggestions and allow valid custom names through authorized catalogue saves. Reuse
> existing editor inputs, preserve text-name APIs and stock/transaction invariants, and keep
> workbook redesign independent. Check repository instructions and the working tree, preserve
> unrelated work, and add migrations after the latest existing migration. Deliver the checks above.

# Product workbook: fresh implementation plan

Date: 2026-09-16. Status: implemented and verified locally. Microsoft Excel manual acceptance remains before release.

## Outcome and starting point

Ship one workbook for exporting, editing and bulk creation. A shop can change existing
products, prices and counts, or add a manufacturer, product, size/type and pack in the same
upload. Keep the existing product → variant → pack database model; translate the friendly
worksheet into that model in the application.

The application implementation is in
[the workbook contract](../../apps/web/src/app/products/product-workbook.ts),
[exporter](../../apps/web/src/app/products/product-workbook-export.ts),
[reader](../../apps/web/src/app/products/product-workbook-read.ts), and
[transaction migration](../../supabase/migrations/20260916000000_0173_product_workbook.sql).
The [user guide](../learning-platform/gitbook-import/products/editing-product-workbooks.md)
explains the final workflow. The workbook prototype folder and superseded application readers
have been removed.

**Fresh start means one new workbook contract, exporter and reader.** Remove the old format
5/6/7 readers, old templates and conversion paths from the live workbook flow. Older files
receive an explicit “Download a fresh Products workbook” error. Existing catalogue records,
stock and transaction history remain the source data; no database reset or catalogue rebuild
is required.

The loose-sugar correction is in the seed and running local demo: **Sugar / Loose / Per kg**,
retail **180 KES/kg**, buying **120 KES/kg**. Its database regression test passes.

## 1. Lock the workbook contract

Exactly three visible sheets:

| Sheet             | User action                                                                                | Authority                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Products**      | Edit product details, all prices and stock; add products, sizes/types and selling options. | The only price and stock entry surface.                     |
| **Manufacturers** | Add or rename a manufacturer; change its availability.                                     | Shared manufacturer records, selected on Products.          |
| **Pack sizes**    | Define a pack name and number of base units; rename a definition.                          | Reusable choices for Products, with no prices or inventory. |

Products retains the twelve primary columns, in this order:

> Product · Manufacturer · Size / type · Sold as · Retail now · New retail ·
> Wholesale now · New wholesale · Buying now · New buying · Stock now · Counted stock

- Keep current and proposed values side by side. Current values show the export snapshot;
  a blank change preserves the value. A counted quantity of **0** explicitly means zero.
- Keep Product through Sold as frozen, with filters and the entry instructions visible.
- Keep SKU, variant/pack barcode, product barcode, item type, tracking, fractions, tax category,
  product/selling-option availability, latest-batch details and exact stock values in expandable
  columns on **Products**. Export every applicable existing value. These are the actual fields
  mapped from the catalogue and inventory database.
- Manufacturer uses its reference list; Size / type is optional free text. Tax category selects
  from the company's configured taxes; tax setup remains in the application.
- Grey **XXXX** marks inapplicable cells. Packs have their own retail price and barcode, but
  share their parent's stock. Pack wholesale, buying and stock cells cannot accept edits.
- Numeric stock cells display their measure: `48 bars`, `36.5 kg`. Buying and wholesale prices
  show their denominator. Preserve exact stock value separately from rounded buying price.
- No visible row-type, parent-ID or stock-unit column. Store identities and the export baseline
  in hidden metadata, included in the table's sort range. Hidden data is not an access boundary.
- Include company, stock location, export time and currency in the heading. One workbook edits
  one location's inventory; catalogue and price edits retain their existing company-wide scope.

### Selling labels and creation sequence

| Product | Size / type | Sold as        | Stored meaning                               |
| ------- | ----------- | -------------- | -------------------------------------------- |
| Soap    | 250g        | Single bar     | Variant named `250g`, stock unit `bar`.      |
| Soap    | 250g        | Box of 12 bars | Pack on that variant, factor 12; same stock. |
| Sugar   | Loose       | Per kg         | Variant named `Loose`, stock unit `kg`.      |
| Rice    | _(blank)_   | Per kg         | Default variant, stock unit `kg`.            |

1. Fill the **Single / Per** row first: product, manufacturer, optional size/type, selling
   measure, and retail price. Add opening stock and buying cost when applicable.
2. Define a pack on **Pack sizes**, if needed.
3. Add its row on **Products**, repeat Product + Manufacturer + Size / type, select Sold as
   and enter its pack price. Adding a definition only makes a choice available; selecting
   it on Products assigns a pack to that particular variant.

Recommend displaying the Single / Per row followed by its packs. The dropdown searches the
whole table, and import resolves all rows together: **physical row order never identifies a
parent**. Blank identifying cells never mean “same as above”. Sorting complete table rows
must preserve relationships, including when a parent ends up below its packs.

Use a small explicit label map for common choices in the sample, plus every stock-unit name
already present in the shop. Preserve unfamiliar existing units verbatim with clear labels;
do not infer measurement from words such as `250g` in a name. New measured choices set sensible
fraction/tracking defaults, with advanced flags validated against the existing domain rules.
New custom unit vocabulary outside the offered choices remains a product-editor operation
followed by a fresh export. This release does not require a company unit-name registry.

## 2. Build a direct exporter and reader

Use one small workbook specification for sheet names, columns, field types and format marker,
with separate exporter and reader modules. Keep `product-transfer.service.ts` as orchestration
for export, preview and apply. Replace the superseded inline and separate-pack workbook paths;
reuse sound validation rules, not their file formats. Do not generate an intermediate creation
workbook and import it again. Do not build a general spreadsheet framework.

### Export

- Read catalogue, manufacturers, tax choices, variant packs and a consistent location inventory
  snapshot. Carry stable record IDs and expected versions for the records that can be edited.
- Deduplicate pack choices by name and factor for this workbook. They remain templates for
  existing per-variant `variant_packs`; no new shared pack-size database table is needed.
- Populate current values and blank change inputs. An empty shop downloads the same format
  with prepared blank rows and the same creation workflow.
- Derive manufacturer and pack labels from stable reference IDs so reference-name changes
  update linked exported cells. Keep reference IDs inside their tables for safe sorting.
- Use bounded formulas and validations. Add number-format and grey-cell rules by range where
  possible. Avoid per-row copies of the full choice list or formatting rules that multiply
  workbook size by the number of units.
- Use one export/import limit measured in **total selling-option rows**, including packs.
  Start with the existing 10,000-row / 10 MB guardrails and verify them with realistic packs
  and reference lists. Never export a file the importer refuses because of its own limits.
  Prepared capacity must be explicit; extending rows must retain formulas and validation in
  supported spreadsheet applications. Unlimited expansion is not a release claim.

### Read and normalize

Resolve in this order: **references → products → variants → packs → field/price/count changes**.
Build lookup maps over the complete workbook before resolving new child rows.

| Situation                             | Rule                                                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing record                       | Match the exported ID, verify company and parent relationships, then compare deliberate edits with its baseline. Names do not create replacement identities.                                           |
| New product or child                  | Use normalized Product + resolved Manufacturer, then Size / type to find a unique parent in the workbook. A new row matching an existing identity cannot silently create a duplicate.                  |
| Duplicate display names               | Existing IDs remain valid. Reject ambiguous new-child matching with a row-specific explanation; never choose the first name match.                                                                     |
| Repeated product fields               | Apply a changed value once. Unchanged copies do not undo it. Reject different deliberate edits to the same field. Use the effective parent identity when matching new children.                        |
| Manufacturer rename                   | Update the shared record once and show its wider product impact. Blank manufacturer is allowed; invalid selections need correction.                                                                    |
| Pack-definition rename                | Update the linked pack records present in this workbook, with the affected variants shown in preview. It is not a global database pack rename.                                                         |
| Existing pack count or parent changes | Reject conversion/reparenting. Add a new pack instead; use explicit availability to retire an old selling option.                                                                                      |
| Missing row                           | No action. Disabling requires the explicit Active field; deleting a worksheet row never disables or deletes saved records.                                                                             |
| New row                               | Require a valid Single / Per selection or an unambiguous pack parent. New variants need a retail price; stock-bearing opening counts need a buying cost, which may be explicitly zero.                 |
| Empty change / explicit clear         | Blank proposed prices/counts preserve values. `CLEAR` removes wholesale or makes a pack purchase-only. Nullable metadata follows its column's documented clearing rule; no implicit destructive clear. |

Validate duplicate IDs, row roles, required fields, text limits, barcodes, active flags, tax
references, whole-KES prices, nonnegative counts, allowed fractional precision and service/
tracking restrictions. Variant retail may be zero; pack retail must be positive or null.
New pack retail left blank means purchase-only. Existing unit changes remain in the product
editor; the workbook does not convert existing stock or resize packs.

Resolve exported reference formulas through their stable IDs and the edited reference tables;
do not rely on stale formula caches. Accept literal inputs and only the known formulas emitted
by this format where applicable. Reject unknown formulas with a cell-specific explanation;
no arbitrary formula evaluation service is needed. If a manual dropdown selection became stale
after a reference rename and cannot be resolved uniquely, ask for reselection in that cell.
Excel does not automatically rewrite previously selected literal text.

Editing a “now” value must produce an explanation directing the user to its adjacent change
column. Pasting can bypass Excel validation, so repeat all rules in the reader and enforce
domain constraints again on the server. Tampered IDs, hidden flags or versions cannot authorize
cross-company writes or grant access to financial data.

## 3. Apply one reviewed change set atomically

Produce one typed change set containing reference edits, product/variant/pack edits and
creations, prices, counts and latest-batch changes. Carry source sheet/row/column information
for useful errors. Resolve temporary creation keys to saved IDs inside the transaction.

Implement one apply entry point in a forward migration after the latest migration present
at implementation time. Reuse the established catalogue and inventory writers, journal
semantics and lock order behind that entry point; replace workbook-specific orchestration
where its current contract cannot express this change set.

- Check `ManageCatalog` and the existing stock/pack permissions. Financial data and cost/value
  edits require the existing financial permissions. Export must omit restricted financial
  values from hidden sheets as well as visible cells; grey their unavailable inputs.
- Re-read and lock affected records, including manufacturers, products, variants, packs and
  location stock/batches. Check the expected state again at apply time. An intervening sale
  must not let an old counted quantity silently overwrite newer inventory.
- Create manufacturers and parent products before variants and packs, then apply inventory
  through the established stock-adjustment and valuation workflow. Apply everything in one
  transaction; a later failure leaves no partial catalogue or stock changes.
- Counted stock means the final location quantity. Latest-batch buying-price and exact-value
  corrections follow existing accounting rules. Reject conflicting cost and exact-value edits;
  do not replace exact remaining value with quantity × rounded cost.
- Add retry protection for **every apply**, including update-only uploads. Use the existing
  import tracking where practical: one request ID plus a normalized-payload fingerprint and
  stored result. Retrying the same request returns the prior result; altered requests cannot
  reuse it. Do not duplicate products, packs or inventory adjustments after a network timeout.
- Keep audit/results metadata free of costs where existing import-history permissions would
  expose them. Preview and cancellation create no catalogue, reference or inventory records.

## 4. Keep the application flow short

Replace existing product workbook entry points in Products and Settings with this format:

**Download workbook → edit → upload → review changes → apply.**

Use the same upload path for new products and edits. The preview shows current → proposed
values and groups new products, sizes/types and packs under their parents. Highlight shared
manufacturer renames, affected pack assignments, stock adjustments and valuation effects.
Do not ask users to choose an import mode, reconcile IDs or understand database row types.

Errors name the sheet, Excel row and column, explain the issue and give the fix. Missing or
ambiguous pack parents are errors, not guessed links. A no-change upload clearly says there
is nothing to apply. After success, report changes and offer a fresh export with saved values.

## 5. Delivery sequence and release gates

| Step                         | Main implementation surfaces                                                            | Complete when                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Contract and export       | New workbook specification/export module; `product-transfer.service.ts`.                | Real demo and empty-shop exports match the agreed three-sheet layout, include all mapped fields, and carry valid identities and snapshots.              |
| 2. Reader and preview        | New reader/change-set types; `product-import-dialog.component.ts`; transfer unit tests. | Mixed creation and editing resolve without row-position assumptions; unchanged exports produce zero changes and invalid rows produce actionable errors. |
| 3. Transactional application | Forward SQL migration; generated database types; database tests.                        | References, catalogue, packs and inventory apply together with permission, stale-state, rollback and retry coverage.                                    |
| 4. UI cutover and removal    | Products/Settings actions, old workbook modules, help text and import guide.            | Only the new format is exported/accepted; old format branches, intermediate-workbook conversion and deletion-means-disable behavior are removed.        |
| 5. End-to-end acceptance     | `product-price-workbook.e2e.spec.ts`, fixtures and native spreadsheet checks.           | Export → edit → preview → apply → re-export agrees with the saved catalogue, stock and exact values.                                                    |

The minimum acceptance cases are:

- Unchanged real export; empty-shop creation; mixed edits plus a new manufacturer, product,
  variant and pack in one apply. A new pack definition becomes selectable before upload.
- Soap 250g/500g retain separate stock; their boxes share the correct variant's stock. Sugar
  is `Loose / Per kg`; rice accepts fractional counts. Delivery cannot receive stock.
- Reordered tables, parent below pack, unrelated intervening rows, reference sorting/renames,
  duplicate product display names, conflicting repeated edits and missing/ambiguous parents.
- Blank versus zero, `CLEAR`, purchase-only packs, unsupported formulas, stale caches, invalid
  pasted values, altered IDs, inapplicable edits and fixed existing pack contents.
- The egg fixture preserves **97 eggs / buying 14 KES / exact value 1,400 KES** through an
  unchanged round trip. Latest-batch correction and counted-stock changes produce the expected
  journal and valuation results, including when the location has multiple open batches.
- Permission-restricted exports, cross-company attempts, intervening sales/edits, rollback
  after a late failure, and same-request retries for both creations and update-only changes.
- Native Excel and LibreOffice: open/save/reopen, recalculation, dropdowns, new reference/row
  entry, filter/sort, grouped columns and unit number formats. Exercise representative large
  catalogues against the same limits used for import. Formula-engine tests alone do not prove
  those interactions work.

Update `docs/TRANSACTION_WORKFLOWS.md` and the product workbook help page to describe the final
contract. Remove only workbook-specific APIs with no remaining callers; retain shared domain
writers. Deploy the new database entry point before switching the application. This is a
coordinated replacement, with no old-file converter or dual-format reader.

## Complexity deliberately excluded

- Separate pricing, quantity, pack-pricing or batch-entry sheets; alternate creation templates.
- Workbook versions 5/6/7, header aliases, legacy fallbacks or an intermediate import workbook.
- A new shared pack-size schema, automatic stock-unit conversion, resizing used packs, fuzzy
  parent matching, macros or script installation on the user's computer.
- Company onboarding and the separate
  [shared unit-name feature](SHARED_UNIT_NAMES_HANDOFF.md). Existing catalogue units are enough
  to deliver this workbook; that feature can later supply suggestions through the same adapter.
- Multiple stock locations in one workbook, editing arbitrary historic batches, image uploads
  and creating tax configuration. Latest-batch details remain expandable on Products; other
  batch workflows stay in their dedicated application screens.

These boundaries keep full product/variant/pack creation and everyday price/count editing in
scope while avoiding a catalogue or inventory redesign.

## Delivery record

Implemented the three-sheet exporter, reader, field-level preview, transactional apply RPC,
and Products/Settings cutover. Downloads prepare 10,000 total selling rows and 50 additional
manufacturer/pack-definition slots. Dropdown parent lookup runs when the dropdown is used;
range validations avoid thousands of repeated rules. Historical migrations and catalogue/
inventory functions remain; the application accepts only the new workbook contract.

Local validation on 2026-09-16:

- 27 product unit tests passed, including unchanged XLSX round trips, empty-shop creation,
  mixed edits/creation, parent order, duplicate names, fixed pack contents, permissions,
  protected values, exact inventory values and stale snapshots.
- 40 new workbook database assertions passed; the seed regression and test setup bring the
  selected database run to 57 assertions. These cover existing-product child creation,
  mixed manufacturer/product/pack creation, opening stock, exact-value correction, stock
  increases/decreases, permissions, stale state, rollback and retry safety.
- Four browser tests passed across desktop and mobile. Static checks and the web production
  build passed; the build retains existing CSS-budget and ExcelJS CommonJS warnings.
- The existing catalogue, pack and inventory database suites also passed (133 assertions
  including setup). Public-schema database lint found no errors. Full-schema lint additionally
  reports existing pgTAP helper issues in `extensions`, outside the application schema.
- An actual seeded-shop export was edited, previewed and applied through the new database
  RPC, then exported again with zero differences. The verification transaction was rolled
  back; it did not leave sample products or stock changes in the shop.
- The final 10,000-row prepared workbook is about 2.1 MB. LibreOffice opened and recalculated
  it in about 1.2 seconds. A newly added pack definition and product/pack rows at the end of
  its capacity recalculated correctly, saved and imported without formula errors.
- Sorting complete Products rows and both reference tables in LibreOffice preserved saved
  identities and relationships, with no unintended changes on re-import.
- A realistic 9,000-selling-row catalogue exported at about 5.7 MB and produced no changes
  on re-import. Export took about eight seconds and parsing took about 0.3 seconds locally.

Migration `0173` is applied to the local development database. Deployment is not performed.
Microsoft Excel was unavailable in this environment; interactive dropdown, sorting and
open/save acceptance in Excel is still a release check.

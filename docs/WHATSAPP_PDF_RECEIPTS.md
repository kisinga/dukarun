# WhatsApp PDF receipts

Completed sales and cashier settlements open the shared receipt sheet. Sales opens the same sheet without celebration. Print is always available and uses the device's selected paper size. WhatsApp attachments always use A4, independently of print preferences.

Receipt capture creates an Unverified customer with permanent `receipt` origin. Completing their profile verifies that same account. Verified means staff-completed details, not phone ownership or credit approval. Active non-supplier phone numbers are unique per business after Kenyan normalization. Saved-number correction requires customer-management permission, checks the customer's revision and cancels unsent documents to the old number.

## Delivery contract

`request_sale_document` resolves the sale, recipient and caption and atomically saves contact capture, the sale association, secure-link snapshot and outbox request. The request key makes an uncertain HTTP retry safe. Settlement or communications permission is required; print context also accepts sales read access.

`202` means queued durably. The Edge wake-up processes it immediately; the existing scheduled `notification-flush` recovers missed wake-ups. Workers claim one PDF per invocation. Preparing leases expire after two minutes; a sending lease that expires becomes **unknown**, without automatic resend. Definite transient failures allow at most two attempts. Explicit resends require a deliberate confirmation and a new request key. Business messaging controls and quota accounting remain effective; explicit receipt sends bypass quiet hours and standing customer notification preferences for that document.

PDFs and secure-link HTML use the same issued snapshot, saved design, historical VAT values, timezone and versioned branding reference. Renderer version 1 is recorded; retain support for outstanding versions when changing renderers. Default designs are frozen too. Later payments or settings changes do not rewrite issued snapshots. A credit sale with a balance produces an invoice; a fully settled completed sale produces a receipt.

When the public storefront is available, the WhatsApp caption and issued PDF/webpage include its canonical URL under **Shop online**. The link is frozen with the issued snapshot; disabled, missing, or unavailable storefronts add no shop link. The company’s separately configured website remains intact.

The server artifact bundles pdf-lib, embedded Noto fonts and bounded logo decoders. None are exported by the frontend document entry point. Delivery dynamically imports the artifact only after claiming a job and validating its message identity; empty recovery ticks do not initialize fonts or WASM. Logo helpers and their size constant are obtained through the same deferred import. PDFs are generated in memory and sent to OpenWA's `messages/send-document` endpoint with a filename and personalized caption containing the secure link. Dukarun persists snapshots and delivery metadata, never PDF bytes. Success logs contain IDs, byte counts, total elapsed time, and separate renderer initialization, logo preparation, rendering and provider timings. Logo files remain versioned so issued documents can be regenerated.

Sale receipts and invoices share the checkout boundary of **128 distinct line items per sale**, regardless of item quantity. The POS defines `MAX_SALE_LINES` in [cart.service.ts](../apps/web/src/app/pos/cart.service.ts); database `save_draft` and `complete_order_core` also enforce 128 lines, covered by [the database limit test](../supabase/tests/database/0072_cache_journal_and_limits.test.sql). Use this same boundary for sale-document validation and performance tests. The generic PDF renderer currently has a separate 1,000-row emergency guard; that is not a supported sale size or a guarantee that a document fits the runtime CPU budget. Aligning sale-document preflight with the checkout limit remains implementation work; never silently truncate a financial document.

Additional renderer and delivery limits: 250,000 content characters, 40 pages, 5 MB PDF, 2 MiB logos, 2 million decoded pixels, 8-second logo fetch and 45-second provider timeout. SVG logos support local filters and embedded PNG/JPEG images, including previously saved logos. Upload and Edge rendering share the same SVG policy: no external resources or nested SVG images, at most 16 image elements and 128 filter primitives, and at most 2 million embedded pixels in total. Animated WebP is rejected. Description length and branding affect CPU cost even within the 128-line sale boundary.

OpenWA/WhatsApp are separate retention boundaries. Secure links expire after 30 days and can be revoked; that cannot recall a PDF already accepted by the gateway or downloaded by a recipient. Confirm and record the deployed gateway's media-storage/cleanup policy before release; Dukarun has no PDF archive or attachment deletion API.

## Rollout

1. Audit duplicate phones before migration 0202. Resolve each conflict with the business; do not merge financial histories automatically. The migration fails before enforcing uniqueness if any remain.

   ```sql
   select company_id, phone_normalized, array_agg(id order by created_at) customer_ids
   from public.customers
   where deleted_at is null and not is_supplier and phone_normalized is not null
   group by company_id, phone_normalized having count(*) > 1;
   ```

2. Run `npm ci`, the receipt database/concurrency tests, and `node scripts/build-document-edge.mjs`. The generated `_shared/generated/documents.mjs` includes shared code, fonts and WASM; it is intentionally ignored by Git and rebuilt before deployment. Deploy migrations and functions with `scripts/deploy-db.sh --functions` before deploying the web application. The script builds the artifact before touching the database, then syncs it alongside `sale-document-send` and `notification-flush`.

   Function deployment also validates the host's existing `main/index.ts` before migrations and wraps its worker-creation options with `withSaleDocumentCpuBudget`, preserving authentication and routing. Only `sale-document-send` and `notification-flush` receive 4-second soft / 8-second hard CPU limits; other functions retain their existing options. Recovery renders inside `notification-flush`, so that function's text processing shares its CPU budget. Memory and wall-clock settings remain those of the host. The script backs up a changed router beside the original and restarts the Edge container, with a 65-second stop grace, only when the router or CPU policy changes. `EDGE_RUNTIME_CONTAINER` can override the default `supabase-edge-functions-<service directory name>`. Unsupported router shapes or concurrent router edits abort configuration instead of replacing host-specific authentication code.

3. Confirm `STOREFRONT_PUBLIC_URL` in Vault, `SUPABASE_*` and `OPENWA_*` runtime configuration, the existing notification cron, and the business's messaging/quota settings. Test with an explicitly approved recipient: paid receipt, partial invoice, attachment filename/caption, A4 size, secure-link agreement and revocation. Close the app immediately after acceptance to verify background completion. Do not treat a `202` as provider acceptance.
4. Measure time and peak memory in the deployed Edge configuration with representative logos and item counts. Local Edge runtime v1.74.3 rendered 150 ordinary rows in approximately 621 ms and produced a 40,392-byte PDF; the isolated container used approximately 116 MiB afterward. These are local observations, not a production capacity guarantee. Browser build checks confirm no PDF/font libraries enter web JavaScript.
5. Record the gateway media retention policy and the live attachment test result before enabling the web modal in production. Unknown outcomes require checking with the recipient before deliberate resend.

Monitor queue age and failure codes without exposing contact details or document contents:

```sql
select document_delivery_state, count(*) requests,
       max(now() - created_at) filter (where status = 'pending') oldest_pending,
       count(*) filter (where error = 'pdf_preparation_failed') render_failures
from public.outbox
where document_delivery_state is not null and created_at > now() - interval '7 days'
group by document_delivery_state;
```

Validation entry points: `0136_sale_document_delivery.test.sql`, `sale-document.concurrency.spec.mjs`, shared document unit tests, document artifact/provider contracts, `sale-document-delivery.contract.spec.mjs`, `sale-document-runtime.contract.spec.mjs`, receipt component tests, and `tests/e2e/sale-document.e2e.spec.ts` on both mocked desktop and mobile projects.

## Production-runtime performance verification (2026-10-01)

SSH benchmarks used the unchanged deployed artifact, SHA-256 `c38bfe44889ec17290e5a7dc796408cdac7c1aad452522b6404791fd580c85fe`, with `supabase/edge-runtime:v1.71.2`. Disposable containers had no network or credentials, a 640 MiB memory cap, one CPU except the explicit two-CPU concurrency test, and the deployed 150 MB worker / 60-second wall-clock settings. These synthetic measurements exclude database calls, logo downloads and provider delivery. Container memory includes runtime/native allocations and is not per-document heap usage.

| Test                                                                         | Observation                                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Empty cold worker, eager renderer import; three runs                         | 0.69–0.75 CPU-seconds, 123–127 MiB peak container memory                                                  |
| Empty cold worker, deferred renderer import; three runs                      | 0.32–0.35 CPU-seconds, 74–75 MiB peak; bundling still has a cost                                          |
| Serial one-line receipts, same synthetic SVG logo                            | Mean 1.58 CPU-seconds over 30 receipts; 402 MiB peak, falling to 277 MiB after 35 seconds idle            |
| Same logo cached within each worker                                          | Mean 0.94 CPU-seconds over 20 receipts; frequent worker retirement limits reuse                           |
| Same logo supplied as a prepared PNG                                         | Mean 0.72 CPU-seconds over 20 receipts; approximately 205 MiB peak                                        |
| 128 short-description lines, classic/compact/modern                          | All passed; rendering 1.19–1.22 seconds without a logo and 1.49–1.60 seconds with the SVG logo            |
| 128 longer descriptions, deployed CPU defaults                               | All three layouts were cancelled at the worker CPU hard limit; no container OOM                           |
| Same long-description cases, PDF worker CPU soft/hard budgets of 4/8 seconds | All six layout/logo combinations passed; rendering 2.57–2.91 seconds, peak container memory below 166 MiB |
| Two simultaneous 128-line receipts, two CPUs                                 | All eight requests passed across plain/SVG batches; peak container memory approximately 416 MiB           |

The benchmark CPU-budget override was tested only in disposable workers, without changing production. The policy is now included in function deployment as described above. The [versioned runtime example](https://github.com/supabase/edge-runtime/blob/v1.71.2/examples/main/index.ts) exposes `cpuTimeSoftLimitMs` and `cpuTimeHardLimitMs` on worker creation. These short runs do not establish a global concurrency ceiling or prove the absence of a memory leak. At inspection, the eight saved production snapshots contained at most nine lines.

Implementation sequence:

1. Reuse the 128-line sale policy in a dependency-free shared constant for POS and sale-document preflight; keep a contract test against the database bound. Cover 128-line short/long descriptions and all layouts, plus rejection at 129 lines. Retain independent character, page and byte guards for the generic renderer and other document types.
2. The first increment configures the tested 4/8-second CPU policy on the two existing PDF-capable functions. A dedicated PDF worker and global concurrency control remain future work; preserve the existing database claims/leases and unknown-provider-outcome rules. Investigate repeated text-width measurement and wrapping to reduce CPU cost; the benchmark identified sensitivity to descriptions, not a function-level profile.
3. Deferred renderer initialization and separate initialization/logo/render/provider success timings are implemented. Helpers and `MAX_LOGO_BYTES` no longer introduce an eager runtime import. Queue-age, failure-stage and database-finalization measurements remain follow-up work.
4. Generate a bounded PNG derivative once per immutable SVG/logo version and reuse it for PDF rendering, retaining the original logo and snapshot branding identity. Use a bounded per-worker cache only as an additional optimization. Validate existing SVG effects and transparency before changing the logo path.
5. After CPU/memory behavior is verified, improve recovery draining with a bounded time/job budget. Keep normal immediate wake-up and durable claiming; the existing minute-based recovery currently claims one PDF per invocation.

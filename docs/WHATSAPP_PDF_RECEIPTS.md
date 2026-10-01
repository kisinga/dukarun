# WhatsApp PDF receipts

Completed sales and cashier settlements open the shared receipt sheet. Sales opens the same sheet without celebration. Print is always available and uses the device's selected paper size. WhatsApp attachments always use A4, independently of print preferences.

Receipt capture creates an Unverified customer with permanent `receipt` origin. Completing their profile verifies that same account. Verified means staff-completed details, not phone ownership or credit approval. Active non-supplier phone numbers are unique per business after Kenyan normalization. Saved-number correction requires customer-management permission, checks the customer's revision and cancels unsent documents to the old number.

## Delivery contract

`request_sale_document` resolves the sale, recipient and caption and atomically saves contact capture, the sale association, secure-link snapshot and outbox request. The request key makes an uncertain HTTP retry safe. Settlement or communications permission is required; print context also accepts sales read access.

`202` means queued durably. The Edge wake-up processes it immediately; the existing scheduled `notification-flush` recovers missed wake-ups. Workers claim one PDF per invocation. Preparing leases expire after two minutes; a sending lease that expires becomes **unknown**, without automatic resend. Definite transient failures allow at most two attempts. Explicit resends require a deliberate confirmation and a new request key. Business messaging controls and quota accounting remain effective; explicit receipt sends bypass quiet hours and standing customer notification preferences for that document.

PDFs and secure-link HTML use the same issued snapshot, saved design, historical VAT values, timezone and versioned branding reference. Renderer version 1 is recorded; retain support for outstanding versions when changing renderers. Default designs are frozen too. Later payments or settings changes do not rewrite issued snapshots. A credit sale with a balance produces an invoice; a fully settled completed sale produces a receipt.

When the public storefront is available, the WhatsApp caption and issued PDF/webpage include its canonical URL under **Shop online**. The link is frozen with the issued snapshot; disabled, missing, or unavailable storefronts add no shop link. The company’s separately configured website remains intact.

The server artifact bundles pdf-lib, embedded Noto fonts and bounded logo decoders. None are exported by the frontend document entry point. PDFs are generated in memory and sent to OpenWA's `messages/send-document` endpoint with a filename and personalized caption containing the secure link. Dukarun persists snapshots and delivery metadata, never PDF bytes. Logs contain IDs, elapsed time and byte counts only. Logo files remain versioned so issued documents can be regenerated.

Limits: 1,000 item rows, 250,000 content characters, 40 pages, 5 MB PDF, 2 MiB logos, 2 million decoded pixels, 8-second logo fetch and 45-second provider timeout. SVG logos support local filters and embedded PNG/JPEG images, including previously saved logos. Upload and Edge rendering share the same SVG policy: no external resources or nested SVG images, at most 16 image elements and 128 filter primitives, and at most 2 million embedded pixels in total. Animated WebP is rejected. Large documents can fail preparation rather than consume unbounded resources.

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

Validation entry points: `0136_sale_document_delivery.test.sql`, `sale-document.concurrency.spec.mjs`, shared document unit tests, document artifact/provider contracts, receipt component tests, and `tests/e2e/sale-document.e2e.spec.ts` on both mocked desktop and mobile projects.

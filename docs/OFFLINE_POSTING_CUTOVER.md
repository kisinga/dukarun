# Offline posting cutover

Deploy migration `0203_offline_sale_custody` before the matching web client. This is a hard cutover: old offline replay endpoints reject requests with `offline_client_update_required`. Existing legacy review records are retired with an audit reason.

The client upgrades IndexedDB to version 7 and clears **all previous queued sales and cached cashier confirmations**, across accounts on that browser. Carts and catalogue caches remain. Close older app tabs when installing the update so they release the database. New version 7 queues survive later reloads and upgrades.

Retained catalogue caches fetch missing capture evidence on load or reconnect, even when no products have changed in the catalogue journal. This prepares new sales; it does not migrate or recover discarded queues.

After updating, connect and confirm an open cashier session before offline checkout. The server issues a confirmation lasting at most 24 hours. Expiry pauses new offline checkout without clearing carts. Renewing confirmation does not change a queued sale’s capture time or originating session.

New-format sales remain visible until posted or explicitly resolved. Sales aged 24 hours or more, expired confirmations, changed catalogue items, and closed originating sessions enter review. Confirm crossover into a specific open session; price overrides, credit approvals, stock validation, and late-cash reconciliation keep their separate requirements. Paid sales require an audited payment resolution before cancellation.

After approval, **Check approval and post** resumes the existing server-held attempt from any authorized device, without needing the original local queue or creating another revision. Live session visibility remains available to expense and supplier-payment users; only users with `SettleOrder` receive offline-sale confirmations.

Posting uses the server’s current VAT configuration and preserves collected gross amounts. Review confirmation is invalidated when its payload, destination session, or relevant catalogue/tax state changes. Retries preserve the original request; corrections create an immutable server revision. The original and all revisions share one logical sale lock and can produce only one completed sale.

`ServerClockService` is the client clock authority for confirmation expiry, capture timestamps, VAT activation, and review ages. Existing authenticated responses calibrate it; there is no separate clock request. Concurrent VAT settings reads share one request. A detected device clock jump requires a fresh server response before offline capture.

For release verification, run the database suite, `offline-posting.concurrency.spec.mjs`, the offline/clock component and unit tests, and `offline-cutover.e2e.spec.ts`. These cover lost responses, duplicate confirmations, VAT/closure races, approvals, immutable requests, and the browser queue upgrade.

Do not roll an updated device back to a client that cannot understand version 7. Backend rollback must preserve the new custody and audit tables. The hard cutover cannot restore removed legacy local queues.

# Direct M-PESA integration

## What it does

- Sends STK prompts to a customer phone.
- Receives all C2B notifications for an authorized Till or Paybill.
- Sends money straight to the merchant. Dukarun never holds or forwards funds.
- Keeps unknown direct payments in reconciliation until a permitted user allocates them.

Paystack subscription billing is separate.

## Money model

```text
Payment request -> STK attempts -> provider events
                                      |
                                      v
                              payment collection
                                      |
                                      v
                           accounting allocation
```

A request is not proof of payment. `payment_collections` is the money record. A collection is
posted only through `payment_collection_allocations`. One provider receipt creates one collection.

## Safaricom access

Required Daraja products:

- Lipa Na M-PESA: STK Push and STK query.
- M-PESA C2B: URL registration, validation and confirmation.

This access cannot withdraw funds, view balances or statements, open the M-PESA portal, send
B2C/B2B payments, or reverse a transaction.

## Source of truth

- Tenant-facing Safaricom documents are generated in
  `apps/web/src/app/settings/mpesa-settings.component.ts`.
- Platform authorization/contact settings are configured in
  `apps/super-admin/src/app/pages/mpesa/mpesa.component.ts`.
- Do not duplicate the letter body in docs; update the generator and keep this file to the flow and
  safety boundary.

## Setup

1. Merchant opens **Settings → M-PESA**, requests setup and names the locations that use the Till or Paybill.
2. If the merchant does not know the required account facts, the same screen can email, download or
   print a Safaricom details request before setup is submitted.
3. Platform Admin prepares the tenant-specific Dukarun Daraja app and stores the consumer key and
   consumer secret in Vault.
4. Merchant receives the in-app Safaricom authorization pack, then emails, downloads or prints the
   request naming that Daraja app.
5. Merchant completes any Safaricom ownership verification directly with Safaricom.
6. Platform Admin records Safaricom authorization, then stores the approved shortcode fields and
   passkey in Vault.
7. OAuth is checked and C2B URLs are registered.
8. Run a real KES 1 STK payment.
9. Run a real KES 1 direct Till or Paybill payment.
10. Platform Admin activates the connection.

Never ask for the merchant's OTP, M-PESA PIN or portal password.
Before C2B URL registration, confirm whether another system already receives callbacks for the
merchant's Till or Paybill.

## Runtime rules

- A successful STK callback is checked through STK Query before posting.
- Temporary or unclear provider results remain pending. They are not blindly retried.
- Full STK payments post automatically.
- Split payment is M-PESA plus the exact stored cash balance only.
- A second real payment becomes an unallocated surplus. It is not posted twice.
- Unknown C2B payments never post automatically.
- Manual fallback is timed and requires a valid M-PESA receipt code.
- Paid-but-unposted work goes to manual review and cannot be charged again.

Callbacks are stored before Safaricom receives `Accepted`. `mpesa-process` leases work to prevent
two workers from posting it. Retry starts at 15 seconds, is capped at one minute, and moves
unresolved work to review after 15 minutes.

## Permissions

| Permission               | Access                                              |
| ------------------------ | --------------------------------------------------- |
| `SettleOrder`            | Start STK and confirm exact cash                    |
| `ManageReconciliation`   | View, allocate and classify collections             |
| `ManageMpesaIntegration` | Request setup and view safe setup status            |
| `ReverseOrder`           | Execute an approved accounting reversal             |
| Platform Admin           | Credentials, C2B registration, tests and activation |
| Service role             | Raw callbacks, Vault reads and provider processing  |

General company members cannot read provider tables.

## Deployment

Vault secrets:

```text
MPESA_PROCESS_URL=https://<project>.supabase.co/functions/v1/mpesa-process
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Deploy with `npm run deploy:functions`. The database runs a one-minute processor sweep and a daily
retention job. Raw callback bodies are removed after 90 days; hashes, normalized facts,
allocations and audit records remain.

`mpesa-callback` has gateway JWT checks disabled because Safaricom sends no Supabase JWT. Its URL
token is random and stored only as a SHA-256 digest. `mpesa-process` accepts only the normal
service-role bearer token.

## Reversals

Safaricom reversal is manual in V1. Record the Safaricom reversal receipt, date and reason in
Dukarun. Existing approval rules reverse accounting. An accounting-only reversal releases the
collection back to reconciliation; confirmed provider reversal marks the collection reversed.

## Main files

- Database: `supabase/migrations/20260818000021_0119_mpesa_collections.sql`
- Provider adapter: `supabase/functions/mpesa-*`
- Checkout coordinator: `apps/web/src/app/core/mpesa-checkout-coordinator.service.ts`
- Merchant setup: `apps/web/src/app/settings/mpesa-settings.component.ts`
- Platform setup: `apps/super-admin/src/app/pages/mpesa/mpesa.component.ts`
- Reconciliation: `apps/web/src/app/money/reconciliation/mpesa-inbound.component.ts`
- Tests: `supabase/tests/database/0102_mpesa_payments.test.sql`

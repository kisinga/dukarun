# M-PESA compliance checklist

Complete this before broad production rollout. It is an operational checklist, not legal advice.

## Safaricom

- Obtain written confirmation that Dukarun may integrate merchant-owned Tills/Paybills.
- Keep the merchant's setup request and Safaricom ownership result.
- Confirm production access covers STK query and C2B for the merchant's Till or Paybill.
- Keep credentials in Vault; never collect OTPs, PINs or portal passwords.
- Document the manual reversal process and responsible contacts.

## Central Bank of Kenya

Dukarun does not hold funds: M-PESA settles directly to the merchant. This lowers custody risk but
does not by itself settle the licensing question. The National Payment System Act defines payment
services broadly and section 12 bars unlicensed PSP business. Before broad rollout, send CBK the
exact money, instruction and data flow and obtain a written perimeter response. Do not call Dukarun
a licensed PSP unless it is licensed.

Reference: [National Payment System Act](https://new.kenyalaw.org/akn/ke/act/2011/39/eng@2025-11-04)
and [CBK PSP authorization checklist](https://www.centralbank.go.ke/wp-content/uploads/2020/06/Payment-Service-Providers-Authorization-checklist.pdf).

## Data protection

- Record merchant instructions and the controller/processor split in the DPA.
- List Safaricom in the correct privacy role after legal review.
- Complete a DPIA for phone numbers, transaction history and automated matching.
- Confirm Dukarun and the merchant's ODPC registration duties.
- Use phone and transaction data only for payment, reconciliation, fraud and support.
- Purge raw callback bodies after 90 days. Keep hashes, normalized transaction facts, allocations
  and audit records under the approved retention schedule.
- Restrict raw webhook bodies to the service role.
- Include M-PESA data in access, deletion and breach-response procedures.
- Notify the controller promptly; Kenyan processor notice is generally required within 48 hours,
  while controller notification to ODPC may be required within 72 hours.

References: [Data Protection Act](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2022-12-31),
[DPIA regulations](https://new.kenyalaw.org/akn/ke/act/ln/2021/263/eng@2022-01-14), and
[registration regulations](https://new.kenyalaw.org/akn/ke/act/ln/2021/265/eng@2022-12-31).

## Release evidence

- Safaricom authorization and merchant ownership evidence.
- CBK perimeter response.
- DPIA and updated processing register.
- Updated Privacy Notice, DPA and subprocessor/recipient register.
- Successful KES 1 STK test and C2B direct-payment test.
- Callback retry, duplicate, mismatch and incident tests.
- Named support owner for paid-but-unposted and reversal cases.

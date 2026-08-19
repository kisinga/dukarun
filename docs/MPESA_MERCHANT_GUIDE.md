# M-PESA setup: merchant guide

## Message to send the merchant

> Dukarun can send M-PESA STK prompts and receive payment notifications for your Till/Paybill.
> Payments continue going directly into your M-PESA business account. Dukarun cannot withdraw or
> transfer your money. We will arrange a short Safaricom ownership check with you. Enter any OTP
> only on Safaricom's page. Never send us your OTP, PIN or portal password.

## What we need

- Registered business name.
- Till or Paybill number.
- Business Admin or Business Manager username.
- Contact name, phone and email.
- A nominated owner available for Safaricom's ownership check.

## What happens next

1. An authorized user opens **Settings → M-PESA** and sends the setup request.
2. Dukarun prepares the Daraja app.
3. The owner approves Safaricom's check.
4. Dukarun runs a KES 1 STK test with the merchant.
5. The merchant makes a KES 1 direct Till/Paybill payment.
6. Dukarun checks both callbacks and enables the connection.

## Customer checkout wording

- **Before prompt:** “Enter the M-PESA phone that should receive the prompt.”
- **Waiting:** “STK prompt sent. Enter your M-PESA PIN on your phone.”
- **Success:** “Payment received.”
- **Cancelled:** “Payment was cancelled. No sale was posted.”
- **Unknown:** “Payment is still being checked. Do not pay again.”
- **Paid, not posted:** “Payment was received but needs review. Do not pay again.”

During a temporary manual fallback, ask for the M-PESA receipt code. Do not accept “paid” without
the code. Unknown direct Till payments stay in reconciliation until the merchant allocates them.

Do not display or log the customer's PIN. Dukarun never receives it.

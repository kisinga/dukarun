# Qualified enquiries and independent onboarding

The first release targets established shops with one location, a small team, straightforward sales and a concrete stock, cash/M-Pesa, credit or oversight problem. The owner can decide, accepts the current subscription and is prepared to operate independently after setup. Larger or unusual operations can enquire; qualification is a human decision.

## Qualify the received enquiry

An enquiry exists when a message reaches WhatsApp or email. A form completion, prepared message or CTA click is not a received enquiry. Create a row in `docs/templates/first-10-leads.csv` only for the actual contact, and retain the message's source, campaign and blog reference in the tracker. Use `enquiry_source` for its page and put `blog_ref` in `notes` if supplied. Do not copy private lead records into the public repository.

Confirm five points in the conversation:

1. What concrete problem should the first demonstration solve?
2. Who decides and who will use the system each day?
3. Can their workflow be handled by the current product, without a promised feature?
4. Have they seen the current subscription and understood that implementation is separate?
5. Are they ready to begin, prepare records and practise independently?

Record `qualification_reason` in plain language, with `qualified_at` only when confirmed. Example: “Electricals shop owner decides; one location, two counter staff; stock differences; accepts current subscription; clean spreadsheet; ready this month.” Do not invent a numerical score. Where fit is unresolved, write the missing point and next action. If the workflow needs development or daily assistance, explain the limit and record the reason; avoid promising delivery dates for unsupported features.

Use the stages `received`, `qualification_pending`, `qualified`, `demo_scheduled`, `demo_completed`, `quote_sent`, `paid`, `onboarding`, `active` or `lost`. Preserve the existing tracker fields. `demo_date` is the appointment; `demo_completed_at` confirms the demonstration happened. Track subscription versus implementation payment details in notes alongside `amount_paid`.

## A ten-minute workflow demonstration

| Minutes | Demonstrate                                            | Ask the owner to confirm                       |
| ------- | ------------------------------------------------------ | ---------------------------------------------- |
| 0–1     | Restate the shop's problem and who operates            | Is this the problem worth solving first?       |
| 1–4     | Record a simple sale and its relevant payment          | Can the operator repeat this workflow?         |
| 4–6     | Follow the stock movement or customer credit/repayment | Does this record answer the shop's question?   |
| 6–8     | Review the closing declaration and a difference        | Who will close and who will review exceptions? |
| 8–10    | Show current pricing, agree self-start or scoped help  | What is the next step and intended start date? |

The website uses **Mwangaza Electricals**, a fictional established shop: Njeri owns it, Wanjiru is one of two counter staff, and regular electricians buy goods for their jobs. Use this starting scenario when it matches the prospect, then focus on their actual records:

- Sell four 9 W LED bulbs at KES 250 each and two 13 A double sockets at KES 450 each: KES 1,900. Explain the item size and selling unit. Starting quantities of 31 bulbs and 18 sockets become 27 and 16 after this sale.
- The five-item catalogue also has a 20 A circuit breaker, a fixed 10 m cable coil and tape sold by the roll. It represents a small verified starting set, not a new shop with an empty catalogue or a full migration.
- Review electrician customer Amina Hassan's KES 1,500 debt from an earlier purchase, outstanding for ten days. It is separate from the paid KES 1,900 sample sale. Show a repayment only where the workflow is supported and configured.
- Review a separate illustrative day's closing: opening cash KES 2,000 + cash sales KES 8,400 + older debt repaid in cash KES 600 - cash payouts KES 500 - cash removed KES 4,000 = KES 6,500 expected. KES 6,400 counted leaves KES 100 to investigate. M-Pesa sales KES 6,300 + older debt repaid by M-Pesa KES 400 = KES 6,700 receipts, matching the example's confirmed receipts.

Use fictional demonstration data and label it. Demonstrate configured M-Pesa capabilities rather than implying every merchant has an active STK integration. Show the role relevant to the operator. Explain pending offline sales and synchronisation if this matters to the business. The three website screenshots are examples of actual screens, not customer outcomes. Existing testimonials have not been newly verified.

## Scope implementation separately

For self-start, point to registration, documentation and the setup guide. Simple shops can begin with a 30-minute orientation and five products; this does not include a full migration. Assisted implementation is quoted before work starts, with typical engagements exceeding KES 40,000 under existing guidance.

State the products, locations, source files, opening balances, data cleaning responsibility, training attendees/sessions, merchant configuration, travel/equipment, payment arrangements and support boundaries. The owner confirms opening stock and balances. Identify exclusions and the process for additional work. Do not bundle unlimited preparation, feature development or training into the subscription.

## Complete onboarding through demonstrated independence

The operator must record a sale and close independently, using their own role. The owner must find the relevant stock, credit or money record and approve starting records. Staff should know how to correct or report a mistake and where to find a guide. Log any unfinished item, owner and due date. An account creation or attended training call alone does not complete onboarding.

Record first sale, support minutes, day-7/day-14 activity and renewal using the existing tracker. Follow up on the agreed schedule, with the owner's permission and channel preference.

## Manual sharing copy

Share only through channels where the sender is permitted to post or contact the recipient. These are prepared copy, not an automated distribution instruction.

**An existing WhatsApp business conversation**

“You mentioned that bulb and socket quantities and the day's money are hard to check at your electricals shop. This checklist may help: https://dukarun.com/blog/choosing-pos-software-kenya?utm_source=whatsapp&utm_medium=conversation&utm_campaign=shop-demo. If you want to see the sale and closing workflow, request a focused demo. Subscription and any setup help are priced separately.”

**A permitted owner group**

“Cash sales, M-Pesa and old customer debt repayments should be checked separately at closing. Here is a worked example and a free cash-up tool: https://dukarun.com/blog/how-to-reconcile-cash-mpesa-shop?utm_source=whatsapp&utm_medium=owner-group&utm_campaign=cash-up. If your shop wants connected records, the guide also links to a Dukarun demo enquiry.”

**A partner or bookkeeper referral**

“Dukarun may suit an established electricals, hardware or similar shop with one location and a small counter team that needs connected sales, stock, credit and closing records, with an owner ready to use the system independently after setup. Ask them to describe their current workflow here: https://dukarun.com/contact?intent=demo&from=/contact&utm_source=partner&utm_medium=referral&utm_campaign=shop-demo. Implementation is separately scoped.”

**Email to an existing, permitted contact**

Subject: A practical way to check your shop's closing records

“Here is the cash and M-Pesa checklist we discussed: https://dukarun.com/blog/how-to-reconcile-cash-mpesa-shop?utm_source=email&utm_medium=conversation&utm_campaign=cash-up. We can show a ten-minute sale-to-closing workflow if it matches your shop's problem. Use the demo enquiry in the guide and tell us whether you want to self-start or need separately quoted data preparation or staff training.”

## Weekly review

Review received enquiries, qualified enquiries, completed demos, payment conversion, support minutes and continued use by source. Use matching lead cohorts for qualified/received, completed/qualified and paid/completed ratios; include counts when volumes are small. Count setup and subscription revenue separately. Review lost reasons and the questions that repeatedly require explanation. A higher click count without qualified contacts is not the target result.

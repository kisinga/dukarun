# Currency Convention

## Principle

All monetary amounts in storage, API, and business logic use the **smallest currency unit (cents)**. For KES, this means 1 KES = 100 cents.

## Rule

- **Storage**: Database stores amounts in cents
- **Calculations**: All backend calculations operate on cents
- **API**: GraphQL requests and responses use cents
- **UI layer**: The only place that converts
  - **Display**: `CurrencyService.format(cents)` — expects cents, divides by 100 for display
  - **Input**: When the user enters an amount in whole units (e.g. 500 for 500 KES), convert with `Math.round(userInput * 100)` before sending to the API

## Vendure Alignment

Vendure built-in types (orders, payments, product prices) already use cents. Our custom credit fields, ledger, and financial services follow the same convention.

## Examples

| Context        | Value (500 KES) | Storage/API |
|----------------|-----------------|-------------|
| Credit limit   | 500 KES         | 50000       |
| Order total    | 500 KES         | 50000       |
| Ledger balance | 500 KES         | 50000       |

## Related

- [LEDGER_ARCHITECTURE.md](LEDGER_ARCHITECTURE.md) — FinancialService returns cents
- `CurrencyService` — expects cents, handles display conversion

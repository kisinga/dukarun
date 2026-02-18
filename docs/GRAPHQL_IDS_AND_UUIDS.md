# GraphQL ID! vs String! for custom entity UUIDs

## Why this matters

Vendure uses a **default EntityIdStrategy** (e.g. `AutoIncrementIdStrategy`) that treats all GraphQL `ID` values as **integers**. The framework encodes/decodes IDs when they cross the API boundary:

- **Output**: database integer → encoded string (e.g. `"42"`) via `encodeId()`
- **Input**: string from client → decoded via `decodeId()`. Non-integer strings (e.g. UUIDs) do not parse as integers and can become **`-1`** or similar sentinel values.

So if a **custom entity** uses **UUID** primary keys (e.g. `StockPurchase`, `CashierSession`, `Reconciliation`), and you use `ID!` for that entity’s id in the schema:

1. The client correctly sends a UUID string (e.g. `"fe7f4be3-5394-4b38-8805-a545281f3c77"`).
2. Vendure’s ID scalar runs it through the **integer** strategy’s `decodeId()`.
3. The result is not a valid integer (e.g. `-1`), and that value is passed to resolvers and into the database.
4. PostgreSQL then throws: **`invalid input syntax for type uuid: "-1"`**.

## Rule

**Use `String!` (not `ID!`) for any GraphQL argument or field that holds the id of a custom entity whose primary key is a UUID.**

- **Vendure core entities** (Customer, Channel, Order, etc.) use integer IDs → keep using `ID!` for those.
- **Custom entities with UUID ids** (e.g. StockPurchase, CashierSession, Reconciliation, CashDrawerCount, etc.) → use **`String!`** for their ids in:
  - Mutation/query arguments (e.g. `purchaseId: String!`, `sessionId: String!`)
  - Input types (e.g. `input PaySinglePurchaseInput { purchaseId: String! }`)
  - Output types if the field is a UUID (e.g. `sessionId: String!` on `CashierSessionSummary`)

## Where this was applied

- **Credit plugin** (`credit.plugin.ts`): `PaySinglePurchaseInput.purchaseId` → `String!`
- **Ledger / Period management** (`period-management.schema.ts`): all `sessionId` and UUID-bearing ids (e.g. `reconciliationId`, `countId` where the entity uses UUID) → `String!`

## References

- Vendure [EntityIdStrategy](https://docs.vendure.io/reference/typescript-api/configuration/entity-id-strategy) (default: integer encode/decode).
- Custom entities in this codebase using `@PrimaryGeneratedColumn('uuid')`: e.g. `StockPurchase`, `PurchasePayment`, `CashierSession`, `Reconciliation`, `CashDrawerCount`, `JournalEntry`, `Account`, etc.

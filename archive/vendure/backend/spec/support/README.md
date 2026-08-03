# Spec Support: Database Mocking

This directory houses our reusable database mocking utilities for Jest.

## `mock-db.ts`

`MockDb` provides a lightweight, composable wrapper around Vendure's `TransactionalConnection`. It exposes:

- `connection`: drop-in replacement with `rawConnection.query`.
- `useMlExtractionQueue(...)`: seeds the `ml_extraction_queue` table with in-memory rows.
- `enableTable(...)`, `dropTable(...)`, `getTableRows(...)`: generic helpers for other tables.
- `onQuery(...)`: register custom matchers/handlers when a scenario requires bespoke SQL behavior.
- Automatic handling for:
  - `information_schema` lookups (`SELECT EXISTS`, `table_name IN (...)`).
  - Core `ml_extraction_queue` statements (insert, select, update, delete).

### Usage

```ts
import { MockDb } from '../support/mock-db';

const db = new MockDb();

// Simulate migrations not having created ml_extraction_queue yet
await expect(service.scheduleExtraction(RequestContext.empty(), 'channel', 5)).rejects.toThrow(
  'not ready'
);

// Once migrations run
db.useMlExtractionQueue();
const extractionId = await service.scheduleExtraction(RequestContext.empty(), 'channel', 5);
expect(db.getTableRows('ml_extraction_queue')).toHaveLength(1);
```

### When to use

- Service or subscriber tests that rely on raw SQL (e.g., ML extraction queue, cleanup routines).
- Fast integration-style specs where spinning Postgres/Docker would be overkill.
- Migration helpers that only need to assert "what SQL was executed" or "does this table exist".

### Tips

- Prefer `MockDb` over ad-hoc jest mocks to keep behavior centralized.
- Seed deterministic data by passing explicit timestamps/IDs to `useMlExtractionQueue`.
- Combine with `onQuery` to override or extend the default behavior for specific statements.

# Migration Guidelines

## Core Principles

### 1. Idempotency

All migrations MUST be safely re-runnable. Use:

- `IF NOT EXISTS` for columns, tables, indexes
- `IF EXISTS` for drops
- Table existence checks before modifying Vendure tables

### 2. Fresh Setup Compatibility

Every migration MUST work on an empty database. Wrap all `ALTER TABLE` statements on Vendure tables with table existence checks:

```typescript
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'channel'
    ) THEN
        ALTER TABLE "channel"
        ADD COLUMN IF NOT EXISTS "customFieldsXyz" ...;
    END IF;
END $$;
```

### 3. Naming Convention

- Format: `{timestamp}-{DescriptiveName}.ts`
- Timestamps: Use phase-based ranges (1000000000-1999999999 for core, etc.)
- Class names: `{DescriptiveName}{Timestamp}`

### 4. Timestamp Fields

- **KEEP**: Standard timestamps (`createdAt`, `updatedAt`) on custom tables
- **KEEP**: Functional audit fields (`customFieldsAuditcreatedat`) if used in code

### 6. Constraints & Indexes

- Check constraint existence before adding: `SELECT 1 FROM pg_constraint WHERE conname = '...'`
- Use `CREATE INDEX IF NOT EXISTS` for indexes
- Drop legacy indexes/constraints before creating new ones

### 7. Data Migration

- Avoid data backfills that depend on existing data
- Use `ON CONFLICT DO NOTHING` for seed data
- Never reference columns that might not exist

### 8. Down Migration

- Always implement `down()` method
- Reverse operations in opposite order
- Use same existence checks as `up()`

## Checklist

- [ ] Table existence checks for Vendure tables
- [ ] Idempotent operations (IF NOT EXISTS, IF EXISTS)
- [ ] No dependencies on existing data
- [ ] Proper down() implementation
- [ ] No temporary/intermediate fields in final state
- [ ] Constraint/index existence checks

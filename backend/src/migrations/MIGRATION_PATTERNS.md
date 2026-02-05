# Migration Patterns for Existing Tables

## Problem

When adding columns to existing tables that have data, we need to:

1. Add columns as NULLABLE first
2. Backfill data from other sources
3. Make columns NOT NULL
4. Add constraints/indexes

However, TypeORM generates constraint names using a hash algorithm, which can conflict with manually-created constraints.

## Pattern: Idempotent Migration with Pre-Migration Script

### Step 1: Create SQL Backfill Script

Create a SQL script (`backend/scripts/backfill-*.sql`) that:

1. Adds columns as NULLABLE
2. Backfills data
3. Makes columns NOT NULL
4. Adds constraints/indexes with generic names

**Key Pattern**: Check for ANY constraint/index on the column, not specific names:

```sql
-- Check for ANY FK constraint on column (not specific name)
IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'table_name'
      AND a.attname = 'column_name'
      AND c.contype = 'f'
) THEN
    -- Create constraint
END IF;
```

### Step 2: Create TypeORM Migration

The migration should:

1. Check if column exists - if yes, skip everything (idempotent)
2. If column doesn't exist, add it as NOT NULL (assumes fresh system)
3. **DO NOT create FK constraints or indexes** - let TypeORM handle these via entity decorators
4. This avoids conflicts with TypeORM's hash-based constraint naming

**Key Pattern**: Migration only adds columns, TypeORM handles FKs/indexes:

```typescript
// Check if column exists - if yes, migration already applied or script ran
IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'table_name' AND column_name = 'column_name'
) THEN
    -- Add column as NOT NULL (fresh system)
    ALTER TABLE "table_name" ADD COLUMN "column_name" integer NOT NULL;

    -- Note: FK constraints are created by TypeORM via @ManyToOne decorators
    -- Indexes are created by TypeORM via @Index decorators
    -- No manual FK/index creation here to avoid conflicts with TypeORM's naming
END IF;
```

**Important**: Add `@Index` decorators to entities so TypeORM knows to create indexes:

```typescript
@Entity('table_name')
@Index('IDX_table_name_column', ['columnName'])
export class EntityName {
  @Column({ type: 'integer' })
  columnName: number;

  @ManyToOne(() => TargetEntity)
  target: TargetEntity;
}
```

**With `synchronize: false`** (our setup): TypeORM never creates indexes or FKs at runtime. So:

- For **indexes**: Add a follow-up migration that creates the exact index names used in `@Index('IDX_...', [...])` (e.g. `CREATE INDEX IF NOT EXISTS "IDX_..." ON "table" ("column");`). See `9000000000009-AlignChannelIdIndexesAndAdministratorProfilePicture.ts`.
- For **FKs** that were only added as columns (e.g. custom field relations): Add the same migration or a dedicated "align" migration that creates the exact FK name TypeORM expects (check startup "schema does not match" message or down() of the migration that added the column).

### Step 3: Deployment Process

**For Production with Existing Data:**

1. Run SQL script first (adds columns, backfills, makes NOT NULL, adds constraints)
2. Deploy new code with migration
3. Migration sees column exists, skips everything
4. TypeORM sync sees constraints exist, doesn't recreate

**For Fresh Systems:**

1. Deploy new code with migration
2. Migration creates columns as NOT NULL with constraints
3. SQL script sees columns exist, skips everything

## Why This Works

- **Idempotency**: Both script and migration check for column existence
- **Constraint Name Independence**: Both check for ANY constraint on the column, not specific names
- **Order Independence**: Can run script first OR migration first, both work
- **TypeORM Compatibility**: TypeORM sees column/constraint exists and doesn't try to recreate

## Example: Adding channelId to StockPurchase

See:

- `backend/scripts/backfill-channel-id-stock-entities.sql` - SQL script
- `backend/src/migrations/8000000000012-AddChannelIdToStockEntities.ts` - TypeORM migration

## Checklist for Future Migrations

When adding columns to existing tables:

- [ ] Create SQL backfill script that:
  - [ ] Adds column as NULLABLE
  - [ ] Backfills from source (ledger, other tables, etc.)
  - [ ] Handles NULL values (default channel, etc.)
  - [ ] Makes column NOT NULL
  - [ ] Adds FK constraints (checking for ANY FK, not specific name)
  - [ ] Adds indexes
  - [ ] Is idempotent (can run multiple times safely)

- [ ] Create TypeORM migration that:
  - [ ] Checks if column exists first (if yes, skip everything)
  - [ ] Adds column as NOT NULL (assumes fresh system)
  - [ ] Does NOT create FK constraints (TypeORM handles via @ManyToOne)
  - [ ] Does NOT create indexes (TypeORM handles via @Index decorators)
  - [ ] Is idempotent

- [ ] Add entity decorators:
  - [ ] Add `@Index('IDX_table_column', ['columnName'])` to entity class
  - [ ] Ensure `@ManyToOne(() => TargetEntity)` is present for FK

- [ ] Test both scenarios:
  - [ ] Fresh system: Migration runs, script skips
  - [ ] Existing data: Script runs, migration skips
  - [ ] Both idempotent when run multiple times

- [ ] Document in migration comments:
  - [ ] What the script does
  - [ ] When to run script vs migration
  - [ ] Source of backfill data

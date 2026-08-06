# Backend Scripts

## backfill-channel-id-stock-entities.sql

Adds channelId to stock entities (stock_purchase, inventory_stock_adjustment, purchase_payment) for existing data.

### When to Use

Run this script **BEFORE** deploying the new backend version that includes the `AddChannelIdToStockEntities8000000000012` migration on systems with existing data.

### What It Does

1. Adds `channelId` columns as NULLABLE
2. Backfills values from ledger journal entries (for purchases)
3. Falls back to default channel for records without ledger entries
4. Sets columns to NOT NULL
5. Adds foreign key constraints and indexes

### Usage

**Via Docker (recommended for production):**

```bash
docker exec -i <postgres-container> psql -U vendure -d vendure < backfill-channel-id-stock-entities.sql
```

**Via SSH to production:**

```bash
cat backfill-channel-id-stock-entities.sql | ssh user@server "docker exec -i postgres_container psql -U vendure -d vendure"
```

**Direct psql:**

```bash
PGPASSWORD=vendure psql -h <host> -U vendure -d vendure -f backfill-channel-id-stock-entities.sql
```

### Notes

- Script is **idempotent** - safe to run multiple times
- Uses transactions - if anything fails, all changes are rolled back
- After running, the TypeORM migration will detect columns already exist and skip

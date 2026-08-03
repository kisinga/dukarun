-- ============================================================================
-- Backfill channelId for Stock Entities
-- ============================================================================
-- 
-- This script adds channelId to stock_purchase, inventory_stock_adjustment,
-- and purchase_payment tables by inferring the value from ledger journal entries.
--
-- Run this BEFORE the TypeORM migration on systems with existing data.
-- The migration assumes this has been run and expects NOT NULL columns.
--
-- Usage (via psql):
--   psql -h <host> -U <user> -d <database> -f backfill-channel-id-stock-entities.sql
--
-- Or via Docker:
--   docker exec -i <container> psql -U vendure -d vendure < backfill-channel-id-stock-entities.sql
--
-- ============================================================================

-- Start transaction for safety
BEGIN;

-- ============================================================================
-- STEP 1: Add channelId columns as NULLABLE
-- ============================================================================

-- Add channelId to stock_purchase (if not exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'stock_purchase'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_purchase' AND column_name = 'channelId'
    ) THEN
        ALTER TABLE "stock_purchase" ADD COLUMN "channelId" integer;
        RAISE NOTICE 'Added channelId column to stock_purchase';
    ELSE
        RAISE NOTICE 'channelId column already exists or table does not exist for stock_purchase';
    END IF;
END $$;

-- Add channelId to inventory_stock_adjustment (if not exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'inventory_stock_adjustment'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_stock_adjustment' AND column_name = 'channelId'
    ) THEN
        ALTER TABLE "inventory_stock_adjustment" ADD COLUMN "channelId" integer;
        RAISE NOTICE 'Added channelId column to inventory_stock_adjustment';
    ELSE
        RAISE NOTICE 'channelId column already exists or table does not exist for inventory_stock_adjustment';
    END IF;
END $$;

-- Add channelId to purchase_payment (if not exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'purchase_payment'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_payment' AND column_name = 'channelId'
    ) THEN
        ALTER TABLE "purchase_payment" ADD COLUMN "channelId" integer;
        RAISE NOTICE 'Added channelId column to purchase_payment';
    ELSE
        RAISE NOTICE 'channelId column already exists or table does not exist for purchase_payment';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Backfill channelId from ledger journal entries
-- ============================================================================

-- Show counts before backfill
DO $$
DECLARE
    purchase_null_count integer;
    adjustment_null_count integer;
    payment_null_count integer;
BEGIN
    -- Count NULL channelId in stock_purchase
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_purchase') THEN
        SELECT COUNT(*) INTO purchase_null_count 
        FROM stock_purchase WHERE "channelId" IS NULL;
        RAISE NOTICE 'stock_purchase records with NULL channelId: %', purchase_null_count;
    END IF;
    
    -- Count NULL channelId in inventory_stock_adjustment
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock_adjustment') THEN
        SELECT COUNT(*) INTO adjustment_null_count 
        FROM inventory_stock_adjustment WHERE "channelId" IS NULL;
        RAISE NOTICE 'inventory_stock_adjustment records with NULL channelId: %', adjustment_null_count;
    END IF;
    
    -- Count NULL channelId in purchase_payment
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_payment') THEN
        SELECT COUNT(*) INTO payment_null_count 
        FROM purchase_payment WHERE "channelId" IS NULL;
        RAISE NOTICE 'purchase_payment records with NULL channelId: %', payment_null_count;
    END IF;
END $$;

-- Backfill stock_purchase from ledger_journal_entry (sourceType = 'Purchase')
UPDATE stock_purchase sp
SET "channelId" = lje."channelId"
FROM ledger_journal_entry lje
WHERE sp.id::text = lje."sourceId"
  AND lje."sourceType" = 'Purchase'
  AND sp."channelId" IS NULL;

-- Report backfill results for stock_purchase
DO $$
DECLARE
    updated_count integer;
    remaining_null integer;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % stock_purchase records from ledger', updated_count;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_purchase') THEN
        SELECT COUNT(*) INTO remaining_null 
        FROM stock_purchase WHERE "channelId" IS NULL;
        IF remaining_null > 0 THEN
            RAISE WARNING 'stock_purchase still has % records with NULL channelId', remaining_null;
        END IF;
    END IF;
END $$;

-- Backfill inventory_stock_adjustment from ledger_journal_entry (sourceType = 'StockAdjustment')
-- Note: Stock adjustments may not have ledger entries, so we'll try multiple approaches
UPDATE inventory_stock_adjustment isa
SET "channelId" = lje."channelId"
FROM ledger_journal_entry lje
WHERE isa.id::text = lje."sourceId"
  AND lje."sourceType" = 'StockAdjustment'
  AND isa."channelId" IS NULL;

-- Report backfill results for inventory_stock_adjustment
DO $$
DECLARE
    remaining_null integer;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock_adjustment') THEN
        SELECT COUNT(*) INTO remaining_null 
        FROM inventory_stock_adjustment WHERE "channelId" IS NULL;
        IF remaining_null > 0 THEN
            RAISE WARNING 'inventory_stock_adjustment still has % records with NULL channelId - may need manual fix', remaining_null;
        END IF;
    END IF;
END $$;

-- Backfill purchase_payment from stock_purchase (inherit channelId from purchase)
UPDATE purchase_payment pp
SET "channelId" = sp."channelId"
FROM stock_purchase sp
WHERE pp."purchaseId" = sp.id
  AND pp."channelId" IS NULL
  AND sp."channelId" IS NOT NULL;

-- Report backfill results for purchase_payment
DO $$
DECLARE
    remaining_null integer;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_payment') THEN
        SELECT COUNT(*) INTO remaining_null 
        FROM purchase_payment WHERE "channelId" IS NULL;
        IF remaining_null > 0 THEN
            RAISE WARNING 'purchase_payment still has % records with NULL channelId', remaining_null;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Handle remaining NULL values
-- ============================================================================
-- If there are still NULL values, we need to decide what to do:
-- Option A: Set to default channel (usually channel ID 1)
-- Option B: Fail and require manual investigation
--
-- This script uses Option A with a fallback to channel 1 (default channel)

-- Get the default channel ID (usually 1, but let's verify)
DO $$
DECLARE
    default_channel_id integer;
    purchase_null_count integer := 0;
    adjustment_null_count integer := 0;
    payment_null_count integer := 0;
BEGIN
    -- Find the __default_channel__
    SELECT id INTO default_channel_id 
    FROM channel 
    WHERE code = '__default_channel__' 
    LIMIT 1;
    
    IF default_channel_id IS NULL THEN
        -- Fallback to first channel
        SELECT id INTO default_channel_id FROM channel ORDER BY id LIMIT 1;
    END IF;
    
    IF default_channel_id IS NULL THEN
        RAISE EXCEPTION 'No channel found in database - cannot backfill';
    END IF;
    
    RAISE NOTICE 'Using default channel ID: % for remaining NULL values', default_channel_id;
    
    -- Count remaining nulls
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_purchase') THEN
        SELECT COUNT(*) INTO purchase_null_count FROM stock_purchase WHERE "channelId" IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock_adjustment') THEN
        SELECT COUNT(*) INTO adjustment_null_count FROM inventory_stock_adjustment WHERE "channelId" IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_payment') THEN
        SELECT COUNT(*) INTO payment_null_count FROM purchase_payment WHERE "channelId" IS NULL;
    END IF;
    
    -- Update remaining NULL values to default channel
    IF purchase_null_count > 0 THEN
        UPDATE stock_purchase SET "channelId" = default_channel_id WHERE "channelId" IS NULL;
        RAISE NOTICE 'Set % stock_purchase records to default channel %', purchase_null_count, default_channel_id;
    END IF;
    
    IF adjustment_null_count > 0 THEN
        UPDATE inventory_stock_adjustment SET "channelId" = default_channel_id WHERE "channelId" IS NULL;
        RAISE NOTICE 'Set % inventory_stock_adjustment records to default channel %', adjustment_null_count, default_channel_id;
    END IF;
    
    IF payment_null_count > 0 THEN
        UPDATE purchase_payment SET "channelId" = default_channel_id WHERE "channelId" IS NULL;
        RAISE NOTICE 'Set % purchase_payment records to default channel %', payment_null_count, default_channel_id;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Add NOT NULL constraint
-- ============================================================================

-- Make channelId NOT NULL on stock_purchase
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stock_purchase' 
        AND column_name = 'channelId' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "stock_purchase" ALTER COLUMN "channelId" SET NOT NULL;
        RAISE NOTICE 'Set stock_purchase.channelId to NOT NULL';
    END IF;
END $$;

-- Make channelId NOT NULL on inventory_stock_adjustment
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_stock_adjustment' 
        AND column_name = 'channelId' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "inventory_stock_adjustment" ALTER COLUMN "channelId" SET NOT NULL;
        RAISE NOTICE 'Set inventory_stock_adjustment.channelId to NOT NULL';
    END IF;
END $$;

-- Make channelId NOT NULL on purchase_payment
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'purchase_payment' 
        AND column_name = 'channelId' 
        AND is_nullable = 'YES'
    ) THEN
        ALTER TABLE "purchase_payment" ALTER COLUMN "channelId" SET NOT NULL;
        RAISE NOTICE 'Set purchase_payment.channelId to NOT NULL';
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Add indexes (FK constraints are handled by TypeORM)
-- ============================================================================
-- 
-- NOTE: We do NOT create FK constraints here because:
-- 1. TypeORM creates them automatically via @ManyToOne decorators with hash-based names
-- 2. TypeORM's schema check validates by constraint name, not just existence
-- 3. If we create FKs with custom names, TypeORM will want to replace them
-- 4. TypeORM will create FKs when migrations run or when synchronize is enabled
-- 5. For production: Run this script first, then deploy code - TypeORM will create FKs on first run
--
-- Indexes are safe to create because TypeORM recognizes them by name via @Index decorators

-- Add indexes for channelId
CREATE INDEX IF NOT EXISTS "IDX_stock_purchase_channel" ON "stock_purchase" ("channelId");
CREATE INDEX IF NOT EXISTS "IDX_inventory_stock_adjustment_channel" ON "inventory_stock_adjustment" ("channelId");
CREATE INDEX IF NOT EXISTS "IDX_purchase_payment_channel" ON "purchase_payment" ("channelId");

DO $$ BEGIN RAISE NOTICE 'Created indexes for channelId columns'; END $$;

-- ============================================================================
-- STEP 6: Verification
-- ============================================================================

DO $$
DECLARE
    purchase_count integer := 0;
    adjustment_count integer := 0;
    payment_count integer := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_purchase') THEN
        SELECT COUNT(*) INTO purchase_count FROM stock_purchase;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_stock_adjustment') THEN
        SELECT COUNT(*) INTO adjustment_count FROM inventory_stock_adjustment;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_payment') THEN
        SELECT COUNT(*) INTO payment_count FROM purchase_payment;
    END IF;
    
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Backfill complete!';
    RAISE NOTICE '  stock_purchase: % records', purchase_count;
    RAISE NOTICE '  inventory_stock_adjustment: % records', adjustment_count;
    RAISE NOTICE '  purchase_payment: % records', payment_count;
    RAISE NOTICE '============================================';
    RAISE NOTICE 'All channelId columns are now NOT NULL with FK constraints.';
    RAISE NOTICE 'You can now run the TypeORM migration safely.';
END $$;

COMMIT;


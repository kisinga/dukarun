import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Cashier Fields
 *
 * Merges:
 * - 1760530000000-MoveCashierToChannel.ts
 *
 * Final state:
 * - Channel: cashierFlowEnabled, cashierOpen
 * - StockLocation: NO cashier fields (moved to channel)
 */
export class AddChannelCashierFields1000000000003 implements MigrationInterface {
  name = 'AddChannelCashierFields1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Add cashier fields to Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCashierflowenabled" boolean NOT NULL DEFAULT false;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCashieropen" boolean NOT NULL DEFAULT false;
                END IF;

                -- Remove cashier fields from StockLocation if they exist
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'stock_location'
                ) THEN
                    ALTER TABLE "stock_location" 
                    DROP COLUMN IF EXISTS "customFieldsCashierflowenabled";

                    ALTER TABLE "stock_location" 
                    DROP COLUMN IF EXISTS "customFieldsCashieropen";
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Restore cashier fields to StockLocation
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'stock_location'
                ) THEN
                    ALTER TABLE "stock_location" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCashierflowenabled" boolean NOT NULL DEFAULT false;

                    ALTER TABLE "stock_location" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCashieropen" boolean NOT NULL DEFAULT false;
                END IF;

                -- Remove cashier fields from Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsCashierflowenabled";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsCashieropen";
                END IF;
            END $$;
        `);
  }
}

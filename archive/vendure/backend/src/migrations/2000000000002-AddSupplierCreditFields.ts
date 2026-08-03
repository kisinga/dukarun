import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Supplier Credit Fields
 *
 * Merges:
 * - 1764000400000-AddSupplierCreditFields.ts
 *
 * Final state:
 * - Customer: Supplier credit fields
 * - StockPurchase: isCreditPurchase field
 */
export class AddSupplierCreditFields2000000000002 implements MigrationInterface {
  name = 'AddSupplierCreditFields2000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsIssuppliercreditapproved" boolean NOT NULL DEFAULT false;

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSuppliercreditlimit" double precision NOT NULL DEFAULT 0;

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSuppliercreditduration" integer NOT NULL DEFAULT 30;

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSupplierlastrepaymentdate" timestamp;

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSupplierlastrepaymentamount" double precision NOT NULL DEFAULT 0;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'stock_purchase'
                ) THEN
                    ALTER TABLE "stock_purchase" 
                    ADD COLUMN IF NOT EXISTS "isCreditPurchase" boolean NOT NULL DEFAULT false;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'stock_purchase'
                ) THEN
                    ALTER TABLE "stock_purchase" 
                    DROP COLUMN IF EXISTS "isCreditPurchase";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSupplierlastrepaymentamount";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSupplierlastrepaymentdate";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSuppliercreditduration";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSuppliercreditlimit";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsIssuppliercreditapproved";
                END IF;
            END $$;
        `);
  }
}

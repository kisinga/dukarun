import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Purchase Payment Table
 *
 * Merges:
 * - 1766000100000-CreatePurchasePaymentTable.ts
 * - 1766000400000-FixPurchasePaymentConstraints.ts
 *
 * Final state:
 * - purchase_payment table with correct FK constraints and defaults
 */
export class CreatePurchasePaymentTable8000000000002 implements MigrationInterface {
  name = 'CreatePurchasePaymentTable8000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgcrypto extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Create purchase_payment table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "purchase_payment" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "purchaseId" uuid NOT NULL,
                "amount" bigint NOT NULL,
                "method" varchar(64) NOT NULL,
                "reference" varchar(128) NULL,
                "paidAt" timestamp NOT NULL DEFAULT now(),
                "meta" jsonb NULL,
                "supplierId" integer NOT NULL
            )
        `);

    // Create indexes
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_purchase_payment_purchase" 
            ON "purchase_payment" ("purchaseId")
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_purchase_payment_supplier" 
            ON "purchase_payment" ("supplierId", "paidAt")
        `);

    // Add foreign key constraints
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Drop old constraint if it exists
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_purchase_payment_purchase'
                ) THEN
                    ALTER TABLE "purchase_payment" 
                    DROP CONSTRAINT "FK_purchase_payment_purchase";
                END IF;
                
                -- Add TypeORM-named purchase FK constraint
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_3d36aefdb19ddb291bc93ee81ca'
                ) THEN
                    ALTER TABLE "purchase_payment"
                    ADD CONSTRAINT "FK_3d36aefdb19ddb291bc93ee81ca"
                    FOREIGN KEY ("purchaseId") REFERENCES "stock_purchase"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
                
                -- Add supplier FK constraint
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_0c9b70b876976913b56e11e6a83'
                ) THEN
                    ALTER TABLE "purchase_payment"
                    ADD CONSTRAINT "FK_0c9b70b876976913b56e11e6a83"
                    FOREIGN KEY ("supplierId") REFERENCES "customer"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;

                -- Ensure paidAt default is now()
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'purchase_payment' 
                    AND column_name = 'paidAt' 
                    AND column_default != 'now()'
                ) THEN
                    ALTER TABLE "purchase_payment" 
                    ALTER COLUMN "paidAt" SET DEFAULT now();
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
                    WHERE table_name = 'purchase_payment'
                ) THEN
                    ALTER TABLE "purchase_payment" 
                    DROP CONSTRAINT IF EXISTS "FK_3d36aefdb19ddb291bc93ee81ca";
                    
                    ALTER TABLE "purchase_payment" 
                    DROP CONSTRAINT IF EXISTS "FK_0c9b70b876976913b56e11e6a83";
                END IF;
            END $$;
        `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_payment_supplier"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_purchase_payment_purchase"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "purchase_payment"`);
  }
}

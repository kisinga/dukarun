import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Customer Credit Fields
 *
 * Merges:
 * - 1762200000000-AddCustomerCreditFields.ts
 * - 1762210000000-AddCustomerCreditRepaymentFields.ts
 *
 * Final state:
 * - Customer: All credit and repayment fields
 */
export class AddCustomerCreditFields2000000000001 implements MigrationInterface {
  name = 'AddCustomerCreditFields2000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer"
                    ADD COLUMN IF NOT EXISTS "customFieldsIscreditapproved" boolean NOT NULL DEFAULT false;

                    ALTER TABLE "customer"
                    ADD COLUMN IF NOT EXISTS "customFieldsCreditlimit" double precision NOT NULL DEFAULT 0;

                    ALTER TABLE "customer"
                    ADD COLUMN IF NOT EXISTS "customFieldsLastrepaymentdate" TIMESTAMP;

                    ALTER TABLE "customer"
                    ADD COLUMN IF NOT EXISTS "customFieldsLastrepaymentamount" double precision NOT NULL DEFAULT 0;

                    ALTER TABLE "customer"
                    ADD COLUMN IF NOT EXISTS "customFieldsCreditduration" integer NOT NULL DEFAULT 30;
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
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer"
                    DROP COLUMN IF EXISTS "customFieldsCreditduration";

                    ALTER TABLE "customer"
                    DROP COLUMN IF EXISTS "customFieldsLastrepaymentamount";

                    ALTER TABLE "customer"
                    DROP COLUMN IF EXISTS "customFieldsLastrepaymentdate";

                    ALTER TABLE "customer"
                    DROP COLUMN IF EXISTS "customFieldsCreditlimit";

                    ALTER TABLE "customer"
                    DROP COLUMN IF EXISTS "customFieldsIscreditapproved";
                END IF;
            END $$;
        `);
  }
}

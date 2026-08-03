import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Customer Supplier Fields
 *
 * Merges:
 * - 1760550000000-AddCustomerSupplierFields.ts
 * - 1760560000000-UpdateCustomerSupplierFields.ts (removes supplierCode, adds outstandingAmount)
 * - 1764000300000-RemoveOutstandingAmountCustomField.ts (removes outstandingAmount)
 *
 * Final state:
 * - Customer: All supplier fields EXCEPT supplierCode and outstandingAmount
 */
export class AddCustomerSupplierFields2000000000000 implements MigrationInterface {
  name = 'AddCustomerSupplierFields2000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'customer'
                ) THEN
                    -- Add supplier fields
                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsIssupplier" boolean NOT NULL DEFAULT false;

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSuppliertype" character varying(255);

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsContactperson" character varying(255);

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsTaxid" character varying(255);

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsPaymentterms" character varying(255);

                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsNotes" text;

                    -- Remove fields that were added then deleted
                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSuppliercode";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsOutstandingamount";
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
                    DROP COLUMN IF EXISTS "customFieldsNotes";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsPaymentterms";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsTaxid";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsContactperson";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsSuppliertype";

                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsIssupplier";
                END IF;
            END $$;
        `);
  }
}

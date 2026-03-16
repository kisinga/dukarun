import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add index on Customer.customFields.isSupplier.
 *
 * This field is filtered on every customer and supplier list query
 * (client-side separation of customers vs suppliers). An index
 * significantly improves query performance for these high-frequency lookups.
 */
export class AddCustomerIsSupplierIndex9500000000002 implements MigrationInterface {
  name = 'AddCustomerIsSupplierIndex9500000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer' AND column_name = 'customFieldsIssupplier'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_customer_customFields_isSupplier"
          ON "customer" ("customFieldsIssupplier");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_customer_customFields_isSupplier";
    `);
  }
}

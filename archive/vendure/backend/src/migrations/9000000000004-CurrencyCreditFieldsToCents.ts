import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Currency Credit Fields to Cents Migration
 *
 * Converts credit-related monetary fields from base currency units (sh) to
 * smallest currency unit (cents) for consistency with Vendure and the ledger.
 *
 * Affected columns on customer table:
 * - customFieldsCreditlimit
 * - customFieldsLastrepaymentamount
 * - customFieldsSuppliercreditlimit
 * - customFieldsSupplierlastrepaymentamount
 *
 * Note: Assumes all existing data is in base currency units. Values are multiplied by 100.
 */
export class CurrencyCreditFieldsToCents9000000000004 implements MigrationInterface {
  name = 'CurrencyCreditFieldsToCents9000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'customer'
        ) THEN
          -- Customer credit limit (sh -> cents)
          UPDATE "customer"
          SET "customFieldsCreditlimit" = "customFieldsCreditlimit" * 100
          WHERE "customFieldsCreditlimit" > 0;

          -- Customer last repayment amount (sh -> cents)
          UPDATE "customer"
          SET "customFieldsLastrepaymentamount" = "customFieldsLastrepaymentamount" * 100
          WHERE "customFieldsLastrepaymentamount" > 0;

          -- Supplier credit limit (sh -> cents)
          UPDATE "customer"
          SET "customFieldsSuppliercreditlimit" = "customFieldsSuppliercreditlimit" * 100
          WHERE "customFieldsSuppliercreditlimit" > 0;

          -- Supplier last repayment amount (sh -> cents)
          UPDATE "customer"
          SET "customFieldsSupplierlastrepaymentamount" = "customFieldsSupplierlastrepaymentamount" * 100
          WHERE "customFieldsSupplierlastrepaymentamount" > 0;
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
          UPDATE "customer"
          SET "customFieldsCreditlimit" = "customFieldsCreditlimit" / 100
          WHERE "customFieldsCreditlimit" >= 100;

          UPDATE "customer"
          SET "customFieldsLastrepaymentamount" = "customFieldsLastrepaymentamount" / 100
          WHERE "customFieldsLastrepaymentamount" >= 100;

          UPDATE "customer"
          SET "customFieldsSuppliercreditlimit" = "customFieldsSuppliercreditlimit" / 100
          WHERE "customFieldsSuppliercreditlimit" >= 100;

          UPDATE "customer"
          SET "customFieldsSupplierlastrepaymentamount" = "customFieldsSupplierlastrepaymentamount" / 100
          WHERE "customFieldsSupplierlastrepaymentamount" >= 100;
        END IF;
      END $$;
    `);
  }
}

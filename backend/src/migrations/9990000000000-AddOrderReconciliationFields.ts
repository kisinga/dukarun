import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Order reconciliation custom fields.
 *
 * Superadmins use these to record why and when a divergent order was reconciled.
 * Idempotent (ADD COLUMN IF NOT EXISTS) and table-guarded so replays are safe.
 */
export class AddOrderReconciliationFields9990000000000 implements MigrationInterface {
  name = 'AddOrderReconciliationFields9990000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'order'
        ) THEN
          ALTER TABLE "order"
          ADD COLUMN IF NOT EXISTS "customFieldsReconciliationstrategy" character varying(255);

          ALTER TABLE "order"
          ADD COLUMN IF NOT EXISTS "customFieldsReconciliationnote" text;

          ALTER TABLE "order"
          ADD COLUMN IF NOT EXISTS "customFieldsReconciledat" timestamp;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'order'
        ) THEN
          ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsReconciliationstrategy";
          ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsReconciliationnote";
          ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsReconciledat";
        END IF;
      END $$;
    `);
  }
}

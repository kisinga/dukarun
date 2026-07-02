import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Order.cashierPendingAt custom field.
 *
 * Marks an order parked at the cashier (created via the cashier flow): fulfilled
 * and owing, awaiting collection at the cashier counter. NULL means the order is
 * not (or no longer) pending at the cashier. Set at park time; cleared to NULL
 * once the order is fully settled. Drives the cashier settlement queue.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS) and table-guarded so replays are safe.
 */
export class AddOrderCashierPendingField9930000000000 implements MigrationInterface {
  name = 'AddOrderCashierPendingField9930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'order'
        ) THEN
          ALTER TABLE "order"
          ADD COLUMN IF NOT EXISTS "customFieldsCashierpendingat" timestamp;
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
          ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsCashierpendingat";
        END IF;
      END $$;
    `);
  }
}

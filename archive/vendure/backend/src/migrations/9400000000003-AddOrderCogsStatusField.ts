import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Order.cogsStatus custom field.
 *
 * Tracks whether COGS was recorded for the order:
 *   - NULL  : not yet processed (pre-existing orders)
 *   - 'recorded' : inventoryService.recordSale() succeeded
 *   - 'skipped'  : insufficient batch stock at sale time; needs manual reconciliation
 */
export class AddOrderCogsStatusField9400000000003 implements MigrationInterface {
  name = 'AddOrderCogsStatusField9400000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'order'
        ) THEN
          ALTER TABLE "order"
          ADD COLUMN IF NOT EXISTS "customFieldsCogsstatus" character varying(255);
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
          ALTER TABLE "order" DROP COLUMN IF EXISTS "customFieldsCogsstatus";
        END IF;
      END $$;
    `);
  }
}

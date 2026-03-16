import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add index on Order.customFields.cogsStatus.
 *
 * Used by COGS batch processing to find orders that need COGS recording
 * or reconciliation. Index improves performance of these periodic queries.
 */
export class AddOrderCogsStatusIndex9500000000003 implements MigrationInterface {
  name = 'AddOrderCogsStatusIndex9500000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'order' AND column_name = 'customFieldsCogsstatus'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_order_customFields_cogsStatus"
          ON "order" ("customFieldsCogsstatus");
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_order_customFields_cogsStatus";
    `);
  }
}

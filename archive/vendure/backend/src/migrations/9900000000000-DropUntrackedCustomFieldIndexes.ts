import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align schema with TypeORM entity metadata so the startup "Your database schema
 * does not match your current configuration" log no longer appears.
 *
 * BACKGROUND
 * Two perf indexes were added via raw SQL in earlier migrations:
 *   - "IDX_customer_customFields_isSupplier" (9500000000002)
 *   - "IDX_order_customFields_cogsStatus"    (9500000000003)
 * They sit on *custom-field* columns. In this Vendure version, custom-field
 * config exposes only `nullable | unique | readonly | internal | requiresPermission`
 * — there is NO `index` option, and custom-field columns cannot carry an `@Index`
 * decorator. So TypeORM's entity metadata can never know about these indexes and,
 * with `synchronize: false`, it emits a (harmless but permanent) "schema does not
 * match … DROP INDEX" log for exactly these two on every boot.
 *
 * The note in 9600000000000 assumed we could silence this via a `index: true`
 * custom-field config; that option does not exist in this version, so the only way
 * to reconcile DB ↔ metadata (and stop the log) is to drop the two indexes — which
 * is precisely the change Vendure's message asks us to generate.
 *
 * TRADE-OFF: these were low-cardinality indexes (boolean / short enum). If either
 * lookup ever needs indexing again, prefer a real (non custom-field) column or a
 * Vendure version that supports custom-field indexing, so TypeORM can track it.
 *
 * Idempotent: both up() and down() use IF (NOT) EXISTS guards.
 */
export class DropUntrackedCustomFieldIndexes9900000000000 implements MigrationInterface {
  name = 'DropUntrackedCustomFieldIndexes9900000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_customer_customFields_isSupplier";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_customFields_cogsStatus";`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the indexes (guarded by column existence), mirroring 9500000000002/3.
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
}

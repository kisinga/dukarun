import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remodel inventory_movement per-allocation uniqueness.
 *
 * Previously UQ_inventory_movement_source covered only (channelId, sourceType, sourceId), so
 * createMovement's idempotency check collapsed every per-allocation movement of an
 * order/adjustment into the first row. The dedupe key now spans the real allocation
 * dimensions as typed columns:
 *
 *   (channelId, sourceType, sourceId, productVariantId, batchId, orderLineId, movementType)
 *
 * plus two new nullable columns:
 * - orderLineId: Vendure OrderLine id for SALE movements and their reversals (plain column,
 *   no FK to Vendure tables — same convention as sale_cogs.orderLineId).
 * - reversesMovementId: for reversal movements, the movement being restored (self-FK). Part
 *   of the unique key so two reversal rows restoring the same batch/line don't collide.
 *
 * Nullable key columns use COALESCE instead of NULLS NOT DISTINCT (requires Postgres 15+)
 * so the index behaves identically on all supported Postgres versions.
 *
 * Idempotent: guards on table/column/index existence. Safe on a fresh DB (runs after
 * 9370000000000 which creates the table with the old index).
 */
export class FixInventoryMovementSourceUniqueness9990000000009 implements MigrationInterface {
  name = 'FixInventoryMovementSourceUniqueness9990000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'inventory_movement'`
    );
    if (!Array.isArray(hasTable) || hasTable.length === 0) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'inventory_movement' AND column_name = 'orderLineId'
        ) THEN
          ALTER TABLE "inventory_movement" ADD COLUMN "orderLineId" character varying(255) NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'inventory_movement' AND column_name = 'reversesMovementId'
        ) THEN
          ALTER TABLE "inventory_movement" ADD COLUMN "reversesMovementId" uuid NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_inventory_movement_reverses') THEN
          ALTER TABLE "inventory_movement" ADD CONSTRAINT "FK_inventory_movement_reverses"
            FOREIGN KEY ("reversesMovementId") REFERENCES "inventory_movement"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_movement_source"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_movement_source"
      ON "inventory_movement" (
        "channelId",
        "sourceType",
        "sourceId",
        "productVariantId",
        "movementType",
        (COALESCE("batchId"::text, '')),
        (COALESCE("orderLineId", '')),
        (COALESCE("reversesMovementId"::text, ''))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'inventory_movement'`
    );
    if (!Array.isArray(hasTable) || hasTable.length === 0) {
      return;
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_movement_source"`);
    await queryRunner.query(
      `ALTER TABLE "inventory_movement" DROP CONSTRAINT IF EXISTS "FK_inventory_movement_reverses"`
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_movement_source"
      ON "inventory_movement" ("channelId", "sourceType", "sourceId")
    `);
    await queryRunner.query(`ALTER TABLE "inventory_movement" DROP COLUMN IF EXISTS "reversesMovementId"`);
    await queryRunner.query(`ALTER TABLE "inventory_movement" DROP COLUMN IF EXISTS "orderLineId"`);
  }
}

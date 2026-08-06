import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Single idempotent migration for inventory_batch and inventory_movement.
 *
 * Safe to run on:
 * - Fresh DB (no inventory tables): creates tables, indexes, FKs with TypeORM-expected names and defaults.
 * - Existing DB (tables from prior migrations/sync): adds missing column, aligns defaults, UQ as index, FKs.
 *
 * All steps are guarded so running multiple times is a no-op.
 */
export class InventoryTablesIdempotent9370000000000 implements MigrationInterface {
  name = 'InventoryTablesIdempotent9370000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasBatch = await queryRunner.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'inventory_batch'`
    );
    const tablesExist = Array.isArray(hasBatch) && hasBatch.length > 0;

    if (!tablesExist) {
      await this.createFromScratch(queryRunner);
    } else {
      await this.alignExisting(queryRunner);
    }
  }

  private async createFromScratch(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    await queryRunner.query(`
      CREATE TABLE "inventory_batch" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "channelId" integer NOT NULL,
        "stockLocationId" integer NOT NULL,
        "productVariantId" integer NOT NULL,
        "quantity" float NOT NULL,
        "unitCost" bigint NOT NULL,
        "expiryDate" timestamp,
        "sourceType" character varying(64) NOT NULL,
        "sourceId" character varying(255) NOT NULL,
        "metadata" jsonb,
        "batchNumber" character varying(128) NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_batch" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_inventory_batch_quantity_non_negative" CHECK ("quantity" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_movement" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "channelId" integer NOT NULL,
        "stockLocationId" integer NOT NULL,
        "productVariantId" integer NOT NULL,
        "movementType" character varying(32) NOT NULL,
        "quantity" float NOT NULL,
        "batchId" uuid,
        "sourceType" character varying(64) NOT NULL,
        "sourceId" character varying(255) NOT NULL,
        "metadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_movement" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_inventory_movement_source"
      ON "inventory_movement" ("channelId", "sourceType", "sourceId")
    `);

    await this.createIndexes(queryRunner);
    await this.ensureTypeormFKs(queryRunner);
  }

  private async alignExisting(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'inventory_batch' AND column_name = 'batchNumber'
        ) THEN
          ALTER TABLE "inventory_batch" ADD COLUMN "batchNumber" character varying(128) NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "inventory_batch"
        ALTER COLUMN "createdAt" SET DEFAULT now(),
        ALTER COLUMN "updatedAt" SET DEFAULT now()
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_movement"
        ALTER COLUMN "createdAt" SET DEFAULT now()
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE "inventory_movement" DROP CONSTRAINT "UQ_inventory_movement_source";
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_inventory_movement_source"
      ON "inventory_movement" ("channelId", "sourceType", "sourceId")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE "inventory_batch" DROP CONSTRAINT "FK_inventory_batch_channel"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_batch" DROP CONSTRAINT "FK_inventory_batch_stock_location"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_batch" DROP CONSTRAINT "FK_inventory_batch_product_variant"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_movement" DROP CONSTRAINT "FK_inventory_movement_channel"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_movement" DROP CONSTRAINT "FK_inventory_movement_stock_location"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_movement" DROP CONSTRAINT "FK_inventory_movement_product_variant"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_movement" DROP CONSTRAINT "FK_inventory_movement_batch"; EXCEPTION WHEN undefined_object THEN NULL; END;
        BEGIN ALTER TABLE "inventory_movement" DROP CONSTRAINT "FK_808e965886c77a1b52ae4b153b4"; EXCEPTION WHEN undefined_object THEN NULL; END;
      END $$;
    `);

    await this.createIndexes(queryRunner);
    await this.ensureTypeormFKs(queryRunner);
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_batch_channel_location_variant_created"
      ON "inventory_batch" ("channelId", "stockLocationId", "productVariantId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_batch_channel_source"
      ON "inventory_batch" ("channelId", "sourceType", "sourceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_batch_expiry"
      ON "inventory_batch" ("expiryDate")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_movement_channel_location_variant_created"
      ON "inventory_movement" ("channelId", "stockLocationId", "productVariantId", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_movement_batch"
      ON "inventory_movement" ("batchId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_inventory_movement_type"
      ON "inventory_movement" ("movementType")
    `);
  }

  private async ensureTypeormFKs(queryRunner: QueryRunner): Promise<void> {
    const fks: Array<{
      name: string;
      table: string;
      cols: string;
      ref: string;
      refCols: string;
      onDelete: string;
    }> = [
      {
        name: 'FK_e8a8acb4323b52483d57528a72e',
        table: 'inventory_batch',
        cols: '"channelId"',
        ref: 'channel',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_3d32a70854c0313e4c8975f29a9',
        table: 'inventory_batch',
        cols: '"stockLocationId"',
        ref: 'stock_location',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_a7510ca7dffba7a2c2eb37995a5',
        table: 'inventory_batch',
        cols: '"productVariantId"',
        ref: 'product_variant',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_33397d343a9d6229334d4f76a97',
        table: 'inventory_movement',
        cols: '"channelId"',
        ref: 'channel',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_411c91f3f2eb1990eca92c38979',
        table: 'inventory_movement',
        cols: '"stockLocationId"',
        ref: 'stock_location',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_7f25aee1049b73168eec3af711f',
        table: 'inventory_movement',
        cols: '"productVariantId"',
        ref: 'product_variant',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
      {
        name: 'FK_808e965886c77a1b52ae4b153b4',
        table: 'inventory_movement',
        cols: '"batchId"',
        ref: 'inventory_batch',
        refCols: '"id"',
        onDelete: 'NO ACTION',
      },
    ];
    for (const fk of fks) {
      await queryRunner.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.name}') THEN
            ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}"
              FOREIGN KEY (${fk.cols}) REFERENCES "${fk.ref}"(${fk.refCols}) ON DELETE ${fk.onDelete} ON UPDATE NO ACTION;
          END IF;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_movement_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_movement_batch"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_movement_channel_location_variant_created"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_inventory_movement_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_batch_expiry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_batch_channel_source"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_batch_channel_location_variant_created"`
    );

    const movementFks = [
      'FK_808e965886c77a1b52ae4b153b4',
      'FK_7f25aee1049b73168eec3af711f',
      'FK_411c91f3f2eb1990eca92c38979',
      'FK_33397d343a9d6229334d4f76a97',
    ];
    const batchFks = [
      'FK_a7510ca7dffba7a2c2eb37995a5',
      'FK_3d32a70854c0313e4c8975f29a9',
      'FK_e8a8acb4323b52483d57528a72e',
    ];
    for (const name of movementFks) {
      await queryRunner.query(
        `ALTER TABLE "inventory_movement" DROP CONSTRAINT IF EXISTS "${name}"`
      );
    }
    for (const name of batchFks) {
      await queryRunner.query(`ALTER TABLE "inventory_batch" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_movement"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_batch"`);
  }
}

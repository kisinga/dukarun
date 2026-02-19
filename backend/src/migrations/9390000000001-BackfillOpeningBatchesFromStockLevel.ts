import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill opening-stock batches for existing StockLevel rows that have no batch.
 *
 * For every (channel, location, variant) where Vendure stock_level has stockOnHand > 0
 * and there is no open inventory_batch, we insert one opening-stock batch and one
 * PURCHASE movement so COGS (recordSale) can run. Idempotent: skips when any open
 * batch already exists for that (channel, location, variant).
 */
export class BackfillOpeningBatchesFromStockLevel9390000000001 implements MigrationInterface {
  name = 'BackfillOpeningBatchesFromStockLevel9390000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Resolve (channelId, stockLocationId) from Vendure's stock_location <-> channel join.
    // TypeORM JoinTable for StockLocation.channels creates stock_location_channels_channel.
    const joinTableExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'stock_location_channels_channel'
    `);
    if (!Array.isArray(joinTableExists) || joinTableExists.length === 0) {
      return;
    }

    const inventoryBatchExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'inventory_batch'
    `);
    if (!Array.isArray(inventoryBatchExists) || inventoryBatchExists.length === 0) {
      return;
    }

    const stockLevelExists = await queryRunner.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'stock_level'
    `);
    if (!Array.isArray(stockLevelExists) || stockLevelExists.length === 0) {
      return;
    }

    // Insert opening batches for each (channelId, stockLocationId, productVariantId) where
    // stock_level has stockOnHand > 0 and no open batch exists.
    // Use a single INSERT...SELECT to avoid round-trips; do batch then movement.
    await queryRunner.query(`
      WITH location_channels AS (
        SELECT slcc."channelId", slcc."stockLocationId"
        FROM stock_location_channels_channel slcc
      ),
      candidates AS (
        SELECT
          lc."channelId",
          sl."stockLocationId",
          sl."productVariantId",
          sl."stockOnHand" AS quantity
        FROM stock_level sl
        INNER JOIN location_channels lc ON lc."stockLocationId" = sl."stockLocationId"
        WHERE sl."stockOnHand" > 0
          AND NOT EXISTS (
            SELECT 1 FROM inventory_batch b
            WHERE b."channelId" = lc."channelId"
              AND b."stockLocationId" = sl."stockLocationId"
              AND b."productVariantId" = sl."productVariantId"
              AND b.quantity > 0
          )
      ),
      inserted_batches AS (
        INSERT INTO inventory_batch (
          "id",
          "channelId",
          "stockLocationId",
          "productVariantId",
          quantity,
          "unitCost",
          "expiryDate",
          "sourceType",
          "sourceId",
          "batchNumber",
          metadata,
          "createdAt",
          "updatedAt"
        )
        SELECT
          gen_random_uuid(),
          c."channelId",
          c."stockLocationId",
          c."productVariantId",
          c.quantity,
          0,
          NULL,
          'OpeningStock',
          'OpeningStock:' || c."productVariantId" || ':' || c."stockLocationId",
          NULL,
          NULL,
          now(),
          now()
        FROM candidates c
        RETURNING "id", "channelId", "stockLocationId", "productVariantId", "sourceId", quantity
      )
      INSERT INTO inventory_movement (
        "id",
        "channelId",
        "stockLocationId",
        "productVariantId",
        "movementType",
        quantity,
        "batchId",
        "sourceType",
        "sourceId",
        metadata,
        "createdAt"
      )
      SELECT
        gen_random_uuid(),
        ib."channelId",
        ib."stockLocationId",
        ib."productVariantId",
        'PURCHASE',
        ib.quantity,
        ib."id",
        'OpeningStock',
        ib."sourceId",
        '{"openingStock": true}'::jsonb,
        now()
      FROM inserted_batches ib
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Optional: remove backfilled batches. Destructive and only needed if reverting the migration.
    await queryRunner.query(`
      DELETE FROM inventory_movement
      WHERE "sourceType" = 'OpeningStock' AND "sourceId" LIKE 'OpeningStock:%'
    `);
    await queryRunner.query(`
      DELETE FROM inventory_batch
      WHERE "sourceType" = 'OpeningStock' AND "sourceId" LIKE 'OpeningStock:%'
    `);
  }
}

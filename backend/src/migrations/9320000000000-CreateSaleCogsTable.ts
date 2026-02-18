import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates sale_cogs table for per-line FIFO COGS used by analytics margin.
 * Populated by InventoryService.recordSale; read by mv_daily_product_sales (or join in query service).
 */
export class CreateSaleCogsTable9320000000000 implements MigrationInterface {
  name = 'CreateSaleCogsTable9320000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_cogs" (
        "id" SERIAL NOT NULL,
        "channelId" integer NOT NULL,
        "orderId" character varying(255) NOT NULL,
        "orderLineId" character varying(255),
        "productVariantId" integer NOT NULL,
        "saleDate" date NOT NULL,
        "quantity" decimal(12,0) NOT NULL,
        "cogsCents" integer NOT NULL,
        "source" character varying(32) NOT NULL DEFAULT 'fifo',
        CONSTRAINT "PK_sale_cogs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sale_cogs_channel_date_variant" ON "sale_cogs" ("channelId", "saleDate", "productVariantId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sale_cogs_order" ON "sale_cogs" ("orderId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sale_cogs_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sale_cogs_channel_date_variant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_cogs"`);
  }
}

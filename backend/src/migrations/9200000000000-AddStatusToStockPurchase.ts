import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add status column to stock_purchase for draft/confirmed purchase orders
 *
 * - status: 'draft' | 'confirmed', default 'confirmed' for backward compatibility
 */
export class AddStatusToStockPurchase9200000000000 implements MigrationInterface {
  name = 'AddStatusToStockPurchase9200000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'stock_purchase'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'stock_purchase' AND column_name = 'status'
        ) THEN
          ALTER TABLE "stock_purchase" 
          ADD COLUMN "status" character varying NOT NULL DEFAULT 'confirmed';
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
          WHERE table_name = 'stock_purchase'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'stock_purchase' AND column_name = 'status'
        ) THEN
          ALTER TABLE "stock_purchase" 
          DROP COLUMN "status";
        END IF;
      END $$;
    `);
  }
}

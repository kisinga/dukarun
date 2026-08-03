import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align Stock Constraints
 *
 * Merges:
 * - 1765000000001-AlignStockConstraints.ts
 *
 * Final state:
 * - All stock constraints aligned with correct names
 * - adjustedById column added if needed
 */
export class AlignStockConstraints7000000000001 implements MigrationInterface {
  name = 'AlignStockConstraints7000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Ensure adjustedById column exists (alternative to adjustedByUserId)
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'inventory_stock_adjustment'
                ) AND NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'inventory_stock_adjustment' AND column_name = 'adjustedById'
                ) THEN
                    ALTER TABLE "inventory_stock_adjustment" 
                    ADD COLUMN "adjustedById" integer;
                END IF;

                -- Ensure FK constraints exist with correct names
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'stock_purchase_line'
                ) THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'FK_bd427f6597557b41d91f40c73ec'
                    ) THEN
                        ALTER TABLE "stock_purchase_line"
                        ADD CONSTRAINT "FK_bd427f6597557b41d91f40c73ec"
                        FOREIGN KEY ("purchaseId")
                        REFERENCES "stock_purchase"("id")
                        ON DELETE CASCADE
                        ON UPDATE NO ACTION;
                    END IF;
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'inventory_stock_adjustment_line'
                ) THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'FK_204dc9892273a53354efc1ffd23'
                    ) THEN
                        ALTER TABLE "inventory_stock_adjustment_line"
                        ADD CONSTRAINT "FK_204dc9892273a53354efc1ffd23"
                        FOREIGN KEY ("adjustmentId")
                        REFERENCES "inventory_stock_adjustment"("id")
                        ON DELETE CASCADE
                        ON UPDATE NO ACTION;
                    END IF;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: idempotent alignment migration
  }
}

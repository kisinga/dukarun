import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Purchase and Stock Adjustment Tables
 *
 * Merges:
 * - 1763139378335-CreatePurchaseAndStockAdjustmentTables.ts
 * - 1765000000000-FixForeignKeyTypesToInteger.ts (create with integer FKs from start)
 *
 * Final state:
 * - stock_purchase: All FKs as integer (supplierId, etc.)
 * - inventory_stock_adjustment: adjustedByUserId as integer
 * - All tables with createdAt, updatedAt (keeping functional timestamps)
 * - All FK constraints with correct names
 */
export class CreatePurchaseAndStockAdjustmentTables7000000000000 implements MigrationInterface {
  name = 'CreatePurchaseAndStockAdjustmentTables7000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgcrypto extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Create stock_purchase table with integer FK types from start
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "stock_purchase" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "supplierId" integer NOT NULL,
                "purchaseDate" timestamp NOT NULL,
                "referenceNumber" character varying,
                "totalCost" bigint NOT NULL,
                "paymentStatus" character varying NOT NULL,
                "notes" text,
                "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "PK_stock_purchase" PRIMARY KEY ("id")
            )
        `);

    // Create stock_purchase_line table with integer FK types from start
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "stock_purchase_line" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "purchaseId" uuid NOT NULL,
                "variantId" integer NOT NULL,
                "quantity" float NOT NULL,
                "unitCost" bigint NOT NULL,
                "totalCost" bigint NOT NULL,
                "stockLocationId" integer NOT NULL,
                CONSTRAINT "PK_stock_purchase_line" PRIMARY KEY ("id")
            )
        `);

    // Create inventory_stock_adjustment table with integer FK types from start
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "inventory_stock_adjustment" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "reason" character varying NOT NULL,
                "notes" text,
                "adjustedByUserId" integer,
                "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "PK_inventory_stock_adjustment" PRIMARY KEY ("id")
            )
        `);

    // Create inventory_stock_adjustment_line table with integer FK types from start
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "inventory_stock_adjustment_line" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "adjustmentId" uuid NOT NULL,
                "variantId" integer NOT NULL,
                "quantityChange" float NOT NULL,
                "previousStock" float NOT NULL,
                "newStock" float NOT NULL,
                "stockLocationId" integer NOT NULL,
                CONSTRAINT "PK_inventory_stock_adjustment_line" PRIMARY KEY ("id")
            )
        `);

    // Indexes are not created here - they should be defined in entities with @Index decorator
    // if needed. TypeORM will create them automatically from entity definitions.
    // This prevents schema mismatches and avoids needing CleanupLegacyConstraints.

    // Add foreign key constraints with integer types
    // Note: Vendure core tables (customer, user, product_variant, stock_location) are created during bootstrap,
    // which happens AFTER migrations run. We check table existence before creating FKs.
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'customer'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_33172b0d5e3965cc4da584ec283'
                ) THEN
                    ALTER TABLE "stock_purchase" 
                    ADD CONSTRAINT "FK_33172b0d5e3965cc4da584ec283" 
                    FOREIGN KEY ("supplierId") REFERENCES "customer"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
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
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'product_variant'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_5af2795406d6b50c46d8637f142'
                ) THEN
                    ALTER TABLE "stock_purchase_line" 
                    ADD CONSTRAINT "FK_5af2795406d6b50c46d8637f142" 
                    FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'stock_location'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_1731b607155cfe9708292d395b6'
                ) THEN
                    ALTER TABLE "stock_purchase_line" 
                    ADD CONSTRAINT "FK_1731b607155cfe9708292d395b6" 
                    FOREIGN KEY ("stockLocationId") REFERENCES "stock_location"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'user'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_d15129d2bd69da018d184c08db9'
                ) THEN
                    ALTER TABLE "inventory_stock_adjustment" 
                    ADD CONSTRAINT "FK_d15129d2bd69da018d184c08db9" 
                    FOREIGN KEY ("adjustedByUserId") REFERENCES "user"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
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
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'product_variant'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_65ea54109f7b83cd6184ab6b8fc'
                ) THEN
                    ALTER TABLE "inventory_stock_adjustment_line" 
                    ADD CONSTRAINT "FK_65ea54109f7b83cd6184ab6b8fc" 
                    FOREIGN KEY ("variantId") REFERENCES "product_variant"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);

    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'stock_location'
                ) AND NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_e9aa675a33c73c4a95823b2ceab'
                ) THEN
                    ALTER TABLE "inventory_stock_adjustment_line" 
                    ADD CONSTRAINT "FK_e9aa675a33c73c4a95823b2ceab" 
                    FOREIGN KEY ("stockLocationId") REFERENCES "stock_location"("id") 
                    ON DELETE NO ACTION ON UPDATE NO ACTION;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_inventory_stock_adjustment_line_adjustment"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_stock_adjustment_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_purchase_line_purchase"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_purchase_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_purchase_supplier"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_stock_adjustment_line"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_stock_adjustment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_purchase_line"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_purchase"`);
  }
}

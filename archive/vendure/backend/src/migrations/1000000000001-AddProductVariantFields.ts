import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Product Variant Fields
 *
 * Merges:
 * - 1760520000000-AddProductBarcode.ts
 * - 1760800000000-AddWholesaleFractionalFields.ts
 * - 1760820000000-RemoveQuantityUnitField.ts
 *
 * Final state:
 * - Product: customFieldsBarcode
 * - ProductVariant: customFieldsWholesaleprice, customFieldsAllowfractionalquantity
 * - ProductVariant: NO customFieldsQuantityunit (removed)
 */
export class AddProductVariantFields1000000000001 implements MigrationInterface {
  name = 'AddProductVariantFields1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add product barcode field
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'product'
                ) THEN
                    ALTER TABLE "product" 
                    ADD COLUMN IF NOT EXISTS "customFieldsBarcode" character varying(255);
                END IF;
            END $$;
        `);

    // Add product_variant fields
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'product_variant'
                ) THEN
                    ALTER TABLE "product_variant" 
                    ADD COLUMN IF NOT EXISTS "customFieldsWholesaleprice" integer;

                    ALTER TABLE "product_variant" 
                    ADD COLUMN IF NOT EXISTS "customFieldsAllowfractionalquantity" boolean NOT NULL DEFAULT false;

                    -- Remove quantityUnit field if it exists
                    ALTER TABLE "product_variant" 
                    DROP COLUMN IF EXISTS "customFieldsQuantityunit";
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
                    WHERE table_name = 'product_variant'
                ) THEN
                    ALTER TABLE "product_variant" 
                    DROP COLUMN IF EXISTS "customFieldsAllowfractionalquantity";

                    ALTER TABLE "product_variant" 
                    DROP COLUMN IF EXISTS "customFieldsWholesaleprice";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'product'
                ) THEN
                    ALTER TABLE "product" 
                    DROP COLUMN IF EXISTS "customFieldsBarcode";
                END IF;
            END $$;
        `);
  }
}

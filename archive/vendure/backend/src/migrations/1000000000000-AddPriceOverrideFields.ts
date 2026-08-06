import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Price Override Fields
 *
 * Merges:
 * - 1732360000000-fix-price-override-schema.ts
 * - 1732360000001-rename-custom-price-field.ts
 *
 * Final state:
 * - Channel: No price override fields (removed in rename migration)
 * - OrderLine: customFieldsCustomlineprice (renamed from customFieldsCustomprice)
 * - OrderLine: customFieldsPriceoverridereason
 */
export class AddPriceOverrideFields1000000000000 implements MigrationInterface {
  name = 'AddPriceOverrideFields1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add order_line custom fields (with table existence check)
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order_line'
                ) THEN
                    -- Add customLinePrice field (final name from rename migration)
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'order_line' 
                        AND column_name = 'customFieldsCustomlineprice'
                    ) THEN
                        -- Check if old name exists and rename, otherwise add new
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'order_line'
                            AND column_name = 'customFieldsCustomprice'
                        ) THEN
                            ALTER TABLE "order_line" 
                            RENAME COLUMN "customFieldsCustomprice" TO "customFieldsCustomlineprice";
                        ELSE
                            ALTER TABLE "order_line" 
                            ADD COLUMN "customFieldsCustomlineprice" integer;
                        END IF;
                    END IF;

                    -- Add priceOverrideReason field
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'order_line' 
                        AND column_name = 'customFieldsPriceoverridereason'
                    ) THEN
                        -- Check if old name exists and migrate data, then rename
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'order_line'
                            AND column_name = 'customFields__priceOverrideReason'
                        ) THEN
                            ALTER TABLE "order_line" 
                            ADD COLUMN "customFieldsPriceoverridereason" character varying(255);
                            
                            UPDATE "order_line" 
                            SET "customFieldsPriceoverridereason" = "customFields__priceOverrideReason" 
                            WHERE "customFields__priceOverrideReason" IS NOT NULL;
                            
                            ALTER TABLE "order_line" 
                            DROP COLUMN "customFields__priceOverrideReason";
                        ELSE
                            ALTER TABLE "order_line" 
                            ADD COLUMN "customFieldsPriceoverridereason" character varying(255);
                        END IF;
                    END IF;

                    -- Drop old incorrectly named columns if they exist
                    ALTER TABLE "order_line" 
                    DROP COLUMN IF EXISTS "customFields__customPrice",
                    DROP COLUMN IF EXISTS "customFields__priceOverrideReason";
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
                    WHERE table_name = 'order_line'
                ) THEN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'order_line'
                        AND column_name = 'customFieldsCustomlineprice'
                    ) THEN
                        ALTER TABLE "order_line" 
                        RENAME COLUMN "customFieldsCustomlineprice" TO "customFieldsCustomprice";
                    END IF;

                    ALTER TABLE "order_line" 
                    DROP COLUMN IF EXISTS "customFieldsPriceoverridereason";
                END IF;
            END $$;
        `);
  }
}

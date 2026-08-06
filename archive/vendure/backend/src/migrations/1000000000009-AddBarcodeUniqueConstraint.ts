import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Barcode Unique Constraint (Channel-Scoped)
 *
 * Creates a unique constraint on Product.customFieldsBarcode scoped to channels.
 * Uses a trigger-based approach to enforce barcode uniqueness within each channel.
 * This allows the same barcode to exist in different channels (multi-vendor support).
 *
 * The constraint ensures:
 * - Within a channel, barcodes must be unique
 * - Different channels can have the same barcode
 * - Multiple NULL values are allowed
 * - Products without channels are allowed (validation skipped until channel assignment)
 *
 * Implementation: Creates trigger functions that check for duplicate barcodes
 * within the same channel before allowing INSERT or UPDATE operations.
 *
 * Edge Cases Handled:
 * - Products created without channels (validation deferred until channel assignment)
 * - Products assigned to multiple channels (checked across all assigned channels)
 * - NULL and empty string barcodes (allowed, no validation)
 * - Whitespace trimming (barcodes compared as-is, application layer should trim)
 */
export class AddBarcodeUniqueConstraint1000000000009 implements MigrationInterface {
    name = 'AddBarcodeUniqueConstraint1000000000009';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop existing objects if they exist (idempotent)
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS check_barcode_uniqueness_per_channel ON product;
      DROP TRIGGER IF EXISTS check_barcode_on_channel_assignment ON product_channels_channel;
      DROP FUNCTION IF EXISTS check_product_barcode_channel_unique();
      DROP FUNCTION IF EXISTS check_barcode_on_channel_assignment();
    `);

        // Create function to check barcode uniqueness within channels
        // Triggered when product barcode is inserted or updated
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION check_product_barcode_channel_unique()
      RETURNS TRIGGER AS $$
      DECLARE
        existing_product_id integer;
        product_channels integer[];
        barcode_value varchar(255);
      BEGIN
        -- Normalize barcode: trim whitespace and check if non-empty
        barcode_value := TRIM(NEW."customFieldsBarcode");
        
        -- Only validate if barcode is not NULL and not empty after trimming
        IF barcode_value IS NOT NULL AND barcode_value != '' THEN
          -- Get all channels this product belongs to
          SELECT ARRAY_AGG(DISTINCT "channelId")
          INTO product_channels
          FROM product_channels_channel
          WHERE "productId" = NEW.id;
          
          -- If product has channels assigned, check for duplicates
          IF product_channels IS NOT NULL AND array_length(product_channels, 1) > 0 THEN
            -- Check for duplicate barcode in any of these channels
            -- Use TRIM for comparison to handle whitespace consistently
            SELECT MIN(p.id)
            INTO existing_product_id
            FROM product_channels_channel pcc
            INNER JOIN product p ON p.id = pcc."productId"
            WHERE TRIM(p."customFieldsBarcode") = barcode_value
              AND p.id != NEW.id
              AND pcc."channelId" = ANY(product_channels);
            
            -- If duplicate found in same channel, raise error
            IF existing_product_id IS NOT NULL THEN
              RAISE EXCEPTION 'Barcode "%" already exists in this channel. Each barcode must be unique within a channel.', barcode_value;
            END IF;
          END IF;
          -- If product has no channels, skip validation (will be checked when channel is assigned)
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // Create function to check when products are assigned to channels
        // This handles the case where a product is created without channels, then assigned later
        await queryRunner.query(`
      CREATE OR REPLACE FUNCTION check_barcode_on_channel_assignment()
      RETURNS TRIGGER AS $$
      DECLARE
        product_barcode varchar(255);
        existing_product_id integer;
      BEGIN
        -- Get the barcode of the product being assigned to channel
        SELECT TRIM("customFieldsBarcode")
        INTO product_barcode
        FROM product
        WHERE id = NEW."productId"
          AND "customFieldsBarcode" IS NOT NULL
          AND TRIM("customFieldsBarcode") != '';
        
        -- If product has a barcode, check for duplicates in the target channel
        IF product_barcode IS NOT NULL THEN
          SELECT MIN(p.id)
          INTO existing_product_id
          FROM product_channels_channel pcc
          INNER JOIN product p ON p.id = pcc."productId"
          WHERE TRIM(p."customFieldsBarcode") = product_barcode
            AND p.id != NEW."productId"
            AND pcc."channelId" = NEW."channelId";
          
          -- If duplicate found, raise error
          IF existing_product_id IS NOT NULL THEN
            RAISE EXCEPTION 'Barcode "%" already exists in channel. Each barcode must be unique within a channel.', product_barcode;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

        // Create triggers to enforce uniqueness
        await queryRunner.query(`
      CREATE TRIGGER check_barcode_uniqueness_per_channel
      BEFORE INSERT OR UPDATE OF "customFieldsBarcode" ON product
      FOR EACH ROW
      EXECUTE FUNCTION check_product_barcode_channel_unique();
    `);

        await queryRunner.query(`
      CREATE TRIGGER check_barcode_on_channel_assignment
      BEFORE INSERT ON product_channels_channel
      FOR EACH ROW
      EXECUTE FUNCTION check_barcode_on_channel_assignment();
    `);

        // Note: We don't create an additional index on product_channels_channel because:
        // 1. The table already has indexes on "productId" and "channelId" (created by Vendure)
        // 2. PostgreSQL will use these existing indexes for the trigger queries
        // 3. Creating custom indexes on Vendure-managed tables causes TypeORM sync issues
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DROP TRIGGER IF EXISTS check_barcode_on_channel_assignment ON product_channels_channel;
      DROP TRIGGER IF EXISTS check_barcode_uniqueness_per_channel ON product;
      DROP FUNCTION IF EXISTS check_barcode_on_channel_assignment();
      DROP FUNCTION IF EXISTS check_product_barcode_channel_unique();
    `);
    }
}


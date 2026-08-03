import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Asset Relationships
 *
 * Merges:
 * - 1760710000000-CleanAssetRelationshipsFinal.js
 * - 1760720000000-FixConstraintSyntax.js
 *
 * Final state:
 * - Channel: ML model JSON/Bin/Metadata asset IDs, Company logo asset ID (all integer)
 * - PaymentMethod: Image asset ID (integer), isActive (boolean)
 * - All FK constraints with correct names and syntax
 */
export class AddChannelAssetRelationships1000000000007 implements MigrationInterface {
  name = 'AddChannelAssetRelationships1000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Channel asset relationships
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Drop old problematic columns
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodeljsonid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodelbinid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmetadataid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsCompanylogoid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlModelJsonAssetId";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlModelBinAssetId";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlMetadataAssetId";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsCompanyLogoAssetId";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodeljsonassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodelbinassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmetadataassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsCompanylogoassetid";

                    -- Drop old constraints
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_209b14074b96d505fce431f7841";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_30369133482d7e7f8759cb833e5";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_8e0c8b4ebd7bbc9eee0aeb1db25";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_33e2e4ec9896bb0edf7bdab0cbc";

                    -- Add clean asset relationship columns
                    ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmodeljsonassetid" integer;
                    ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmodelbinassetid" integer;
                    ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsMlmetadataassetid" integer;
                    ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsCompanylogoassetid" integer;

                    -- Add foreign key constraints
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'FK_209b14074b96d505fce431f7841'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD CONSTRAINT "FK_209b14074b96d505fce431f7841" 
                        FOREIGN KEY ("customFieldsMlmodeljsonassetid") 
                        REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'FK_30369133482d7e7f8759cb833e5'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD CONSTRAINT "FK_30369133482d7e7f8759cb833e5" 
                        FOREIGN KEY ("customFieldsMlmodelbinassetid") 
                        REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'FK_8e0c8b4ebd7bbc9eee0aeb1db25'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD CONSTRAINT "FK_8e0c8b4ebd7bbc9eee0aeb1db25" 
                        FOREIGN KEY ("customFieldsMlmetadataassetid") 
                        REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'FK_33e2e4ec9896bb0edf7bdab0cbc'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD CONSTRAINT "FK_33e2e4ec9896bb0edf7bdab0cbc" 
                        FOREIGN KEY ("customFieldsCompanylogoassetid") 
                        REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                    END IF;
                END IF;

                -- PaymentMethod asset relationships
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'payment_method'
                ) THEN
                    -- Drop old problematic columns
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsIcon";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsImage";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsImageassetid";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsImageAssetId";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsDisplayorder";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsIsactive";

                    -- Drop old constraint
                    ALTER TABLE "payment_method" DROP CONSTRAINT IF EXISTS "FK_d8b49b563010113ffef086b8809";

                    -- Add clean asset relationship column
                    ALTER TABLE "payment_method" ADD COLUMN IF NOT EXISTS "customFieldsImageassetid" integer;
                    
                    -- Add non-relational field to prevent Vendure workaround
                    ALTER TABLE "payment_method" ADD COLUMN IF NOT EXISTS "customFieldsIsactive" boolean DEFAULT true;

                    -- Add foreign key constraint
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint 
                        WHERE conname = 'FK_d8b49b563010113ffef086b8809'
                    ) THEN
                        ALTER TABLE "payment_method" 
                        ADD CONSTRAINT "FK_d8b49b563010113ffef086b8809" 
                        FOREIGN KEY ("customFieldsImageassetid") 
                        REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
                    END IF;
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
                    WHERE table_name = 'payment_method'
                ) THEN
                    ALTER TABLE "payment_method" DROP CONSTRAINT IF EXISTS "FK_d8b49b563010113ffef086b8809";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsIsactive";
                    ALTER TABLE "payment_method" DROP COLUMN IF EXISTS "customFieldsImageassetid";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_33e2e4ec9896bb0edf7bdab0cbc";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_8e0c8b4ebd7bbc9eee0aeb1db25";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_30369133482d7e7f8759cb833e5";
                    ALTER TABLE "channel" DROP CONSTRAINT IF EXISTS "FK_209b14074b96d505fce431f7841";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsCompanylogoassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmetadataassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodelbinassetid";
                    ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsMlmodeljsonassetid";
                END IF;
            END $$;
        `);
  }
}

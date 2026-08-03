import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Approval Field
 *
 * Merges:
 * - 1766000700000-AddChannelApprovalField.ts
 *
 * Final state:
 * - Channel: customFieldsStatus (character varying, NOT NULL, DEFAULT 'UNAPPROVED')
 * - Channel: NO customFieldsIsapproved (replaced by status)
 */
export class AddChannelApprovalField1000000000006 implements MigrationInterface {
  name = 'AddChannelApprovalField1000000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Add status field if it doesn't exist
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsStatus'
                    ) THEN
                        ALTER TABLE "channel" 
                        ADD COLUMN "customFieldsStatus" character varying(255);
                    END IF;

                    -- Migrate data from old isApproved field if it exists
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsIsapproved'
                    ) THEN
                        UPDATE "channel" 
                        SET "customFieldsStatus" = CASE 
                            WHEN "customFieldsIsapproved" = true THEN 'APPROVED'
                            ELSE 'UNAPPROVED'
                        END
                        WHERE "customFieldsStatus" IS NULL;
                        
                        ALTER TABLE "channel" 
                        DROP COLUMN IF EXISTS "customFieldsIsapproved";
                    END IF;
                    
                    -- Set default for any remaining NULL values
                    UPDATE "channel" 
                    SET "customFieldsStatus" = 'UNAPPROVED'
                    WHERE "customFieldsStatus" IS NULL;
                    
                    -- Set default value
                    ALTER TABLE "channel" 
                    ALTER COLUMN "customFieldsStatus" SET DEFAULT 'UNAPPROVED';
                    
                    -- Make it NOT NULL if currently nullable
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' 
                        AND column_name = 'customFieldsStatus'
                        AND is_nullable = 'YES'
                    ) THEN
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsStatus" SET NOT NULL;
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
                    WHERE table_name = 'channel'
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'channel' AND column_name = 'customFieldsStatus'
                ) THEN
                    -- Convert status back to isApproved boolean
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsIsapproved" boolean;
                    
                    UPDATE "channel" 
                    SET "customFieldsIsapproved" = CASE 
                        WHEN "customFieldsStatus" = 'APPROVED' THEN true
                        ELSE false
                    END
                    WHERE "customFieldsIsapproved" IS NULL;
                    
                    UPDATE "channel" 
                    SET "customFieldsIsapproved" = false
                    WHERE "customFieldsIsapproved" IS NULL;
                    
                    ALTER TABLE "channel" 
                    ALTER COLUMN "customFieldsIsapproved" SET DEFAULT false;
                    
                    ALTER TABLE "channel" 
                    ALTER COLUMN "customFieldsIsapproved" SET NOT NULL;
                    
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsStatus";
                END IF;
            END $$;
        `);
  }
}

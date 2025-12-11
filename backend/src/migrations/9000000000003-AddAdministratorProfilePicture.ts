import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Administrator Profile Picture Custom Field
 *
 * Adds profilePicture relation field to Administrator entity.
 * Follows the pattern from AddChannelAssetRelationships for relational custom fields.
 */
export class AddAdministratorProfilePicture9000000000003 implements MigrationInterface {
  name = 'AddAdministratorProfilePicture9000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Only add columns - let Vendure/TypeORM handle FK constraint creation automatically
    // The FK constraint name is auto-generated and differs between environments
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Administrator profile picture relationship
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'administrator'
                ) THEN
                    -- Drop any manually created constraint from previous bad migrations
                    ALTER TABLE "administrator" DROP CONSTRAINT IF EXISTS "FK_administrator_profile_picture_asset";

                    -- Add profile picture asset relationship column
                    ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "customFieldsProfilepictureid" integer;

                    -- Add workaround column required by Vendure when only relational custom fields exist
                    ALTER TABLE "administrator" ADD COLUMN IF NOT EXISTS "customFields__fix_relational_custom_fields__" boolean;
                    COMMENT ON COLUMN "administrator"."customFields__fix_relational_custom_fields__" IS 'A work-around needed when only relational custom fields are defined on an entity';

                    -- NOTE: FK constraint will be created automatically by TypeORM/Vendure on server startup
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
                    WHERE table_name = 'administrator'
                ) THEN
                    ALTER TABLE "administrator" DROP CONSTRAINT IF EXISTS "FK_29cfdde44013ec39bbc39a64783";
                    ALTER TABLE "administrator" DROP COLUMN IF EXISTS "customFields__fix_relational_custom_fields__";
                    ALTER TABLE "administrator" DROP COLUMN IF EXISTS "customFieldsProfilepictureid";
                END IF;
            END $$;
        `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Order reversal custom fields
 *
 * Final state:
 * - Order: reversedAt (datetime), reversedByUserId (relation to User)
 */
export class AddOrderReversalFields1000000000012 implements MigrationInterface {
  name = 'AddOrderReversalFields1000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsReversedat" timestamp;

                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsReversedbyuseridid" integer;
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
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFieldsReversedat";
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFieldsReversedbyuseridid";
                END IF;
            END $$;
        `);
  }
}

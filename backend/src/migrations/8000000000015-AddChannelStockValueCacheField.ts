import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Stock Value Cache field
 *
 * Adds stockValueCache for caching stock value stats (retail, wholesale, cost) per channel.
 * Column type must match Vendure CustomFieldType: type 'text' -> PostgreSQL "text"
 * (see https://docs.vendure.io/reference/typescript-api/custom-fields/custom-field-type).
 */
export class AddChannelStockValueCacheField8000000000015 implements MigrationInterface {
  name = 'AddChannelStockValueCacheField8000000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsStockvaluecache" text;
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
        ) THEN
          ALTER TABLE "channel"
          DROP COLUMN IF EXISTS "customFieldsStockvaluecache";
        END IF;
      END $$;
    `);
  }
}

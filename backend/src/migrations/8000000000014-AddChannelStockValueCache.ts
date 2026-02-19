import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Stock Value Cache field
 *
 * Adds stockValueCache (TEXT NULL) for caching stock value stats (retail, wholesale, cost) per channel.
 */
export class AddChannelStockValueCache8000000000014 implements MigrationInterface {
  name = 'AddChannelStockValueCache8000000000014';

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

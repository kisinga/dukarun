import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove Channel cashierOpen field
 *
 * Drops the customFieldsCashieropen column from channel.
 * Shift-open state is now derived solely from open cashier_session rows.
 */
export class RemoveChannelCashierOpen9000000000005 implements MigrationInterface {
  name = 'RemoveChannelCashierOpen9000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'channel' AND column_name = 'customFieldsCashieropen'
        ) THEN
          ALTER TABLE "channel" DROP COLUMN "customFieldsCashieropen";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsCashieropen" boolean NOT NULL DEFAULT false;
        END IF;
      END $$;
    `);
  }
}

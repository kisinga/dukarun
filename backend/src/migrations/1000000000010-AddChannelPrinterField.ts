import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Printer Field
 *
 * Adds enablePrinter custom field to the Channel table to control
 * visibility of "Complete & Print" button at checkout.
 *
 * Default: true (printer functionality enabled for all channels)
 */
export class AddChannelPrinterField1000000000010 implements MigrationInterface {
  name = 'AddChannelPrinterField1000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Add enablePrinter field to Channel
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel" 
          ADD COLUMN IF NOT EXISTS "customFieldsEnableprinter" boolean NOT NULL DEFAULT true;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Remove enablePrinter field from Channel
        IF EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'channel'
        ) THEN
          ALTER TABLE "channel" 
          DROP COLUMN IF EXISTS "customFieldsEnableprinter";
        END IF;
      END $$;
    `);
  }
}

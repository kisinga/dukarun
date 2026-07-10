import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add platform-wide communication channel toggles to GlobalSettings and align
 * order.customFieldsReconciliationnote with the custom field metadata (text).
 */
export class AddCommunicationChannelsAndAlignReconciliationNote1000000000016 implements MigrationInterface {
  name = 'AddCommunicationChannelsAndAlignReconciliationNote1000000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Communication channel toggles
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" ADD COLUMN IF NOT EXISTS "customFieldsCommunicationchannels" text;

          UPDATE "global_settings"
            SET "customFieldsCommunicationchannels" = '{"sms":true,"email":true,"whatsapp":true}'
            WHERE ("customFieldsCommunicationchannels" IS NULL OR "customFieldsCommunicationchannels" = '')
              AND id = (SELECT id FROM global_settings ORDER BY id LIMIT 1);
        END IF;

        -- Align reconciliationNote column with custom field metadata (type: 'text')
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order') THEN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'order'
              AND column_name = 'customFieldsReconciliationnote'
              AND data_type = 'character varying'
          ) THEN
            ALTER TABLE "order" ALTER COLUMN "customFieldsReconciliationnote" TYPE text;
          END IF;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
          ALTER TABLE "global_settings" DROP COLUMN IF EXISTS "customFieldsCommunicationchannels";
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order') THEN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'order'
              AND column_name = 'customFieldsReconciliationnote'
              AND data_type = 'text'
          ) THEN
            ALTER TABLE "order" ALTER COLUMN "customFieldsReconciliationnote" TYPE character varying(255);
          END IF;
        END IF;
      END $$;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align customFieldsReconciliationnote with Vendure entity metadata.
 *
 * Migration 9990000000000 created this column as `text`, matching the
 * `type: 'text'` custom-field definition. If an environment temporarily held
 * `character varying(255)`, this migration idempotently coerces the column back
 * to `text` so the schema matches the current configuration.
 */
export class AlignOrderReconciliationNoteColumn9990000000001 implements MigrationInterface {
  name = 'AlignOrderReconciliationNoteColumn9990000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'order'
            AND column_name = 'customFieldsReconciliationnote'
            AND data_type = 'character varying'
        ) THEN
          ALTER TABLE "order"
          ALTER COLUMN "customFieldsReconciliationnote" TYPE text;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'order'
            AND column_name = 'customFieldsReconciliationnote'
            AND data_type = 'text'
        ) THEN
          ALTER TABLE "order"
          ALTER COLUMN "customFieldsReconciliationnote" TYPE character varying(255);
        END IF;
      END $$;
    `);
  }
}

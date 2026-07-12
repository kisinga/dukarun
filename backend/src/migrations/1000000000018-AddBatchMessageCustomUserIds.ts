import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add customUserIds column to batch_message for CUSTOM_USER_IDS audience persistence.
 */
export class AddBatchMessageCustomUserIds1000000000018 implements MigrationInterface {
  name = 'AddBatchMessageCustomUserIds1000000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batch_message"
      ADD COLUMN IF NOT EXISTS "customUserIds" jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "batch_message"
      DROP COLUMN IF EXISTS "customUserIds";
    `);
  }
}

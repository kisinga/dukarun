import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add optional rejectionReasonCode to approval_request for structured rejection reasons.
 */
export class AddApprovalRequestRejectionReasonCode9000000000012 implements MigrationInterface {
  name = 'AddApprovalRequestRejectionReasonCode9000000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "approval_request"
      ADD COLUMN IF NOT EXISTS "rejectionReasonCode" varchar(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "approval_request"
      DROP COLUMN IF EXISTS "rejectionReasonCode"
    `);
  }
}

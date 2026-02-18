import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add optional dueAt to approval_request for SLA/reminder support.
 * A future scheduler can query pending requests where dueAt < now() or dueAt within next N hours.
 */
export class AddApprovalRequestDueAt9000000000013 implements MigrationInterface {
  name = 'AddApprovalRequestDueAt9000000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "approval_request"
      ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "approval_request"
      DROP COLUMN IF EXISTS "dueAt"
    `);
  }
}

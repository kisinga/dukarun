import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the legacy smsLimit column from subscription_tier.
 * Limits now live in the JSONB `limits` column (limits.smsPerPeriod).
 */
export class DropSubscriptionTierSmsLimit1000000000020 implements MigrationInterface {
  name = 'DropSubscriptionTierSmsLimit1000000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_tier"
      DROP COLUMN IF EXISTS "smsLimit";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_tier"
      ADD COLUMN IF NOT EXISTS "smsLimit" int DEFAULT 0;
    `);
  }
}

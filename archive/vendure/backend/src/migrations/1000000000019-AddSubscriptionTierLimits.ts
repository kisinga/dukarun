import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add limits JSONB column to subscription_tier and backfill smsLimit into limits.smsPerPeriod.
 */
export class AddSubscriptionTierLimits1000000000019 implements MigrationInterface {
  name = 'AddSubscriptionTierLimits1000000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_tier"
      ADD COLUMN IF NOT EXISTS "limits" jsonb;
    `);

    await queryRunner.query(`
      UPDATE "subscription_tier"
      SET "limits" = jsonb_build_object('smsPerPeriod', "smsLimit")
      WHERE "limits" IS NULL
        AND "smsLimit" IS NOT NULL
        AND "smsLimit" > 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_tier"
      DROP COLUMN IF EXISTS "limits";
    `);
  }
}

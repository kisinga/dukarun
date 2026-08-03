import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add SMS limit to SubscriptionTier and SMS usage tracking to Channel.
 *
 * - subscription_tier.smsLimit: max SMS credits per channel per 30-day period (synced with subscription expiry).
 * - channel.customFields.smsUsedThisPeriod: count of SMS sent in current period.
 * - channel.customFields.smsPeriodEnd: end of current period (aligned with subscriptionExpiresAt/trialEndsAt).
 */
export class AddSmsLimitAndChannelSmsUsage1000000000013 implements MigrationInterface {
  name = 'AddSmsLimitAndChannelSmsUsage1000000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add smsLimit to subscription_tier
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_tier') THEN
          ALTER TABLE "subscription_tier"
          ADD COLUMN IF NOT EXISTS "smsLimit" integer DEFAULT 0;
        END IF;
      END $$;
    `);

    // Add Channel custom fields for SMS usage (Vendure normalizes to customFieldsSmsusedthisperiod, customFieldsSmsperiodend)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSmsusedthisperiod" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel"
          ADD COLUMN IF NOT EXISTS "customFieldsSmsperiodend" TIMESTAMP;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'channel') THEN
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsSmsperiodend";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsSmsusedthisperiod";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscription_tier') THEN
          ALTER TABLE "subscription_tier" DROP COLUMN IF EXISTS "smsLimit";
        END IF;
      END $$;
    `);
  }
}

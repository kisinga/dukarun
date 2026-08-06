import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Subscription Expired Reminder Field
 *
 * Adds subscriptionExpiredReminderSentAt custom field to Channel entity for tracking
 * when the last subscription expired reminder was sent. Used to prevent sending
 * reminders more frequently than once every 7 days.
 */
export class AddSubscriptionExpiredReminderField1000000000009 implements MigrationInterface {
  name = 'AddSubscriptionExpiredReminderField1000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Add subscriptionExpiredReminderSentAt field to Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionexpiredremindersentat" TIMESTAMP;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Remove subscriptionExpiredReminderSentAt field from Channel
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsSubscriptionexpiredremindersentat";
                END IF;
            END $$;
        `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop unused action tracking custom fields from Channel.
 *
 * These 22 actionCount* fields and 2 actionTracking* fields were defined
 * in vendure-config but never read or written by any service.
 * Removing them to reduce schema bloat and improve Channel query performance.
 */
export class DropUnusedActionTrackingFields9500000000001 implements MigrationInterface {
  name = 'DropUnusedActionTrackingFields9500000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'channel'
        ) THEN
          -- Action Tracking - AUTHENTICATION
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountauthotp";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountauthtotal";

          -- Action Tracking - CUSTOMER_COMMUNICATION
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountcommcustomercreated";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountcommcreditapproved";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountcommbalancechanged";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountcommrepaymentdeadline";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountcommtotal";

          -- Action Tracking - SYSTEM_NOTIFICATIONS
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysorderpaymentsettled";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysorderfulfilled";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysordercancelled";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysstocklowalert";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingstarted";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingprogress";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingcompleted";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingfailed";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsyspaymentconfirmed";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysadmincreated";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysadminupdated";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysusercreated";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsysuserupdated";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncountsystotal";

          -- Action Tracking - GLOBAL
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActioncounttotal";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActiontrackinglastresetdate";
          ALTER TABLE "channel" DROP COLUMN IF EXISTS "customFieldsActiontrackingresettype";
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'channel'
        ) THEN
          -- Re-add AUTHENTICATION fields
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountauthotp" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountauthtotal" integer NOT NULL DEFAULT 0;

          -- Re-add CUSTOMER_COMMUNICATION fields
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommcustomercreated" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommcreditapproved" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommbalancechanged" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommrepaymentdeadline" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommtotal" integer NOT NULL DEFAULT 0;

          -- Re-add SYSTEM_NOTIFICATIONS fields
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysorderpaymentsettled" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysorderfulfilled" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysordercancelled" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysstocklowalert" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingstarted" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingprogress" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingcompleted" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingfailed" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsyspaymentconfirmed" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysadmincreated" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysadminupdated" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysusercreated" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysuserupdated" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncountsystotal" integer NOT NULL DEFAULT 0;

          -- Re-add GLOBAL fields
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActioncounttotal" integer NOT NULL DEFAULT 0;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActiontrackinglastresetdate" TIMESTAMP;
          ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "customFieldsActiontrackingresettype" character varying(255) NOT NULL DEFAULT 'monthly';
        END IF;
      END $$;
    `);
  }
}

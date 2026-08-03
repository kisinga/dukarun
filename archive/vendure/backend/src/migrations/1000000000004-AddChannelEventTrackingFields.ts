import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Event Tracking Fields
 *
 * Merges:
 * - 1763000000000-AddChannelEventTrackingFields.ts
 * - 1763100000000-RenameChannelEventColumnsToCamelCase.ts
 * - 1763200000000-FixActionTrackingResetTypeColumn.ts
 *
 * Final state:
 * - Channel: All event tracking fields with correct camelCase naming
 * - Channel: actionTrackingResetType with correct type and constraints
 * - User: notificationPreferences
 */
export class AddChannelEventTrackingFields1000000000004 implements MigrationInterface {
  name = 'AddChannelEventTrackingFields1000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Add eventConfig field
                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsEventconfig" text;

                    -- AUTHENTICATION category fields (with rename handling)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountauthotp'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountauthotp'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountauthotp" TO "customFieldsActioncountauthotp";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountauthtotal'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountauthtotal'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountauthtotal" TO "customFieldsActioncountauthtotal";
                    END IF;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountauthotp" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountauthtotal" integer NOT NULL DEFAULT 0;

                    -- CUSTOMER_COMMUNICATION category fields (with rename handling)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountcommcustomercreated'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountcommcustomercreated'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountcommcustomercreated" TO "customFieldsActioncountcommcustomercreated";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountcommcreditapproved'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountcommcreditapproved'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountcommcreditapproved" TO "customFieldsActioncountcommcreditapproved";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountcommbalancechanged'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountcommbalancechanged'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountcommbalancechanged" TO "customFieldsActioncountcommbalancechanged";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountcommrepaymentdeadline'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountcommrepaymentdeadline'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountcommrepaymentdeadline" TO "customFieldsActioncountcommrepaymentdeadline";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountcommtotal'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountcommtotal'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountcommtotal" TO "customFieldsActioncountcommtotal";
                    END IF;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommcustomercreated" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommcreditapproved" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommbalancechanged" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommrepaymentdeadline" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountcommtotal" integer NOT NULL DEFAULT 0;

                    -- SYSTEM_NOTIFICATIONS category fields (with rename handling)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysorderpaymentsettled'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysorderpaymentsettled'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysorderpaymentsettled" TO "customFieldsActioncountsysorderpaymentsettled";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysorderfulfilled'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysorderfulfilled'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysorderfulfilled" TO "customFieldsActioncountsysorderfulfilled";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysordercancelled'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysordercancelled'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysordercancelled" TO "customFieldsActioncountsysordercancelled";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysstocklowalert'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysstocklowalert'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysstocklowalert" TO "customFieldsActioncountsysstocklowalert";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysmltrainingstarted'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysmltrainingstarted'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysmltrainingstarted" TO "customFieldsActioncountsysmltrainingstarted";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysmltrainingprogress'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysmltrainingprogress'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysmltrainingprogress" TO "customFieldsActioncountsysmltrainingprogress";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysmltrainingcompleted'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysmltrainingcompleted'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysmltrainingcompleted" TO "customFieldsActioncountsysmltrainingcompleted";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysmltrainingfailed'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysmltrainingfailed'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysmltrainingfailed" TO "customFieldsActioncountsysmltrainingfailed";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsyspaymentconfirmed'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsyspaymentconfirmed'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsyspaymentconfirmed" TO "customFieldsActioncountsyspaymentconfirmed";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysadmincreated'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysadmincreated'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysadmincreated" TO "customFieldsActioncountsysadmincreated";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysadminupdated'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysadminupdated'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysadminupdated" TO "customFieldsActioncountsysadminupdated";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysusercreated'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysusercreated'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysusercreated" TO "customFieldsActioncountsysusercreated";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsysuserupdated'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsysuserupdated'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsysuserupdated" TO "customFieldsActioncountsysuserupdated";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncountsystotal'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncountsystotal'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncountsystotal" TO "customFieldsActioncountsystotal";
                    END IF;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysorderpaymentsettled" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysorderfulfilled" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysordercancelled" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysstocklowalert" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingstarted" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingprogress" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingcompleted" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysmltrainingfailed" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsyspaymentconfirmed" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysadmincreated" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysadminupdated" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysusercreated" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsysuserupdated" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncountsystotal" integer NOT NULL DEFAULT 0;

                    -- Global tracking fields (with rename handling)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactioncounttotal'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActioncounttotal'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactioncounttotal" TO "customFieldsActioncounttotal";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactiontrackinglastresetdate'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActiontrackinglastresetdate'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactiontrackinglastresetdate" TO "customFieldsActiontrackinglastresetdate";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsactiontrackingresettype'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActiontrackingresettype'
                    ) THEN
                        ALTER TABLE "channel" RENAME COLUMN "customFieldsactiontrackingresettype" TO "customFieldsActiontrackingresettype";
                    END IF;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActioncounttotal" integer NOT NULL DEFAULT 0;

                    ALTER TABLE "channel"
                    ADD COLUMN IF NOT EXISTS "customFieldsActiontrackinglastresetdate" TIMESTAMP;

                    -- Fix actionTrackingResetType with correct type and constraints
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsActiontrackingresettype'
                    ) THEN
                        ALTER TABLE "channel"
                        ADD COLUMN "customFieldsActiontrackingresettype" character varying(255) NOT NULL DEFAULT 'monthly';
                    ELSE
                        -- Ensure correct type and constraints
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsActiontrackingresettype" 
                        TYPE character varying(255);
                        
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsActiontrackingresettype" 
                        SET NOT NULL;
                        
                        ALTER TABLE "channel" 
                        ALTER COLUMN "customFieldsActiontrackingresettype" 
                        SET DEFAULT 'monthly';
                    END IF;
                END IF;

                -- Add notificationPreferences to user table
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'user'
                ) THEN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'user' AND column_name = 'customFieldsnotificationpreferences'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'user' AND column_name = 'customFieldsNotificationpreferences'
                    ) THEN
                        ALTER TABLE "user" RENAME COLUMN "customFieldsnotificationpreferences" TO "customFieldsNotificationpreferences";
                    END IF;

                    ALTER TABLE "user"
                    ADD COLUMN IF NOT EXISTS "customFieldsNotificationpreferences" text;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'user'
                ) THEN
                    ALTER TABLE "user"
                    DROP COLUMN IF EXISTS "customFieldsNotificationpreferences";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActiontrackingresettype";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActiontrackinglastresetdate";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncounttotal";

                    -- Remove SYSTEM_NOTIFICATIONS fields
                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsystotal";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysuserupdated";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysusercreated";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysadminupdated";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysadmincreated";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsyspaymentconfirmed";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingfailed";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingcompleted";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingprogress";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysmltrainingstarted";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysstocklowalert";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysordercancelled";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysorderfulfilled";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountsysorderpaymentsettled";

                    -- Remove CUSTOMER_COMMUNICATION fields
                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountcommtotal";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountcommrepaymentdeadline";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountcommbalancechanged";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountcommcreditapproved";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountcommcustomercreated";

                    -- Remove AUTHENTICATION fields
                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountauthtotal";

                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsActioncountauthotp";

                    -- Remove eventConfig
                    ALTER TABLE "channel"
                    DROP COLUMN IF EXISTS "customFieldsEventconfig";
                END IF;
            END $$;
        `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add Channel Subscription Fields
 *
 * Merges:
 * - 1761900000000-AddSubscriptionFields.ts
 * - 1761900000001-RenameSubscriptionTierColumn.ts
 * - 1761900000002-NormalizeSubscriptionTierColumn.ts
 * - 1761900000003-NormalizeSubscriptionFieldsCasing.ts
 * - 1761900000004-AlignSubscriptionTierConstraints.ts
 * - 1761900000005-UpdateSubscriptionFkActions.ts
 *
 * Final state:
 * - subscription_tier table with createdAt, updatedAt
 * - Channel: All subscription fields with normalized naming (customFieldsSubscriptiontierid)
 * - FK constraint: FK_cfa828418e58de180707fd03e1a with ON DELETE NO ACTION
 * - Unique constraint: UQ_f4afafa5c0e63ab4eb176ac22f8 on subscription_tier.code
 */
export class AddChannelSubscriptionFields1000000000005 implements MigrationInterface {
  name = 'AddChannelSubscriptionFields1000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create subscription_tier table
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "subscription_tier" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying NOT NULL,
                "name" character varying NOT NULL,
                "description" text,
                "priceMonthly" integer NOT NULL,
                "priceYearly" integer NOT NULL,
                "features" jsonb,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_subscription_tier" PRIMARY KEY ("id")
            )
        `);

    // Add unique constraint on code
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'UQ_f4afafa5c0e63ab4eb176ac22f8'
                ) THEN
                    ALTER TABLE "subscription_tier" 
                    ADD CONSTRAINT "UQ_f4afafa5c0e63ab4eb176ac22f8" UNIQUE ("code");
                END IF;
            END $$;
        `);

    // Add Channel subscription fields with table existence check
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) THEN
                    -- Handle column name normalization (check for various possible names)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionTierId'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptiontierid'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsSubscriptionTierId" TO "customFieldsSubscriptiontierid";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptiontieridid'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptiontierid'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsSubscriptiontieridid" TO "customFieldsSubscriptiontierid";
                    END IF;

                    -- Add subscription fields with normalized names
                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSubscriptiontierid" uuid;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionstatus" character varying NOT NULL DEFAULT 'trial';

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsTrialendsat" TIMESTAMP;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionstartedat" TIMESTAMP;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsSubscriptionexpiresat" TIMESTAMP;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsBillingcycle" character varying;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsPaystackcustomercode" character varying;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsPaystacksubscriptioncode" character varying;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsLastpaymentdate" TIMESTAMP;

                    ALTER TABLE "channel" 
                    ADD COLUMN IF NOT EXISTS "customFieldsLastpaymentamount" integer;

                    -- Handle field name normalization (camelCase to lowercase)
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionStatus'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionstatus'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsSubscriptionStatus" TO "customFieldsSubscriptionstatus";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsTrialEndsAt'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsTrialendsat'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsTrialEndsAt" TO "customFieldsTrialendsat";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionStartedAt'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionstartedat'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsSubscriptionStartedAt" TO "customFieldsSubscriptionstartedat";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionExpiresAt'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsSubscriptionexpiresat'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsSubscriptionExpiresAt" TO "customFieldsSubscriptionexpiresat";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsBillingCycle'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsBillingcycle'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsBillingCycle" TO "customFieldsBillingcycle";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsPaystackCustomerCode'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsPaystackcustomercode'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsPaystackCustomerCode" TO "customFieldsPaystackcustomercode";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsPaystackSubscriptionCode'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsPaystacksubscriptioncode'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsPaystackSubscriptionCode" TO "customFieldsPaystacksubscriptioncode";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsLastPaymentDate'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsLastpaymentdate'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsLastPaymentDate" TO "customFieldsLastpaymentdate";
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsLastPaymentAmount'
                    ) AND NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'channel' AND column_name = 'customFieldsLastpaymentamount'
                    ) THEN
                        ALTER TABLE "channel"
                        RENAME COLUMN "customFieldsLastPaymentAmount" TO "customFieldsLastpaymentamount";
                    END IF;

                    -- Drop old FK constraints if they exist
                    ALTER TABLE "channel" 
                    DROP CONSTRAINT IF EXISTS "FK_channel_subscription_tier";

                    -- Ensure FK constraint exists with correct name and action
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.constraint_column_usage
                        WHERE constraint_name = 'FK_cfa828418e58de180707fd03e1a'
                        AND table_name = 'channel'
                        AND column_name = 'customFieldsSubscriptiontierid'
                    ) THEN
                        -- Drop conflicting constraint if it exists but targets wrong column
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint con
                            JOIN pg_class rel ON rel.oid = con.conrelid
                            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                            WHERE con.conname = 'FK_cfa828418e58de180707fd03e1a'
                            AND nsp.nspname = current_schema()
                            AND rel.relname = 'channel'
                        ) AND NOT EXISTS (
                            SELECT 1 FROM information_schema.constraint_column_usage
                            WHERE constraint_name = 'FK_cfa828418e58de180707fd03e1a'
                            AND table_name = 'channel'
                            AND column_name = 'customFieldsSubscriptiontierid'
                        ) THEN
                            ALTER TABLE "channel"
                            DROP CONSTRAINT "FK_cfa828418e58de180707fd03e1a";
                        END IF;

                        ALTER TABLE "channel"
                        ADD CONSTRAINT "FK_cfa828418e58de180707fd03e1a"
                        FOREIGN KEY ("customFieldsSubscriptiontierid")
                        REFERENCES "subscription_tier"("id")
                        ON DELETE NO ACTION
                        ON UPDATE NO ACTION;
                    END IF;
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
                    WHERE table_name = 'channel'
                ) THEN
                    ALTER TABLE "channel" 
                    DROP CONSTRAINT IF EXISTS "FK_cfa828418e58de180707fd03e1a";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsLastpaymentamount";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsLastpaymentdate";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsPaystacksubscriptioncode";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsPaystackcustomercode";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsBillingcycle";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsSubscriptionexpiresat";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsSubscriptionstartedat";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsTrialendsat";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsSubscriptionstatus";

                    ALTER TABLE "channel" 
                    DROP COLUMN IF EXISTS "customFieldsSubscriptiontierid";
                END IF;
            END $$;
        `);

    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_tier"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add User Authorization Fields
 *
 * Merges:
 * - 1761800000000-AddUserAuthorizationField.ts
 * - 1763047440205-AddAuditUserTrackingFields.ts
 *
 * Final state:
 * - User: authorizationStatus
 * - Order: createdByUserId, lastModifiedByUserId, auditCreatedAt
 * - Payment: addedByUserId, auditCreatedAt
 * - Customer: creditApprovedByUserId
 * - All FK constraints for user tracking fields
 */
export class AddUserAuthorizationFields3000000000000 implements MigrationInterface {
  name = 'AddUserAuthorizationFields3000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add user authorization status
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'user'
                ) THEN
                    ALTER TABLE "user" 
                    ADD COLUMN IF NOT EXISTS "customFieldsAuthorizationstatus" character varying(255) NOT NULL DEFAULT 'PENDING';

                    -- Update existing users to APPROVED status
                    UPDATE "user" 
                    SET "customFieldsAuthorizationstatus" = 'APPROVED' 
                    WHERE "customFieldsAuthorizationstatus" = 'PENDING' OR "customFieldsAuthorizationstatus" IS NULL;
                END IF;
            END $$;
        `);

    // Add Order audit tracking fields
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCreatedbyuseridid" integer;

                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsLastmodifiedbyuseridid" integer;

                    ALTER TABLE "order" 
                    ADD COLUMN IF NOT EXISTS "customFieldsAuditcreatedat" timestamp;

                    -- Drop workaround columns if they exist
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFields__fix_relational_custom_fields__";

                    -- FK constraints are not created here - they should be defined in entities
                    -- with @ManyToOne decorator if needed. TypeORM will create them automatically.
                    -- This prevents schema mismatches and avoids needing CleanupLegacyConstraints.
                END IF;
            END $$;
        `);

    // Add Payment audit tracking fields
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'payment'
                ) THEN
                    ALTER TABLE "payment" 
                    ADD COLUMN IF NOT EXISTS "customFieldsAddedbyuseridid" integer;

                    ALTER TABLE "payment" 
                    ADD COLUMN IF NOT EXISTS "customFieldsAuditcreatedat" timestamp;

                    -- Drop workaround columns if they exist
                    ALTER TABLE "payment" 
                    DROP COLUMN IF EXISTS "customFields__fix_relational_custom_fields__";

                    -- FK constraint is not created here - should be defined in entity with @ManyToOne
                    -- if needed. TypeORM will create it automatically.
                    -- This prevents schema mismatches and avoids needing CleanupLegacyConstraints.
                END IF;
            END $$;
        `);

    // Add Customer credit approval tracking
    await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer" 
                    ADD COLUMN IF NOT EXISTS "customFieldsCreditapprovedbyuseridid" integer;

                    -- FK constraint is not created here - should be defined in entity with @ManyToOne
                    -- if needed. TypeORM will create it automatically.
                    -- This prevents schema mismatches and avoids needing CleanupLegacyConstraints.
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
                    WHERE table_name = 'customer'
                ) THEN
                    ALTER TABLE "customer" 
                    DROP CONSTRAINT IF EXISTS "FK_customer_credit_approved_by_user";
                    ALTER TABLE "customer" 
                    DROP COLUMN IF EXISTS "customFieldsCreditapprovedbyuseridid";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'payment'
                ) THEN
                    ALTER TABLE "payment" 
                    DROP CONSTRAINT IF EXISTS "FK_payment_added_by_user";
                    ALTER TABLE "payment" 
                    DROP COLUMN IF EXISTS "customFieldsAuditcreatedat";
                    ALTER TABLE "payment" 
                    DROP COLUMN IF EXISTS "customFieldsAddedbyuseridid";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'order'
                ) THEN
                    ALTER TABLE "order" 
                    DROP CONSTRAINT IF EXISTS "FK_order_last_modified_by_user";
                    ALTER TABLE "order" 
                    DROP CONSTRAINT IF EXISTS "FK_order_created_by_user";
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFieldsAuditcreatedat";
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFieldsLastmodifiedbyuseridid";
                    ALTER TABLE "order" 
                    DROP COLUMN IF EXISTS "customFieldsCreatedbyuseridid";
                END IF;

                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'user'
                ) THEN
                    ALTER TABLE "user" 
                    DROP COLUMN IF EXISTS "customFieldsAuthorizationstatus";
                END IF;
            END $$;
        `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Audit Log Table
 *
 * Merges:
 * - 1764000000000-DropOldAuditLog.ts
 * - 1764000100000-CreateAuditLogTable.ts
 * - 1764000050000-DropFixRelationalCustomFields.ts (workaround columns already handled in Phase 3)
 *
 * Final state:
 * - audit_log table created with proper schema
 * - All indexes created
 * - Old audit_log table dropped if exists
 */
export class CreateAuditLogTable4000000000000 implements MigrationInterface {
  name = 'CreateAuditLogTable4000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old audit_log table if it exists
    await queryRunner.query(`
            DO $$
            BEGIN
                -- Drop hypertable if it exists (TimescaleDB)
                BEGIN
                    PERFORM drop_hypertable('audit_log', if_exists => true);
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                    WHEN OTHERS THEN NULL;
                END;

                -- Drop table if it exists
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'audit_log'
                ) THEN
                    DROP TABLE IF EXISTS audit_log CASCADE;
                END IF;
            END $$;
        `);

    // Create audit_log table with proper schema
    await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'audit_log'
                ) THEN
                    CREATE TABLE audit_log (
                        id uuid NOT NULL DEFAULT gen_random_uuid(),
                        timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "channelId" integer NOT NULL,
                        "eventType" character varying NOT NULL,
                        "entityType" character varying,
                        "entityId" character varying,
                        "userId" integer,
                        data jsonb NOT NULL DEFAULT '{}',
                        source character varying NOT NULL,
                        CONSTRAINT "PK_audit_log" PRIMARY KEY (id, timestamp)
                    );
                END IF;
            END $$;
        `);

    // Create indexes for efficient querying
    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_audit_log_channel_timestamp" 
            ON audit_log ("channelId", timestamp DESC)
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_audit_log_channel_entity" 
            ON audit_log ("channelId", "entityType", "entityId")
        `);

    await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_audit_log_channel_user" 
            ON audit_log ("channelId", "userId")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_channel_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_channel_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_log_channel_timestamp"`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit_log`);
  }
}

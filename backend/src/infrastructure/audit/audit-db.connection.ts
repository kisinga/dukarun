import { Injectable, OnModuleInit, Logger, OnModuleDestroy, Scope } from '@nestjs/common';
import { DataSource, DataSourceOptions } from 'typeorm';
import { auditDbConfig } from './audit-db.config';
import { AuditLog } from './audit-log.entity';

/**
 * Separate database connection for audit logs
 *
 * Uses TimescaleDB for time-series optimized storage with automatic
 * retention policies for data older than 2 years.
 *
 * Singleton to ensure only one database connection is created.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AuditDbConnection implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditDbConnection.name);
  private dataSource: DataSource | null = null;
  private static instance: AuditDbConnection | null = null;
  private static initializationPromise: Promise<void> | null = null;

  constructor() {
    // Singleton pattern: reuse existing instance if available
    if (AuditDbConnection.instance) {
      return AuditDbConnection.instance;
    }
    AuditDbConnection.instance = this;
  }

  async onModuleInit(): Promise<void> {
    // Prevent multiple initializations
    if (this.dataSource?.isInitialized) {
      this.logger.debug('Audit database connection already initialized');
      return;
    }

    // If another instance is initializing, wait for it
    if (AuditDbConnection.initializationPromise) {
      this.logger.debug('Waiting for existing audit database initialization');
      await AuditDbConnection.initializationPromise;
      if (this.dataSource?.isInitialized) {
        return;
      }
    }

    try {
      // Mark as initializing
      AuditDbConnection.initializationPromise = this.initialize();
      await AuditDbConnection.initializationPromise;
    } catch (error) {
      AuditDbConnection.initializationPromise = null;
      // Downgrade to warn to avoid noisy error logs in dev if audit DB is unavailable
      this.logger.warn(
        `Audit DB unavailable, continuing without audit logging: ${error instanceof Error ? error.message : String(error)}`
      );
      // Don't throw - allow app to continue without audit logging
    }
  }

  private async initialize(): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 2000; // Start with 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.dataSource = new DataSource(auditDbConfig as DataSourceOptions);
        await this.dataSource.initialize();
        this.logger.log('Audit database connection established');

        // Initialize TimescaleDB hypertable and retention policy
        await this.initializeTimescaleDB();
        AuditDbConnection.initializationPromise = null;
        return; // Success, exit retry loop
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt === maxRetries) {
          // Last attempt failed, throw the error
          throw new Error(
            `Failed to connect to audit database after ${maxRetries} attempts: ${errorMessage}`
          );
        }

        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Audit DB connection attempt ${attempt}/${maxRetries} failed: ${errorMessage}. Retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      this.logger.log('Audit database connection closed');
    }
  }

  /**
   * Get the audit database connection
   */
  getConnection(): DataSource {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      throw new Error('Audit database connection not initialized');
    }
    return this.dataSource;
  }

  /**
   * Check if connection is available
   */
  isAvailable(): boolean {
    return this.dataSource?.isInitialized || false;
  }

  /**
   * Initialize TimescaleDB hypertable and retention policy
   */
  private async initializeTimescaleDB(): Promise<void> {
    if (!this.dataSource) {
      return;
    }

    try {
      const queryRunner = this.dataSource.createQueryRunner();

      // Check if table exists
      const tableExists = await queryRunner.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'audit_log'
                )
            `);

      if (tableExists[0]?.exists) {
        // Check if table has UUID columns (old schema) that need migration
        const columnInfo = await queryRunner.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'audit_log' 
                    AND column_name IN ('channelId', 'userId')
                `);

        const needsMigration = columnInfo.some((col: any) => col.data_type === 'uuid');

        if (needsMigration) {
          this.logger.log('Migrating audit_log table from UUID to integer columns...');

          // Drop hypertable if it exists
          try {
            await queryRunner.query(`
                            SELECT drop_hypertable('audit_log', if_exists => true)
                        `);
          } catch (e) {
            // Ignore errors if not a hypertable
          }

          // Drop old table
          await queryRunner.query(`DROP TABLE IF EXISTS audit_log CASCADE`);
          this.logger.log('Dropped old audit_log table with UUID columns');
        }
      }

      // Create table with correct schema if it doesn't exist (or was just dropped)
      const tableStillExists = await queryRunner.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'audit_log'
                )
            `);

      if (!tableStillExists[0]?.exists) {
        await queryRunner.query(`
                    CREATE TABLE IF NOT EXISTS audit_log (
                        id uuid NOT NULL DEFAULT gen_random_uuid(),
                        timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        "channelId" integer NOT NULL,
                        "eventType" character varying NOT NULL,
                        "entityType" character varying,
                        "entityId" character varying,
                        "userId" integer,
                        "ipAddress" character varying,
                        data jsonb NOT NULL DEFAULT '{}',
                        source character varying NOT NULL,
                        CONSTRAINT "PK_audit_log" PRIMARY KEY (id, timestamp)
                    )
                `);

        // Create indexes
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

        await queryRunner.query(`
                    CREATE INDEX IF NOT EXISTS "IDX_audit_log_ip_address" 
                    ON audit_log ("ipAddress")
                `);

        this.logger.log('Created audit_log table with integer columns');
      } else {
        // Table exists - check if ipAddress column exists and add it if missing
        const columnExists = await queryRunner.query(`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'audit_log' 
                        AND column_name = 'ipAddress'
                    )
                `);

        if (!columnExists[0]?.exists) {
          this.logger.log('Adding ipAddress column to existing audit_log table...');
          await queryRunner.query(`
                        ALTER TABLE audit_log 
                        ADD COLUMN IF NOT EXISTS "ipAddress" character varying
                    `);

          await queryRunner.query(`
                        CREATE INDEX IF NOT EXISTS "IDX_audit_log_ip_address" 
                        ON audit_log ("ipAddress")
                    `);

          this.logger.log('Added ipAddress column and index to audit_log table');
        }
      }

      // Enable TimescaleDB extension if not already enabled
      await queryRunner.query(`
                CREATE EXTENSION IF NOT EXISTS timescaledb
            `);

      // Convert to hypertable (partitioned by timestamp)
      // Only if it's not already a hypertable
      const isHypertableResult = await queryRunner.query(`
                SELECT COUNT(*) as count
                FROM timescaledb_information.hypertables 
                WHERE hypertable_name = 'audit_log'
            `);

      const isHypertable = parseInt(isHypertableResult[0]?.count || '0', 10) > 0;

      if (!isHypertable) {
        await queryRunner.query(`
                    SELECT create_hypertable('audit_log', 'timestamp', 
                        chunk_time_interval => INTERVAL '7 days',
                        if_not_exists => TRUE)
                `);
        this.logger.log('Converted audit_log table to TimescaleDB hypertable');
      }

      // Check if retention policy already exists
      const retentionPolicyResult = await queryRunner.query(`
                SELECT COUNT(*) as count
                FROM timescaledb_information.jobs j
                WHERE j.proc_name = 'policy_retention'
                AND j.hypertable_name = 'audit_log'
            `);

      const hasRetentionPolicy = parseInt(retentionPolicyResult[0]?.count || '0', 10) > 0;

      // Create retention policy: drop data older than 2 years (730 days)
      // This runs automatically via TimescaleDB's job scheduler
      if (!hasRetentionPolicy) {
        await queryRunner.query(`
                    SELECT add_retention_policy('audit_log', INTERVAL '730 days', if_not_exists => TRUE)
                `);
        this.logger.log('TimescaleDB retention policy set: 730 days (2 years)');
      } else {
        this.logger.log('TimescaleDB retention policy already exists');
      }

      // admin_login_attempt table (no channelId; plain table for auth audit)
      const loginAttemptTableExists = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'admin_login_attempt'
        )
      `);
      if (!loginAttemptTableExists[0]?.exists) {
        await queryRunner.query(`
          CREATE TABLE admin_login_attempt (
            id uuid NOT NULL DEFAULT gen_random_uuid(),
            "eventKind" character varying NOT NULL DEFAULT 'login',
            timestamp timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "ipAddress" character varying,
            username character varying NOT NULL,
            success boolean NOT NULL,
            "failureReason" character varying,
            "userId" integer,
            "authMethod" character varying NOT NULL,
            "userAgent" character varying,
            "isSuperAdmin" boolean,
            CONSTRAINT "PK_admin_login_attempt" PRIMARY KEY (id)
          )
        `);
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_admin_login_attempt_timestamp"
          ON admin_login_attempt (timestamp DESC)
        `);
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_admin_login_attempt_ip_address"
          ON admin_login_attempt ("ipAddress")
        `);
        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS "IDX_admin_login_attempt_username"
          ON admin_login_attempt (username)
        `);
        this.logger.log('Created admin_login_attempt table');
      } else {
        // Table exists (e.g. from earlier deploy or running dev): ensure eventKind column exists.
        const eventKindExists = await queryRunner.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'admin_login_attempt' AND column_name = 'eventKind'
          )
        `);
        if (!eventKindExists[0]?.exists) {
          await queryRunner.query(`
            ALTER TABLE admin_login_attempt
            ADD COLUMN "eventKind" character varying NOT NULL DEFAULT 'login'
          `);
          this.logger.log('Added eventKind column to admin_login_attempt table');
        }
      }

      await queryRunner.release();
    } catch (error) {
      // If TimescaleDB extension is not available, log warning but continue
      // This allows the system to work with regular PostgreSQL if needed
      this.logger.warn(
        `TimescaleDB initialization failed (may not be available): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

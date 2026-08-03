import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Accounting Period Table
 *
 * Creates accounting_period table to track period metadata for period end closing.
 */
export class CreateAccountingPeriod8000000000007 implements MigrationInterface {
  name = 'CreateAccountingPeriod8000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "accounting_period" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "channelId" integer NOT NULL,
        "startDate" date NOT NULL,
        "endDate" date NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "closedBy" integer NULL,
        "closedAt" timestamp NULL
      )
    `);

    // Index will be created by TypeORM from @Index decorator in entity
    // No need to create it here - TypeORM will handle it
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index (TypeORM will drop it automatically, but include for safety)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_accounting_period_channel_dates"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "accounting_period"
    `);
  }
}

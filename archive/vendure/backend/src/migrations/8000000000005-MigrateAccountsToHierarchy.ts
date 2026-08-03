import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Setup Account Hierarchy
 *
 * For fresh setup: Creates CASH parent account for each channel and links cash-based
 * payment method accounts as sub-accounts. This migration runs after hierarchy columns
 * are added in migration 8000000000004.
 */
export class MigrateAccountsToHierarchy8000000000005 implements MigrationInterface {
  name = 'MigrateAccountsToHierarchy8000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all unique channel IDs that have accounts
    const channels = await queryRunner.query(`
      SELECT DISTINCT "channelId" FROM "ledger_account"
    `);

    for (const channel of channels) {
      const channelId = channel.channelId;

      // Create CASH parent account (fresh setup - it shouldn't exist yet)
      const result = await queryRunner.query(
        `
        INSERT INTO "ledger_account" ("channelId", "code", "name", "type", "isActive", "isParent")
        VALUES ($1, 'CASH', 'Cash', 'asset', true, true)
        ON CONFLICT ("channelId", code) DO UPDATE SET "isParent" = true
        RETURNING id
      `,
        [channelId]
      );
      const cashParentId = result[0].id;

      // Link cash-based payment method accounts as sub-accounts under CASH
      // CASH_ON_HAND, CLEARING_MPESA, BANK_MAIN are sub-accounts
      const cashSubAccounts = ['CASH_ON_HAND', 'CLEARING_MPESA', 'BANK_MAIN'];

      for (const accountCode of cashSubAccounts) {
        await queryRunner.query(
          `
          UPDATE "ledger_account"
          SET "parentAccountId" = $1
          WHERE "channelId" = $2
            AND "code" = $3
        `,
          [cashParentId, channelId, accountCode]
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove parentAccountId from all sub-accounts
    await queryRunner.query(`
      UPDATE "ledger_account"
      SET "parentAccountId" = NULL
      WHERE "parentAccountId" IS NOT NULL
    `);

    // Set isParent = false for all CASH accounts
    await queryRunner.query(`
      UPDATE "ledger_account"
      SET "isParent" = false
      WHERE "code" = 'CASH'
    `);
  }
}

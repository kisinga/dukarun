import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Setup Chart of Accounts
 *
 * Merges:
 * - 1766000000000-SetupChartOfAccounts.ts
 *
 * Final state:
 * - All channels have required accounts
 */
export class SetupChartOfAccounts8000000000001 implements MigrationInterface {
  name = 'SetupChartOfAccounts8000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$
            DECLARE
                channel_record RECORD;
            BEGIN
                -- Only run if channel table exists
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'channel'
                ) AND EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'ledger_account'
                ) THEN
                    FOR channel_record IN 
                        SELECT id FROM channel
                    LOOP
                        -- Create all required accounts
                        -- Note: Hierarchy will be set up in migration 8000000000005 after hierarchy columns are added
                        INSERT INTO ledger_account ("channelId", code, name, type, "isActive") VALUES
                            (channel_record.id, 'CASH_ON_HAND', 'Cash on Hand', 'asset', true),
                            (channel_record.id, 'BANK_MAIN', 'Bank - Main', 'asset', true),
                            (channel_record.id, 'CLEARING_MPESA', 'Clearing - M-Pesa', 'asset', true),
                            (channel_record.id, 'CLEARING_CREDIT', 'Clearing - Customer Credit', 'asset', true),
                            (channel_record.id, 'CLEARING_GENERIC', 'Clearing - Generic', 'asset', true),
                            (channel_record.id, 'SALES', 'Sales Revenue', 'income', true),
                            (channel_record.id, 'SALES_RETURNS', 'Sales Returns', 'income', true),
                            (channel_record.id, 'ACCOUNTS_RECEIVABLE', 'Accounts Receivable', 'asset', true),
                            (channel_record.id, 'INVENTORY', 'Inventory', 'asset', true),
                            (channel_record.id, 'ACCOUNTS_PAYABLE', 'Accounts Payable', 'liability', true),
                            (channel_record.id, 'TAX_PAYABLE', 'Taxes Payable', 'liability', true),
                            (channel_record.id, 'PURCHASES', 'Inventory Purchases', 'expense', true),
                            (channel_record.id, 'EXPENSES', 'General Expenses', 'expense', true),
                            (channel_record.id, 'PROCESSOR_FEES', 'Payment Processor Fees', 'expense', true),
                            (channel_record.id, 'CASH_SHORT_OVER', 'Cash Short/Over', 'expense', true),
                            (channel_record.id, 'COGS', 'Cost of Goods Sold', 'expense', true),
                            (channel_record.id, 'INVENTORY_WRITE_OFF', 'Inventory Write-Off', 'expense', true),
                            (channel_record.id, 'EXPIRY_LOSS', 'Expiry Loss', 'expense', true)
                        ON CONFLICT ("channelId", code) DO NOTHING;
                    END LOOP;
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DELETE FROM ledger_account 
            WHERE code IN (
                'CASH', 'CASH_ON_HAND', 'BANK_MAIN', 'CLEARING_MPESA', 'CLEARING_CREDIT', 'CLEARING_GENERIC',
                'SALES', 'SALES_RETURNS',
                'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'ACCOUNTS_PAYABLE', 'TAX_PAYABLE',
                'PURCHASES', 'EXPENSES', 'PROCESSOR_FEES', 'CASH_SHORT_OVER',
                'COGS', 'INVENTORY_WRITE_OFF', 'EXPIRY_LOSS'
            )
        `);
  }
}

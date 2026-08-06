import { describe, expect, it, beforeEach } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ChartOfAccountsService } from '../../../src/services/financial/chart-of-accounts.service';
import { Account } from '../../../src/ledger/account.entity';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';

/**
 * Integration tests for ChartOfAccountsService
 *
 * These tests verify:
 * - Account creation during channel initialization
 * - Transaction participation
 * - Account verification
 * - Channel isolation
 *
 * Note: These tests require a database connection and should be run as integration tests.
 * Currently these are placeholder tests that need proper test harness setup.
 */
describe.skip('ChartOfAccountsService Integration', () => {
  let service!: ChartOfAccountsService;
  let connection!: TransactionalConnection;
  let ctx!: RequestContext;

  beforeEach(async () => {
    // TODO: Set up proper test harness with database connection
    // Example setup:
    // const module = await Test.createTestingModule({
    //   providers: [
    //     ChartOfAccountsService,
    //     TransactionalConnection,
    //     // ... other dependencies
    //   ],
    // }).compile();
    //
    // service = module.get<ChartOfAccountsService>(ChartOfAccountsService);
    // connection = module.get<TransactionalConnection>(TransactionalConnection);
    // ctx = await createTestRequestContext(module);
  });

  describe('Account Creation', () => {
    it('should create all 18 required accounts for a channel', async () => {
      // This test would:
      // 1. Create a test channel
      // 2. Call initializeForChannel(ctx, channelId)
      // 3. Query database for accounts
      // 4. Verify all 18 accounts exist
      // 5. Verify account types and hierarchy are correct

      const channelId = 999; // Test channel ID

      // Initialize accounts
      await service.initializeForChannel(ctx, channelId);

      // Verify accounts
      await service.verifyChannelAccounts(ctx, channelId);

      // Query all accounts for channel
      const accountRepo = connection.getRepository(ctx, Account);
      const accounts = await accountRepo.find({
        where: { channelId },
      });

      // Verify count
      expect(accounts.length).toBeGreaterThanOrEqual(18);

      // Verify required accounts exist
      const accountCodes = new Set(accounts.map(a => a.code));
      const requiredCodes = [
        ACCOUNT_CODES.CASH,
        ACCOUNT_CODES.CASH_ON_HAND,
        ACCOUNT_CODES.BANK_MAIN,
        ACCOUNT_CODES.CLEARING_MPESA,
        ACCOUNT_CODES.CLEARING_CREDIT,
        ACCOUNT_CODES.CLEARING_GENERIC,
        ACCOUNT_CODES.SALES,
        ACCOUNT_CODES.SALES_RETURNS,
        ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        ACCOUNT_CODES.INVENTORY,
        ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        ACCOUNT_CODES.TAX_PAYABLE,
        ACCOUNT_CODES.PURCHASES,
        ACCOUNT_CODES.EXPENSES,
        ACCOUNT_CODES.PROCESSOR_FEES,
        ACCOUNT_CODES.CASH_SHORT_OVER,
        ACCOUNT_CODES.COGS,
        ACCOUNT_CODES.INVENTORY_WRITE_OFF,
        ACCOUNT_CODES.EXPIRY_LOSS,
      ];

      for (const code of requiredCodes) {
        expect(accountCodes.has(code)).toBe(true);
      }

      // Verify parent account hierarchy
      const cashAccount = accounts.find(a => a.code === ACCOUNT_CODES.CASH);
      expect(cashAccount).toBeDefined();
      expect(cashAccount?.isParent).toBe(true);

      const cashOnHand = accounts.find(a => a.code === ACCOUNT_CODES.CASH_ON_HAND);
      expect(cashOnHand?.parentAccountId).toBe(cashAccount?.id);
    });

    it('should be idempotent when called multiple times', async () => {
      const channelId = 998;

      // Call multiple times
      await service.initializeForChannel(ctx, channelId);
      await service.initializeForChannel(ctx, channelId);
      await service.initializeForChannel(ctx, channelId);

      // Verify no duplicate accounts
      const accountRepo = connection.getRepository(ctx, Account);
      const accounts = await accountRepo.find({
        where: { channelId },
      });

      // Check for duplicates by code
      const codes = accounts.map(a => a.code);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);

      // Verify all accounts still exist
      await service.verifyChannelAccounts(ctx, channelId);
    });

    it('should throw error if verification fails', async () => {
      const channelId = 997;

      // Don't initialize accounts
      // Attempt verification
      await expect(service.verifyChannelAccounts(ctx, channelId)).rejects.toThrow(
        /Missing required accounts/
      );
    });
  });

  describe('Transaction Participation', () => {
    it('should rollback accounts if transaction fails', async () => {
      // This test would:
      // 1. Start a transaction
      // 2. Create channel
      // 3. Initialize accounts
      // 4. Simulate failure
      // 5. Verify accounts are not in database after rollback

      const channelId = 996;

      // Note: This requires proper transaction handling in test setup
      // await connection.withTransaction(ctx, async txCtx => {
      //   await service.initializeForChannel(txCtx, channelId);
      //   throw new Error('Simulated failure');
      // });

      // Verify accounts don't exist
      // const accountRepo = connection.getRepository(ctx, Account);
      // const accounts = await accountRepo.find({ where: { channelId } });
      // expect(accounts.length).toBe(0);
    });
  });

  describe('Channel Isolation', () => {
    it('should not allow querying accounts from different channel', async () => {
      const channel1Id = 995;
      const channel2Id = 994;

      // Initialize accounts for both channels
      await service.initializeForChannel(ctx, channel1Id);
      await service.initializeForChannel(ctx, channel2Id);

      // Query accounts for channel1
      const accountRepo = connection.getRepository(ctx, Account);
      const channel1Accounts = await accountRepo.find({
        where: { channelId: channel1Id },
      });

      const channel2Accounts = await accountRepo.find({
        where: { channelId: channel2Id },
      });

      // Verify isolation
      expect(channel1Accounts.length).toBeGreaterThan(0);
      expect(channel2Accounts.length).toBeGreaterThan(0);

      // Verify no cross-channel accounts
      const channel1Codes = new Set(channel1Accounts.map(a => a.code));
      const channel2Codes = new Set(channel2Accounts.map(a => a.code));

      // Accounts should have same codes but different IDs
      expect(channel1Codes).toEqual(channel2Codes);

      // But account IDs should be different
      const channel1Ids = new Set(channel1Accounts.map(a => a.id));
      const channel2Ids = new Set(channel2Accounts.map(a => a.id));

      const intersection = [...channel1Ids].filter(id => channel2Ids.has(id));
      expect(intersection.length).toBe(0);
    });
  });
});

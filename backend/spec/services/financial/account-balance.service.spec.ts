/**
 * AccountBalanceService Tests
 *
 * Tests for account balance queries with parent account rollup support.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { AccountBalanceService } from '../../../src/services/financial/account-balance.service';
import { Account } from '../../../src/ledger/account.entity';
import { JournalLine } from '../../../src/ledger/journal-line.entity';
import { JournalEntry } from '../../../src/ledger/journal-entry.entity';

describe('AccountBalanceService', () => {
  const ctx = {
    channelId: 1,
    activeUserId: 1,
  } as RequestContext;

  let service: AccountBalanceService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockAccountRepo: any;
  let mockJournalLineRepo: any;

  beforeEach(() => {
    mockAccountRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    mockJournalLineRepo = {
      createQueryBuilder: jest.fn(),
    };

    mockConnection = {
      getRepository: jest.fn(),
      rawConnection: {
        getRepository: jest.fn(entity => {
          if (entity === Account) return mockAccountRepo;
          if (entity === JournalLine) return mockJournalLineRepo;
          return {};
        }),
      },
    } as any;

    service = new AccountBalanceService(mockConnection);
  });

  describe('getAccountBalance', () => {
    it('should return balance for sub-account directly from journal lines', async () => {
      const account: Account = {
        id: 'account-1',
        channelId: 1,
        code: 'CASH_ON_HAND',
        name: 'Cash on Hand',
        type: 'asset',
        isActive: true,
        isParent: false,
      } as Account;

      mockAccountRepo.findOne.mockResolvedValue(account);

      const mockGetRawOne = jest.fn() as jest.MockedFunction<() => Promise<any>>;
      (mockGetRawOne as any).mockResolvedValue({
        debitTotal: '1000',
        creditTotal: '500',
      });

      const mockQueryBuilder: any = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: mockGetRawOne,
      };

      mockJournalLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getAccountBalance(ctx, 'CASH_ON_HAND', 1, '2024-01-31');

      expect(result.accountCode).toBe('CASH_ON_HAND');
      expect(result.balance).toBe(500); // 1000 - 500
      expect(result.debitTotal).toBe(1000);
      expect(result.creditTotal).toBe(500);
    });

    it('should return rolled-up balance for parent account', async () => {
      const parentAccount: Account = {
        id: 'parent-1',
        channelId: 1,
        code: 'CASH',
        name: 'Cash',
        type: 'asset',
        isActive: true,
        isParent: true,
      } as Account;

      const subAccount1: Account = {
        id: 'sub-1',
        channelId: 1,
        code: 'CASH_ON_HAND',
        name: 'Cash on Hand',
        type: 'asset',
        isActive: true,
        isParent: false,
        parentAccountId: 'parent-1',
      } as Account;

      const subAccount2: Account = {
        id: 'sub-2',
        channelId: 1,
        code: 'CLEARING_MPESA',
        name: 'Clearing - M-Pesa',
        type: 'asset',
        isActive: true,
        isParent: false,
        parentAccountId: 'parent-1',
      } as Account;

      mockAccountRepo.findOne.mockResolvedValue(parentAccount);
      mockAccountRepo.find.mockResolvedValue([subAccount1, subAccount2]);

      // Mock journal line queries for sub-accounts
      const mockGetRawOne2 = jest.fn() as jest.MockedFunction<() => Promise<any>>;
      (mockGetRawOne2 as any)
        .mockResolvedValueOnce({
          debitTotal: '1000',
          creditTotal: '200',
        })
        .mockResolvedValueOnce({
          debitTotal: '500',
          creditTotal: '100',
        });

      const mockQueryBuilder: any = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: mockGetRawOne2,
      };

      mockJournalLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getAccountBalance(ctx, 'CASH', 1, '2024-01-31');

      expect(result.accountCode).toBe('CASH');
      expect(result.balance).toBe(1200); // (1000-200) + (500-100)
      expect(result.debitTotal).toBe(1500);
      expect(result.creditTotal).toBe(300);
    });

    it('should return a zero balance if account not found', async () => {
      // A channel whose chart of accounts doesn't (yet) include this account
      // has no postings for it → a zero balance, not an error. Throwing here
      // would null the entire customer/supplier GraphQL response.
      mockAccountRepo.findOne.mockResolvedValue(null);

      const result = await service.getAccountBalance(ctx, 'INVALID', 1);

      expect(result).toEqual({
        accountCode: 'INVALID',
        accountName: 'INVALID',
        balance: 0,
        debitTotal: 0,
        creditTotal: 0,
      });
    });
  });

  describe('getSubAccounts', () => {
    it('should return all sub-accounts for a parent', async () => {
      const subAccounts = [
        {
          id: 'sub-1',
          channelId: 1,
          code: 'CASH_ON_HAND',
          parentAccountId: 'parent-1',
        },
        {
          id: 'sub-2',
          channelId: 1,
          code: 'CLEARING_MPESA',
          parentAccountId: 'parent-1',
        },
      ];

      mockAccountRepo.find.mockResolvedValue(subAccounts);

      const result = await service.getSubAccounts(ctx, 1, 'parent-1');

      expect(result).toHaveLength(2);
      expect(mockAccountRepo.find).toHaveBeenCalledWith({
        where: {
          channelId: 1,
          parentAccountId: 'parent-1',
        },
      });
    });
  });

  describe('isParentAccount', () => {
    it('should return true for parent account', async () => {
      const account: Account = {
        id: 'parent-1',
        channelId: 1,
        code: 'CASH',
        isParent: true,
      } as Account;

      mockAccountRepo.findOne.mockResolvedValue(account);

      const result = await service.isParentAccount(ctx, 1, 'CASH');

      expect(result).toBe(true);
    });

    it('should return false for sub-account', async () => {
      const account: Account = {
        id: 'sub-1',
        channelId: 1,
        code: 'CASH_ON_HAND',
        isParent: false,
      } as Account;

      mockAccountRepo.findOne.mockResolvedValue(account);

      const result = await service.isParentAccount(ctx, 1, 'CASH_ON_HAND');

      expect(result).toBe(false);
    });
  });
});

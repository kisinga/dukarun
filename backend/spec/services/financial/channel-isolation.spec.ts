/**
 * Channel Isolation Tests
 *
 * Verifies that ledger and session operations are isolated by channel:
 * - PostingService loads accounts by payload.channelId and rejects when accounts missing for that channel
 * - Sessions and currentCashierSession are keyed by channelId
 * - eligibleDebitAccounts uses ctx.channelId so each channel sees only its accounts
 *
 * Implemented with mocks (no DB) to assert channelId is always used and never mixed.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Account } from '../../../src/ledger/account.entity';
import { JournalEntry } from '../../../src/ledger/journal-entry.entity';
import { JournalLine } from '../../../src/ledger/journal-line.entity';
import { PeriodLock } from '../../../src/domain/period/period-lock.entity';
import { PostingService, PostingPayload } from '../../../src/ledger/posting.service';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';
import { OpenSessionService } from '../../../src/services/financial/open-session.service';
import { CashierSession } from '../../../src/domain/cashier/cashier-session.entity';
import { LedgerViewerResolver } from '../../../src/plugins/ledger/ledger-viewer.resolver';

describe('Ledger Channel Isolation', () => {
  const channel1Id = 1;
  const channel2Id = 2;

  describe('PostingService: accounts and payload channelId', () => {
    let postingService: PostingService;
    let mockConnection: any;
    let mockAccountRepo: any;
    let mockJournalEntryRepo: any;
    let mockJournalLineRepo: any;
    let mockPeriodLockRepo: any;

    beforeEach(() => {
      mockAccountRepo = {
        createQueryBuilder: jest.fn(),
      };
      mockJournalEntryRepo = {
        findOne: jest.fn().mockImplementation(() => Promise.resolve(null)),
        create: jest.fn(),
        save: jest.fn(),
      } as any;
      mockJournalLineRepo = {
        create: jest.fn(),
        save: jest.fn(),
      } as any;
      mockPeriodLockRepo = {
        findOne: jest.fn().mockImplementation(() => Promise.resolve(null)),
      } as any;
      const mockGetMany = jest.fn();
      const mockWhere = jest.fn().mockReturnThis();
      const mockAndWhere = jest.fn().mockReturnThis();
      mockAccountRepo.createQueryBuilder.mockReturnValue({
        where: mockWhere,
        andWhere: mockAndWhere,
        getMany: mockGetMany,
      });
      mockConnection = {
        withTransaction: jest.fn((_ctx: any, fn: (t: any) => Promise<any>) => fn(_ctx)),
        getRepository: jest.fn((_ctx: any, entity: any) => {
          if (entity === Account) return mockAccountRepo;
          if (entity === JournalEntry) return mockJournalEntryRepo;
          if (entity === JournalLine) return mockJournalLineRepo;
          if (entity === PeriodLock) return mockPeriodLockRepo;
          return {};
        }),
      };
      postingService = new PostingService(mockConnection);
    });

    it('should load accounts by payload.channelId and reject when accounts missing for that channel', async () => {
      const ctx = { channelId: channel1Id } as RequestContext;
      const payload: PostingPayload = {
        channelId: channel2Id,
        entryDate: new Date().toISOString().slice(0, 10),
        lines: [
          { accountCode: ACCOUNT_CODES.CASH_ON_HAND, debit: 1000 },
          { accountCode: ACCOUNT_CODES.SALES, credit: 1000 },
        ],
      };
      const getMany = mockAccountRepo.createQueryBuilder().getMany;
      getMany.mockResolvedValue([]);

      await expect(postingService.post(ctx, 'Test', 'test-1', payload)).rejects.toThrow(
        /Missing accounts/
      );

      const whereCall = mockAccountRepo.createQueryBuilder().where.mock.calls[0];
      expect(whereCall[0]).toContain('channelId');
      expect(whereCall[1]).toEqual({ channelId: channel2Id });
    });

    it('should use payload.channelId for idempotency lookup', async () => {
      const ctx = { channelId: channel1Id } as RequestContext;
      const payload: PostingPayload = {
        channelId: channel1Id,
        entryDate: new Date().toISOString().slice(0, 10),
        lines: [
          { accountCode: ACCOUNT_CODES.CASH_ON_HAND, debit: 1000 },
          { accountCode: ACCOUNT_CODES.SALES, credit: 1000 },
        ],
      };
      const getMany = mockAccountRepo.createQueryBuilder().getMany;
      getMany.mockResolvedValue([
        { id: 'a1', code: ACCOUNT_CODES.CASH_ON_HAND, isParent: false },
        { id: 'a2', code: ACCOUNT_CODES.SALES, isParent: false },
      ]);
      mockJournalEntryRepo.create.mockImplementation((o: any) => ({ ...o }));
      mockJournalLineRepo.create.mockImplementation((o: any) => ({ ...o }));
      mockJournalEntryRepo.save.mockImplementation((e: any) =>
        Promise.resolve({ ...e, id: 'je-1' })
      );
      mockJournalLineRepo.save.mockImplementation((l: any) => Promise.resolve(l));

      await postingService.post(ctx, 'Test', 'test-1', payload);

      expect(mockJournalEntryRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channelId: channel1Id,
          }),
        })
      );
    });
  });

  describe('Session isolation by channelId', () => {
    it('getCurrentSession returns session for requested channel only', async () => {
      const session1 = {
        id: '11111111-1111-4111-8111-111111111111',
        channelId: channel1Id,
        status: 'open',
      } as CashierSession;
      const session2 = {
        id: '22222222-2222-4222-8222-222222222222',
        channelId: channel2Id,
        status: 'open',
      } as CashierSession;
      const mockSessionRepo = {
        findOne: jest.fn().mockImplementation((opts: any) => {
          const ch = opts?.where?.channelId;
          if (ch === channel1Id) return Promise.resolve(session1);
          if (ch === channel2Id) return Promise.resolve(session2);
          return Promise.resolve(null);
        }),
      };
      const mockConnection = {
        getRepository: jest.fn(() => mockSessionRepo),
      } as any;
      const mockLedgerQueryService = { getCashierSessionTotals: jest.fn() } as any;
      const mockReconciliationService = { createReconciliation: jest.fn() } as any;
      const mockFinancialService = {
        postVarianceAdjustment: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockChannelPaymentMethodService = {
        getChannelPaymentMethods: (jest.fn() as any).mockResolvedValue([]),
      } as any;
      const service = new OpenSessionService(
        mockConnection,
        mockLedgerQueryService,
        mockReconciliationService,
        mockFinancialService,
        mockChannelPaymentMethodService,
        { log: jest.fn().mockImplementation(() => Promise.resolve()) } as any
      );
      const ctx1 = { channelId: channel1Id } as RequestContext;
      const ctx2 = { channelId: channel2Id } as RequestContext;

      const current1 = await service.getCurrentSession(ctx1, channel1Id);
      const current2 = await service.getCurrentSession(ctx2, channel2Id);

      expect(current1?.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(current2?.id).toBe('22222222-2222-4222-8222-222222222222');
      expect(current1?.channelId).toBe(channel1Id);
      expect(current2?.channelId).toBe(channel2Id);
    });
  });

  describe('eligibleDebitAccounts uses ctx.channelId', () => {
    it('resolver queries accounts with channelId from context', async () => {
      const cashParentId = 'cash-parent-id';
      const cashParent = {
        id: cashParentId,
        code: ACCOUNT_CODES.CASH,
        channelId: channel1Id,
      };
      const mockAccountRepo: any = {
        findOne: jest.fn((() => Promise.resolve(cashParent)) as any),
        find: jest.fn().mockImplementation((opts: any) => {
          expect(opts.where.channelId).toBeDefined();
          expect(opts.where.parentAccountId).toBe(cashParentId);
          return Promise.resolve([
            {
              id: '1',
              code: ACCOUNT_CODES.CASH_ON_HAND,
              name: 'Cash',
              type: 'asset',
              isActive: true,
              isParent: false,
              channelId: opts.where.channelId,
            },
          ]);
        }),
      };
      const mockDataSource = { getRepository: jest.fn(() => mockAccountRepo) } as any;
      const mockLedgerQueryService = {
        getAccountBalance: jest.fn().mockImplementation(() => Promise.resolve({ balance: 0 })),
      } as any;
      const resolver = new LedgerViewerResolver(mockDataSource, mockLedgerQueryService);
      const ctx = { channelId: channel1Id } as RequestContext;

      await resolver.eligibleDebitAccounts(ctx);

      expect(mockAccountRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channelId: channel1Id,
            parentAccountId: cashParentId,
          }),
        })
      );
    });
  });
});

/**
 * ReconciliationService Tests
 *
 * Tests for reconciliation record management.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ReconciliationService } from '../../../src/services/financial/reconciliation.service';
import { Reconciliation } from '../../../src/domain/recon/reconciliation.entity';
import { AccountBalanceService } from '../../../src/services/financial/account-balance.service';
import { FinancialService } from '../../../src/services/financial/financial.service';
import { LedgerQueryService } from '../../../src/services/financial/ledger-query.service';
import { Account } from '../../../src/ledger/account.entity';
import { ReconciliationAccount } from '../../../src/domain/recon/reconciliation-account.entity';

describe('ReconciliationService', () => {
  const ctx = {
    channelId: 1,
    activeUserId: '1',
  } as RequestContext;

  let service: ReconciliationService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockReconciliationRepo: any;
  let mockAccountRepo: any;
  let mockJunctionRepo: any;
  let mockAccountBalanceService: jest.Mocked<AccountBalanceService>;
  let mockLedgerQueryService: jest.Mocked<LedgerQueryService>;
  let mockChannelPaymentMethodService: any;
  let mockFinancialService: any;

  beforeEach(() => {
    mockReconciliationRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockAccountRepo = {
      find: (jest.fn() as any).mockResolvedValue([{ id: 'acc-1', code: 'CASH_ON_HAND' }]),
    };
    mockJunctionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: (jest.fn() as any).mockResolvedValue([]),
    };

    mockConnection = {
      getRepository: jest.fn((_ctx: RequestContext, entity: any) => {
        if (entity === Reconciliation) return mockReconciliationRepo;
        if (entity === Account) return mockAccountRepo;
        if (entity === ReconciliationAccount) return mockJunctionRepo;
        return {};
      }),
      withTransaction: jest.fn(
        (_ctx: RequestContext, fn: (txCtx: RequestContext) => Promise<any>) => fn(_ctx)
      ),
    } as any;

    mockAccountBalanceService = {
      getAccountBalance: jest.fn(),
    } as any;

    mockLedgerQueryService = {
      getExpectedBalanceForReconciliation: (jest.fn() as any).mockResolvedValue(1000),
    } as any;

    mockFinancialService = {
      postVarianceAdjustment: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;

    mockChannelPaymentMethodService = {
      getChannelPaymentMethods: jest.fn().mockImplementation(() => Promise.resolve([])),
    };

    service = new ReconciliationService(
      mockConnection,
      mockAccountBalanceService,
      mockChannelPaymentMethodService,
      mockFinancialService,
      mockLedgerQueryService
    );
  });

  describe('createReconciliation', () => {
    it('should create reconciliation record with calculated variance', async () => {
      const input = {
        channelId: 1,
        scope: 'method' as const,
        scopeRefId: 'CASH_ON_HAND',
        expectedBalance: '1000',
        actualBalance: '950',
        notes: 'Test reconciliation',
        declaredAmounts: [] as Array<{ accountCode: string; amountCents: string }>,
      };

      const createdReconciliation: Reconciliation = {
        id: 'recon-1',
        ...input,
        snapshotAt: new Date().toISOString().slice(0, 10),
        status: 'verified',
        varianceAmount: '50', // 1000 - 950
        createdBy: 1,
      } as Reconciliation;

      mockReconciliationRepo.create.mockReturnValue(createdReconciliation);
      mockReconciliationRepo.save.mockResolvedValue(createdReconciliation);

      const result = await service.createReconciliation(ctx, input);

      expect(result).toEqual(createdReconciliation);
      expect(result.varianceAmount).toBe('50');
      expect(result.status).toBe('verified');
      expect(mockReconciliationRepo.create).toHaveBeenCalled();
      expect(mockReconciliationRepo.save).toHaveBeenCalled();
    });

    it('should handle negative variance', async () => {
      const input = {
        channelId: 1,
        scope: 'method' as const,
        scopeRefId: 'CASH_ON_HAND',
        expectedBalance: '1000',
        actualBalance: '1050',
        declaredAmounts: [] as Array<{ accountCode: string; amountCents: string }>,
      };

      const createdReconciliation: Reconciliation = {
        id: 'recon-1',
        ...input,
        snapshotAt: new Date().toISOString().slice(0, 10),
        status: 'verified',
        varianceAmount: '-50', // 1000 - 1050
        createdBy: 1,
      } as Reconciliation;

      mockReconciliationRepo.create.mockReturnValue(createdReconciliation);
      mockReconciliationRepo.save.mockResolvedValue(createdReconciliation);

      const result = await service.createReconciliation(ctx, input);

      expect(result.varianceAmount).toBe('-50');
      expect(result.status).toBe('verified');
    });

    it('cash-session with expectedAmountCentsByAccountId persists expected and variance on junction rows (variance = declared - expected)', async () => {
      const snapshotDate = '2026-02-28';
      const acc1 = 'acc-1';
      const acc2 = 'acc-2';
      mockAccountRepo.find.mockResolvedValue([
        { id: acc1, code: 'CASH_ON_HAND' },
        { id: acc2, code: 'CLEARING_MPESA' },
      ]);
      const savedRecon = {
        id: 'rec-close-1',
        channelId: 1,
        scope: 'cash-session',
        scopeRefId: 'session-1:closing',
        snapshotAt: snapshotDate,
        status: 'verified',
      } as Reconciliation;
      mockReconciliationRepo.create.mockImplementation((o: any) => ({ ...o }));
      mockReconciliationRepo.save.mockResolvedValue(savedRecon);
      mockJunctionRepo.create.mockImplementation((o: any) => o);
      mockJunctionRepo.save.mockResolvedValue([]);

      const input = {
        channelId: 1,
        scope: 'cash-session' as const,
        scopeRefId: 'session-1:closing',
        expectedBalance: '13000',
        actualBalance: '15200',
        notes: 'Closing reconciliation',
        declaredAmounts: [
          { accountCode: 'CASH_ON_HAND', amountCents: '3200' },
          { accountCode: 'CLEARING_MPESA', amountCents: '12000' },
        ],
      };
      const expectedByAccount: Record<string, string> = {
        [acc1]: '-453807',
        [acc2]: '3667666',
      };

      await service.createReconciliation(ctx, input, {
        snapshotDate,
        expectedAmountCentsByAccountId: expectedByAccount,
      });

      expect(mockJunctionRepo.create).toHaveBeenCalled();
      const createCalls = mockJunctionRepo.create.mock.calls as Array<[Record<string, unknown>]>;
      const byAccountId = new Map<string, Record<string, unknown>>();
      for (const [arg] of createCalls) {
        byAccountId.set(arg.accountId as string, arg);
      }
      expect(byAccountId.get(acc1)?.expectedAmountCents).toBe('-453807');
      expect(byAccountId.get(acc1)?.varianceCents).toBe(String(3200 - -453807));
      expect(byAccountId.get(acc2)?.expectedAmountCents).toBe('3667666');
      expect(byAccountId.get(acc2)?.varianceCents).toBe(String(12000 - 3667666));
    });
  });

  describe('getReconciliationDetails', () => {
    it('when junction row has expectedAmountCents uses persisted value and does not call getAccountBalance', async () => {
      const reconId = 'rec-1';
      mockReconciliationRepo.findOne.mockResolvedValue({
        id: reconId,
        channelId: 1,
        scope: 'cash-session',
        snapshotAt: '2026-02-28',
      } as Reconciliation);
      mockJunctionRepo.find.mockResolvedValue([
        {
          reconciliationId: reconId,
          accountId: 'acc-1',
          declaredAmountCents: '320000',
          expectedAmountCents: '-453807',
          varianceCents: '773807',
          account: { id: 'acc-1', code: 'CASH_ON_HAND', name: 'Cash on Hand' },
        },
      ]);

      const result = await service.getReconciliationDetails(ctx, reconId);

      expect(mockAccountBalanceService.getAccountBalance).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].expectedBalanceCents).toBe('-453807');
      expect(result[0].varianceCents).toBe('773807');
      expect(result[0].declaredAmountCents).toBe('320000');
    });

    it('when junction row lacks expectedAmountCents recomputes via getAccountBalance', async () => {
      const reconId = 'rec-legacy';
      mockReconciliationRepo.findOne.mockResolvedValue({
        id: reconId,
        channelId: 1,
        scope: 'method',
        snapshotAt: '2026-01-15',
      } as Reconciliation);
      mockJunctionRepo.find.mockResolvedValue([
        {
          reconciliationId: reconId,
          accountId: 'acc-1',
          declaredAmountCents: '1000',
          expectedAmountCents: null,
          varianceCents: null,
          account: { id: 'acc-1', code: 'CASH_ON_HAND', name: 'Cash on Hand' },
        },
      ]);
      mockAccountBalanceService.getAccountBalance.mockResolvedValue({
        balance: 1200,
        accountCode: 'CASH_ON_HAND',
      } as any);

      const result = await service.getReconciliationDetails(ctx, reconId);

      expect(mockAccountBalanceService.getAccountBalance).toHaveBeenCalledWith(
        ctx,
        'CASH_ON_HAND',
        1,
        '2026-01-15'
      );
      expect(result).toHaveLength(1);
      expect(result[0].expectedBalanceCents).toBe('1200');
      expect(result[0].varianceCents).toBe(String(1200 - 1000));
    });
  });

  describe('verifyReconciliation', () => {
    it('should verify reconciliation from draft to verified', async () => {
      const reconciliation: Reconciliation = {
        id: 'recon-1',
        channelId: 1,
        scope: 'method',
        scopeRefId: 'CASH_ON_HAND',
        status: 'draft',
        reviewedBy: null,
      } as Reconciliation;

      mockReconciliationRepo.findOne.mockResolvedValue(reconciliation);
      mockReconciliationRepo.save.mockResolvedValue({
        ...reconciliation,
        status: 'verified',
        reviewedBy: 1,
      });

      const result = await service.verifyReconciliation(ctx, 'recon-1');

      expect(result.status).toBe('verified');
      expect(result.reviewedBy).toBe(1);
      expect(mockReconciliationRepo.save).toHaveBeenCalled();
    });

    it('should return existing reconciliation if already verified', async () => {
      const reconciliation: Reconciliation = {
        id: 'recon-1',
        status: 'verified',
      } as Reconciliation;

      mockReconciliationRepo.findOne.mockResolvedValue(reconciliation);

      const result = await service.verifyReconciliation(ctx, 'recon-1');

      expect(result).toEqual(reconciliation);
      expect(mockReconciliationRepo.save).not.toHaveBeenCalled();
    });

    it('should throw error if reconciliation not found', async () => {
      mockReconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyReconciliation(ctx, 'invalid-id')).rejects.toThrow(
        'Reconciliation invalid-id not found'
      );
    });
  });

  describe('getReconciliationStatus', () => {
    it('should return reconciliation status for period', async () => {
      const reconciliations: Reconciliation[] = [
        {
          id: 'recon-1',
          channelId: 1,
          scope: 'method',
          scopeRefId: 'CASH_ON_HAND',
          status: 'verified',
          varianceAmount: '0',
        },
        {
          id: 'recon-2',
          channelId: 1,
          scope: 'method',
          scopeRefId: 'CLEARING_MPESA',
          status: 'draft',
          varianceAmount: '10',
        },
      ] as Reconciliation[];

      const mockGetMany = jest.fn() as jest.MockedFunction<() => Promise<Reconciliation[]>>;
      (mockGetMany as any).mockResolvedValue(reconciliations);

      const mockQueryBuilder: any = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: mockGetMany,
      };

      mockReconciliationRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getReconciliationStatus(ctx, 1, '2024-01-31');

      expect(result.periodEndDate).toBe('2024-01-31');
      expect(result.scopes).toHaveLength(2);
      expect(result.scopes[0].status).toBe('verified');
      expect(result.scopes[1].status).toBe('draft');
    });
  });
});

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
    mockJunctionRepo = { create: jest.fn(), save: jest.fn() };

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

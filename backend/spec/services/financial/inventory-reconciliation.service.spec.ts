import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { InventoryReconciliationService } from '../../../src/services/financial/inventory-reconciliation.service';
import { AccountBalanceService } from '../../../src/services/financial/account-balance.service';
import { LedgerPostingService } from '../../../src/services/financial/ledger-posting.service';
import { InventoryBatch } from '../../../src/services/inventory/entities/inventory-batch.entity';

describe('InventoryReconciliationService', () => {
  const ctx = { channelId: 1 } as RequestContext;

  const buildService = () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn() as jest.MockedFunction<() => Promise<any>>,
    };

    const repo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    const connection = {
      getRepository: jest.fn((_ctx: any, entity: any) => {
        if (entity === InventoryBatch) return repo;
        return {};
      }),
    } as unknown as TransactionalConnection;

    const accountBalanceService = {
      getAccountBalance: jest.fn(),
    } as unknown as AccountBalanceService;

    const ledgerPostingService = {
      postInventoryAdjustment: jest.fn(),
    } as unknown as LedgerPostingService;

    const service = new InventoryReconciliationService(
      connection,
      accountBalanceService,
      ledgerPostingService
    );

    return { service, queryBuilder, accountBalanceService, ledgerPostingService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('reconcileToModel', () => {
    it('posts an inventory adjustment when ledger is higher than model', async () => {
      const { service, queryBuilder, accountBalanceService, ledgerPostingService } = buildService();

      queryBuilder.getRawOne.mockResolvedValue({
        totalValue: '80000',
        batchCount: '2',
        itemCount: '2',
      });
      (accountBalanceService.getAccountBalance as any).mockResolvedValue({ balance: '100000' });

      const result = await service.reconcileToModel(ctx, 1, 'count correction');

      expect(result.variance).toBe('20000');
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        expect.stringContaining('inventory-reconciliation:1:ALL:'),
        expect.objectContaining({
          valueChangeCents: -20000,
          reason: 'count correction',
        })
      );
    });

    it('posts an inventory adjustment when ledger is lower than model', async () => {
      const { service, queryBuilder, accountBalanceService, ledgerPostingService } = buildService();

      queryBuilder.getRawOne.mockResolvedValue({
        totalValue: '150000',
        batchCount: '3',
        itemCount: '3',
      });
      (accountBalanceService.getAccountBalance as any).mockResolvedValue({ balance: '120000' });

      const result = await service.reconcileToModel(ctx, 1, 'count correction', 5);

      expect(result.variance).toBe('-30000');
      expect(ledgerPostingService.postInventoryAdjustment).toHaveBeenCalledWith(
        ctx,
        expect.stringContaining('inventory-reconciliation:1:5:'),
        expect.objectContaining({
          valueChangeCents: 30000,
          reason: 'count correction',
        })
      );
    });

    it('is a no-op when ledger already matches model', async () => {
      const { service, queryBuilder, accountBalanceService, ledgerPostingService } = buildService();

      queryBuilder.getRawOne.mockResolvedValue({
        totalValue: '90000',
        batchCount: '1',
        itemCount: '1',
      });
      (accountBalanceService.getAccountBalance as any).mockResolvedValue({ balance: '90000' });

      await service.reconcileToModel(ctx, 1, 'count correction');

      expect(ledgerPostingService.postInventoryAdjustment).not.toHaveBeenCalled();
    });
  });
});

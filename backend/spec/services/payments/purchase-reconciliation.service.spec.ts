/**
 * Purchase reconciliation service tests
 *
 * Verifies the ledger-trust ('order') strategy posts AP balance adjustments in the
 * correct direction. AP is a liability: model owing more than the ledger means
 * 'increase' (credit AP); model owing less means 'decrease' (debit AP).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { FinancialService } from '../../../src/services/financial/financial.service';
import { LedgerPostingService } from '../../../src/services/financial/ledger-posting.service';
import {
  LedgerConsistencyGuard,
  PurchaseApProjection,
} from '../../../src/services/financial/ledger-projection';
import { PurchaseReconciliationService } from '../../../src/services/payments/purchase-reconciliation.service';
import { StockPurchase } from '../../../src/services/stock/entities/purchase.entity';

describe('PurchaseReconciliationService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;

  let service: PurchaseReconciliationService;
  let mockFinancialService: jest.Mocked<FinancialService>;
  let mockLedgerPostingService: jest.Mocked<LedgerPostingService>;
  let mockPurchaseRepo: any;
  let mockConnection: any;

  function makePurchase(overrides: Partial<StockPurchase> = {}): StockPurchase {
    return {
      id: 'purchase-1',
      channelId: 1,
      supplierId: 42,
      referenceNumber: 'PO-001',
      totalCost: 10000,
      isCreditPurchase: true,
      paymentStatus: 'pending',
      payments: [],
      ...overrides,
    } as unknown as StockPurchase;
  }

  beforeEach(() => {
    mockFinancialService = {
      getPurchasePaymentStatus: jest.fn(),
    } as any;

    mockLedgerPostingService = {
      postSupplierBalanceAdjustment: jest.fn(),
    } as any;

    mockPurchaseRepo = {
      findOne: jest.fn(),
      create: jest.fn((p: any) => p),
      save: jest.fn(async (p: any) => p),
    };

    mockConnection = {
      getRepository: jest.fn(() => mockPurchaseRepo),
      withTransaction: jest.fn(async (_ctx: any, fn: any) => fn(_ctx)),
    };

    service = new PurchaseReconciliationService(
      mockConnection,
      new LedgerConsistencyGuard(),
      new PurchaseApProjection(mockFinancialService as any),
      mockFinancialService as any,
      mockLedgerPostingService as any
    );
  });

  describe("reconcilePurchase with 'order' strategy", () => {
    it("posts a 'decrease' AP adjustment when the ledger overstates the debt (double-post case)", async () => {
      // Entity model owes 10000, ledger shows 20000 (e.g. from the old double-post)
      const purchase = makePurchase({ totalCost: 10000 });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 20000,
        amountPaid: 0,
        amountOwing: 20000,
      });

      await service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'order' });

      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).toHaveBeenCalledWith(
        ctx,
        `purchase-reconciliation-${purchase.id}`,
        expect.objectContaining({
          amount: 10000,
          direction: 'decrease',
          supplierId: '42',
          purchaseId: purchase.id,
        })
      );
    });

    it("posts an 'increase' AP adjustment when the model owes more than the ledger", async () => {
      // Entity model owes 10000, ledger shows only 4000
      const purchase = makePurchase({ totalCost: 10000 });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 4000,
        amountPaid: 0,
        amountOwing: 4000,
      });

      await service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'order' });

      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).toHaveBeenCalledWith(
        ctx,
        `purchase-reconciliation-${purchase.id}`,
        expect.objectContaining({
          amount: 6000,
          direction: 'increase',
        })
      );
    });

    it('accounts for model payments when computing the diff', async () => {
      // Model: totalCost 10000, paid 7000 -> owing 3000. Ledger: owing 8000.
      const purchase = makePurchase({
        totalCost: 10000,
        payments: [{ amount: 7000 } as any],
      });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 2000,
        amountOwing: 8000,
      });

      await service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'order' });

      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).toHaveBeenCalledWith(
        ctx,
        `purchase-reconciliation-${purchase.id}`,
        expect.objectContaining({
          amount: 5000,
          direction: 'decrease',
        })
      );
    });

    it('posts nothing when model and ledger agree', async () => {
      const purchase = makePurchase({ totalCost: 10000 });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 0,
        amountOwing: 10000,
      });

      await service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'order' });

      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).not.toHaveBeenCalled();
    });

    it('rejects non-credit purchases', async () => {
      const purchase = makePurchase({ isCreditPurchase: false });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);

      await expect(
        service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'order' })
      ).rejects.toThrow('not a credit purchase');

      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).not.toHaveBeenCalled();
    });
  });

  describe("reconcilePurchase with 'ledger' strategy", () => {
    it('creates a synthetic reconciliation payment when the model owes more than the ledger', async () => {
      // Model: totalCost 10000, paid 0 -> owing 10000. Ledger: owing 4000.
      const purchase = makePurchase({ totalCost: 10000 });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 4000,
        amountPaid: 0,
        amountOwing: 4000,
      });

      const result = await service.reconcilePurchase(ctx, {
        purchaseId: purchase.id,
        strategy: 'ledger',
      });

      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 6000,
          method: 'reconciliation',
          purchaseId: purchase.id,
        })
      );
      expect(mockPurchaseRepo.save).toHaveBeenCalled();
      expect(result.paymentStatus).toBe('partial');
      expect(mockLedgerPostingService.postSupplierBalanceAdjustment).not.toHaveBeenCalled();
    });

    it('throws when the ledger shows more owing than the model', async () => {
      const purchase = makePurchase({ totalCost: 10000 });
      mockPurchaseRepo.findOne.mockResolvedValue(purchase);
      mockFinancialService.getPurchasePaymentStatus.mockResolvedValue({
        totalOwed: 20000,
        amountPaid: 0,
        amountOwing: 20000,
      });

      await expect(
        service.reconcilePurchase(ctx, { purchaseId: purchase.id, strategy: 'ledger' })
      ).rejects.toThrow('more owing than the purchase model');
    });
  });
});

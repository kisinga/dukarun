/**
 * SalePostingStrategy: COGS recording is non-fatal when there is no batch stock.
 * Payment/sale ledger posting must succeed even if recordSale fails with insufficient stock.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Order, Payment, RequestContext } from '@vendure/core';
import { SalePostingStrategy } from '../../../src/services/financial/strategies/sale-posting.strategy';

describe('SalePostingStrategy', () => {
  const ctx = { channelId: 34 } as RequestContext;
  let strategy: SalePostingStrategy;
  let mockPostingService: any;
  let mockQueryService: any;
  let mockChartService: any;
  let mockInventoryService: any;
  let mockStockLocationService: any;

  const settledPayment = {
    id: 21,
    state: 'Settled',
    method: 'cash',
    amount: 10000,
    metadata: {},
  } as Payment;

  const orderWithLines = {
    id: 21,
    code: 'XAWMF5QT5QC2ATFR',
    lines: [{ productVariantId: 16, quantity: 1, productVariant: { id: 16 } }],
    customer: { id: '1' },
    orderPlacedAt: new Date(),
  } as unknown as Order;

  beforeEach(() => {
    mockPostingService = { postPayment: jest.fn().mockImplementation(() => Promise.resolve()) };
    mockQueryService = {
      hasInventorySaleCogsForOrder: jest.fn().mockImplementation(() => Promise.resolve(false)),
      invalidateCache: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    mockChartService = {
      validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    mockInventoryService = { recordSale: jest.fn() };
    mockStockLocationService = {
      findAll: jest.fn().mockImplementation(() => Promise.resolve({ items: [{ id: 1 }] })),
    };

    strategy = new SalePostingStrategy(
      mockPostingService as any,
      mockQueryService as any,
      mockChartService as any,
      mockInventoryService as any,
      mockStockLocationService as any
    );
  });

  it('should return success when recordSale fails with Insufficient stock (skip COGS, do not throw)', async () => {
    mockInventoryService.recordSale.mockRejectedValue(
      new Error('Insufficient stock for variant 16. Requested: 1')
    );

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockPostingService.postPayment).toHaveBeenCalled();
    expect(mockInventoryService.recordSale).toHaveBeenCalled();
  });

  it('should return success: false when recordSale fails with a non-stock error', async () => {
    mockInventoryService.recordSale.mockRejectedValue(new Error('Database connection lost'));

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Database connection lost');
  });
});

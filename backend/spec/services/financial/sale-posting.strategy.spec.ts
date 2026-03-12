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
  let mockOrderService: any;
  let mockConnection: any;

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

  // Simulates the real-world case: order object returned without relations loaded (TypeORM default)
  const orderNoRelations = {
    id: 21,
    code: 'XAWMF5QT5QC2ATFR',
    lines: undefined,
    customer: undefined,
    orderPlacedAt: new Date(),
  } as unknown as Order;

  beforeEach(() => {
    mockPostingService = {
      postPayment: jest.fn().mockImplementation(() => Promise.resolve()),
      postCreditSale: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    mockQueryService = {
      hasInventorySaleCogsForOrder: jest.fn().mockImplementation(() => Promise.resolve(false)),
      invalidateCache: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    mockChartService = {
      validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
    };
    mockInventoryService = { recordSale: (jest.fn() as any).mockResolvedValue(undefined) };
    mockStockLocationService = {
      defaultStockLocation: jest.fn().mockImplementation(() => Promise.resolve({ id: 1 })),
    };
    // findOne always returns the fully-hydrated order (simulates DB reload with relations)
    mockOrderService = {
      findOne: jest.fn().mockResolvedValue(orderWithLines as never),
    };
    mockConnection = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 21, customFields: {} } as never),
        update: jest.fn().mockResolvedValue(undefined as never),
      }),
    };

    strategy = new SalePostingStrategy(
      mockPostingService as any,
      mockQueryService as any,
      mockChartService as any,
      mockInventoryService as any,
      mockStockLocationService as any,
      mockOrderService as any,
      mockConnection as any
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

  it('passes openSessionId to postPayment when provided in transaction data', async () => {
    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
      openSessionId: 'session-123',
    });

    expect(result.success).toBe(true);
    expect(mockPostingService.postPayment).toHaveBeenCalledWith(
      ctx,
      String(settledPayment.id),
      expect.objectContaining({
        openSessionId: 'session-123',
      })
    );
  });

  it('passes undefined openSessionId when not provided', async () => {
    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    const postPaymentCall = mockPostingService.postPayment.mock.calls[0];
    const context = postPaymentCall[2];
    expect(context.openSessionId).toBeUndefined();
  });

  it('does not call recordSale when defaultStockLocation returns no id (skip COGS)', async () => {
    mockStockLocationService.defaultStockLocation.mockResolvedValue(null);

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
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
  });

  it('does not call recordSale when defaultStockLocation returns object without id', async () => {
    mockStockLocationService.defaultStockLocation.mockResolvedValue({ name: 'Loc' });

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
  });

  it('treats "Insufficient quantity in batch" as non-fatal (skip COGS)', async () => {
    mockInventoryService.recordSale.mockRejectedValue(
      new Error('Insufficient quantity in batch X. Available: 0, requested: 1')
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
    expect(mockInventoryService.recordSale).toHaveBeenCalled();
  });

  it('treats "Batch not found or not available" as non-fatal (skip COGS)', async () => {
    mockInventoryService.recordSale.mockRejectedValue(
      new Error('Batch batch-1 not found or not available for variant 16')
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
    expect(mockInventoryService.recordSale).toHaveBeenCalled();
  });

  it('calls recordSale with stockLocationId from defaultStockLocation (location consistency)', async () => {
    const locationId = 99;
    mockStockLocationService.defaultStockLocation.mockResolvedValue({ id: locationId });

    await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(mockInventoryService.recordSale).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        stockLocationId: locationId,
        orderId: String(orderWithLines.id),
        lines: expect.any(Array),
      })
    );
  });

  it('does not call recordSale when COGS already posted (idempotency)', async () => {
    mockQueryService.hasInventorySaleCogsForOrder.mockResolvedValue(true);

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
    // findOne must not be called — early return happens before the DB reload
    expect(mockOrderService.findOne).not.toHaveBeenCalled();
  });

  it('always reloads order from DB via orderService.findOne, even when caller passes order with lines', async () => {
    // Defensive reload must always fire — callers may have stale data
    await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines, // already has lines, but reload must still happen
      isCreditSale: false,
    });

    expect(mockOrderService.findOne).toHaveBeenCalledWith(
      ctx,
      orderWithLines.id,
      expect.arrayContaining(['lines', 'lines.productVariant', 'customer'])
    );
  });

  it('skips COGS gracefully when orderService.findOne returns null (order not found)', async () => {
    mockOrderService.findOne.mockResolvedValue(null as never);

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
  });

  it('sets cogsStatus to "recorded" on the order after successful COGS recording', async () => {
    await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderWithLines,
      isCreditSale: false,
    });

    expect(mockInventoryService.recordSale).toHaveBeenCalled();
    const repoMock = mockConnection.getRepository();
    expect(repoMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderWithLines.id }),
      expect.objectContaining({
        customFields: expect.objectContaining({ cogsStatus: 'recorded' }),
      })
    );
  });

  it('sets cogsStatus to "skipped" when COGS is skipped due to insufficient stock', async () => {
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
    const repoMock = mockConnection.getRepository();
    expect(repoMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: orderWithLines.id }),
      expect.objectContaining({
        customFields: expect.objectContaining({ cogsStatus: 'skipped' }),
      })
    );
  });

  it('calls recordSale even when order.lines is undefined (TypeORM unloaded relation)', async () => {
    // This is the real-world bug scenario: callers pass an order where the lines
    // relation was not loaded (e.g. findOne with only ['payments'] or ['customer']).
    // The strategy must reload from DB via orderService.findOne.
    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderNoRelations,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockOrderService.findOne).toHaveBeenCalledWith(
      ctx,
      orderNoRelations.id,
      expect.arrayContaining(['lines', 'customer'])
    );
    expect(mockInventoryService.recordSale).toHaveBeenCalled();
  });

  it('does not call recordSale when order has no lines with quantity > 0', async () => {
    const orderNoLines = {
      ...orderWithLines,
      lines: [],
    } as unknown as Order;
    mockOrderService.findOne.mockResolvedValue(orderNoLines as never);

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderNoLines,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
  });

  it('does not call recordSale when all line quantities are zero', async () => {
    const orderZeroQty = {
      ...orderWithLines,
      lines: [{ productVariantId: 16, quantity: 0, productVariant: { id: 16 } }],
    } as unknown as Order;
    mockOrderService.findOne.mockResolvedValue(orderZeroQty as never);

    const result = await strategy.post({
      ctx,
      sourceId: String(settledPayment.id),
      channelId: ctx.channelId as number,
      payment: settledPayment,
      order: orderZeroQty,
      isCreditSale: false,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
  });

  it('credit sale calls recordSale when location present', async () => {
    const orderCredit = {
      ...orderWithLines,
      totalWithTax: 10000,
      total: 10000,
      customer: { id: '1' },
    } as unknown as Order;

    const result = await strategy.post({
      ctx,
      sourceId: String(orderCredit.id),
      channelId: ctx.channelId as number,
      order: orderCredit,
      isCreditSale: true,
    });

    expect(result.success).toBe(true);
    expect(mockInventoryService.recordSale).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        orderId: String(orderCredit.id),
        stockLocationId: 1,
      })
    );
  });
});

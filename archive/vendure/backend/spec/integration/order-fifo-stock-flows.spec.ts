/**
 * Order qty / FIFO / stock integration flows
 *
 * Verifies that stock check (BatchAwareStockLevelService) and COGS recording
 * (SalePostingStrategy → recordSale) use the same stock location, and that
 * end-to-end flows behave correctly when recordSale succeeds or fails.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { BatchAwareStockLevelService } from '../../src/services/stock/batch-aware-stock-level.service';
import { SalePostingStrategy } from '../../src/services/financial/strategies/sale-posting.strategy';
import { BatchStockLocationStrategy } from '../../src/plugins/ledger/batch-stock-location.strategy';

describe('Order FIFO / stock integration flows', () => {
  const channelId = 1;
  const ctx = { channelId } as RequestContext;
  const DEFAULT_LOCATION_ID = 99;

  let stockLocationService: any;
  let inventoryStore: any;
  let batchAwareStock: BatchAwareStockLevelService;
  let mockPostingService: any;
  let mockQueryService: any;
  let mockChartService: any;
  let mockInventoryService: any;
  let mockOrderService: any;
  let salePostingStrategy: SalePostingStrategy;

  beforeEach(() => {
    stockLocationService = {
      defaultStockLocation: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: DEFAULT_LOCATION_ID })),
    };

    inventoryStore = {
      getOpenBatches: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve([{ id: 'b1', quantity: 10, productVariantId: 100 }])
        ),
    };

    const connection = {};
    const configService = {
      catalogOptions: {
        stockLocationStrategy: {
          getAvailableStock: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ stockOnHand: 0, stockAllocated: 0 })),
        },
      },
    } as any;

    batchAwareStock = new BatchAwareStockLevelService(
      connection as any,
      stockLocationService,
      configService,
      inventoryStore
    );

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
    mockInventoryService = {
      recordSale: (jest.fn() as any).mockResolvedValue(undefined),
    };

    // findOne returns whichever order the strategy requests — tests override per-case
    mockOrderService = {
      findOne: jest.fn().mockImplementation((_ctx: any, _id: any) =>
        Promise.resolve({
          id: _id,
          code: `ORD-${_id}`,
          lines: [{ productVariantId: 100, quantity: 2, productVariant: { id: 100 } }],
          customer: { id: 'cust-1' },
          orderPlacedAt: new Date(),
        })
      ),
    };
    const mockConnection = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue({ id: 'order-1', customFields: {} } as never),
        update: jest.fn().mockResolvedValue(undefined as never),
      }),
    };

    const mockEventBus = { publish: jest.fn() };

    salePostingStrategy = new SalePostingStrategy(
      mockPostingService as any,
      mockQueryService as any,
      mockChartService as any,
      mockInventoryService as any,
      mockOrderService as any,
      mockConnection as any,
      mockEventBus as any
    );
  });

  describe('channel-scoped stock and COGS', () => {
    it('BatchAwareStockLevelService uses defaultStockLocation, SalePostingStrategy records COGS by channel', async () => {
      const variantId = 'variant_100';

      const stockResult = await batchAwareStock.getAvailableStock(ctx, variantId);

      expect(stockLocationService.defaultStockLocation).toHaveBeenCalledWith(ctx);
      expect(inventoryStore.getOpenBatches).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          channelId,
          stockLocationId: DEFAULT_LOCATION_ID,
          productVariantId: variantId,
        })
      );
      expect(stockResult.stockOnHand).toBe(10);
      expect(stockResult.stockAllocated).toBe(0);

      const order = {
        id: 'order-1',
        code: 'ORD-001',
        lines: [{ productVariantId: 100, quantity: 2, productVariant: { id: 100 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;
      const payment = {
        id: 'pay-1',
        state: 'Settled',
        method: 'cash',
        amount: 5000,
        metadata: {},
      } as any;

      await salePostingStrategy.post({
        ctx,
        sourceId: payment.id,
        channelId,
        payment,
        order,
        isCreditSale: false,
      });

      expect(mockInventoryService.recordSale).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          orderId: 'order-1',
          channelId,
          lines: expect.arrayContaining([
            expect.objectContaining({ productVariantId: '100', quantity: 2 }),
          ]),
        })
      );
      // stockLocationId should NOT be passed — batches are found by channel + variant
      const recordSaleInput = mockInventoryService.recordSale.mock.calls[0][1];
      expect(recordSaleInput.stockLocationId).toBeUndefined();
    });
  });

  describe('cash sale flow', () => {
    it('posting cash sale calls recordSale with order lines', async () => {
      const order = {
        id: 'order-3',
        code: 'ORD-003',
        lines: [
          { productVariantId: 10, quantity: 3, productVariant: { id: 10 } },
          { productVariantId: 20, quantity: 1, productVariant: { id: 20 } },
        ],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;
      mockOrderService.findOne.mockResolvedValue(order);

      const result = await salePostingStrategy.post({
        ctx,
        sourceId: 'pay-3',
        channelId,
        payment: {
          id: 'pay-3',
          state: 'Settled',
          method: 'cash',
          amount: 10000,
          metadata: {},
        } as any,
        order,
        isCreditSale: false,
      });

      expect(result.success).toBe(true);
      expect(mockPostingService.postPayment).toHaveBeenCalled();
      expect(mockInventoryService.recordSale).toHaveBeenCalledTimes(1);
      const recordSaleInput = mockInventoryService.recordSale.mock.calls[0][1];
      expect(recordSaleInput.orderId).toBe('order-3');
      expect(recordSaleInput.stockLocationId).toBeUndefined();
      expect(recordSaleInput.lines).toHaveLength(2);
      expect(recordSaleInput.lines.map((l: any) => l.quantity)).toEqual([3, 1]);
    });

    it('when recordSale fails with insufficient stock, posting still succeeds and COGS is skipped', async () => {
      mockInventoryService.recordSale.mockRejectedValueOnce(
        new Error('Insufficient stock for variant 10. Requested: 5')
      );

      const order = {
        id: 'order-4',
        code: 'ORD-004',
        lines: [{ productVariantId: 10, quantity: 5, productVariant: { id: 10 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;

      const result = await salePostingStrategy.post({
        ctx,
        sourceId: 'pay-4',
        channelId,
        payment: {
          id: 'pay-4',
          state: 'Settled',
          method: 'cash',
          amount: 5000,
          metadata: {},
        } as any,
        order,
        isCreditSale: false,
      });

      expect(result.success).toBe(true);
      expect(mockPostingService.postPayment).toHaveBeenCalled();
      expect(mockInventoryService.recordSale).toHaveBeenCalled();
    });

    it('when recordSale fails with non-stock error, posting fails', async () => {
      mockInventoryService.recordSale.mockRejectedValueOnce(new Error('Database connection lost'));

      const order = {
        id: 'order-5',
        code: 'ORD-005',
        lines: [{ productVariantId: 10, quantity: 1, productVariant: { id: 10 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;

      const result = await salePostingStrategy.post({
        ctx,
        sourceId: 'pay-5',
        channelId,
        payment: {
          id: 'pay-5',
          state: 'Settled',
          method: 'cash',
          amount: 1000,
          metadata: {},
        } as any,
        order,
        isCreditSale: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection lost');
    });
  });

  describe('credit sale flow', () => {
    it('posting credit sale calls recordSale with order', async () => {
      const order = {
        id: 'order-6',
        code: 'ORD-006',
        totalWithTax: 8000,
        total: 8000,
        lines: [{ productVariantId: 30, quantity: 2, productVariant: { id: 30 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;

      const result = await salePostingStrategy.post({
        ctx,
        sourceId: order.id,
        channelId,
        order,
        isCreditSale: true,
      });

      expect(result.success).toBe(true);
      expect(mockPostingService.postCreditSale).toHaveBeenCalled();
      expect(mockInventoryService.recordSale).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          orderId: 'order-6',
          channelId,
          lines: expect.any(Array),
        })
      );
    });
  });

  describe('idempotency and skip conditions', () => {
    it('when COGS already posted for order, recordSale is not called', async () => {
      mockQueryService.hasInventorySaleCogsForOrder.mockResolvedValue(true);

      const order = {
        id: 'order-7',
        code: 'ORD-007',
        lines: [{ productVariantId: 40, quantity: 1, productVariant: { id: 40 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;

      await salePostingStrategy.post({
        ctx,
        sourceId: 'pay-7',
        channelId,
        payment: {
          id: 'pay-7',
          state: 'Settled',
          method: 'cash',
          amount: 500,
          metadata: {},
        } as any,
        order,
        isCreditSale: false,
      });

      expect(mockInventoryService.recordSale).not.toHaveBeenCalled();
    });

    it('recordSale is called even without defaultStockLocation — finds batches by channel', async () => {
      stockLocationService.defaultStockLocation.mockResolvedValue(null);

      const order = {
        id: 'order-8',
        code: 'ORD-008',
        lines: [{ productVariantId: 50, quantity: 1, productVariant: { id: 50 } }],
        customer: { id: 'cust-1' },
        orderPlacedAt: new Date(),
      } as any;

      await salePostingStrategy.post({
        ctx,
        sourceId: 'pay-8',
        channelId,
        payment: {
          id: 'pay-8',
          state: 'Settled',
          method: 'cash',
          amount: 500,
          metadata: {},
        } as any,
        order,
        isCreditSale: false,
      });

      expect(mockInventoryService.recordSale).toHaveBeenCalled();
    });
  });

  describe('BatchStockLocationStrategy (global stock resolution)', () => {
    let strategy: BatchStockLocationStrategy;
    let andWhereCalls: Array<[string, unknown]>;
    let whereCalls: Array<[string, unknown]>;

    beforeEach(() => {
      andWhereCalls = [];
      whereCalls = [];

      const mockQb: Record<string, jest.Mock> = {};
      mockQb.select = jest.fn().mockReturnValue(mockQb);
      mockQb.where = jest.fn().mockImplementation((...args: unknown[]) => {
        whereCalls.push([args[0] as string, args[1]]);
        return mockQb;
      });
      mockQb.andWhere = jest.fn().mockImplementation((...args: unknown[]) => {
        andWhereCalls.push([args[0] as string, args[1]]);
        return mockQb;
      });
      mockQb.getRawOne = jest.fn().mockImplementation(() => Promise.resolve({ total: '10' }));

      const strategyConnection = {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(mockQb),
        }),
      };

      strategy = new BatchStockLocationStrategy();
      (strategy as any).connection = strategyConnection;
    });

    it('filters by channel and variant, not by stockLocationId', async () => {
      await strategy.getAvailableStock(ctx, 200, []);

      const channelClause = whereCalls.find(([clause]) => (clause as string).includes('channelId'));
      expect(channelClause).toBeDefined();
      expect(channelClause![1]).toEqual({ channelId: channelId });

      const variantClause = andWhereCalls.find(([clause]) =>
        (clause as string).includes('productVariantId')
      );
      expect(variantClause).toBeDefined();
      expect(variantClause![1]).toEqual({ productVariantId: 200 });

      const locationClause = andWhereCalls.find(([clause]) =>
        (clause as string).includes('stockLocationId')
      );
      expect(locationClause).toBeUndefined();
    });
  });
});

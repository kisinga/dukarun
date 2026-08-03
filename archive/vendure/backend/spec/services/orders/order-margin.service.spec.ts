/**
 * OrderMarginService Tests
 *
 * Covers: revenue basis (proratedLinePrice — tax-exclusive, post-discount, no shipping),
 * voided sale_cogs exclusion, each unreliable reason, marginPercent divide-by-zero,
 * and retrySkippedCogs success / still-skipped / error paths.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Order, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { OrderMarginService } from '../../../src/services/orders/order-margin.service';
import { SalePostingStrategy } from '../../../src/services/financial/strategies/sale-posting.strategy';
import { SaleCogs } from '../../../src/services/inventory/entities/sale-cogs.entity';

describe('OrderMarginService', () => {
  const ctx = { channelId: 1 } as RequestContext;

  const makeLine = (proratedLinePrice: number, extra: Record<string, any> = {}) =>
    ({
      proratedLinePrice,
      // Present to prove they are NOT part of the revenue basis
      proratedLinePriceWithTax: proratedLinePrice + 9999,
      linePrice: proratedLinePrice + 5555,
      ...extra,
    }) as any;

  const makeOrder = (overrides: Record<string, any> = {}) =>
    ({
      id: 21,
      code: 'ORD-21',
      lines: [makeLine(100000), makeLine(50000)],
      shippingWithTax: 7777, // shipping must not enter revenue
      taxLines: [{ amount: 1234 }],
      customFields: { cogsStatus: 'recorded' },
      ...overrides,
    }) as unknown as Order;

  const buildService = (cogsRows: any[]) => {
    const saleCogsRepo = {
      // Emulates the query's `voidedAt IS NULL` criteria
      find: jest.fn((_opts?: any) =>
        Promise.resolve(cogsRows.filter(r => r.voidedAt == null))
      ),
    };
    const connection = {
      getRepository: jest.fn((_ctx: any, _entity: any): any => saleCogsRepo),
    } as unknown as TransactionalConnection;

    const orderService = {
      findOne: jest.fn(),
    } as any;

    const salePostingStrategy = {
      recordSaleCogsIfNeeded: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as SalePostingStrategy;

    const service = new OrderMarginService(orderService, connection, salePostingStrategy);
    return { service, orderService, saleCogsRepo, salePostingStrategy };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes margin from proratedLinePrice only (tax, discounts, shipping excluded)', async () => {
    const { service, orderService } = buildService([
      { cogsCents: 10000, quantity: 2 },
      { cogsCents: 5000, quantity: 1 },
      { cogsCents: 999999, quantity: 9, voidedAt: new Date() }, // voided — must be excluded by the query
    ]);
    orderService.findOne.mockResolvedValue(makeOrder());

    const margin = await service.getOrderMargin(ctx, 21);

    // 100000 + 50000 from proratedLinePrice; WithTax/listPrice/shipping ignored
    expect(margin.netRevenueCents).toBe(150000);
    expect(margin.cogsCents).toBe(15000);
    expect(margin.marginCents).toBe(135000);
    expect(margin.marginPercent).toBeCloseTo(90);
    expect(margin.reliable).toBe(true);
    expect(margin.unreliableReasons).toEqual([]);
  });

  it('queries sale_cogs channel-scoped, non-voided, for this order', async () => {
    const { service, orderService, saleCogsRepo } = buildService([]);
    orderService.findOne.mockResolvedValue(makeOrder({ customFields: { cogsStatus: 'recorded' } }));

    await service.getOrderMargin(ctx, 21);

    const where = saleCogsRepo.find.mock.calls[0][0].where;
    expect(where.channelId).toBe(1);
    expect(where.orderId).toBe('21');
    expect(where.voidedAt).toBeDefined(); // IsNull() operator
  });

  it('flags SKIPPED_COGS when cogsStatus is skipped', async () => {
    const { service, orderService } = buildService([]);
    orderService.findOne.mockResolvedValue(makeOrder({ customFields: { cogsStatus: 'skipped' } }));

    const margin = await service.getOrderMargin(ctx, 21);

    expect(margin.reliable).toBe(false);
    expect(margin.unreliableReasons).toContain('SKIPPED_COGS');
  });

  it('flags ZERO_COST_BATCH when a non-voided row has zero cost for positive quantity', async () => {
    const { service, orderService } = buildService([
      { cogsCents: 0, quantity: 3 },
      { cogsCents: 5000, quantity: 1 },
    ]);
    orderService.findOne.mockResolvedValue(makeOrder());

    const margin = await service.getOrderMargin(ctx, 21);

    expect(margin.reliable).toBe(false);
    expect(margin.unreliableReasons).toEqual(['ZERO_COST_BATCH']);
    expect(margin.cogsCents).toBe(5000);
  });

  it('flags NO_COGS_DATA for orders with lines but no COGS rows and no recorded status', async () => {
    const { service, orderService } = buildService([]);
    orderService.findOne.mockResolvedValue(makeOrder({ customFields: {} }));

    const margin = await service.getOrderMargin(ctx, 21);

    expect(margin.reliable).toBe(false);
    expect(margin.unreliableReasons).toEqual(['NO_COGS_DATA']);
  });

  it('does not flag NO_COGS_DATA when cogsStatus is recorded', async () => {
    const { service, orderService } = buildService([]);
    orderService.findOne.mockResolvedValue(makeOrder({ customFields: { cogsStatus: 'recorded' } }));

    const margin = await service.getOrderMargin(ctx, 21);

    expect(margin.reliable).toBe(true);
  });

  it('returns null marginPercent when net revenue is zero', async () => {
    const { service, orderService } = buildService([{ cogsCents: 1000, quantity: 1 }]);
    orderService.findOne.mockResolvedValue(makeOrder({ lines: [makeLine(0)] }));

    const margin = await service.getOrderMargin(ctx, 21);

    expect(margin.netRevenueCents).toBe(0);
    expect(margin.marginPercent).toBeNull();
  });

  it('throws when the order does not exist', async () => {
    const { service, orderService } = buildService([]);
    orderService.findOne.mockResolvedValue(null);

    await expect(service.getOrderMargin(ctx, 999)).rejects.toThrow(UserInputError);
  });

  describe('retrySkippedCogs', () => {
    it('re-runs COGS recording and returns the fresh margin', async () => {
      const { service, orderService, salePostingStrategy } = buildService([
        { cogsCents: 20000, quantity: 2 },
      ]);
      orderService.findOne
        .mockResolvedValueOnce(makeOrder({ customFields: { cogsStatus: 'skipped' } }))
        .mockResolvedValueOnce(makeOrder({ customFields: { cogsStatus: 'recorded' } }));

      const margin = await service.retrySkippedCogs(ctx, 21);

      expect(salePostingStrategy.recordSaleCogsIfNeeded).toHaveBeenCalledTimes(1);
      expect(margin.cogsCents).toBe(20000);
      expect(margin.reliable).toBe(true);
    });

    it('returns the current margin with SKIPPED_COGS when stock is still insufficient', async () => {
      const { service, orderService, salePostingStrategy } = buildService([]);
      // Both loads still show skipped (recordSaleCogsIfNeeded swallowed the insufficient-stock case)
      orderService.findOne.mockResolvedValue(
        makeOrder({ customFields: { cogsStatus: 'skipped' } })
      );

      const margin = await service.retrySkippedCogs(ctx, 21);

      expect(salePostingStrategy.recordSaleCogsIfNeeded).toHaveBeenCalledTimes(1);
      expect(margin.reliable).toBe(false);
      expect(margin.unreliableReasons).toContain('SKIPPED_COGS');
    });

    it('throws when the order COGS is not marked as skipped', async () => {
      const { service, orderService, salePostingStrategy } = buildService([]);
      orderService.findOne.mockResolvedValue(makeOrder({ customFields: { cogsStatus: 'recorded' } }));

      await expect(service.retrySkippedCogs(ctx, 21)).rejects.toThrow(UserInputError);
      expect(salePostingStrategy.recordSaleCogsIfNeeded).not.toHaveBeenCalled();
    });

    it('throws when the order does not exist', async () => {
      const { service, orderService } = buildService([]);
      orderService.findOne.mockResolvedValue(null);

      await expect(service.retrySkippedCogs(ctx, 999)).rejects.toThrow(UserInputError);
    });
  });

  describe('getPeriodMarginStats', () => {
    const makePeriodOrder = (
      id: number,
      linePrices: number[],
      cogsStatus: string | null = 'recorded'
    ) =>
      ({
        id,
        code: `ORD-${id}`,
        state: 'PaymentSettled',
        lines: linePrices.map(proratedLinePrice => ({ proratedLinePrice })),
        customFields: { cogsStatus },
      }) as unknown as Order;

    const buildPeriodService = (orders: Order[], cogsRows: any[]) => {
      const qbCalls: { method: string; args: any[] }[] = [];
      const qb: any = {};
      for (const m of ['innerJoin', 'leftJoinAndSelect', 'where', 'andWhere']) {
        qb[m] = jest.fn((...args: any[]) => {
          qbCalls.push({ method: m, args });
          return qb;
        });
      }
      qb.getMany = jest.fn(() => Promise.resolve(orders));

      const orderRepo = { createQueryBuilder: jest.fn((_alias?: any) => qb) };
      const saleCogsRepo = {
        find: jest.fn((_opts?: any) =>
          Promise.resolve(cogsRows.filter(r => r.voidedAt == null))
        ),
      };
      const connection = {
        getRepository: jest.fn((_ctx: any, entity: any): any => {
          if (entity === Order) return orderRepo;
          if (entity === SaleCogs) return saleCogsRepo;
          throw new Error(`Unexpected entity: ${entity?.name}`);
        }),
      } as unknown as TransactionalConnection;

      const service = new OrderMarginService({} as any, connection, {} as any);
      return { service, qbCalls, saleCogsRepo };
    };

    it('aggregates revenue and COGS for settled orders in the period', async () => {
      const orders = [
        makePeriodOrder(1, [100000, 50000]),
        makePeriodOrder(2, [30000]),
      ];
      const { service } = buildPeriodService(orders, [
        { orderId: '1', cogsCents: 20000, quantity: 2 },
        { orderId: '1', cogsCents: 777, quantity: 1, voidedAt: new Date() }, // voided — excluded
        { orderId: '2', cogsCents: 5000, quantity: 1 },
      ]);

      const stats = await service.getPeriodMarginStats(ctx, '2026-07-01', '2026-07-31');

      expect(stats.netRevenueCents).toBe(180000);
      expect(stats.cogsCents).toBe(25000);
      expect(stats.grossMarginCents).toBe(155000);
      expect(stats.unreliableOrderCount).toBe(0);
    });

    it('filters by settled/fulfilled states, channel and orderPlacedAt range', async () => {
      const { service, qbCalls } = buildPeriodService([], []);

      await service.getPeriodMarginStats(ctx, '2026-07-01', '2026-07-31');

      const stateCall = qbCalls.find(c => c.method === 'where');
      expect(stateCall?.args[1].states).toEqual([
        'PaymentSettled',
        'Fulfilled',
        'Shipped',
        'Delivered',
      ]);
      const joinCall = qbCalls.find(c => c.method === 'innerJoin');
      expect(joinCall?.args[2]).toContain('channelId');
      const dateCalls = qbCalls.filter(
        c => c.method === 'andWhere' && String(c.args[0]).includes('orderPlacedAt')
      );
      expect(dateCalls).toHaveLength(3); // IS NOT NULL + >= start + <= end
    });

    it('counts unreliable orders: skipped, zero-cost rows, and missing COGS', async () => {
      const orders = [
        makePeriodOrder(1, [10000], 'skipped'), // SKIPPED_COGS
        makePeriodOrder(2, [10000], 'recorded'), // ZERO_COST_BATCH via rows
        makePeriodOrder(3, [10000], null), // NO_COGS_DATA (no rows)
        makePeriodOrder(4, [10000], 'recorded'), // reliable
      ];
      const { service } = buildPeriodService(orders, [
        { orderId: '2', cogsCents: 0, quantity: 2 },
        { orderId: '4', cogsCents: 4000, quantity: 1 },
      ]);

      const stats = await service.getPeriodMarginStats(ctx, '2026-07-01', '2026-07-31');

      expect(stats.unreliableOrderCount).toBe(3);
      expect(stats.cogsCents).toBe(4000);
    });

    it('returns zeros when the period has no orders', async () => {
      const { service, saleCogsRepo } = buildPeriodService([], []);

      const stats = await service.getPeriodMarginStats(ctx, '2026-07-01', '2026-07-31');

      expect(stats).toEqual({
        netRevenueCents: 0,
        cogsCents: 0,
        grossMarginCents: 0,
        unreliableOrderCount: 0,
      });
      expect(saleCogsRepo.find).not.toHaveBeenCalled();
    });
  });
});

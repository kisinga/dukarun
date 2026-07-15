import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Channel,
  ListQueryBuilder,
  Product,
  ProductVariant,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core';
import { InventoryAlertService } from '../../../src/services/inventory/inventory-alert.service';
import { InventoryBatch as InventoryBatchEntity } from '../../../src/services/inventory/entities/inventory-batch.entity';

const mockChannel = (lowStockThreshold = 10): Channel =>
  ({
    id: 1,
    customFields: { lowStockThreshold },
  }) as any;

const mockQueryBuilder = (
  overrides: {
    getRawOne?: () => Promise<{ count: string } | null>;
    getManyAndCount?: () => Promise<[[Product], number]>;
  } = {}
) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getQuery: jest.fn().mockReturnValue('VARIANT_SUBQUERY_SQL'),
    getParameters: jest.fn().mockReturnValue({ channelId_alert: 1, threshold_alert: 10 }),
    getRawOne: overrides.getRawOne
      ? (jest.fn(overrides.getRawOne) as jest.Mock<any>)
      : (jest.fn() as jest.Mock<any>).mockResolvedValue({ count: '3' }),
    getManyAndCount: overrides.getManyAndCount
      ? (jest.fn(overrides.getManyAndCount) as jest.Mock<any>)
      : (jest.fn() as jest.Mock<any>).mockResolvedValue([[], 0]),
  };
  return qb;
};

const buildService = () => {
  const channelRepo = { findOne: jest.fn() };
  const variantRepo = { createQueryBuilder: jest.fn() };
  const productRepo = { createQueryBuilder: jest.fn() };

  const connection = {
    getRepository: jest.fn((ctx: RequestContext, entity: any): any => {
      if (entity === Channel || entity.name === 'Channel') return channelRepo;
      if (entity === ProductVariant || entity.name === 'ProductVariant') return variantRepo;
      if (entity === Product || entity.name === 'Product') return productRepo;
      throw new Error(`Unexpected entity: ${entity?.name || entity}`);
    }),
  } as unknown as TransactionalConnection;

  const listQueryBuilder = {
    build: jest.fn(),
  } as unknown as ListQueryBuilder;

  const service = new InventoryAlertService(connection, listQueryBuilder);
  return { service, channelRepo, variantRepo, productRepo, connection, listQueryBuilder };
};

describe('InventoryAlertService', () => {
  const ctx = { channelId: 1 } as RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zero counts when no channel', async () => {
    const { service } = buildService();
    const result = await service.getAlertCounts({} as RequestContext);
    expect(result).toEqual({ lowStockCount: 0, expiringSoonCount: 0, expiredCount: 0 });
  });

  it('uses channel low-stock threshold defaulting to 10', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel());
    (variantRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());
    (productRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());

    const result = await service.getAlertCounts(ctx);
    expect(result.lowStockCount).toBe(3);
    expect(variantRepo.createQueryBuilder).toHaveBeenCalledWith('variant');
  });

  it('respects custom channel low-stock threshold', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel(5));
    (variantRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());
    (productRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());

    const result = await service.getAlertCounts(ctx);
    expect(result.lowStockCount).toBe(3);
  });

  it('counts expiring-soon products', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel());
    let callCount = 0;
    (variantRepo.createQueryBuilder as any).mockImplementation(() => {
      callCount++;
      return mockQueryBuilder();
    });
    (productRepo.createQueryBuilder as any).mockImplementation(() => mockQueryBuilder());

    const result = await service.getAlertCounts(ctx, 30);
    expect(result.expiringSoonCount).toBe(3);
  });

  it('counts expired products', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel());
    (variantRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());
    (productRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());

    const result = await service.getAlertCounts(ctx);
    expect(result.expiredCount).toBe(3);
  });

  it('low-stock subquery starts from ProductVariant with a LEFT JOIN to batches', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel());
    const variantQb = mockQueryBuilder();
    (variantRepo.createQueryBuilder as any).mockReturnValue(variantQb);
    (productRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());

    await service.getAlertCounts(ctx);

    const leftJoinCalls = variantQb.leftJoin.mock.calls;
    expect(leftJoinCalls.some((call: any[]) => call[0] === InventoryBatchEntity)).toBe(true);
  });

  it('low-stock subquery scopes products to the current channel', async () => {
    const { service, channelRepo, variantRepo, productRepo } = buildService();
    (channelRepo.findOne as any).mockResolvedValue(mockChannel());
    const variantQb = mockQueryBuilder();
    (variantRepo.createQueryBuilder as any).mockReturnValue(variantQb);
    (productRepo.createQueryBuilder as any).mockReturnValue(mockQueryBuilder());

    await service.getAlertCounts(ctx);

    const innerJoinCalls = variantQb.innerJoin.mock.calls;
    expect(innerJoinCalls.some((call: any[]) => call[0] === 'variant.channels')).toBe(true);
  });

  describe('findAlertProducts', () => {
    it('returns empty list when no channel', async () => {
      const { service } = buildService();
      const result = await service.findAlertProducts({} as RequestContext, 'LOW_STOCK');
      expect(result).toEqual({ items: [], totalItems: 0 });
    });

    it('builds a ListQueryBuilder query restricted by the alert variant subquery', async () => {
      const { service, channelRepo, variantRepo, listQueryBuilder } = buildService();
      (channelRepo.findOne as any).mockResolvedValue(mockChannel());
      const variantQb = mockQueryBuilder();
      (variantRepo.createQueryBuilder as any).mockReturnValue(variantQb);

      const listQb = mockQueryBuilder({
        getManyAndCount: async () => [[{ id: 'p1' } as Product], 1],
      });
      (listQueryBuilder.build as any).mockReturnValue(listQb);

      const result = await service.findAlertProducts(ctx, 'LOW_STOCK', { take: 10, skip: 0 });

      expect(listQueryBuilder.build).toHaveBeenCalledWith(
        Product,
        { take: 10, skip: 0 },
        { channelId: 1 }
      );
      expect(listQb.andWhere).toHaveBeenCalledWith(
        'product.id IN (VARIANT_SUBQUERY_SQL)',
        expect.any(Object)
      );
      expect(result.totalItems).toBe(1);
      expect(result.items[0].id).toBe('p1');
    });
  });
});

/**
 * CustomVendureStockMovementService tests.
 *
 * Ensures fulfillment creates Sales and publishes StockMovementEvent without updating StockLevel,
 * and that product create/update stock delegates to LocalStockMovementService.adjustStockLevel.
 * See backend/src/services/stock/STOCK_MOVEMENT_OVERRIDE.md.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  EventBus,
  OrderLine,
  RequestContext,
  Sale,
  StockLevelService,
  StockLocationService,
  StockMovementEvent,
  TransactionalConnection,
} from '@vendure/core';
import { CustomVendureStockMovementService } from '../../../src/services/stock/custom-vendure-stock-movement.service';
import { StockMovementService as LocalStockMovementService } from '../../../src/services/stock/stock-movement.service';

describe('CustomVendureStockMovementService', () => {
  const ctx = { channelId: 1 } as RequestContext;
  let connection: jest.Mocked<TransactionalConnection>;
  let eventBus: jest.Mocked<EventBus>;
  let stockLevelService: jest.Mocked<StockLevelService>;
  let stockLocationService: jest.Mocked<StockLocationService>;
  let localStock: jest.Mocked<LocalStockMovementService>;
  let listQueryBuilder: any;
  let globalSettingsService: any;
  let service: CustomVendureStockMovementService;

  beforeEach(() => {
    eventBus = { publish: jest.fn().mockImplementation(() => Promise.resolve()) } as any;
    stockLevelService = {
      updateStockOnHandForLocation: jest.fn(),
      updateStockAllocatedForLocation: jest.fn(),
    } as any;
    stockLocationService = {
      getSaleLocations: jest.fn(),
      defaultStockLocation: jest.fn(),
    } as any;
    localStock = {
      getCurrentStock: jest.fn().mockImplementation(() => Promise.resolve(0)),
      adjustStockLevel: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    } as any;
    listQueryBuilder = {};
    globalSettingsService = {};

    const orderLineRepo = {
      find: jest.fn().mockImplementation(() => Promise.resolve([])),
    };
    const saleRepo = {
      save: jest.fn((entities: any[]) => Promise.resolve(entities ?? [])),
    };
    connection = {
      getRepository: jest.fn((_ctx: any, entity: any) => {
        if (entity === OrderLine) return orderLineRepo;
        if (entity === Sale) return saleRepo;
        return {};
      }),
      getEntityOrThrow: jest.fn(),
    } as any;

    service = new CustomVendureStockMovementService(
      connection,
      listQueryBuilder,
      globalSettingsService,
      stockLevelService,
      eventBus,
      stockLocationService,
      localStock
    );
  });

  describe('createSalesForOrder', () => {
    it('does not call stockLevelService.updateStockOnHandForLocation or updateStockAllocatedForLocation', async () => {
      (connection.getRepository as jest.Mock).mockImplementation((_ctx: any, entity: any) => {
        if (entity === OrderLine)
          return { find: jest.fn().mockImplementation(() => Promise.resolve([])) };
        if (entity === Sale)
          return { save: jest.fn().mockImplementation(() => Promise.resolve([])) };
        return {};
      });

      await service.createSalesForOrder(ctx, []);

      expect(stockLevelService.updateStockOnHandForLocation).not.toHaveBeenCalled();
      expect(stockLevelService.updateStockAllocatedForLocation).not.toHaveBeenCalled();
    });

    it('publishes StockMovementEvent when sales are created', async () => {
      const savedSales = [{ id: '1', quantity: -2 }];
      const orderLine = {
        id: 'ol1',
        productVariantId: 'pv1',
        productVariant: { id: 'pv1' },
      };
      const productVariant = { id: 'pv1' };
      const location = { id: 'loc1' };

      (connection.getRepository as jest.Mock).mockImplementation((_ctx: any, entity: any) => {
        if (entity === OrderLine)
          return { find: jest.fn().mockImplementation(() => Promise.resolve([orderLine])) };
        if (entity === Sale)
          return { save: jest.fn().mockImplementation(() => Promise.resolve(savedSales)) };
        return {};
      });
      (connection as any).getEntityOrThrow = jest
        .fn()
        .mockImplementation(() => Promise.resolve(productVariant));
      (stockLocationService as any).getSaleLocations = jest
        .fn()
        .mockImplementation(() => Promise.resolve([{ location }]));

      await service.createSalesForOrder(ctx, [{ orderLineId: 'ol1', quantity: 2 }]);

      expect(eventBus.publish).toHaveBeenCalled();
      const published = (eventBus.publish as jest.Mock).mock.calls[0][0] as StockMovementEvent;
      expect(published).toBeInstanceOf(StockMovementEvent);
      expect(published.ctx).toBe(ctx);
    });

    it('integration-style: creates Sale entities and publishes StockMovementEvent without updating StockLevel', async () => {
      const orderLine = {
        id: 'ol1',
        productVariantId: 'pv1',
        productVariant: { id: 'pv1' },
      };
      const productVariant = { id: 'pv1' };
      const location = { id: 'loc1' };
      const savedSalesCapture: any[] = [];
      const saleSave = jest.fn().mockImplementation((entities: unknown) => {
        const arr = Array.isArray(entities) ? entities : [];
        savedSalesCapture.push(...arr);
        return Promise.resolve(entities ?? []);
      });

      (connection.getRepository as jest.Mock).mockImplementation((_ctx: any, entity: any) => {
        if (entity === OrderLine)
          return { find: jest.fn().mockImplementation(() => Promise.resolve([orderLine])) };
        if (entity === Sale) return { save: saleSave };
        return {};
      });
      (connection as any).getEntityOrThrow = jest
        .fn()
        .mockImplementation(() => Promise.resolve(productVariant));
      (stockLocationService as any).getSaleLocations = jest
        .fn()
        .mockImplementation(() => Promise.resolve([{ location }]));

      const result = await service.createSalesForOrder(ctx, [{ orderLineId: 'ol1', quantity: 2 }]);

      expect(result.length).toBe(1);
      expect(savedSalesCapture.length).toBe(1);
      const sale = savedSalesCapture[0];
      expect(sale.quantity).toBe(-2);
      expect(sale.productVariant).toEqual(productVariant);
      expect(sale.orderLine).toEqual(orderLine);
      expect(sale.stockLocation).toEqual(location);
      expect(stockLevelService.updateStockOnHandForLocation).not.toHaveBeenCalled();
      expect(stockLevelService.updateStockAllocatedForLocation).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const published = (eventBus.publish as jest.Mock).mock.calls[0][0] as StockMovementEvent;
      expect(published).toBeInstanceOf(StockMovementEvent);
      expect(published.ctx).toBe(ctx);
    });
  });

  describe('adjustProductVariantStock', () => {
    it('delegates to LocalStockMovementService.adjustStockLevel with reason Product create/update and returns empty array', async () => {
      (stockLocationService as any).defaultStockLocation = jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: 'loc1' }));
      (localStock as any).getCurrentStock = jest.fn().mockImplementation(() => Promise.resolve(0));
      (localStock as any).adjustStockLevel = jest
        .fn()
        .mockImplementation(() => Promise.resolve(undefined));

      const result = await service.adjustProductVariantStock(ctx, 'variant1', 10);

      expect(result).toEqual([]);
      expect(localStock.adjustStockLevel).toHaveBeenCalledWith(
        ctx,
        'variant1',
        'loc1',
        10,
        'Product create/update'
      );
    });
  });
});

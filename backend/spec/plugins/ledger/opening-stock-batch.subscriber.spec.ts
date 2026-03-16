/**
 * OpeningStockBatchSubscriber tests
 *
 * Covers:
 * - Reacts to ProductVariantEvent('created') and creates opening stock batches
 * - Uses stockOnHand from event input
 * - Falls back to reading StockLevel when input has no stockOnHand
 * - Ignores events that are not 'created'
 * - Ignores variants with zero stock
 * - Handles stockLevels (multi-location) input
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  EventBus,
  ProductVariantEvent,
  StockLocationService,
  TransactionalConnection,
  StockLevel,
} from '@vendure/core';
import { Subject } from 'rxjs';
import { OpeningStockBatchSubscriber } from '../../../src/plugins/ledger/opening-stock-batch.subscriber';
import { InventoryService } from '../../../src/services/inventory/inventory.service';

describe('OpeningStockBatchSubscriber', () => {
  let eventSubject: Subject<ProductVariantEvent>;
  let eventBus: jest.Mocked<EventBus>;
  let inventoryService: jest.Mocked<InventoryService>;
  let stockLocationService: jest.Mocked<StockLocationService>;
  let connection: jest.Mocked<TransactionalConnection>;
  let subscriber: OpeningStockBatchSubscriber;

  const ctx = { channelId: 1 } as any;
  const defaultLocation = { id: 'loc-1' };

  beforeEach(() => {
    jest.clearAllMocks();

    eventSubject = new Subject();
    eventBus = {
      ofType: jest.fn().mockReturnValue(eventSubject.asObservable()),
    } as any;

    inventoryService = {
      ensureOpeningStockBatchIfNeeded: jest.fn<any>().mockResolvedValue(null),
    } as any;

    stockLocationService = {
      defaultStockLocation: jest.fn<any>().mockResolvedValue(defaultLocation),
    } as any;

    const mockQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn<any>().mockResolvedValue(null),
    };
    connection = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      }),
    } as any;

    subscriber = new OpeningStockBatchSubscriber(
      eventBus,
      inventoryService,
      stockLocationService,
      connection
    );
    subscriber.onModuleInit();
  });

  const emitEvent = async (
    type: 'created' | 'updated' | 'deleted',
    variants: any[],
    input?: any[]
  ) => {
    const event = {
      type,
      ctx,
      entity: variants,
      input,
    } as unknown as ProductVariantEvent;
    eventSubject.next(event);
    // Allow async subscriber to process
    await new Promise(resolve => setTimeout(resolve, 50));
  };

  it('creates opening stock batch when variant created with stockOnHand > 0', async () => {
    await emitEvent('created', [{ id: 'v1' }], [{ stockOnHand: 50 }]);

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v1',
      'loc-1',
      50
    );
  });

  it('does not react to updated events', async () => {
    await emitEvent('updated', [{ id: 'v1' }], [{ stockOnHand: 50 }]);

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).not.toHaveBeenCalled();
  });

  it('does not react to deleted events', async () => {
    await emitEvent('deleted', [{ id: 'v1' }], undefined);

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).not.toHaveBeenCalled();
  });

  it('ignores variants with stockOnHand = 0 and no StockLevel fallback', async () => {
    await emitEvent('created', [{ id: 'v1' }], [{ stockOnHand: 0 }]);

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).not.toHaveBeenCalled();
  });

  it('falls back to StockLevel when input has no stockOnHand', async () => {
    // Set up the StockLevel fallback to return a stock level
    const mockQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn<any>().mockResolvedValue({ stockOnHand: 25 }),
    };
    connection.getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    }) as any;

    await emitEvent(
      'created',
      [{ id: 'v1' }],
      [{}] // No stockOnHand in input
    );

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v1',
      'loc-1',
      25
    );
  });

  it('handles stockLevels input (multi-location)', async () => {
    await emitEvent(
      'created',
      [{ id: 'v1' }],
      [
        {
          stockLevels: [
            { stockLocationId: 'loc-a', stockOnHand: 30 },
            { stockLocationId: 'loc-b', stockOnHand: 20 },
          ],
        },
      ]
    );

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledTimes(2);
    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v1',
      'loc-a',
      30
    );
    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v1',
      'loc-b',
      20
    );
  });

  it('handles multiple variants in a single event', async () => {
    await emitEvent(
      'created',
      [{ id: 'v1' }, { id: 'v2' }],
      [{ stockOnHand: 10 }, { stockOnHand: 20 }]
    );

    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledTimes(2);
    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v1',
      'loc-1',
      10
    );
    expect(inventoryService.ensureOpeningStockBatchIfNeeded).toHaveBeenCalledWith(
      ctx,
      'v2',
      'loc-1',
      20
    );
  });

  it('does not throw when ensureOpeningStockBatchIfNeeded fails', async () => {
    (inventoryService.ensureOpeningStockBatchIfNeeded as any).mockRejectedValue(
      new Error('DB error')
    );

    // Should not throw — error is caught and logged
    await expect(
      emitEvent('created', [{ id: 'v1' }], [{ stockOnHand: 50 }])
    ).resolves.not.toThrow();
  });
});

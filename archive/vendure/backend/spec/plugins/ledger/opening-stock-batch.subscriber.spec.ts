/**
 * OpeningStockBatchSubscriber tests
 *
 * Covers:
 * - Reacts to ProductVariantEvent('created') and creates opening stock batches
 * - Uses stockOnHand from event input
 * - Ignores events that are not 'created'
 * - Ignores variants with zero stock
 * - Handles stockLevels (multi-location) input
 * - Does NOT fall back to stock_level table (batch inventory is single source of truth)
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventBus, ProductVariantEvent, StockLocationService } from '@vendure/core';
import { Subject } from 'rxjs';
import { OpeningStockBatchSubscriber } from '../../../src/plugins/ledger/opening-stock-batch.subscriber';
import { InventoryService } from '../../../src/services/inventory/inventory.service';

describe('OpeningStockBatchSubscriber', () => {
  let eventSubject: Subject<ProductVariantEvent>;
  let eventBus: jest.Mocked<EventBus>;
  let inventoryService: jest.Mocked<InventoryService>;
  let stockLocationService: jest.Mocked<StockLocationService>;
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

    subscriber = new OpeningStockBatchSubscriber(eventBus, inventoryService, stockLocationService);
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

  it('does not create batch when input has no stockOnHand (no stock_level fallback)', async () => {
    await emitEvent(
      'created',
      [{ id: 'v1' }],
      [{}] // No stockOnHand in input
    );

    // No fallback to stock_level table — batch inventory is the single source of truth
    expect(inventoryService.ensureOpeningStockBatchIfNeeded).not.toHaveBeenCalled();
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

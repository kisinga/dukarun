/**
 * Purchase → Stock Update integration test.
 *
 * Verifies the full cycle: purchase recorded → batches created → stock reads correctly.
 * This test uses a shared in-memory batch store wired into both the write path
 * (InventoryService.recordPurchase) and the read path (BatchStockLocationStrategy.getAvailableStock).
 *
 * This is the test that would have caught the double-batch / stock-not-updating bug:
 * - adjustStockLevel was creating an opening stock batch BEFORE recordPurchase created the real one
 * - BatchStockLocationStrategy was falling back silently to stock_level on errors
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { BatchStockLocationStrategy } from '../../src/plugins/ledger/batch-stock-location.strategy';
import { InventoryService } from '../../src/services/inventory/inventory.service';
import { InventoryStoreService } from '../../src/services/inventory/inventory-store.service';
import { MovementType } from '../../src/services/inventory/entities/inventory-movement.entity';

/* ---------- shared in-memory store ---------- */

interface MemBatch {
  id: string;
  channelId: number;
  stockLocationId: number;
  productVariantId: number;
  quantity: number;
  unitCost: number;
  expiryDate: Date | null;
  sourceType: string;
  sourceId: string;
  batchNumber: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MemMovement {
  id: string;
  channelId: number;
  stockLocationId: number;
  productVariantId: number;
  movementType: string;
  quantity: number;
  batchId: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

let nextId = 1;

function createSharedStore() {
  const batches: MemBatch[] = [];
  const movements: MemMovement[] = [];

  const inventoryStore = {
    createBatch: jest.fn(async (_ctx: any, input: any) => {
      // Idempotency check (mirrors real store — includes productVariantId
      // because a single purchase has multiple lines for different variants)
      const existing = movements.find(
        m =>
          m.channelId === Number(input.channelId) &&
          m.productVariantId === Number(input.productVariantId) &&
          m.sourceType === input.sourceType &&
          m.sourceId === String(input.sourceId)
      );
      if (existing) {
        const existingBatch = batches.find(b => b.id === existing.batchId);
        if (existingBatch) return existingBatch;
      }

      const batch: MemBatch = {
        id: `batch-${nextId++}`,
        channelId: Number(input.channelId),
        stockLocationId: Number(input.stockLocationId),
        productVariantId: Number(input.productVariantId),
        quantity: input.quantity,
        unitCost: input.unitCost,
        expiryDate: input.expiryDate || null,
        sourceType: input.sourceType,
        sourceId: String(input.sourceId),
        batchNumber: input.batchNumber ?? null,
        metadata: input.metadata || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      batches.push(batch);
      return batch;
    }),

    verifyBatchExists: jest.fn(async (_ctx: any, batchId: string) => {
      return batches.some(b => b.id === batchId);
    }),

    createMovement: jest.fn(async (_ctx: any, input: any) => {
      const movement: MemMovement = {
        id: `mov-${nextId++}`,
        channelId: Number(input.channelId),
        stockLocationId: Number(input.stockLocationId),
        productVariantId: Number(input.productVariantId),
        movementType: input.movementType,
        quantity: input.quantity,
        batchId: String(input.batchId),
        sourceType: input.sourceType,
        sourceId: String(input.sourceId),
        metadata: input.metadata || null,
        createdAt: new Date(),
      };
      movements.push(movement);
      return movement;
    }),

    getOpenBatches: jest.fn(async (_ctx: any, filters: any) => {
      return batches.filter(b => {
        if (b.channelId !== Number(filters.channelId)) return false;
        if (filters.stockLocationId && b.stockLocationId !== Number(filters.stockLocationId))
          return false;
        if (filters.productVariantId && b.productVariantId !== Number(filters.productVariantId))
          return false;
        return b.quantity > 0;
      });
    }),

    getOpenBatchesForConsumption: jest.fn(async () => []),
    updateBatchQuantity: jest.fn(),
    getMovements: jest.fn(async () => []),
    verifyStockLevel: jest.fn(async () => true),
    getValuationSnapshot: jest.fn(async () => ({ totalValue: 0, batches: [] })),
  };

  return { batches, movements, inventoryStore };
}

/* ---------- mock connection for strategy ---------- */

function createStrategyConnection(batches: MemBatch[]) {
  return {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockImplementation(() => {
        const filters: Record<string, unknown> = {};
        const qb: Record<string, jest.Mock> = {};
        qb.select = jest.fn().mockReturnValue(qb);
        qb.where = jest.fn().mockImplementation((...args: unknown[]) => {
          if (args[1] && typeof args[1] === 'object') Object.assign(filters, args[1] as any);
          return qb;
        });
        qb.andWhere = jest.fn().mockImplementation((...args: unknown[]) => {
          if (args[1] && typeof args[1] === 'object') Object.assign(filters, args[1] as any);
          return qb;
        });
        qb.getRawOne = jest.fn().mockImplementation(() => {
          const filtered = batches.filter(b => {
            if (filters.channelId !== undefined && b.channelId !== filters.channelId) return false;
            if (
              filters.productVariantId !== undefined &&
              b.productVariantId !== filters.productVariantId
            )
              return false;
            return b.quantity > 0;
          });
          const total = filtered.reduce((sum, b) => sum + b.quantity, 0);
          return Promise.resolve({ total: total > 0 ? String(total) : null });
        });
        return qb;
      }),
    }),
  };
}

/* ---------- helpers ---------- */

function buildInventoryService(inventoryStore: any) {
  const connection = {
    withTransaction: jest.fn((_ctx: any, fn: any) => fn(_ctx)),
    getRepository: jest.fn(() => ({
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
    })),
  };

  const expiryPolicy = {
    onBatchCreated: jest.fn(),
    validateBeforeConsume: jest.fn(),
    onBatchExpired: jest.fn(),
    getName: jest.fn().mockReturnValue('DEFAULT'),
  };

  const ledgerPostingService = {
    postInventoryPurchase: jest.fn(),
    postInventorySaleCogs: jest.fn(),
    postInventoryWriteOff: jest.fn(),
  };

  const stockValuationService = {
    invalidateCache: jest.fn(),
  };

  const costingStrategy = {
    allocateCost: jest.fn(),
    getName: jest.fn().mockReturnValue('FIFO'),
  };

  const service = new InventoryService(
    connection as any,
    inventoryStore as unknown as InventoryStoreService,
    costingStrategy as any,
    expiryPolicy as any,
    ledgerPostingService as any,
    stockValuationService as any
  );

  return { service, ledgerPostingService };
}

/* ---------- tests ---------- */

describe('Purchase → Stock Update (integration)', () => {
  const CHANNEL = 1;
  const LOCATION = 11;
  const VARIANT_A = 780;
  const VARIANT_B = 781;
  const ctx = { channelId: CHANNEL } as RequestContext;

  let store: ReturnType<typeof createSharedStore>;
  let inventoryService: InventoryService;
  let strategy: BatchStockLocationStrategy;

  beforeEach(() => {
    nextId = 1;
    store = createSharedStore();
    const built = buildInventoryService(store.inventoryStore);
    inventoryService = built.service;

    strategy = new BatchStockLocationStrategy();
    (strategy as any).connection = createStrategyConnection(store.batches);
  });

  it('purchase creates exactly one batch per line and stock reads correctly', async () => {
    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-1',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-001',
      isCreditPurchase: false,
      lines: [
        { productVariantId: VARIANT_A, quantity: 44, unitCost: 5000 },
        { productVariantId: VARIANT_B, quantity: 10, unitCost: 3000 },
      ],
    });

    // Exactly 1 batch per variant — no opening stock duplicate
    const batchesA = store.batches.filter(b => b.productVariantId === VARIANT_A);
    const batchesB = store.batches.filter(b => b.productVariantId === VARIANT_B);
    expect(batchesA).toHaveLength(1);
    expect(batchesB).toHaveLength(1);

    // Strategy reads correct stock
    // Refresh connection so strategy sees latest batches
    (strategy as any).connection = createStrategyConnection(store.batches);

    const stockA = await strategy.getAvailableStock(ctx, VARIANT_A, []);
    const stockB = await strategy.getAvailableStock(ctx, VARIANT_B, []);
    expect(stockA.stockOnHand).toBe(44);
    expect(stockB.stockOnHand).toBe(10);
  });

  it('purchase does not create opening stock batches', async () => {
    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-2',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-002',
      isCreditPurchase: false,
      lines: [{ productVariantId: VARIANT_A, quantity: 20, unitCost: 4000 }],
    });

    // No batch with sourceType='OpeningStock'
    const openingBatches = store.batches.filter(b => b.sourceType === 'OpeningStock');
    expect(openingBatches).toHaveLength(0);

    // Only Purchase batches
    const purchaseBatches = store.batches.filter(b => b.sourceType === 'Purchase');
    expect(purchaseBatches).toHaveLength(1);
    expect(purchaseBatches[0].unitCost).toBe(4000);
  });

  it('multiple purchases accumulate stock correctly (no doubling)', async () => {
    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-3a',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-003a',
      isCreditPurchase: false,
      lines: [{ productVariantId: VARIANT_A, quantity: 10, unitCost: 5000 }],
    });

    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-3b',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-003b',
      isCreditPurchase: false,
      lines: [{ productVariantId: VARIANT_A, quantity: 20, unitCost: 6000 }],
    });

    // 2 batches total for variant A (one per purchase)
    const batchesA = store.batches.filter(b => b.productVariantId === VARIANT_A);
    expect(batchesA).toHaveLength(2);

    // Strategy returns 30 (not 60 from double-batch bug)
    (strategy as any).connection = createStrategyConnection(store.batches);
    const stock = await strategy.getAvailableStock(ctx, VARIANT_A, []);
    expect(stock.stockOnHand).toBe(30);
  });

  it('getBatchStockOnHand returns correct value after purchase', async () => {
    const before = await inventoryService.getBatchStockOnHand(ctx, CHANNEL, VARIANT_A, LOCATION);
    expect(before).toBe(0);

    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-4',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-004',
      isCreditPurchase: false,
      lines: [{ productVariantId: VARIANT_A, quantity: 44, unitCost: 5000 }],
    });

    const after = await inventoryService.getBatchStockOnHand(ctx, CHANNEL, VARIANT_A, LOCATION);
    expect(after).toBe(44);
  });

  it('strategy returns 0 when no channelId (no fallback to stock_level)', async () => {
    const noChannelCtx = {} as RequestContext;
    const stock = await strategy.getAvailableStock(noChannelCtx, VARIANT_A, []);
    expect(stock.stockOnHand).toBe(0);
    expect(stock.stockAllocated).toBe(0);
  });

  it('strategy does not catch errors (no silent fallback)', async () => {
    const errorConnection = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockImplementation(() => {
          const qb: Record<string, jest.Mock> = {};
          qb.select = jest.fn().mockReturnValue(qb);
          qb.where = jest.fn().mockReturnValue(qb);
          qb.andWhere = jest.fn().mockReturnValue(qb);
          qb.getRawOne = jest.fn<any>().mockRejectedValue(new Error('DB connection lost'));
          return qb;
        }),
      }),
    };

    (strategy as any).connection = errorConnection;

    await expect(strategy.getAvailableStock(ctx, VARIANT_A, [])).rejects.toThrow(
      'DB connection lost'
    );
  });

  it('batches have correct unitCost (not zero from opening stock)', async () => {
    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-5',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-005',
      isCreditPurchase: false,
      lines: [
        { productVariantId: VARIANT_A, quantity: 10, unitCost: 7500 },
        { productVariantId: VARIANT_B, quantity: 5, unitCost: 3200 },
      ],
    });

    const batchA = store.batches.find(b => b.productVariantId === VARIANT_A);
    const batchB = store.batches.find(b => b.productVariantId === VARIANT_B);
    expect(batchA!.unitCost).toBe(7500);
    expect(batchB!.unitCost).toBe(3200);
  });

  it('ledger posting is called once per purchase (not duplicated)', async () => {
    const built = buildInventoryService(store.inventoryStore);
    inventoryService = built.service;

    await inventoryService.recordPurchase(ctx, {
      purchaseId: 'pur-6',
      channelId: CHANNEL,
      stockLocationId: LOCATION,
      supplierId: 'sup-1',
      purchaseReference: 'PO-006',
      isCreditPurchase: false,
      lines: [{ productVariantId: VARIANT_A, quantity: 10, unitCost: 5000 }],
    });

    expect(built.ledgerPostingService.postInventoryPurchase).toHaveBeenCalledTimes(1);
  });
});

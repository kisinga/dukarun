/**
 * StockAdjustmentService — createAdjustmentRecord cost capture tests
 *
 * Verifies that per-line cost data (unitCostCents, totalCostCents, allocations)
 * returned by applyAdjustmentToBatches is persisted on the adjustment line.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { StockAdjustmentService } from '../../../src/services/stock/stock-adjustment.service';
import { StockValidationService } from '../../../src/services/stock/stock-validation.service';

describe('StockAdjustmentService — createAdjustmentRecord', () => {
  const ctx = { channelId: 1, activeUserId: 7 } as unknown as RequestContext;

  const buildService = () => {
    const savedLines: any[] = [];
    const adjustmentRepo = {
      save: jest.fn((entity: any) => Promise.resolve({ ...entity, id: 'adj-1' })),
      findOne: jest.fn((_opts: any) => Promise.resolve(null)),
    };
    const adjustmentLineRepo = {
      save: jest.fn((lines: any[]) => {
        savedLines.push(...lines);
        return Promise.resolve(lines);
      }),
    };

    const connection = {
      getRepository: jest.fn((_ctx: any, entity: any): any => {
        if (entity.name === 'InventoryStockAdjustment') return adjustmentRepo;
        if (entity.name === 'InventoryStockAdjustmentLine') return adjustmentLineRepo;
        throw new Error(`Unexpected entity: ${entity?.name}`);
      }),
    } as unknown as TransactionalConnection;

    const validationService = {} as StockValidationService;
    const service = new StockAdjustmentService(connection, validationService);

    return { service, savedLines, adjustmentRepo };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists user cost, value change and per-batch allocations on the line', async () => {
    const { service, savedLines } = buildService();

    await service.createAdjustmentRecord(
      ctx,
      {
        reason: 'found',
        notes: null,
        lines: [
          { variantId: 3, quantityChange: -25, stockLocationId: 2, unitCost: 1000 },
        ],
      },
      [
        {
          variantId: 3,
          locationId: 2,
          previousStock: 50,
          newStock: 25,
          batchId: 'batch-old',
          valueChangeCents: -25000,
          allocations: [
            { batchId: 'batch-old', quantity: -10, unitCost: 1000, totalCost: -10000 },
            { batchId: 'batch-new', quantity: -15, unitCost: 1000, totalCost: -15000 },
          ],
        },
      ],
      'adj-1'
    );

    expect(savedLines).toHaveLength(1);
    expect(savedLines[0]).toEqual(
      expect.objectContaining({
        variantId: 3,
        quantityChange: -25,
        previousStock: 50,
        newStock: 25,
        batchId: 'batch-old',
        unitCostCents: 1000,
        totalCostCents: -25000,
        allocations: [
          { batchId: 'batch-old', quantity: -10, unitCostCents: 1000, totalCostCents: -10000 },
          { batchId: 'batch-new', quantity: -15, unitCostCents: 1000, totalCostCents: -15000 },
        ],
      })
    );
  });

  it('falls back to the allocation unit cost when no user cost is given', async () => {
    const { service, savedLines } = buildService();

    await service.createAdjustmentRecord(
      ctx,
      {
        reason: 'correction',
        lines: [{ variantId: 3, quantityChange: 10, stockLocationId: 2 }],
      },
      [
        {
          variantId: 3,
          locationId: 2,
          previousStock: 50,
          newStock: 60,
          batchId: 'batch-1',
          valueChangeCents: 10000,
          allocations: [{ batchId: 'batch-1', quantity: 10, unitCost: 1000, totalCost: 10000 }],
        },
      ],
      'adj-1'
    );

    expect(savedLines[0].unitCostCents).toBe(1000);
    expect(savedLines[0].totalCostCents).toBe(10000);
  });

  it('leaves cost fields null when no cost information exists', async () => {
    const { service, savedLines } = buildService();

    await service.createAdjustmentRecord(
      ctx,
      {
        reason: 'correction',
        lines: [{ variantId: 3, quantityChange: 10, stockLocationId: 2 }],
      },
      [
        {
          variantId: 3,
          locationId: 2,
          previousStock: 50,
          newStock: 60,
          batchId: null,
        },
      ],
      'adj-1'
    );

    expect(savedLines[0].unitCostCents).toBeNull();
    expect(savedLines[0].totalCostCents).toBeNull();
    expect(savedLines[0].allocations).toBeNull();
  });
});

/**
 * LedgerQueryService — getInventoryAdjustmentLosses tests
 *
 * Verifies the INVENTORY_ADJUSTMENT account netting: net debit = losses,
 * net credit (stock gains) is clamped to 0.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { LedgerQueryService } from '../../../src/services/financial/ledger-query.service';

describe('LedgerQueryService — getInventoryAdjustmentLosses', () => {
  const buildService = (balance: number) => {
    const accountBalanceService = {
      getAccountBalance: jest.fn(() => Promise.resolve({ balance })),
    } as any;
    const dataSource = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve({ name: 'Inventory Adjustment' })),
      })),
    } as any;
    return new LedgerQueryService(dataSource, accountBalanceService);
  };

  it('reports the net debit balance as losses', async () => {
    const service = buildService(25000);
    await expect(service.getInventoryAdjustmentLosses(1, '2026-07-01', '2026-07-31')).resolves.toBe(
      25000
    );
  });

  it('clamps a net credit balance (stock gains) to zero', async () => {
    const service = buildService(-12000);
    await expect(service.getInventoryAdjustmentLosses(1, '2026-07-01', '2026-07-31')).resolves.toBe(
      0
    );
  });
});

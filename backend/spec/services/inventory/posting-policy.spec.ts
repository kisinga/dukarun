/**
 * Inventory Posting Policy Tests
 *
 * Tests for inventory-related posting policy functions.
 */

import { describe, expect, it } from '@jest/globals';
import {
  createInventoryAdjustmentEntry,
  createInventoryPurchaseEntry,
  createInventorySaleCogsEntry,
  createInventoryWriteOffEntry,
} from '../../../src/services/financial/posting-policy';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';

describe('Inventory Posting Policies', () => {
  describe('createInventoryPurchaseEntry', () => {
    it('should create entry for credit purchase', () => {
      const context = {
        purchaseId: 'purchase-123',
        purchaseReference: 'PO-001',
        supplierId: 'supplier-456',
        totalCost: 500000, // in cents
        isCreditPurchase: true,
        batchAllocations: [{ batchId: 'batch-1', quantity: 50, unitCost: 10000 }],
      };

      const entry = createInventoryPurchaseEntry(context);

      expect(entry.lines).toHaveLength(2);
      expect(entry.lines[0].accountCode).toBe(ACCOUNT_CODES.INVENTORY);
      expect(entry.lines[0].debit).toBe(500000);
      expect(entry.lines[1].accountCode).toBe(ACCOUNT_CODES.ACCOUNTS_PAYABLE);
      expect(entry.lines[1].credit).toBe(500000);
      expect(entry.memo).toContain('PO-001');
    });

    it('should create entry for cash purchase', () => {
      const context = {
        purchaseId: 'purchase-123',
        purchaseReference: 'PO-001',
        supplierId: 'supplier-456',
        totalCost: 500000,
        isCreditPurchase: false,
        batchAllocations: [{ batchId: 'batch-1', quantity: 50, unitCost: 10000 }],
      };

      const entry = createInventoryPurchaseEntry(context);

      expect(entry.lines[1].accountCode).toBe(ACCOUNT_CODES.CASH_ON_HAND);
    });

    it('should include batch allocations in metadata', () => {
      const context = {
        purchaseId: 'purchase-123',
        purchaseReference: 'PO-001',
        supplierId: 'supplier-456',
        totalCost: 500000,
        isCreditPurchase: true,
        batchAllocations: [
          { batchId: 'batch-1', quantity: 50, unitCost: 10000 },
          { batchId: 'batch-2', quantity: 30, unitCost: 15000 },
        ],
      };

      const entry = createInventoryPurchaseEntry(context);

      expect(entry.lines[0].meta?.batchCount).toBe(2);
      expect(entry.lines[0].meta?.batchAllocations).toHaveLength(2);
    });
  });

  describe('createInventorySaleCogsEntry', () => {
    it('should create COGS entry', () => {
      const context = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        customerId: 'customer-123',
        cogsAllocations: [{ batchId: 'batch-1', quantity: 25, unitCost: 10000, totalCost: 250000 }],
        totalCogs: 250000,
      };

      const entry = createInventorySaleCogsEntry(context);

      expect(entry.lines).toHaveLength(2);
      expect(entry.lines[0].accountCode).toBe(ACCOUNT_CODES.COGS);
      expect(entry.lines[0].debit).toBe(250000);
      expect(entry.lines[1].accountCode).toBe(ACCOUNT_CODES.INVENTORY);
      expect(entry.lines[1].credit).toBe(250000);
      expect(entry.memo).toContain('ORD-001');
    });

    it('should include COGS allocations in metadata', () => {
      const context = {
        orderId: 'order-789',
        orderCode: 'ORD-001',
        customerId: 'customer-123',
        cogsAllocations: [
          { batchId: 'batch-1', quantity: 25, unitCost: 10000, totalCost: 250000 },
          { batchId: 'batch-2', quantity: 15, unitCost: 12000, totalCost: 180000 },
        ],
        totalCogs: 430000,
      };

      const entry = createInventorySaleCogsEntry(context);

      expect(entry.lines[0].meta?.batchCount).toBe(2);
      expect(entry.lines[0].meta?.cogsAllocations).toHaveLength(2);
    });
  });

  describe('createInventoryWriteOffEntry', () => {
    it('should create write-off entry for general loss', () => {
      const context = {
        adjustmentId: 'adjustment-456',
        reason: 'damage',
        batchAllocations: [
          { batchId: 'batch-1', quantity: 10, unitCost: 10000, totalCost: 100000 },
        ],
        totalLoss: 100000,
      };

      const entry = createInventoryWriteOffEntry(context);

      expect(entry.lines).toHaveLength(2);
      expect(entry.lines[0].accountCode).toBe(ACCOUNT_CODES.INVENTORY_WRITE_OFF);
      expect(entry.lines[0].debit).toBe(100000);
      expect(entry.lines[1].accountCode).toBe(ACCOUNT_CODES.INVENTORY);
      expect(entry.lines[1].credit).toBe(100000);
      expect(entry.memo).toContain('damage');
    });

    it('should create expiry loss entry for expired inventory', () => {
      const context = {
        adjustmentId: 'adjustment-456',
        reason: 'expired',
        batchAllocations: [
          { batchId: 'batch-1', quantity: 10, unitCost: 10000, totalCost: 100000 },
        ],
        totalLoss: 100000,
      };

      const entry = createInventoryWriteOffEntry(context);

      expect(entry.lines[0].accountCode).toBe(ACCOUNT_CODES.EXPIRY_LOSS);
    });

    it('should include batch allocations in metadata', () => {
      const context = {
        adjustmentId: 'adjustment-456',
        reason: 'damage',
        batchAllocations: [
          { batchId: 'batch-1', quantity: 10, unitCost: 10000, totalCost: 100000 },
          { batchId: 'batch-2', quantity: 5, unitCost: 15000, totalCost: 75000 },
        ],
        totalLoss: 175000,
      };

      const entry = createInventoryWriteOffEntry(context);

      expect(entry.lines[0].meta?.batchCount).toBe(2);
      expect(entry.lines[0].meta?.batchAllocations).toHaveLength(2);
    });
  });

  describe('createInventoryAdjustmentEntry', () => {
    it('should debit INVENTORY for a positive value change', () => {
      const entry = createInventoryAdjustmentEntry({
        valueChangeCents: 50000,
        reason: 'found stock',
        adjustmentId: 'adj-1',
        productVariantId: 3,
        stockLocationId: 2,
      });

      expect(entry.lines).toHaveLength(2);
      expect(entry.lines[0]).toEqual(
        expect.objectContaining({
          accountCode: ACCOUNT_CODES.INVENTORY,
          debit: 50000,
          meta: expect.objectContaining({ adjustmentId: 'adj-1', reason: 'found stock' }),
        })
      );
      expect(entry.lines[1]).toEqual(
        expect.objectContaining({
          accountCode: ACCOUNT_CODES.INVENTORY_ADJUSTMENT,
          credit: 50000,
        })
      );
    });

    it('should credit INVENTORY for a negative value change', () => {
      const entry = createInventoryAdjustmentEntry({
        valueChangeCents: -30000,
        reason: 'lost stock',
        adjustmentId: 'adj-2',
      });

      expect(entry.lines[0]).toEqual(
        expect.objectContaining({
          accountCode: ACCOUNT_CODES.INVENTORY_ADJUSTMENT,
          debit: 30000,
        })
      );
      expect(entry.lines[1]).toEqual(
        expect.objectContaining({
          accountCode: ACCOUNT_CODES.INVENTORY,
          credit: 30000,
        })
      );
    });
  });
});

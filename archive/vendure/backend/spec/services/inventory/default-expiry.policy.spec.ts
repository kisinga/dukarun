/**
 * DefaultExpiryPolicy Tests
 *
 * Tests for default expiry validation and policy hooks.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { DefaultExpiryPolicy } from '../../../src/services/inventory/policies/default-expiry.policy';
import {
  InventoryBatch,
  MovementType,
} from '../../../src/services/inventory/interfaces/inventory-store.interface';

describe('DefaultExpiryPolicy', () => {
  const ctx = {} as RequestContext;

  const buildService = () => {
    return new DefaultExpiryPolicy();
  };

  const createBatch = (expiryDate: Date | null): InventoryBatch => ({
    id: 'batch-1',
    channelId: 1,
    stockLocationId: 2,
    productVariantId: 3,
    quantity: 100,
    unitCost: 5000,
    expiryDate,
    sourceType: 'Purchase',
    sourceId: 'purchase-1',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getName', () => {
    it('should return DEFAULT', () => {
      const policy = buildService();
      expect(policy.getName()).toBe('DEFAULT');
    });
  });

  describe('validateBeforeConsume', () => {
    it('should allow consumption if no expiry date', async () => {
      const policy = buildService();
      const batch = createBatch(null);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.SALE);

      expect(result.allowed).toBe(true);
    });

    it('should allow consumption if not expired', async () => {
      const policy = buildService();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const batch = createBatch(futureDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.SALE);

      expect(result.allowed).toBe(true);
    });

    it('should block sale of expired batch', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.SALE);

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should allow transfer of expired batch with warning', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.TRANSFER);

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it('should allow adjustment of expired batch with warning', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.ADJUSTMENT);

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it('should allow write-off of expired batch', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.WRITE_OFF);

      expect(result.allowed).toBe(true);
    });

    it('should allow expiry movement of expired batch', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.EXPIRY);

      expect(result.allowed).toBe(true);
    });

    it('should block purchase movement referencing existing batch', async () => {
      const policy = buildService();
      const batch = createBatch(null); // Purchase constraint applies regardless of expiry

      const result = await policy.validateBeforeConsume(ctx, batch, 50, MovementType.PURCHASE);

      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Purchase movements should not reference existing batches');
    });
  });

  describe('onBatchCreated', () => {
    it('should log batch creation with expiry date', async () => {
      const policy = buildService();
      const expiryDate = new Date('2025-12-31');
      const batch = createBatch(expiryDate);

      // Should not throw
      await expect(policy.onBatchCreated(ctx, batch)).resolves.not.toThrow();
    });

    it('should handle batch without expiry date', async () => {
      const policy = buildService();
      const batch = createBatch(null);

      await expect(policy.onBatchCreated(ctx, batch)).resolves.not.toThrow();
    });
  });

  describe('onBatchExpired', () => {
    it('should handle expired batch', async () => {
      const policy = buildService();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const batch = createBatch(pastDate);

      // Should not throw
      await expect(policy.onBatchExpired(ctx, batch)).resolves.not.toThrow();
    });
  });
});

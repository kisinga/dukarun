/**
 * Payment handler tests
 */

import { describe, expect, it } from '@jest/globals';
import { Order, PaymentMethod, RequestContext } from '@vendure/core';
import {
  bankPaymentHandler,
  cashPaymentHandler,
  mpesaPaymentHandler,
} from '../../../src/services/payments/payment-handlers';

describe('Payment handlers', () => {
  const ctx = { activeUserId: 'user-1' } as RequestContext;
  const mockMethod = { code: 'test-1' } as unknown as PaymentMethod;

  describe('bankPaymentHandler', () => {
    it('creates a settled payment with bank metadata', async () => {
      const order = { total: 50000 } as unknown as Order;

      const result = await bankPaymentHandler.createPayment(
        ctx,
        order,
        50000,
        [],
        { referenceNumber: 'BANK-REF-123' },
        mockMethod
      );

      expect(result.state).toBe('Settled');
      expect(result.amount).toBe(50000);
      expect(result.transactionId).toMatch(/^BANK-\d+$/);
      expect(result.metadata).toMatchObject({
        paymentType: 'bank',
        userId: 'user-1',
        referenceNumber: 'BANK-REF-123',
      });
    });

    it('respects allocatedAmount metadata for partial payments', async () => {
      const order = { total: 50000 } as unknown as Order;

      const result = await bankPaymentHandler.createPayment(
        ctx,
        order,
        50000,
        [],
        { allocatedAmount: 25000 },
        mockMethod
      );

      expect(result.amount).toBe(25000);
      expect(result.state).toBe('Settled');
    });

    it('settlePayment returns success immediately', async () => {
      const result = await bankPaymentHandler.settlePayment!(
        ctx,
        { total: 10000 } as any,
        { amount: 10000 } as any,
        [],
        mockMethod
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('cashPaymentHandler', () => {
    it('creates a settled payment with cash metadata', async () => {
      const order = { total: 10000 } as unknown as Order;

      const result = await cashPaymentHandler.createPayment(ctx, order, 10000, [], {}, mockMethod);

      expect(result.state).toBe('Settled');
      expect(result.metadata).toMatchObject({
        paymentType: 'cash',
        userId: 'user-1',
      });
    });
  });

  describe('mpesaPaymentHandler', () => {
    it('creates a settled payment with mpesa metadata', async () => {
      const order = { total: 10000 } as unknown as Order;

      const result = await mpesaPaymentHandler.createPayment(
        ctx,
        order,
        10000,
        [],
        { phoneNumber: '254712345678' },
        mockMethod
      );

      expect(result.state).toBe('Settled');
      expect(result.metadata).toMatchObject({
        paymentType: 'mpesa',
        userId: 'user-1',
        phoneNumber: '254712345678',
      });
    });
  });
});

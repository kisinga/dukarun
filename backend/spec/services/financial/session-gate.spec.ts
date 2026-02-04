/**
 * Session gate (requireOpenSession) tests
 *
 * Verifies that paySingleOrder and createInterAccountTransfer require an open
 * session and attach session id to ledger postings.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { Order } from '@vendure/core';
import { PaymentAllocationService } from '../../../src/services/payments/payment-allocation.service';

const MOCK_SESSION = { id: 'session-123', channelId: 1, status: 'open' as const };

describe('Session gate (requireOpenSession)', () => {
  let paymentAllocationService: PaymentAllocationService;
  let mockOrderService: any;
  let mockFinancialService: any;
  let mockConnection: any;
  let mockChartOfAccountsService: any;
  let mockCashierSessionService: any;

  function createService(requireOpenSessionImpl: () => Promise<any>) {
    mockOrderService = {
      findOne: jest.fn(),
      addManualPaymentToOrder: jest.fn(),
    };
    mockFinancialService = {
      recordPaymentAllocation: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;
    mockConnection = {
      withTransaction: jest.fn((_ctx: any, fn: (t: any) => Promise<any>) => fn(_ctx)),
      getRepository: jest.fn(() => ({
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1', customFields: {} })),
        update: jest.fn().mockImplementation(() => Promise.resolve()),
      })),
    } as any;
    mockChartOfAccountsService = {
      validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;
    mockCashierSessionService = {
      requireOpenSession: jest.fn().mockImplementation(requireOpenSessionImpl),
    } as any;
    return new PaymentAllocationService(
      mockConnection,
      mockOrderService,
      { settlePayment: jest.fn().mockImplementation(() => Promise.resolve()) } as any,
      mockFinancialService,
      {} as any,
      mockChartOfAccountsService,
      mockCashierSessionService,
      undefined
    );
  }

  describe('paySingleOrder', () => {
    it('rejects when no open session for channel', async () => {
      paymentAllocationService = createService(() =>
        Promise.reject(
          new Error(
            'No open session for this channel. Open a session before performing transactions.'
          )
        )
      );

      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        total: 10000,
        totalWithTax: 10000,
        payments: [],
        customer: { id: 'cust-1' },
      };
      mockOrderService.findOne.mockResolvedValue(order);

      const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;

      await expect(paymentAllocationService.paySingleOrder(ctx, 'order-1', 5000)).rejects.toThrow(
        /No open session/
      );

      expect(mockCashierSessionService.requireOpenSession).toHaveBeenCalledWith(ctx, 1);
      expect(mockFinancialService.recordPaymentAllocation).not.toHaveBeenCalled();
    });

    it('succeeds and passes openSessionId to recordPaymentAllocation when session is open', async () => {
      paymentAllocationService = createService(() => Promise.resolve(MOCK_SESSION));

      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        total: 10000,
        totalWithTax: 10000,
        payments: [],
        customer: { id: 'cust-1' },
      };
      const payment = {
        id: 'pay-1',
        method: 'credit',
        amount: 5000,
        state: 'Authorized',
        metadata: { allocatedAmount: 5000 },
        createdAt: new Date(),
      };
      mockOrderService.findOne
        .mockResolvedValueOnce(order)
        .mockResolvedValueOnce({ ...order, payments: [payment] });
      mockOrderService.addManualPaymentToOrder.mockResolvedValue({ id: order.id });

      const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
      const result = await paymentAllocationService.paySingleOrder(ctx, 'order-1', 5000);

      expect(result.ordersPaid).toHaveLength(1);
      expect(result.ordersPaid[0].amountPaid).toBe(5000);
      expect(mockCashierSessionService.requireOpenSession).toHaveBeenCalledWith(ctx, 1);
      expect(mockFinancialService.recordPaymentAllocation).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        expect.anything(),
        expect.any(String),
        5000,
        undefined,
        'session-123'
      );
    });
  });
});

/**
 * Session gate (requireOpenSession) tests
 *
 * Current state: No backend check that an open cashier session exists before
 * paySingleOrder or createInterAccountTransfer. These tests document current
 * behavior and the expected behavior once the gate is implemented.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { PaymentAllocationService } from '../../../src/services/payments/payment-allocation.service';
import { Order } from '@vendure/core';

describe('Session gate (requireOpenSession)', () => {
  describe('Current behavior: no session check', () => {
    let paymentAllocationService: PaymentAllocationService;
    let mockOrderService: any;
    let mockFinancialService: any;
    let mockConnection: any;
    let mockChartOfAccountsService: any;

    beforeEach(() => {
      mockOrderService = {
        findOne: jest.fn(),
        addManualPaymentToOrder: jest.fn(),
      };
      mockFinancialService = {
        recordPaymentAllocation: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockOrderRepo = {
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1', customFields: {} })),
        update: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      mockConnection = {
        withTransaction: jest.fn((_ctx: any, fn: (t: any) => Promise<any>) => fn(_ctx)),
        getRepository: jest.fn((_ctx: any, entity: any) =>
          entity === Order ? mockOrderRepo : ({} as any)
        ),
      };
      mockChartOfAccountsService = {
        validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      paymentAllocationService = new PaymentAllocationService(
        mockConnection,
        mockOrderService,
        { settlePayment: jest.fn().mockImplementation(() => Promise.resolve()) } as any,
        mockFinancialService,
        {} as any,
        mockChartOfAccountsService,
        undefined
      );
    });

    it('paySingleOrder succeeds without an open session when other validations pass', async () => {
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
    });
  });

  describe('When gate is implemented', () => {
    it('should reject paySingleOrder when no open session for channel (placeholder)', () => {
      // Once requireOpenSession is added: inject a session checker that returns false,
      // call paySingleOrder, expect rejection with message like "No open cashier session for this channel".
      expect(true).toBe(true);
    });

    it('should reject createInterAccountTransfer when no open session for channel (placeholder)', () => {
      // Once requireOpenSession is added: same for createInterAccountTransfer.
      expect(true).toBe(true);
    });
  });
});

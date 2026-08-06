/**
 * OrderPaymentService: openSessionId resolution tests
 *
 * When a cashier session is open, addPayment should tag the ledger posting with openSessionId
 * for session-scoped reconciliation.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ID, RequestContext } from '@vendure/core';
import { OrderPaymentService } from '../../../src/services/orders/order-payment.service';

describe('OrderPaymentService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
  const orderId = 'order-1' as ID;
  const settledPayment = {
    id: 'pay-1',
    method: 'cash',
    amount: 10000,
    state: 'Settled' as const,
    metadata: {},
  };
  const orderWithPayments = {
    id: orderId,
    code: 'ORD-001',
    payments: [settledPayment],
  };

  let mockOrderService: any;
  let mockPaymentService: any;
  let mockFinancialService: any;
  let mockLedgerTransactionService: any;
  let mockOpenSessionService: any;
  let service: OrderPaymentService;

  beforeEach(() => {
    mockOrderService = {
      addManualPaymentToOrder: jest.fn().mockResolvedValue(orderWithPayments as never),
      findOne: jest.fn().mockResolvedValue(orderWithPayments as never),
    };
    mockPaymentService = {
      settlePayment: jest.fn().mockResolvedValue(settledPayment as never),
    };
    mockFinancialService = {};
    mockLedgerTransactionService = {
      postTransaction: jest.fn().mockResolvedValue({ success: true } as never),
    };
    mockOpenSessionService = {
      getCurrentSession: jest.fn().mockResolvedValue(null as never),
    };

    service = new OrderPaymentService(
      mockOrderService as any,
      mockPaymentService as any,
      mockFinancialService as any,
      mockLedgerTransactionService as any,
      mockOpenSessionService as any
    );
  });

  describe('addPayment openSessionId resolution', () => {
    it('adds openSessionId to transactionData when session is open', async () => {
      const session = { id: 'session-s1', channelId: 1, status: 'open' };
      mockOpenSessionService.getCurrentSession.mockResolvedValue(session);

      await service.addPayment(ctx, orderId, 'cash');

      expect(mockLedgerTransactionService.postTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          openSessionId: 'session-s1',
        })
      );
    });

    it('omits openSessionId when no session is open', async () => {
      mockOpenSessionService.getCurrentSession.mockResolvedValue(null);

      await service.addPayment(ctx, orderId, 'cash');

      const callArg = mockLedgerTransactionService.postTransaction.mock.calls[0][0];
      expect(callArg.openSessionId).toBeUndefined();
    });

    it('uses ctx.channelId for getCurrentSession', async () => {
      const session = { id: 'session-s1', channelId: 1, status: 'open' };
      mockOpenSessionService.getCurrentSession.mockResolvedValue(session);

      await service.addPayment(ctx, orderId, 'cash');

      expect(mockOpenSessionService.getCurrentSession).toHaveBeenCalledWith(ctx, 1);
    });
  });
});

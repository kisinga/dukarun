/**
 * Order reconciliation service tests
 *
 * Verifies divergence scanning and the ledger-rebuild healing action.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Order, OrderService, RequestContext } from '@vendure/core';
import { FinancialService } from '../../../src/services/financial/financial.service';
import { OrderReconciliationService } from '../../../src/services/payments/order-reconciliation.service';
import {
  LedgerConsistencyGuard,
  OrderArProjection,
} from '../../../src/services/financial/ledger-projection';

describe('OrderReconciliationService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;

  let service: OrderReconciliationService;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockPaymentService: jest.Mocked<import('@vendure/core').PaymentService>;
  let mockFinancialService: jest.Mocked<FinancialService>;
  let mockConnection: any;

  beforeEach(() => {
    mockOrderService = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      transitionToState: jest.fn(),
    } as any;

    mockFinancialService = {
      getOrderPaymentStatus: jest.fn(),
    } as any;

    mockConnection = {
      getRepository: jest.fn(() => ({ update: jest.fn() })),
      withTransaction: jest.fn(async (_ctx: any, fn: any) => fn(_ctx)),
    };

    mockPaymentService = {
      settlePayment: jest.fn(),
    } as any;

    const orderArProjection = new OrderArProjection(mockFinancialService as any);
    const ledgerConsistencyGuard = new LedgerConsistencyGuard();

    service = new OrderReconciliationService(
      mockOrderService,
      mockPaymentService as any,
      ledgerConsistencyGuard,
      orderArProjection,
      mockFinancialService as any,
      mockConnection
    );
  });

  describe('rebuildOrderFromLedger', () => {
    it('transitions a fully-paid order to PaymentSettled', async () => {
      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        total: 10000,
        totalWithTax: 10000,
        payments: [{ state: 'Settled', amount: 10000 }],
        customer: { id: 'cust-1' },
      } as unknown as Order;

      const rebuilt = { ...order, state: 'PaymentSettled' } as Order;

      mockOrderService.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(rebuilt);
      mockFinancialService.getOrderPaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 10000,
        amountOwing: 0,
      });
      mockOrderService.transitionToState.mockResolvedValue(rebuilt);

      const result = await service.rebuildOrderFromLedger(ctx, 'order-1', 'test rebuild');

      expect(result.state).toBe('PaymentSettled');
      expect(mockOrderService.transitionToState).toHaveBeenCalledWith(
        ctx,
        'order-1',
        'PaymentSettled'
      );
    });

    it('throws when a PaymentSettled order still owes', async () => {
      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'PaymentSettled',
        total: 10000,
        totalWithTax: 10000,
        payments: [{ state: 'Settled', amount: 5000 }],
        customer: { id: 'cust-1' },
      } as unknown as Order;

      mockOrderService.findOne.mockResolvedValueOnce(order);
      mockFinancialService.getOrderPaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 5000,
        amountOwing: 5000,
      });

      await expect(service.rebuildOrderFromLedger(ctx, 'order-1')).rejects.toThrow(
        'payment reversal or order void flow'
      );
      expect(mockOrderService.transitionToState).not.toHaveBeenCalled();
    });

    it('does not transition when state already matches ledger', async () => {
      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'PaymentSettled',
        total: 10000,
        totalWithTax: 10000,
        payments: [{ state: 'Settled', amount: 10000 }],
        customer: { id: 'cust-1' },
      } as unknown as Order;

      mockOrderService.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(order);
      mockFinancialService.getOrderPaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 10000,
        amountOwing: 0,
      });

      await service.rebuildOrderFromLedger(ctx, 'order-1');

      expect(mockOrderService.transitionToState).not.toHaveBeenCalled();
    });
  });
});

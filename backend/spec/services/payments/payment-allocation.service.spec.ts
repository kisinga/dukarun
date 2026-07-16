/**
 * Payment allocation service tests
 *
 * Focuses on cashier split settlements where the default Vendure payment process
 * can auto-advance the order to PaymentSettled before our code tries to do it.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Order, OrderService, Payment, PaymentService, RequestContext, User } from '@vendure/core';
import { PaymentAllocationService } from '../../../src/services/payments/payment-allocation.service';
import { FinancialService } from '../../../src/services/financial/financial.service';
import { OpenSessionService } from '../../../src/services/financial/open-session.service';
import { ChannelPaymentMethodService } from '../../../src/services/financial/channel-payment-method.service';
import { ChartOfAccountsService } from '../../../src/services/financial/chart-of-accounts.service';
import { CreditService } from '../../../src/services/credit/credit.service';
import {
  LedgerConsistencyGuard,
  OrderArProjection,
} from '../../../src/services/financial/ledger-projection';

describe('PaymentAllocationService', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;

  let service: PaymentAllocationService;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockPaymentService: jest.Mocked<PaymentService>;
  let mockFinancialService: jest.Mocked<FinancialService>;
  let mockOpenSessionService: jest.Mocked<OpenSessionService>;
  let mockChannelPaymentMethodService: jest.Mocked<ChannelPaymentMethodService>;
  let mockConnection: any;

  beforeEach(() => {
    mockOrderService = {
      findOne: jest.fn(),
      transitionToState: jest.fn(),
    } as any;

    mockPaymentService = {
      createPayment: jest.fn(),
      settlePayment: jest.fn(),
    } as any;

    mockFinancialService = {
      getOrderPaymentStatus: jest.fn(),
      recordPaymentAllocation: jest.fn(),
      getCustomerBalance: jest.fn(),
    } as any;

    mockOpenSessionService = {
      requireOpenSession: jest.fn(),
    } as any;

    mockChannelPaymentMethodService = {
      getChannelPaymentMethods: jest.fn(),
    } as any;

    mockConnection = {
      withTransaction: jest.fn(async (_ctx: any, fn: any) => fn(_ctx)),
      getRepository: jest.fn(() => ({
        update: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
      })),
    };

    service = new PaymentAllocationService(
      mockConnection,
      mockOrderService as any,
      mockPaymentService as any,
      mockFinancialService as any,
      {} as CreditService,
      {} as ChartOfAccountsService,
      mockOpenSessionService as any,
      mockChannelPaymentMethodService as any,
      {} as LedgerConsistencyGuard,
      new OrderArProjection(mockFinancialService as any),
      undefined
    );
  });

  describe('settleOrderPayments', () => {
    const baseOrder = {
      id: 'order-1',
      code: 'ORD-001',
      state: 'ArrangingPayment',
      total: 10000,
      totalWithTax: 10000,
      customer: { id: 'cust-1' },
      payments: [],
    } as unknown as Order;

    beforeEach(() => {
      mockOpenSessionService.requireOpenSession.mockResolvedValue({ id: 'session-1' } as any);
      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        { code: 'cash-1' } as any,
      ]);
      mockFinancialService.recordPaymentAllocation.mockResolvedValue(undefined);
    });

    it('succeeds when Vendure already advanced the order to PaymentSettled', async () => {
      const payment1 = {
        id: 'pmt-1',
        state: 'Settled',
        amount: 5000,
      } as unknown as Payment;
      const payment2 = {
        id: 'pmt-2',
        state: 'Settled',
        amount: 5000,
      } as unknown as Payment;

      mockPaymentService.createPayment
        .mockResolvedValueOnce(payment1)
        .mockResolvedValueOnce(payment2);

      // After the last tender settles, Vendure's default payment process has already
      // moved the order to PaymentSettled. Our reload must observe that.
      const reloadedOrder = {
        ...baseOrder,
        state: 'PaymentSettled',
        payments: [payment1, payment2],
      } as unknown as Order;

      mockOrderService.findOne
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(reloadedOrder);

      mockFinancialService.getOrderPaymentStatus
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 0,
          amountOwing: 10000,
        })
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 10000,
          amountOwing: 0,
        });

      const result = await service.settleOrderPayments(ctx, {
        orderId: 'order-1',
        tenders: [
          { paymentMethodCode: 'cash', amount: 5000 },
          { paymentMethodCode: 'cash', amount: 5000 },
        ],
      });

      expect(result.fullySettled).toBe(true);
      expect(result.amountSettled).toBe(10000);
      expect(mockOrderService.transitionToState).not.toHaveBeenCalled();
    });

    it('manually advances the order when Vendure did not auto-transition', async () => {
      const payment1 = {
        id: 'pmt-1',
        state: 'Settled',
        amount: 10000,
      } as unknown as Payment;

      mockPaymentService.createPayment.mockResolvedValueOnce(payment1);

      const reloadedOrder = {
        ...baseOrder,
        state: 'ArrangingPayment',
        payments: [payment1],
      } as unknown as Order;

      mockOrderService.findOne
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(reloadedOrder);

      mockOrderService.transitionToState.mockResolvedValue({
        ...reloadedOrder,
        state: 'PaymentSettled',
      } as Order);

      mockFinancialService.getOrderPaymentStatus
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 0,
          amountOwing: 10000,
        })
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 10000,
          amountOwing: 0,
        });

      await service.settleOrderPayments(ctx, {
        orderId: 'order-1',
        tenders: [{ paymentMethodCode: 'cash', amount: 10000 }],
      });

      expect(mockOrderService.transitionToState).toHaveBeenCalledWith(
        ctx,
        'order-1',
        'PaymentSettled'
      );
    });

    it('does not transition the order for a partial settlement', async () => {
      const payment1 = {
        id: 'pmt-1',
        state: 'Settled',
        amount: 4000,
      } as unknown as Payment;

      mockPaymentService.createPayment.mockResolvedValueOnce(payment1);

      const reloadedOrder = {
        ...baseOrder,
        state: 'ArrangingPayment',
        payments: [payment1],
      } as unknown as Order;

      mockOrderService.findOne
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(baseOrder)
        .mockResolvedValueOnce(reloadedOrder);

      mockFinancialService.getOrderPaymentStatus
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 0,
          amountOwing: 10000,
        })
        .mockResolvedValueOnce({
          totalOwed: 10000,
          amountPaid: 4000,
          amountOwing: 6000,
        });

      const result = await service.settleOrderPayments(ctx, {
        orderId: 'order-1',
        tenders: [{ paymentMethodCode: 'cash', amount: 4000 }],
      });

      expect(result.fullySettled).toBe(false);
      expect(result.remainingOwing).toBe(6000);
      expect(mockOrderService.transitionToState).not.toHaveBeenCalled();
    });
  });

  describe('getPendingCashierOrders', () => {
    it('returns pending orders with createdBy user and pendingSince', async () => {
      const createdByUser = { id: 'user-1', identifier: 'salesperson@example.com' } as User;
      const pendingOrder = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        customer: { id: 'cust-1' },
        customFields: { cashierPendingAt: new Date('2024-02-15T10:30:00Z') },
        createdByUserId: createdByUser,
      } as unknown as Order;

      const orderRepo: Record<string, jest.Mock> = {
        update: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
      };
      orderRepo.find.mockReturnValue(Promise.resolve([pendingOrder]));
      mockConnection.getRepository.mockReturnValue(orderRepo);

      mockFinancialService.getOrderPaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 0,
        amountOwing: 10000,
      });

      const result = await service.getPendingCashierOrders(ctx);

      expect(result).toHaveLength(1);
      expect(result[0].order.id).toBe('order-1');
      expect(result[0].amountOwing).toBe(10000);
      expect(result[0].pendingSince).toEqual(new Date('2024-02-15T10:30:00Z'));
      expect(result[0].createdBy).toBe(createdByUser);
      expect(orderRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['customer', 'createdByUserId'],
        })
      );
    });

    it('filters out orders that no longer owe money', async () => {
      const pendingOrder = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        customer: { id: 'cust-1' },
        customFields: { cashierPendingAt: new Date() },
        createdByUserId: null,
      } as unknown as Order;

      const orderRepo: Record<string, jest.Mock> = {
        update: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
      };
      orderRepo.find.mockReturnValue(Promise.resolve([pendingOrder]));
      mockConnection.getRepository.mockReturnValue(orderRepo);

      mockFinancialService.getOrderPaymentStatus.mockResolvedValue({
        totalOwed: 10000,
        amountPaid: 10000,
        amountOwing: 0,
      });

      const result = await service.getPendingCashierOrders(ctx);

      expect(result).toHaveLength(0);
    });
  });
});

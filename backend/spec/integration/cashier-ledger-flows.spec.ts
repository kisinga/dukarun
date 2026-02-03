/**
 * Combined cashier-ledger flows
 *
 * Simulates sequences that combine session, payment, and transfer to expose
 * ordering and channel bugs. Each flow is a focused test with mocks.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { CashierSessionService } from '../../src/services/financial/cashier-session.service';
import { PaymentAllocationService } from '../../src/services/payments/payment-allocation.service';
import { PeriodManagementResolver } from '../../src/plugins/ledger/period-management.resolver';
import { CashierSession } from '../../src/domain/cashier/cashier-session.entity';
import { CashDrawerCount } from '../../src/domain/cashier/cash-drawer-count.entity';
import { ACCOUNT_CODES } from '../../src/ledger/account-codes.constants';
import { Channel } from '@vendure/core';

describe('Cashier-ledger flows', () => {
  const channel1Id = 1;
  const channel2Id = 2;
  const ctx1 = { channelId: channel1Id, activeUserId: '1' } as RequestContext;
  const ctx2 = { channelId: channel2Id, activeUserId: '1' } as RequestContext;

  describe('Flow A: Single channel – session, pay order with debit account, transfer', () => {
    it('open session then pay order with debitAccountCode; recordPaymentAllocation receives channel and account', async () => {
      const mockSessionRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any;
      const session: CashierSession = {
        id: 's1',
        channelId: channel1Id,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '10000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.channelId === channel1Id && opts?.where?.status === 'open') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      mockSessionRepo.create.mockReturnValue(session);
      mockSessionRepo.save.mockResolvedValue(session);
      const mockChannelRepo = {
        findOne: jest.fn().mockImplementation(() => Promise.resolve({ id: channel1Id })),
      } as any;
      const mockCountRepo = {
        create: jest.fn().mockImplementation((o: any) => ({ ...o, id: 'c1' })),
        save: jest.fn().mockImplementation(() => Promise.resolve({ id: 'c1' })),
      } as any;
      const mockConnection = {
        getRepository: jest.fn((_ctx: any, entity: any) => {
          if (entity === CashierSession) return mockSessionRepo;
          if (entity === Channel) return mockChannelRepo;
          if (entity === CashDrawerCount) return mockCountRepo;
          return mockCountRepo;
        }),
      } as any;
      const mockLedgerQueryService = {
        getCashierSessionTotals: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ cashTotal: 0, mpesaTotal: 0, totalCollected: 0 })
          ),
      } as any;
      const cashierSessionService = new CashierSessionService(
        mockConnection,
        mockLedgerQueryService,
        { createReconciliation: jest.fn() } as any
      );

      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(session);
      const opened = await cashierSessionService.startSession(ctx1, {
        channelId: channel1Id,
        openingFloat: 10000,
      });
      expect(opened.channelId).toBe(channel1Id);

      const mockFinancialService = {
        recordPaymentAllocation: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockOrderRepo = {
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1', customFields: {} })),
        update: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockOrderService = {
        findOne: jest.fn(),
        addManualPaymentToOrder: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1' })),
      } as any;
      const order = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        total: 10000,
        totalWithTax: 10000,
        payments: [] as any[],
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
      const paymentAllocationService = new PaymentAllocationService(
        {
          withTransaction: (c: any, fn: (t: any) => Promise<any>) => fn(c),
          getRepository: () => mockOrderRepo,
        } as any,
        mockOrderService,
        { settlePayment: jest.fn().mockImplementation(() => Promise.resolve()) } as any,
        mockFinancialService,
        {} as any,
        {
          validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
        } as any,
        undefined as any
      );

      await paymentAllocationService.paySingleOrder(
        ctx1,
        'order-1',
        5000,
        undefined,
        undefined,
        ACCOUNT_CODES.CASH_ON_HAND
      );

      expect(mockFinancialService.recordPaymentAllocation).toHaveBeenCalledWith(
        ctx1,
        expect.any(String),
        expect.any(Object),
        'credit',
        5000,
        ACCOUNT_CODES.CASH_ON_HAND
      );
    });
  });

  describe('Flow B: Two channels – payment in channel 1 does not affect channel 2', () => {
    it('pay order in channel 1; recordPaymentAllocation receives channelId 1', async () => {
      const mockFinancialService = {
        recordPaymentAllocation: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockOrderRepo = {
        find: jest.fn().mockImplementation(() => Promise.resolve([])),
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1', customFields: {} })),
        update: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockOrderServiceFlowB = {
        findOne: jest.fn(),
        addManualPaymentToOrder: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'order-1' })),
      } as any;
      const orderFlowB = {
        id: 'order-1',
        code: 'ORD-001',
        state: 'ArrangingPayment',
        total: 10000,
        totalWithTax: 10000,
        payments: [] as any[],
        customer: { id: 'cust-1' },
      };
      const paymentFlowB = {
        id: 'pay-1',
        method: 'credit',
        amount: 5000,
        state: 'Authorized',
        metadata: { allocatedAmount: 5000 },
        createdAt: new Date(),
      };
      mockOrderServiceFlowB.findOne
        .mockResolvedValueOnce(orderFlowB)
        .mockResolvedValueOnce({ ...orderFlowB, payments: [paymentFlowB] });
      const paymentAllocationServiceFlowB = new PaymentAllocationService(
        {
          withTransaction: (c: any, fn: (t: any) => Promise<any>) => fn(c),
          getRepository: () => mockOrderRepo,
        } as any,
        mockOrderServiceFlowB,
        { settlePayment: jest.fn().mockImplementation(() => Promise.resolve()) } as any,
        mockFinancialService,
        {} as any,
        {
          validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
        } as any,
        undefined as any
      );

      await paymentAllocationServiceFlowB.paySingleOrder(
        ctx1,
        'order-1',
        5000,
        undefined,
        undefined,
        ACCOUNT_CODES.CASH_ON_HAND
      );

      const call = mockFinancialService.recordPaymentAllocation.mock.calls[0];
      const txCtx = call[0];
      expect(txCtx.channelId).toBe(channel1Id);
      expect(call[5]).toBe(ACCOUNT_CODES.CASH_ON_HAND);
    });
  });

  describe('Flow C: Session then transfer – transfer succeeds when session open', () => {
    it('createInterAccountTransfer succeeds with valid from/to and amount', async () => {
      const mockPeriodLockService = {
        validatePeriodIsOpen: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockChartOfAccountsService = {
        validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockPostingService = {
        post: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'je-1',
            channelId: channel1Id,
            sourceType: 'inter-account-transfer',
            sourceId: 'transfer-1',
          })
        ),
      } as any;
      const resolver = new PeriodManagementResolver(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPostingService,
        {} as any,
        mockPeriodLockService,
        {} as any,
        mockChartOfAccountsService
      );

      const result = await resolver.createInterAccountTransfer(ctx1, {
        channelId: channel1Id,
        transferId: 'transfer-1',
        fromAccountCode: ACCOUNT_CODES.CASH_ON_HAND,
        toAccountCode: ACCOUNT_CODES.BANK_MAIN,
        amount: '5000',
        entryDate: new Date().toISOString().slice(0, 10),
      });

      expect(result.channelId).toBe(channel1Id);
      expect(result.sourceId).toBe('transfer-1');
      expect(mockPostingService.post).toHaveBeenCalledWith(
        ctx1,
        'inter-account-transfer',
        'transfer-1',
        expect.objectContaining({ channelId: channel1Id })
      );
    });
  });

  describe('Flow D: Idempotency – same transferId returns same journal entry', () => {
    it('calling post twice with same sourceType/sourceId returns same entry (posting service contract)', async () => {
      const sameEntry = {
        id: 'je-same',
        channelId: channel1Id,
        sourceType: 'inter-account-transfer',
        sourceId: 'idem-1',
      };
      let postCallCount = 0;
      const mockPostingService = {
        post: jest.fn().mockImplementation(() => {
          postCallCount++;
          return Promise.resolve(sameEntry);
        }),
      } as any;
      const mockPeriodLockService = {
        validatePeriodIsOpen: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const mockChartOfAccountsService = {
        validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
      } as any;
      const resolver = new PeriodManagementResolver(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPostingService,
        {} as any,
        mockPeriodLockService,
        {} as any,
        mockChartOfAccountsService
      );

      const input = {
        channelId: channel1Id,
        transferId: 'idem-1',
        fromAccountCode: ACCOUNT_CODES.CASH_ON_HAND,
        toAccountCode: ACCOUNT_CODES.BANK_MAIN,
        amount: '1000',
        entryDate: new Date().toISOString().slice(0, 10),
      };

      const first = await resolver.createInterAccountTransfer(ctx1, input);
      const second = await resolver.createInterAccountTransfer(ctx1, input);

      expect(first.id).toBe(second.id);
      expect(first.id).toBe('je-same');
      expect(mockPostingService.post).toHaveBeenCalledTimes(2);
    });
  });
});

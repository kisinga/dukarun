/**
 * Combined cashier-ledger flows
 *
 * Simulates sequences that combine session, payment, and transfer to expose
 * ordering and channel bugs. Each flow is a focused test with mocks.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext } from '@vendure/core';
import { OpenSessionService } from '../../src/services/financial/open-session.service';
import { PaymentAllocationService } from '../../src/services/payments/payment-allocation.service';
import { PeriodManagementResolver } from '../../src/plugins/ledger/period-management.resolver';
import { CashierSession } from '../../src/domain/cashier/cashier-session.entity';
import { CashDrawerCount } from '../../src/domain/cashier/cash-drawer-count.entity';
import { Reconciliation } from '../../src/domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../src/domain/recon/reconciliation-account.entity';
import { Account } from '../../src/ledger/account.entity';
import { ACCOUNT_CODES } from '../../src/ledger/account-codes.constants';
import { Channel } from '@vendure/core';

describe('Cashier-ledger flows', () => {
  const channel1Id = 1;
  const channel2Id = 2;
  const ctx1 = { channelId: channel1Id, activeUserId: '1' } as RequestContext;
  const ctx2 = { channelId: channel2Id, activeUserId: '1' } as RequestContext;

  describe('Flow A: Single channel – session, pay order with debit account, transfer', () => {
    it('open session then pay order with debitAccountCode; recordPaymentAllocation receives channel and account', async () => {
      const FLOW_A_SESSION_ID = 'a1b2c3d4-e5f6-4171-a111-111111111111';
      const mockSessionRepo = {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any;
      const session: CashierSession = {
        id: FLOW_A_SESSION_ID,
        channelId: channel1Id,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(session)
        .mockResolvedValue(session);
      mockSessionRepo.create.mockReturnValue(session);
      mockSessionRepo.save.mockResolvedValue(session);
      const mockChannelRepo = {
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: channel1Id, paymentMethods: [] })),
      } as any;
      const mockCountRepo = {
        create: jest.fn().mockImplementation((o: any) => ({ ...o, id: 'c1' })),
        save: jest.fn().mockImplementation(() => Promise.resolve({ id: 'c1' })),
      } as any;
      const mockReconciliationRepo: any = {
        // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        save: jest.fn().mockImplementation((r: any) => Promise.resolve({ ...r, id: 'rec1' })),
      };
      const mockConnection = {
        getRepository: jest.fn((_ctx: any, entity: any): any => {
          if (entity === CashierSession) return mockSessionRepo;
          if (entity === Channel) return mockChannelRepo;
          if (entity === CashDrawerCount) return mockCountRepo;
          if (entity === Reconciliation) return mockReconciliationRepo;
          if (entity === ReconciliationAccount) return mockCountRepo;
          // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
          if (entity === Account) return { find: jest.fn().mockResolvedValue([]) };
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
      const mockOpenSessionFinancial = {
        // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
        postVarianceAdjustment: jest.fn().mockResolvedValue(undefined),
      } as any;
      const mockChannelPaymentMethodService = {
        getChannelPaymentMethods: (jest.fn() as any).mockResolvedValue([]),
        getPaymentMethodDisplayName: jest.fn((pm: { code: string }) => pm.code),
      } as any;
      const cashierSessionService = new (OpenSessionService as any)(
        mockConnection,
        mockLedgerQueryService,
        // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
        { createReconciliation: jest.fn().mockResolvedValue({ id: 'rec1' }) },
        mockOpenSessionFinancial,
        mockChannelPaymentMethodService
      );

      const opened = await cashierSessionService.startSession(ctx1, {
        channelId: channel1Id,
        openingBalances: [],
      });
      expect(opened.channelId).toBe(channel1Id);

      const mockPaymentFinancialService = {
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
        mockPaymentFinancialService,
        {} as any,
        {
          validatePaymentSourceAccount: jest.fn().mockImplementation(() => Promise.resolve()),
        } as any,
        cashierSessionService,
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

      expect(mockPaymentFinancialService.recordPaymentAllocation).toHaveBeenCalledWith(
        ctx1,
        expect.any(String),
        expect.any(Object),
        'credit',
        5000,
        ACCOUNT_CODES.CASH_ON_HAND,
        FLOW_A_SESSION_ID
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
      const mockCashierSessionServiceFlowB = {
        requireOpenSession: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'session-b', channelId: channel1Id })),
      } as any;
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
        mockCashierSessionServiceFlowB,
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
      const mockCashierSessionServiceFlowC = {
        requireOpenSession: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'session-c', channelId: channel1Id })),
      } as any;
      const mockFinancialService = {} as any;
      const resolver = new PeriodManagementResolver(
        {} as any,
        {} as any,
        {} as any,
        mockCashierSessionServiceFlowC,
        mockPostingService,
        {} as any,
        mockPeriodLockService,
        {} as any,
        mockChartOfAccountsService,
        mockFinancialService
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
      const mockCashierSessionServiceFlowD = {
        requireOpenSession: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'session-d', channelId: channel1Id })),
      } as any;
      const mockFinancialServiceFlowD = {} as any;
      const resolver = new PeriodManagementResolver(
        {} as any,
        {} as any,
        {} as any,
        mockCashierSessionServiceFlowD,
        mockPostingService,
        {} as any,
        mockPeriodLockService,
        {} as any,
        mockChartOfAccountsService,
        mockFinancialServiceFlowD
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

/**
 * Debit account validation and payment flows
 *
 * Tests ChartOfAccountsService.validatePaymentSourceAccount, PaymentAllocationService.paySingleOrder
 * amount/debit validation, and eligibleDebitAccounts filter (via LedgerViewerResolver).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { ChartOfAccountsService } from '../../../src/services/financial/chart-of-accounts.service';
import { PaymentAllocationService } from '../../../src/services/payments/payment-allocation.service';
import { LedgerViewerResolver } from '../../../src/plugins/ledger/ledger-viewer.resolver';
import { Account } from '../../../src/ledger/account.entity';
import { ACCOUNT_CODES } from '../../../src/ledger/account-codes.constants';

describe('ChartOfAccountsService.validatePaymentSourceAccount', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
  let service: ChartOfAccountsService;
  let mockAccountRepo: any;
  let mockConnection: jest.Mocked<TransactionalConnection>;

  beforeEach(() => {
    mockAccountRepo = {
      findOne: jest.fn(),
    };
    mockConnection = {
      getRepository: jest.fn(() => mockAccountRepo),
    } as any;
    service = new ChartOfAccountsService(mockConnection);
  });

  it('should not throw for valid cash child account', async () => {
    const cashParentId = 'cash-parent-id';
    mockAccountRepo.findOne
      .mockResolvedValueOnce({
        id: 'acc-1',
        channelId: 1,
        code: ACCOUNT_CODES.CASH_ON_HAND,
        name: 'Cash on Hand',
        type: 'asset',
        isActive: true,
        isParent: false,
        parentAccountId: cashParentId,
      })
      .mockResolvedValueOnce({
        id: cashParentId,
        code: ACCOUNT_CODES.CASH,
        channelId: 1,
      });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.CASH_ON_HAND)
    ).resolves.not.toThrow();
  });

  it('should throw when debitAccountCode is missing or empty', async () => {
    await expect(service.validatePaymentSourceAccount(ctx, '')).rejects.toThrow(
      'debitAccountCode is required'
    );
    await expect(service.validatePaymentSourceAccount(ctx, '   ')).rejects.toThrow(
      'debitAccountCode is required'
    );
  });

  it('should throw when account does not exist for channel', async () => {
    mockAccountRepo.findOne.mockResolvedValue(null);
    await expect(service.validatePaymentSourceAccount(ctx, 'CASH_ON_HAND')).rejects.toThrow(
      /does not exist for this channel/
    );
  });

  it('should throw when account is not active', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      code: ACCOUNT_CODES.CASH_ON_HAND,
      type: 'asset',
      isActive: false,
      isParent: false,
    });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.CASH_ON_HAND)
    ).rejects.toThrow(/not active/);
  });

  it('should throw when account type is not asset', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      code: ACCOUNT_CODES.SALES,
      type: 'income',
      isActive: true,
      isParent: false,
    });
    await expect(service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.SALES)).rejects.toThrow(
      /Only asset accounts can be used as payment source/
    );
  });

  it('should throw when account is parent', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      code: ACCOUNT_CODES.CASH,
      type: 'asset',
      isActive: true,
      isParent: true,
    });
    await expect(service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.CASH)).rejects.toThrow(
      /Cannot use a parent/
    );
  });

  it('should throw for ACCOUNTS_RECEIVABLE', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      type: 'asset',
      isActive: true,
      isParent: false,
    });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
    ).rejects.toThrow(/not an allowed payment source/);
  });

  it('should throw for INVENTORY', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      code: ACCOUNT_CODES.INVENTORY,
      type: 'asset',
      isActive: true,
      isParent: false,
    });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.INVENTORY)
    ).rejects.toThrow(/not an allowed payment source/);
  });

  it('should throw when account is not a cash child (no parent)', async () => {
    mockAccountRepo.findOne.mockResolvedValue({
      id: 'acc-1',
      channelId: 1,
      code: ACCOUNT_CODES.CLEARING_GENERIC,
      name: 'Clearing Generic',
      type: 'asset',
      isActive: true,
      isParent: false,
      parentAccountId: null,
    });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.CLEARING_GENERIC)
    ).rejects.toThrow(/Only cash accounts/);
  });

  it('should throw when account parent is not CASH', async () => {
    mockAccountRepo.findOne
      .mockResolvedValueOnce({
        id: 'acc-1',
        channelId: 1,
        code: ACCOUNT_CODES.CLEARING_CREDIT,
        name: 'Clearing Credit',
        type: 'asset',
        isActive: true,
        isParent: false,
        parentAccountId: 'other-parent-id',
      })
      .mockResolvedValueOnce({
        id: 'other-parent-id',
        code: 'OTHER_PARENT',
        channelId: 1,
      });
    await expect(
      service.validatePaymentSourceAccount(ctx, ACCOUNT_CODES.CLEARING_CREDIT)
    ).rejects.toThrow(/Only cash accounts/);
  });
});

describe('PaymentAllocationService.paySingleOrder', () => {
  const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
  let service: PaymentAllocationService;
  let mockOrderService: any;
  let mockPaymentService: any;
  let mockFinancialService: any;
  let mockConnection: any;
  let mockChartOfAccountsService: any;

  beforeEach(() => {
    const mockOrderRepo = {
      find: jest.fn().mockImplementation(() => Promise.resolve([])),
      findOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: 'order-1', customFields: {} })),
      update: jest.fn().mockImplementation(() => Promise.resolve()),
    } as any;
    mockOrderService = {
      findOne: jest.fn(),
    };
    mockPaymentService = {
      createPayment: jest.fn(),
      settlePayment: jest.fn(),
    };
    mockFinancialService = {
      recordPaymentAllocation: jest.fn(),
    };
    mockConnection = {
      withTransaction: jest.fn((_ctx: any, fn: (t: any) => Promise<any>) => fn(_ctx)),
      getRepository: jest.fn((_ctx: any, entity: any) =>
        entity === Order ? mockOrderRepo : ({} as any)
      ),
    };
    mockChartOfAccountsService = {
      validatePaymentSourceAccount: jest.fn(),
    };
    const mockCashierSessionService = {
      requireOpenSession: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ id: 'session-123', channelId: 1 })),
    } as any;
    service = new PaymentAllocationService(
      mockConnection,
      mockOrderService,
      mockPaymentService,
      mockFinancialService,
      {} as any,
      mockChartOfAccountsService,
      mockCashierSessionService,
      undefined
    );
  });

  const createOrder = (
    overrides: Partial<{
      id: string;
      code: string;
      state: string;
      total: number;
      totalWithTax: number;
      payments: Array<{
        method: string;
        amount: number;
        state: string;
        id: string;
        metadata?: any;
        createdAt?: Date;
      }>;
      customer: { id: string };
    }> = {}
  ) => ({
    id: 'order-1',
    code: 'ORD-001',
    state: 'ArrangingPayment',
    total: 10000,
    totalWithTax: 10000,
    payments: [],
    customer: { id: 'cust-1' },
    ...overrides,
  });

  it('should reject payment amount <= 0', async () => {
    const order = createOrder({ totalWithTax: 10000, total: 10000 });
    mockOrderService.findOne.mockResolvedValue(order);

    await expect(service.paySingleOrder(ctx, 'order-1', 0)).rejects.toThrow(
      /must be greater than zero/
    );

    await expect(service.paySingleOrder(ctx, 'order-1', -100)).rejects.toThrow(
      /must be greater than zero/
    );
  });

  it('should reject payment amount > outstanding amount', async () => {
    const order = createOrder({
      totalWithTax: 10000,
      payments: [{ id: 'p1', method: 'credit', amount: 2000, state: 'Settled' }],
    });
    mockOrderService.findOne.mockResolvedValue(order);

    await expect(service.paySingleOrder(ctx, 'order-1', 10000)).rejects.toThrow(
      /cannot exceed outstanding/
    );
  });

  it('should call validatePaymentSourceAccount when debitAccountCode provided and throw if invalid', async () => {
    const order = createOrder();
    mockOrderService.findOne.mockResolvedValue(order);
    mockChartOfAccountsService.validatePaymentSourceAccount.mockRejectedValue(
      new Error('Account INVALID is not an allowed payment source.')
    );

    await expect(
      service.paySingleOrder(ctx, 'order-1', 5000, undefined, undefined, 'INVALID')
    ).rejects.toThrow(/not an allowed payment source/);

    expect(mockChartOfAccountsService.validatePaymentSourceAccount).toHaveBeenCalledWith(
      ctx,
      'INVALID'
    );
  });

  it('should call recordPaymentAllocation with debitAccountCode when provided', async () => {
    const order = createOrder();
    const payment = {
      id: 'pay-1',
      method: 'credit',
      amount: 5000,
      state: 'Authorized',
      metadata: { allocatedAmount: 5000 },
      createdAt: new Date(),
    };
    mockOrderService.findOne.mockResolvedValue(order);
    mockPaymentService.createPayment.mockResolvedValue(payment);
    mockPaymentService.settlePayment.mockResolvedValue({ ...payment, state: 'Settled' });
    mockFinancialService.recordPaymentAllocation.mockResolvedValue(undefined);

    await service.paySingleOrder(ctx, 'order-1', 5000, undefined, undefined, 'CASH_ON_HAND');

    expect(mockChartOfAccountsService.validatePaymentSourceAccount).toHaveBeenCalledWith(
      ctx,
      'CASH_ON_HAND'
    );
    expect(mockPaymentService.createPayment).toHaveBeenCalledWith(
      ctx,
      order,
      5000,
      expect.any(String),
      expect.objectContaining({ allocatedAmount: 5000 })
    );
    expect(mockFinancialService.recordPaymentAllocation).toHaveBeenCalled();
    const recordCall = mockFinancialService.recordPaymentAllocation.mock.calls[0];
    expect(recordCall[4]).toBe(5000);
    expect(recordCall[5]).toBe('CASH_ON_HAND');
    expect(recordCall[6]).toBe('session-123');
  });

  it('should call recordPaymentAllocation without debitAccountCode when not provided', async () => {
    const order = createOrder();
    const payment = {
      id: 'pay-1',
      method: 'credit',
      amount: 5000,
      state: 'Authorized',
      metadata: { allocatedAmount: 5000 },
      createdAt: new Date(),
    };
    mockOrderService.findOne.mockResolvedValue(order);
    mockPaymentService.createPayment.mockResolvedValue(payment);
    mockPaymentService.settlePayment.mockResolvedValue({ ...payment, state: 'Settled' });
    mockFinancialService.recordPaymentAllocation.mockResolvedValue(undefined);

    await service.paySingleOrder(ctx, 'order-1', 5000);

    expect(mockChartOfAccountsService.validatePaymentSourceAccount).not.toHaveBeenCalled();
    const recordCall = mockFinancialService.recordPaymentAllocation.mock.calls[0];
    expect(recordCall[5]).toBeUndefined();
    expect(recordCall[6]).toBe('session-123');
  });
});

describe('LedgerViewerResolver.eligibleDebitAccounts', () => {
  const ctx = { channelId: 1 } as RequestContext;
  const cashParentId = 'cash-parent-id';
  let resolver: LedgerViewerResolver;
  let mockAccountRepo: any;
  let mockDataSource: any;
  let mockLedgerQueryService: any;

  beforeEach(() => {
    const cashParent = {
      id: cashParentId,
      code: ACCOUNT_CODES.CASH,
      channelId: 1,
    };
    mockAccountRepo = {
      findOne: jest.fn((() => Promise.resolve(cashParent)) as any),
      find: jest.fn(),
    };
    mockDataSource = {
      getRepository: jest.fn(() => mockAccountRepo),
    };
    mockLedgerQueryService = {
      getAccountBalance: jest.fn().mockImplementation(() => Promise.resolve({ balance: 0 })),
    } as any;
    resolver = new LedgerViewerResolver(mockDataSource, mockLedgerQueryService);
  });

  it('should return only cash child accounts (parentAccountId = CASH)', async () => {
    const cashOnHand: Partial<Account> = {
      id: '1',
      code: ACCOUNT_CODES.CASH_ON_HAND,
      name: 'Cash on Hand',
      type: 'asset',
      isActive: true,
      isParent: false,
      channelId: 1,
      parentAccountId: cashParentId,
    };
    const bankMain: Partial<Account> = {
      id: '2',
      code: ACCOUNT_CODES.BANK_MAIN,
      name: 'Bank Main',
      type: 'asset',
      isActive: true,
      isParent: false,
      channelId: 1,
      parentAccountId: cashParentId,
    };
    mockAccountRepo.find.mockResolvedValue([cashOnHand, bankMain]);

    const result = await resolver.eligibleDebitAccounts(ctx);

    expect(result.items).toHaveLength(2);
    const codes = result.items.map((a: any) => a.code);
    expect(codes).toContain(ACCOUNT_CODES.CASH_ON_HAND);
    expect(codes).toContain(ACCOUNT_CODES.BANK_MAIN);
    expect(mockAccountRepo.findOne).toHaveBeenCalledWith({
      where: { channelId: 1, code: ACCOUNT_CODES.CASH },
    });
    expect(mockAccountRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channelId: 1,
          isActive: true,
          parentAccountId: cashParentId,
        },
        order: { code: 'ASC' },
      })
    );
  });

  it('should return empty items when CASH parent not found', async () => {
    mockAccountRepo.findOne.mockResolvedValue(null);

    const result = await resolver.eligibleDebitAccounts(ctx);

    expect(result.items).toEqual([]);
    expect(mockAccountRepo.find).not.toHaveBeenCalled();
  });
});

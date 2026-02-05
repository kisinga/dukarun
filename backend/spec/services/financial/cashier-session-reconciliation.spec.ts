/**
 * Cashier Session Reconciliation Tests
 *
 * Tests for the integration between CashierSessionService and payment method
 * reconciliation configuration.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import { OpenSessionService } from '../../../src/services/financial/open-session.service';
import { SessionReconciliationRequirements } from '../../../src/services/financial/period-management.types';
import { CashierSession } from '../../../src/domain/cashier/cashier-session.entity';
import { CashDrawerCount } from '../../../src/domain/cashier/cash-drawer-count.entity';
import { MpesaVerification } from '../../../src/domain/cashier/mpesa-verification.entity';
import { Reconciliation } from '../../../src/domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../../src/domain/recon/reconciliation-account.entity';
import { Account } from '../../../src/ledger/account.entity';
import { FinancialService } from '../../../src/services/financial/financial.service';
import { LedgerQueryService } from '../../../src/services/financial/ledger-query.service';
import { ReconciliationService } from '../../../src/services/financial/reconciliation.service';

const UUID_SESSION_1 = 'a1b2c3d4-e5f6-4171-8111-111111111111';
const UUID_SESSION_2 = 'b2c3d4e5-f6a7-4272-8222-222222222222';
const UUID_EXISTING = 'c3d4e5f6-a7b8-4373-8333-333333333333';
const UUID_SESSION_A = 'd4e5f6a7-b8c9-4474-8444-444444444444';
const UUID_SESSION_B = 'e5f6a7b8-c9d0-4575-8555-555555555555';

describe('CashierSessionService - Reconciliation Integration', () => {
  const ctx = {
    channelId: 1,
    activeUserId: '1',
  } as RequestContext;

  let service: OpenSessionService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockLedgerQueryService: jest.Mocked<LedgerQueryService>;
  let mockReconciliationService: jest.Mocked<ReconciliationService>;
  let mockFinancialService: any;
  let mockSessionRepo: any;
  let mockChannelRepo: any;
  let mockCountRepo: any;
  let mockChannelPaymentMethodService: any;

  beforeEach(() => {
    mockSessionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockChannelRepo = {
      findOne: jest.fn(),
    };

    mockCountRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    const mockReconRepo = {
      find: jest.fn<() => Promise<Reconciliation[]>>().mockResolvedValue([]),
      findOne: jest.fn<() => Promise<Reconciliation | null>>().mockResolvedValue(null),
    } as any;
    // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
    const mockReconAccountRepo: any = { find: jest.fn().mockResolvedValue([]) };

    const mockAccountRepo = {
      find: (jest.fn() as any).mockResolvedValue([{ id: 'acc-1', code: 'CASH_ON_HAND' }]),
    };
    mockConnection = {
      getRepository: jest.fn((_ctx: any, entity: any) => {
        if (entity === CashierSession) return mockSessionRepo;
        if (entity === Channel) return mockChannelRepo;
        if (entity === CashDrawerCount) return mockCountRepo;
        if (entity === Reconciliation) return mockReconRepo;
        if (entity === ReconciliationAccount) return mockReconAccountRepo;
        if (entity === Account) return mockAccountRepo;
        if (entity === MpesaVerification)
          return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
        return {};
      }),
      withTransaction: jest.fn((ctx: any, callback: (txCtx: any) => Promise<any>) => callback(ctx)),
    } as any;

    mockLedgerQueryService = {
      getCashierSessionTotals: jest.fn(),
    } as any;

    mockReconciliationService = {
      // @ts-expect-error - jest.fn() generic inference for mockResolvedValue
      createReconciliation: jest.fn().mockResolvedValue({ id: 'rec1' }),
    } as any;

    mockFinancialService = {
      postVarianceAdjustment: jest.fn().mockImplementation(() => Promise.resolve()),
    };

    mockChannelPaymentMethodService = {
      getChannelPaymentMethods: (jest.fn() as any).mockResolvedValue([]),
      getPaymentMethodDisplayName: jest.fn((pm: { code: string }) => pm.code),
    };

    service = new (OpenSessionService as any)(
      mockConnection,
      mockLedgerQueryService,
      mockReconciliationService,
      mockFinancialService,
      mockChannelPaymentMethodService
    );
  });

  describe('One open session per store', () => {
    const defaultLedgerTotals = { cashTotal: 0, mpesaTotal: 0, totalCollected: 0 };

    it('should create session when none open and getCurrentSession returns it', async () => {
      const channelId = 1;
      const savedSession: CashierSession = {
        id: UUID_SESSION_1,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(savedSession);
      mockChannelRepo.findOne.mockResolvedValue({ id: channelId, paymentMethods: [] });
      mockSessionRepo.create.mockReturnValue(savedSession);
      mockSessionRepo.save.mockResolvedValue(savedSession);
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-1' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-1' });

      const result = await service.startSession(ctx, { channelId, openingBalances: [] });

      expect(result.status).toBe('open');
      expect(result.channelId).toBe(channelId);
      expect(result.id).toBe(UUID_SESSION_1);
      mockSessionRepo.findOne.mockResolvedValue(savedSession);
      const current = await service.getCurrentSession(ctx, channelId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe(UUID_SESSION_1);
      expect(current!.channelId).toBe(channelId);
    });

    it('should throw when opening second session for same channel', async () => {
      const channelId = 1;
      const existingSession: CashierSession = {
        id: UUID_EXISTING,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValue(existingSession);

      await expect(service.startSession(ctx, { channelId, openingBalances: [] })).rejects.toThrow(
        /already has an open cashier session/
      );

      expect(mockSessionRepo.findOne).toHaveBeenCalledWith({
        where: { channelId, status: 'open' },
      });
      await expect(service.startSession(ctx, { channelId, openingBalances: [] })).rejects.toThrow(
        existingSession.id
      );
    });

    it('should allow open after close for same channel', async () => {
      const channelId = 1;
      const session1: CashierSession = {
        id: UUID_SESSION_1,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(session1);
      mockChannelRepo.findOne.mockResolvedValue({ id: channelId, paymentMethods: [] });
      mockSessionRepo.create.mockImplementation((o: any) => ({ ...o, id: UUID_SESSION_1 }));
      mockSessionRepo.save.mockImplementation((s: any) => Promise.resolve({ ...s }));
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-1' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-1' });

      await service.startSession(ctx, { channelId, openingBalances: [] });

      const session1Open = { ...session1, status: 'open' as const };
      const session1Closed = {
        ...session1,
        status: 'closed' as const,
        closedAt: new Date(),
        closingDeclared: '10000',
      };
      let closeSessionSaveCalled = false;
      mockSessionRepo.save.mockImplementation((s: any) => {
        if (s.id === session1.id && s.status === 'closed') closeSessionSaveCalled = true;
        return Promise.resolve({ ...s });
      });
      // After closeSession saves, findOne by id must return closed session (for createSessionReconciliation / getSessionSummary)
      mockSessionRepo.findOne.mockImplementation((opts: any) => {
        const id = opts?.where?.id;
        if (id === session1.id && closeSessionSaveCalled) return Promise.resolve(session1Closed);
        if (id === session1.id) return Promise.resolve(session1Open);
        return Promise.resolve(null);
      });
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-2' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-2' });

      await service.closeSession(ctx, {
        sessionId: session1.id,
        closingBalances: [{ accountCode: 'CASH_ON_HAND', amountCents: 10000 }],
      });

      const session2: CashierSession = {
        id: UUID_SESSION_2,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(session2);
      mockSessionRepo.create.mockReturnValue(session2);
      mockSessionRepo.save.mockResolvedValue(session2);
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-3' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-3' });

      const opened = await service.startSession(ctx, { channelId, openingBalances: [] });
      expect(opened.id).toBe(UUID_SESSION_2);
      expect(opened.status).toBe('open');
      mockSessionRepo.findOne.mockResolvedValue(session2);
      const current = await service.getCurrentSession(ctx, channelId);
      expect(current!.id).toBe(UUID_SESSION_2);
    });

    it('should allow open sessions for two different channels', async () => {
      const channelA = 1;
      const channelB = 2;
      const ctxA = { ...ctx, channelId: channelA } as RequestContext;
      const ctxB = { ...ctx, channelId: channelB } as RequestContext;

      mockChannelRepo.findOne.mockImplementation((_opts: any) =>
        Promise.resolve({ id: _opts?.where?.id ?? 1, paymentMethods: [] })
      );
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-x' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-x' });

      const sessionA: CashierSession = {
        id: UUID_SESSION_A,
        channelId: channelA,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      const sessionB: CashierSession = {
        id: UUID_SESSION_B,
        channelId: channelB,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;
      // startSession A: findOne(open) -> null; startSession B: findOne(open) -> null
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockSessionRepo.create.mockReturnValueOnce(sessionA).mockReturnValueOnce(sessionB);
      mockSessionRepo.save.mockResolvedValueOnce(sessionA).mockResolvedValueOnce(sessionB);

      const resultA = await service.startSession(ctxA, {
        channelId: channelA,
        openingBalances: [],
      });
      expect(resultA.channelId).toBe(channelA);
      expect(resultA.id).toBe(UUID_SESSION_A);

      const resultB = await service.startSession(ctxB, {
        channelId: channelB,
        openingBalances: [],
      });
      expect(resultB.channelId).toBe(channelB);
      expect(resultB.id).toBe(UUID_SESSION_B);

      mockSessionRepo.findOne.mockImplementation((opts: any) => {
        if (opts.where.channelId === channelA) return Promise.resolve(sessionA);
        if (opts.where.channelId === channelB) return Promise.resolve(sessionB);
        return Promise.resolve(null);
      });

      const currentA = await service.getCurrentSession(ctxA, channelA);
      const currentB = await service.getCurrentSession(ctxB, channelB);
      expect(currentA!.id).toBe(UUID_SESSION_A);
      expect(currentB!.id).toBe(UUID_SESSION_B);
      expect(currentA!.channelId).toBe(channelA);
      expect(currentB!.channelId).toBe(channelB);
    });
  });

  describe('getSessionReconciliationRequirements', () => {
    const createMockPaymentMethod = (
      code: string,
      customFields: Record<string, any>
    ): PaymentMethod =>
      ({
        id: Math.random(),
        code,
        enabled: true,
        customFields,
      }) as unknown as PaymentMethod;

    it('should return reconciliation requirements based on payment methods', async () => {
      const sessionId = 'session-123';
      const channelId = 1;

      // Mock session
      const session: CashierSession = {
        id: sessionId,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);

      // Mock channel with payment methods
      const cashPaymentMethod = createMockPaymentMethod('cash-1', {
        reconciliationType: 'blind_count',
        ledgerAccountCode: 'CASH_ON_HAND',
        isCashierControlled: true,
        requiresReconciliation: true,
      });

      const mpesaPaymentMethod = createMockPaymentMethod('mpesa-1', {
        reconciliationType: 'transaction_verification',
        ledgerAccountCode: 'CLEARING_MPESA',
        isCashierControlled: true,
        requiresReconciliation: true,
      });

      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        cashPaymentMethod,
        mpesaPaymentMethod,
      ]);

      const result = await service.getSessionReconciliationRequirements(ctx, sessionId);

      expect(result.blindCountRequired).toBe(true);
      expect(result.verificationRequired).toBe(true);
      expect(result.paymentMethods).toHaveLength(2);
      expect(result.paymentMethods[0].reconciliationType).toBe('blind_count');
      expect(result.paymentMethods[1].reconciliationType).toBe('transaction_verification');
    });

    it('should not require blind count if no cash payment method', async () => {
      const sessionId = 'session-123';
      const channelId = 1;

      const session: CashierSession = {
        id: sessionId,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);

      // Only M-Pesa payment method
      const mpesaPaymentMethod = createMockPaymentMethod('mpesa-1', {
        reconciliationType: 'transaction_verification',
        ledgerAccountCode: 'CLEARING_MPESA',
        isCashierControlled: true,
        requiresReconciliation: true,
      });

      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        mpesaPaymentMethod,
      ]);

      const result = await service.getSessionReconciliationRequirements(ctx, sessionId);

      expect(result.blindCountRequired).toBe(false);
      expect(result.verificationRequired).toBe(true);
    });

    it('should exclude non-cashier-controlled payment methods', async () => {
      const sessionId = 'session-123';
      const channelId = 1;

      const session: CashierSession = {
        id: sessionId,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);

      // Cash is cashier-controlled, credit is not
      const cashPaymentMethod = createMockPaymentMethod('cash-1', {
        reconciliationType: 'blind_count',
        ledgerAccountCode: 'CASH_ON_HAND',
        isCashierControlled: true,
        requiresReconciliation: true,
      });

      const creditPaymentMethod = createMockPaymentMethod('credit-1', {
        reconciliationType: 'none',
        ledgerAccountCode: 'CLEARING_CREDIT',
        isCashierControlled: false, // Not cashier-controlled
        requiresReconciliation: false,
      });

      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        cashPaymentMethod,
        creditPaymentMethod,
      ]);

      const result = await service.getSessionReconciliationRequirements(ctx, sessionId);

      // Should only include cash (cashier-controlled)
      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].paymentMethodCode).toBe('cash-1');
    });

    it('should exclude disabled payment methods', async () => {
      const sessionId = 'session-123';
      const channelId = 1;

      const session: CashierSession = {
        id: sessionId,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);

      // Cash is enabled, M-Pesa is disabled
      const cashPaymentMethod = {
        ...createMockPaymentMethod('cash-1', {
          reconciliationType: 'blind_count',
          isCashierControlled: true,
        }),
        enabled: true,
      };

      const mpesaPaymentMethod = {
        ...createMockPaymentMethod('mpesa-1', {
          reconciliationType: 'transaction_verification',
          isCashierControlled: true,
        }),
        enabled: false, // Disabled
      };

      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        cashPaymentMethod,
        mpesaPaymentMethod,
      ]);

      const result = await service.getSessionReconciliationRequirements(ctx, sessionId);

      // Should only include cash (enabled)
      expect(result.paymentMethods).toHaveLength(1);
      expect(result.paymentMethods[0].paymentMethodCode).toBe('cash-1');
    });

    it('should throw error if session not found', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSessionReconciliationRequirements(ctx, 'invalid-session')
      ).rejects.toThrow('Cashier session invalid-session not found');
    });

    it('should return empty requirements if no payment methods', async () => {
      const sessionId = 'session-123';
      const channelId = 1;

      const session: CashierSession = {
        id: sessionId,
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);
      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([]);

      const result = await service.getSessionReconciliationRequirements(ctx, sessionId);

      expect(result.blindCountRequired).toBe(false);
      expect(result.verificationRequired).toBe(false);
      expect(result.paymentMethods).toHaveLength(0);
    });
  });

  describe('getChannelReconciliationRequirements', () => {
    it('should return channel-level requirements without session', async () => {
      const channelId = 1;

      const cashPaymentMethod = {
        id: 1,
        code: 'cash-1',
        enabled: true,
        customFields: {
          reconciliationType: 'blind_count',
          ledgerAccountCode: 'CASH_ON_HAND',
          isCashierControlled: true,
          requiresReconciliation: true,
        },
      } as unknown as PaymentMethod;

      mockChannelPaymentMethodService.getChannelPaymentMethods.mockResolvedValue([
        cashPaymentMethod,
      ]);

      const result = await service.getChannelReconciliationRequirements(ctx, channelId);

      expect(result.blindCountRequired).toBe(true);
      expect(result.paymentMethods).toHaveLength(1);
    });
  });
});

describe('Reconciliation Flow Scenarios', () => {
  describe('Typical POS End-of-Day Flow', () => {
    it('documents the expected reconciliation sequence', () => {
      /**
       * Expected Flow:
       * 1. Cashier opens session with opening float (mandatory blind count)
       * 2. Throughout shift: Cash and M-Pesa payments recorded
       * 3. Optional: Interim blind count at any time
       * 4. End of shift:
       *    a. Mandatory closing blind count (cash)
       *    b. Optional M-Pesa transaction verification
       * 5. Manager reviews any variances
       * 6. Reconciliation records created
       * 7. Session closed
       */
      const flow = {
        step1_openSession: 'Opening float + opening count',
        step2_duringShift: 'Payments posted to ledger with sessionId',
        step3_optional: 'Interim counts can happen anytime',
        step4_closeSequence: {
          a: 'Closing blind count (mandatory for cash)',
          b: 'M-Pesa verification (if configured)',
        },
        step5_managerReview: 'Manager sees variance, can review',
        step6_createReconciliation: 'Formal reconciliation record',
        step7_closeSession: 'Session status set to closed',
      };

      expect(flow.step1_openSession).toBeDefined();
      expect(flow.step4_closeSequence.a).toContain('blind count');
    });
  });
});

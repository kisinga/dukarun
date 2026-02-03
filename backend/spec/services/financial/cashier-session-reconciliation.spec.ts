/**
 * Cashier Session Reconciliation Tests
 *
 * Tests for the integration between CashierSessionService and payment method
 * reconciliation configuration.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Channel, PaymentMethod, RequestContext, TransactionalConnection } from '@vendure/core';
import {
  CashierSessionService,
  SessionReconciliationRequirements,
} from '../../../src/services/financial/cashier-session.service';
import { CashierSession } from '../../../src/domain/cashier/cashier-session.entity';
import { CashDrawerCount } from '../../../src/domain/cashier/cash-drawer-count.entity';
import { MpesaVerification } from '../../../src/domain/cashier/mpesa-verification.entity';
import { LedgerQueryService } from '../../../src/services/financial/ledger-query.service';
import { ReconciliationService } from '../../../src/services/financial/reconciliation.service';

describe('CashierSessionService - Reconciliation Integration', () => {
  const ctx = {
    channelId: 1,
    activeUserId: '1',
  } as RequestContext;

  let service: CashierSessionService;
  let mockConnection: jest.Mocked<TransactionalConnection>;
  let mockLedgerQueryService: jest.Mocked<LedgerQueryService>;
  let mockReconciliationService: jest.Mocked<ReconciliationService>;
  let mockSessionRepo: any;
  let mockChannelRepo: any;
  let mockCountRepo: any;

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

    mockConnection = {
      getRepository: jest.fn((_ctx, entity) => {
        if (entity === CashierSession) return mockSessionRepo;
        if (entity === Channel) return mockChannelRepo;
        if (entity === CashDrawerCount) return mockCountRepo;
        if (entity === MpesaVerification)
          return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
        return {};
      }),
    } as any;

    mockLedgerQueryService = {
      getCashierSessionTotals: jest.fn(),
    } as any;

    mockReconciliationService = {
      createReconciliation: jest.fn(),
    } as any;

    service = new CashierSessionService(
      mockConnection,
      mockLedgerQueryService,
      mockReconciliationService
    );
  });

  describe('One open session per store', () => {
    const defaultLedgerTotals = { cashTotal: 0, mpesaTotal: 0, totalCollected: 0 };

    it('should create session when none open and getCurrentSession returns it', async () => {
      const channelId = 1;
      const openingFloat = 10000;
      const savedSession: CashierSession = {
        id: 'session-1',
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: String(openingFloat),
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(savedSession);
      mockChannelRepo.findOne.mockResolvedValue({ id: channelId });
      mockSessionRepo.create.mockReturnValue(savedSession);
      mockSessionRepo.save.mockResolvedValue(savedSession);
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-1' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-1' });

      const result = await service.startSession(ctx, { channelId, openingFloat });

      expect(result.status).toBe('open');
      expect(result.channelId).toBe(channelId);
      expect(result.id).toBe('session-1');
      mockSessionRepo.findOne.mockResolvedValue(savedSession);
      const current = await service.getCurrentSession(ctx, channelId);
      expect(current).not.toBeNull();
      expect(current!.id).toBe('session-1');
      expect(current!.channelId).toBe(channelId);
    });

    it('should throw when opening second session for same channel', async () => {
      const channelId = 1;
      const existingSession: CashierSession = {
        id: 'existing-session',
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '5000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValue(existingSession);

      await expect(service.startSession(ctx, { channelId, openingFloat: 10000 })).rejects.toThrow(
        /already has an open cashier session/
      );

      expect(mockSessionRepo.findOne).toHaveBeenCalledWith({
        where: { channelId, status: 'open' },
      });
      await expect(service.startSession(ctx, { channelId, openingFloat: 10000 })).rejects.toThrow(
        existingSession.id
      );
    });

    it('should allow open after close for same channel', async () => {
      const channelId = 1;
      const session1: CashierSession = {
        id: 'session-1',
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '10000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(session1);
      mockChannelRepo.findOne.mockResolvedValue({ id: channelId });
      mockSessionRepo.create.mockImplementation((o: any) => ({ ...o, id: 'session-1' }));
      mockSessionRepo.save.mockImplementation((s: any) => Promise.resolve({ ...s }));
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-1' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-1' });

      await service.startSession(ctx, { channelId, openingFloat: 10000 });

      const session1Open = { ...session1, status: 'open' as const };
      mockSessionRepo.findOne.mockResolvedValue(session1Open);
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockSessionRepo.save.mockImplementation((s: any) => Promise.resolve({ ...s }));
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-2' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-2' });

      await service.closeSession(ctx, {
        sessionId: session1.id,
        closingDeclared: 10000,
      });

      const session2: CashierSession = {
        id: 'session-2',
        channelId,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '8000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(session2);
      mockSessionRepo.create.mockReturnValue(session2);
      mockSessionRepo.save.mockResolvedValue(session2);
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-3' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-3' });

      const opened = await service.startSession(ctx, { channelId, openingFloat: 8000 });
      expect(opened.id).toBe('session-2');
      expect(opened.status).toBe('open');
      mockSessionRepo.findOne.mockResolvedValue(session2);
      const current = await service.getCurrentSession(ctx, channelId);
      expect(current!.id).toBe('session-2');
    });

    it('should allow open sessions for two different channels', async () => {
      const channelA = 1;
      const channelB = 2;
      const ctxA = { ...ctx, channelId: channelA } as RequestContext;
      const ctxB = { ...ctx, channelId: channelB } as RequestContext;

      mockChannelRepo.findOne.mockImplementation((_opts: any) =>
        Promise.resolve({ id: _opts?.where?.id ?? 1 })
      );
      mockLedgerQueryService.getCashierSessionTotals.mockResolvedValue(defaultLedgerTotals);
      mockCountRepo.create.mockImplementation((o: any) => ({ ...o, id: 'count-x' }));
      mockCountRepo.save.mockResolvedValue({ id: 'count-x' });

      const sessionA: CashierSession = {
        id: 'session-a',
        channelId: channelA,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '10000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionA);
      mockSessionRepo.create.mockReturnValueOnce(sessionA);
      mockSessionRepo.save.mockResolvedValueOnce(sessionA);

      const resultA = await service.startSession(ctxA, {
        channelId: channelA,
        openingFloat: 10000,
      });
      expect(resultA.channelId).toBe(channelA);
      expect(resultA.id).toBe('session-a');

      const sessionB: CashierSession = {
        id: 'session-b',
        channelId: channelB,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'open',
        openingFloat: '5000',
        closingDeclared: '0',
      } as CashierSession;
      mockSessionRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(sessionB);
      mockSessionRepo.create.mockReturnValueOnce(sessionB);
      mockSessionRepo.save.mockResolvedValueOnce(sessionB);

      const resultB = await service.startSession(ctxB, { channelId: channelB, openingFloat: 5000 });
      expect(resultB.channelId).toBe(channelB);
      expect(resultB.id).toBe('session-b');

      mockSessionRepo.findOne.mockImplementation((opts: any) => {
        if (opts.where.channelId === channelA) return Promise.resolve(sessionA);
        if (opts.where.channelId === channelB) return Promise.resolve(sessionB);
        return Promise.resolve(null);
      });

      const currentA = await service.getCurrentSession(ctxA, channelA);
      const currentB = await service.getCurrentSession(ctxB, channelB);
      expect(currentA!.id).toBe('session-a');
      expect(currentB!.id).toBe('session-b');
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
        openingFloat: '10000',
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

      const channel = {
        id: channelId,
        paymentMethods: [cashPaymentMethod, mpesaPaymentMethod],
      };

      mockChannelRepo.findOne.mockResolvedValue(channel);

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
        openingFloat: '0',
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

      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        paymentMethods: [mpesaPaymentMethod],
      });

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
        openingFloat: '10000',
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

      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        paymentMethods: [cashPaymentMethod, creditPaymentMethod],
      });

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
        openingFloat: '10000',
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

      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        paymentMethods: [cashPaymentMethod, mpesaPaymentMethod],
      });

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
        openingFloat: '0',
        closingDeclared: '0',
      } as CashierSession;

      mockSessionRepo.findOne.mockResolvedValue(session);
      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        paymentMethods: [],
      });

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

      mockChannelRepo.findOne.mockResolvedValue({
        id: channelId,
        paymentMethods: [cashPaymentMethod],
      });

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

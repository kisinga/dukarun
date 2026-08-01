/**
 * Variance review (cash_variance action item) tests
 *
 * Covers:
 * - LedgerPostingService.postVarianceReversal (negating entry, idempotency, unknown source)
 * - OpenSessionService creating cash_variance approval requests on variance posting
 * - Auto-expiry of pending reviews when the next reconciliation is posted
 * - CashVarianceApprovalSubscriber handler wiring
 * - ApprovalService.expirePendingRequests query
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RequestContext, UserInputError } from '@vendure/core';
import { JournalEntry } from '../../../src/ledger/journal-entry.entity';
import { Account } from '../../../src/ledger/account.entity';
import { CashierSession } from '../../../src/domain/cashier/cashier-session.entity';
import { Reconciliation } from '../../../src/domain/recon/reconciliation.entity';
import { ReconciliationAccount } from '../../../src/domain/recon/reconciliation-account.entity';
import { LedgerPostingService } from '../../../src/services/financial/ledger-posting.service';
import { OpenSessionService } from '../../../src/services/financial/open-session.service';
import { CashVarianceApprovalSubscriber } from '../../../src/plugins/ledger/cash-variance-approval.subscriber';
import { ApprovalService } from '../../../src/services/approval/approval.service';
import { ApprovalRequest } from '../../../src/domain/approval/approval-request.entity';

const ctx = { channelId: 1, activeUserId: '1' } as RequestContext;
const SESSION_ID = 'a1b2c3d4-e5f6-4171-8111-111111111111';
const RECON_ID = 'rec-close-1';

describe('LedgerPostingService.postVarianceReversal', () => {
  let service: LedgerPostingService;
  let mockEntryRepo: any;
  let mockPostingService: any;
  let mockLedgerQueryService: any;

  const originalEntry = {
    id: 'entry-1',
    channelId: 1,
    sourceType: 'variance-adjustment',
    sourceId: `${SESSION_ID}-CASH_ON_HAND-${RECON_ID}`,
    lines: [
      {
        debit: 0,
        credit: 500,
        meta: { openSessionId: SESSION_ID },
        account: { code: 'CASH_ON_HAND' },
      },
      {
        debit: 500,
        credit: 0,
        meta: { openSessionId: SESSION_ID },
        account: { code: 'CASH_SHORT_OVER' },
      },
    ],
  };

  beforeEach(() => {
    mockEntryRepo = { findOne: jest.fn() };
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: (jest.fn() as any).mockResolvedValue([
        { code: 'CASH_ON_HAND' },
        { code: 'CASH_SHORT_OVER' },
      ]),
    };
    const mockAccountRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const mockConnection = {
      getRepository: jest.fn((_ctx: any, entity: any) => {
        if (entity === JournalEntry) return mockEntryRepo;
        if (entity === Account) return mockAccountRepo;
        return {};
      }),
    };
    mockPostingService = { post: (jest.fn() as any).mockResolvedValue({ id: 'entry-2' }) };
    mockLedgerQueryService = { invalidateCache: jest.fn() };

    service = new (LedgerPostingService as any)(
      mockPostingService,
      mockConnection,
      mockLedgerQueryService
    );
  });

  it('posts a negating entry linked via reversalOf', async () => {
    mockEntryRepo.findOne
      .mockResolvedValueOnce(originalEntry) // original
      .mockResolvedValueOnce(null); // no existing reversal

    const reversed = await service.postVarianceReversal(
      ctx,
      `${SESSION_ID}-CASH_ON_HAND-${RECON_ID}`
    );

    expect(reversed).toBe(500);
    expect(mockPostingService.post).toHaveBeenCalledTimes(1);
    const [, sourceType, sourceId, payload] = mockPostingService.post.mock.calls[0] as any[];
    expect(sourceType).toBe('variance-adjustment-reversal');
    expect(sourceId).toBe(`${SESSION_ID}-CASH_ON_HAND-${RECON_ID}-reversal`);
    expect(payload.reversalOf).toBe('entry-1');
    // Debits and credits swapped per line
    expect(payload.lines).toEqual([
      expect.objectContaining({ accountCode: 'CASH_ON_HAND', debit: 500, credit: 0 }),
      expect.objectContaining({ accountCode: 'CASH_SHORT_OVER', debit: 0, credit: 500 }),
    ]);
    // Both account caches invalidated
    expect(mockLedgerQueryService.invalidateCache).toHaveBeenCalledWith(1, 'CASH_ON_HAND');
    expect(mockLedgerQueryService.invalidateCache).toHaveBeenCalledWith(1, 'CASH_SHORT_OVER');
  });

  it('is idempotent: an existing reversal is a no-op', async () => {
    mockEntryRepo.findOne
      .mockResolvedValueOnce(originalEntry)
      .mockResolvedValueOnce({ id: 'entry-rev' }); // reversal already exists

    const reversed = await service.postVarianceReversal(
      ctx,
      `${SESSION_ID}-CASH_ON_HAND-${RECON_ID}`
    );

    expect(reversed).toBe(0);
    expect(mockPostingService.post).not.toHaveBeenCalled();
  });

  it('throws when the original adjustment does not exist', async () => {
    mockEntryRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.postVarianceReversal(ctx, 'missing-source')).rejects.toThrow(
      UserInputError
    );
    expect(mockPostingService.post).not.toHaveBeenCalled();
  });
});

describe('OpenSessionService — cash_variance review requests', () => {
  let service: OpenSessionService;
  let mockSessionRepo: any;
  let mockReconAccountRepo: any;
  let mockJournalRepo: any;
  let mockReconciliationService: any;
  let mockFinancialService: any;
  let mockLedgerQueryService: any;
  let mockApprovalService: any;
  let mockChannelPaymentMethodService: any;

  function setup(overrides?: { journalEntryExists?: boolean; expectedCents?: number }) {
    mockSessionRepo = {
      findOne: (jest.fn() as any).mockResolvedValue({
        id: SESSION_ID,
        channelId: 1,
        cashierUserId: 1,
        openedAt: new Date(),
        status: 'closed',
        closedAt: new Date(),
        closingDeclared: '200',
      } as CashierSession),
      createQueryBuilder: jest.fn(),
    };
    const mockReconRepo = {
      findOne: (jest.fn() as any).mockResolvedValue(null),
      find: (jest.fn() as any).mockResolvedValue([]),
    };
    mockReconAccountRepo = {
      find: (jest.fn() as any).mockResolvedValue([
        {
          reconciliationId: RECON_ID,
          accountId: 'acc-1',
          declaredAmountCents: '200',
          account: { id: 'acc-1', code: 'CASH_ON_HAND' },
        },
      ]),
    };
    mockJournalRepo = {
      findOne: (jest.fn() as any).mockResolvedValue(
        overrides?.journalEntryExists ? { id: 'entry-existing' } : null
      ),
    };
    const mockConnection = {
      getRepository: jest.fn((_ctx: any, entity: any) => {
        if (entity === CashierSession) return mockSessionRepo;
        if (entity === Reconciliation) return mockReconRepo;
        if (entity === ReconciliationAccount) return mockReconAccountRepo;
        if (entity === JournalEntry) return mockJournalRepo;
        if (entity === Account)
          return {
            find: (jest.fn() as any).mockResolvedValue([{ id: 'acc-1', code: 'CASH_ON_HAND' }]),
            findOne: (jest.fn() as any).mockResolvedValue({ id: 'acc-1', code: 'CASH_ON_HAND' }),
          };
        return {
          findOne: (jest.fn() as any).mockResolvedValue(null),
          find: (jest.fn() as any).mockResolvedValue([]),
          create: jest.fn((o: any) => o),
          save: (jest.fn() as any).mockImplementation((o: any) => Promise.resolve(o)),
        };
      }),
      withTransaction: jest.fn((c: any, cb: (txCtx: any) => Promise<any>) => cb(c)),
    };

    mockLedgerQueryService = {
      getCashierSessionTotals: (jest.fn() as any).mockResolvedValue({
        cashTotal: 150,
        mpesaTotal: 0,
        totalCollected: 150,
      }),
      getSessionBalance: (jest.fn() as any).mockResolvedValue({
        accountCode: 'CASH_ON_HAND',
        accountName: 'Cash',
        balance: 0,
      }),
      getExpectedBalanceForReconciliation: (jest.fn() as any).mockResolvedValue(
        overrides?.expectedCents ?? 150
      ),
      getSalesBreakdown: (jest.fn() as any).mockResolvedValue({ cashSales: 0, creditSales: 0 }),
      getPurchaseTotal: (jest.fn() as any).mockResolvedValue(0),
    };

    mockReconciliationService = {
      createReconciliation: (jest.fn() as any).mockResolvedValue({
        id: RECON_ID,
        channelId: 1,
        scopeRefId: `${SESSION_ID}:closing`,
        snapshotAt: '2026-02-28',
      } as Reconciliation),
    };

    mockFinancialService = {
      postVarianceAdjustment: (jest.fn() as any).mockResolvedValue(undefined),
    };

    mockApprovalService = {
      createApprovalRequest: (jest.fn() as any).mockResolvedValue({ id: 'appr-1' }),
      expirePendingRequests: (jest.fn() as any).mockResolvedValue(0),
    };

    mockChannelPaymentMethodService = {
      getChannelPaymentMethods: (jest.fn() as any).mockResolvedValue([
        { customFields: { ledgerAccountCode: 'CASH_ON_HAND', isCashierControlled: true } },
      ]),
      getPaymentMethodDisplayName: jest.fn((pm: { code: string }) => pm.code),
    };

    service = new (OpenSessionService as any)(
      mockConnection,
      mockLedgerQueryService,
      mockReconciliationService,
      mockFinancialService,
      mockChannelPaymentMethodService,
      { log: (jest.fn() as any).mockResolvedValue(undefined) },
      { publish: jest.fn() },
      { findOne: (jest.fn() as any).mockResolvedValue({ id: 1, code: 'test' }) },
      mockApprovalService
    );
  }

  it('creates a cash_variance request with full metadata when variance posts', async () => {
    setup({ expectedCents: 150 });

    await service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Close');

    expect(mockFinancialService.postVarianceAdjustment).toHaveBeenCalledWith(
      ctx,
      SESSION_ID,
      'CASH_ON_HAND',
      50,
      'Closing balance variance',
      RECON_ID
    );
    expect(mockApprovalService.createApprovalRequest).toHaveBeenCalledTimes(1);
    const [, input] = mockApprovalService.createApprovalRequest.mock.calls[0] as any[];
    expect(input.type).toBe('cash_variance');
    expect(input.entityType).toBe('Reconciliation');
    expect(input.entityId).toBe(RECON_ID);
    expect(input.metadata).toEqual({
      sessionId: SESSION_ID,
      reconciliationId: RECON_ID,
      accountCode: 'CASH_ON_HAND',
      declaredCents: 200,
      expectedCents: 150,
      varianceCents: 50,
      direction: 'over',
    });
  });

  it('marks direction short when declared < expected', async () => {
    setup({ expectedCents: 250 });

    await service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Close');

    const [, input] = mockApprovalService.createApprovalRequest.mock.calls[0] as any[];
    expect(input.metadata.varianceCents).toBe(-50);
    expect(input.metadata.direction).toBe('short');
  });

  it('does not create a request when variance is zero', async () => {
    setup({ expectedCents: 200 });

    await service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Close');

    expect(mockFinancialService.postVarianceAdjustment).not.toHaveBeenCalled();
    expect(mockApprovalService.createApprovalRequest).not.toHaveBeenCalled();
  });

  it('does not duplicate the request when the adjustment was already posted (repair re-run)', async () => {
    setup({ expectedCents: 150, journalEntryExists: true });

    await service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Repair');

    expect(mockFinancialService.postVarianceAdjustment).toHaveBeenCalled();
    expect(mockApprovalService.createApprovalRequest).not.toHaveBeenCalled();
  });

  it('expires pending reviews for reconciled accounts when a new reconciliation is created', async () => {
    setup({ expectedCents: 200 });

    await service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Close');

    expect(mockApprovalService.expirePendingRequests).toHaveBeenCalledWith(ctx, {
      channelId: 1,
      type: 'cash_variance',
      metadataMatch: { accountCode: 'CASH_ON_HAND' },
    });
  });

  it('a failing approval service never breaks the close flow', async () => {
    setup({ expectedCents: 150 });
    mockApprovalService.createApprovalRequest.mockRejectedValue(new Error('approval down'));

    await expect(
      service.createSessionReconciliationWithVariancePosting(ctx, SESSION_ID, 'Close')
    ).resolves.toBeDefined();
    expect(mockFinancialService.postVarianceAdjustment).toHaveBeenCalled();
  });
});

describe('CashVarianceApprovalSubscriber', () => {
  it('registers the cash_variance handler on module init', () => {
    const registry = { register: jest.fn() };
    const subscriber = new CashVarianceApprovalSubscriber(registry as any, {} as any);

    subscriber.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith('cash_variance', expect.any(Object));
  });

  it('onApproved posts a reversal for the composed source id', async () => {
    let handler: any;
    const registry = {
      register: jest.fn((_type: string, h: any) => {
        handler = h;
      }),
    };
    const ledgerPostingService = {
      postVarianceReversal: (jest.fn() as any).mockResolvedValue(500),
    };
    const subscriber = new CashVarianceApprovalSubscriber(
      registry as any,
      ledgerPostingService as any
    );
    subscriber.onModuleInit();

    await handler.onApproved(ctx, {
      id: 'appr-1',
      metadata: { sessionId: SESSION_ID, reconciliationId: RECON_ID, accountCode: 'CASH_ON_HAND' },
    } as unknown as ApprovalRequest);

    expect(ledgerPostingService.postVarianceReversal).toHaveBeenCalledWith(
      ctx,
      `${SESSION_ID}-CASH_ON_HAND-${RECON_ID}`
    );
  });

  it('onApproved skips when metadata is incomplete', async () => {
    let handler: any;
    const registry = {
      register: jest.fn((_type: string, h: any) => {
        handler = h;
      }),
    };
    const ledgerPostingService = { postVarianceReversal: jest.fn() };
    const subscriber = new CashVarianceApprovalSubscriber(
      registry as any,
      ledgerPostingService as any
    );
    subscriber.onModuleInit();

    await handler.onApproved(ctx, { id: 'appr-2', metadata: {} } as unknown as ApprovalRequest);

    expect(ledgerPostingService.postVarianceReversal).not.toHaveBeenCalled();
  });
});

describe('ApprovalService.expirePendingRequests', () => {
  it('updates matching pending requests to expired and returns the count', async () => {
    const execute = (jest.fn() as any).mockResolvedValue({ affected: 2 });
    const builder: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const mockConnection = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => builder })),
    };
    const service = new (ApprovalService as any)(mockConnection, { publish: jest.fn() }, {});

    const count = await service.expirePendingRequests(ctx, {
      channelId: 1,
      type: 'cash_variance',
      metadataMatch: { accountCode: 'CASH_ON_HAND' },
    });

    expect(count).toBe(2);
    expect(builder.set).toHaveBeenCalledWith({ status: 'expired' });
    expect(builder.where).toHaveBeenCalledWith('channelId = :channelId', { channelId: 1 });
    expect(builder.andWhere).toHaveBeenCalledWith('type = :type', { type: 'cash_variance' });
    expect(builder.andWhere).toHaveBeenCalledWith('status = :status', { status: 'pending' });
    expect(builder.andWhere).toHaveBeenCalledWith('metadata @> CAST(:metadataMatch AS jsonb)', {
      metadataMatch: JSON.stringify({ accountCode: 'CASH_ON_HAND' }),
    });
  });
});

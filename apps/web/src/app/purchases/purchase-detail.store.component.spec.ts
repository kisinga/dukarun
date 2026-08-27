import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../core/cashier-session.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { PurchaseDetailStore } from './purchase-detail.store';
import type { PurchaseRow } from './purchase-history.store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function purchase(id: string, supplierId: string): PurchaseRow {
  return {
    id,
    supplier_id: supplierId,
    total_cost: 1_000,
    paid: 0,
    purchase_date: '2026-08-27',
    reference: id.toUpperCase(),
    claim_input_vat: false,
  } as unknown as PurchaseRow;
}

describe('PurchaseDetailStore', () => {
  const purchaseA = purchase('purchase-a', 'supplier-a');
  const purchaseB = purchase('purchase-b', 'supplier-b');
  let money: Record<string, ReturnType<typeof vi.fn>>;
  let refreshing = false;
  let refreshedPayments = deferred<never[]>();
  let refreshedPurchase = deferred<PurchaseRow | null>();
  let refreshedAdvance = deferred<number>();

  beforeEach(() => {
    refreshing = false;
    refreshedPayments = deferred<never[]>();
    refreshedPurchase = deferred<PurchaseRow | null>();
    refreshedAdvance = deferred<number>();
    money = {
      transactableAccounts: vi.fn().mockResolvedValue([{ code: '1000', name: 'Cash' }]),
      purchaseLines: vi.fn().mockResolvedValue([]),
      purchaseExpenses: vi.fn().mockResolvedValue([]),
      purchasePayments: vi.fn((id: string) =>
        refreshing && id === purchaseA.id ? refreshedPayments.promise : Promise.resolve([])
      ),
      supplierAdvanceAvailable: vi.fn((supplierId: string) => {
        if (refreshing && supplierId === purchaseA.supplier_id) return refreshedAdvance.promise;
        return Promise.resolve(supplierId === purchaseB.supplier_id ? 20 : 100);
      }),
      purchaseById: vi.fn(() => refreshedPurchase.promise),
      payPurchase: vi.fn().mockResolvedValue(undefined),
      applySupplierAdvance: vi.fn().mockResolvedValue(undefined),
      reverseCreditPurchase: vi.fn().mockResolvedValue('reversal-id'),
    };

    TestBed.configureTestingModule({
      providers: [
        PurchaseDetailStore,
        { provide: MoneyService, useValue: money },
        { provide: PosService, useValue: { variantsByIds: vi.fn().mockResolvedValue([]) } },
        { provide: PermissionsService, useValue: { has: vi.fn().mockReturnValue(true) } },
        {
          provide: CashierSessionService,
          useValue: {
            assertOpen: vi.fn().mockResolvedValue(undefined),
            canTakePayment: vi.fn().mockReturnValue(true),
          },
        },
        {
          provide: ReceiptDataService,
          useValue: {
            printerEnabled: vi.fn().mockResolvedValue(false),
            buildPurchaseData: vi.fn(),
            companyPrintInfo: vi.fn(),
          },
        },
        { provide: PrintService, useValue: { printPurchase: vi.fn() } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('does not restore an older purchase after its post-commit refresh', async () => {
    const store = TestBed.inject(PurchaseDetailStore);
    await store.open(purchaseA);
    store.paymentAmount.setValue('100');
    store.paymentAccount.setValue('1000');
    refreshing = true;

    const payment = store.payPurchase();
    await vi.waitFor(() => expect(money['purchaseById']).toHaveBeenCalledWith(purchaseA.id));
    await store.open(purchaseB);
    expect(store.supplierAdvance()).toBe(20);

    refreshedPayments.resolve([]);
    refreshedPurchase.resolve(purchaseA);
    refreshedAdvance.resolve(900);
    const result = await payment;

    expect(result).toMatchObject({ kind: 'payment', purchaseId: purchaseA.id, close: false });
    expect(store.purchase()?.id).toBe(purchaseB.id);
    expect(store.supplierAdvance()).toBe(20);
  });

  it('distinguishes a committed payment from a failed detail refresh', async () => {
    const store = TestBed.inject(PurchaseDetailStore);
    await store.open(purchaseA);
    store.paymentAmount.setValue('100');
    store.paymentAccount.setValue('1000');
    refreshing = true;

    const payment = store.payPurchase();
    await vi.waitFor(() => expect(money['purchaseById']).toHaveBeenCalledWith(purchaseA.id));
    refreshedPayments.resolve([]);
    refreshedPurchase.reject(new Error('read model unavailable'));
    refreshedAdvance.resolve(100);
    const result = await payment;

    expect(money['payPurchase']).toHaveBeenCalledOnce();
    expect(result?.message).toContain('payment recorded');
    expect(result?.refreshWarning).toContain('transaction was recorded');
    expect(store.error()).toContain('transaction was recorded');
  });

  it('treats a missing post-commit purchase read as a refresh warning', async () => {
    const store = TestBed.inject(PurchaseDetailStore);
    await store.open(purchaseA);
    store.paymentAmount.setValue('100');
    store.paymentAccount.setValue('1000');
    refreshing = true;

    const payment = store.payPurchase();
    await vi.waitFor(() => expect(money['purchaseById']).toHaveBeenCalledWith(purchaseA.id));
    refreshedPayments.resolve([]);
    refreshedPurchase.resolve(null);
    refreshedAdvance.resolve(100);
    const result = await payment;

    expect(result?.refreshWarning).toContain('transaction was recorded');
    expect(store.purchase()?.id).toBe(purchaseA.id);
  });

  it('ignores detail data returned for a purchase that is no longer open', async () => {
    const linesA = deferred<never[]>();
    money['purchaseLines'].mockImplementation((id: string) =>
      id === purchaseA.id ? linesA.promise : Promise.resolve([])
    );
    const store = TestBed.inject(PurchaseDetailStore);

    const openingA = store.open(purchaseA);
    await vi.waitFor(() => expect(money['purchaseLines']).toHaveBeenCalledWith(purchaseA.id));
    await store.open(purchaseB);
    linesA.resolve([]);
    await openingA;

    expect(store.purchase()?.id).toBe(purchaseB.id);
    expect(store.supplierAdvance()).toBe(20);
  });

  it('returns a typed close result only after reversal commits', async () => {
    const store = TestBed.inject(PurchaseDetailStore);
    await store.open(purchaseA);
    store.reversalReason.setValue('Duplicate receiving entry');

    const result = await store.reversePurchase();

    expect(money['reverseCreditPurchase']).toHaveBeenCalledWith(
      purchaseA.id,
      'Duplicate receiving entry'
    );
    expect(result).toMatchObject({
      kind: 'reversal',
      purchaseId: purchaseA.id,
      supplierId: purchaseA.supplier_id,
      close: true,
    });
  });
});

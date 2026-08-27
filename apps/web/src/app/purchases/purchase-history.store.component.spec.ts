import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../core/cashier-session.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { PurchaseHistoryStore, type PurchaseRow } from './purchase-history.store';

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

describe('PurchaseHistoryStore', () => {
  const purchaseA = purchase('purchase-a', 'supplier-a');
  const purchaseB = purchase('purchase-b', 'supplier-b');
  let money: Record<string, ReturnType<typeof vi.fn>>;
  let refreshing = false;
  let refreshedPayments = deferred<never[]>();
  let refreshedPurchase = deferred<PurchaseRow>();
  let refreshedAdvance = deferred<number>();

  beforeEach(() => {
    refreshing = false;
    refreshedPayments = deferred<never[]>();
    refreshedPurchase = deferred<PurchaseRow>();
    refreshedAdvance = deferred<number>();
    money = {
      purchasesPage: vi.fn().mockResolvedValue({ rows: [purchaseA, purchaseB], count: 2 }),
      purchaseDrafts: vi.fn().mockResolvedValue([]),
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
    };

    TestBed.configureTestingModule({
      providers: [
        PurchaseHistoryStore,
        { provide: MoneyService, useValue: money },
        { provide: PosService, useValue: { variantsByIds: vi.fn().mockResolvedValue([]) } },
        {
          provide: PartyCacheService,
          useValue: {
            suppliers: signal([
              {
                id: 'supplier-a',
                first_name: 'Alpha',
                last_name: null,
                supplier_active: true,
              },
              {
                id: 'supplier-b',
                first_name: 'Beta',
                last_name: null,
                supplier_active: true,
              },
            ]),
            ensureLoaded: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LocationContextService,
          useValue: {
            activeId: signal('location-1'),
            locations: signal([{ id: 'location-1', name: 'Main shop' }]),
            requireActiveId: () => 'location-1',
          },
        },
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
          useValue: { printerEnabled: vi.fn(), buildPurchaseData: vi.fn() },
        },
        { provide: PrintService, useValue: { printPurchase: vi.fn() } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('does not restore an older purchase after its post-commit refresh', async () => {
    const store = TestBed.inject(PurchaseHistoryStore);
    await store.openPurchase(purchaseA, false);
    store.paymentAmount.setValue('100');
    store.paymentAccount.setValue('1000');
    refreshing = true;

    const payment = store.paySelectedPurchase();
    await vi.waitFor(() => expect(money['purchaseById']).toHaveBeenCalledWith(purchaseA.id));
    await store.openPurchase(purchaseB, false);
    expect(store.supplierAdvance()).toBe(20);

    refreshedPayments.resolve([]);
    refreshedPurchase.resolve(purchaseA);
    refreshedAdvance.resolve(900);
    await payment;

    expect(store.selectedPurchase()?.id).toBe(purchaseB.id);
    expect(store.supplierAdvance()).toBe(20);
  });

  it('distinguishes a committed payment from a failed detail refresh', async () => {
    const store = TestBed.inject(PurchaseHistoryStore);
    await store.openPurchase(purchaseA, false);
    store.paymentAmount.setValue('100');
    store.paymentAccount.setValue('1000');
    refreshing = true;

    const payment = store.paySelectedPurchase();
    await vi.waitFor(() => expect(money['purchaseById']).toHaveBeenCalledWith(purchaseA.id));
    refreshedPayments.resolve([]);
    refreshedPurchase.reject(new Error('read model unavailable'));
    refreshedAdvance.resolve(100);
    await payment;

    expect(money['payPurchase']).toHaveBeenCalledOnce();
    expect(store.notice()).toContain('payment recorded');
    expect(store.error()).toContain('transaction was recorded');
  });
});

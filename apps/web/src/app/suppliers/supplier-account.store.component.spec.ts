import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../core/cashier-session.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { SupplierAccountStore } from './supplier-account.store';
import type { SupplierWithAp } from './supplier.types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve };
}

const suppliers = [
  {
    id: 'supplier-a',
    first_name: 'Alpha',
    last_name: 'Supplies',
    supplier_active: true,
    supplier_credit_limit: 0,
    supplier_credit_terms_days: 0,
    ap_balance: 0,
  },
  {
    id: 'supplier-b',
    first_name: 'Beta',
    last_name: 'Goods',
    supplier_active: true,
    supplier_credit_limit: 0,
    supplier_credit_terms_days: 0,
    ap_balance: 0,
  },
] as SupplierWithAp[];

describe('SupplierAccountStore', () => {
  let money: Record<string, ReturnType<typeof vi.fn>>;
  let parties: {
    suppliers: WritableSignal<SupplierWithAp[]>;
    invalidate: ReturnType<typeof vi.fn>;
    ensureLoaded: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    money = {
      transactableAccounts: vi.fn().mockResolvedValue([{ code: '1000', name: 'Cash' }]),
      purchasesPage: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
      supplierAccountStatus: vi.fn().mockResolvedValue(null),
      supplierPayments: vi.fn().mockResolvedValue([]),
      supplierAdvanceAvailable: vi.fn().mockResolvedValue(0),
      supplierAdvanceActivity: vi.fn().mockResolvedValue([]),
      paySupplier: vi.fn().mockResolvedValue(undefined),
    };
    parties = {
      suppliers: signal(suppliers),
      invalidate: vi.fn(),
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        SupplierAccountStore,
        { provide: MoneyService, useValue: money },
        {
          provide: PosService,
          useValue: { supplierStockByVariant: vi.fn().mockResolvedValue([]) },
        },
        { provide: PartyCacheService, useValue: parties },
        { provide: LocationContextService, useValue: { activeId: signal('location-1') } },
        {
          provide: PermissionsService,
          useValue: { has: vi.fn().mockReturnValue(false) },
        },
        {
          provide: CashierSessionService,
          useValue: { assertOpen: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('ignores an older supplier response after the drawer switches records', async () => {
    const first = deferred<{ rows: never[]; count: number }>();
    const second = deferred<{ rows: never[]; count: number }>();
    money['purchasesPage']
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const store = TestBed.inject(SupplierAccountStore);

    const openingFirst = store.open('supplier-a');
    const openingSecond = store.open('supplier-b');
    second.resolve({ rows: [], count: 0 });
    await openingSecond;
    first.resolve({ rows: [], count: 0 });
    await openingFirst;

    expect(store.supplierId()).toBe('supplier-b');
    expect(store.supplier()?.first_name).toBe('Beta');
    expect(store.loading()).toBe(false);
  });

  it('reports a committed payment separately from a failed read-model refresh', async () => {
    const store = TestBed.inject(SupplierAccountStore);
    await store.open('supplier-a');
    store.payAmount.setValue('500');
    parties.ensureLoaded.mockRejectedValueOnce(new Error('refresh unavailable'));

    await expect(store.paySupplier()).resolves.toBe(true);

    expect(money['paySupplier']).toHaveBeenCalledOnce();
    expect(store.notice()).toContain('payment recorded');
    expect(store.error()).toContain('transaction was recorded');
  });
});

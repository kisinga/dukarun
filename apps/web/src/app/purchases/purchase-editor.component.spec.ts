import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../core/cashier-session.service';
import { CatalogSearchService } from '../core/catalog-search.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { LocationContextService } from '../core/location-context.service';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { MoneyService } from '../money/money.service';
import { PosService } from '../pos/pos.service';
import { IconComponent } from '../shared/ui/icon.component';
import { PurchaseEditorComponent } from './purchase-editor.component';

const variant = {
  variant_id: 'variant-1',
  product_id: 'product-1',
  kind: 'good',
  name: 'Default',
  product_name: 'Tea',
  manufacturer_name: null,
  sku: 'TEA-1',
  barcode: null,
  price: 150,
  wholesale_price: 116,
  allow_fractional: false,
};

const supplier = {
  id: 'supplier-1',
  first_name: 'VAT Supplier',
  last_name: null,
  phone: null,
  email: null,
  supplier_active: true,
  supplier_credit_limit: 100_000,
  ap_balance: 0,
  tax_registration_number: 'P000000001A',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function supplierPerformance(variantId: string, lastUnitCost: number) {
  return {
    average_unit_cost: lastUnitCost,
    company_id: 'company-1',
    highest_unit_cost: lastUnitCost,
    last_purchase_date: '2026-08-19',
    last_unit_cost: lastUnitCost,
    lowest_unit_cost: lastUnitCost,
    purchase_count: 1,
    supplier_id: 'supplier-1',
    total_quantity: 1,
    total_spend: lastUnitCost,
    variant_id: variantId,
  };
}

describe('PurchaseEditorComponent input VAT', () => {
  async function render(taxContextOverrides: Record<string, unknown> = {}) {
    const suppliers = signal<Array<typeof supplier>>([supplier]);
    const activeLocationId = signal('location-1');
    const pos = { supplierStockByVariant: vi.fn().mockResolvedValue([]) };
    const money = {
      transactableAccounts: vi
        .fn()
        .mockResolvedValue([{ code: 'CASH_ON_HAND', name: 'Cash on hand' }]),
      purchaseDrafts: vi.fn().mockResolvedValue([]),
      supplierVariantPerformance: vi.fn().mockResolvedValue([]),
      supplierAdvanceAvailable: vi.fn().mockResolvedValue(0),
      purchaseTaxContext: vi.fn().mockResolvedValue({
        status: 'context',
        tax_configured: true,
        vat_registered: true,
        tax_profile_id: 'profile-1',
        tax_point_at: '2026-08-19T00:00:00+03:00',
        lines: [
          {
            variant_id: 'variant-1',
            tax_profile_id: 'profile-1',
            tax_category_id: 'standard',
            tax_rate_version_id: 'rate-1',
            tax_category_code: 'STANDARD',
            tax_classification: 'standard',
            tax_rate_bps: 1600,
          },
        ],
        supplier_expense: {
          tax_profile_id: 'profile-1',
          tax_category_id: 'standard',
          tax_rate_version_id: 'rate-1',
          tax_category_code: 'STANDARD',
          tax_classification: 'standard',
          tax_rate_bps: 1600,
        },
        ...taxContextOverrides,
      }),
      estimatePurchaseInputVat: vi.fn().mockResolvedValue({
        status: 'estimate',
        tax_configured: true,
        vat_registered: true,
        tax_profile_id: 'profile-1',
        tax_point_at: '2026-08-19T00:00:00+03:00',
        gross_total: 116,
        net_total: 100,
        tax_total: 16,
        goods_gross_total: 116,
        goods_net_total: 100,
        goods_tax_total: 16,
        expense_gross_total: 0,
        expense_net_total: 0,
        expense_tax_total: 0,
        separate_expense_total: 0,
        lines: [],
        expenses: [],
      }),
      updateSupplierTaxRegistration: vi.fn().mockResolvedValue('supplier-1'),
      savePurchaseWorkspaceDraft: vi.fn().mockResolvedValue('draft-1'),
      finalizePurchaseDraft: vi.fn().mockResolvedValue('purchase-1'),
    };
    await TestBed.configureTestingModule({
      imports: [PurchaseEditorComponent],
      providers: [
        provideRouter([]),
        { provide: MoneyService, useValue: money },
        {
          provide: PartyCacheService,
          useValue: {
            suppliers,
            ensureLoaded: vi.fn().mockResolvedValue(true),
            invalidate: vi.fn(),
          },
        },
        {
          provide: CatalogSearchService,
          useValue: {
            activeCatalog: vi.fn().mockResolvedValue([variant]),
            search: vi.fn().mockResolvedValue({ variants: [variant] }),
          },
        },
        {
          provide: LocationContextService,
          useValue: {
            locations: signal([
              { id: 'location-1', name: 'Main shop' },
              { id: 'location-2', name: 'Branch' },
            ]),
            activeId: activeLocationId,
          },
        },
        { provide: PermissionsService, useValue: { has: () => true } },
        {
          provide: PosService,
          useValue: pos,
        },
        {
          provide: CashierSessionService,
          useValue: {
            canTakePayment: () => true,
            assertOpen: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CompanyPreferencesService,
          useValue: { batchExpiryEnabled: () => false },
        },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(PurchaseEditorComponent);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Supplier prices');
      expect(fixture.nativeElement.querySelector('.loading-spinner')).toBeNull();
    });
    return {
      fixture,
      component: fixture.componentInstance as any,
      money,
      pos,
      suppliers,
      activeLocationId,
    };
  }

  function addValidInvoice(component: any): void {
    component.onSupplierChange('supplier-1');
    component.reference.setValue('SUP-INV-1');
    component.lines.set([
      {
        key: 1,
        variantId: 'variant-1',
        quantity: 1,
        unitCost: '116',
        lineTotal: '116',
        valueSource: 'unit',
        batchNumber: '',
        expiryDate: '',
        wholesalePrice: '116',
        retailPrice: '150',
        expanded: false,
        error: null,
      },
    ]);
    component.setClaimInputVat(true);
  }

  it('shows the claim control, prefills supplier evidence, and renders a server estimate', async () => {
    const { fixture, component, money } = await render();
    const priceBasis = fixture.nativeElement.querySelector('[data-purchase-price-basis]');
    const claimToggle = fixture.nativeElement.querySelector('input[aria-label="Claim input VAT"]');

    expect(priceBasis.textContent).toContain('VAT included');
    expect(priceBasis.textContent).toContain('Before VAT');
    expect(claimToggle).not.toBeNull();

    addValidInvoice(component);

    expect(component.supplierTaxPin.value).toBe('P000000001A');
    expect(component.supplierPinSaved()).toBe(true);
    await component.goToReview();
    fixture.detectChanges();

    expect(money.estimatePurchaseInputVat).toHaveBeenCalledWith(
      expect.objectContaining({ taxInvoiceDate: component.taxInvoiceDate.value })
    );
    expect(fixture.nativeElement.textContent).toContain('Recoverable input VAT');
    expect(fixture.nativeElement.textContent).toContain('16');
  });

  it('persists an inline PIN edit through the supplier boundary', async () => {
    const { component, money, suppliers } = await render();
    addValidInvoice(component);
    component.supplierTaxPin.setValue('P000000099Z');
    component.onSupplierPinInput();
    expect(component.supplierPinSaved()).toBe(false);

    await component.saveSupplierPin();

    expect(money.updateSupplierTaxRegistration).toHaveBeenCalledWith('supplier-1', 'P000000099Z');
    expect(suppliers()[0]?.tax_registration_number).toBe('P000000099Z');
    expect(component.supplierPinSaved()).toBe(true);
  });

  it('loads supplier price history only for selected purchase variants', async () => {
    const { component, money } = await render();

    expect(money.supplierVariantPerformance).not.toHaveBeenCalled();
    component.onSupplierChange('supplier-1');
    component.lines.set([{ variantId: 'variant-1' }]);
    await component.loadSelectedSupplierPerformance();

    expect(money.supplierVariantPerformance).toHaveBeenCalledWith('supplier-1', ['variant-1']);
  });

  it('keeps a pending supplier advance when the receiving location changes', async () => {
    const { component, money, pos } = await render();
    const advance = deferred<number>();
    const firstStock = deferred<never[]>();
    money.supplierAdvanceAvailable.mockReturnValueOnce(advance.promise);
    pos.supplierStockByVariant.mockReturnValueOnce(firstStock.promise).mockResolvedValueOnce([]);

    component.onSupplierChange('supplier-1');
    component.location.setValue('location-2');
    component.onReceivingLocationChange();
    advance.resolve(2_500);
    firstStock.resolve([]);

    await vi.waitFor(() => expect(component.supplierAdvanceAvailable()).toBe(2_500));
    expect(pos.supplierStockByVariant).toHaveBeenLastCalledWith('supplier-1', 'location-2');
  });

  it('keeps concurrent supplier price results for different variants', async () => {
    const { component, money } = await render();
    const first = deferred<ReturnType<typeof supplierPerformance>[]>();
    const second = deferred<ReturnType<typeof supplierPerformance>[]>();
    money.supplierVariantPerformance.mockImplementation(
      (_supplierId: string, variantIds: string[]) =>
        variantIds[0] === 'variant-1' ? first.promise : second.promise
    );
    component.supplier.setValue('supplier-1');

    const firstLoad = component.loadSelectedSupplierPerformance(['variant-1']);
    const secondLoad = component.loadSelectedSupplierPerformance(['variant-2']);
    second.resolve([supplierPerformance('variant-2', 82)]);
    first.resolve([supplierPerformance('variant-1', 91)]);
    await Promise.all([firstLoad, secondLoad]);

    expect(component.performance()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variant_id: 'variant-1', last_unit_cost: 91 }),
        expect.objectContaining({ variant_id: 'variant-2', last_unit_cost: 82 }),
      ])
    );
  });

  it('adds a line immediately and applies supplier cost only while it is untouched', async () => {
    const { component, money } = await render();
    const price = deferred<ReturnType<typeof supplierPerformance>[]>();
    money.supplierVariantPerformance.mockReturnValueOnce(price.promise);
    component.supplier.setValue('supplier-1');

    const add = component.addVariant(variant);
    expect(component.lines()).toHaveLength(1);
    expect(component.lines()[0].unitCost).toBe('116');

    price.resolve([supplierPerformance('variant-1', 104)]);
    await add;
    await vi.waitFor(() => expect(component.lines()[0].unitCost).toBe('104'));

    const secondPrice = deferred<ReturnType<typeof supplierPerformance>[]>();
    money.supplierVariantPerformance.mockReturnValueOnce(secondPrice.promise);
    component.performance.set([]);
    component.performanceLoadedKeys.clear();
    const secondAdd = component.addVariant(variant);
    const secondLine = component.lines()[1];
    secondLine.unitCost = '109';
    secondLine.lineTotal = '109';
    component.lines.update((items: unknown[]) => [...items]);
    secondPrice.resolve([supplierPerformance('variant-1', 101)]);
    await secondAdd;
    await secondPrice.promise;
    await Promise.resolve();

    expect(component.lines()[1].unitCost).toBe('109');
    expect(component.lines()[1].lineTotal).toBe('109');
  });

  it('persists VAT evidence before invoking the canonical finalizer', async () => {
    const { component, money } = await render();
    addValidInvoice(component);
    await component.goToReview();

    await component.confirmPurchase();

    expect(money.savePurchaseWorkspaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'SUP-INV-1',
        claimInputVat: true,
        taxInvoiceDate: component.taxInvoiceDate.value,
      })
    );
    expect(money.finalizePurchaseDraft).toHaveBeenCalledWith('draft-1');
  });

  it('treats entered purchase values using the selected invoice-wide basis', async () => {
    const { component, money } = await render();
    addValidInvoice(component);
    component.setPriceEntryBasis('exclusive');
    component.lineTotalChanged(component.lines()[0], '100');

    expect(component.lines()[0].lineTotal).toBe('100');
    expect(component.invoiceTaxTotal()).toBe(16);
    expect(component.invoiceTotal()).toBe(116);

    await component.saveDraft();

    expect(money.savePurchaseWorkspaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            value_source: 'total',
            line_total: 116,
            price_entry_basis: 'exclusive',
            entered_line_total: 100,
          }),
        ],
      })
    );
  });

  it('keeps supplier price entry separate from the input VAT claim decision', async () => {
    const { component, money } = await render();
    addValidInvoice(component);
    component.setPriceEntryBasis('exclusive');
    component.lineTotalChanged(component.lines()[0], '100');
    component.setClaimInputVat(false);

    expect(component.invoiceTaxTotal()).toBe(16);
    expect(component.invoiceTotal()).toBe(116);

    await component.saveDraft();

    expect(money.savePurchaseWorkspaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({ claimInputVat: false })
    );
  });

  it('allows exclusive entry for a configured shop that cannot claim input VAT', async () => {
    const { fixture, component } = await render({ vat_registered: false });
    addValidInvoice(component);
    component.setClaimInputVat(false);
    fixture.detectChanges();

    component.setPriceEntryBasis('exclusive');

    expect(component.priceEntryBasis()).toBe('exclusive');
    expect(
      fixture.nativeElement.querySelector('input[aria-label="Claim input VAT"]').disabled
    ).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Claiming becomes available when the shop is VAT registered'
    );
  });

  it('does not rewrite entered values when the purchase-wide basis changes', async () => {
    const { component } = await render();
    addValidInvoice(component);
    component.lineTotalChanged(component.lines()[0], '4');

    component.setPriceEntryBasis('exclusive');
    expect(component.lines()[0].lineTotal).toBe('4');
    expect(component.invoiceTotal()).toBe(5);

    component.setPriceEntryBasis('inclusive');
    expect(component.lines()[0].lineTotal).toBe('4');
    expect(component.invoiceTotal()).toBe(4);
  });

  it('preserves an expense gross amount when its settlement changes', async () => {
    const { fixture, component } = await render();
    addValidInvoice(component);
    component.setPriceEntryBasis('exclusive');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Additional costs');
    expect(fixture.nativeElement.textContent).not.toContain('This cost is');

    component.addExpense();
    fixture.detectChanges();
    const expense = component.expenses()[0];
    expense.amount = '116';
    component.expenseAmountChanged(expense);

    expect(fixture.nativeElement.textContent).toContain('This cost is');
    expect(fixture.nativeElement.textContent).not.toContain('Expense 1');
    expect(expense.settlement).toBe('');

    component.setExpenseSettlement(expense, 'supplier_bill');
    expect(expense.amount).toBe('100');
    expect(component.supplierExpenseTotal()).toBe(116);

    component.setExpenseSettlement(expense, 'separate');
    expect(expense.amount).toBe('116');
    expect(component.separateExpenseTotal()).toBe(116);

    component.setExpenseSettlement(expense, 'supplier_bill');
    expect(expense.amount).toBe('100');
  });

  it('restores VAT evidence from a draft and preserves it when saving again', async () => {
    const { component, money } = await render();
    component.restoreDraft({
      id: 'draft-1',
      supplier_id: 'supplier-1',
      reference: 'SUP-DRAFT-1',
      notes: null,
      purchase_date: '2026-08-18',
      claim_input_vat: true,
      tax_invoice_date: '2026-08-17',
      stock_location_id: 'location-1',
      payment_mode: 'paid',
      payment_amount: 116,
      price_entry_basis: 'inclusive',
      account_code: 'CASH_ON_HAND',
      client_ref: null,
      lines: [
        {
          variant_id: 'variant-1',
          quantity: 1,
          unit_cost: 116,
          line_total: 116,
          value_source: 'unit',
        },
      ],
      expenses: [],
    });
    component.syncSupplierPin();

    expect(component.claimInputVat.value).toBe(true);
    expect(component.taxInvoiceDate.value).toBe('2026-08-17');
    expect(component.supplierPinSaved()).toBe(true);

    await component.saveDraft();

    expect(money.savePurchaseWorkspaceDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        reference: 'SUP-DRAFT-1',
        claimInputVat: true,
        taxInvoiceDate: '2026-08-17',
      })
    );
  });
});

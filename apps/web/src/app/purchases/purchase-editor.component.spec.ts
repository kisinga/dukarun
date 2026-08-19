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

describe('PurchaseEditorComponent input VAT', () => {
  async function render() {
    const suppliers = signal<Array<typeof supplier>>([supplier]);
    const money = {
      transactableAccounts: vi
        .fn()
        .mockResolvedValue([{ code: 'CASH_ON_HAND', name: 'Cash on hand' }]),
      purchaseDrafts: vi.fn().mockResolvedValue([]),
      supplierVariantPerformance: vi.fn().mockResolvedValue([]),
      supplierAdvanceAvailable: vi.fn().mockResolvedValue(0),
      estimatePurchaseInputVat: vi.fn().mockResolvedValue({
        status: 'estimate',
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
            locations: signal([{ id: 'location-1', name: 'Main shop' }]),
            activeId: () => 'location-1',
          },
        },
        { provide: PermissionsService, useValue: { has: () => true } },
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
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Claim input VAT from this invoice');
      expect(fixture.nativeElement.querySelector('.loading-spinner')).toBeNull();
    });
    return { fixture, component: fixture.componentInstance as any, money, suppliers };
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

import { Component } from '@angular/core';
import { FormControl } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { BusinessLocation } from '../core/location-context.service';
import type { AgingInfo, MoneyCustomer } from '../money/money.service';
import type { SupplierStockRow } from '../pos/pos.service';
import type { SearchableFilterOption } from '../shared/ui/searchable-filter.component';
import { IconComponent } from '../shared/ui/icon.component';
import { PurchaseSupplierHeaderComponent } from './purchase-supplier-header.component';

type PurchaseSupplier = MoneyCustomer & { ap_balance: number } & AgingInfo;

const supplier = {
  id: 'supplier-1',
  first_name: 'VAT',
  last_name: 'Supplier',
  supplier_credit_terms_days: 14,
  supplier_credit_limit: 100_000,
  ap_balance: 12_000,
  days_outstanding: 3,
  bucket: 'current',
} as unknown as PurchaseSupplier;

@Component({
  imports: [PurchaseSupplierHeaderComponent],
  template: `
    <app-purchase-supplier-header
      [supplierOptions]="supplierOptions"
      [locations]="locations"
      [supplierControl]="supplierControl"
      [locationControl]="locationControl"
      [referenceControl]="referenceControl"
      [purchaseDateControl]="purchaseDateControl"
      [notesControl]="notesControl"
      [claimInputVat]="claimInputVat"
      [invoiceDetailsExpanded]="invoiceDetailsExpanded"
      [purchaseInfoSummary]="'19 Aug 2026 · No notes'"
      [selectedSupplier]="selectedSupplier"
      [supplierName]="supplierName"
      [canViewFinancials]="true"
      [projectedSupplierBalance]="15000"
      [projectedCreditAvailable]="85000"
      [supplierAdvanceAvailable]="2000"
      [supplierStockLoading]="false"
      [supplierStockError]="null"
      [supplierStock]="supplierStock"
      [supplierStockValue]="42000"
      [receivingLocationName]="'Main shop'"
      (supplierChange)="changedSupplier = $event"
      (receivingLocationChange)="locationChanged = true"
      (referenceInput)="referenceTouched = true"
      (purchaseInfoToggle)="invoiceDetailsExpanded = !invoiceDetailsExpanded"
      (purchaseDateChange)="purchaseDateChanged = true"
      (notesInput)="notesTouched = true"
    />
  `,
})
class HostComponent {
  supplierOptions: readonly SearchableFilterOption[] = [
    { value: 'supplier-1', label: 'VAT Supplier' },
  ];
  locations: BusinessLocation[] = [
    { id: 'location-1', code: 'MAIN', name: 'Main shop', is_default: true, is_primary: true },
    { id: 'location-2', code: 'BRANCH', name: 'Branch', is_default: false, is_primary: false },
  ];
  supplierControl = new FormControl('supplier-1', { nonNullable: true });
  locationControl = new FormControl('location-1', { nonNullable: true });
  referenceControl = new FormControl('', { nonNullable: true });
  purchaseDateControl = new FormControl('2026-08-19', { nonNullable: true });
  notesControl = new FormControl('', { nonNullable: true });
  claimInputVat = false;
  invoiceDetailsExpanded = false;
  selectedSupplier: PurchaseSupplier | undefined = supplier;
  supplierStock = [{ variant_id: 'variant-1', stock_value: 42_000 } as SupplierStockRow];
  supplierName = (item: PurchaseSupplier) =>
    [item.first_name, item.last_name].filter(Boolean).join(' ');
  changedSupplier: string | null = null;
  locationChanged = false;
  referenceTouched = false;
  purchaseDateChanged = false;
  notesTouched = false;
}

describe('PurchaseSupplierHeaderComponent', () => {
  async function render(configure?: (host: HostComponent) => void) {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    return fixture;
  }

  it('renders supplier account context as compact metrics', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('VAT Supplier');
    expect(root.textContent).toContain('Projected balance');
    expect(root.textContent).toContain('Available credit after purchase');
    expect(root.textContent).toContain('1 variants');
    expect(root.querySelectorAll('.rounded-field.bg-base-100\\/70').length).toBeGreaterThanOrEqual(
      6
    );
  });

  it('emits header edits back to the purchase editor', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;

    const location = root.querySelector('[data-location-picker]') as HTMLSelectElement;
    location.value = 'location-2';
    location.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.locationChanged).toBe(true);

    const reference = root.querySelector('input') as HTMLInputElement;
    reference.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.referenceTouched).toBe(true);

    const infoButton = [...root.querySelectorAll('button')].find(button =>
      button.textContent?.includes('19 Aug 2026')
    ) as HTMLButtonElement;
    infoButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.invoiceDetailsExpanded).toBe(true);
    expect(root.textContent).toContain('Purchase date');
  });
});

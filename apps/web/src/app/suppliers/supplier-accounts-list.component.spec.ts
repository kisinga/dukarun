import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { ListSortDirection, ListSortOption } from '../shared/ui/list-search-bar.component';
import type { StatItem } from '../shared/ui/stat-bar.component';
import { IconComponent } from '../shared/ui/icon.component';
import { SupplierAccountsListComponent } from './supplier-accounts-list.component';
import type { SupplierWithAp } from './supplier.types';

const supplier = {
  id: 'supplier-1',
  first_name: 'Acme',
  last_name: 'Wholesale',
  phone: '+254700000000',
  email: 'orders@example.test',
  notes: 'Main distributor',
  supplier_active: true,
  supplier_credit_limit: 10000,
  supplier_credit_terms_days: 14,
  ap_balance: 2500,
  days_outstanding: 12,
  bucket: 'current',
} as SupplierWithAp;

@Component({
  imports: [SupplierAccountsListComponent],
  template: `
    <app-supplier-accounts-list
      [loading]="false"
      [busy]="false"
      [suppliers]="suppliers"
      [filteredCount]="suppliers.length"
      [selectedSupplierId]="selectedSupplierId"
      [canViewFinancials]="true"
      [canManageSupplierCreditPurchases]="true"
      [supplierName]="supplierName"
      [supplierStats]="supplierStats"
      [searchQuery]="searchQuery"
      [sortOptions]="sortOptions"
      [sortKey]="sortKey"
      [sortDirection]="sortDirection"
      [activeFilterCount]="1"
      [statusFilter]="'active'"
      [balanceFilter]="'owed'"
      [ageFilter]="'all'"
      [summary]="summary"
      [currentPage]="1"
      [totalPages]="1"
      [itemsPerPage]="25"
      (openSupplier)="opened = $event.id"
      (filterChange)="lastFilter = $event"
      (searchQueryChange)="searchQuery = $event"
    />
  `,
})
class HostComponent {
  suppliers = [supplier];
  selectedSupplierId: string | null = null;
  searchQuery = '';
  sortKey = 'name';
  sortDirection: ListSortDirection = 'asc';
  sortOptions: readonly ListSortOption[] = [{ value: 'name', label: 'Supplier name' }];
  summary: StatItem[] = [{ label: 'Active suppliers', value: 1 }];
  opened: string | null = null;
  lastFilter: { kind: 'status' | 'balance' | 'age'; value: string } | null = null;
  supplierName = (row: SupplierWithAp) => [row.first_name, row.last_name].join(' ');
  supplierStats = () => ({ purchases: 3, averageOrder: 5000, openPurchases: 1 });
}

describe('SupplierAccountsListComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [HostComponent] })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders supplier account rows and emits row selection', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Acme Wholesale');
    expect(root.textContent).toContain('3 purchases');

    (root.querySelector('tbody tr') as HTMLTableRowElement).click();
    expect(fixture.componentInstance.opened).toBe('supplier-1');
  });

  it('emits typed filter changes from the search controls', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const accountStatus = [...root.querySelectorAll('select')].find(select =>
      [...select.options].some(option => option.value === 'archived')
    ) as HTMLSelectElement;

    accountStatus.value = 'archived';
    accountStatus.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.lastFilter).toEqual({ kind: 'status', value: 'archived' });
  });
});

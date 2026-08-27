import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MoneyService } from '../money/money.service';
import { SupplierProfileFormComponent } from './supplier-profile-form.component';
import type { SupplierWithAp } from './supplier.types';

const supplier = {
  id: 'supplier-1',
  first_name: 'Acme Wholesale',
  last_name: '',
  phone: '+254700000000',
  email: 'orders@acme.test',
  notes: 'Ask for Linet',
  tax_registration_number: 'P000000000A',
  supplier_credit_limit: 25000,
  supplier_credit_terms_days: 30,
} as unknown as SupplierWithAp;

describe('SupplierProfileFormComponent', () => {
  async function render(input: SupplierWithAp | null = null, canManageCredit = true) {
    const money = {
      createCustomer: vi.fn().mockResolvedValue('supplier-new'),
      updateCustomer: vi.fn().mockResolvedValue('supplier-1'),
      updateSupplierTaxRegistration: vi.fn().mockResolvedValue('supplier-1'),
      updateSupplierCredit: vi.fn().mockResolvedValue('supplier-1'),
    };

    await TestBed.configureTestingModule({
      imports: [SupplierProfileFormComponent],
      providers: [{ provide: MoneyService, useValue: money }],
    }).compileComponents();

    const fixture = TestBed.createComponent(SupplierProfileFormComponent);
    const saved = vi.fn();
    const failed = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.failed.subscribe(failed);
    fixture.componentRef.setInput('supplier', input);
    fixture.componentRef.setInput('canManageCredit', canManageCredit);
    fixture.detectChanges();
    return { fixture, money, saved, failed };
  }

  it('creates a supplier profile and optional credit terms from owned form state', async () => {
    const { fixture, money, saved } = await render();
    const component = fixture.componentInstance as any;

    component.name.setValue('Beta Distributors');
    component.phone.setValue('+254711000000');
    component.email.setValue('sales@beta.test');
    component.taxPin.setValue('P111111111A');
    component.notes.setValue('Deliver before noon');
    component.creditLimit.setValue('10,000');
    component.termsDays.setValue(14);
    await component.save();

    expect(money.createCustomer).toHaveBeenCalledWith(
      'Beta Distributors',
      undefined,
      '+254711000000',
      'sales@beta.test',
      true
    );
    expect(money.updateCustomer).toHaveBeenCalledWith('supplier-new', {
      notes: 'Deliver before noon',
    });
    expect(money.updateSupplierTaxRegistration).toHaveBeenCalledWith('supplier-new', 'P111111111A');
    expect(money.updateSupplierCredit).toHaveBeenCalledWith('supplier-new', 10000, 14);
    expect(saved).toHaveBeenCalledWith({ supplierId: 'supplier-new', mode: 'created' });
  });

  it('updates an existing supplier profile without parent-owned profile controls', async () => {
    const { fixture, money, saved } = await render(supplier);
    const component = fixture.componentInstance as any;

    component.name.setValue('Acme Wholesale Ltd');
    component.creditLimit.setValue('30,000');
    await component.save();

    expect(money.updateCustomer).toHaveBeenCalledWith('supplier-1', {
      first_name: 'Acme Wholesale Ltd',
      last_name: '',
      phone: '+254700000000',
      email: 'orders@acme.test',
      notes: 'Ask for Linet',
    });
    expect(money.updateSupplierTaxRegistration).toHaveBeenCalledWith('supplier-1', 'P000000000A');
    expect(money.updateSupplierCredit).toHaveBeenCalledWith('supplier-1', 30000, 30);
    expect(saved).toHaveBeenCalledWith({ supplierId: 'supplier-1', mode: 'updated' });
  });

  it('does not touch supplier credit when credit management is unavailable', async () => {
    const { fixture, money, saved } = await render(supplier, false);
    const component = fixture.componentInstance as any;

    component.name.setValue('Acme Wholesale');
    component.creditLimit.setValue('not money');
    await component.save();

    expect(money.updateSupplierCredit).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith({ supplierId: 'supplier-1', mode: 'updated' });
  });
});

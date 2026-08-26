import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from '../core/permissions.service';
import { TaxService } from '../core/tax.service';
import { IconComponent } from '../shared/ui/icon.component';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { TaxSettingsComponent } from './tax-settings.component';

const jurisdiction = {
  id: 'jurisdiction-ke',
  country_code: 'KE',
  name: 'Kenya',
  currency_code: 'KES',
  default_timezone: 'Africa/Nairobi',
  status: 'published',
};

const activeProfile = {
  id: 'profile-1',
  jurisdiction_id: jurisdiction.id,
  country_code: 'KE',
  jurisdiction_name: 'Kenya',
  vat_registered: true,
  tax_registration_number: 'P051234567A',
  default_tax_category_id: 'category-standard',
  effective_from: '2026-08-01',
  effective_to: null,
  business_timezone: 'Africa/Nairobi',
};

describe('TaxSettingsComponent', () => {
  async function render(active = true) {
    const tax = {
      settings: vi.fn().mockResolvedValue({
        show_vat_breakdown_on_prints: true,
        business_timezone: 'Africa/Nairobi',
        active_profile: active ? activeProfile : null,
        scheduled_profiles: [],
        categories: [],
        jurisdictions: [jurisdiction],
        activation: {
          business_date: '2026-08-21',
          earliest_effective_from: '2026-08-21',
          has_financial_activity_today: false,
        },
      }),
      integrationLocations: vi.fn().mockResolvedValue([]),
      scheduleProfile: vi.fn().mockResolvedValue('profile-2'),
      updateRegistrationNumber: vi.fn().mockResolvedValue('profile-1'),
      categories: vi.fn().mockResolvedValue([
        {
          id: 'category-standard',
          code: 'STANDARD',
          name: 'Standard',
          classification: 'standard',
          is_default: true,
          active: true,
          rate_bps: 1600,
        },
      ]),
    };

    await TestBed.configureTestingModule({
      imports: [TaxSettingsComponent],
      providers: [
        { provide: TaxService, useValue: tax },
        { provide: PermissionsService, useValue: { has: () => true } },
        { provide: ReceiptDataService, useValue: { invalidateCompanyInfo: vi.fn() } },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(TaxSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Loading VAT settings');
    });
    return { fixture, tax };
  }

  it('shows active VAT as management state without reopening onboarding', async () => {
    const { fixture } = await render(true);
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('VAT on');
    expect(text).toContain('VAT accounting is on');
    expect(text).toContain('Turn VAT off');
    expect(text).not.toContain('Turn VAT accounting off');
  });

  it('opens the single-panel VAT form only after an explicit action', async () => {
    const { fixture } = await render(false);
    expect(fixture.nativeElement.textContent).toContain('VAT is not active');
    expect(fixture.nativeElement.textContent).not.toContain('Turn VAT accounting on');

    const setup = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      (button.textContent ?? '').includes('Turn VAT on')
    );
    setup?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Turn VAT accounting on');
    expect((fixture.componentInstance as any).registered.value).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('Step 1 of 4');
  });

  it('allows VAT accounting to be enabled without a KRA PIN', async () => {
    const { fixture, tax } = await render(false);
    const component = fixture.componentInstance as any;
    component.openEditor(true);
    component.pin.setValue('');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('KRA PIN for invoices (optional)');

    await component.saveProfile();

    expect(tax.scheduleProfile).toHaveBeenCalledWith({
      jurisdictionId: jurisdiction.id,
      vatRegistered: true,
      taxRegistrationNumber: '',
      effectiveFrom: '2026-08-21',
      defaultTaxCategoryId: 'category-standard',
    });
  });

  it('updates invoice PIN metadata without rescheduling VAT', async () => {
    const { fixture, tax } = await render(true);
    const component = fixture.componentInstance as any;
    component.documentPin.setValue('P000000001A');

    await component.saveDocumentPin(activeProfile.id);

    expect(tax.updateRegistrationNumber).toHaveBeenCalledWith(activeProfile.id, 'P000000001A');
    expect(tax.scheduleProfile).not.toHaveBeenCalled();
  });
});

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
    return fixture;
  }

  it('shows active VAT as management state without reopening onboarding', async () => {
    const fixture = await render(true);
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('VAT active');
    expect(text).toContain('Kenya VAT is active');
    expect(text).toContain('Schedule a change');
    expect(text).not.toContain('Is this shop VAT registered?');
  });

  it('reveals onboarding only after an explicit setup action', async () => {
    const fixture = await render(false);
    expect(fixture.nativeElement.textContent).toContain('VAT is not active');
    expect(fixture.nativeElement.textContent).not.toContain('Is this shop VAT registered?');

    const setup = [...fixture.nativeElement.querySelectorAll('button')].find(button =>
      (button.textContent ?? '').includes('Set up VAT')
    );
    setup?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Is this shop VAT registered?');
    expect((fixture.componentInstance as any).registered.value).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Keep VAT off');
  });
});

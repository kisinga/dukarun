import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementsService } from '../core/entitlements.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import type { CompanySettings } from './settings.service';
import { SettingsService } from './settings.service';
import { BusinessSettingsComponent } from './business-settings.component';

const settings: CompanySettings = {
  id: 'company-1',
  name: 'Dukarun Shop',
  address: 'Nairobi',
  email: 'hello@example.test',
  logo_path: 'company-1/logo.png',
  public_storefront_enabled: false,
  public_slug: 'dukarun-shop',
  public_whatsapp_number: '+254700000000',
  notification_category_preferences: null,
  enable_printer: true,
  proforma_validity_days: 30,
  low_stock_threshold: 5,
  cashier_flow_enabled: true,
  batch_expiry_enabled: true,
  cash_control_enabled: true,
  require_opening_count: true,
  variance_notification_threshold: 500,
  commissions_enabled: false,
  payment_reminders_enabled: false,
  payment_reminder_channel: 'whatsapp',
  payment_reminder_sms_fallback: true,
  automated_customer_notifications_enabled: true,
  automated_customer_notifications_override: null,
};

describe('BusinessSettingsComponent', () => {
  async function render() {
    const settingsService = {
      getSettings: vi.fn().mockResolvedValue(settings),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      uploadLogo: vi.fn().mockResolvedValue('company-1/logo.png'),
      removeLogo: vi.fn().mockResolvedValue(undefined),
      logoPublicUrl: vi.fn((path: string) => `https://cdn.example.test/${path}`),
    };
    const entitlements = {
      enabled: vi.fn((feature: string) => feature !== 'storefront'),
      refresh: vi.fn().mockResolvedValue(undefined),
    };
    const receiptData = { invalidateCompanyInfo: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [BusinessSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useValue: settingsService },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: ReceiptDataService, useValue: receiptData },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(BusinessSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        [...(fixture.nativeElement as HTMLElement).querySelectorAll('input')].some(
          input => input.value === 'Dukarun Shop'
        )
      ).toBe(true);
    });
    return { fixture, settingsService, entitlements, receiptData };
  }

  it('loads and owns the business profile form', async () => {
    const { fixture, settingsService, entitlements } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(settingsService.getSettings).toHaveBeenCalledOnce();
    expect(entitlements.refresh).toHaveBeenCalledOnce();
    expect((root.querySelector('img') as HTMLImageElement).src).toBe(
      'https://cdn.example.test/company-1/logo.png'
    );
    expect(root.textContent).toContain('Storefront publishing is unavailable on this plan.');
  });

  it('saves through the settings service contract and marks the form clean', async () => {
    const { fixture, settingsService } = await render();
    const root = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance as any;

    component.name.setValue('Dukarun Market');
    component.name.markAsDirty();
    fixture.detectChanges();
    expect(root.textContent).toContain('Unsaved changes');

    await component.save();
    expect(settingsService.updateSettings).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ name: 'Dukarun Market' })
    );
    fixture.detectChanges();

    expect(root.textContent).toContain('Saved');
    expect(root.textContent).not.toContain('Unsaved changes');
  });
});

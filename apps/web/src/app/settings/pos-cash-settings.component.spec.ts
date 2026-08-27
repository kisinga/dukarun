import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CashierSessionService } from '../core/cashier-session.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { IconComponent } from '../shared/ui/icon.component';
import { PosCashSettingsComponent } from './pos-cash-settings.component';
import type { CompanySettings } from './settings.service';
import { SettingsService } from './settings.service';

const settings: CompanySettings = {
  id: 'company-1',
  name: 'Dukarun Shop',
  address: 'Nairobi',
  email: 'hello@example.test',
  logo_path: null,
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

describe('PosCashSettingsComponent', () => {
  async function render(overrides: Partial<CompanySettings> = {}) {
    const initialSettings = { ...settings, ...overrides };
    const settingsService = {
      getSettings: vi.fn().mockResolvedValue(initialSettings),
      updateSettings: vi.fn().mockResolvedValue(undefined),
    };
    const cashierSession = {
      refreshConfiguration: vi.fn().mockResolvedValue(undefined),
    };
    const receiptData = { invalidateCompanyInfo: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [PosCashSettingsComponent],
      providers: [
        { provide: SettingsService, useValue: settingsService },
        { provide: CashierSessionService, useValue: cashierSession },
        { provide: ReceiptDataService, useValue: receiptData },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(PosCashSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('POS & cash control');
    });
    return { fixture, settingsService, cashierSession };
  }

  it('loads and owns the checkout and till controls', async () => {
    const { fixture, settingsService } = await render({ cashier_flow_enabled: false });
    const root = fixture.nativeElement as HTMLElement;

    expect(settingsService.getSettings).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Use a separate cashier queue');
    expect(root.textContent).toContain('Direct checkout will be used');
  });

  it('saves through the company settings contract and refreshes cashier configuration', async () => {
    const { fixture, settingsService, cashierSession } = await render();
    const component = fixture.componentInstance as any;

    component.proformaValidityDays.setValue(45);
    component.proformaValidityDays.markAsDirty();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unsaved changes');

    await component.save();

    expect(settingsService.updateSettings).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        enable_printer: true,
        proforma_validity_days: 45,
        cashier_flow_enabled: true,
        cash_control_enabled: true,
        require_opening_count: true,
      })
    );
    expect(cashierSession.refreshConfiguration).toHaveBeenCalledOnce();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Saved');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Unsaved changes');
  });

  it('rejects invalid proforma validity without saving', async () => {
    const { fixture, settingsService, cashierSession } = await render();
    const component = fixture.componentInstance as any;

    component.proformaValidityDays.setValue(0);
    component.proformaValidityDays.markAsDirty();
    await component.save();
    fixture.detectChanges();

    expect(settingsService.updateSettings).not.toHaveBeenCalled();
    expect(cashierSession.refreshConfiguration).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Proforma validity must be between 1 and 3650 days'
    );
  });
});

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { TaxService } from '../core/tax.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { IconComponent } from '../shared/ui/icon.component';
import { CashVarianceSettingsComponent } from './cash-variance-settings.component';
import { MoneySettingsComponent } from './money-settings.component';
import { MoneySettingsStore } from './money-settings.store';
import type {
  CompanySettings,
  LocationPaymentMethodRow,
  MoneyAccountRow,
  MoneyPaymentAccountOverview,
  PaymentMethodRow,
  StockLocationRow,
} from './settings.service';
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

const locations: StockLocationRow[] = [
  {
    id: 'loc-main',
    company_id: 'company-1',
    code: 'MAIN',
    name: 'Main shop',
    is_default: true,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const paymentMethods: PaymentMethodRow[] = [
  {
    id: 'pm-bank',
    company_id: 'company-1',
    code: 'bank',
    name: 'Bank',
    ledger_account_code: 'BANK_MAIN',
    reconciliation_type: 'manual',
    enabled: true,
    requires_reconciliation: true,
    is_cashier_controlled: false,
    availability_scope: 'all_locations',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const paymentAssignments: LocationPaymentMethodRow[] = [
  {
    id: 'assignment-bank',
    company_id: 'company-1',
    location_id: 'loc-main',
    payment_method_id: 'pm-bank',
    ledger_account_code: 'BANK_MAIN',
    enabled: true,
    requires_reconciliation: true,
    is_cashier_controlled: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

const bankAccount: MoneyAccountRow = {
  id: 'account-bank',
  company_id: 'company-1',
  code: 'BANK_MAIN',
  name: 'Bank - Main',
  type: 'asset',
  parent_id: null,
  is_parent: false,
  is_system: false,
  is_active: true,
  allow_manual_posting: false,
  money_account_kind: 'bank',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('MoneySettingsComponent', () => {
  async function render() {
    let accountRows = [{ ...bankAccount }];
    const settingsService = {
      getSettings: vi.fn().mockResolvedValue(settings),
      updateSettings: vi.fn().mockResolvedValue(undefined),
      stockLocations: vi.fn().mockResolvedValue(locations),
      paymentMethods: vi.fn().mockResolvedValue(paymentMethods),
      paymentMethodLocations: vi.fn().mockResolvedValue(paymentAssignments),
      moneyAccounts: vi.fn(async () => accountRows),
      moneyPaymentAccountsOverview: vi.fn().mockResolvedValue([] as MoneyPaymentAccountOverview[]),
      createMoneyAccount: vi.fn(async (kind: 'bank' | 'mpesa', name: string) => {
        accountRows = [
          ...accountRows,
          {
            ...bankAccount,
            id: 'account-new',
            code: kind === 'bank' ? 'BANK_EQUITY' : 'MPESA_TILL',
            name,
            money_account_kind: kind,
          },
        ];
        return 'account-new';
      }),
      updateMoneyAccount: vi.fn().mockResolvedValue(undefined),
      setLocationPaymentAccount: vi.fn().mockResolvedValue(undefined),
      setPaymentMethodLocations: vi.fn().mockResolvedValue(undefined),
      updatePaymentMethod: vi.fn().mockResolvedValue(undefined),
      setCommissionsEnabled: vi.fn().mockResolvedValue(true),
    };
    const entitlements = {
      enabled: vi.fn((feature: string) => feature === 'commissions'),
      refresh: vi.fn().mockResolvedValue(undefined),
    };
    const permissions = {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      has: vi.fn((permission: string) =>
        [
          'ManageReconciliation',
          'ManageCommissions',
          'ManageMpesaIntegration',
          'ViewFinancials',
        ].includes(permission)
      ),
    };
    const tax = {
      settings: vi.fn().mockResolvedValue({
        active_profile: null,
        scheduled_profiles: [],
        show_vat_breakdown_on_prints: false,
        jurisdictions: [],
        activation: { earliest_effective_from: '2026-01-01' },
      }),
      integrationLocations: vi.fn().mockResolvedValue([]),
      categories: vi.fn().mockResolvedValue([]),
    };
    const receiptData = { invalidateCompanyInfo: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [MoneySettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useValue: settingsService },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: PermissionsService, useValue: permissions },
        { provide: TaxService, useValue: tax },
        { provide: ReceiptDataService, useValue: receiptData },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(MoneySettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payment accounts');
    });
    return { fixture, settingsService, entitlements, permissions };
  }

  it('loads money settings without the settings shell coordinating payment data', async () => {
    const { fixture, settingsService, permissions } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(permissions.ensureLoaded).toHaveBeenCalled();
    expect(settingsService.paymentMethods).toHaveBeenCalledOnce();
    expect(settingsService.moneyAccounts).toHaveBeenCalledOnce();
    expect(settingsService.stockLocations).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Cash variance alerts');
    expect(root.textContent).toContain('Bank - Main');
  });

  it('saves variance threshold through the company settings store', async () => {
    const { fixture, settingsService } = await render();
    const component = fixture.debugElement.query(By.directive(CashVarianceSettingsComponent))
      .componentInstance as any;

    component.varianceThreshold.setValue('1,250');
    component.varianceThreshold.markAsDirty();
    await component.save();
    fixture.detectChanges();

    expect(settingsService.updateSettings).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ variance_notification_threshold: 1250 })
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Saved');
  });

  it('creates a money account and refreshes account data', async () => {
    const { fixture, settingsService } = await render();
    const store = fixture.debugElement.injector.get(MoneySettingsStore);

    store.startMoneyAccount('bank');
    store.moneyAccountName.setValue('Equity Westlands');
    await store.saveMoneyAccount();
    fixture.detectChanges();

    expect(settingsService.createMoneyAccount).toHaveBeenCalledWith('bank', 'Equity Westlands');
    expect(settingsService.moneyAccounts).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Account created');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Equity Westlands');
  });
});

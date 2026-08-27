import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import { IconComponent } from '../shared/ui/icon.component';
import { CommunicationsSettingsComponent } from './communications-settings.component';
import type {
  CompanySettings,
  PrimaryContactNotificationPreferences,
  PrimaryContactNotificationSettings,
  ReminderRule,
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
  payment_reminders_enabled: true,
  payment_reminder_channel: 'whatsapp',
  payment_reminder_sms_fallback: true,
  automated_customer_notifications_enabled: true,
  automated_customer_notifications_override: null,
};

const primaryContactSettings: PrimaryContactNotificationSettings = {
  primary_contact_user_id: 'user-1',
  primary_contact_name: 'Amina Admin',
  primary_contact_phone: '+254700000000',
  preferences: {
    channel: 'whatsapp',
    team: true,
    cashierSessions: true,
  },
};

const reminderRules = [
  { stage_days: 0, enabled: true, template_key: 'payment_due_today' },
  { stage_days: 3, enabled: true, template_key: 'payment_overdue_3' },
] as unknown as ReminderRule[];

describe('CommunicationsSettingsComponent', () => {
  async function render(
    options: {
      permissions?: string[];
      companySettings?: Partial<CompanySettings>;
    } = {}
  ) {
    const permissionSet = new Set(options.permissions ?? ['ManageTeam', 'ManageCommunications']);
    const initialSettings = { ...settings, ...options.companySettings };
    const settingsService = {
      getSettings: vi.fn().mockResolvedValue(initialSettings),
      reminderConfiguration: vi.fn().mockResolvedValue(reminderRules),
      getPrimaryContactNotificationSettings: vi.fn().mockResolvedValue(primaryContactSettings),
      updateCommunicationSettings: vi.fn().mockResolvedValue(undefined),
      setAutomatedCustomerNotifications: vi.fn().mockResolvedValue(2),
      setPrimaryContactNotificationPreferences: vi.fn(
        async (preferences: PrimaryContactNotificationPreferences) => preferences
      ),
    };
    const entitlements = {
      enabled: vi.fn((feature: string) => feature === 'paymentReminders'),
      refresh: vi.fn().mockResolvedValue(undefined),
    };
    const permissions = {
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      has: vi.fn((permission: string) => permissionSet.has(permission)),
    };
    const receiptData = { invalidateCompanyInfo: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CommunicationsSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useValue: settingsService },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: PermissionsService, useValue: permissions },
        { provide: ReceiptDataService, useValue: receiptData },
      ],
    })
      .overrideComponent(IconComponent, { set: { template: '' } })
      .compileComponents();

    const fixture = TestBed.createComponent(CommunicationsSettingsComponent);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payment reminders');
    });
    return { fixture, settingsService, entitlements, permissions };
  }

  it('loads notification settings without the settings shell coordinating communication data', async () => {
    const { fixture, settingsService, entitlements, permissions } = await render();
    const root = fixture.nativeElement as HTMLElement;

    expect(permissions.ensureLoaded).toHaveBeenCalledOnce();
    expect(settingsService.getSettings).toHaveBeenCalledOnce();
    expect(settingsService.reminderConfiguration).toHaveBeenCalledOnce();
    expect(settingsService.getPrimaryContactNotificationSettings).toHaveBeenCalledOnce();
    expect(entitlements.refresh).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Amina Admin');
    expect(root.textContent).toContain('Automated customer notifications');
  });

  it('saves reminder settings through the communication service contract', async () => {
    const { fixture, settingsService } = await render();
    const component = fixture.componentInstance as any;

    component.paymentRemindersEnabled.setValue(false);
    component.paymentRemindersEnabled.markAsDirty();
    component.reminderChannel.setValue('sms');
    component.reminderChannel.markAsDirty();
    await component.saveCommunicationSettings();
    fixture.detectChanges();

    expect(settingsService.updateCommunicationSettings).toHaveBeenCalledWith({
      enabled: false,
      channel: 'sms',
      smsFallback: true,
      rules: [
        { stage_days: 0, enabled: true, template_key: 'payment_due_today' },
        { stage_days: 3, enabled: true, template_key: 'payment_overdue_3' },
      ],
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reminder settings saved');
  });

  it('saves primary-contact alert preferences independently from reminder settings', async () => {
    const { fixture, settingsService } = await render();
    const component = fixture.componentInstance as any;

    component.primaryContactChannel.setValue('sms');
    component.primaryContactChannel.markAsDirty();
    component.primaryCashierNotifications.setValue(false);
    component.primaryCashierNotifications.markAsDirty();
    await component.savePrimaryContactNotifications();
    fixture.detectChanges();

    expect(settingsService.setPrimaryContactNotificationPreferences).toHaveBeenCalledWith({
      channel: 'sms',
      team: true,
      cashierSessions: false,
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Admin alert preferences saved'
    );
  });
});

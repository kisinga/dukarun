import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EntitlementsService } from '../core/entitlements.service';
import { PermissionsService } from '../core/permissions.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { CompanySettingsStore } from './company-settings.store';
import {
  SettingsService,
  type PrimaryContactNotificationChannel,
  type PrimaryContactNotificationSettings,
  type ReminderRule,
} from './settings.service';

type ReminderDraft = {
  stageDays: number;
  enabled: boolean;
  key: string;
};

/**
 * Notifications settings are a smart LOB child of SettingsComponent.
 *
 * This component owns the notification-specific forms, reminder RPCs, primary-contact alert
 * preferences, messages, and retry state. SettingsComponent should only decide whether the
 * Notifications tab is available and mount this component; it should not coordinate these flows.
 */
@Component({
  selector: 'app-communications-settings',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, FormFieldComponent, IconComponent],
  template: `
    @if (loading()) {
      <div class="grid gap-4 xl:grid-cols-2">
        <div class="card bg-base-100">
          <div class="card-body gap-3 p-4">
            <div class="skeleton h-6 w-44"></div>
            <div class="skeleton h-16 w-full"></div>
            <div class="skeleton h-20 w-full"></div>
          </div>
        </div>
        <div class="card bg-base-100">
          <div class="card-body gap-3 p-4">
            <div class="skeleton h-6 w-56"></div>
            <div class="skeleton h-24 w-full"></div>
            <div class="skeleton h-20 w-full"></div>
          </div>
        </div>
      </div>
    } @else if (loadError()) {
      <div role="alert" class="alert alert-error">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ loadError() }}</span>
        <button appButton variant="outline" size="sm" type="button" (click)="load()">Retry</button>
      </div>
    } @else if (!perms.has('ManageCommunications') && !perms.has('ManageTeam')) {
      <div class="card bg-base-100">
        <div class="card-body p-4">
          <h2 class="section-title">Notifications</h2>
          <p class="type-caption mt-1">
            Your role does not include access to communication settings.
          </p>
        </div>
      </div>
    } @else {
      <div class="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        @if (perms.has('ManageTeam')) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="section-title">Primary contact alerts</h2>
                  <p class="type-caption mt-1">
                    Choose how operational alerts reach the company's primary contact. Every alert
                    also stays in their Dukarun inbox.
                  </p>
                </div>
                <a appButton variant="ghost" size="sm" routerLink="/team">
                  Manage primary contact
                </a>
              </div>

              @if (primaryContactSettings(); as primary) {
                @if (primary.primary_contact_user_id) {
                  <div
                    class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200/40 px-3 py-2"
                  >
                    <div>
                      <p class="text-sm font-semibold">
                        {{ primary.primary_contact_name || 'Primary administrator' }}
                      </p>
                      <p class="type-caption">
                        {{ primary.primary_contact_phone || 'No verified phone available' }}
                      </p>
                    </div>
                    <span class="badge badge-primary badge-sm">Primary contact</span>
                  </div>

                  <div class="mt-4 grid gap-4 sm:grid-cols-2">
                    <app-form-field
                      label="External channel"
                      hint="SMS fallback is used only after WhatsApp permanently fails."
                    >
                      <select
                        class="select select-bordered select-sm w-full"
                        [formControl]="primaryContactChannel"
                      >
                        <option value="whatsapp_sms_fallback">WhatsApp, then SMS fallback</option>
                        <option value="whatsapp">WhatsApp only</option>
                        <option value="sms">SMS only</option>
                        <option value="none">In-app only</option>
                      </select>
                    </app-form-field>
                    <div class="divide-y divide-base-300 rounded-box bg-base-200/40 px-3">
                      <label
                        class="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
                      >
                        <span>
                          <span class="block text-sm font-medium">Team invitations</span>
                          <span class="type-caption">Invited and joined events</span>
                        </span>
                        <input
                          type="checkbox"
                          class="toggle toggle-sm toggle-primary"
                          [formControl]="primaryTeamNotifications"
                        />
                      </label>
                      <label
                        class="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2"
                      >
                        <span>
                          <span class="block text-sm font-medium">Cashier sessions</span>
                          <span class="type-caption">Day opened and closed summaries</span>
                        </span>
                        <input
                          type="checkbox"
                          class="toggle toggle-sm toggle-primary"
                          [formControl]="primaryCashierNotifications"
                        />
                      </label>
                    </div>
                  </div>
                  @if (msg('primary-contact-notifications'); as m) {
                    <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  @if (primaryContactDirty()) {
                    <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        [disabled]="busy()"
                        (click)="discardPrimaryContactNotifications()"
                      >
                        Discard
                      </button>
                      <button
                        appButton
                        type="button"
                        [loading]="busy()"
                        (click)="savePrimaryContactNotifications()"
                      >
                        Save changes
                      </button>
                    </div>
                  }
                } @else {
                  <div class="alert alert-warning mt-4 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span>
                      Select an approved administrator as primary contact before enabling external
                      alerts.
                    </span>
                    <a routerLink="/team" class="link whitespace-nowrap font-semibold">
                      Choose contact
                    </a>
                  </div>
                }
              } @else if (primaryContactLoading()) {
                <div class="mt-4 grid gap-2" aria-label="Loading primary contact alerts">
                  <div class="skeleton h-14 w-full"></div>
                  <div class="skeleton h-10 w-full"></div>
                </div>
              } @else if (primaryContactLoadError()) {
                <div class="alert alert-error mt-4 text-sm">
                  <app-icon name="heroExclamationTriangle" />
                  <span>{{ primaryContactLoadError() }}</span>
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    (click)="reloadPrimaryContactSettings()"
                  >
                    Try again
                  </button>
                </div>
              }
            </div>
          </div>
        }

        @if (perms.has('ManageCommunications')) {
          @if (settings(); as s) {
            <div class="card bg-base-100">
              <div class="card-body p-4">
                <div
                  class="flex flex-wrap items-start justify-between gap-4 border-b border-base-300/60 pb-4"
                >
                  <div>
                    <h2 class="section-title">Automated customer notifications</h2>
                    <p class="type-caption mt-1">
                      Controls scheduled customer messages such as payment reminders. Manually
                      reviewed receipts, invoices, proformas and purchase orders are separate.
                    </p>
                    @if (s.automated_customer_notifications_override !== null) {
                      <p class="mt-1 text-xs text-warning">
                        Dukarun has
                        {{ s.automated_customer_notifications_override ? 'enabled' : 'paused' }}
                        automation for this company.
                      </p>
                    }
                  </div>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="automatedCustomerNotificationsEnabled"
                    [disabled]="busy() || s.automated_customer_notifications_override !== null"
                    (change)="saveAutomationPreference()"
                  />
                </div>
                @if (msg('automation'); as m) {
                  <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                    {{ m.text }}
                  </p>
                }

                <div class="mt-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 class="section-title">Payment reminders</h2>
                    <p class="type-caption mt-1">
                      Send due-day, 3-, 7-, and 14-day reminders automatically.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    class="toggle toggle-primary"
                    [formControl]="paymentRemindersEnabled"
                    [disabled]="!entitlements.enabled('paymentReminders')"
                  />
                </div>
                @if (!entitlements.enabled('paymentReminders')) {
                  <p class="mt-3 text-sm text-warning">
                    Payment reminders are unavailable on this plan.
                    <a routerLink="/settings" [queryParams]="{ tab: 'billing' }" class="link">
                      View plans
                    </a>
                  </p>
                } @else {
                  @if (paymentRemindersEnabled.value) {
                    <div class="mt-4 grid gap-3 sm:grid-cols-2">
                      <app-form-field label="Default channel">
                        <select
                          class="select select-bordered select-sm w-full"
                          [formControl]="reminderChannel"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="sms">SMS</option>
                        </select>
                      </app-form-field>
                      <label class="label cursor-pointer justify-start gap-3 self-end">
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [formControl]="reminderSmsFallback"
                        />
                        <span class="label-text">Use SMS if WhatsApp permanently fails</span>
                      </label>
                      <div class="sm:col-span-2">
                        <div class="flex flex-wrap items-baseline justify-between gap-2">
                          <p class="text-sm font-medium">Reminder stages</p>
                          <p class="type-caption">Message wording is managed by Dukarun.</p>
                        </div>
                        <div class="mt-2 grid gap-1 rounded-box bg-base-200/40 p-1 sm:grid-cols-2">
                          @for (draft of reminderDrafts(); track draft.key) {
                            <label
                              class="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-2 py-2"
                            >
                              <span class="font-medium">{{
                                reminderStageLabel(draft.stageDays)
                              }}</span>
                              <input
                                type="checkbox"
                                class="toggle toggle-sm toggle-primary"
                                [checked]="draft.enabled"
                                (change)="setReminderStageEnabled(draft.key, $event)"
                              />
                            </label>
                          }
                        </div>
                      </div>
                    </div>
                  } @else {
                    <p class="type-caption mt-3">
                      Reminder schedules and delivery options are paused while this is off.
                    </p>
                  }
                  @if (msg('communications'); as m) {
                    <p class="mt-2 text-sm" [class.text-success]="m.ok" [class.text-error]="!m.ok">
                      {{ m.text }}
                    </p>
                  }
                  @if (reminderSettingsDirty()) {
                    <div class="mt-3 flex justify-end gap-2 border-t border-base-300/60 pt-3">
                      <button
                        appButton
                        variant="ghost"
                        type="button"
                        [disabled]="busy()"
                        (click)="discardCommunicationSettings()"
                      >
                        Discard
                      </button>
                      <button
                        appButton
                        type="button"
                        [loading]="busy()"
                        (click)="saveCommunicationSettings()"
                      >
                        Save changes
                      </button>
                    </div>
                  }
                }
                <div class="mt-4 border-t border-base-300/60 pt-4">
                  <p class="type-caption">
                    Campaigns and manually reviewed documents keep their send-time channel and
                    recipient choices.
                    <a routerLink="/activity/messages" class="link font-semibold">
                      View message activity
                    </a>
                  </p>
                </div>
              </div>
            </div>
          }
        }
      </div>
    }
  `,
})
export class CommunicationsSettingsComponent implements OnInit {
  private readonly companySettings = inject(CompanySettingsStore);
  private readonly settingsService = inject(SettingsService);
  protected readonly entitlements = inject(EntitlementsService);
  protected readonly perms = inject(PermissionsService);

  protected readonly settings = this.companySettings.settings;
  protected readonly primaryContactSettings = signal<PrimaryContactNotificationSettings | null>(
    null
  );
  protected readonly primaryContactLoading = signal(false);
  protected readonly primaryContactLoadError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly messages = signal<Map<string, { ok: boolean; text: string }>>(new Map());

  protected readonly paymentRemindersEnabled = new FormControl(false, { nonNullable: true });
  protected readonly automatedCustomerNotificationsEnabled = new FormControl(true, {
    nonNullable: true,
  });
  protected readonly reminderChannel = new FormControl<'sms' | 'whatsapp'>('whatsapp', {
    nonNullable: true,
  });
  protected readonly reminderSmsFallback = new FormControl(true, { nonNullable: true });
  protected readonly primaryContactChannel = new FormControl<PrimaryContactNotificationChannel>(
    'whatsapp',
    { nonNullable: true }
  );
  protected readonly primaryTeamNotifications = new FormControl(true, { nonNullable: true });
  protected readonly primaryCashierNotifications = new FormControl(true, { nonNullable: true });
  protected readonly reminderDrafts = signal<ReminderDraft[]>([]);
  private readonly savedReminderDrafts = signal<ReminderDraft[]>([]);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await this.perms.ensureLoaded();
      const canManageCommunications = this.perms.has('ManageCommunications');
      const canManageTeam = this.perms.has('ManageTeam');
      const [settings, reminderConfiguration, primaryContactSettings] = await Promise.all([
        canManageCommunications ? this.companySettings.load() : Promise.resolve(null),
        canManageCommunications
          ? this.settingsService.reminderConfiguration()
          : Promise.resolve([] as ReminderRule[]),
        canManageTeam ? this.fetchPrimaryContactSettings() : Promise.resolve(null),
        canManageCommunications ? this.entitlements.refresh() : Promise.resolve(undefined),
      ]);

      this.primaryContactSettings.set(primaryContactSettings);
      if (settings) {
        this.paymentRemindersEnabled.setValue(settings.payment_reminders_enabled);
        this.automatedCustomerNotificationsEnabled.setValue(
          settings.automated_customer_notifications_override ??
            settings.automated_customer_notifications_enabled
        );
        this.reminderChannel.setValue(settings.payment_reminder_channel);
        this.reminderSmsFallback.setValue(settings.payment_reminder_sms_fallback);
      }
      if (primaryContactSettings) {
        this.primaryContactChannel.setValue(primaryContactSettings.preferences.channel);
        this.primaryTeamNotifications.setValue(primaryContactSettings.preferences.team);
        this.primaryCashierNotifications.setValue(
          primaryContactSettings.preferences.cashierSessions
        );
      }
      const reminderDrafts = reminderConfiguration.map(rule =>
        this.reminderDraft(rule.stage_days, rule.enabled, rule.template_key)
      );
      this.reminderDrafts.set(reminderDrafts);
      this.savedReminderDrafts.set(reminderDrafts.map(draft => ({ ...draft })));
      this.markAllSectionsPristine();
    } catch (err) {
      this.loadError.set(
        err instanceof Error ? err.message : 'Failed to load notification settings'
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async reloadPrimaryContactSettings(): Promise<void> {
    const settings = await this.fetchPrimaryContactSettings();
    if (!settings) return;
    this.primaryContactSettings.set(settings);
    this.primaryContactChannel.setValue(settings.preferences.channel);
    this.primaryTeamNotifications.setValue(settings.preferences.team);
    this.primaryCashierNotifications.setValue(settings.preferences.cashierSessions);
    this.markPrimaryContactPristine();
  }

  private async fetchPrimaryContactSettings(): Promise<PrimaryContactNotificationSettings | null> {
    this.primaryContactLoading.set(true);
    this.primaryContactLoadError.set(null);
    try {
      const settings = await this.settingsService.getPrimaryContactNotificationSettings();
      this.primaryContactSettings.set(settings);
      return settings;
    } catch (err) {
      this.primaryContactSettings.set(null);
      this.primaryContactLoadError.set(
        err instanceof Error ? err.message : 'Primary contact alerts could not be loaded.'
      );
      return null;
    } finally {
      this.primaryContactLoading.set(false);
    }
  }

  protected msg(key: string): { ok: boolean; text: string } | null {
    return this.messages().get(key) ?? null;
  }

  private flash(key: string, ok: boolean, text: string): void {
    this.messages.update(map => new Map(map).set(key, { ok, text }));
  }

  protected async saveCommunicationSettings(): Promise<void> {
    const current = this.settings();
    if (!current) return;
    this.busy.set(true);
    try {
      await this.settingsService.updateCommunicationSettings({
        enabled: this.paymentRemindersEnabled.value,
        channel: this.reminderChannel.value,
        smsFallback: this.reminderSmsFallback.value,
        rules: this.reminderDrafts().map(draft => ({
          stage_days: draft.stageDays,
          enabled: draft.enabled,
          template_key: draft.key,
        })),
      });
      this.companySettings.patchLocal({
        payment_reminders_enabled: this.paymentRemindersEnabled.value,
        payment_reminder_channel: this.reminderChannel.value,
        payment_reminder_sms_fallback: this.reminderSmsFallback.value,
      });
      this.savedReminderDrafts.set(this.reminderDrafts().map(draft => ({ ...draft })));
      this.markReminderSettingsPristine();
      await this.entitlements.refresh();
      this.flash('communications', true, 'Reminder settings saved');
    } catch (err) {
      this.flash('communications', false, err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected async savePrimaryContactNotifications(): Promise<void> {
    const current = this.primaryContactSettings();
    if (!current?.primary_contact_user_id) return;
    this.busy.set(true);
    try {
      const preferences = await this.settingsService.setPrimaryContactNotificationPreferences({
        channel: this.primaryContactChannel.value,
        team: this.primaryTeamNotifications.value,
        cashierSessions: this.primaryCashierNotifications.value,
      });
      this.primaryContactSettings.set({ ...current, preferences });
      this.markPrimaryContactPristine();
      this.flash('primary-contact-notifications', true, 'Admin alert preferences saved');
    } catch (err) {
      this.primaryContactChannel.setValue(current.preferences.channel, { emitEvent: false });
      this.primaryTeamNotifications.setValue(current.preferences.team, { emitEvent: false });
      this.primaryCashierNotifications.setValue(current.preferences.cashierSessions, {
        emitEvent: false,
      });
      this.markPrimaryContactPristine();
      this.flash(
        'primary-contact-notifications',
        false,
        err instanceof Error ? err.message : 'Save failed'
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveAutomationPreference(): Promise<void> {
    const current = this.settings();
    if (!current || current.automated_customer_notifications_override !== null) return;
    const enabled = this.automatedCustomerNotificationsEnabled.value;
    this.busy.set(true);
    try {
      const cancelled = await this.settingsService.setAutomatedCustomerNotifications(enabled);
      this.companySettings.patchLocal({ automated_customer_notifications_enabled: enabled });
      this.automatedCustomerNotificationsEnabled.markAsPristine();
      this.flash(
        'automation',
        true,
        enabled
          ? 'Automated customer notifications enabled.'
          : `Automated customer notifications paused${cancelled ? `; ${cancelled} pending message(s) cancelled` : ''}.`
      );
    } catch (err) {
      this.automatedCustomerNotificationsEnabled.setValue(
        current.automated_customer_notifications_enabled,
        { emitEvent: false }
      );
      this.automatedCustomerNotificationsEnabled.markAsPristine();
      this.flash('automation', false, err instanceof Error ? err.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected primaryContactDirty(): boolean {
    return [
      this.primaryContactChannel,
      this.primaryTeamNotifications,
      this.primaryCashierNotifications,
    ].some(control => control.dirty);
  }

  protected discardPrimaryContactNotifications(): void {
    const current = this.primaryContactSettings();
    if (!current) return;
    this.primaryContactChannel.setValue(current.preferences.channel);
    this.primaryTeamNotifications.setValue(current.preferences.team);
    this.primaryCashierNotifications.setValue(current.preferences.cashierSessions);
    this.markPrimaryContactPristine();
    this.clearMessage('primary-contact-notifications');
  }

  protected reminderSettingsDirty(): boolean {
    const controlsDirty = [
      this.paymentRemindersEnabled,
      this.reminderChannel,
      this.reminderSmsFallback,
    ].some(control => control.dirty);
    if (controlsDirty) return true;
    return !this.sameReminderDrafts(this.reminderDrafts(), this.savedReminderDrafts());
  }

  protected discardCommunicationSettings(): void {
    const current = this.settings();
    if (!current) return;
    this.paymentRemindersEnabled.setValue(current.payment_reminders_enabled);
    this.reminderChannel.setValue(current.payment_reminder_channel);
    this.reminderSmsFallback.setValue(current.payment_reminder_sms_fallback);
    this.reminderDrafts.set(this.savedReminderDrafts().map(draft => ({ ...draft })));
    this.markReminderSettingsPristine();
    this.clearMessage('communications');
  }

  private markAllSectionsPristine(): void {
    this.markPrimaryContactPristine();
    this.markReminderSettingsPristine();
    this.automatedCustomerNotificationsEnabled.markAsPristine();
  }

  private markPrimaryContactPristine(): void {
    for (const control of [
      this.primaryContactChannel,
      this.primaryTeamNotifications,
      this.primaryCashierNotifications,
    ]) {
      control.markAsPristine();
    }
  }

  private markReminderSettingsPristine(): void {
    for (const control of [
      this.paymentRemindersEnabled,
      this.reminderChannel,
      this.reminderSmsFallback,
    ]) {
      control.markAsPristine();
    }
  }

  private clearMessage(key: string): void {
    this.messages.update(messages => {
      const next = new Map(messages);
      next.delete(key);
      return next;
    });
  }

  private sameReminderDrafts(left: ReminderDraft[], right: ReminderDraft[]): boolean {
    return (
      left.length === right.length &&
      left.every(
        (draft, index) =>
          draft.key === right[index]?.key &&
          draft.stageDays === right[index]?.stageDays &&
          draft.enabled === right[index]?.enabled
      )
    );
  }

  private reminderDraft(stageDays: number, enabled: boolean, key: string): ReminderDraft {
    return {
      stageDays,
      enabled,
      key,
    };
  }

  protected reminderStageLabel(days: number): string {
    return days === 0 ? 'Due today' : `${days} days overdue`;
  }

  protected setReminderStageEnabled(key: string, event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.reminderDrafts.update(rows =>
      rows.map(row => (row.key === key ? { ...row, enabled } : row))
    );
  }
}

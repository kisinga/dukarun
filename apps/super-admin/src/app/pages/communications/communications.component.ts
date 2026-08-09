import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  CampaignRow,
  Company,
  FailedOutboxRow,
  MessageTemplateRow,
  PlatformCommunicationSettings,
  PlatformCampaignPreview,
  PlatformService,
  Tier,
} from '../../core/platform.service';
import { DataTableShellComponent } from '../../shared/ui/data-table-shell.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-communications',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FormFieldComponent,
    DataTableShellComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-page-header
      title="Communications"
      subtitle="Campaigns from Dukarun to merchant administrators"
    />
    @if (error()) {
      <div class="alert alert-error mb-4">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4">{{ notice() }}</div>
    }

    <section class="card mb-5 bg-base-100">
      <div class="card-body flex flex-row items-start justify-between gap-4 p-4">
        <div>
          <h2 class="type-heading">External messaging</h2>
          <p class="type-caption mt-1 max-w-2xl">
            Master control for automated customer reminders and manually reviewed receipts,
            invoices, proformas and purchase orders across every company. Security messages and
            merchant-admin campaigns are unaffected.
          </p>
          @if (!communicationSettings()?.external_messaging_enabled) {
            <p class="mt-2 text-sm font-medium text-error">Paused across all companies</p>
          }
        </div>
        <input
          type="checkbox"
          class="toggle toggle-primary"
          [checked]="communicationSettings()?.external_messaging_enabled ?? false"
          [disabled]="busy() || !communicationSettings()"
          (change)="toggleExternalMessaging($event)"
          aria-label="Enable external messaging"
        />
      </div>
    </section>

    <section class="card mb-5 bg-base-100">
      <form class="card-body grid gap-4 p-4" (submit)="$event.preventDefault(); send()">
        <div>
          <h2 class="type-heading">New campaign</h2>
          <p class="type-caption mt-1">
            Platform messages use platform delivery capacity, never tenant quota.
          </p>
        </div>
        <div class="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <app-form-field
            label="Template"
            hint="Variables: merchant_name, tier, subscription_state, subscription_end_date"
          >
            <select class="select select-bordered w-full" [formControl]="templateId">
              @for (template of templates(); track template.id) {
                <option [value]="template.id">{{ template.name }} · v{{ template.version }}</option>
              }
            </select>
          </app-form-field>
          <button type="button" class="btn btn-outline min-h-11" (click)="applyTemplate()">
            Apply
          </button>
          <button
            type="button"
            class="btn btn-outline min-h-11"
            [disabled]="!templateId.value || !valid()"
            (click)="saveTemplate()"
          >
            Save template
          </button>
        </div>
        <div class="grid gap-3 md:grid-cols-3">
          <app-form-field label="Campaign name" [required]="true"
            ><input class="input input-bordered w-full" [formControl]="name"
          /></app-form-field>
          <app-form-field label="Channel" [required]="true">
            <select class="select select-bordered w-full" [formControl]="channel">
              <option value="in_app">In-app</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </app-form-field>
          <app-form-field label="Audience" [required]="true">
            <select class="select select-bordered w-full" [formControl]="audience">
              <option value="all">All approved companies</option>
              <option value="tier">Specific tier</option>
              <option value="subscription_status">Subscription status</option>
              <option value="selected">Selected companies</option>
            </select>
          </app-form-field>
        </div>
        @if (audience.value === 'tier') {
          <app-form-field label="Tier"
            ><select class="select select-bordered w-full max-w-md" [formControl]="tierId">
              @for (tier of tiers(); track tier.id) {
                <option [value]="tier.id">{{ tier.name }}</option>
              }
            </select></app-form-field
          >
        }
        @if (audience.value === 'subscription_status') {
          <app-form-field label="Subscription status"
            ><select
              class="select select-bordered w-full max-w-md"
              [formControl]="subscriptionStatus"
            >
              <option value="trial">Trial</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select></app-form-field
          >
        }
        @if (audience.value === 'selected') {
          <div class="rounded-box border border-base-300 p-3">
            <p class="font-medium">Choose companies</p>
            <div class="mt-2 grid max-h-48 gap-1 overflow-y-auto md:grid-cols-2">
              @for (company of companies(); track company.id) {
                <label
                  class="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 hover:bg-base-200"
                >
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [checked]="selectedCompanyIds().includes(company.id)"
                    (change)="toggleCompany(company.id, $event)"
                  />
                  <span>{{ company.name }}</span>
                </label>
              }
            </div>
          </div>
        }
        <app-form-field label="Title" [required]="true"
          ><input class="input input-bordered w-full" [formControl]="title"
        /></app-form-field>
        <app-form-field label="Message" [required]="true">
          <textarea
            rows="4"
            class="textarea textarea-bordered w-full"
            [formControl]="body"
          ></textarea>
        </app-form-field>
        @if (preview(); as p) {
          <div class="rounded-box bg-base-200 p-3 text-sm">
            <strong>{{ p.eligible }}</strong> eligible · {{ p.skipped }} skipped ·
            {{ p.total }} total
          </div>
        }
        <div class="flex gap-2">
          <button
            type="button"
            class="btn btn-outline min-h-11"
            [disabled]="busy() || !valid()"
            (click)="previewCampaign()"
          >
            Preview
          </button>
          <button
            type="submit"
            class="btn btn-primary min-h-11"
            [disabled]="busy() || !preview() || !valid()"
          >
            {{ busy() ? 'Sending…' : 'Send now' }}
          </button>
        </div>
      </form>
    </section>

    <app-data-table-shell title="Campaign history">
      <table class="table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Channel</th>
            <th>Status</th>
            <th class="text-right">Recipients</th>
            <th class="text-right">Sent</th>
            <th class="text-right">Failed</th>
          </tr>
        </thead>
        <tbody>
          @for (item of campaigns(); track item.id) {
            <tr>
              <td>
                <strong>{{ item.name }}</strong>
                <p class="type-caption">{{ date(item.created_at) }}</p>
              </td>
              <td>{{ item.channel }}</td>
              <td>
                <app-status-badge
                  size="sm"
                  [type]="
                    item.status === 'completed'
                      ? 'success'
                      : item.status === 'failed'
                        ? 'error'
                        : 'warning'
                  "
                  [label]="item.status"
                />
              </td>
              <td class="text-right">{{ item.recipient_count }}</td>
              <td class="text-right">{{ item.sent_count }}</td>
              <td class="text-right">{{ item.failed_count }}</td>
            </tr>
          }
        </tbody>
      </table>
    </app-data-table-shell>

    <div class="mt-5">
      <app-data-table-shell
        title="Delivery health"
        [description]="failedDeliveries().length + ' recent failed deliveries'"
      >
        <table class="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Channel</th>
              <th>Recipient</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            @for (item of failedDeliveries(); track item.id) {
              <tr>
                <td>{{ item.companies?.name ?? 'Unknown' }}</td>
                <td>{{ item.channel }}</td>
                <td>{{ item.recipient }}</td>
                <td class="max-w-md text-error">{{ item.error }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="text-center text-base-content/60">
                  No recent delivery failures.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </app-data-table-shell>
    </div>
  `,
})
export class CommunicationsComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly campaigns = signal<CampaignRow[]>([]);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly selectedCompanyIds = signal<string[]>([]);
  protected readonly templates = signal<MessageTemplateRow[]>([]);
  protected readonly failedDeliveries = signal<FailedOutboxRow[]>([]);
  protected readonly communicationSettings = signal<PlatformCommunicationSettings | null>(null);
  protected readonly preview = signal<PlatformCampaignPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly title = new FormControl('', { nonNullable: true });
  protected readonly body = new FormControl('', { nonNullable: true });
  protected readonly channel = new FormControl<'in_app' | 'sms' | 'whatsapp'>('in_app', {
    nonNullable: true,
  });
  protected readonly audience = new FormControl<
    'all' | 'tier' | 'subscription_status' | 'selected'
  >('all', { nonNullable: true });
  protected readonly tierId = new FormControl('', { nonNullable: true });
  protected readonly subscriptionStatus = new FormControl('active', { nonNullable: true });
  protected readonly templateId = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    const [campaigns, tiers, templates, failedDeliveries, companies, communicationSettings] =
      await Promise.all([
        this.platform.platformCampaigns(),
        this.platform.tiers(),
        this.platform.platformTemplates(),
        this.platform.failedOutbox(),
        this.platform.companies(),
        this.platform.communicationSettings(),
      ]);
    this.campaigns.set(campaigns);
    this.tiers.set(tiers);
    this.templates.set(templates);
    this.failedDeliveries.set(failedDeliveries);
    this.companies.set(companies);
    this.communicationSettings.set(communicationSettings);
    this.tierId.setValue(tiers[0]?.id ?? '');
    this.templateId.setValue(templates[0]?.id ?? '');
  }
  protected async toggleExternalMessaging(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const enabled = input.checked;
    if (
      !enabled &&
      !window.confirm(
        'Pause controlled external messaging across every company? Pending controlled messages will be cancelled.'
      )
    ) {
      input.checked = true;
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const cancelled = await this.platform.setExternalMessaging(enabled);
      this.communicationSettings.set(await this.platform.communicationSettings());
      this.notice.set(
        enabled
          ? 'External messaging enabled across the platform.'
          : `External messaging paused${cancelled ? `; ${cancelled} pending message(s) cancelled` : ''}.`
      );
    } catch (e) {
      input.checked = !enabled;
      this.error.set(e instanceof Error ? e.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected valid(): boolean {
    return (
      !!this.name.value.trim() &&
      !!this.title.value.trim() &&
      !!this.body.value.trim() &&
      (this.audience.value !== 'selected' || this.selectedCompanyIds().length > 0)
    );
  }
  private input() {
    return {
      channel: this.channel.value,
      audience: this.audience.value,
      ...(this.audience.value === 'tier' ? { tierId: this.tierId.value } : {}),
      ...(this.audience.value === 'subscription_status'
        ? { subscriptionStatus: this.subscriptionStatus.value }
        : {}),
      ...(this.audience.value === 'selected' ? { companyIds: this.selectedCompanyIds() } : {}),
    };
  }
  protected async previewCampaign(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.preview.set(await this.platform.previewCampaign(this.input()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected async send(): Promise<void> {
    if (!this.preview()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.platform.sendCampaign({
        name: this.name.value.trim(),
        title: this.title.value.trim(),
        body: this.body.value.trim(),
        ...this.input(),
      });
      this.notice.set(`Campaign queued for ${result.queued}; ${result.skipped} skipped`);
      this.preview.set(null);
      this.name.setValue('');
      this.title.setValue('');
      this.body.setValue('');
      this.campaigns.set(await this.platform.platformCampaigns());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Send failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected applyTemplate(): void {
    const template = this.templates().find(item => item.id === this.templateId.value);
    if (!template) return;
    this.title.setValue(
      this.channel.value === 'in_app' ? (template.in_app_title ?? template.name) : template.name
    );
    this.body.setValue(
      this.channel.value === 'sms'
        ? (template.sms_body ?? '')
        : this.channel.value === 'whatsapp'
          ? (template.whatsapp_body ?? '')
          : (template.in_app_body ?? '')
    );
    this.preview.set(null);
  }
  protected async saveTemplate(): Promise<void> {
    const template = this.templates().find(item => item.id === this.templateId.value);
    if (!template) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.platform.savePlatformTemplate({
        id: template.id,
        name: template.name,
        smsBody: this.channel.value === 'sms' ? this.body.value.trim() : (template.sms_body ?? ''),
        whatsappBody:
          this.channel.value === 'whatsapp'
            ? this.body.value.trim()
            : (template.whatsapp_body ?? ''),
        inAppTitle:
          this.channel.value === 'in_app' ? this.title.value.trim() : (template.in_app_title ?? ''),
        inAppBody:
          this.channel.value === 'in_app' ? this.body.value.trim() : (template.in_app_body ?? ''),
      });
      this.templates.set(await this.platform.platformTemplates());
      this.notice.set('Template saved.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Template save failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected toggleCompany(companyId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedCompanyIds.update(ids =>
      checked ? [...ids, companyId] : ids.filter(id => id !== companyId)
    );
    this.preview.set(null);
  }
  protected date(value: string): string {
    return new Date(value).toLocaleString('en-KE');
  }
}

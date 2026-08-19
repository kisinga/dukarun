import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import {
  CampaignRow,
  Company,
  FailedOutboxRow,
  MessageTemplateRow,
  PlatformCampaignMetrics,
  PlatformCampaignPreview,
  PlatformCommunicationSettings,
  PlatformExternalMetrics,
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
      subtitle="Campaigns from Dukarun to one primary administrator per company"
    />
    @if (error()) {
      <div class="alert alert-error mb-4" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert alert-success mb-4" role="status">{{ notice() }}</div>
    }

    <section class="card mb-5 bg-base-100">
      <div class="card-body flex flex-row items-start justify-between gap-4 p-4">
        <div>
          <h2 class="type-heading">External messaging</h2>
          <p class="type-caption mt-1 max-w-2xl">
            Master control for reminders and reviewed business documents. Security messages and
            merchant-admin campaigns remain available.
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

    @if (externalMetrics(); as metrics) {
      <section
        class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"
        aria-label="External communication metrics for the last 30 days"
      >
        @for (metric of externalMetricRows(metrics); track metric.label) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <span class="type-caption">{{ metric.label }}</span
              ><strong class="type-hero">{{ metric.value }}</strong>
            </div>
          </div>
        }
      </section>
    }

    <section class="card mb-5 bg-base-100">
      <form class="card-body grid gap-4 p-4" (submit)="$event.preventDefault(); review()">
        <div>
          <h2 class="type-heading">{{ draftId() ? 'Edit draft' : 'New campaign' }}</h2>
          <p class="type-caption mt-1">
            Plain text · platform delivery capacity · audience resolved at dispatch
          </p>
        </div>
        <div class="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <app-form-field
            label="Template"
            hint="merchant_name, tier, subscription_state, subscription_end_date"
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
            ><input maxlength="120" class="input input-bordered w-full" [formControl]="name"
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
                  ><input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [checked]="selectedCompanyIds().includes(company.id)"
                    (change)="toggleCompany(company.id, $event)"
                  /><span>{{ company.name }}</span></label
                >
              }
            </div>
          </div>
        }
        <app-form-field label="Title" [required]="true"
          ><input maxlength="120" class="input input-bordered w-full" [formControl]="title"
        /></app-form-field>
        <app-form-field label="Message" [required]="true" [hint]="messageHint()">
          <textarea
            maxlength="2000"
            rows="5"
            class="textarea textarea-bordered w-full"
            [formControl]="body"
          ></textarea>
        </app-form-field>
        @if (channel.value === 'in_app') {
          <div class="grid gap-3 md:grid-cols-2">
            <app-form-field label="Action label" hint="Optional; requires an app path"
              ><input
                maxlength="40"
                class="input input-bordered w-full"
                placeholder="View details"
                [formControl]="ctaLabel"
            /></app-form-field>
            <app-form-field label="App path" hint="Relative tenant-app path, for example /settings"
              ><input
                maxlength="500"
                class="input input-bordered w-full"
                placeholder="/notifications"
                [formControl]="ctaLink"
            /></app-form-field>
          </div>
        }
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="btn btn-outline min-h-11"
            [disabled]="busy() || !valid()"
            (click)="saveDraft()"
          >
            Save draft
          </button>
          <button type="submit" class="btn btn-primary min-h-11" [disabled]="busy() || !valid()">
            Review send
          </button>
          @if (draftId()) {
            <button type="button" class="btn btn-ghost min-h-11" (click)="clearComposer()">
              New campaign
            </button>
          }
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
            <th>Schedule</th>
            <th class="text-right">Recipients</th>
            <th class="text-right">Accepted / read</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (item of campaigns(); track item.id) {
            <tr>
              <td>
                <strong>{{ item.name }}</strong>
                <p class="type-caption">{{ date(item.created_at) }}</p>
              </td>
              <td>{{ channelLabel(item.channel) }}</td>
              <td>
                <app-status-badge
                  size="sm"
                  [type]="
                    item.status === 'completed'
                      ? 'success'
                      : item.status === 'failed' || item.status === 'cancelled'
                        ? 'error'
                        : 'warning'
                  "
                  [label]="item.status"
                />
              </td>
              <td>{{ item.scheduled_for ? date(item.scheduled_for) : 'Immediate' }}</td>
              <td class="text-right">{{ item.recipient_count }}</td>
              <td class="text-right">{{ item.sent_count }}</td>
              <td>
                <button class="btn btn-ghost btn-sm min-h-11" (click)="openDetails(item)">
                  Details
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="7" class="py-8 text-center text-base-content/60">No campaigns yet.</td>
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

    <dialog #reviewDialog class="modal">
      <div class="modal-box modal-box-task p-0 md:w-full md:max-w-2xl">
        <header class="border-b border-base-300 p-4">
          <h2 class="text-lg font-semibold">Review campaign</h2>
        </header>
        <div class="modal-body p-4">
          @if (preview(); as p) {
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div class="stat rounded-box bg-base-200 p-3">
                <span class="type-caption">Eligible</span
                ><strong class="text-xl">{{ p.eligible }}</strong>
              </div>
              <div class="stat rounded-box bg-base-200 p-3">
                <span class="type-caption">Skipped</span
                ><strong class="text-xl">{{ p.skipped }}</strong>
              </div>
              <div class="stat rounded-box bg-base-200 p-3">
                <span class="type-caption">No primary contact</span
                ><strong class="text-xl">{{ p.missing_primary }}</strong>
              </div>
              <div class="stat rounded-box bg-base-200 p-3">
                <span class="type-caption">No phone</span
                ><strong class="text-xl">{{ p.missing_phone }}</strong>
              </div>
            </div>
            <p class="type-caption mt-3">
              One selected primary contact per company. Scheduled audience resolves at dispatch.
            </p>
            <div class="mt-4 rounded-box border border-base-300 p-4">
              <p class="type-caption">
                Rendered sample · {{ p.sample?.merchant_name || 'No eligible merchant' }}
              </p>
              <strong class="mt-2 block">{{ renderedTitle() }}</strong>
              <p class="mt-2 whitespace-pre-wrap text-sm">{{ renderedBody() }}</p>
              @if (ctaLabel.value && ctaLink.value) {
                <span class="btn btn-primary btn-sm mt-3">{{ ctaLabel.value }}</span>
              }
            </div>
          }
          @if (channel.value !== 'in_app') {
            <div class="mt-4 rounded-box border border-base-300 p-3">
              <p class="font-medium">Optional real test</p>
              <div class="mt-2 flex gap-2">
                <input
                  class="input input-bordered min-w-0 flex-1"
                  placeholder="+254…"
                  [formControl]="testPhone"
                /><button
                  class="btn btn-outline"
                  [disabled]="busy() || !testPhone.value.trim()"
                  (click)="sendTest()"
                >
                  Send test
                </button>
              </div>
            </div>
          }
          <app-form-field class="mt-4 block" label="Schedule in EAT" hint="Leave empty to send now"
            ><input
              type="datetime-local"
              class="input input-bordered w-full"
              [formControl]="scheduledFor"
          /></app-form-field>
        </div>
        <footer class="flex justify-end gap-2 border-t border-base-300 p-4">
          <button class="btn btn-ghost" (click)="reviewDialog.close()">Back</button
          ><button class="btn btn-primary" [disabled]="busy() || !preview()" (click)="launch()">
            {{ scheduledFor.value ? 'Schedule campaign' : 'Send now' }}
          </button>
        </footer>
      </div>
      <form method="dialog" class="modal-backdrop"><button>Close</button></form>
    </dialog>

    <dialog #detailDialog class="modal">
      <div class="modal-box modal-box-task p-0 md:w-full md:max-w-2xl">
        @if (selectedCampaign(); as campaign) {
          <header class="border-b border-base-300 p-4">
            <h2 class="text-lg font-semibold">{{ campaign.name }}</h2>
            <p class="type-caption">
              {{ channelLabel(campaign.channel) }} · {{ campaign.audience }} ·
              {{ campaign.status }}
            </p>
          </header>
          <div class="modal-body p-4">
            <div class="rounded-box bg-base-200 p-4">
              <strong>{{ campaign.title }}</strong>
              <p class="mt-2 whitespace-pre-wrap text-sm">{{ campaign.body }}</p>
              @if (campaign.cta_label) {
                <p class="mt-2 text-sm text-primary">
                  {{ campaign.cta_label }} → {{ campaign.cta_link }}
                </p>
              }
            </div>
            @if (selectedMetrics(); as metrics) {
              <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                @for (metric of metricRows(metrics); track metric.label) {
                  <div class="rounded-box border border-base-300 p-3">
                    <span class="type-caption">{{ metric.label }}</span
                    ><strong class="block text-xl">{{ metric.value }}</strong>
                  </div>
                }
              </div>
            }
          </div>
          <footer class="flex flex-wrap justify-end gap-2 border-t border-base-300 p-4">
            @if (campaign.status === 'draft') {
              <button class="btn btn-primary" (click)="editSelected()">Edit draft</button>
            }
            @if (campaign.status === 'draft' || campaign.status === 'scheduled') {
              <button class="btn btn-error btn-outline" (click)="cancelSelected()">Cancel</button>
            }
            <button class="btn btn-outline" (click)="duplicateSelected()">Duplicate</button
            ><button class="btn" (click)="detailDialog.close()">Close</button>
          </footer>
        }
      </div>
      <form method="dialog" class="modal-backdrop"><button>Close</button></form>
    </dialog>
  `,
})
export class CommunicationsComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('reviewDialog') private reviewDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('detailDialog') private detailDialog?: ElementRef<HTMLDialogElement>;
  protected readonly campaigns = signal<CampaignRow[]>([]);
  protected readonly tiers = signal<Tier[]>([]);
  protected readonly companies = signal<Company[]>([]);
  protected readonly selectedCompanyIds = signal<string[]>([]);
  protected readonly templates = signal<MessageTemplateRow[]>([]);
  protected readonly failedDeliveries = signal<FailedOutboxRow[]>([]);
  protected readonly communicationSettings = signal<PlatformCommunicationSettings | null>(null);
  protected readonly externalMetrics = signal<PlatformExternalMetrics | null>(null);
  protected readonly preview = signal<PlatformCampaignPreview | null>(null);
  protected readonly selectedCampaign = signal<CampaignRow | null>(null);
  protected readonly selectedMetrics = signal<PlatformCampaignMetrics | null>(null);
  protected readonly draftId = signal<string | null>(null);
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
  protected readonly ctaLabel = new FormControl('', { nonNullable: true });
  protected readonly ctaLink = new FormControl('', { nonNullable: true });
  protected readonly scheduledFor = new FormControl('', { nonNullable: true });
  protected readonly testPhone = new FormControl('', { nonNullable: true });

  constructor() {
    merge(
      this.name.valueChanges,
      this.title.valueChanges,
      this.body.valueChanges,
      this.channel.valueChanges,
      this.audience.valueChanges,
      this.tierId.valueChanges,
      this.subscriptionStatus.valueChanges,
      this.ctaLabel.valueChanges,
      this.ctaLink.valueChanges
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.preview.set(null));
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }
  private async load(): Promise<void> {
    try {
      const [campaigns, tiers, templates, failed, companies, settings, externalMetrics] =
        await Promise.all([
          this.platform.platformCampaigns(),
          this.platform.tiers(),
          this.platform.platformTemplates(),
          this.platform.failedOutbox(),
          this.platform.companies(),
          this.platform.communicationSettings(),
          this.platform.externalCommunicationMetrics(),
        ]);
      this.campaigns.set(campaigns);
      this.tiers.set(tiers);
      this.templates.set(templates);
      this.failedDeliveries.set(failed);
      this.companies.set(companies);
      this.communicationSettings.set(settings);
      this.externalMetrics.set(externalMetrics);
      if (!this.tierId.value) this.tierId.setValue(tiers[0]?.id ?? '');
      if (!this.templateId.value) this.templateId.setValue(templates[0]?.id ?? '');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Communications could not load');
    }
  }

  private campaignInput() {
    return {
      id: this.draftId() ?? undefined,
      name: this.name.value.trim(),
      title: this.title.value.trim(),
      body: this.body.value.trim(),
      channel: this.channel.value,
      audience: this.audience.value,
      ...(this.audience.value === 'tier' ? { tierId: this.tierId.value } : {}),
      ...(this.audience.value === 'subscription_status'
        ? { subscriptionStatus: this.subscriptionStatus.value }
        : {}),
      ...(this.audience.value === 'selected' ? { companyIds: this.selectedCompanyIds() } : {}),
      ...(this.channel.value === 'in_app' && this.ctaLabel.value.trim()
        ? { ctaLabel: this.ctaLabel.value.trim(), ctaLink: this.ctaLink.value.trim() }
        : {}),
    };
  }
  protected valid(): boolean {
    const ctaValid =
      this.channel.value !== 'in_app' ||
      (!this.ctaLabel.value.trim() && !this.ctaLink.value.trim()) ||
      (!!this.ctaLabel.value.trim() && /^\/(?!\/)[^\\\x00-\x1f]*$/.test(this.ctaLink.value.trim()));
    return (
      !!this.name.value.trim() &&
      !!this.title.value.trim() &&
      !!this.body.value.trim() &&
      (this.audience.value !== 'selected' || this.selectedCompanyIds().length > 0) &&
      ctaValid
    );
  }
  protected messageHint(): string {
    return this.channel.value === 'sms'
      ? `${this.body.value.length} characters · ${this.smsSegments()} segment(s)`
      : `${this.body.value.length}/2000 characters`;
  }
  private smsSegments(): number {
    const n = this.body.value.length;
    return n <= 160 ? 1 : Math.ceil(n / 153);
  }

  protected async saveDraft(showNotice = true): Promise<string | null> {
    if (!this.valid()) return null;
    this.busy.set(true);
    this.error.set(null);
    try {
      const id = await this.platform.saveCampaignDraft(this.campaignInput());
      this.draftId.set(id);
      if (showNotice) this.notice.set('Draft saved.');
      await this.load();
      return id;
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Draft save failed');
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  protected async review(): Promise<void> {
    if (!this.valid()) return;
    const id = await this.saveDraft(false);
    if (!id) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.preview.set(await this.platform.reviewCampaign(id));
      this.reviewDialog?.nativeElement.showModal();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected async launch(): Promise<void> {
    const id = this.draftId();
    if (!this.preview() || !id) return;
    let schedule: string | undefined;
    if (this.scheduledFor.value) {
      const scheduledDate = new Date(`${this.scheduledFor.value}:00+03:00`);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        this.error.set('Schedule must be a future EAT time.');
        return;
      }
      schedule = scheduledDate.toISOString();
    }
    this.busy.set(true);
    try {
      await this.platform.launchCampaign(id, schedule);
      this.notice.set(schedule ? 'Campaign scheduled.' : 'Campaign dispatched.');
      this.reviewDialog?.nativeElement.close();
      this.clearComposer();
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Campaign launch failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected async sendTest(): Promise<void> {
    if (this.channel.value === 'in_app' || !this.testPhone.value.trim()) return;
    this.busy.set(true);
    try {
      await this.platform.testExternalMessage({
        channel: this.channel.value,
        recipient: this.testPhone.value.trim(),
        body: this.renderedBody(),
      });
      this.notice.set('Test accepted by provider.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Test failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected renderedTitle(): string {
    return this.render(this.title.value);
  }
  protected renderedBody(): string {
    return this.render(this.body.value);
  }
  private render(value: string): string {
    const sample = this.preview()?.sample;
    return value.replace(
      /{{\s*(merchant_name|tier|subscription_state|subscription_end_date)\s*}}/g,
      (_m, key: keyof NonNullable<PlatformCampaignPreview['sample']>) =>
        sample?.[key] ?? `{{${key}}}`
    );
  }
  protected toggleCompany(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedCompanyIds.update(ids =>
      checked ? [...ids, id] : ids.filter(item => item !== id)
    );
    this.preview.set(null);
  }
  protected applyTemplate(): void {
    const t = this.templates().find(item => item.id === this.templateId.value);
    if (!t) return;
    this.title.setValue(this.channel.value === 'in_app' ? (t.in_app_title ?? t.name) : t.name);
    this.body.setValue(
      this.channel.value === 'sms'
        ? (t.sms_body ?? '')
        : this.channel.value === 'whatsapp'
          ? (t.whatsapp_body ?? '')
          : (t.in_app_body ?? '')
    );
  }
  protected async saveTemplate(): Promise<void> {
    const t = this.templates().find(item => item.id === this.templateId.value);
    if (!t) return;
    this.busy.set(true);
    try {
      await this.platform.savePlatformTemplate({
        id: t.id,
        name: t.name,
        smsBody: this.channel.value === 'sms' ? this.body.value.trim() : (t.sms_body ?? ''),
        whatsappBody:
          this.channel.value === 'whatsapp' ? this.body.value.trim() : (t.whatsapp_body ?? ''),
        inAppTitle:
          this.channel.value === 'in_app' ? this.title.value.trim() : (t.in_app_title ?? ''),
        inAppBody: this.channel.value === 'in_app' ? this.body.value.trim() : (t.in_app_body ?? ''),
      });
      this.templates.set(await this.platform.platformTemplates());
      this.notice.set('Template saved.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Template save failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected clearComposer(): void {
    this.draftId.set(null);
    this.name.setValue('');
    this.title.setValue('');
    this.body.setValue('');
    this.ctaLabel.setValue('');
    this.ctaLink.setValue('');
    this.scheduledFor.setValue('');
    this.selectedCompanyIds.set([]);
    this.preview.set(null);
  }

  protected async openDetails(item: CampaignRow): Promise<void> {
    this.selectedCampaign.set(item);
    this.selectedMetrics.set(null);
    this.detailDialog?.nativeElement.showModal();
    try {
      this.selectedMetrics.set(await this.platform.campaignMetrics(item.id));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Metrics failed');
    }
  }
  protected metricRows(m: PlatformCampaignMetrics) {
    return [
      { label: 'Targeted', value: m.targeted },
      { label: 'Skipped', value: m.skipped },
      { label: 'Queued', value: m.queued },
      { label: 'Provider accepted', value: m.provider_accepted },
      { label: 'Failed', value: m.failed },
      { label: 'Read', value: m.read },
      { label: 'CTA clicks', value: m.clicked },
    ];
  }
  protected externalMetricRows(m: PlatformExternalMetrics) {
    return [
      { label: 'Provider accepted · 30d', value: m.provider_accepted },
      { label: 'Pending · 30d', value: m.pending },
      { label: 'Failed · 30d', value: m.failed },
      { label: 'Links opened · sent 30d', value: m.documents_opened },
      { label: 'Opens · links sent 30d', value: m.link_opens },
    ];
  }
  protected async cancelSelected(): Promise<void> {
    const c = this.selectedCampaign();
    if (!c || !window.confirm(`Cancel ${c.name}?`)) return;
    try {
      await this.platform.cancelCampaign(c.id);
      this.detailDialog?.nativeElement.close();
      await this.load();
      this.notice.set('Campaign cancelled.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Cancel failed');
    }
  }
  protected editSelected(): void {
    const c = this.selectedCampaign();
    if (!c || c.status !== 'draft') return;
    this.detailDialog?.nativeElement.close();
    this.editDraft(c);
  }
  protected async duplicateSelected(): Promise<void> {
    const c = this.selectedCampaign();
    if (!c) return;
    try {
      const id = await this.platform.duplicateCampaign(c.id);
      this.detailDialog?.nativeElement.close();
      await this.load();
      const copy = this.campaigns().find(item => item.id === id);
      if (copy) this.editDraft(copy);
      this.notice.set('Draft duplicated.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Duplicate failed');
    }
  }
  private editDraft(c: CampaignRow): void {
    this.draftId.set(c.id);
    this.name.setValue(c.name);
    this.title.setValue(c.title ?? '');
    this.body.setValue(c.body);
    this.channel.setValue(c.channel as 'in_app' | 'sms' | 'whatsapp');
    this.audience.setValue(c.audience as 'all' | 'tier' | 'subscription_status' | 'selected');
    this.ctaLabel.setValue(c.cta_label ?? '');
    this.ctaLink.setValue(c.cta_link ?? '');
    const config = c.audience_config as Record<string, unknown>;
    this.tierId.setValue(String(config['tier_id'] ?? ''));
    this.subscriptionStatus.setValue(String(config['subscription_status'] ?? 'active'));
    this.selectedCompanyIds.set(
      Array.isArray(config['company_ids']) ? (config['company_ids'] as string[]) : []
    );
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
    try {
      const cancelled = await this.platform.setExternalMessaging(enabled);
      this.communicationSettings.set(await this.platform.communicationSettings());
      this.notice.set(
        enabled
          ? 'External messaging enabled.'
          : `External messaging paused${cancelled ? `; ${cancelled} pending cancelled` : ''}.`
      );
    } catch (e) {
      input.checked = !enabled;
      this.error.set(e instanceof Error ? e.message : 'Update failed');
    } finally {
      this.busy.set(false);
    }
  }
  protected channelLabel(value: string): string {
    return value === 'in_app' ? 'In-app' : value === 'sms' ? 'SMS' : 'WhatsApp';
  }
  protected date(value: string): string {
    return new Date(value).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  }
}

import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../core/supabase.service';
import { PermissionsService } from '../core/permissions.service';
import { LocationContextService } from '../core/location-context.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { PrintService } from '../shared/print/print.service';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import type { MpesaCommissioningStatus } from '@dukarun/mpesa-types';

type MerchantStatus = {
  settings: {
    safaricom_authorization_email: string | null;
    dukarun_mpesa_contact_name: string;
    dukarun_mpesa_contact_email: string;
    dukarun_mpesa_contact_phone: string | null;
    mpesa_callback_base_url: string;
  };
  onboarding_requests: Array<{
    id: string;
    legal_name: string;
    status: string;
    shortcode: string;
    shortcode_type: string;
    mpesa_username: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    existing_c2b_integration: boolean;
    existing_c2b_notes: string | null;
    prepared_daraja_app_id: string | null;
    prepared_daraja_app_name: string | null;
    prepared_daraja_app_environment: string | null;
    safaricom_authorization_verified_at: string | null;
    ledger_account_code: string | null;
    ledger_account_name: string | null;
    commissioning: MpesaCommissioningStatus;
  }>;
  accounts: Array<{
    id: string;
    status: string;
    environment: string;
    organization_shortcode: string;
    party_b: string;
    activated_at: string | null;
    manual_fallback_until: string | null;
    ledger_account_code: string | null;
    ledger_account_name: string | null;
    oauth_verified: boolean;
    c2b_registered: boolean;
    stk_test_passed: boolean;
    c2b_test_passed: boolean;
  }>;
};

const DEFAULT_MPESA_SETTINGS: MerchantStatus['settings'] = {
  safaricom_authorization_email: null,
  dukarun_mpesa_contact_name: 'Dukarun M-PESA Operations',
  dukarun_mpesa_contact_email: 'hello@dukarun.com',
  dukarun_mpesa_contact_phone: null,
  mpesa_callback_base_url: 'https://supa.dukarun.com/functions/v1',
};

@Component({
  selector: 'app-mpesa-settings',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    StatusBadgeComponent,
  ],
  template: `
    @if (perms.has('ManageMpesaIntegration')) {
      <section [class.card]="!embedded()" [class.bg-base-100]="!embedded()">
        <div [class.card-body]="!embedded()" [class.p-4]="!embedded()" [class.p-0]="embedded()">
          @if (!embedded()) {
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="section-title">{{ setupTitle() }}</h2>
                <p class="type-caption mt-1">
                  {{ setupCaption() }}
                </p>
              </div>
              <button
                appButton
                variant="ghost"
                size="sm"
                [iconOnly]="true"
                type="button"
                [loading]="loading()"
                title="Refresh M-PESA status"
                aria-label="Refresh M-PESA status"
                (click)="load()"
              >
                <app-icon name="heroArrowPath" />
              </button>
            </div>
          }

          @if (loading()) {
            <div class="skeleton mt-4 h-20 w-full"></div>
          } @else if (loadError()) {
            <p class="mt-3 text-sm text-error">{{ loadError() }}</p>
            <button appButton variant="outline" size="sm" class="mt-2" (click)="load()">
              Retry
            </button>
          } @else {
            @if (message()) {
              <p
                role="status"
                class="mt-3 text-sm"
                [class.text-error]="failed()"
                [class.text-success]="!failed()"
              >
                {{ message() }}
              </p>
            }

            @for (connection of connections(); track connection.id) {
              <article class="mt-4 rounded-box border border-base-300 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold capitalize">
                      {{ connection.environment }} {{ connection.organization_shortcode }}
                    </p>
                    <p class="type-caption mt-1">
                      Payments settle directly to {{ connection.party_b }}.
                    </p>
                  </div>
                  <app-status-badge
                    [type]="connectionStatusType(connection.status)"
                    [label]="statusLabel(connection.status)"
                  />
                </div>

                <ol class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <li
                    class="flex items-center gap-1"
                    [class.text-success]="connection.oauth_verified"
                  >
                    @if (connection.oauth_verified) {
                      <app-icon name="heroCheck" size="sm" />
                    } @else {
                      <span>1.</span>
                    }
                    Daraja credentials verified
                  </li>
                  <li
                    class="flex items-center gap-1"
                    [class.text-success]="connection.c2b_registered"
                  >
                    @if (connection.c2b_registered) {
                      <app-icon name="heroCheck" size="sm" />
                    } @else {
                      <span>2.</span>
                    }
                    Payment notifications connected
                  </li>
                  <li
                    class="flex items-center gap-1"
                    [class.text-success]="connection.stk_test_passed"
                  >
                    @if (connection.stk_test_passed) {
                      <app-icon name="heroCheck" size="sm" />
                    } @else {
                      <span>3.</span>
                    }
                    KES 1 STK test received
                  </li>
                  <li
                    class="flex items-center gap-1"
                    [class.text-success]="connection.c2b_test_passed"
                  >
                    @if (connection.c2b_test_passed) {
                      <app-icon name="heroCheck" size="sm" />
                    } @else {
                      <span>4.</span>
                    }
                    KES 1 direct payment received
                  </li>
                  <li
                    class="flex items-center gap-1"
                    [class.text-success]="connection.status === 'active'"
                  >
                    @if (connection.status === 'active') {
                      <app-icon name="heroCheck" size="sm" />
                    } @else {
                      <span>5.</span>
                    }
                    Live at checkout
                  </li>
                </ol>

                <div
                  class="mt-4 rounded-box bg-base-200/60 p-3 text-sm"
                  [class.text-success]="connection.status === 'active'"
                >
                  {{ connectionGuidance(connection) }}
                </div>

                <details class="mt-4 text-sm">
                  <summary class="cursor-pointer font-medium">Access and safety</summary>
                  <div class="mt-2 rounded-box bg-base-200/60 p-3">
                    <p>
                      Dukarun can send STK prompts, receive payment notifications and check STK
                      status.
                    </p>
                    <p class="mt-2">
                      Dukarun cannot withdraw funds, view balances, send B2C/B2B payments or access
                      your M-PESA portal.
                    </p>
                  </div>
                </details>

                @if (connection.manual_fallback_until) {
                  <p class="mt-3 text-sm text-warning">
                    Receipt fallback ends
                    {{ connection.manual_fallback_until | date: 'medium' }}.
                  </p>
                }
              </article>
            }

            @for (request of pendingRequests(); track request.shortcode) {
              <article class="mt-4 rounded-box border border-base-300 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold capitalize">
                      {{ request.shortcode_type }} {{ request.shortcode }}
                    </p>
                    <p class="type-caption mt-1">Setup request</p>
                  </div>
                  <app-status-badge type="warning" [label]="statusLabel(request.status)" />
                </div>
                <p class="mt-3 text-sm">{{ requestGuidance(request) }}</p>
                <ol class="steps steps-horizontal mt-4 w-full text-xs">
                  <li class="step step-primary">Request</li>
                  <li
                    class="step"
                    [class.step-primary]="request.commissioning.checks.safaricom_authorized"
                  >
                    Authorize
                  </li>
                  <li
                    class="step"
                    [class.step-primary]="request.commissioning.checks.connection_configured"
                  >
                    Connect
                  </li>
                  <li
                    class="step"
                    [class.step-primary]="
                      request.commissioning.checks.stk_test_passed &&
                      request.commissioning.checks.direct_payment_test_passed
                    "
                  >
                    Test
                  </li>
                  <li class="step" [class.step-primary]="request.commissioning.checks.active">
                    Live
                  </li>
                </ol>
                @if (authorizationReady(request) && !request.safaricom_authorization_verified_at) {
                  <div class="mt-4 border-t border-base-300 pt-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p class="font-semibold">Safaricom authorization</p>
                        <p class="type-caption mt-1">
                          The business owner sends this request. Dukarun is only the technical
                          provider for payment requests and payment validation.
                        </p>
                      </div>
                      <app-status-badge type="info" label="Owner action" />
                    </div>
                    <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt class="type-caption">Business</dt>
                        <dd class="font-medium">{{ request.legal_name }}</dd>
                      </div>
                      <div>
                        <dt class="type-caption">Shortcode</dt>
                        <dd class="font-medium capitalize">
                          {{ request.shortcode_type }} {{ request.shortcode }}
                        </dd>
                      </div>
                      <div>
                        <dt class="type-caption">Daraja app</dt>
                        <dd class="font-medium">{{ request.prepared_daraja_app_name }}</dd>
                      </div>
                      <div>
                        <dt class="type-caption">Dukarun technical contact</dt>
                        <dd class="font-medium">
                          {{ mpesaSettings().dukarun_mpesa_contact_email }}
                        </dd>
                      </div>
                    </dl>
                    <p class="mt-3 text-sm">
                      Requested access: STK Push, STK Query, C2B validation and confirmation for
                      this shortcode only.
                    </p>
                    @if (request.existing_c2b_integration) {
                      <p class="mt-3 text-sm text-warning">
                        You said this shortcode already sends C2B notifications elsewhere. Ask
                        Safaricom how the callback change affects that system before switching.
                      </p>
                    }
                    @if (!safaricomEmailConfigured()) {
                      <p class="mt-3 text-sm text-warning">
                        Safaricom recipient email is not configured yet. Download or print the
                        letter and use the contact Safaricom gives your business.
                      </p>
                    }
                    <div class="mt-4 flex flex-wrap gap-2">
                      <button
                        appButton
                        type="button"
                        [disabled]="!safaricomEmailConfigured()"
                        (click)="emailSafaricom(request)"
                      >
                        <app-icon name="heroEnvelope" /> Email Safaricom
                      </button>
                      <button
                        appButton
                        variant="outline"
                        type="button"
                        (click)="copyAuthorizationLetter(request)"
                      >
                        <app-icon name="heroClipboardDocumentList" /> Copy letter
                      </button>
                      <button
                        appButton
                        variant="outline"
                        type="button"
                        (click)="downloadAuthorizationLetter(request)"
                      >
                        <app-icon name="heroArrowDownTray" /> Download
                      </button>
                      <button
                        appButton
                        variant="outline"
                        type="button"
                        (click)="printAuthorizationLetter(request)"
                      >
                        <app-icon name="heroPrinter" /> Print
                      </button>
                    </div>
                  </div>
                } @else if (request.safaricom_authorization_verified_at) {
                  <p class="mt-4 border-t border-base-300 pt-4 text-sm text-success">
                    Safaricom authorization is recorded. Dukarun is connecting and testing the
                    approved shortcode.
                  </p>
                }
                <p class="mt-2 text-sm">
                  Never send Dukarun your OTP, M-PESA PIN or portal password.
                </p>
              </article>
            }

            @if (showRequestForm() || (!connections().length && !pendingRequests().length)) {
              <form
                class="grid gap-3 sm:grid-cols-2"
                [class.mt-3]="!embedded()"
                [class.border-t]="!embedded()"
                [class.border-base-300/60]="!embedded()"
                [class.pt-3]="!embedded()"
                (submit)="$event.preventDefault(); submit()"
              >
                @if (!embedded()) {
                  <div class="border-b border-base-300/60 pb-3 sm:col-span-2">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p class="font-medium">Missing Safaricom details?</p>
                        <p class="type-caption mt-1">
                          Ask Safaricom to confirm the account facts before sending setup.
                        </p>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          appButton
                          type="button"
                          variant="outline"
                          [disabled]="!safaricomEmailConfigured()"
                          (click)="emailSafaricomForIntake()"
                        >
                          <app-icon name="heroEnvelope" /> Email
                        </button>
                        <button
                          appButton
                          type="button"
                          variant="outline"
                          (click)="copyIntakeDetailsRequest()"
                        >
                          <app-icon name="heroClipboardDocumentList" /> Copy
                        </button>
                        <button
                          appButton
                          type="button"
                          variant="outline"
                          (click)="downloadIntakeDetailsRequest()"
                        >
                          <app-icon name="heroArrowDownTray" /> Download
                        </button>
                        <button
                          appButton
                          type="button"
                          variant="outline"
                          (click)="printIntakeDetailsRequest()"
                        >
                          <app-icon name="heroPrinter" /> Print
                        </button>
                      </div>
                    </div>
                    @if (!safaricomEmailConfigured()) {
                      <p class="mt-2 text-sm text-warning">
                        Safaricom recipient email is not configured yet. Download or print the
                        request and use the contact Safaricom gives your business.
                      </p>
                    }
                  </div>
                }

                <app-form-field
                  label="Registered business name"
                  [required]="true"
                  [error]="
                    legalName.touched && legalName.invalid
                      ? 'Enter the name registered with Safaricom.'
                      : null
                  "
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    [formControl]="legalName"
                    autocomplete="organization"
                  />
                </app-form-field>
                <app-form-field label="Account type">
                  <select
                    class="select select-bordered select-sm w-full"
                    [formControl]="shortcodeType"
                  >
                    <option value="till">Till</option>
                    <option value="paybill">Paybill</option>
                  </select>
                </app-form-field>
                <app-form-field
                  label="Till / Paybill number"
                  [required]="true"
                  [error]="shortcode.touched && shortcode.invalid ? 'Use 5–10 digits.' : null"
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    inputmode="numeric"
                    [formControl]="shortcode"
                  />
                </app-form-field>
                <app-form-field
                  label="M-PESA portal username"
                  hint="Business Admin or Business Manager username—not your password."
                  [required]="true"
                  [error]="
                    mpesaUsername.touched && mpesaUsername.invalid
                      ? 'Enter the portal username.'
                      : null
                  "
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    [formControl]="mpesaUsername"
                    autocomplete="off"
                  />
                </app-form-field>
                <app-form-field
                  label="Contact person"
                  [required]="true"
                  [error]="
                    contactName.touched && contactName.invalid ? 'Enter a contact person.' : null
                  "
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    [formControl]="contactName"
                    autocomplete="name"
                  />
                </app-form-field>
                <app-form-field
                  label="Contact phone"
                  [required]="true"
                  [error]="
                    contactPhone.touched && contactPhone.invalid ? 'Enter a contact phone.' : null
                  "
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    inputmode="tel"
                    [formControl]="contactPhone"
                    autocomplete="tel"
                  />
                </app-form-field>
                <app-form-field
                  label="Contact email"
                  [required]="true"
                  [error]="
                    contactEmail.touched && contactEmail.invalid
                      ? 'Enter a valid email address.'
                      : null
                  "
                >
                  <input
                    class="input input-bordered input-sm w-full"
                    type="email"
                    [formControl]="contactEmail"
                    autocomplete="email"
                  />
                </app-form-field>
                <app-form-field label="Notes" hint="Optional store or Safaricom account details.">
                  <input class="input input-bordered input-sm w-full" [formControl]="notes" />
                </app-form-field>

                @if (embedded()) {
                  <details class="rounded-box border border-base-300/70 p-3 sm:col-span-2">
                    <summary class="cursor-pointer text-sm font-medium">
                      Need Safaricom to confirm details?
                    </summary>
                    <p class="type-caption mt-2">
                      Generate a request for the business owner or Safaricom contact.
                    </p>
                    @if (!safaricomEmailConfigured()) {
                      <p class="mt-2 text-sm text-warning">
                        Safaricom recipient email is not configured yet. Use download or print.
                      </p>
                    }
                    <div class="mt-3 flex flex-wrap gap-2">
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        [disabled]="!safaricomEmailConfigured()"
                        (click)="emailSafaricomForIntake()"
                      >
                        <app-icon name="heroEnvelope" /> Email
                      </button>
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        (click)="copyIntakeDetailsRequest()"
                      >
                        <app-icon name="heroClipboardDocumentList" /> Copy
                      </button>
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        (click)="downloadIntakeDetailsRequest()"
                      >
                        <app-icon name="heroArrowDownTray" /> Download
                      </button>
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        size="sm"
                        (click)="printIntakeDetailsRequest()"
                      >
                        <app-icon name="heroPrinter" /> Print
                      </button>
                    </div>
                  </details>
                }

                <div class="rounded-box bg-base-200/50 p-3 sm:col-span-2">
                  <label class="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-sm checkbox-primary mt-0.5"
                      [formControl]="existingC2bIntegration"
                    />
                    <span>
                      This Till/Paybill already sends payment notifications to another system.
                    </span>
                  </label>
                  @if (existingC2bIntegration.value) {
                    <app-form-field
                      class="mt-3 block"
                      label="Existing integration"
                      hint="Name the POS, ERP or website currently receiving C2B callbacks."
                    >
                      <input
                        class="input input-bordered input-sm w-full"
                        [formControl]="existingC2bNotes"
                      />
                    </app-form-field>
                  }
                </div>

                <fieldset class="border-t border-base-300/60 pt-3 sm:col-span-2">
                  <legend class="type-heading">Checkout locations</legend>
                  <p class="type-caption mt-1">Choose where cashiers can use this account.</p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    @for (location of locations.locations(); track location.id) {
                      <label
                        class="flex min-h-11 cursor-pointer items-center gap-2 rounded-field bg-base-200/50 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm checkbox-primary"
                          [checked]="locationSelected(location.id)"
                          (change)="toggleLocation(location.id, $any($event.target).checked)"
                        />
                        <span>{{ location.name }}</span>
                      </label>
                    } @empty {
                      <p class="type-caption py-2">Loading locations…</p>
                    }
                  </div>
                </fieldset>

                <p class="type-caption flex items-start gap-1.5 sm:col-span-2">
                  <app-icon name="heroLockClosed" size="sm" class="mt-0.5" />
                  <span>
                    We never ask for your M-PESA PIN, portal password or OTP. Enter an OTP only on
                    Safaricom’s own verification flow.
                  </span>
                </p>

                <div class="flex flex-wrap justify-end gap-2 sm:col-span-2">
                  @if (connections().length || pendingRequests().length) {
                    <button
                      appButton
                      type="button"
                      variant="ghost"
                      [disabled]="saving()"
                      (click)="showRequestForm.set(false)"
                    >
                      Cancel
                    </button>
                  }
                  <button appButton type="submit" [loading]="saving()">Send setup request</button>
                </div>
              </form>
            } @else {
              <button
                appButton
                variant="outline"
                type="button"
                class="mt-4"
                (click)="showRequestForm.set(true)"
              >
                Connect another Till or Paybill
              </button>
            }
          }
        </div>
      </section>
    }
  `,
})
export class MpesaSettingsComponent implements OnInit {
  readonly accountCode = input<string | null>(null);
  readonly accountName = input('');
  readonly embedded = input(false);
  readonly statusChanged = output<void>();
  private readonly supabase = inject(SupabaseService);
  private readonly print = inject(PrintService);
  protected readonly perms = inject(PermissionsService);
  protected readonly locations = inject(LocationContextService);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly status = signal<MerchantStatus | null>(null);
  protected readonly mpesaSettings = computed(
    () => this.status()?.settings ?? DEFAULT_MPESA_SETTINGS
  );
  protected readonly connections = computed(() => {
    const accountCode = this.accountCode();
    const accounts = this.status()?.accounts ?? [];
    return accountCode
      ? accounts.filter(account => account.ledger_account_code === accountCode)
      : accounts;
  });
  protected readonly pendingRequests = computed(() => {
    const accountCode = this.accountCode();
    return (
      this.status()?.onboarding_requests.filter(
        request =>
          ['requested', 'reviewing', 'merchant_verification'].includes(request.status) &&
          (!accountCode || request.ledger_account_code === accountCode)
      ) ?? []
    );
  });
  protected readonly showRequestForm = signal(false);

  protected readonly setupTitle = computed(() =>
    this.accountName() ? `${this.accountName()} setup` : 'M-PESA setup'
  );
  protected readonly setupCaption = computed(() =>
    this.accountCode()
      ? 'Connect this money account to a Safaricom Till or Paybill.'
      : 'Accept STK Push and automatically match Till or Paybill payments.'
  );

  protected readonly legalName = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly shortcodeType = new FormControl<'till' | 'paybill'>('till', {
    nonNullable: true,
  });
  protected readonly shortcode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{5,10}$/)],
  });
  protected readonly mpesaUsername = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly contactName = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly contactPhone = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly contactEmail = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly existingC2bIntegration = new FormControl(false, { nonNullable: true });
  protected readonly existingC2bNotes = new FormControl('', { nonNullable: true });
  protected readonly selectedLocationIds = signal<string[]>([]);

  ngOnInit(): void {
    void this.locations.load().then(() => {
      this.selectedLocationIds.set(this.locations.locations().map(location => location.id));
    });
    void this.load();
  }

  protected locationSelected(locationId: string): boolean {
    return this.selectedLocationIds().includes(locationId);
  }

  protected toggleLocation(locationId: string, selected: boolean): void {
    this.selectedLocationIds.update(current =>
      selected ? [...new Set([...current, locationId])] : current.filter(id => id !== locationId)
    );
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const { data, error } = await this.supabase.client.rpc('mpesa_setup_status');
    if (error) this.loadError.set(error.message);
    else this.status.set(data as unknown as MerchantStatus);
    this.loading.set(false);
  }

  protected async submit(): Promise<void> {
    const controls = [
      this.legalName,
      this.shortcode,
      this.mpesaUsername,
      this.contactName,
      this.contactPhone,
      this.contactEmail,
    ];
    controls.forEach(control => control.markAsTouched());
    if (controls.some(control => control.invalid)) {
      this.failed.set(true);
      this.message.set('Complete the required fields and check their format.');
      return;
    }
    if (this.selectedLocationIds().length === 0) {
      this.failed.set(true);
      this.message.set('Select at least one location.');
      return;
    }
    this.saving.set(true);
    this.message.set(null);
    this.failed.set(false);
    const { error } = await this.supabase.client.rpc('request_mpesa_onboarding', {
      p_legal_name: this.legalName.value,
      p_shortcode: this.shortcode.value,
      p_shortcode_type: this.shortcodeType.value,
      p_mpesa_username: this.mpesaUsername.value,
      p_contact_name: this.contactName.value,
      p_contact_phone: this.contactPhone.value,
      p_contact_email: this.contactEmail.value,
      p_location_ids: this.selectedLocationIds(),
      p_notes: this.notes.value || undefined,
      p_existing_c2b_integration: this.existingC2bIntegration.value,
      p_existing_c2b_notes: this.existingC2bNotes.value || undefined,
      p_ledger_account_code: this.accountCode() ?? undefined,
    });
    if (error) {
      this.failed.set(true);
      this.message.set(error.message);
    } else {
      this.message.set('Setup request sent.');
      this.showRequestForm.set(false);
      await this.load();
      this.statusChanged.emit();
    }
    this.saving.set(false);
  }

  protected statusLabel(value: string): string {
    return value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
  }

  protected connectionStatusType(value: string): BadgeType {
    if (value === 'active') return 'success';
    if (value === 'testing') return 'warning';
    if (value === 'configuring') return 'info';
    if (value === 'error') return 'error';
    return 'neutral';
  }

  protected connectionGuidance(connection: MerchantStatus['accounts'][number]): string {
    if (connection.status === 'active') return 'Live. Cashiers can use STK Push at checkout.';
    if (connection.environment !== 'production')
      return 'This is a sandbox connection. A production connection is required to go live.';
    if (!connection.oauth_verified || !connection.c2b_registered)
      return 'Dukarun is completing the secure Safaricom connection. No action is needed from you right now.';
    if (!connection.stk_test_passed)
      return 'Next: approve the KES 1 STK test when Dukarun sends it to the agreed phone.';
    if (!connection.c2b_test_passed)
      return `Next: pay KES 1 directly to ${connection.party_b} so Dukarun can confirm payment notifications.`;
    return 'All tests passed. Dukarun is completing final activation.';
  }

  protected requestGuidance(request: MerchantStatus['onboarding_requests'][number]): string {
    if (request.safaricom_authorization_verified_at)
      return 'Safaricom authorization has been confirmed. Dukarun is completing the secure connection.';
    if (this.authorizationReady(request))
      return 'Send the authorization request to Safaricom so they can connect your shortcode to the Dukarun Daraja app.';
    if (request.status === 'merchant_verification')
      return 'Dukarun is preparing the Daraja app details needed for the Safaricom authorization request.';
    if (request.status === 'reviewing') return 'Dukarun is reviewing your business details.';
    return 'Request received. Dukarun will prepare the tenant Daraja app after review.';
  }

  protected authorizationReady(request: MerchantStatus['onboarding_requests'][number]): boolean {
    return Boolean(request.prepared_daraja_app_id && request.prepared_daraja_app_name);
  }

  protected safaricomEmailConfigured(): boolean {
    return Boolean(this.mpesaSettings().safaricom_authorization_email?.trim());
  }

  protected intakeSubject(): string {
    return 'Request to confirm M-PESA business account details';
  }

  protected intakeMailto(): string | null {
    return this.safaricomMailto(this.intakeSubject(), this.intakeDetailsRequest());
  }

  protected emailSafaricomForIntake(): void {
    const href = this.intakeMailto();
    if (!href) {
      this.failed.set(true);
      this.message.set('Safaricom recipient email is not configured.');
      return;
    }
    window.location.href = href;
  }

  protected async copyIntakeDetailsRequest(): Promise<void> {
    await this.copyText(
      this.intakeDetailsRequest(),
      'Safaricom details request copied.',
      'Copy failed. Download the request instead.'
    );
  }

  protected downloadIntakeDetailsRequest(): void {
    this.downloadText(
      'mpesa-business-details-request.txt',
      this.intakeDetailsRequest(),
      'Safaricom details request downloaded.'
    );
  }

  protected async printIntakeDetailsRequest(): Promise<void> {
    await this.printTextDocument(
      this.intakeSubject(),
      this.intakeDetailsRequest(),
      'Safaricom details request ready to print.'
    );
  }

  protected authorizationSubject(request: MerchantStatus['onboarding_requests'][number]): string {
    return `Authorization to connect ${request.shortcode_type} ${request.shortcode} to Dukarun Daraja app`;
  }

  protected authorizationMailto(
    request: MerchantStatus['onboarding_requests'][number]
  ): string | null {
    return this.safaricomMailto(
      this.authorizationSubject(request),
      this.authorizationLetter(request)
    );
  }

  protected emailSafaricom(request: MerchantStatus['onboarding_requests'][number]): void {
    const href = this.authorizationMailto(request);
    if (!href) {
      this.failed.set(true);
      this.message.set('Safaricom recipient email is not configured.');
      return;
    }
    window.location.href = href;
  }

  protected async copyAuthorizationLetter(
    request: MerchantStatus['onboarding_requests'][number]
  ): Promise<void> {
    await this.copyText(
      this.authorizationLetter(request),
      'Authorization letter copied.',
      'Copy failed. Download the letter instead.'
    );
  }

  protected downloadAuthorizationLetter(
    request: MerchantStatus['onboarding_requests'][number]
  ): void {
    this.downloadText(
      this.authorizationFilename(request),
      this.authorizationLetter(request),
      'Authorization letter downloaded.'
    );
  }

  protected async printAuthorizationLetter(
    request: MerchantStatus['onboarding_requests'][number]
  ): Promise<void> {
    await this.printTextDocument(
      this.authorizationSubject(request),
      this.authorizationLetter(request),
      'Authorization letter ready to print.'
    );
  }

  protected intakeDetailsRequest(): string {
    const shortcode = this.shortcode.value.trim()
      ? `${this.shortcodeType.value} ${this.shortcode.value.trim()}`
      : '[to confirm]';
    const existingCallbacks = this.existingC2bIntegration.value
      ? this.existingC2bNotes.value.trim() || 'Existing C2B integration declared; details needed.'
      : 'To confirm.';
    const lines = [
      `Date: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'medium' })}`,
      '',
      'To: Safaricom M-PESA Business Support',
      '',
      `Subject: ${this.intakeSubject()}`,
      '',
      'We need Safaricom to confirm the M-PESA business account details below before we make authorized changes to our business payment integration.',
      '',
      'Known details:',
      `Registered business name: ${this.valueOrConfirm(this.legalName.value)}`,
      `Till/Paybill: ${shortcode}`,
      `Business Admin/Manager username: ${this.valueOrConfirm(this.mpesaUsername.value)}`,
      `Contact person: ${this.valueOrConfirm(this.contactName.value)}`,
      `Contact phone: ${this.valueOrConfirm(this.contactPhone.value)}`,
      `Contact email: ${this.valueOrConfirm(this.contactEmail.value)}`,
      `Existing C2B callback integration: ${existingCallbacks}`,
      '',
      'Please confirm or provide:',
      '1. Registered M-PESA business name.',
      '2. Till or Paybill number and account type.',
      '3. M-PESA Business Admin or Business Manager username, or the approved admin contact.',
      '4. Whether C2B validation or confirmation URLs are already registered for this shortcode.',
      '5. Any documents, signatory steps or Safaricom process required before authorizing a Daraja app connection.',
      '6. The production shortcode/passkey details required for Lipa na M-PESA Online, if applicable.',
      '',
      'Safety boundary: Do not send OTPs, M-PESA PINs, portal passwords, settlement bank credentials or customer exports. Any ownership verification should be completed directly with Safaricom.',
      '',
      'Authorized business representative:',
      `Name: ${this.valueOrConfirm(this.contactName.value)}`,
      `Phone: ${this.valueOrConfirm(this.contactPhone.value)}`,
      `Email: ${this.valueOrConfirm(this.contactEmail.value)}`,
      'Signature:',
      'Date:',
    ];
    return lines.join('\n');
  }

  protected authorizationLetter(request: MerchantStatus['onboarding_requests'][number]): string {
    const settings = this.mpesaSettings();
    const callbackBase = settings.mpesa_callback_base_url.replace(/\/+$/, '');
    const contactPhone = settings.dukarun_mpesa_contact_phone
      ? `, ${settings.dukarun_mpesa_contact_phone}`
      : '';
    const lines = [
      `Date: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'medium' })}`,
      '',
      'To: Safaricom M-PESA Business Support',
      '',
      `Subject: ${this.authorizationSubject(request)}`,
      '',
      `We, ${request.legal_name}, request Safaricom to connect our ${request.shortcode_type} ${request.shortcode} to the Dukarun-managed Daraja application below.`,
      '',
      `Daraja app name: ${request.prepared_daraja_app_name ?? 'Dukarun tenant Daraja app'}`,
      `Daraja environment: ${request.prepared_daraja_app_environment ?? 'production'}`,
      `Dukarun technical contact: ${settings.dukarun_mpesa_contact_name}, ${settings.dukarun_mpesa_contact_email}${contactPhone}`,
      `Public callback base: ${callbackBase}`,
      '',
      'Requested products: Lipa na M-PESA Online STK Push, STK Query, C2B validation and C2B confirmation.',
      '',
      'Authorized purpose: Dukarun may request customer payments, receive payment notifications, validate payment status and reconcile payments for our Dukarun tenant.',
      '',
      'Safety boundary: This authorization does not permit Dukarun to withdraw funds, transfer funds, view balances, change settlement accounts, access our M-PESA portal, or act outside payment request, validation and reconciliation for this shortcode.',
      '',
      'We will not share OTPs, M-PESA PINs, portal passwords or unrelated credentials with Dukarun. Any Safaricom ownership verification should be completed by our authorized business representative directly with Safaricom.',
      '',
    ];
    if (request.existing_c2b_integration) {
      lines.push(
        `Existing C2B integration declared: ${request.existing_c2b_notes || 'Yes, details to be confirmed with Safaricom before changing callbacks.'}`,
        ''
      );
    }
    lines.push(
      'Authorized business representative:',
      `Name: ${request.contact_name}`,
      `Phone: ${request.contact_phone}`,
      `Email: ${request.contact_email}`,
      `M-PESA portal username: ${request.mpesa_username}`,
      'Signature:',
      'Date:'
    );
    return lines.join('\n');
  }

  private authorizationFilename(request: MerchantStatus['onboarding_requests'][number]): string {
    const business =
      request.legal_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'merchant';
    return `${business}-${request.shortcode_type}-${request.shortcode}-safaricom-authorization.txt`;
  }

  private safaricomMailto(subject: string, body: string): string | null {
    const recipient = this.mpesaSettings().safaricom_authorization_email?.trim();
    if (!recipient) return null;
    return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  private async copyText(text: string, success: string, failure: string): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(text);
      this.failed.set(false);
      this.message.set(success);
    } catch {
      this.failed.set(true);
      this.message.set(failure);
    }
  }

  private downloadText(filename: string, text: string, success: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.failed.set(false);
    this.message.set(success);
  }

  private async printTextDocument(title: string, text: string, success: string): Promise<void> {
    try {
      await this.print.printDocument(
        title,
        `<main class="letter"><pre>${this.escapeHtml(text)}</pre></main>`,
        `
          @page { size: A4; margin: 18mm; }
          .letter { max-width: 180mm; margin: 0 auto; color: #111; }
          pre { white-space: pre-wrap; font: 12pt/1.5 Arial, sans-serif; }
        `
      );
      this.failed.set(false);
      this.message.set(success);
    } catch {
      this.failed.set(true);
      this.message.set('Print failed. Download the document instead.');
    }
  }

  private valueOrConfirm(value: string): string {
    return value.trim() || '[to confirm]';
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

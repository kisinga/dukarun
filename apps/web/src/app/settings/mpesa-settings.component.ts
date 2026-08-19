import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../core/supabase.service';
import { PermissionsService } from '../core/permissions.service';
import { LocationContextService } from '../core/location-context.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import type { MpesaCommissioningStatus } from '@dukarun/mpesa-types';

type MerchantStatus = {
  onboarding_requests: Array<{
    id: string;
    status: string;
    shortcode: string;
    shortcode_type: string;
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
    oauth_verified: boolean;
    c2b_registered: boolean;
    stk_test_passed: boolean;
    c2b_test_passed: boolean;
  }>;
};

@Component({
  selector: 'app-mpesa-settings',
  imports: [ReactiveFormsModule, DatePipe, ButtonComponent, FormFieldComponent, IconComponent],
  template: `
    @if (perms.has('ManageMpesaIntegration')) {
      <section class="card bg-base-100">
        <div class="card-body p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="section-title">M-PESA</h2>
              <p class="type-caption mt-1">STK Push and automatic Till payment notifications.</p>
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

          @if (loading()) {
            <div class="skeleton mt-4 h-20 w-full"></div>
          } @else if (loadError()) {
            <p class="mt-3 text-sm text-error">{{ loadError() }}</p>
            <button appButton variant="outline" size="sm" class="mt-2" (click)="load()">
              Retry
            </button>
          } @else {
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
                  <span
                    class="badge"
                    [class.badge-success]="connection.status === 'active'"
                    [class.badge-warning]="connection.status === 'testing'"
                  >
                    {{ statusLabel(connection.status) }}
                  </span>
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
                  <span class="badge badge-warning">{{ statusLabel(request.status) }}</span>
                </div>
                <p class="mt-3 text-sm">{{ requestGuidance(request.status) }}</p>
                <ol class="steps steps-horizontal mt-4 w-full text-xs">
                  <li class="step step-primary">Request</li>
                  <li
                    class="step"
                    [class.step-primary]="request.commissioning.checks.merchant_verified"
                  >
                    Verify
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
                <p class="mt-2 text-sm">
                  Never send Dukarun your OTP, M-PESA PIN or portal password.
                </p>
              </article>
            }

            @if (showRequestForm() || (!connections().length && !pendingRequests().length)) {
              <form
                class="mt-4 grid gap-3 rounded-box border border-base-300 p-4 sm:grid-cols-2"
                (submit)="$event.preventDefault(); submit()"
              >
                <div class="sm:col-span-2">
                  <h3 class="font-semibold">Request a Till or Paybill connection</h3>
                  <p class="type-caption mt-1">
                    Your money still settles directly to the registered Till or Paybill.
                  </p>
                </div>
                <app-form-field label="Registered business name">
                  <input
                    class="input input-bordered w-full"
                    [formControl]="legalName"
                    autocomplete="organization"
                  />
                </app-form-field>
                <app-form-field label="Account type">
                  <select class="select select-bordered w-full" [formControl]="shortcodeType">
                    <option value="till">Till</option>
                    <option value="paybill">Paybill</option>
                  </select>
                </app-form-field>
                <app-form-field label="Till / Paybill number">
                  <input
                    class="input input-bordered w-full"
                    inputmode="numeric"
                    [formControl]="shortcode"
                  />
                </app-form-field>
                <app-form-field
                  label="M-PESA portal username"
                  hint="Business Admin or Business Manager username."
                >
                  <input
                    class="input input-bordered w-full"
                    [formControl]="mpesaUsername"
                    autocomplete="off"
                  />
                </app-form-field>
                <app-form-field label="Contact person">
                  <input
                    class="input input-bordered w-full"
                    [formControl]="contactName"
                    autocomplete="name"
                  />
                </app-form-field>
                <app-form-field label="Contact phone">
                  <input
                    class="input input-bordered w-full"
                    inputmode="tel"
                    [formControl]="contactPhone"
                    autocomplete="tel"
                  />
                </app-form-field>
                <app-form-field label="Contact email">
                  <input
                    class="input input-bordered w-full"
                    type="email"
                    [formControl]="contactEmail"
                    autocomplete="email"
                  />
                </app-form-field>
                <app-form-field label="Notes" hint="Optional store or Safaricom account details.">
                  <input class="input input-bordered w-full" [formControl]="notes" />
                </app-form-field>
                <fieldset class="sm:col-span-2">
                  <legend class="text-sm font-medium">Locations using this Till / Paybill</legend>
                  <div class="mt-2 flex flex-wrap gap-3">
                    @for (location of locations.locations(); track location.id) {
                      <label
                        class="flex items-center gap-2 rounded-box border border-base-300 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          [checked]="locationSelected(location.id)"
                          (change)="toggleLocation(location.id, $any($event.target).checked)"
                        />
                        {{ location.name }}
                      </label>
                    }
                  </div>
                </fieldset>
                <div class="sm:col-span-2 rounded-box bg-base-200/60 p-3 text-sm">
                  We will ask you to approve Safaricom’s ownership check. We never ask for your
                  M-PESA PIN, portal password or OTP.
                </div>
                @if (message()) {
                  <p class="sm:col-span-2 text-sm" [class.text-error]="failed()">{{ message() }}</p>
                }
                <div class="sm:col-span-2">
                  <div class="flex flex-wrap gap-2">
                    <button appButton type="submit" [loading]="saving()">Send setup request</button>
                    @if (connections().length || pendingRequests().length) {
                      <button
                        appButton
                        type="button"
                        variant="outline"
                        [disabled]="saving()"
                        (click)="showRequestForm.set(false)"
                      >
                        Cancel
                      </button>
                    }
                  </div>
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
  private readonly supabase = inject(SupabaseService);
  protected readonly perms = inject(PermissionsService);
  protected readonly locations = inject(LocationContextService);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly failed = signal(false);
  protected readonly status = signal<MerchantStatus | null>(null);
  protected readonly connections = computed(() => this.status()?.accounts ?? []);
  protected readonly pendingRequests = computed(
    () =>
      this.status()?.onboarding_requests.filter(request =>
        ['requested', 'reviewing', 'merchant_verification'].includes(request.status)
      ) ?? []
  );
  protected readonly showRequestForm = signal(false);

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
    });
    if (error) {
      this.failed.set(true);
      this.message.set(error.message);
    } else {
      this.message.set('Setup request sent.');
      this.showRequestForm.set(false);
      await this.load();
    }
    this.saving.set(false);
  }

  protected statusLabel(value: string): string {
    return value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
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

  protected requestGuidance(status: string): string {
    if (status === 'merchant_verification')
      return 'Safaricom ownership verification is next. Keep the registered phone nearby and enter the OTP only on Safaricom.';
    if (status === 'reviewing') return 'Dukarun is reviewing your business details.';
    return 'Request received. Dukarun will contact you for the Safaricom ownership check.';
  }
}

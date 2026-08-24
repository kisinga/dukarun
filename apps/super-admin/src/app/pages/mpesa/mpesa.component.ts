import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import {
  PlatformService,
  type PlatformMpesaConnection,
  type PlatformMpesaOverview,
  type PlatformMpesaRequest,
} from '../../core/platform.service';

@Component({
  selector: 'app-platform-mpesa',
  imports: [ReactiveFormsModule, NgIcon],
  template: `
    <div class="mx-auto max-w-7xl space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="type-caption font-semibold uppercase tracking-wide">Payment operations</p>
          <h1 class="mt-1 text-2xl font-bold">M-PESA merchant setup</h1>
          <p class="mt-1 text-sm text-base-content/60">
            Prepare a tenant Daraja app, get merchant authorization, then connect the shortcode.
          </p>
        </div>
        <button
          class="btn btn-outline btn-sm"
          type="button"
          [disabled]="loading()"
          title="Refresh M-PESA setup"
          aria-label="Refresh M-PESA setup"
          (click)="load()"
        >
          <ng-icon name="heroArrowPath" [class.animate-spin]="loading()" />
        </button>
      </header>
      @if (error()) {
        <div class="alert alert-error text-sm" role="alert">{{ error() }}</div>
      }
      @if (notice()) {
        <div class="alert alert-success text-sm" role="status">{{ notice() }}</div>
      }

      @if (overview(); as data) {
        <details class="rounded-box border border-base-300 bg-base-100 p-4">
          <summary class="cursor-pointer font-semibold">Operations controls</summary>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="type-caption">
                Global checkout kill switch and temporary fallback policy. These are not
                commissioning steps.
              </p>
            </div>
            <div class="flex flex-wrap gap-5">
              <label class="flex items-center gap-2 text-sm"
                ><input
                  type="checkbox"
                  class="toggle toggle-sm toggle-primary"
                  [formControl]="platformEnabled"
                />
                M-PESA checkout enabled</label
              >
              <label class="flex items-center gap-2 text-sm"
                ><input type="checkbox" class="toggle toggle-sm" [formControl]="fallbackAllowed" />
                Allow temporary receipt fallback</label
              >
              <button
                class="btn btn-primary btn-sm"
                type="button"
                (click)="saveSettings()"
                [disabled]="busy()"
              >
                {{ busy() ? 'Saving…' : 'Save controls' }}
              </button>
            </div>
          </div>
          <div class="mt-4 grid gap-3 border-t border-base-300 pt-4 md:grid-cols-2 xl:grid-cols-5">
            <label class="form-control xl:col-span-2"
              ><span class="label-text mb-1">Safaricom authorization email</span
              ><input
                type="email"
                class="input input-bordered input-sm"
                placeholder="Use Safaricom-provided recipient"
                [formControl]="safaricomAuthorizationEmail"
            /></label>
            <label class="form-control"
              ><span class="label-text mb-1">Dukarun contact name</span
              ><input class="input input-bordered input-sm" [formControl]="dukarunMpesaContactName"
            /></label>
            <label class="form-control"
              ><span class="label-text mb-1">Dukarun contact email</span
              ><input
                type="email"
                class="input input-bordered input-sm"
                [formControl]="dukarunMpesaContactEmail"
            /></label>
            <label class="form-control"
              ><span class="label-text mb-1">Dukarun contact phone</span
              ><input
                class="input input-bordered input-sm"
                [formControl]="dukarunMpesaContactPhone"
            /></label>
            <label class="form-control md:col-span-2 xl:col-span-5"
              ><span class="label-text mb-1">Public callback base URL</span
              ><input class="input input-bordered input-sm" [formControl]="mpesaCallbackBaseUrl"
            /></label>
          </div>
        </details>

        <div class="grid gap-5 xl:grid-cols-[1fr_25rem]">
          <div class="space-y-4">
            <section class="rounded-box border border-base-300 bg-base-100">
              <div class="border-b border-base-300 px-4 py-3">
                <h2 class="font-semibold">Setup requests</h2>
              </div>
              <div class="divide-y divide-base-300">
                @for (request of data.requests; track request.id) {
                  <article class="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p class="font-semibold">{{ request.company_name || request.legal_name }}</p>
                      <p class="type-caption">
                        {{ request.shortcode_type }} {{ request.shortcode }} ·
                        {{ request.contact_name }} · {{ request.status.replaceAll('_', ' ') }}
                      </p>
                      @if (request.existing_c2b_integration) {
                        <p class="mt-1 text-xs font-medium text-warning">
                          Existing C2B integration declared. Confirm callback ownership before
                          registering Dukarun URLs.
                        </p>
                      }
                    </div>
                    @if (
                      request.status !== 'live' &&
                      request.status !== 'rejected' &&
                      request.status !== 'cancelled'
                    ) {
                      <button
                        class="btn btn-outline btn-sm"
                        type="button"
                        [disabled]="busy()"
                        (click)="selectRequest(request)"
                      >
                        Continue setup
                      </button>
                    } @else {
                      <span class="badge badge-ghost">{{
                        request.status === 'live' ? 'Live' : 'Configured'
                      }}</span>
                    }
                  </article>
                } @empty {
                  <p class="p-5 text-sm text-base-content/60">No setup requests.</p>
                }
              </div>
            </section>

            <section class="rounded-box border border-base-300 bg-base-100">
              <div class="border-b border-base-300 px-4 py-3">
                <h2 class="font-semibold">Connections</h2>
              </div>
              <div class="divide-y divide-base-300">
                @for (connection of data.connections; track connection.id) {
                  <article
                    class="scroll-mt-4 p-4 focus:outline-none"
                    [attr.id]="'mpesa-connection-' + connection.id"
                    tabindex="-1"
                  >
                    <div class="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p class="font-semibold">
                          {{ connection.company_name }} · {{ connection.display_name }}
                        </p>
                        <p class="type-caption">
                          {{ connection.environment }} · {{ connection.shortcode_type }}
                          {{ connection.party_b }}
                        </p>
                      </div>
                      <span
                        class="badge"
                        [class.badge-success]="connection.status === 'active'"
                        [class.badge-warning]="connection.status === 'testing'"
                      >
                        {{ connection.status.replaceAll('_', ' ') }}
                      </span>
                    </div>
                    <div class="mt-4 rounded-box border border-base-300 bg-base-200/30 p-3">
                      <p class="text-sm font-semibold">Go-live checklist</p>
                      <ol class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <li
                          class="flex items-center gap-1"
                          [class.text-success]="connection.oauth_verified"
                        >
                          @if (connection.oauth_verified) {
                            <ng-icon name="heroCheckCircle" />
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
                            <ng-icon name="heroCheckCircle" />
                          } @else {
                            <span>2.</span>
                          }
                          C2B callback URLs registered
                        </li>
                        <li
                          class="flex items-center gap-1"
                          [class.text-success]="connection.stk_test_passed"
                        >
                          @if (connection.stk_test_passed) {
                            <ng-icon name="heroCheckCircle" />
                          } @else {
                            <span>3.</span>
                          }
                          KES 1 STK payment received
                        </li>
                        <li
                          class="flex items-center gap-1"
                          [class.text-success]="connection.c2b_test_passed"
                        >
                          @if (connection.c2b_test_passed) {
                            <ng-icon name="heroCheckCircle" />
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
                            <ng-icon name="heroCheckCircle" />
                          } @else {
                            <span>5.</span>
                          }
                          Connection activated
                        </li>
                      </ol>

                      @if (connection.status === 'active') {
                        <div class="alert alert-success mt-3 py-2 text-sm">
                          {{
                            data.settings.enabled
                              ? 'Live at checkout for the selected locations.'
                              : 'Configured, but checkout is disabled by the global M-PESA switch.'
                          }}
                        </div>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <button
                            class="btn btn-warning btn-xs"
                            type="button"
                            [disabled]="busy()"
                            (click)="openFallback(connection)"
                          >
                            Enable receipt fallback for 24h
                          </button>
                          <button
                            class="btn btn-error btn-xs"
                            type="button"
                            [disabled]="busy()"
                            (click)="action(connection, 'disable')"
                          >
                            Disable
                          </button>
                        </div>
                      } @else if (connection.environment !== 'production') {
                        <div class="alert alert-warning mt-3 py-2 text-sm">
                          Sandbox connections cannot go live. Create a production connection for
                          this merchant.
                        </div>
                      } @else if (!connection.oauth_verified) {
                        <p class="mt-3 text-sm">
                          <strong>Next:</strong> verify the saved consumer credentials.
                        </p>
                        <button
                          class="btn btn-primary btn-sm mt-2"
                          type="button"
                          [disabled]="busy()"
                          (click)="action(connection, 'validate_credentials')"
                        >
                          1. Check credentials
                        </button>
                      } @else if (!connection.c2b_registered) {
                        <p class="mt-3 text-sm">
                          <strong>Next:</strong> register Dukarun’s public confirmation and
                          validation URLs with Safaricom.
                        </p>
                        <button
                          class="btn btn-primary btn-sm mt-2"
                          type="button"
                          [disabled]="busy()"
                          (click)="action(connection, 'register_c2b')"
                        >
                          2. Register C2B URLs
                        </button>
                      } @else if (
                        connection.commissioning.allowed_actions.includes('start_testing')
                      ) {
                        <p class="mt-3 text-sm">
                          <strong>Next:</strong> setup is complete. Move the production connection
                          into payment testing.
                        </p>
                        <button
                          class="btn btn-primary btn-sm mt-2"
                          type="button"
                          [disabled]="busy()"
                          (click)="action(connection, 'start_testing')"
                        >
                          3. Start payment tests
                        </button>
                      } @else if (!connection.stk_test_passed) {
                        <p class="mt-3 text-sm">
                          <strong>Next:</strong> send a real KES 1 STK prompt and complete it on the
                          phone.
                        </p>
                        <label class="form-control mt-2 max-w-xs">
                          <span class="label-text mb-1">Test payer phone</span>
                          <input
                            class="input input-bordered input-sm"
                            inputmode="tel"
                            [formControl]="testPhone"
                          />
                        </label>
                        <button
                          class="btn btn-primary btn-sm mt-2"
                          type="button"
                          [disabled]="busy()"
                          (click)="testConnection(connection)"
                        >
                          Send KES 1 STK test
                        </button>
                      } @else if (!connection.c2b_test_passed) {
                        <p class="mt-3 text-sm">
                          <strong>Next:</strong> pay KES 1 directly to
                          {{ connection.shortcode_type }} {{ connection.party_b
                          }}{{
                            connection.shortcode_type === 'paybill' ? ' using account TEST' : ''
                          }}, then refresh.
                        </p>
                        @for (candidate of connection.c2b_test_candidates; track candidate.id) {
                          <button
                            class="btn btn-primary btn-sm mt-2"
                            type="button"
                            [disabled]="busy()"
                            (click)="markC2bTest(connection, candidate.id)"
                          >
                            Confirm receipt {{ candidate.provider_receipt }}
                          </button>
                        } @empty {
                          <button
                            class="btn btn-outline btn-sm mt-2"
                            type="button"
                            [disabled]="loading()"
                            (click)="load()"
                          >
                            Refresh after payment
                          </button>
                        }
                      } @else {
                        <p class="mt-3 text-sm">
                          <strong>Ready:</strong> all production checks passed.
                        </p>
                        <button
                          class="btn btn-success btn-sm mt-2"
                          type="button"
                          [disabled]="busy()"
                          (click)="action(connection, 'activate')"
                        >
                          Go live
                        </button>
                      }
                    </div>
                    <p class="type-caption mt-3">
                      Queue: {{ connection.backlog }} · Review: {{ connection.manual_review }}
                    </p>
                  </article>
                } @empty {
                  <p class="p-5 text-sm text-base-content/60">No Daraja connections.</p>
                }
              </div>
            </section>
          </div>

          <aside class="space-y-4">
            <form
              class="rounded-box border border-base-300 bg-base-100 p-4"
              (submit)="$event.preventDefault(); configure()"
            >
              <h2 class="font-semibold">Secure connection setup</h2>
              @if (selectedRequest(); as request) {
                <p class="type-caption mt-1">
                  {{ request.company_name }} · {{ request.shortcode_type }} {{ request.shortcode }}
                </p>
                <div class="mt-3 rounded-box border border-base-300 p-3">
                  <p class="text-sm font-semibold">
                    {{ request.commissioning.stage.replaceAll('_', ' ') }}
                  </p>
                  <p class="type-caption mt-1">
                    Only the next valid commissioning action is available.
                  </p>
                </div>
                @if (request.commissioning.allowed_actions.includes('begin_review')) {
                  <div class="mt-3 text-sm">
                    <p>Review the submitted business, shortcode, locations and contact details.</p>
                    @if (request.existing_c2b_integration) {
                      <p class="mt-2 text-warning">
                        Existing C2B integration:
                        {{ request.existing_c2b_notes || 'details not provided' }}
                      </p>
                    }
                  </div>
                  <button
                    class="btn btn-primary btn-sm mt-4 w-full"
                    type="button"
                    [disabled]="busy()"
                    (click)="advanceRequest(request, 'begin_review')"
                  >
                    Business details reviewed
                  </button>
                } @else if (request.commissioning.allowed_actions.includes('prepare_daraja_app')) {
                  <div class="mt-3 rounded-box bg-base-200/60 p-3 text-sm">
                    Create the Dukarun-owned Daraja app first. The tenant uses this exact app name
                    when asking Safaricom to authorize their Till/Paybill.
                  </div>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Daraja app name</span
                    ><input class="input input-bordered input-sm" [formControl]="appName"
                  /></label>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Environment</span
                    ><select class="select select-bordered select-sm" [formControl]="environment">
                      <option value="production">
                        Production — Safaricom authorization required
                      </option>
                      <option value="sandbox">Sandbox — testing only</option>
                    </select></label
                  >
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Consumer key</span
                    ><input
                      type="password"
                      autocomplete="new-password"
                      class="input input-bordered input-sm"
                      [formControl]="consumerKey"
                  /></label>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Consumer secret</span
                    ><input
                      type="password"
                      autocomplete="new-password"
                      class="input input-bordered input-sm"
                      [formControl]="consumerSecret"
                  /></label>
                  <p class="type-caption mt-3">
                    Stored in Supabase Vault. The merchant should never receive these credentials.
                  </p>
                  <button
                    class="btn btn-primary btn-sm mt-4 w-full"
                    type="button"
                    [disabled]="busy()"
                    (click)="prepareDarajaApp(request)"
                  >
                    Prepare Daraja app
                  </button>
                } @else if (
                  request.commissioning.allowed_actions.includes('authorization_verified')
                ) {
                  <div class="alert alert-info mt-3 text-sm">
                    Tenant submits the Safaricom authorization naming
                    {{ preparedApp(request)?.app_name || appName.value }}. Dukarun may be copied as
                    technical contact, but the merchant performs any Safaricom ownership or OTP
                    verification.
                  </div>
                  <div class="mt-3 rounded-box bg-base-200/60 p-3 text-sm">
                    <p class="font-semibold">Authorization pack details</p>
                    <p class="mt-1">Business: {{ request.legal_name }}</p>
                    <p>Shortcode: {{ request.shortcode_type }} {{ request.shortcode }}</p>
                    <p>Daraja app: {{ preparedApp(request)?.app_name || 'Prepared app' }}</p>
                    <p>Requested products: STK Push, STK Query, C2B validation and confirmation.</p>
                  </div>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Safaricom authorization reference</span
                    ><input
                      class="input input-bordered input-sm"
                      placeholder="Email thread, ticket, approval ID or stored evidence path"
                      [formControl]="authorizationReference"
                  /></label>
                  <button
                    class="btn btn-primary btn-sm mt-4 w-full"
                    type="button"
                    [disabled]="busy()"
                    (click)="
                      advanceRequest(
                        request,
                        'authorization_verified',
                        authorizationReference.value
                      )
                    "
                  >
                    Safaricom authorization confirmed
                  </button>
                } @else if (
                  request.commissioning.allowed_actions.includes('configure_connection')
                ) {
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Daraja app</span
                    ><select
                      class="select select-bordered select-sm"
                      [formControl]="darajaAppId"
                      (change)="darajaAppChanged()"
                    >
                      <option value="">Select prepared tenant Daraja app</option>
                      @for (app of appsForRequest(request); track app.id) {
                        <option [value]="app.id">
                          Reuse {{ app.app_name }} · {{ app.environment }}
                        </option>
                      }
                    </select></label
                  >
                  @if (darajaAppId.value) {
                    <p class="mt-3 rounded-box bg-base-200/60 p-3 text-sm">
                      Using the prepared Dukarun app credentials. Enter only the approved
                      shortcode/passkey details from Safaricom.
                    </p>
                  } @else {
                    <div class="alert alert-warning mt-3 text-sm">
                      Select the prepared tenant Daraja app before adding shortcode and passkey
                      details.
                    </div>
                  }
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Organization shortcode</span
                    ><input
                      class="input input-bordered input-sm"
                      [formControl]="organizationShortcode"
                  /></label>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Business shortcode for password</span
                    ><input class="input input-bordered input-sm" [formControl]="businessShortcode"
                  /></label>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Party B / destination Till</span
                    ><input class="input input-bordered input-sm" [formControl]="partyB"
                  /></label>
                  <label class="form-control mt-3"
                    ><span class="label-text mb-1">Lipa na M-PESA passkey</span
                    ><input
                      type="password"
                      autocomplete="new-password"
                      class="input input-bordered input-sm"
                      [formControl]="passkey"
                  /></label>
                  <p class="type-caption mt-3">Stored in Supabase Vault. Never shown again.</p>
                  <button
                    class="btn btn-primary btn-sm mt-4 w-full"
                    type="submit"
                    [disabled]="busy()"
                  >
                    {{ busy() ? 'Saving…' : 'Save and continue to go-live checks' }}
                  </button>
                } @else {
                  <p class="mt-3 text-sm text-base-content/60">
                    Continue from the highlighted connection step.
                  </p>
                }
              } @else {
                <p class="mt-3 text-sm text-base-content/60">Select a setup request.</p>
              }
            </form>

            <div class="rounded-box border border-warning/30 bg-warning/5 p-4 text-sm">
              <p class="font-semibold">Authorization boundary</p>
              <ol class="mt-2 list-decimal space-y-1 pl-4">
                <li>Dukarun owns and secures the Daraja app credentials.</li>
                <li>The merchant authorizes Safaricom to connect their shortcode to that app.</li>
                <li>Dukarun never receives or stores the OTP.</li>
                <li>Confirm existing C2B callbacks before registering Dukarun URLs.</li>
              </ol>
            </div>
          </aside>
        </div>
      } @else if (loading()) {
        <div class="skeleton h-56 w-full"></div>
      }
    </div>
  `,
})
export class MpesaComponent implements OnInit {
  private readonly platform = inject(PlatformService);
  protected readonly overview = signal<PlatformMpesaOverview | null>(null);
  protected readonly selectedRequest = signal<PlatformMpesaRequest | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly platformEnabled = new FormControl(true, { nonNullable: true });
  protected readonly fallbackAllowed = new FormControl(true, { nonNullable: true });
  protected readonly safaricomAuthorizationEmail = new FormControl('', {
    nonNullable: true,
    validators: Validators.email,
  });
  protected readonly dukarunMpesaContactName = new FormControl('Dukarun M-PESA Operations', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly dukarunMpesaContactEmail = new FormControl('hello@dukarun.com', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly dukarunMpesaContactPhone = new FormControl('', { nonNullable: true });
  protected readonly mpesaCallbackBaseUrl = new FormControl(
    'https://supa.dukarun.com/functions/v1',
    {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^https:\/\/.+/)],
    }
  );
  protected readonly appName = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly darajaAppId = new FormControl('', { nonNullable: true });
  protected readonly environment = new FormControl<'sandbox' | 'production'>('production', {
    nonNullable: true,
  });
  protected readonly organizationShortcode = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly businessShortcode = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly partyB = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly consumerKey = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly consumerSecret = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly passkey = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly authorizationReference = new FormControl('', {
    nonNullable: true,
    validators: Validators.required,
  });
  protected readonly testPhone = new FormControl('', { nonNullable: true });

  async ngOnInit(): Promise<void> {
    await this.load();
  }
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const value = await this.platform.mpesaOverview();
      this.overview.set(value);
      this.platformEnabled.setValue(value.settings.enabled);
      this.fallbackAllowed.setValue(value.settings.manual_fallback_allowed);
      this.safaricomAuthorizationEmail.setValue(value.settings.safaricom_authorization_email ?? '');
      this.dukarunMpesaContactName.setValue(value.settings.dukarun_mpesa_contact_name);
      this.dukarunMpesaContactEmail.setValue(value.settings.dukarun_mpesa_contact_email);
      this.dukarunMpesaContactPhone.setValue(value.settings.dukarun_mpesa_contact_phone ?? '');
      this.mpesaCallbackBaseUrl.setValue(value.settings.mpesa_callback_base_url);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  protected selectRequest(request: PlatformMpesaRequest): void {
    this.selectedRequest.set(request);
    this.appName.setValue(`Dukarun - ${request.company_name || request.legal_name}`);
    this.environment.setValue('production');
    const reusableApps = this.appsForRequest(request).filter(
      app => app.environment === 'production' && app.status !== 'disabled'
    );
    const prepared = this.preparedApp(request);
    this.darajaAppId.setValue(
      prepared?.id ?? (reusableApps.length === 1 ? reusableApps[0].id : '')
    );
    if (prepared) {
      this.appName.setValue(prepared.app_name);
      this.environment.setValue(prepared.environment);
    } else if (reusableApps.length === 1) this.appName.setValue(reusableApps[0].app_name);
    this.organizationShortcode.setValue(request.shortcode);
    this.businessShortcode.setValue(request.shortcode);
    this.partyB.setValue(request.shortcode);
    this.consumerKey.setValue('');
    this.consumerSecret.setValue('');
    this.passkey.setValue('');
    this.authorizationReference.setValue(request.safaricom_authorization_reference ?? '');
    this.error.set(null);
    this.notice.set(null);
  }
  protected preparedApp(request: PlatformMpesaRequest) {
    return this.overview()?.daraja_apps.find(app => app.id === request.prepared_daraja_app_id);
  }
  protected darajaAppChanged(): void {
    const selected = this.overview()?.daraja_apps.find(app => app.id === this.darajaAppId.value);
    if (!selected) return;
    this.environment.setValue(selected.environment);
    this.appName.setValue(selected.app_name);
    this.consumerKey.setValue('');
    this.consumerSecret.setValue('');
  }
  protected async advanceRequest(
    request: PlatformMpesaRequest,
    action: string,
    notes?: string
  ): Promise<void> {
    const reference = notes?.trim();
    if (action === 'authorization_verified' && !reference) {
      this.authorizationReference.markAsTouched();
      this.error.set('Enter the Safaricom authorization reference or evidence note.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.advanceMpesaRequest(request.id, action, reference);
      this.notice.set(`Commissioning advanced: ${action.replaceAll('_', ' ')}.`);
      await this.load();
      const refreshed = this.overview()?.requests.find(item => item.id === request.id) ?? null;
      this.selectedRequest.set(refreshed);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  protected async prepareDarajaApp(request: PlatformMpesaRequest): Promise<void> {
    const required = [this.appName, this.consumerKey, this.consumerSecret];
    required.forEach(control => control.markAsTouched());
    if (required.some(control => control.invalid)) {
      this.error.set('Complete the Daraja app name and consumer credentials.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.platform.prepareMpesaDarajaApp({
        requestId: request.id,
        appName: this.appName.value,
        environment: this.environment.value,
        consumerKey: this.consumerKey.value,
        consumerSecret: this.consumerSecret.value,
      });
      this.notice.set('Daraja app prepared. Send the merchant the Safaricom authorization pack.');
      this.consumerKey.setValue('');
      this.consumerSecret.setValue('');
      await this.load();
      const refreshed = this.overview()?.requests.find(item => item.id === request.id) ?? null;
      this.selectedRequest.set(refreshed);
      if (refreshed) this.selectRequest(refreshed);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  protected async configure(): Promise<void> {
    const request = this.selectedRequest();
    if (!request) return;
    const required = [
      this.appName,
      this.organizationShortcode,
      this.businessShortcode,
      this.partyB,
      this.passkey,
    ];
    required.forEach(control => control.markAsTouched());
    if (!this.darajaAppId.value) {
      this.error.set('Select the prepared tenant Daraja app.');
      return;
    }
    if (required.some(control => control.invalid)) {
      this.error.set('Complete all connection fields.');
      return;
    }
    const saved = await this.run(
      {
        action: 'configure',
        request_id: request.id,
        app_name: this.appName.value,
        environment: this.environment.value,
        organization_shortcode: this.organizationShortcode.value,
        business_shortcode: this.businessShortcode.value,
        party_b: this.partyB.value,
        consumer_key: this.consumerKey.value,
        consumer_secret: this.consumerSecret.value,
        passkey: this.passkey.value,
        location_ids: request.requested_location_ids,
        daraja_app_id: this.darajaAppId.value || null,
      },
      'Connection saved. Continue with the highlighted go-live step below.'
    );
    if (!saved) return;
    const connectionId = String(saved['connection_id'] ?? '');
    this.selectedRequest.set(null);
    this.consumerKey.setValue('');
    this.consumerSecret.setValue('');
    this.passkey.setValue('');
    if (connectionId) this.focusConnection(connectionId);
  }
  protected async action(connection: PlatformMpesaConnection, action: string): Promise<void> {
    await this.run(
      { action, connection_id: connection.id },
      `M-PESA action completed: ${action.replaceAll('_', ' ')}.`
    );
  }
  protected async testConnection(connection: PlatformMpesaConnection): Promise<void> {
    if (!this.testPhone.value.trim()) {
      this.error.set('Enter the phone that will approve the KES 1 test.');
      return;
    }
    await this.run(
      { action: 'test_stk', connection_id: connection.id, phone: this.testPhone.value, amount: 1 },
      'Test prompt sent. Enter the PIN on the phone, then refresh.'
    );
  }
  protected async markC2bTest(
    connection: PlatformMpesaConnection,
    collectionId: string
  ): Promise<void> {
    await this.run(
      { action: 'mark_c2b_test', connection_id: connection.id, collection_id: collectionId },
      'Direct KES 1 callback verified.'
    );
  }
  protected appsForRequest(request: PlatformMpesaRequest) {
    return (
      this.overview()?.daraja_apps.filter(
        app =>
          app.id === request.prepared_daraja_app_id &&
          app.company_id === request.company_id &&
          app.status !== 'disabled'
      ) ?? []
    );
  }
  protected async openFallback(connection: PlatformMpesaConnection): Promise<void> {
    await this.run(
      {
        action: 'set_fallback',
        connection_id: connection.id,
        fallback_until: new Date(Date.now() + 86_400_000).toISOString(),
      },
      'Manual fallback open for 24 hours.'
    );
  }
  protected async saveSettings(): Promise<void> {
    const required = [
      this.safaricomAuthorizationEmail,
      this.dukarunMpesaContactName,
      this.dukarunMpesaContactEmail,
      this.mpesaCallbackBaseUrl,
    ];
    required.forEach(control => control.markAsTouched());
    if (required.some(control => control.invalid)) {
      this.error.set('Check the authorization email, Dukarun contact and HTTPS callback URL.');
      return;
    }
    await this.run(
      {
        action: 'settings',
        enabled: this.platformEnabled.value,
        manual_fallback_allowed: this.fallbackAllowed.value,
        pilot_company_id: this.overview()?.settings.pilot_company_id ?? null,
        safaricom_authorization_email: this.safaricomAuthorizationEmail.value || null,
        dukarun_mpesa_contact_name: this.dukarunMpesaContactName.value,
        dukarun_mpesa_contact_email: this.dukarunMpesaContactEmail.value,
        dukarun_mpesa_contact_phone: this.dukarunMpesaContactPhone.value || null,
        mpesa_callback_base_url: this.mpesaCallbackBaseUrl.value,
      },
      'Platform controls updated.'
    );
  }
  private async run(
    input: Record<string, unknown>,
    notice: string
  ): Promise<Record<string, unknown> | null> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await this.platform.mpesaAction(input);
      this.notice.set(notice);
      await this.load();
      return result;
    } catch (error) {
      this.error.set(this.message(error));
      return null;
    } finally {
      this.busy.set(false);
    }
  }
  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'M-PESA action failed';
  }
  private focusConnection(connectionId: string): void {
    requestAnimationFrame(() => {
      const element = document.getElementById(`mpesa-connection-${connectionId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element?.focus({ preventScroll: true });
    });
  }
}

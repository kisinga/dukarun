import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { BillingConfigService } from '../../core/billing-config.service';
import { siteUrl } from '../../core/public-url';
import { LegalService, PublishedLegalDocument } from '../../legal/legal.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule],
  template: `
    <main class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-md bg-base-100">
        <div class="card-body gap-5">
          <div>
            <h1 class="type-title">
              {{ hasCompany() ? 'Add another company' : 'Register your business' }}
            </h1>
            <p class="mt-1 text-sm text-base-content/70">
              This creates your company workspace. Ledger, locations, and payment methods are set up
              automatically.
            </p>
            @if (trialDays(); as days) {
              <p class="mt-2 text-sm font-medium text-primary">
                Your {{ days }}-day free trial starts when the company is approved.
              </p>
            }
          </div>

          @if (createdPending()) {
            <div class="alert alert-success" role="status">
              <span>Your workspace was created and is awaiting platform approval.</span>
            </div>
          }

          @if (createdApproved()) {
            <div class="alert alert-success flex-col items-start" role="status">
              <span>Your workspace is approved and ready.</span>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                [disabled]="saving()"
                (click)="continueToWorkspace()"
              >
                {{ saving() ? 'Opening…' : 'Continue to dashboard' }}
              </button>
            </div>
          }

          @if (!createdPending() && !createdApproved()) {
            <form (submit)="$event.preventDefault(); provision()" class="flex flex-col gap-5">
              <fieldset class="flex flex-col gap-3">
                <legend class="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                  About you
                </legend>
                <label class="form-control">
                  <span class="label-text mb-1">Your name</span>
                  <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Amina Otieno"
                    autocomplete="name"
                    [formControl]="ownerName"
                  />
                  <span class="label-text-alt mt-1 text-base-content/45">
                    Shown to your team and on audit records.
                  </span>
                </label>
              </fieldset>

              <fieldset class="flex flex-col gap-3">
                <legend class="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                  About the business
                </legend>
                <label class="form-control">
                  <span class="label-text mb-1"
                    >Business name <span class="text-error">*</span></span
                  >
                  <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Jiko Kiosk Enterprises"
                    [formControl]="companyName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text mb-1">Location name</span>
                  <input
                    type="text"
                    class="input input-bordered w-full"
                    placeholder="Main location"
                    [formControl]="storeName"
                  />
                </label>
                <label class="form-control">
                  <span class="label-text mb-1">Business email</span>
                  <input
                    type="email"
                    class="input input-bordered w-full"
                    placeholder="info@yourbusiness.co.ke"
                    autocomplete="off"
                    [formControl]="companyEmail"
                  />
                  @if (companyEmail.invalid && companyEmail.dirty) {
                    <span class="label-text-alt mt-1 text-error">Enter a valid email address.</span>
                  }
                </label>
                <label class="form-control">
                  <span class="label-text mb-1">Business address</span>
                  <textarea
                    class="textarea textarea-bordered w-full"
                    rows="2"
                    placeholder="Shop 4, Kimathi Street, Nairobi"
                    [formControl]="companyAddress"
                  ></textarea>
                  <span class="label-text-alt mt-1 text-base-content/45">
                    Printed on receipts and invoices.
                  </span>
                </label>
              </fieldset>

              @if (legalReady()) {
                <label class="flex items-start gap-3 rounded-box border border-base-300 p-4">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary mt-0.5"
                    [formControl]="acceptedTerms"
                  />
                  <span class="text-sm">
                    I am authorized to bind this company and agree to the
                    <a [href]="siteUrl('/terms')" target="_blank" class="link link-primary"
                      >Terms of Service</a
                    >. The
                    <a [href]="siteUrl('/privacy')" target="_blank" class="link link-primary"
                      >Privacy Notice</a
                    >
                    explains data handling and is not marketing consent.
                  </span>
                </label>
              }

              @if (legalLoadError()) {
                <div class="alert alert-error flex-wrap text-sm" role="alert">
                  <span
                    >The current Terms could not be checked. Reconnect before creating a
                    company.</span
                  >
                  <button
                    type="button"
                    class="btn btn-sm"
                    [disabled]="legalLoading()"
                    (click)="loadTerms()"
                  >
                    {{ legalLoading() ? 'Checking…' : 'Try again' }}
                  </button>
                </div>
              }

              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="
                  saving() ||
                  legalLoading() ||
                  legalLoadError() ||
                  companyName.invalid ||
                  companyEmail.invalid ||
                  (legalReady() && acceptedTerms.invalid)
                "
              >
                {{ saving() ? 'Creating workspace…' : 'Create company' }}
              </button>
            </form>
          }

          @if (error()) {
            <p class="text-sm text-error">{{ error() }}</p>
          }
        </div>
      </div>
    </main>
  `,
})
export class RegisterComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly billingConfig = inject(BillingConfigService);
  private readonly legal = inject(LegalService);

  protected readonly saving = signal(false);
  protected readonly siteUrl = siteUrl;
  protected readonly error = signal<string | null>(null);
  protected readonly createdPending = signal(false);
  protected readonly createdApproved = signal(false);
  private readonly createdCompanyId = signal<string | null>(null);
  /** True when the user already belongs to a company and is adding another. */
  protected readonly hasCompany = signal(false);
  protected readonly trialDays = signal<number | null>(null);
  protected readonly currentTerms = signal<PublishedLegalDocument | null>(null);
  protected readonly legalLoading = signal(true);
  protected readonly legalLoadError = signal(false);
  protected readonly legalReady = computed(() => this.currentTerms() !== null);
  private readonly requestedPlanCode = this.route.snapshot.queryParamMap.get('plan');
  private readonly requestedBlogRef = this.validUuid(
    this.route.snapshot.queryParamMap.get('blog_ref')
  );

  protected readonly ownerName = new FormControl('', { nonNullable: true });
  protected readonly companyName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly storeName = new FormControl('', { nonNullable: true });
  protected readonly companyEmail = new FormControl('', {
    nonNullable: true,
    validators: [Validators.email],
  });
  protected readonly companyAddress = new FormControl('', { nonNullable: true });
  protected readonly acceptedTerms = new FormControl(false, {
    nonNullable: true,
    validators: [Validators.requiredTrue],
  });

  /** Multi-company: existing users may register additional companies from here. */
  async ngOnInit(): Promise<void> {
    this.hasCompany.set(Boolean(this.supabase.claims()?.company_id));
    await Promise.all([
      this.billingConfig
        .load()
        .then(config => this.trialDays.set(config?.trialDays ?? null))
        .catch(() => undefined),
      this.loadTerms(),
    ]);
  }

  protected async loadTerms(): Promise<void> {
    this.legalLoading.set(true);
    this.legalLoadError.set(false);
    try {
      const terms = await this.legal.publishedDocument('terms');
      if (!terms) throw new Error('No published Terms are available.');
      this.currentTerms.set(terms);
    } catch {
      this.currentTerms.set(null);
      this.legalLoadError.set(true);
    } finally {
      this.legalLoading.set(false);
    }
  }

  protected async provision(): Promise<void> {
    if (
      this.companyName.invalid ||
      this.companyEmail.invalid ||
      this.legalLoading() ||
      this.legalLoadError() ||
      (this.legalReady() && this.acceptedTerms.invalid)
    )
      return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const terms = this.currentTerms();
      if (!terms) throw new Error('The current Terms must be loaded before registration.');
      const { data, error } = await this.supabase.client.rpc('provision_company_registration', {
        p_company_name: this.companyName.value.trim(),
        p_store_name: this.storeName.value.trim() || 'Main location',
        p_currency: 'KES',
        p_email: this.companyEmail.value.trim() || undefined,
        p_address: this.companyAddress.value.trim() || undefined,
        ...(this.requestedPlanCode ? { p_trial_tier_code: this.requestedPlanCode } : {}),
        p_terms_version: terms.version,
        p_terms_content_sha256: terms.content_sha256,
        p_owner_name: this.ownerName.value.trim() || undefined,
        ...(this.requestedBlogRef ? { p_blog_ref: this.requestedBlogRef } : {}),
      });
      if (error) throw error;
      const result = data as unknown as {
        company_id: string;
        company_status: 'approved' | 'unapproved';
      };
      this.createdCompanyId.set(result.company_id);
      if (result.company_status !== 'approved') {
        this.createdPending.set(true);
        return;
      }
      this.createdApproved.set(true);
      await this.continueToWorkspace();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      this.saving.set(false);
    }
  }

  protected async continueToWorkspace(): Promise<void> {
    const companyId = this.createdCompanyId();
    if (!companyId) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.auth.refreshSession();
      if (error) throw error;
      if (this.supabase.claims()?.company_id !== companyId) {
        throw new Error('Your workspace is ready. Select Continue again to refresh access.');
      }
      // Reload all tenant-scoped stores under the newly selected company.
      window.location.assign('/dashboard');
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Workspace access could not be refreshed'
      );
    } finally {
      this.saving.set(false);
    }
  }

  private validUuid(value: string | null): string | null {
    return value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  }
}

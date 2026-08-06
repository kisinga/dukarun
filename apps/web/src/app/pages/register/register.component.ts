import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

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
              This creates your company workspace — ledger, locations, and payment methods are set
              up automatically.
            </p>
          </div>

          @if (createdPending()) {
            <div class="alert alert-success" role="status">
              <span>Your workspace was created and is awaiting platform approval.</span>
            </div>
          }

          @if (!createdPending()) {
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

              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="saving() || companyName.invalid || companyEmail.invalid"
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

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdPending = signal(false);
  /** True when the user already belongs to a company and is adding another. */
  protected readonly hasCompany = signal(false);

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

  /** Multi-company: existing users may register additional companies from here. */
  async ngOnInit(): Promise<void> {
    try {
      this.hasCompany.set((await this.supabase.currentCompany()) !== null);
    } catch {
      // Stay put; a failed lookup must not strand the user either.
    }
  }

  protected async provision(): Promise<void> {
    if (this.companyName.invalid || this.companyEmail.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { data: companyId, error } = await this.supabase.client.rpc('provision_company', {
        p_company_name: this.companyName.value.trim(),
        p_store_name: this.storeName.value.trim() || 'Main location',
        p_currency: 'KES',
        p_email: this.companyEmail.value.trim() || undefined,
        p_address: this.companyAddress.value.trim() || undefined,
      });
      if (error) throw error;
      // Refresh the session first: the new JWT carries the company claims that
      // update_my_profile (and everything else) scopes by.
      const { error: refreshError } = await this.supabase.client.auth.refreshSession();
      if (refreshError) throw refreshError;
      if (this.supabase.claims()?.company_id !== companyId) {
        this.createdPending.set(true);
        return;
      }
      // The owner's display name rides on provisioning — optional, best-effort.
      const name = this.ownerName.value.trim();
      if (name) {
        await this.supabase.client
          .rpc('update_my_profile', { p_display_name: name })
          .then(({ error: profileError }) => {
            if (profileError) console.warn('Profile name not saved', profileError);
          });
      }
      // Reload — provision_company made the new company active and every
      // cached store must restart under the new tenant scope.
      window.location.assign('/dashboard');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      this.saving.set(false);
    }
  }
}

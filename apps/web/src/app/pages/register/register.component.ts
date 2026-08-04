import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule],
  template: `
    <main class="dashboard-main flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-sm bg-base-100">
        <div class="card-body">
          <h1 class="type-title">Set up your business</h1>
          <p class="text-sm text-base-content/70">
            Your main business location is created automatically.
          </p>

          <form (submit)="$event.preventDefault(); provision()" class="mt-4 flex flex-col gap-4">
            <label class="form-control">
              <span class="label-text mb-1">Business name</span>
              <input
                type="text"
                class="input input-bordered w-full"
                placeholder="<tenant> Enterprises"
                [formControl]="companyName"
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-1"
                >Location name <span class="text-base-content/45">(optional)</span></span
              >
              <input
                type="text"
                class="input input-bordered w-full"
                placeholder="Main location"
                [formControl]="storeName"
              />
            </label>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="saving() || companyName.invalid"
            >
              {{ saving() ? 'Creating…' : 'Create company' }}
            </button>
          </form>

          @if (error()) {
            <p class="mt-2 text-sm text-error">{{ error() }}</p>
          }
        </div>
      </div>
    </main>
  `,
})
export class RegisterComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly companyName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly storeName = new FormControl('', {
    nonNullable: true,
  });

  /** Already-provisioned users have no business here — send them to the dashboard. */
  async ngOnInit(): Promise<void> {
    try {
      const company = await this.supabase.currentCompany();
      if (company) await this.router.navigate(['/dashboard']);
    } catch {
      // Stay put; a failed lookup must not strand the user either.
    }
  }

  protected async provision(): Promise<void> {
    if (this.companyName.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.rpc('provision_company', {
        p_company_name: this.companyName.value.trim(),
        p_store_name: this.storeName.value.trim() || 'Main location',
      });
      // Already provisioned is fine — just refresh claims and continue.
      if (error && !error.message.includes('already_provisioned')) throw error;
      // Refresh the session so the JWT picks up company_id + user_role claims.
      const { error: refreshError } = await this.supabase.client.auth.refreshSession();
      if (refreshError) throw refreshError;
      await this.router.navigate(['/dashboard']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Provisioning failed');
    } finally {
      this.saving.set(false);
    }
  }
}

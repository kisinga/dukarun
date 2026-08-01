import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule],
  template: `
    <main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body">
          <h1 class="card-title text-2xl">Set up your business</h1>
          <p class="text-sm text-base-content/70">Create your company and first store</p>

          <form (ngSubmit)="provision()" class="mt-4 flex flex-col gap-4">
            <label class="form-control">
              <span class="label-text mb-1">Company name</span>
              <input
                type="text"
                class="input input-bordered w-full"
                placeholder="<tenant> Enterprises"
                [formControl]="companyName"
              />
            </label>
            <label class="form-control">
              <span class="label-text mb-1">Store name</span>
              <input
                type="text"
                class="input input-bordered w-full"
                placeholder="Main Street Kiosk"
                [formControl]="storeName"
              />
            </label>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="saving() || companyName.invalid || storeName.invalid"
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
export class RegisterComponent {
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
    validators: [Validators.required],
  });

  protected async provision(): Promise<void> {
    if (this.companyName.invalid || this.storeName.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { error } = await this.supabase.client.rpc('provision_company', {
        p_company_name: this.companyName.value.trim(),
        p_store_name: this.storeName.value.trim(),
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

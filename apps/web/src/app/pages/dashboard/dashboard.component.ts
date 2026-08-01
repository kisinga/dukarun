import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Company, SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-dashboard',
  template: `
    <main class="flex min-h-screen items-center justify-center bg-base-200 p-4">
      <div class="card w-full max-w-md bg-base-100 shadow-xl">
        <div class="card-body">
          <h1 class="card-title text-2xl">Dashboard</h1>

          @if (company(); as c) {
            <dl class="mt-4 space-y-2">
              <div class="flex justify-between">
                <dt class="text-base-content/70">Company</dt>
                <dd class="font-semibold">{{ c.name }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-base-content/70">Code</dt>
                <dd class="font-mono">{{ c.code }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-base-content/70">Role</dt>
                <dd class="badge badge-primary">{{ role() ?? '—' }}</dd>
              </div>
            </dl>
          } @else if (error()) {
            <p class="mt-4 text-sm text-error">{{ error() }}</p>
          } @else {
            <p class="mt-4 text-sm text-base-content/70">Loading…</p>
          }

          <button class="btn btn-outline mt-6" (click)="signOut()">Sign out</button>
        </div>
      </div>
    </main>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  protected readonly company = signal<Company | null>(null);
  protected readonly role = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    this.role.set(this.supabase.claims()?.user_role ?? null);
    try {
      const company = await this.supabase.currentCompany();
      if (!company) {
        // Authenticated but not provisioned — send to registration.
        await this.router.navigate(['/register']);
        return;
      }
      this.company.set(company);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load company');
    }
  }

  protected async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    await this.router.navigate(['/login']);
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Company, SupabaseService } from '../../core/supabase.service';
import { SyncService } from '../../pos/offline/sync.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
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

            <nav class="mt-6 grid grid-cols-2 gap-2">
              <a routerLink="/pos/sell" class="btn btn-primary">Sell</a>
              <a routerLink="/pos/sales" class="btn btn-outline">Today's Sales</a>
              <a routerLink="/pos/proformas" class="btn btn-outline">Proformas</a>
              <a routerLink="/pos/cashier" class="btn btn-outline">Cashier Queue</a>
            </nav>

            @if (pendingCount() > 0) {
              <a
                routerLink="/pos/sync"
                class="btn btn-sm mt-3 w-full"
                [class.btn-error]="sync.failedCount() > 0"
                [class.btn-outline]="sync.failedCount() === 0"
              >
                {{ pendingCount() }} sale(s) awaiting sync
                @if (sync.failedCount() > 0) {
                  — {{ sync.failedCount() }} failed
                }
              </a>
            }
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
  protected readonly sync = inject(SyncService);

  protected readonly company = signal<Company | null>(null);
  protected readonly role = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly pendingCount = computed(
    () => this.sync.queuedCount() + this.sync.failedCount()
  );

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

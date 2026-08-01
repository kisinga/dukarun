import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Company, SupabaseService } from '../../core/supabase.service';
import { ThemeService } from '../../core/theme.service';
import { SyncService } from '../../pos/offline/sync.service';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgIcon, PageHeaderComponent],
  template: `
    <main class="dashboard-main min-h-screen bg-base-200 p-4">
      <div class="mx-auto max-w-2xl">
        <app-page-header title="Dukarun" [subtitle]="company()?.name ?? ''">
          <button
            actions
            class="btn btn-ghost btn-sm min-h-11 min-w-11"
            [title]="theme.theme() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'"
            (click)="theme.toggle()"
          >
            <ng-icon [name]="theme.theme() === 'light' ? 'heroMoon' : 'heroSun'" />
          </button>
          <button actions class="btn btn-outline btn-sm min-h-11" (click)="signOut()">
            Sign out
          </button>
        </app-page-header>

        @if (company(); as c) {
          <div class="card bg-base-100">
            <div class="card-body p-4">
              <dl class="space-y-2">
                <div class="flex justify-between">
                  <dt class="type-caption">Company</dt>
                  <dd class="type-heading">{{ c.name }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="type-caption">Code</dt>
                  <dd class="font-mono text-sm">{{ c.code }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="type-caption">Role</dt>
                  <dd class="badge badge-primary">{{ role() ?? '—' }}</dd>
                </div>
              </dl>
            </div>
          </div>

          @if (pendingCount() > 0) {
            <a
              routerLink="/pos/sync"
              class="btn mt-3 w-full min-h-11"
              [class.btn-error]="sync.failedCount() > 0"
              [class.btn-warning]="sync.failedCount() === 0"
            >
              {{ pendingCount() }} sale(s) awaiting sync
              @if (sync.failedCount() > 0) {
                — {{ sync.failedCount() }} failed
              }
            </a>
          }

          <h2 class="type-heading mt-6">Sell</h2>
          <nav class="mt-2 grid grid-cols-2 gap-2">
            <a routerLink="/pos/sell" class="btn btn-primary min-h-11">Sell</a>
            <a routerLink="/pos/sales" class="btn btn-outline min-h-11">Today's Sales</a>
            <a routerLink="/orders" class="btn btn-outline min-h-11">Orders</a>
            <a routerLink="/pos/proformas" class="btn btn-outline min-h-11">Proformas</a>
            <a routerLink="/pos/cashier" class="btn btn-outline min-h-11">Cashier Queue</a>
            <a routerLink="/products" class="btn btn-outline min-h-11">Products</a>
            <a routerLink="/customers" class="btn btn-outline min-h-11">Customers</a>
            <a routerLink="/team" class="btn btn-outline min-h-11">Team</a>
          </nav>

          <h2 class="type-heading mt-6">Money</h2>
          <nav class="mt-2 grid grid-cols-2 gap-2">
            <a routerLink="/money/cashier" class="btn btn-outline min-h-11">Cashier Sessions</a>
            <a routerLink="/money/expenses" class="btn btn-outline min-h-11">Expenses</a>
            <a routerLink="/money/transfers" class="btn btn-outline min-h-11">Transfers</a>
            <a routerLink="/money/credit" class="btn btn-outline min-h-11">Customer Credit</a>
            <a routerLink="/money/suppliers" class="btn btn-outline min-h-11">Suppliers</a>
            <a routerLink="/money/periods" class="btn btn-outline min-h-11">Reconciliation</a>
            <a routerLink="/money/stock" class="btn btn-outline min-h-11">Stock Adjustments</a>
          </nav>
        } @else if (error()) {
          <p class="mt-4 text-sm text-error">{{ error() }}</p>
        } @else {
          <p class="mt-4 text-sm text-base-content/60">Loading…</p>
        }
      </div>
    </main>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  protected readonly sync = inject(SyncService);
  protected readonly theme = inject(ThemeService);

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

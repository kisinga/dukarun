import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface CustomerStats {
  totalCustomers: number;
  verifiedCustomers: number;
  creditApprovedCustomers: number;
  frozenCustomers: number;
  recentCustomers: number;
}

/**
 * Customer Statistics Component
 *
 * Displays customer statistics in compact gradient cards.
 * Uses info color theme for Customers page identity.
 */
@Component({
  selector: 'app-customer-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <!-- Total Customers -->
      <div
        class="card bg-gradient-to-br from-info/10 to-info/5 border border-info/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-info"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Total Customers</p>
              <p class="text-xl lg:text-2xl font-bold text-info tracking-tight">
                {{ stats().totalCustomers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Verified Customers -->
      <div
        class="card bg-gradient-to-br from-success/10 to-success/5 border border-success/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeFilters().verified"
        [class.ring-primary]="activeFilters().verified"
        [class.bg-primary/20]="activeFilters().verified"
        (click)="onFilterClick('verified')"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Verified</p>
              <p class="text-xl lg:text-2xl font-bold text-success tracking-tight">
                {{ stats().verifiedCustomers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Credit Approved Customers -->
      <div
        class="card bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeFilters().creditApproved"
        [class.ring-primary]="activeFilters().creditApproved"
        [class.bg-primary/20]="activeFilters().creditApproved"
        (click)="onFilterClick('creditApproved')"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Credit Approved</p>
              <p class="text-xl lg:text-2xl font-bold text-primary tracking-tight">
                {{ stats().creditApprovedCustomers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Frozen Customers -->
      <div
        class="card bg-gradient-to-br from-base-content/10 to-base-content/5 border border-base-content/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeFilters().frozen"
        [class.ring-primary]="activeFilters().frozen"
        [class.bg-primary/20]="activeFilters().frozen"
        (click)="onFilterClick('frozen')"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div
              class="w-9 h-9 rounded-lg bg-base-content/10 flex items-center justify-center shrink-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-base-content/70"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Frozen</p>
              <p class="text-xl lg:text-2xl font-bold text-base-content tracking-tight">
                {{ stats().frozenCustomers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Customers -->
      <div
        class="card bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeFilters().recent"
        [class.ring-primary]="activeFilters().recent"
        [class.bg-primary/20]="activeFilters().recent"
        (click)="onFilterClick('recent')"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-warning"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Recent</p>
              <p class="text-xl lg:text-2xl font-bold text-warning tracking-tight">
                {{ stats().recentCustomers }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CustomerStatsComponent {
  readonly stats = input.required<CustomerStats>();
  readonly activeFilters = input<{
    verified?: boolean;
    creditApproved?: boolean;
    frozen?: boolean;
    recent?: boolean;
  }>({});
  readonly filterClick = output<{ type: string; color: string }>();

  onFilterClick(type: string): void {
    const colorMap: Record<string, string> = {
      verified: 'success',
      creditApproved: 'primary',
      frozen: 'neutral',
      recent: 'warning',
    };
    this.filterClick.emit({ type, color: colorMap[type] || 'primary' });
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface PaymentStats {
  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
}

/**
 * Payment Statistics Component
 *
 * Displays payment statistics in compact gradient cards.
 * Uses success color theme for Payments page identity.
 */
@Component({
  selector: 'app-payment-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <!-- Total Payments -->
      <div
        class="card bg-gradient-to-br from-success/10 to-success/5 border border-success/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
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
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Total Payments</p>
              <p class="text-xl lg:text-2xl font-bold text-success tracking-tight">
                {{ stats().totalPayments }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Successful Payments -->
      <div
        class="card bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeStateFilter() === 'Settled'"
        [class.ring-primary]="activeStateFilter() === 'Settled'"
        [class.bg-primary/20]="activeStateFilter() === 'Settled'"
        (click)="onFilterClick('Settled')"
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Successful</p>
              <p class="text-xl lg:text-2xl font-bold text-primary tracking-tight">
                {{ stats().successfulPayments }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Pending Payments -->
      <div
        class="card bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeStateFilter() === 'Created'"
        [class.ring-primary]="activeStateFilter() === 'Created'"
        [class.bg-primary/20]="activeStateFilter() === 'Created'"
        (click)="onFilterClick('Created')"
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
              <p class="text-xs text-base-content/60 truncate">Pending</p>
              <p class="text-xl lg:text-2xl font-bold text-warning tracking-tight">
                {{ stats().pendingPayments }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Failed Payments -->
      <div
        class="card bg-gradient-to-br from-error/10 to-error/5 border border-error/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        [class.ring-2]="activeStateFilter() === 'Declined'"
        [class.ring-primary]="activeStateFilter() === 'Declined'"
        [class.bg-primary/20]="activeStateFilter() === 'Declined'"
        (click)="onFilterClick('Declined')"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Failed</p>
              <p class="text-xl lg:text-2xl font-bold text-error tracking-tight">
                {{ stats().failedPayments }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PaymentStatsComponent {
  readonly stats = input.required<PaymentStats>();
  readonly activeStateFilter = input<string>('');
  readonly filterClick = output<{ type: string; value: string; color: string }>();

  onFilterClick(value: string): void {
    // Map filter values to their badge colors
    const colorMap: Record<string, string> = {
      Settled: 'primary',
      Created: 'warning',
      Declined: 'error',
    };
    this.filterClick.emit({ type: 'state', value, color: colorMap[value] || 'primary' });
  }
}

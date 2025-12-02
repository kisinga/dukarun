import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface OrderStats {
  totalOrders: number;
  draftOrders: number;
  unpaidOrders: number;
  paidOrders: number;
}

/**
 * Order Statistics Component
 *
 * Displays order statistics in compact gradient cards.
 * Uses secondary color theme for Orders page identity.
 */
@Component({
  selector: 'app-order-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <!-- Total Orders -->
      <div
        class="card bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      >
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Total Orders</p>
              <p class="text-xl lg:text-2xl font-bold text-secondary tracking-tight">
                {{ stats().totalOrders }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Draft Orders -->
      <div class="card bg-gradient-to-br from-neutral/10 to-neutral/5 border border-neutral/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-neutral/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-neutral"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Draft</p>
              <p class="text-xl lg:text-2xl font-bold text-neutral tracking-tight">
                {{ stats().draftOrders }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Unpaid Orders -->
      <div class="card bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
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
              <p class="text-xs text-base-content/60 truncate">Unpaid</p>
              <p class="text-xl lg:text-2xl font-bold text-warning tracking-tight">
                {{ stats().unpaidOrders }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Paid Orders -->
      <div class="card bg-gradient-to-br from-success/10 to-success/5 border border-success/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
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
              <p class="text-xs text-base-content/60 truncate">Paid</p>
              <p class="text-xl lg:text-2xl font-bold text-success tracking-tight">
                {{ stats().paidOrders }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrderStatsComponent {
  readonly stats = input.required<OrderStats>();
}

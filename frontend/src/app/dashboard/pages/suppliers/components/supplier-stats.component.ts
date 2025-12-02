import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface SupplierStats {
  totalSuppliers: number;
  verifiedSuppliers: number;
  suppliersWithAddresses: number;
  recentSuppliers: number;
}

/**
 * Supplier Statistics Component
 *
 * Displays supplier statistics in compact gradient cards.
 * Uses accent color theme for Suppliers page identity.
 */
@Component({
  selector: 'app-supplier-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <!-- Total Suppliers -->
      <div class="card bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <div class="card-body p-3 lg:p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">Total Suppliers</p>
              <p class="text-xl lg:text-2xl font-bold text-accent tracking-tight">
                {{ stats().totalSuppliers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Verified Suppliers -->
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
              <p class="text-xs text-base-content/60 truncate">Verified</p>
              <p class="text-xl lg:text-2xl font-bold text-success tracking-tight">
                {{ stats().verifiedSuppliers }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Suppliers with Addresses -->
      <div class="card bg-gradient-to-br from-info/10 to-info/5 border border-info/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-base-content/60 truncate">With Addresses</p>
              <p class="text-xl lg:text-2xl font-bold text-info tracking-tight">
                {{ stats().suppliersWithAddresses }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Suppliers -->
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
              <p class="text-xs text-base-content/60 truncate">Recent</p>
              <p class="text-xl lg:text-2xl font-bold text-warning tracking-tight">
                {{ stats().recentSuppliers }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SupplierStatsComponent {
  readonly stats = input.required<SupplierStats>();
}

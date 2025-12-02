import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { CurrencyService } from '../../../../../core/services/currency.service';

/**
 * Purchase Items Table Component
 *
 * Displays purchase line items in a table format with currency formatting
 */
@Component({
  selector: 'app-purchase-items-table',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-bold text-lg sm:text-xl mb-4 text-base-content">Items</h3>

      <!-- Desktop: Table View -->
      <div class="hidden lg:block overflow-x-auto">
        <table class="table table-zebra">
          <thead>
            <tr>
              <th>Item</th>
              <th class="text-right">Location</th>
              <th class="text-right">Quantity</th>
              <th class="text-right">Unit Cost</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            @for (line of lines(); track line.id) {
              <tr>
                <td>
                  <div class="font-medium">{{ line.variant?.name || 'Unknown Product' }}</div>
                  @if (line.variant?.sku) {
                    <div class="text-sm text-base-content/60">SKU: {{ line.variant?.sku }}</div>
                  }
                </td>
                <td class="text-right">
                  {{ line.stockLocation?.name || 'N/A' }}
                </td>
                <td class="text-right">{{ line.quantity }}</td>
                <td class="text-right">{{ formatCurrency(line.unitCost) }}</td>
                <td class="text-right font-medium">{{ formatCurrency(line.totalCost) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Mobile: Card View -->
      <div class="lg:hidden space-y-3">
        @for (line of lines(); track line.id) {
          <div class="card bg-base-200/50 border border-base-300/50 shadow-sm">
            <div class="card-body p-4">
              <div class="flex justify-between items-start mb-2">
                <div class="flex-1 min-w-0">
                  <h4 class="font-semibold text-base text-base-content">
                    {{ line.variant?.name || 'Unknown Product' }}
                  </h4>
                  @if (line.variant?.sku) {
                    <p class="text-xs text-base-content/60 mt-1">SKU: {{ line.variant?.sku }}</p>
                  }
                  @if (line.stockLocation?.name) {
                    <p class="text-xs text-base-content/60 mt-1">
                      Location: {{ line.stockLocation?.name }}
                    </p>
                  }
                </div>
                <div class="text-right ml-3 shrink-0">
                  <div class="font-bold text-lg text-primary">
                    {{ formatCurrency(line.totalCost) }}
                  </div>
                </div>
              </div>
              <div class="flex justify-between items-center pt-2 border-t border-base-300/50">
                <span class="text-sm text-base-content/70"
                  >Quantity: <strong>{{ line.quantity }}</strong></span
                >
                <span class="text-sm text-base-content/70"
                  >Unit: <strong>{{ formatCurrency(line.unitCost) }}</strong></span
                >
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PurchaseItemsTableComponent {
  private readonly currencyService = inject(CurrencyService);
  readonly lines = input.required<
    Array<{
      id: string;
      variantId: string;
      variant?: {
        id: string;
        name: string;
        sku?: string;
      };
      quantity: number;
      unitCost: number;
      totalCost: number;
      stockLocationId: string;
      stockLocation?: {
        id: string;
        name: string;
      };
    }>
  >();

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }
}

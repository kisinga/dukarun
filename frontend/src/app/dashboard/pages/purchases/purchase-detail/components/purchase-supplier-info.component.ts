import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Purchase Supplier Info Component
 *
 * Displays supplier name, email, and phone
 */
@Component({
  selector: 'app-purchase-supplier-info',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <h3 class="font-bold text-base mb-3 text-base-content">Supplier</h3>
      <p class="text-base font-medium text-base-content mb-2">{{ supplierName() }}</p>
      @if (supplier()) {
        <div class="space-y-1">
          @if (supplier()!.emailAddress) {
            <div class="flex items-center gap-2 text-sm text-base-content/70">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <span>{{ supplier()!.emailAddress }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PurchaseSupplierInfoComponent {
  readonly supplier = input<{
    id: string;
    firstName?: string;
    lastName?: string;
    emailAddress?: string;
  } | null>(null);

  readonly supplierName = computed(() => {
    const supp = this.supplier();
    if (!supp) return 'Unknown Supplier';
    const firstName = supp.firstName || '';
    const lastName = supp.lastName || '';
    return `${firstName} ${lastName}`.trim() || supp.emailAddress || 'Unknown Supplier';
  });
}

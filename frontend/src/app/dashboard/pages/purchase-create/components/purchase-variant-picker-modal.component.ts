import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ProductVariant } from '../../../../core/services/product/product-search.service';

/**
 * Modal for selecting a product variant when adding a purchase line item.
 * Shows a scrollable list of variants (product name, variant name, SKU) so users
 * can pick any variant independently, solving the small dropdown problem.
 */
@Component({
  selector: 'app-purchase-variant-picker-modal',
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <div class="modal modal-open modal-bottom sm:modal-middle">
        <div class="modal-box max-w-xl p-0 max-h-[90vh] flex flex-col">
          <!-- Header -->
          <div class="p-3 border-b border-base-300 flex-shrink-0">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-base">Select variant</h3>
              <button
                type="button"
                class="btn btn-ghost btn-sm btn-circle"
                (click)="close.emit()"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            @if (searchTerm()) {
              <p class="text-xs opacity-60 mt-1">Results for "{{ searchTerm() }}"</p>
            }
            <p class="text-xs opacity-60 mt-0.5">
              {{ variants().length }} variant{{ variants().length !== 1 ? 's' : '' }}
            </p>
          </div>

          <!-- Scrollable variant list -->
          <div class="flex-1 overflow-y-auto max-h-[70vh] p-2">
            <ul class="space-y-1">
              @for (variant of variants(); track variant.id) {
                <li>
                  <button
                    type="button"
                    class="btn btn-ghost w-full justify-start text-left normal-case h-auto min-h-0 py-3 px-3 rounded-lg hover:bg-base-200 border border-transparent hover:border-base-300"
                    (click)="variantSelected.emit(variant)"
                  >
                    <div class="flex flex-col gap-0.5 w-full min-w-0">
                      <span class="text-sm font-medium truncate">
                        {{ variant.productName || variant.name || variant.sku }}
                      </span>
                      @if (variant.name && variant.name !== variant.productName) {
                        <span class="text-xs opacity-70 truncate">{{ variant.name }}</span>
                      }
                      <span class="text-xs opacity-50">SKU: {{ variant.sku }}</span>
                    </div>
                  </button>
                </li>
              }
            </ul>
          </div>
        </div>
        <div class="modal-backdrop" (click)="close.emit()"></div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseVariantPickerModalComponent {
  readonly isOpen = input<boolean>(false);
  readonly variants = input<ProductVariant[]>([]);
  readonly searchTerm = input<string>('');

  readonly variantSelected = output<ProductVariant>();
  readonly close = output<void>();
}

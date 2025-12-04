import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductSearchResult } from '../../../../core/services/product/product-search.service';

/**
 * Unified search interface with integrated camera toggle
 */
@Component({
  selector: 'app-search-view',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body p-3">
        <div class="flex items-center gap-2">
          <!-- Search Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 opacity-60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <!-- Search Input -->
          <input
            type="text"
            class="input input-ghost flex-1 text-base p-0 focus:outline-none min-h-0 h-auto"
            placeholder="Search products..."
            [(ngModel)]="searchTerm"
            (ngModelChange)="searchTermChange.emit($event)"
          />

          <!-- Camera Toggle Button (when searching) -->
          @if (showCameraButton()) {
            <button
              class="btn btn-circle btn-sm btn-primary"
              (click)="cameraToggle.emit()"
              aria-label="Back to camera"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          }
        </div>

        <!-- Search Results -->
        @if (searchResults().length > 0) {
          <div class="mt-2 space-y-1 max-h-[60vh] overflow-y-auto">
            @for (product of searchResults(); track product.id) {
              <button
                class="w-full flex items-center gap-2 p-2 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
                (click)="productSelected.emit(product)"
              >
                <!-- Product Image -->
                @if (product.featuredAsset) {
                  <img
                    [src]="product.featuredAsset.preview"
                    [alt]="product.name"
                    class="w-10 h-10 rounded object-cover"
                  />
                } @else {
                  <div class="w-10 h-10 rounded bg-base-300 flex items-center justify-center">
                    @if (isService(product)) {
                      <span class="material-symbols-outlined text-xl text-accent">build</span>
                    } @else {
                      <span class="material-symbols-outlined text-xl text-primary"
                        >inventory_2</span
                      >
                    }
                  </div>
                }

                <!-- Product Info -->
                <div class="flex-1 text-left min-w-0">
                  <div class="font-semibold text-sm truncate">{{ product.name }}</div>
                  <div class="text-xs opacity-60">
                    {{ product.variants.length }} variant{{
                      product.variants.length > 1 ? 's' : ''
                    }}
                  </div>
                </div>

                <!-- Add Icon -->
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchViewComponent {
  // Inputs
  readonly searchResults = input.required<ProductSearchResult[]>();
  readonly isSearching = input<boolean>(false);
  readonly showCameraButton = input<boolean>(false);

  // Outputs
  readonly searchTermChange = output<string>();
  readonly productSelected = output<ProductSearchResult>();
  readonly cameraToggle = output<void>();

  // Local state
  searchTerm = '';

  isService(product: ProductSearchResult): boolean {
    return product.variants?.some((v) => v.trackInventory === false) || false;
  }

  onSearchChange(term: string): void {
    this.searchTermChange.emit(term);
  }
}

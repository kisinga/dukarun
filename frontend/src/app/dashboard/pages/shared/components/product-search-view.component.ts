import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductSearchResult } from '../../../../core/services/product/product-search.service';
import { ProductLabelComponent } from './product-label.component';
import { VariantListComponent } from './variant-list.component';

/**
 * Shared product search UI: card with search input, optional camera/action button,
 * and a list of product results (image, label, variant count, expandable variants).
 * Used on sell and purchase pages for consistent UX.
 */
@Component({
  selector: 'app-product-search-view',
  standalone: true,
  imports: [CommonModule, FormsModule, ProductLabelComponent, VariantListComponent],
  template: `
    <div class="card bg-base-100 shadow-lg">
      <div class="card-body" [class.p-3]="!compact()" [class.p-2]="compact()">
        <div class="flex items-center gap-2">
          <!-- Search Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 opacity-60 shrink-0"
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
            [placeholder]="placeholder()"
            [(ngModel)]="searchTerm"
            (ngModelChange)="searchTermChange.emit($event)"
          />

          <!-- Camera Toggle Button (when searching or on mobile) -->
          @if (shouldShowCameraButton()) {
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
          <div
            class="mt-2 space-y-2 overflow-y-auto"
            [class.max-h-[60vh]]="!compact()"
            [class.max-h-[40vh]]="compact()"
          >
            @for (product of searchResults(); track product.id) {
              <div class="border border-base-300 rounded-lg overflow-hidden bg-base-100">
                <button
                  class="w-full flex items-center gap-2 p-2 bg-base-200 hover:bg-base-300 transition-colors"
                  (click)="productSelected.emit(product)"
                >
                  <!-- Product Image -->
                  @if (product.featuredAsset) {
                    <img
                      [src]="product.featuredAsset.preview"
                      [alt]="product.name"
                      class="w-10 h-10 rounded object-cover shrink-0"
                    />
                  } @else {
                    <div
                      class="w-10 h-10 rounded bg-base-300 flex items-center justify-center shrink-0"
                    >
                      @if (isService(product)) {
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
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      } @else {
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
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                        </svg>
                      }
                    </div>
                  }

                  <!-- Product Info -->
                  <div class="flex-1 text-left min-w-0">
                    <app-product-label
                      [productName]="product.name"
                      [facetValues]="product.facetValues ?? []"
                    />
                    <div class="text-xs opacity-60">
                      {{ product.variants.length }} variant{{
                        product.variants.length > 1 ? 's' : ''
                      }}
                    </div>
                  </div>

                  <!-- Add Icon -->
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-primary shrink-0"
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
                @if (!isMobile() && product.variants.length > 1) {
                  <details
                    class="collapse collapse-arrow border-t border-base-300 bg-base-200/60"
                    [class.collapse-open]="product.variants.length <= 3"
                    [attr.open]="product.variants.length <= 3"
                  >
                    <summary
                      class="collapse-title min-h-0 py-1 pl-6 pr-2 text-xs opacity-70 cursor-pointer"
                    >
                      <span class="sr-only">Toggle variants</span>
                    </summary>
                    <div class="collapse-content pl-6 pr-2 pb-1.5 pt-0">
                      <app-variant-list [variants]="product.variants" />
                    </div>
                  </details>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSearchViewComponent implements OnDestroy {
  readonly searchResults = input.required<ProductSearchResult[]>();
  readonly isSearching = input<boolean>(false);
  readonly showCameraButton = input<boolean>(false);
  readonly placeholder = input<string>('Search products...');
  readonly compact = input<boolean>(false);

  readonly searchTermChange = output<string>();
  readonly productSelected = output<ProductSearchResult>();
  readonly cameraToggle = output<void>();

  searchTerm = '';
  readonly isMobile = signal<boolean>(false);
  private resizeListener?: () => void;

  readonly shouldShowCameraButton = computed(() => {
    return this.isMobile() || this.showCameraButton();
  });

  constructor() {
    if (typeof window !== 'undefined') {
      this.checkMobile();
      this.resizeListener = () => this.checkMobile();
      window.addEventListener('resize', this.resizeListener);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  private checkMobile(): void {
    if (typeof window !== 'undefined') {
      this.isMobile.set(window.innerWidth < 768);
    }
  }

  isService(product: ProductSearchResult): boolean {
    return product.variants?.some((v) => v.trackInventory === false) || false;
  }
}

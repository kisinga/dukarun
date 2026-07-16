import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Minimal facet value for pills (manufacturer, category) */
export interface ProductLabelFacetValue {
  name: string;
  facetCode?: string;
  facet?: { code: string };
}

/**
 * Renders product name with optional manufacturer/category pills.
 * Accepts facetValues from ProductSearchResult or API product (facet.code or facetCode).
 */
@Component({
  selector: 'app-product-label',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1 min-w-0">
      <span class="font-semibold text-sm truncate" [class.line-clamp-1]="lineClampName()">
        {{ productName() }}
      </span>
      @if (pillValues().length > 0) {
        <div class="flex flex-wrap gap-1">
          @for (fv of pillValues(); track fv.name) {
            <span class="badge badge-sm badge-ghost badge-outline">
              {{ fv.name }}
            </span>
          }
        </div>
      }
    </div>
  `,
})
export class ProductLabelComponent {
  readonly productName = input.required<string>();
  /** Facet values with facet.code or facetCode = manufacturer | category (tags not shown as pills) */
  readonly facetValues = input<ProductLabelFacetValue[]>([]);
  readonly lineClampName = input<boolean>(false);

  /** Manufacturer and category only, for pill display */
  pillValues(): ProductLabelFacetValue[] {
    const list = this.facetValues() ?? [];
    return list.filter((fv) => {
      const code = fv.facet?.code ?? fv.facetCode ?? '';
      return code === 'manufacturer' || code === 'category';
    });
  }
}

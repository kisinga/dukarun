import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { withImagePreset } from '../utils/asset.util';

export interface ProductCardVM {
  slug: string;
  name: string;
  imageUrl: string | null;
  price: string;
  inStock: boolean;
}

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="['/products', product().slug]"
      class="group flex flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-base-content/20 hover:shadow-lg"
    >
      <div class="relative aspect-square w-full overflow-hidden bg-base-200">
        @if (product().imageUrl) {
          <img
            [src]="withPreset(product().imageUrl!)"
            [alt]="product().name"
            loading="lazy"
            class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        } @else {
          <div
            class="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-base-200 to-base-300 text-base-content/25"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
            </svg>
            <span class="text-[0.7rem] font-medium uppercase tracking-wide">No image</span>
          </div>
        }
        @if (!product().inStock) {
          <div class="absolute inset-0 flex items-center justify-center bg-base-100/55 backdrop-blur-[1px]">
            <span class="badge badge-neutral badge-sm font-medium">Out of stock</span>
          </div>
        }
      </div>
      <div class="flex flex-1 flex-col gap-1.5 p-3">
        <h3 class="line-clamp-2 text-sm font-medium leading-snug text-base-content group-hover:text-primary">
          {{ product().name }}
        </h3>
        <span class="mt-auto pt-1 text-base font-bold text-primary">{{ product().price }}</span>
      </div>
    </a>
  `,
})
export class ProductCardComponent {
  readonly product = input.required<ProductCardVM>();

  withPreset(url: string): string {
    return withImagePreset(url, 'medium');
  }
}

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyService } from '../../../../core/services/currency.service';
import {
  PriceModificationService,
  PriceOverrideData,
} from '../services/price-modification.service';
import { QuantityInputData, QuantityInputSheetComponent } from './quantity-input-sheet.component';
import { PriceEditSheetComponent, PriceEditData } from './price-edit-sheet.component';

/** Facet value for manufacturer/category pill */
export interface CartItemFacetValue {
  name: string;
  facetCode?: string;
  facet?: { code: string };
}

export interface CartItemData {
  variant: {
    id: string;
    name: string;
    productName: string;
    priceWithTax: number;
    customFields?: {
      wholesalePrice?: number;
      allowFractionalQuantity?: boolean;
    };
  };
  quantity: number;
  subtotal: number;
  customLinePrice?: number;
  priceOverrideReason?: string;
  facetValues?: CartItemFacetValue[];
}

/**
 * Cart line item — two-row layout on mobile, single-row on desktop.
 *
 * Mobile:
 *   Row 1: [×] ProductName · VariantName
 *   Row 2: [−] qty [+]                   [↓] price [↑]
 *
 * Desktop:
 *   [×] ProductName · VariantName   [−] qty [+]   [↓] price [↑]
 */
@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [CommonModule, QuantityInputSheetComponent, PriceEditSheetComponent],
  template: `
    <div class="px-3 py-1.5 pr-4 md:py-2.5 md:px-4">
      <!-- Mobile: Row 1 = remove + product, Row 2 = qty (left) + price (right) -->
      <div class="flex flex-col gap-2 md:hidden">
        <!-- Row 1: remove, product details -->
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="btn btn-outline btn-square h-11 w-11 min-h-11 md:h-9 md:w-9 md:min-h-0 shrink-0 border-error/60 text-error/80 hover:bg-error/10 hover:border-error touch-manipulation"
            (click)="removeItem.emit(item().variant.id)"
            aria-label="Remove item"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="size-[1.2em]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-1.5 min-w-0">
              <span class="font-semibold text-sm truncate">{{ item().variant.productName }}</span>
              @if (item().variant.name !== item().variant.productName) {
                <span class="text-xs text-base-content/50 truncate shrink-0">{{
                  item().variant.name
                }}</span>
              }
            </div>
            @if (pillValues().length > 0) {
              <div class="flex flex-wrap gap-1 mt-0.5">
                @for (fv of pillValues(); track fv.name) {
                  <span class="badge badge-xs badge-ghost badge-outline">{{ fv.name }}</span>
                }
              </div>
            }
          </div>
        </div>
        <!-- Row 2: qty left, price right -->
        <div class="flex items-center justify-between">
          <div class="flex shrink-0 items-center">
            <ng-container *ngTemplateOutlet="qtyControls" />
          </div>
          <div class="flex shrink-0 items-center">
            <ng-container *ngTemplateOutlet="priceControls" />
          </div>
        </div>
      </div>

      <!-- Desktop: single-row table-like layout -->
      <div class="hidden md:flex md:items-center md:gap-4 md:min-w-0">
        <button
          class="btn btn-outline btn-square h-9 w-9 min-h-0 shrink-0 border-error/60 text-error/80 hover:bg-error/10 hover:border-error touch-manipulation"
          (click)="removeItem.emit(item().variant.id)"
          aria-label="Remove item"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div class="flex-1 min-w-0 py-0.5">
          <div class="flex items-baseline gap-2 min-w-0">
            <span class="font-semibold text-base truncate">{{ item().variant.productName }}</span>
            @if (item().variant.name !== item().variant.productName) {
              <span class="text-sm text-base-content/50 truncate shrink-0">{{
                item().variant.name
              }}</span>
            }
          </div>
          @if (pillValues().length > 0) {
            <div class="flex flex-wrap gap-1.5 mt-1">
              @for (fv of pillValues(); track fv.name) {
                <span class="badge badge-sm badge-ghost badge-outline">{{ fv.name }}</span>
              }
            </div>
          }
        </div>
        <div class="shrink-0">
          <ng-container *ngTemplateOutlet="qtyControls" />
        </div>
        <div class="shrink-0 min-w-[7rem]">
          <ng-container *ngTemplateOutlet="priceControls" />
        </div>
      </div>
    </div>

    <!-- ═══ SHARED TEMPLATES ═══ -->

    <!-- Quantity controls -->
    <ng-template #qtyControls>
      @if (allowsFractionalQuantity()) {
        <button
          class="btn btn-outline border-base-300 h-11 min-h-11 px-4 md:h-8 md:min-h-0 md:btn-xs md:px-2 touch-manipulation"
          (click)="openQuantitySheet()"
          aria-label="Edit quantity"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 md:h-3.5 md:w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          {{ item().quantity }}
        </button>
      } @else {
        <div class="inline-flex items-center">
          <button
            class="btn btn-outline btn-square border-base-300 h-11 w-11 min-h-11 md:h-9 md:w-9 md:min-h-0 touch-manipulation"
            (click)="decreaseQuantity()"
            [disabled]="item().quantity <= 1"
            aria-label="Decrease quantity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 md:h-4 md:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <span
            class="w-8 text-center font-bold text-base tabular-nums select-none md:w-6 md:text-sm"
            >{{ item().quantity }}</span
          >
          <button
            class="btn btn-outline btn-square border-base-300 h-11 w-11 min-h-11 md:h-9 md:w-9 md:min-h-0 touch-manipulation"
            (click)="increaseQuantity()"
            aria-label="Increase quantity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 md:h-4 md:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      }
    </ng-template>

    <!-- Price controls — relative z-10 ensures clicks aren't blocked by overlapping animations -->
    <ng-template #priceControls>
      <div class="relative z-10 inline-flex items-center">
        @if (canOverridePrices()) {
          <button
            class="btn btn-outline btn-square border-base-300 h-11 w-11 min-h-11 md:h-9 md:w-9 md:min-h-0 touch-manipulation"
            (click)="decreasePrice()"
            aria-label="Decrease price"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 md:h-4 md:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        }

        <!-- Price display — tap/click to edit (opens price modal) -->
        <button
          type="button"
          class="flex flex-col items-end rounded-lg px-3 py-2 min-h-11 min-w-[4rem] md:px-1.5 md:py-0.5 md:min-h-0 transition-colors touch-manipulation"
          [class.border]="canOverridePrices()"
          [class.border-base-300]="canOverridePrices()"
          [class.cursor-pointer]="canOverridePrices()"
          [class.hover:bg-base-200]="canOverridePrices()"
          [class.active:bg-base-300]="canOverridePrices()"
          [disabled]="!canOverridePrices()"
          (click)="onPriceDisplayClick($event)"
          [attr.aria-label]="canOverridePrices() ? 'Edit price' : null"
        >
          <span
            class="text-base font-bold tabular-nums leading-tight md:text-sm"
            [class.text-primary]="!isPriceOverridden() && !isBelowWholesalePrice()"
            [class.text-warning]="isPriceOverridden() && !isBelowWholesalePrice()"
            [class.text-error]="isBelowWholesalePrice()"
          >
            {{ getFormattedLinePrice() }}
          </span>
          <span class="text-xs text-base-content/50 tabular-nums leading-tight md:text-[10px]">
            @{{ getFormattedPerItemPrice() }}
          </span>
          @if (isBelowWholesalePrice()) {
            <span class="text-xs text-error font-medium leading-tight md:text-[10px]"
              >Below wholesale</span
            >
          }
        </button>

        @if (canOverridePrices()) {
          <button
            class="btn btn-outline btn-square border-base-300 h-11 w-11 min-h-11 md:h-9 md:w-9 md:min-h-0 touch-manipulation"
            (click)="increasePrice()"
            aria-label="Increase price"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 md:h-4 md:w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        }
      </div>
    </ng-template>

    <!-- Sheets — fixed positioned overlays -->
    <app-quantity-input-sheet
      [isOpen]="quantitySheetOpen()"
      [data]="quantityInputData()"
      (quantityUpdated)="onQuantityUpdated($event)"
      (closed)="closeQuantitySheet()"
    />
    @if (canOverridePrices()) {
      <app-price-edit-sheet
        [isOpen]="priceSheetOpen()"
        [data]="priceEditData()"
        (priceUpdated)="onPriceUpdated($event)"
        (closed)="closePriceSheet()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartItemComponent {
  // Inputs
  item = input.required<CartItemData>();
  canOverridePrices = input.required<boolean>();

  // Outputs
  quantityChange = output<{ variantId: string; quantity: number }>();
  priceChange = output<PriceOverrideData>();
  removeItem = output<string>();

  // Services
  currencyService = inject(CurrencyService);
  priceModificationService = inject(PriceModificationService);

  // State
  readonly quantitySheetOpen = signal(false);
  readonly priceSheetOpen = signal(false);

  // Computed
  isPriceOverridden = computed(() => this.item().customLinePrice !== undefined);

  /** Manufacturer/category pills (case-insensitive facet code match) */
  pillValues = computed(() => {
    const fvs = this.item().facetValues ?? [];
    return fvs.filter((fv) => {
      const code = (fv.facet?.code ?? fv.facetCode ?? '').toLowerCase();
      return code === 'manufacturer' || code === 'category';
    });
  });

  allowsFractionalQuantity = computed(
    () => this.item().variant.customFields?.allowFractionalQuantity || false,
  );

  isBelowWholesalePrice = computed(() => {
    const wholesalePrice = this.item().variant.customFields?.wholesalePrice;
    if (!wholesalePrice || !this.item().customLinePrice) return false;
    return this.item().customLinePrice! < wholesalePrice;
  });

  quantityInputData = computed((): QuantityInputData | null => {
    const item = this.item();
    if (!item) return null;
    return {
      variantId: item.variant.id,
      currentQuantity: item.quantity,
      allowFractionalQuantity: item.variant.customFields?.allowFractionalQuantity || false,
      pricePerUnit: item.variant.priceWithTax,
      variantName: item.variant.name,
    };
  });

  priceEditData = computed((): PriceEditData | null => {
    const item = this.item();
    if (!item) return null;
    const lineCents = item.customLinePrice ?? Math.round(item.subtotal);
    const baseCents = item.variant.priceWithTax;
    const wholesaleCents = item.variant.customFields?.wholesalePrice;
    return {
      variantId: item.variant.id,
      productName: item.variant.productName,
      variantName: item.variant.name,
      currentLinePrice: lineCents / 100,
      basePrice: baseCents / 100,
      quantity: item.quantity,
      wholesalePrice: wholesaleCents != null ? wholesaleCents / 100 : undefined,
    };
  });

  // ── Price change handlers ──

  onPriceChange(data: PriceOverrideData): void {
    this.priceChange.emit(data);
  }

  increasePrice(): void {
    if (!this.canOverridePrices()) return;
    const variantId = this.item().variant.id;
    const currentLineTotalCents = this.item().customLinePrice || Math.round(this.item().subtotal);
    const result = this.priceModificationService.increasePrice(
      variantId,
      currentLineTotalCents,
      'line',
    );
    if (!result) return;
    this.priceChange.emit({ variantId, customLinePrice: result.newPrice, reason: result.reason });
  }

  decreasePrice(): void {
    if (!this.canOverridePrices()) return;
    const variantId = this.item().variant.id;
    const currentLineTotalCents = this.item().customLinePrice || Math.round(this.item().subtotal);
    const wholesalePrice = this.item().variant.customFields?.wholesalePrice ?? 0;
    const result = this.priceModificationService.decreasePrice(
      variantId,
      currentLineTotalCents,
      this.item().quantity,
      wholesalePrice,
      'line',
    );
    if (!result) return;
    this.priceChange.emit({ variantId, customLinePrice: result.newPrice, reason: result.reason });
  }

  // ── Quantity handlers ──

  increaseQuantity(): void {
    this.quantityChange.emit({
      variantId: this.item().variant.id,
      quantity: this.item().quantity + 1,
    });
    if (this.item().customLinePrice !== undefined) {
      const variantId = this.item().variant.id;
      this.priceModificationService.clearStacks(variantId);
      this.priceChange.emit({
        variantId,
        customLinePrice: undefined,
        reason: 'Quantity changed - reset price',
      });
    }
  }

  decreaseQuantity(): void {
    if (this.item().quantity <= 1) return;
    this.quantityChange.emit({
      variantId: this.item().variant.id,
      quantity: this.item().quantity - 1,
    });
    if (this.item().customLinePrice !== undefined) {
      const variantId = this.item().variant.id;
      this.priceModificationService.clearStacks(variantId);
      this.priceChange.emit({
        variantId,
        customLinePrice: undefined,
        reason: 'Quantity changed - reset price',
      });
    }
  }

  // ── Price formatting ──

  getFormattedLinePrice(): string {
    if (this.item().customLinePrice !== undefined) {
      return this.currencyService.format(this.item().customLinePrice!, false);
    }
    return this.currencyService.format(Math.round(this.item().subtotal), false);
  }

  getFormattedPerItemPrice(): string {
    if (this.item().customLinePrice !== undefined) {
      return this.currencyService.format(
        Math.round(this.item().customLinePrice! / this.item().quantity),
        false,
      );
    }
    return this.currencyService.format(this.item().variant.priceWithTax, false);
  }

  getFormattedBasePrice(): string {
    return this.currencyService.format(this.item().variant.priceWithTax, false);
  }

  // ── Quantity sheet ──

  openQuantitySheet(): void {
    this.quantitySheetOpen.set(true);
  }
  closeQuantitySheet(): void {
    this.quantitySheetOpen.set(false);
  }
  onQuantityUpdated(data: { variantId: string; quantity: number }): void {
    this.quantityChange.emit(data);
  }
  getQuantityUnit(): string {
    const unit = this.item().variant.name;
    return unit ? ` ${unit}` : '';
  }

  // ── Price edit sheet ──

  openPriceSheet(): void {
    this.priceSheetOpen.set(true);
  }

  onPriceDisplayClick(event: Event): void {
    event.stopPropagation();
    if (this.canOverridePrices()) {
      this.openPriceSheet();
    }
  }
  closePriceSheet(): void {
    this.priceSheetOpen.set(false);
  }
  onPriceUpdated(data: { variantId: string; newLinePrice: number }): void {
    const variantId = data.variantId;
    const newLinePriceCents = Math.round(data.newLinePrice * 100);
    const baseCents = Math.round(this.item().variant.priceWithTax * this.item().quantity);
    this.priceModificationService.setCustomPrice(variantId, 'line', baseCents, newLinePriceCents);
    this.priceChange.emit({
      variantId,
      customLinePrice: newLinePriceCents,
      reason: 'Manual price entry',
    });
  }
}

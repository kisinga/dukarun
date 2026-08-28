import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Variant } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { StatusBadgeComponent, type BadgeType } from '../shared/ui/status-badge.component';
import type { PurchasePriceBasis } from '@dukarun/tax-types';

export interface PurchaseLineForm {
  key: number;
  variantId: string;
  quantity: number;
  unitCost: string;
  lineTotal: string;
  // Both values intentionally remain editable: supplier invoices may quote a unit price or an
  // indivisible flat line amount. This records which input must survive quantity/rounding changes.
  valueSource: 'unit' | 'total';
  batchNumber: string;
  expiryDate: string;
  wholesalePrice: string;
  retailPrice: string;
  expanded: boolean;
  error: string | null;
  defaultCostNeedsConversion?: boolean;
  grossAmountOverride?: number;
}

export type PurchaseLineDetailField =
  'batchNumber' | 'expiryDate' | 'wholesalePrice' | 'retailPrice';

export interface PurchaseLinePriceContext {
  supplierCost: number | null;
  supplierComparison: string;
  purchaseCount: number;
  wholesaleMargin: { label: string; type: BadgeType };
  retailMargin: { label: string; type: BadgeType };
  warning: string | null;
  catalogPriceChanged: boolean;
}

/** One purchase item row: dual cost entry plus progressively disclosed stock/catalog details. */
@Component({
  selector: 'app-purchase-line-row',
  imports: [
    FormsModule,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    StatusBadgeComponent,
  ],
  host: { class: 'block' },
  template: `
    <article
      data-learning-anchor="purchase-item-row"
      class="bg-base-100"
      [attr.data-line-key]="line().key"
    >
      <div
        class="grid gap-x-3 gap-y-2 p-3 md:grid-cols-6 md:items-center xl:grid-cols-[minmax(14rem,1fr)_7rem_10rem_10rem_3rem]"
      >
        <div class="min-w-0 md:col-span-6 xl:col-auto xl:pr-2">
          <p class="truncate text-sm font-semibold">{{ label() }}</p>
          <p class="type-caption truncate">
            {{ variant()?.sku }} · {{ variant()?.stock ?? 0 }} currently in stock
            @if (line().batchNumber) {
              · Batch {{ line().batchNumber }}
            }
            @if (trackExpiry() && line().expiryDate) {
              · Expires {{ line().expiryDate }}
            }
          </p>
        </div>
        <app-form-field
          label="Quantity"
          class="md:col-span-2 xl:col-auto"
          [desktopLabelHidden]="true"
        >
          <input
            data-quantity
            data-learning-anchor="purchase-item-quantity"
            type="number"
            class="input input-bordered h-11 w-full text-right tabular-nums md:h-10"
            min="0.001"
            step="1"
            [ngModel]="line().quantity"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="quantityChange.emit($event)"
          />
        </app-form-field>
        <app-form-field
          [label]="priceBasis() === 'exclusive' ? 'Unit cost before VAT' : 'Unit cost (KES)'"
          class="md:col-span-2 xl:col-auto"
          [desktopLabelHidden]="true"
        >
          <input
            data-learning-anchor="purchase-item-unit-cost"
            class="input input-bordered h-11 w-full text-right tabular-nums md:h-10"
            inputmode="numeric"
            [ngModel]="line().unitCost"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="unitCostChange.emit($event)"
          />
        </app-form-field>
        <app-form-field
          [label]="priceBasis() === 'exclusive' ? 'Line total before VAT' : 'Line total (KES)'"
          class="md:col-span-2 xl:col-auto"
          [desktopLabelHidden]="true"
        >
          <input
            class="input input-bordered h-11 w-full text-right font-semibold tabular-nums md:h-10"
            inputmode="numeric"
            [ngModel]="line().lineTotal"
            [ngModelOptions]="{ standalone: true }"
            (ngModelChange)="lineTotalChange.emit($event)"
          />
        </app-form-field>
        <div class="flex items-center justify-end md:col-span-6 xl:col-auto">
          <button
            appButton
            variant="ghost"
            [iconOnly]="true"
            type="button"
            title="Remove item"
            (click)="remove.emit()"
          >
            <app-icon name="heroXMark" />
          </button>
        </div>
      </div>
      @if (line().error) {
        <p class="px-3 pb-3 text-sm text-error">{{ line().error }}</p>
      }
      <button
        type="button"
        class="flex w-full items-center gap-3 border-t border-base-300 bg-base-200/30 px-3 py-2 text-left transition-colors hover:bg-base-200/60 focus-visible:outline-2 focus-visible:outline-primary"
        [title]="
          trackExpiry()
            ? 'Open batch, expiry, and catalogue price details'
            : 'Open batch and catalogue price details'
        "
        aria-haspopup="dialog"
        [attr.aria-controls]="'purchase-line-dialog-' + line().key"
        (click)="expandedChange.emit(true)"
      >
        <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5">
          <span class="flex min-w-0 items-center gap-1.5">
            <span class="type-caption shrink-0">This supplier</span>
            @if (priceContext().supplierCost !== null) {
              <span class="text-xs font-semibold">
                <app-money [amount]="priceContext().supplierCost!" />
              </span>
              <span class="type-caption truncate">
                {{ priceContext().supplierComparison }} ·
                {{ priceContext().purchaseCount }} purchase(s)
              </span>
            } @else {
              <span class="text-xs text-base-content/60">No purchase history</span>
            }
          </span>
          <span class="flex items-center gap-1.5">
            <span class="type-caption">Wholesale</span>
            <app-status-badge
              size="xs"
              [type]="priceContext().wholesaleMargin.type"
              [label]="priceContext().wholesaleMargin.label"
            />
          </span>
          <span class="flex items-center gap-1.5">
            <span class="type-caption">Retail</span>
            <app-status-badge
              size="xs"
              [type]="priceContext().retailMargin.type"
              [label]="priceContext().retailMargin.label"
            />
          </span>
        </span>
        <app-icon name="heroChevronRight" class="shrink-0 text-base-content/50" />
        <span class="sr-only">
          {{
            trackExpiry()
              ? 'Open batch, expiry, and catalogue price details'
              : 'Open batch and catalogue price details'
          }}
        </span>
      </button>
      @if (priceContext().warning) {
        <div
          class="alert alert-warning rounded-none border-x-0 border-b-0 py-2 text-sm"
          role="status"
        >
          <app-icon name="heroExclamationTriangle" />
          <span>{{ priceContext().warning }}</span>
        </div>
      }
      @if (priceContext().catalogPriceChanged) {
        <div class="flex items-center gap-2 border-t border-base-300 px-3 py-2 text-xs text-info">
          <app-icon name="heroArrowPath" />
          Catalog prices will update when this purchase is confirmed.
        </div>
      }
    </article>

    @if (line().expanded) {
      <dialog
        class="modal modal-open"
        [id]="'purchase-line-dialog-' + line().key"
        [attr.aria-labelledby]="'purchase-line-dialog-heading-' + line().key"
        (cancel)="$event.preventDefault(); expandedChange.emit(false)"
      >
        <section class="modal-box modal-box-task p-0 md:w-full md:max-w-3xl">
          <header class="flex items-start justify-between gap-3 border-b border-base-300 p-4">
            <div class="min-w-0">
              <h2 class="type-title truncate" [id]="'purchase-line-dialog-heading-' + line().key">
                {{ label() }}
              </h2>
              <p class="type-caption mt-1">
                {{
                  trackExpiry()
                    ? 'Batch, expiry, and catalogue pricing.'
                    : 'Batch and catalogue pricing.'
                }}
                Invoice quantities and costs stay editable in the table.
              </p>
            </div>
            <button
              appButton
              variant="ghost"
              [iconOnly]="true"
              type="button"
              aria-label="Close item details"
              (click)="expandedChange.emit(false)"
            >
              <app-icon name="heroXMark" />
            </button>
          </header>

          <div class="modal-body p-4">
            <section>
              <h3 class="section-title">Stock details</h3>
              <div class="mt-3 grid gap-3" [class.md:grid-cols-2]="trackExpiry()">
                <app-form-field label="Batch number" hint="Optional">
                  <input
                    class="input input-bordered h-11 w-full md:h-10"
                    [ngModel]="line().batchNumber"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="changeDetail('batchNumber', $event)"
                  />
                </app-form-field>
                @if (trackExpiry()) {
                  <app-form-field label="Expiry date" hint="Optional">
                    <input
                      type="date"
                      class="input input-bordered h-11 w-full md:h-10"
                      [ngModel]="line().expiryDate"
                      [ngModelOptions]="{ standalone: true }"
                      (ngModelChange)="changeDetail('expiryDate', $event)"
                    />
                  </app-form-field>
                }
              </div>
            </section>

            <section class="mt-5 border-t border-base-300 pt-4">
              <h3 class="section-title">Catalogue selling prices</h3>
              <p class="type-caption mt-1">
                Changes apply to the product catalogue when the purchase is confirmed.
              </p>
              <div class="mt-3 grid gap-3 md:grid-cols-2">
                <app-form-field label="Wholesale price (KES)">
                  <input
                    class="input input-bordered h-11 w-full text-right md:h-10"
                    inputmode="numeric"
                    [readonly]="!canEditPrices()"
                    [ngModel]="line().wholesalePrice"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="changeDetail('wholesalePrice', $event)"
                  />
                </app-form-field>
                <app-form-field label="Retail price (KES)">
                  <input
                    class="input input-bordered h-11 w-full text-right md:h-10"
                    inputmode="numeric"
                    [readonly]="!canEditPrices()"
                    [ngModel]="line().retailPrice"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="changeDetail('retailPrice', $event)"
                  />
                </app-form-field>
              </div>
              @if (!canEditPrices()) {
                <p class="mt-3 text-sm text-base-content/60">
                  Your role can view catalogue prices but cannot change them.
                </p>
              }
            </section>
          </div>

          <footer class="flex justify-end border-t border-base-300 p-4">
            <button appButton type="button" (click)="expandedChange.emit(false)">Done</button>
          </footer>
        </section>
        <form method="dialog" class="modal-backdrop">
          <button type="button" (click)="expandedChange.emit(false)">Close item details</button>
        </form>
      </dialog>
    }
  `,
})
export class PurchaseLineRowComponent {
  readonly line = input.required<PurchaseLineForm>();
  readonly variant = input<Variant>();
  readonly label = input.required<string>();
  readonly canEditPrices = input(false);
  /** Batch identity remains useful independently; this preference gates expiry only. */
  readonly trackExpiry = input(false);
  readonly priceContext = input.required<PurchaseLinePriceContext>();
  readonly priceBasis = input<PurchasePriceBasis>('inclusive');

  readonly quantityChange = output<number | string>();
  readonly unitCostChange = output<string>();
  readonly lineTotalChange = output<string>();
  readonly detailChange = output<{ field: PurchaseLineDetailField; value: string }>();
  readonly expandedChange = output<boolean>();
  readonly remove = output<void>();

  protected changeDetail(field: PurchaseLineDetailField, value: string): void {
    this.detailChange.emit({ field, value });
  }
}

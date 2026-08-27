import { Component, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { CartLine } from '../cart.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { SellCartLineComponent } from './sell-cart-line.component';

export interface SellCartLineViewModel {
  line: CartLine;
  label: string;
}

export interface SellCartViewModel {
  lines: readonly SellCartLineViewModel[];
  busy: boolean;
  clearArmed: boolean;
  canOverridePrices: boolean;
  floorRejectedVariantId: string | null;
  overrideFor: string | null;
}

export type SellCartIntent =
  | { type: 'arm-clear' }
  | { type: 'cancel-clear' }
  | { type: 'clear' }
  | { type: 'remove'; variantId: string }
  | { type: 'quantity-step'; variantId: string; direction: 1 | -1 }
  | { type: 'quantity-change'; variantId: string; quantity: number | string }
  | { type: 'price-step'; line: CartLine; direction: 1 | -1 }
  | { type: 'price-edit'; line: CartLine }
  | { type: 'price-reset'; line: CartLine }
  | { type: 'close-price-editor' }
  | { type: 'apply-price' };

/** Cart rendering is isolated from checkout orchestration; changes return as typed cart intents. */
@Component({
  selector: 'app-sell-cart-panel',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    SellCartLineComponent,
  ],
  template: `
    <section
      id="current-sale"
      class="card order-3 min-w-0 scroll-mt-4 overflow-hidden bg-base-100 xl:col-start-1 xl:row-start-2"
    >
      <div
        class="flex items-center justify-between gap-3 border-b border-base-content/15 px-3 py-2.5 sm:px-4 sm:py-3"
      >
        <div>
          <h2 class="type-heading">Current sale</h2>
          @if (viewModel().lines.length > 0) {
            <p class="type-caption">
              {{ viewModel().lines.length }}
              {{ viewModel().lines.length === 1 ? 'product' : 'products' }}
            </p>
          }
        </div>
        @if (viewModel().lines.length > 0) {
          @if (viewModel().clearArmed) {
            <div
              class="flex items-center gap-1"
              role="group"
              aria-label="Confirm clearing the current sale"
            >
              <button
                appButton
                variant="ghost"
                size="sm"
                [disabled]="viewModel().busy"
                (click)="intent.emit({ type: 'cancel-clear' })"
              >
                Keep sale
              </button>
              <button
                appButton
                variant="error"
                size="sm"
                [disabled]="viewModel().busy"
                (click)="intent.emit({ type: 'clear' })"
              >
                Clear all
              </button>
            </div>
          } @else {
            <button
              appButton
              variant="ghost"
              size="sm"
              class="text-base-content/60 hover:text-error"
              [disabled]="viewModel().busy"
              (click)="intent.emit({ type: 'arm-clear' })"
            >
              Clear cart
            </button>
          }
        }
      </div>

      @if (viewModel().lines.length === 0) {
        <div class="p-4">
          <app-empty-state
            [embedded]="true"
            [compact]="true"
            icon="heroShoppingCart"
            title="Cart is empty"
            description="Tap a quick product or search above to start the sale."
          />
        </div>
      } @else {
        <div>
          @for (item of viewModel().lines; track item.line.variant.variant_id) {
            <div
              class="border-b border-base-content/15 bg-base-100 last:border-b-0 even:bg-base-200/20"
            >
              <app-sell-cart-line
                [line]="item.line"
                [label]="item.label"
                [canOverridePrice]="viewModel().canOverridePrices"
                [floorRejected]="
                  viewModel().floorRejectedVariantId === item.line.variant.variant_id
                "
                (quantityStep)="
                  intent.emit({
                    type: 'quantity-step',
                    variantId: item.line.variant.variant_id!,
                    direction: $event,
                  })
                "
                (quantityChanged)="
                  intent.emit({
                    type: 'quantity-change',
                    variantId: item.line.variant.variant_id!,
                    quantity: $event,
                  })
                "
                (priceStep)="
                  intent.emit({ type: 'price-step', line: item.line, direction: $event })
                "
                (priceEdit)="intent.emit({ type: 'price-edit', line: item.line })"
                (priceReset)="intent.emit({ type: 'price-reset', line: item.line })"
                (removed)="
                  intent.emit({ type: 'remove', variantId: item.line.variant.variant_id! })
                "
              />

              @if (viewModel().overrideFor === item.line.variant.variant_id) {
                <div class="border-t border-base-content/15 bg-base-200/70 p-3 sm:p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">Set exact unit price</p>
                      <p class="mt-0.5 text-xs text-base-content/60">
                        Whole KES only. Quick arrows remain the fastest option.
                      </p>
                    </div>
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      [iconOnly]="true"
                      aria-label="Close price editor"
                      (click)="intent.emit({ type: 'close-price-editor' })"
                    >
                      <app-icon name="heroXMark" />
                    </button>
                  </div>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <app-form-field label="Unit price (KES)" [required]="true">
                      <input
                        type="text"
                        inputmode="numeric"
                        class="input input-bordered min-h-11 w-full"
                        [formControl]="overridePrice()"
                      />
                    </app-form-field>
                    <app-form-field label="Reason" hint="Optional; saved on the sale line.">
                      <input
                        type="text"
                        class="input input-bordered min-h-11 w-full"
                        placeholder="e.g. Damaged packaging"
                        [formControl]="overrideReason()"
                      />
                    </app-form-field>
                  </div>
                  <div class="mt-3 flex flex-wrap justify-end gap-2">
                    @if (item.line.customPrice !== null) {
                      <button
                        appButton
                        variant="ghost"
                        size="md"
                        (click)="intent.emit({ type: 'price-reset', line: item.line })"
                      >
                        Use base price
                      </button>
                    }
                    <button
                      appButton
                      variant="outline"
                      size="md"
                      (click)="intent.emit({ type: 'close-price-editor' })"
                    >
                      Cancel
                    </button>
                    <button appButton size="md" (click)="intent.emit({ type: 'apply-price' })">
                      Apply price
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class SellCartPanelComponent {
  readonly viewModel = input.required<SellCartViewModel>();
  readonly overridePrice = input.required<FormControl<string>>();
  readonly overrideReason = input.required<FormControl<string>>();
  readonly intent = output<SellCartIntent>();
}

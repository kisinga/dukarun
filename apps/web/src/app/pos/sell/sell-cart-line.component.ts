import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type CartLine } from '../cart.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';

/**
 * Mobile-first sale line controls. Quantity and price both stay one tap away;
 * direct entry is still available through the centre quantity field and price editor.
 */
@Component({
  selector: 'app-sell-cart-line',
  imports: [FormsModule, ButtonComponent, IconComponent, MoneyComponent],
  host: { class: 'block min-w-0' },
  template: `
    <article class="sale-line" [class.sale-line--floor-rejected]="floorRejected()">
      <div class="sale-line-summary">
        <button
          type="button"
          class="sale-line-name group"
          [attr.aria-label]="'Details for ' + label()"
          [attr.aria-expanded]="detailsOpen()"
          [attr.aria-controls]="detailsId()"
          (click)="detailsOpen.set(!detailsOpen())"
        >
          <span class="sale-details-caret" aria-hidden="true">
            <app-icon
              name="heroChevronRight"
              size="md"
              class="transition-transform duration-150 motion-reduce:transition-none"
              [class.rotate-90]="detailsOpen()"
            />
          </span>
          <span class="sale-product-title min-w-0">
            <span class="min-w-0 line-clamp-2">{{ label() }}</span>
          </span>
        </button>
        @if (
          line().variant.manufacturer_name ||
          line().variant.kind === 'service' ||
          (line().unitsPerUnit ?? 1) > 1
        ) {
          <div class="sale-product-meta">
            @if (line().variant.manufacturer_name) {
              <span class="max-w-full truncate">
                {{ line().variant.manufacturer_name }}
              </span>
            } @else if (line().variant.kind === 'service') {
              <span class="text-base-content/60">Service</span>
            }
            @if ((line().unitsPerUnit ?? 1) > 1) {
              <span class="text-base-content/60"
                >{{ line().unitsPerUnit }} {{ line().stockUnit || 'items' }} /
                {{ unitName() }}</span
              >
            }
          </div>
        }
        <p class="sale-line-total" [attr.aria-label]="'Line total for ' + label()">
          <span class="sale-total-label">Total</span>
          <app-money [amount]="lineTotal()" />
        </p>
        <button
          appButton
          variant="ghost"
          size="md"
          [iconOnly]="true"
          type="button"
          class="sale-line-remove"
          [title]="'Remove ' + label()"
          [attr.aria-label]="'Remove ' + label()"
          (click)="removed.emit()"
        >
          <app-icon name="heroXMark" size="md" />
        </button>
      </div>

      <div class="sale-line-controls">
        <div class="sale-price-field">
          <div class="sale-field-label">
            <span class="shrink-0">Price /</span>
            @if ((line().variant.packs?.length ?? 0) > 0) {
              <button
                type="button"
                class="sale-line-unit"
                [attr.aria-label]="'Change selling unit for ' + label() + ': ' + unitName()"
                title="Change unit"
                (click)="unitEdit.emit()"
              >
                <span class="truncate underline decoration-dotted underline-offset-4">{{
                  unitName()
                }}</span>
                <span class="sr-only">Change unit</span>
              </button>
            } @else {
              <span class="truncate" [title]="unitName()">{{ unitName() }}</span>
            }
            @if (overridden()) {
              <span class="sale-price-reset">
                <span class="sr-only">Price adjusted · Was KES {{ line().unitPrice }}</span>
                @if (canOverridePrice()) {
                  <button
                    appButton
                    variant="ghost"
                    type="button"
                    aria-label="Reset price"
                    [title]="'Reset to KES ' + line().unitPrice"
                    (click)="priceReset.emit()"
                  >
                    Reset
                  </button>
                }
              </span>
            }
          </div>
          <div
            class="sale-price-control"
            [class.sale-price-control--adjusted]="overridden()"
            role="group"
            [attr.aria-label]="'Price for ' + label()"
          >
            @if (canOverridePrice()) {
              <button
                appButton
                variant="ghost"
                size="md"
                [iconOnly]="true"
                type="button"
                [attr.aria-label]="'Reduce price of ' + label()"
                (click)="priceStep.emit(-1)"
              >
                <app-icon name="heroMinus" size="md" />
              </button>
              <button
                type="button"
                class="sale-line-price"
                [attr.aria-label]="'Edit price for ' + label()"
                [attr.aria-expanded]="priceEditorOpen()"
                (click)="priceEdit.emit()"
              >
                <app-money [amount]="effectivePrice()" />
                <app-icon
                  name="heroPencilSquare"
                  size="sm"
                  class="sale-price-edit-icon text-base-content/60"
                />
              </button>
              <button
                appButton
                variant="ghost"
                size="md"
                [iconOnly]="true"
                type="button"
                [attr.aria-label]="'Increase price of ' + label()"
                (click)="priceStep.emit(1)"
              >
                <app-icon name="heroPlus" size="md" />
              </button>
            } @else {
              <span class="sale-line-price sale-price-readonly"
                ><app-money [amount]="effectivePrice()"
              /></span>
            }
          </div>
        </div>
        <div class="sale-quantity-field">
          <span class="sale-field-label">Quantity</span>

          <div class="sale-quantity" role="group" [attr.aria-label]="'Quantity in ' + unitName()">
            <button
              appButton
              variant="ghost"
              size="md"
              [iconOnly]="true"
              type="button"
              class="sale-quantity-step"
              [attr.aria-label]="'Reduce quantity of ' + label()"
              (click)="quantityStep.emit(-1)"
            >
              <app-icon name="heroMinus" size="md" />
            </button>
            <input
              type="number"
              inputmode="decimal"
              class="sale-quantity-input"
              [min]="!line().packId && line().variant.allow_fractional ? 0.5 : 1"
              [step]="!line().packId && line().variant.allow_fractional ? 0.5 : 1"
              [ngModel]="line().quantity"
              [attr.aria-label]="'Quantity for ' + label()"
              (change)="emitQuantity($event)"
            />
            <button
              appButton
              variant="ghost"
              size="md"
              [iconOnly]="true"
              type="button"
              class="sale-quantity-step"
              [attr.aria-label]="'Increase quantity of ' + label()"
              (click)="quantityStep.emit(1)"
            >
              <app-icon name="heroPlus" size="md" />
            </button>
          </div>
        </div>
      </div>

      @if (floorRejected()) {
        <p [id]="floorMessageId()" class="mt-1 text-xs font-medium text-error" role="alert">
          {{ hasWholesaleFloor() ? 'Wholesale floor' : 'Minimum price' }}
          <app-money [amount]="minimumPrice()" />
        </p>
      }
      @if (detailsOpen()) {
        <div class="sale-line-details" [id]="detailsId()">
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            @if (line().variant.sku) {
              <dt class="text-base-content/70">SKU</dt>
              <dd class="break-all">{{ line().variant.sku }}</dd>
            }
            @if (line().variant.manufacturer_name) {
              <dt class="text-base-content/70">Manufacturer</dt>
              <dd>{{ line().variant.manufacturer_name }}</dd>
            }
            <dt class="text-base-content/70">Selling unit</dt>
            <dd>
              {{ unitName() }}
              @if ((line().unitsPerUnit ?? 1) > 1) {
                · {{ line().unitsPerUnit }} {{ line().stockUnit || 'items' }} per pack
              }
            </dd>
            @if (line().variant.allow_fractional && !line().packId) {
              <dt class="text-base-content/70">Quantity</dt>
              <dd>Fractional quantities allowed</dd>
            }
            @if (line().overrideReason) {
              <dt class="text-base-content/70">Price note</dt>
              <dd>{{ line().overrideReason }}</dd>
            }
          </dl>
        </div>
      }
    </article>
  `,
  styles: `
    :host {
      container-type: inline-size;
    }

    .sale-line {
      padding: 0.875rem 1rem 1rem;
    }
    .sale-line-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 2.75rem;
      align-items: center;
      column-gap: 0.75rem;
    }
    .sale-line-name {
      grid-column: 1;
      grid-row: 1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      min-height: 2.75rem;
      text-align: left;
      cursor: pointer;
    }
    .sale-details-caret {
      display: inline-flex;
      flex: 0 0 1.5rem;
      height: 1.5rem;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-selector);
      color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
    }
    .sale-line-name:hover .sale-details-caret,
    .sale-line-name:focus-visible .sale-details-caret {
      background: var(--surface-inset);
      color: var(--color-base-content);
    }
    .sale-product-title {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.375rem;
      letter-spacing: -0.015em;
    }
    .sale-product-meta {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      min-width: 0;
      flex-wrap: wrap;
      gap: 0.25rem 0.5rem;
      margin-top: 0.25rem;
      padding-left: 2rem;
      color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
      font-size: 0.75rem;
      font-weight: 400;
      line-height: 1rem;
    }
    .sale-line-total {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      min-height: 2.75rem;
      flex-direction: column;
      justify-content: center;
      font-size: 1.375rem;
      line-height: 1.625rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: right;
      letter-spacing: -0.025em;
    }
    .sale-total-label {
      display: block;
      font-size: 0.6875rem;
      line-height: 1rem;
      font-weight: 500;
      letter-spacing: 0;
      color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
    }
    .sale-price-reset {
      margin-left: auto;
      flex-shrink: 0;
    }
    .sale-price-reset button {
      color: var(--color-primary);
      font-size: 0.75rem;
      padding-inline: 0.25rem;
      min-width: 2.75rem;
      min-height: 2.75rem;
    }
    .sale-line-remove {
      grid-column: 3;
      grid-row: 1;
      border: 0;
      border-radius: var(--radius-field);
      color: color-mix(in oklab, var(--color-base-content) 45%, transparent);
    }
    .sale-line-remove:hover {
      color: var(--color-error);
      background: color-mix(in oklab, var(--color-error) 8%, transparent);
    }
    .sale-line-controls {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      align-items: start;
      gap: 0.75rem;
      max-width: 28rem;
      margin-top: 0.5rem;
      padding-top: 0.25rem;
      border-top: 1px solid color-mix(in oklab, var(--surface-border) 55%, transparent);
    }
    .sale-price-field {
      min-width: 0;
    }
    .sale-field-label {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      height: 2.75rem;
      min-width: 0;
      font-size: 0.75rem;
      color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
    }
    .sale-price-control {
      display: grid;
      grid-template-columns: 2.75rem minmax(3.5rem, 1fr) 2.75rem;
      align-items: center;
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-field);
      background: color-mix(in oklab, var(--surface-inset) 55%, var(--surface-content));
    }
    .sale-price-control > button.counter-btn,
    .sale-quantity-step.counter-btn {
      color: var(--color-primary);
      background: color-mix(in oklab, var(--color-primary) 4%, transparent);
      padding: 0;
    }
    .sale-price-control > button.counter-btn:hover,
    .sale-price-control > button.counter-btn:focus-visible,
    .sale-quantity-step.counter-btn:hover,
    .sale-quantity-step.counter-btn:focus-visible {
      background: color-mix(in oklab, var(--color-primary) 12%, transparent);
    }
    .sale-price-control > button.counter-btn:active,
    .sale-quantity-step.counter-btn:active {
      background: color-mix(in oklab, var(--color-primary) 18%, transparent);
    }
    .sale-price-control--adjusted {
      border-color: color-mix(in oklab, var(--color-primary) 35%, var(--surface-border));
      background: color-mix(in oklab, var(--color-primary) 5%, var(--surface-content));
    }
    .sale-line-price,
    .sale-line-unit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 2.75rem;
      min-width: 2.75rem;
      cursor: pointer;
    }
    .sale-line-price {
      font-size: 0.875rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .sale-line-unit {
      max-width: 100%;
      justify-content: start;
    }
    .sale-price-readonly {
      grid-column: 1 / -1;
      cursor: default;
    }
    .sale-quantity {
      display: grid;
      grid-template-columns: 2.75rem minmax(2.75rem, 1fr) 2.75rem;
      align-items: center;
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-field);
      background: color-mix(in oklab, var(--surface-inset) 55%, var(--surface-content));
    }
    .sale-quantity-step {
      padding: 0;
    }
    .sale-quantity-input {
      appearance: textfield;
      width: 100%;
      min-width: 0;
      min-height: 2.75rem;
      border: 0;
      border-radius: var(--radius-selector);
      background: transparent;
      padding: 0;
      color: var(--color-base-content);
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .sale-quantity-input::-webkit-inner-spin-button,
    .sale-quantity-input::-webkit-outer-spin-button {
      appearance: none;
      margin: 0;
    }
    :is(.sale-line-name, .sale-line-price, .sale-line-unit, .sale-quantity-input):focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
      border-radius: var(--radius-selector);
    }
    .sale-line-details {
      margin-top: 0.5rem;
      padding: 0.75rem;
      border-radius: var(--radius-field);
      background: var(--surface-inset);
    }
    .sale-line--floor-rejected {
      background: color-mix(in oklab, var(--color-error) 8%, transparent);
      box-shadow: inset 3px 0 0 var(--color-error);
    }
    @container (min-width: 46rem) {
      .sale-line {
        display: grid;
        grid-template-columns:
          minmax(0, 1fr) minmax(10rem, 12rem) 8.375rem minmax(5rem, max-content)
          2.75rem;
        grid-template-rows: 2.75rem auto;
        align-items: center;
        gap: 0 0.75rem;
      }
      .sale-line-summary,
      .sale-line-controls,
      .sale-price-field,
      .sale-quantity-field,
      .sale-line-total {
        display: contents;
      }
      .sale-line-name {
        grid-column: 1;
        grid-row: 2;
      }
      .sale-product-meta {
        grid-column: 1;
        grid-row: 3;
      }
      .sale-price-field > .sale-field-label {
        grid-column: 2;
        grid-row: 1;
      }
      .sale-price-control {
        grid-column: 2;
        grid-row: 2;
      }
      .sale-quantity-field > .sale-field-label {
        grid-column: 3;
        grid-row: 1;
      }
      .sale-quantity {
        grid-column: 3;
        grid-row: 2;
      }
      .sale-total-label {
        grid-column: 4;
        grid-row: 1;
        font-size: 0.75rem;
      }
      .sale-line-total > app-money {
        grid-column: 4;
        grid-row: 2;
      }
      .sale-line-remove {
        grid-column: 5;
        grid-row: 2;
      }
      .sale-line > p {
        grid-column: 1 / -1;
      }
      .sale-line-details {
        grid-column: 1 / -1;
      }
    }
    @container (max-width: 24rem) {
      .sale-line {
        padding-inline: 0.75rem;
      }
      .sale-line-controls {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 0.5rem;
      }
      .sale-price-control {
        grid-template-columns: 2.75rem minmax(2.75rem, 1fr) 2.75rem;
      }
      .sale-price-edit-icon {
        width: 0.75rem;
        height: 0.75rem;
        flex: 0 0 0.75rem;
      }
      .sale-line-price {
        font-size: 0.75rem;
        gap: 0.125rem;
        overflow-wrap: anywhere;
      }
    }
    @container (max-width: 20rem) {
      .sale-line-controls {
        grid-template-columns: minmax(0, 1fr);
      }
      .sale-quantity-field {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .sale-quantity {
        min-width: 8.375rem;
      }
    }
  `,
})
export class SellCartLineComponent {
  readonly unitEdit = output<void>();
  readonly line = input.required<CartLine>();
  readonly label = input.required<string>();
  readonly canOverridePrice = input(false);
  readonly priceEditorOpen = input(false);
  protected readonly detailsOpen = signal(false);
  readonly floorRejected = input(false);

  readonly quantityStep = output<1 | -1>();
  readonly quantityChanged = output<number>();
  readonly priceStep = output<1 | -1>();
  readonly priceEdit = output<void>();
  readonly priceReset = output<void>();
  readonly removed = output<void>();

  protected unitName(): string {
    return this.line().unitName || this.line().variant.stock_unit || 'item';
  }

  protected detailsId(): string {
    return `sale-line-details-${this.line().id ?? this.line().variant.variant_id}`;
  }

  protected effectivePrice(): number {
    return this.line().customPrice ?? this.line().unitPrice;
  }

  protected lineTotal(): number {
    return Math.round(this.line().quantity * this.effectivePrice());
  }

  protected overridden(): boolean {
    return this.line().customPrice !== null;
  }

  protected minimumPrice(): number {
    return Math.max(
      1,
      this.line().packId ? this.line().unitPrice : (this.line().variant.wholesale_price ?? 0)
    );
  }

  protected hasWholesaleFloor(): boolean {
    return !this.line().packId && (this.line().variant.wholesale_price ?? 0) > 0;
  }

  protected floorMessageId(): string {
    return `wholesale-floor-${this.line().id ?? this.line().variant.variant_id}`;
  }

  protected emitQuantity(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    // Cleared field: Number('') === 0 would silently delete the line — ignore.
    if (raw.trim() === '') return;
    const quantity = Number(raw);
    if (Number.isFinite(quantity)) this.quantityChanged.emit(quantity);
  }
}

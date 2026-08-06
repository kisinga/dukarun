import { Component, input, output } from '@angular/core';
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
    <article
      class="sale-line px-3 py-2.5 sm:px-4 sm:py-3"
      [class.sale-line--floor-rejected]="floorRejected()"
    >
      <div class="sale-line-summary flex min-w-0 items-start gap-2">
        <div class="min-w-0 flex-1 pt-0.5">
          <p class="truncate text-sm font-semibold">{{ label() }}</p>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            @if (line().variant.sku) {
              <span class="type-caption">{{ line().variant.sku }}</span>
            }
            @if (line().variant.manufacturer_name) {
              <span class="badge badge-ghost badge-xs">{{ line().variant.manufacturer_name }}</span>
            }
            @if (line().variant.allow_fractional) {
              <span class="badge badge-ghost badge-xs">fractional</span>
            }
            @if (overridden()) {
              <span class="badge badge-info badge-xs">price adjusted</span>
            }
          </div>
        </div>

        <button
          appButton
          variant="ghost"
          size="sm"
          [iconOnly]="true"
          type="button"
          class="shrink-0 text-base-content/50 hover:text-error"
          [attr.aria-label]="'Remove ' + label()"
          (click)="removed.emit()"
        >
          <app-icon name="heroXMark" />
        </button>
      </div>

      <div
        class="sale-line-controls mt-2 grid grid-cols-[minmax(9rem,1.2fr)_minmax(7.75rem,0.8fr)] gap-2 border-t border-base-content/15 pt-2 sm:gap-3 sm:pt-3"
      >
        <div>
          <div class="mb-1 flex items-center justify-between gap-1">
            <p class="type-caption">Price each</p>
            @if (overridden()) {
              <button
                type="button"
                class="link link-hover text-xs text-base-content/60"
                (click)="priceReset.emit()"
              >
                Reset
              </button>
            }
          </div>
          <div class="join flex w-full">
            @if (canOverridePrice()) {
              <button
                appButton
                variant="outline"
                size="md"
                [iconOnly]="true"
                type="button"
                class="join-item"
                [class.border-error]="floorRejected()"
                [class.text-error]="floorRejected()"
                [attr.aria-label]="'Reduce price of ' + label()"
                [attr.aria-describedby]="floorRejected() ? floorMessageId() : null"
                (click)="priceStep.emit(-1)"
              >
                <app-icon name="heroChevronDown" />
              </button>
            }
            @if (canOverridePrice()) {
              <button
                appButton
                variant="outline"
                size="md"
                type="button"
                class="join-item min-w-0 flex-1 rounded-none px-1 text-sm font-bold tabular-nums sm:px-2"
                [attr.aria-label]="'Edit price for ' + label()"
                (click)="priceEdit.emit()"
              >
                <app-money [amount]="effectivePrice()" />
                <app-icon name="heroPencilSquare" size="sm" class="hidden sm:inline-flex" />
              </button>
            } @else {
              <p
                class="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-field border border-base-content/15 bg-base-200/40 px-2 text-sm font-bold tabular-nums"
              >
                <app-money [amount]="effectivePrice()" />
              </p>
            }
            @if (canOverridePrice()) {
              <button
                appButton
                variant="outline"
                size="md"
                [iconOnly]="true"
                type="button"
                class="join-item"
                [attr.aria-label]="'Increase price of ' + label()"
                (click)="priceStep.emit(1)"
              >
                <app-icon name="heroChevronUp" />
              </button>
            }
          </div>
          @if (overridden()) {
            <p class="mt-0.5 truncate text-right text-xs text-base-content/50">
              Base <app-money [amount]="line().unitPrice" />
            </p>
          }
          @if (floorRejected()) {
            <p
              [id]="floorMessageId()"
              class="mt-1 text-right text-xs font-medium text-error"
              aria-live="assertive"
            >
              {{ hasWholesaleFloor() ? 'Wholesale floor' : 'Minimum price' }}
              <app-money [amount]="minimumPrice()" />
            </p>
          }
        </div>

        <div>
          <p class="type-caption mb-1">Quantity</p>
          <div class="join flex w-full">
            <button
              appButton
              variant="outline"
              size="md"
              [iconOnly]="true"
              type="button"
              class="join-item"
              [attr.aria-label]="'Reduce quantity of ' + label()"
              (click)="quantityStep.emit(-1)"
            >
              <app-icon name="heroMinus" />
            </button>
            <input
              type="number"
              class="input input-bordered join-item min-h-11 min-w-9 flex-1 px-1 text-center font-semibold tabular-nums"
              [min]="line().variant.allow_fractional ? 0.5 : 1"
              [step]="line().variant.allow_fractional ? 0.5 : 1"
              [ngModel]="line().quantity"
              [attr.aria-label]="'Quantity for ' + label()"
              (change)="emitQuantity($event)"
            />
            <button
              appButton
              variant="outline"
              size="md"
              [iconOnly]="true"
              type="button"
              class="join-item"
              [attr.aria-label]="'Increase quantity of ' + label()"
              (click)="quantityStep.emit(1)"
            >
              <app-icon name="heroPlus" />
            </button>
          </div>
        </div>
      </div>

      <div
        class="sale-line-total mt-2 flex items-center justify-between gap-3 border-t border-base-content/15 pt-2"
      >
        <div>
          <p class="type-caption">Line total</p>
          <p class="text-xs text-base-content/50">{{ line().quantity }} × price each</p>
        </div>
        <p class="type-heading shrink-0 tabular-nums">
          <app-money [amount]="lineTotal()" />
        </p>
      </div>
    </article>
  `,
  styles: `
    :host {
      container-type: inline-size;
    }

    .sale-line--floor-rejected {
      animation: price-floor-shake 320ms ease-in-out;
      background: color-mix(in oklab, var(--color-error) 8%, transparent);
      box-shadow: inset 3px 0 0 color-mix(in oklab, var(--color-error) 75%, transparent);
    }

    @keyframes price-floor-shake {
      0%,
      100% {
        transform: translateX(0);
      }
      25% {
        transform: translateX(-4px);
      }
      50% {
        transform: translateX(4px);
      }
      75% {
        transform: translateX(-2px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sale-line--floor-rejected {
        animation: none;
      }
    }

    @container (min-width: 46rem) {
      .sale-line {
        display: grid;
        grid-template-columns: minmax(12rem, 1fr) minmax(21rem, 24rem) minmax(6.5rem, auto);
        align-items: end;
        gap: 1.25rem;
      }

      .sale-line-summary {
        align-self: center;
      }

      .sale-line-controls {
        grid-template-columns: minmax(11.75rem, 1fr) 8.5rem;
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
      }

      .sale-line-total {
        display: block;
        margin-top: 0;
        padding-top: 0;
        border-top: 0;
        text-align: right;
      }
    }
  `,
})
export class SellCartLineComponent {
  readonly line = input.required<CartLine>();
  readonly label = input.required<string>();
  readonly canOverridePrice = input(false);
  readonly floorRejected = input(false);

  readonly quantityStep = output<1 | -1>();
  readonly quantityChanged = output<number>();
  readonly priceStep = output<1 | -1>();
  readonly priceEdit = output<void>();
  readonly priceReset = output<void>();
  readonly removed = output<void>();

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
    return Math.max(1, this.line().variant.wholesale_price ?? 0);
  }

  protected hasWholesaleFloor(): boolean {
    return (this.line().variant.wholesale_price ?? 0) > 0;
  }

  protected floorMessageId(): string {
    return `wholesale-floor-${this.line().variant.variant_id}`;
  }

  protected emitQuantity(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    // Cleared field: Number('') === 0 would silently delete the line — ignore.
    if (raw.trim() === '') return;
    const quantity = Number(raw);
    if (Number.isFinite(quantity)) this.quantityChanged.emit(quantity);
  }
}

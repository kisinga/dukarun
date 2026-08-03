import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import {
  heroChevronDown,
  heroChevronUp,
  heroMinus,
  heroPencilSquare,
} from '@ng-icons/heroicons/outline';
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
  providers: [provideIcons({ heroChevronDown, heroChevronUp, heroMinus, heroPencilSquare })],
  template: `
    <article class="px-3 py-2.5 sm:px-4 sm:py-3">
      <div class="flex min-w-0 items-start gap-2">
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

        <div class="min-w-0 flex-1 pt-0.5">
          <p class="truncate text-sm font-semibold">{{ label() }}</p>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            @if (line().variant.sku) {
              <span class="type-caption">{{ line().variant.sku }}</span>
            }
            @if (line().variant.allow_fractional) {
              <span class="badge badge-ghost badge-xs">fractional</span>
            }
            @if (overridden()) {
              <span class="badge badge-info badge-xs">price adjusted</span>
            }
          </div>
        </div>

        <div class="shrink-0 pt-0.5 text-right">
          <p class="type-caption">Line total</p>
          <p class="font-bold"><app-money [cents]="lineTotal()" /></p>
        </div>
      </div>

      <div
        class="mt-2 grid grid-cols-[minmax(7.75rem,0.8fr)_minmax(9.5rem,1.2fr)] gap-2 border-t border-base-content/15 pt-2 sm:grid-cols-2 sm:gap-3 sm:pt-3"
      >
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
                [disabled]="!canDecrease()"
                [attr.aria-label]="'Reduce price of ' + label()"
                (click)="priceStep.emit(-1)"
              >
                <app-icon name="heroChevronDown" />
              </button>
            }
            <button
              appButton
              variant="outline"
              size="md"
              type="button"
              class="join-item min-w-0 flex-1 rounded-none px-1 text-sm font-bold tabular-nums sm:px-2"
              [class.cursor-default]="!canOverridePrice()"
              [attr.aria-label]="canOverridePrice() ? 'Edit price for ' + label() : null"
              (click)="requestPriceEdit()"
            >
              <app-money [cents]="effectivePrice()" />
              @if (canOverridePrice()) {
                <app-icon name="heroPencilSquare" size="sm" class="hidden sm:inline-flex" />
              }
            </button>
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
              Base <app-money [cents]="line().unitPrice" />
            </p>
          }
        </div>
      </div>
    </article>
  `,
})
export class SellCartLineComponent {
  readonly line = input.required<CartLine>();
  readonly label = input.required<string>();
  readonly canOverridePrice = input(false);

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

  protected canDecrease(): boolean {
    const wholesaleFloor = Math.ceil((this.line().variant.wholesale_price ?? 0) / 100) * 100;
    return this.effectivePrice() > wholesaleFloor;
  }

  protected emitQuantity(event: Event): void {
    const quantity = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(quantity)) this.quantityChanged.emit(quantity);
  }

  protected requestPriceEdit(): void {
    if (this.canOverridePrice()) this.priceEdit.emit();
  }
}

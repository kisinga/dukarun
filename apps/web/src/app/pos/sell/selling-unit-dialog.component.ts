import {
  AfterViewInit,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { sellingUnits, type SellingUnit } from '@dukarun/pack-types';
import { type Variant, variantLabel } from '../pos.service';
import { type CartLine, cartStockQuantity } from '../cart.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-selling-unit-dialog',
  imports: [FormsModule, ButtonComponent, MoneyComponent, IconComponent],
  template: `
    <dialog
      #dialog
      class="modal modal-bottom md:modal-middle"
      aria-labelledby="selling-unit-heading"
      aria-describedby="selling-unit-product selling-unit-hint"
      (cancel)="$event.preventDefault(); closed.emit()"
      (click)="backdrop($event)"
    >
      <div class="modal-box modal-box-compact modal-box-task p-0">
        <header class="flex items-start justify-between gap-4 border-b border-base-300/60 p-5">
          <div class="min-w-0">
            <h2 id="selling-unit-heading" class="type-heading text-base-content/65">
              {{ line() ? 'Change selling unit' : 'Sell as' }}
            </h2>
            <p
              id="selling-unit-product"
              class="mt-1 text-xl font-semibold leading-tight text-balance"
            >
              {{ label() }}
            </p>
            @if (variant().manufacturer_name) {
              <p class="type-caption mt-1">{{ variant().manufacturer_name }}</p>
            }
          </div>
          <button
            appButton
            type="button"
            variant="ghost"
            class="-mr-2 -mt-1 shrink-0"
            (click)="closed.emit()"
          >
            Cancel
          </button>
        </header>
        <div
          class="modal-body p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-5"
          data-selling-units
        >
          <p id="selling-unit-hint" class="type-caption mb-3">
            {{
              line()
                ? 'Choose a unit, then review the quantity.'
                : 'Select an option to add one to the sale.'
            }}
          </p>
          <div class="grid gap-2.5">
            @for (unit of units(); track unit.packId) {
              <button
                type="button"
                class="unit-choice"
                [disabled]="!canAdd(unit)"
                [attr.aria-pressed]="line() ? selected()?.packId === unit.packId : null"
                (click)="choose(unit)"
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span class="unit-symbol" aria-hidden="true">
                    <app-icon [name]="unit.packId ? 'heroArchiveBox' : 'heroCube'" size="lg" />
                  </span>
                  <span class="min-w-0">
                    <span class="block break-words text-sm font-semibold leading-snug">
                      {{ unit.packId ? unit.name : 'Single ' + unit.name }}
                    </span>
                    <span class="type-caption mt-1 block">
                      @if (unit.factor > 1) {
                        {{ unit.factor }} × {{ unit.stockUnit }}
                      } @else {
                        Sold individually
                      }
                    </span>
                    @if (!canAdd(unit)) {
                      <span class="mt-1 block text-xs text-error">Not enough stock</span>
                    }
                    @if (
                      line() &&
                      (line()?.packId ?? null) === unit.packId &&
                      selected()?.packId !== unit.packId
                    ) {
                      <span class="type-caption mt-1 block">Current unit</span>
                    }
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-3">
                  <span class="text-right">
                    <span class="block text-base font-bold leading-tight">
                      <app-money [amount]="unit.price" [showCurrency]="true" />
                    </span>
                    <span class="type-caption mt-1 block">{{
                      unit.packId ? 'per pack' : 'each'
                    }}</span>
                  </span>
                  <app-icon
                    class="unit-action"
                    aria-hidden="true"
                    [name]="
                      line()
                        ? selected()?.packId === unit.packId
                          ? 'heroCheck'
                          : 'heroChevronRight'
                        : 'heroPlus'
                    "
                  />
                </span>
              </button>
            }
          </div>
          @if (line() && selected(); as unit) {
            <label class="mt-5 block border-t border-base-300/60 pt-4 text-sm font-medium">
              Quantity in {{ unit.name }}
              <input
                type="number"
                class="input input-bordered mt-1 w-full"
                [min]="unit.packId ? 1 : 0.001"
                [step]="unit.packId ? 1 : variant().allow_fractional ? 0.5 : 1"
                inputmode="decimal"
                [ngModel]="quantity()"
                (ngModelChange)="quantity.set($event)"
              />
            </label>
            @if (quantity() === null) {
              <p class="type-caption mt-1">
                Enter a quantity. The current stock quantity does not make whole {{ unit.name }}.
              </p>
            }
            @if (validQuantity() && unit.factor > 1) {
              <p class="type-caption mt-2">
                {{ quantity()! * unit.factor }} {{ unit.stockUnit }} from stock
              </p>
            }
            @if (line()?.customPrice !== null) {
              <p class="type-caption mt-2">
                Changing units uses the configured price and removes the previous adjustment.
              </p>
            }
          }
        </div>
        @if (line()) {
          <footer class="border-t border-base-300/60 px-4 py-4 md:px-5">
            @if (validQuantity()) {
              <div class="mb-3 flex items-center justify-between gap-3">
                <span class="text-sm">New line total</span>
                <span class="text-lg font-bold">
                  <app-money [amount]="quantity()! * selected()!.price" [showCurrency]="true" />
                </span>
              </div>
            }
            <button
              appButton
              type="button"
              class="w-full"
              [disabled]="!validQuantity()"
              (click)="apply()"
            >
              Update line
            </button>
          </footer>
        }
      </div>
    </dialog>
  `,
  styles: `
    .unit-choice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      min-height: 5.5rem;
      padding: 0.875rem;
      border: 1px solid var(--surface-border);
      border-radius: var(--radius-field);
      background: var(--surface-content);
      text-align: left;
      cursor: pointer;
      transition:
        border-color 120ms ease,
        background-color 120ms ease;
    }
    .unit-symbol {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: var(--radius-field);
      background: var(--surface-inset);
      color: color-mix(in oklab, var(--color-base-content) 65%, transparent);
    }
    .unit-action {
      color: color-mix(in oklab, var(--color-base-content) 55%, transparent);
    }
    .unit-choice:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .unit-choice[aria-pressed='true'] {
      border-color: var(--color-primary);
      background: color-mix(in oklab, var(--color-primary) 6%, var(--surface-content));
    }
    .unit-choice[aria-pressed='true'] .unit-action {
      color: var(--color-primary);
    }
    .unit-choice:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    @media (hover: hover) {
      .unit-choice:hover:not(:disabled) {
        border-color: color-mix(in oklab, var(--color-primary) 55%, var(--surface-border));
        background: color-mix(in oklab, var(--color-primary) 4%, var(--surface-content));
      }
      .unit-choice:hover:not(:disabled) .unit-action {
        color: var(--color-primary);
      }
    }
    @media (max-width: 359px) {
      .unit-symbol {
        display: none;
      }
      .unit-choice {
        gap: 0.5rem;
        padding: 0.75rem;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .unit-choice {
        transition: none;
      }
    }
  `,
})
export class SellingUnitDialogComponent implements AfterViewInit {
  readonly variant = input.required<Variant>();
  readonly line = input<CartLine | null>(null);
  readonly availableStock = input<number | null>(null);
  readonly chosen = output<{ unit: SellingUnit; quantity?: number }>();
  readonly closed = output<void>();
  protected readonly units = computed(() => sellingUnits(this.variant()));
  protected readonly label = computed(() => variantLabel(this.variant()));
  protected readonly selected = signal<SellingUnit | null>(null);
  protected readonly quantity = signal<number | null>(null);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly validQuantity = computed(() => {
    const unit = this.selected();
    const quantity = this.quantity();
    return (
      !!unit &&
      quantity !== null &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      (unit.packId || !this.variant().allow_fractional ? Number.isInteger(quantity) : true) &&
      (!this.variant().track_inventory || quantity * unit.factor <= (this.availableStock() ?? 0))
    );
  });
  ngAfterViewInit(): void {
    const dialog = this.dialog().nativeElement;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('[data-selling-units] button:not(:disabled)')?.focus();
  }
  protected canAdd(unit: SellingUnit): boolean {
    return (
      !!this.line() ||
      !this.variant().track_inventory ||
      unit.factor <= (this.availableStock() ?? 0)
    );
  }
  protected choose(unit: SellingUnit): void {
    const line = this.line();
    if (!line) {
      this.chosen.emit({ unit });
      return;
    }
    this.selected.set(unit);
    const quantity = cartStockQuantity(line) / unit.factor;
    this.quantity.set(
      (unit.packId || !this.variant().allow_fractional) && !Number.isInteger(quantity)
        ? null
        : quantity
    );
  }
  protected apply(): void {
    if (this.validQuantity())
      this.chosen.emit({ unit: this.selected()!, quantity: this.quantity()! });
  }
  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.closed.emit();
  }
}

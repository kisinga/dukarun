import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { CurrencyService } from '../../../../core/services/currency.service';

/**
 * Sticky bottom checkout bar.
 *
 * A solid, full-width surface pinned directly above the mobile bottom nav and to
 * the viewport bottom on desktop. Because it is a real bar (not a floating pill) the
 * page reserves its height and no cart content is ever occluded — unlike a
 * right-anchored FAB, which sits directly over the right-aligned price column.
 *
 * Holds the running total, the secondary "Save as quote" action, and the
 * primary Checkout action.
 */
@Component({
  selector: 'app-checkout-bar',
  standalone: true,
  imports: [CommonModule, NgIcon],
  template: `
    <div
      class="checkout-bar fixed left-0 right-0 z-40 border-t border-base-300 bg-base-100/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.10)] anim-fade-in-up lg:left-64"
    >
      <div class="container-app flex items-center gap-2 py-2.5 sm:gap-3 sm:py-3">
        <!-- Running total -->
        <div class="flex min-w-0 flex-col leading-tight">
          <span class="text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
            Total
          </span>
          <span class="truncate text-lg font-bold tabular-nums text-primary sm:text-2xl">
            {{ formatTotal(total()) }}
          </span>
        </div>

        <div class="flex-1"></div>

        <!-- Save as quote (secondary) — icon-only on mobile, labelled on sm+ -->
        <button
          type="button"
          class="btn btn-ghost btn-md min-h-[44px] shrink-0 gap-2 px-3 text-base-content/70 hover:text-base-content sm:px-4"
          (click)="saveQuote.emit()"
          [disabled]="processing()"
          aria-label="Save as quote"
          title="Save as quote"
        >
          <ng-icon name="heroDocumentText" size="1.25rem" />
          <span class="hidden sm:inline">Save as quote</span>
        </button>

        <!-- Checkout (primary) -->
        <button
          type="button"
          class="btn btn-primary btn-md min-h-[44px] shrink-0 gap-2 px-5 shadow-md sm:btn-lg sm:px-7"
          [class.btn-disabled]="disabled() || total() === 0"
          [class.anim-pulse-once]="cartJustUpdated()"
          (click)="checkout.emit()"
          aria-label="Proceed to checkout"
        >
          <span class="font-bold">Checkout</span>
          <ng-icon name="heroArrowLongRight" size="1.5rem" />
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    /* Sit directly on top of the mobile bottom nav (h-14 = 3.5rem) plus its
       safe-area inset, so the bar never covers the nav icons on notched devices. */
    .checkout-bar {
      bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px));
    }
    /* Desktop (lg): the mobile nav is hidden, so pin to the very bottom. */
    @media (min-width: 1024px) {
      .checkout-bar {
        bottom: env(safe-area-inset-bottom, 0px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutBarComponent {
  // Inputs
  readonly total = input.required<number>(); // in cents
  readonly disabled = input<boolean>(false);
  readonly processing = input<boolean>(false);
  readonly cartJustUpdated = input<boolean>(false);

  // Outputs
  readonly checkout = output<void>();
  readonly saveQuote = output<void>();

  private readonly currencyService = inject(CurrencyService);

  formatTotal(totalCents: number): string {
    return this.currencyService.format(totalCents, false);
  }
}

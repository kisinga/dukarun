import { Component, computed, input, output } from '@angular/core';
import { ButtonComponent } from '../../shared/ui/button.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';

type PaymentActionsMode = 'sidebar' | 'dock';

/**
 * Presentation/control surface for Sell checkout actions.
 *
 * Transaction decisions belong to SellWorkflowStore: cart validation, COD rules, customer credit,
 * cashier-session checks, proforma saves, and checkout orchestration. This component only renders
 * the desktop/mobile action layout from already-computed inputs and emits user intents.
 */
@Component({
  selector: 'app-sell-payment-actions',
  host: { class: 'block' },
  imports: [ButtonComponent, IconComponent, MoneyComponent],
  template: `
    @if (mode() === 'dock') {
      <div
        data-testid="sell-payment-dock"
        class="shadow-overlay fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-base-300/60 bg-base-100 p-3 lg:bottom-0 lg:left-64 xl:hidden"
      >
        <div class="flex w-full flex-wrap items-center gap-3">
          <a href="#current-sale" class="min-w-0 flex-1 rounded-field focus:outline-primary">
            <p class="type-caption">{{ itemCount() }} {{ itemLabel() }}</p>
            <p class="type-hero truncate"><app-money [amount]="total()" /></p>
          </a>
          @if (creditAllowed()) {
            <button
              appButton
              variant="secondary"
              size="md"
              data-learning-anchor="sell-on-credit"
              class="min-h-11 flex-1"
              [disabled]="secondaryDisabled()"
              (click)="sellOnCredit.emit()"
            >
              Sell on credit
            </button>
          }
          <button
            appButton
            size="md"
            data-learning-anchor="sell-checkout"
            class="min-w-40 flex-1"
            [disabled]="primaryDisabled()"
            (click)="checkout.emit()"
          >
            {{ primaryLabel() }}
            <app-icon name="heroChevronRight" />
          </button>
        </div>
      </div>
    } @else {
      <div class="hidden items-end justify-between gap-3 xl:flex">
        <div>
          <p class="type-caption">Amount due</p>
          <p class="mt-1 type-hero"><app-money [amount]="total()" /></p>
        </div>
        <span class="badge badge-ghost whitespace-nowrap">{{ itemCount() }} {{ itemLabel() }}</span>
      </div>

      <button
        appButton
        size="md"
        data-learning-anchor="sell-checkout"
        class="mt-4 hidden w-full xl:flex"
        [disabled]="primaryDisabled()"
        (click)="checkout.emit()"
      >
        <app-icon [name]="primaryIcon()" />
        {{ primaryLabel() }}
      </button>
      @if (creditAllowed()) {
        <button
          appButton
          variant="secondary"
          size="md"
          data-learning-anchor="sell-on-credit"
          class="mt-2 hidden min-h-11 w-full xl:flex"
          [disabled]="secondaryDisabled()"
          (click)="sellOnCredit.emit()"
        >
          Sell on credit
        </button>
      }

      @if (fulfillmentMode() === 'counter') {
        <div class="flex flex-wrap gap-2 lg:mt-2 lg:flex-col">
          @if (cashierFlowEnabled()) {
            <button
              appButton
              variant="secondary"
              size="md"
              class="flex-1"
              [disabled]="empty() || busy()"
              (click)="sendToCashier.emit()"
            >
              Send to cashier
            </button>
          }
          <button
            appButton
            variant="secondary"
            size="md"
            class="flex-1"
            [disabled]="empty() || busy()"
            (click)="saveProforma.emit()"
          >
            Save proforma
          </button>
        </div>
      }
    }
  `,
})
export class SellPaymentActionsComponent {
  readonly mode = input.required<PaymentActionsMode>();
  readonly total = input.required<number>();
  readonly itemCount = input.required<number>();
  readonly empty = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly canTakePayment = input.required<boolean>();
  readonly canSettleOrder = input.required<boolean>();
  readonly codCheckout = input.required<boolean>();
  readonly creditAllowed = input.required<boolean>();
  readonly cashierFlowEnabled = input.required<boolean>();
  readonly fulfillmentMode = input.required<string>();

  readonly checkout = output<void>();
  readonly sellOnCredit = output<void>();
  readonly sendToCashier = output<void>();
  readonly saveProforma = output<void>();

  protected readonly primaryDisabled = computed(
    () =>
      this.empty() ||
      this.busy() ||
      (!this.codCheckout() && !this.canTakePayment()) ||
      !this.canSettleOrder()
  );
  protected readonly secondaryDisabled = computed(
    () => this.empty() || this.busy() || !this.canTakePayment()
  );
  protected readonly itemLabel = computed(() => (this.itemCount() === 1 ? 'item' : 'items'));
  protected readonly primaryLabel = computed(() =>
    this.codCheckout() ? 'Place COD order' : 'Take payment'
  );
  protected readonly primaryIcon = computed(() =>
    this.codCheckout() ? 'heroTruck' : 'heroBanknotes'
  );
}

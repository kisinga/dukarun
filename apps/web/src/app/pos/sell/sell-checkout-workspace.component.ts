import { Component, computed, input, output, viewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  FulfillmentCheckoutFieldsComponent,
  type CheckoutCustomerSummary,
  type CheckoutMode,
  type FulfillmentCheckoutDraft,
} from '../../fulfillment/fulfillment-checkout-fields.component';
import { FulfillmentCheckoutMethodComponent } from '../../fulfillment/fulfillment-checkout-method.component';
import type { FulfillmentSettings } from '../../fulfillment/fulfillment.service';
import {
  SellCustomerContextComponent,
  type SellCustomerIntent,
  type SellCustomerViewModel,
} from './sell-customer-context.component';
import { SellPaymentActionsComponent } from './sell-payment-actions.component';

export interface SellCheckoutWorkspaceViewModel {
  customer: SellCustomerViewModel;
  checkoutCustomer: CheckoutCustomerSummary | null;
  fulfillmentSettings: FulfillmentSettings | null;
  fulfillmentMode: CheckoutMode;
  total: number;
  itemCount: number;
  empty: boolean;
  busy: boolean;
  canTakePayment: boolean;
  canSettleOrder: boolean;
  creditAllowed: boolean;
  cashierFlowEnabled: boolean;
}

export type SellCheckoutWorkspaceIntent =
  | { type: 'customer'; intent: SellCustomerIntent }
  | { type: 'mode-changed'; mode: CheckoutMode }
  | { type: 'customer-selected'; customerId: string }
  | { type: 'checkout' }
  | { type: 'credit' }
  | { type: 'send-to-cashier' }
  | { type: 'save-proforma' };

/**
 * Owns transient fulfillment form state and payment entry points. Transaction commands still pass
 * an immutable snapshot to SellWorkflowStore through the page adapter.
 */
@Component({
  selector: 'app-sell-checkout-workspace',
  imports: [
    FulfillmentCheckoutFieldsComponent,
    FulfillmentCheckoutMethodComponent,
    SellCustomerContextComponent,
    SellPaymentActionsComponent,
  ],
  styles: `
    :host {
      display: block;
      min-width: 0;
      order: 2;
    }

    @media (min-width: 80rem) {
      :host {
        position: sticky;
        top: 1rem;
        grid-column: 2;
        grid-row: 1 / span 2;
        height: 100%;
      }
    }
  `,
  template: `
    <aside class="min-w-0 xl:h-full">
      <div class="card h-full overflow-hidden bg-base-100" aria-label="Sale summary">
        <app-sell-customer-context
          [viewModel]="viewModel().customer"
          [searchControl]="customerSearch()"
          (intent)="intent.emit({ type: 'customer', intent: $event })"
        />

        <app-fulfillment-checkout-method
          [settings]="viewModel().fulfillmentSettings"
          [mode]="fulfillmentFields()?.mode() ?? viewModel().fulfillmentMode"
          [detailsCommitted]="fulfillmentFields()?.detailsCommitted() ?? false"
          [recipientName]="fulfillmentFields()?.recipientName() ?? ''"
          [phone]="fulfillmentFields()?.phone() ?? ''"
          [address]="fulfillmentFields()?.address() ?? ''"
          [collectionKind]="fulfillmentFields()?.collectionKind() ?? 'none'"
          [updatesRequested]="fulfillmentFields()?.updatesRequested() ?? true"
          [promiseLabel]="fulfillmentFields()?.promiseLabel() ?? null"
          (modeSelected)="fulfillmentFields()?.selectMode($event)"
          (detailsRequested)="fulfillmentFields()?.openDetails()"
        />

        <section class="mt-auto border-t border-base-300/60 p-4">
          <app-sell-payment-actions
            mode="sidebar"
            [total]="viewModel().total"
            [itemCount]="viewModel().itemCount"
            [empty]="viewModel().empty"
            [busy]="viewModel().busy"
            [canTakePayment]="viewModel().canTakePayment"
            [canSettleOrder]="viewModel().canSettleOrder"
            [codCheckout]="isCodCheckout()"
            [creditAllowed]="viewModel().creditAllowed && !isCodCheckout()"
            [cashierFlowEnabled]="viewModel().cashierFlowEnabled"
            [fulfillmentMode]="viewModel().fulfillmentMode"
            (checkout)="intent.emit({ type: 'checkout' })"
            (sellOnCredit)="intent.emit({ type: 'credit' })"
            (sendToCashier)="intent.emit({ type: 'send-to-cashier' })"
            (saveProforma)="intent.emit({ type: 'save-proforma' })"
          />
        </section>
      </div>
    </aside>

    <app-sell-payment-actions
      mode="dock"
      [total]="viewModel().total"
      [itemCount]="viewModel().itemCount"
      [empty]="viewModel().empty"
      [busy]="viewModel().busy"
      [canTakePayment]="viewModel().canTakePayment"
      [canSettleOrder]="viewModel().canSettleOrder"
      [codCheckout]="isCodCheckout()"
      [creditAllowed]="viewModel().creditAllowed && !isCodCheckout()"
      [cashierFlowEnabled]="viewModel().cashierFlowEnabled"
      [fulfillmentMode]="viewModel().fulfillmentMode"
      (checkout)="intent.emit({ type: 'checkout' })"
      (sellOnCredit)="intent.emit({ type: 'credit' })"
      (sendToCashier)="intent.emit({ type: 'send-to-cashier' })"
      (saveProforma)="intent.emit({ type: 'save-proforma' })"
    />

    <app-fulfillment-checkout-fields
      [settings]="viewModel().fulfillmentSettings"
      [customer]="viewModel().checkoutCustomer"
      (modeChanged)="intent.emit({ type: 'mode-changed', mode: $event })"
      (customerSelected)="intent.emit({ type: 'customer-selected', customerId: $event })"
    />
  `,
})
export class SellCheckoutWorkspaceComponent {
  readonly viewModel = input.required<SellCheckoutWorkspaceViewModel>();
  readonly customerSearch = input.required<FormControl<string>>();
  readonly intent = output<SellCheckoutWorkspaceIntent>();

  protected readonly fulfillmentFields = viewChild(FulfillmentCheckoutFieldsComponent);
  readonly isCodCheckout = computed(
    () =>
      this.viewModel().fulfillmentMode !== 'counter' &&
      this.fulfillmentFields()?.collectionKind() === 'cod'
  );
  readonly payerPhone = computed(
    () => this.fulfillmentFields()?.phone() || this.viewModel().customer.selected?.phone || ''
  );

  buildFulfillmentSnapshot(): FulfillmentCheckoutDraft | null {
    return this.viewModel().fulfillmentMode === 'counter'
      ? null
      : (this.fulfillmentFields()?.build() ?? null);
  }

  resetFulfillment(): void {
    this.fulfillmentFields()?.reset();
  }
}

import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import { OrderLineWithProduct, OrderWithCustomer, Payment, Refund } from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { Approval } from './approvals.service';

type Metadata = {
  payment_id?: string;
  amount?: number;
  method_code?: string;
  lines?: { variant_id: string; custom_price: number; reason?: string }[];
  tenders?: { method: string; amount: number; reference?: string | null }[];
  ar_balance?: number;
  order_total?: number;
  credit_limit?: number;
  projected_balance?: number;
};

@Component({
  selector: 'app-approval-order-context',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, IconComponent, MoneyComponent],
  template: `
    @if (eligibilityWarning()) {
      <div role="alert" class="alert alert-warning mt-4 text-sm">
        <app-icon name="heroExclamationTriangle" />
        <span>{{ eligibilityWarning() }} The server will recheck before making changes.</span>
      </div>
    }

    <div class="mt-4 flex items-center justify-between gap-3">
      <div>
        <p class="section-title">Linked sale</p>
        <p class="type-caption">Current state, not a stored snapshot</p>
      </div>
      <a
        appButton
        variant="ghost"
        size="sm"
        [routerLink]="approval().type === 'below_wholesale' ? ['/pos/proformas'] : ['/sales']"
        [queryParams]="{ order: order().id, approval: approval().id }"
      >
        {{ approval().type === 'below_wholesale' ? 'Open proforma' : 'Open in Sales' }}
        <app-icon name="heroChevronRight" />
      </a>
    </div>

    <div class="mt-2 grid grid-cols-2 gap-2">
      <div class="rounded-field bg-base-200 p-3">
        <p class="type-caption">Sale total</p>
        <p class="mt-1 font-bold"><app-money [amount]="order().total" /></p>
      </div>
      <div class="rounded-field bg-base-200 p-3">
        <p class="type-caption">Current status</p>
        <p class="mt-1 font-semibold capitalize">{{ order().status.replace('_', ' ') }}</p>
      </div>
      @if (approval().type === 'sale_refund') {
        <div class="rounded-field bg-warning/10 p-3">
          <p class="type-caption">Requested refund</p>
          <p class="mt-1 font-bold"><app-money [amount]="metadata().amount ?? 0" /></p>
        </div>
        <div class="rounded-field bg-base-200 p-3">
          <p class="type-caption">Currently refundable</p>
          <p class="mt-1 font-bold"><app-money [amount]="refundableAmount()" /></p>
        </div>
      }
      @if (approval().type === 'overdraft') {
        <div class="rounded-field bg-warning/10 p-3">
          <p class="type-caption">Projected exposure</p>
          <p class="mt-1 font-bold"><app-money [amount]="projectedBalance()" /></p>
          <p class="type-caption">
            {{ format(metadata().ar_balance ?? 0) }} current +
            {{ format(metadata().order_total ?? 0) }} sale
          </p>
        </div>
        <div class="rounded-field bg-base-200 p-3">
          <p class="type-caption">Credit limit</p>
          <p class="mt-1 font-bold"><app-money [amount]="metadata().credit_limit ?? 0" /></p>
        </div>
      }
      @if (approval().type === 'below_wholesale') {
        <div class="col-span-2 rounded-field bg-warning/10 p-3">
          <p class="type-caption">Total margin impact</p>
          <p class="mt-1 font-bold text-warning"><app-money [amount]="marginImpact()" /></p>
        </div>
      }
    </div>

    <section class="mt-4 border-t border-base-300/60 pt-4">
      <h3 class="section-title mb-2">Items</h3>
      @if (lines().length === 0) {
        <app-empty-state [compact]="true" icon="heroShoppingCart" title="No line items" />
      } @else {
        <ul class="divide-y divide-base-200">
          @for (line of lines(); track line.id) {
            <li class="rounded-field px-2 py-2" [class.bg-warning/10]="isAffected(line.variant_id)">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{{ line.label }}</p>
                  <p class="type-caption">
                    {{ line.quantity }} ×
                    <app-money [amount]="line.custom_price ?? line.unit_price" />
                    @if (line.track_inventory) {
                      ·
                      {{
                        line.stock >= line.quantity
                          ? line.stock + ' available'
                          : 'Only ' + line.stock + ' available'
                      }}
                    }
                  </p>
                </div>
                <app-money class="text-sm font-semibold" [amount]="line.line_total" />
              </div>
              @if (requestedLine(line.variant_id); as requested) {
                <dl class="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt class="text-base-content/55">Wholesale</dt>
                    <dd><app-money [amount]="line.wholesale_price ?? 0" /></dd>
                  </div>
                  <div>
                    <dt class="text-base-content/55">Requested</dt>
                    <dd><app-money [amount]="requested.custom_price" /></dd>
                  </div>
                  <div>
                    <dt class="text-base-content/55">Difference</dt>
                    <dd class="text-warning"><app-money [amount]="lineDifference(line)" /></dd>
                  </div>
                </dl>
                @if (requested.reason) {
                  <p class="type-caption mt-1">{{ requested.reason }}</p>
                }
              }
            </li>
          }
        </ul>
      }
    </section>

    @if (approval().type === 'external_account_payment') {
      <section class="mt-4 border-t border-base-300/60 pt-4">
        <h3 class="section-title mb-2">Proposed tenders</h3>
        <div class="flex flex-col gap-2">
          @for (tender of metadata().tenders ?? []; track $index) {
            <div class="rounded-field border border-warning/40 bg-warning/5 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold capitalize">{{ tender.method }}</p>
                  <p class="type-caption">Reference {{ tender.reference || 'not supplied' }}</p>
                </div>
                <app-money class="font-bold" [amount]="tender.amount" />
              </div>
            </div>
          }
        </div>
      </section>
    } @else if (
      payments().length > 0 || ['sale_refund', 'payment_reversal'].includes(approval().type)
    ) {
      <section class="mt-4 border-t border-base-300/60 pt-4">
        <h3 class="section-title mb-2">Recorded payments</h3>
        @if (payments().length === 0) {
          <p class="text-sm text-base-content/60">No payments recorded.</p>
        }
        @for (payment of payments(); track payment.id) {
          <div
            class="mb-2 rounded-field border p-3"
            [class.border-warning]="payment.id === metadata().payment_id"
            [class.bg-warning/10]="payment.id === metadata().payment_id"
            [class.border-base-300]="payment.id !== metadata().payment_id"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold capitalize">{{ payment.method_code }}</p>
                <p class="type-caption">
                  {{ payment.status }}{{ payment.reference ? ' · Ref ' + payment.reference : '' }}
                </p>
              </div>
              <app-money class="font-bold" [amount]="payment.amount" />
            </div>
          </div>
        }
        @if (refunds().length > 0) {
          <p class="type-caption">
            {{ refunds().length }} refund(s) already posted · {{ format(refundedAmount()) }} total
          </p>
        }
      </section>
    }
  `,
})
export class ApprovalOrderContextComponent {
  readonly approval = input.required<Approval>();
  readonly order = input.required<OrderWithCustomer>();
  readonly lines = input.required<OrderLineWithProduct[]>();
  readonly payments = input.required<Payment[]>();
  readonly refunds = input.required<Refund[]>();
  readonly format = formatKes;

  protected readonly metadata = computed(() => this.approval().metadata as Metadata);
  protected readonly refundedAmount = computed(() =>
    this.refunds().reduce((sum, row) => sum + row.amount, 0)
  );
  protected readonly refundableAmount = computed(() =>
    Math.max(
      0,
      this.payments()
        .filter(row => row.status === 'settled')
        .reduce((sum, row) => sum + row.amount, 0) - this.refundedAmount()
    )
  );
  protected readonly projectedBalance = computed(
    () =>
      this.metadata().projected_balance ??
      (this.metadata().ar_balance ?? 0) + (this.metadata().order_total ?? 0)
  );
  protected readonly marginImpact = computed(() =>
    this.lines().reduce((sum, line) => sum + Math.max(0, this.lineDifference(line)), 0)
  );
  protected readonly eligibilityWarning = computed(() => {
    if (
      ['order_reversal', 'sale_refund'].includes(this.approval().type) &&
      this.order().status !== 'completed'
    )
      return `This sale is now ${this.order().status.replace('_', ' ')}.`;
    if (
      this.approval().type === 'sale_refund' &&
      (this.metadata().amount ?? 0) > this.refundableAmount()
    )
      return 'The requested refund now exceeds the refundable balance.';
    if (this.approval().type === 'payment_reversal') {
      const payment = this.payments().find(row => row.id === this.metadata().payment_id);
      if (!payment) return 'The payment being reviewed could not be found.';
      if (payment.status !== 'settled') return `The payment is now ${payment.status}.`;
    }
    if (
      this.approval().type === 'overdraft' &&
      this.lines().some(line => line.track_inventory && line.stock < line.quantity)
    )
      return 'One or more items no longer have enough stock.';
    return null;
  });

  protected isAffected(variantId: string): boolean {
    return !!this.requestedLine(variantId);
  }
  protected requestedLine(variantId: string) {
    return this.metadata().lines?.find(line => line.variant_id === variantId);
  }
  protected lineDifference(line: OrderLineWithProduct): number {
    const requested = this.requestedLine(line.variant_id);
    return requested
      ? Math.max(0, (line.wholesale_price ?? 0) - requested.custom_price) * line.quantity
      : 0;
  }
}

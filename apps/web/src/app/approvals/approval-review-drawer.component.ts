import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatKes } from '../core/money';
import {
  OrderLineWithProduct,
  OrderWithCustomer,
  Payment,
  PosService,
  Refund,
} from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { Approval, ApprovalsService } from './approvals.service';

export type ApprovalDecisionResult = {
  approval: Approval;
  action: 'approve' | 'deny';
  status: Approval['status'];
};

type ApprovalMetadata = {
  order_id?: string;
  payment_id?: string;
  reason?: string;
  amount?: number;
  method_code?: string;
  lines?: { variant_id: string; custom_price: number; reason?: string }[];
  tenders?: { method: string; amount: number; reference?: string | null }[];
  ar_balance?: number;
  order_total?: number;
  credit_limit?: number;
};

@Component({
  selector: 'app-approval-review-drawer',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DrawerComponent,
    ButtonComponent,
    EmptyStateComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    StatusBadgeComponent,
  ],
  template: `
    <app-drawer
      [open]="true"
      (closed)="closed.emit()"
      [title]="drawerTitle()"
      [subtitle]="order() ? order()!.code + ' · ' + customerName() : 'Loading linked sale…'"
    >
      <app-status-badge
        actions
        size="xs"
        [type]="statusTone(approval().status)"
        [label]="approval().status"
      />

      <section class="rounded-box border border-base-300 bg-base-200/50 p-3">
        <div class="flex items-start gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning"
          >
            <app-icon name="heroCheckBadge" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{{ requestSummary() }}</p>
            <p class="type-caption mt-1">
              Requested by {{ personName(approval().requested_by) }} ·
              {{ time(approval().created_at) }}
            </p>
            @if (metadata().reason) {
              <p class="mt-2 text-sm">“{{ metadata().reason }}”</p>
            }
          </div>
        </div>
      </section>

      @if (loading()) {
        <div class="flex items-center justify-center gap-2 py-12 text-base-content/60">
          <span class="loading loading-spinner loading-md"></span>
          <span class="text-sm">Loading current sale details…</span>
        </div>
      } @else if (error()) {
        <div role="alert" class="alert alert-error mt-4 text-sm">
          <app-icon name="heroExclamationTriangle" />
          <div>
            <p class="font-semibold">Linked record could not be loaded</p>
            <p>{{ error() }}</p>
          </div>
          <button appButton variant="ghost" size="sm" type="button" (click)="retry()">Retry</button>
        </div>
      } @else if (order(); as sale) {
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
            [routerLink]="['/sales']"
            [queryParams]="{ order: sale.id, approval: approval().id }"
          >
            Open in Sales
            <app-icon name="heroChevronRight" />
          </a>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2">
          <div class="rounded-field bg-base-200 p-3">
            <p class="type-caption">Sale total</p>
            <p class="mt-1 font-bold"><app-money [amount]="sale.total" /></p>
          </div>
          <div class="rounded-field bg-base-200 p-3">
            <p class="type-caption">Current status</p>
            <p class="mt-1 font-semibold capitalize">{{ sale.status.replace('_', ' ') }}</p>
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
              <p class="type-caption">Balance + sale</p>
              <p class="mt-1 font-bold">
                {{ format(metadata().ar_balance ?? 0) }} + {{ format(metadata().order_total ?? 0) }}
              </p>
            </div>
            <div class="rounded-field bg-base-200 p-3">
              <p class="type-caption">Credit limit</p>
              <p class="mt-1 font-bold">{{ format(metadata().credit_limit ?? 0) }}</p>
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
                <li
                  class="flex items-center gap-3 rounded-field px-2 py-2"
                  [class.bg-warning/10]="isAffectedLine(line.variant_id)"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">{{ line.label }}</p>
                    <p class="type-caption">
                      {{ line.quantity }} ×
                      <app-money [amount]="line.custom_price ?? line.unit_price" />
                      @if (requestedPrice(line.variant_id); as requested) {
                        · requested <app-money [amount]="requested" />
                      }
                    </p>
                  </div>
                  <app-money class="text-sm font-semibold" [amount]="line.line_total" />
                </li>
              }
            </ul>
          }
        </section>

        <section class="mt-4 border-t border-base-300/60 pt-4">
          <h3 class="section-title mb-2">Payments</h3>
          @if (payments().length === 0) {
            <p class="text-sm text-base-content/60">No payments recorded.</p>
          } @else {
            <div class="flex flex-col gap-2">
              @for (payment of payments(); track payment.id) {
                <div
                  class="rounded-field border p-3"
                  [class.border-warning]="payment.id === metadata().payment_id"
                  [class.bg-warning/10]="payment.id === metadata().payment_id"
                  [class.border-base-300]="payment.id !== metadata().payment_id"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold capitalize">{{ payment.method_code }}</p>
                      <p class="type-caption">
                        {{ payment.status }}
                        @if (payment.reference) {
                          · Ref {{ payment.reference }}
                        }
                      </p>
                    </div>
                    <app-money class="font-bold" [amount]="payment.amount" />
                  </div>
                  @if (payment.id === metadata().payment_id) {
                    <p class="mt-2 text-xs font-semibold text-warning">Payment being reviewed</p>
                  }
                </div>
              }
            </div>
          }
          @if (refunds().length > 0) {
            <p class="type-caption mt-2">
              {{ refunds().length }} refund(s) already posted · {{ format(refundedAmount()) }} total
            </p>
          }
        </section>

        @if (approval().status !== 'pending') {
          <section class="mt-4 rounded-box border border-base-300 p-3">
            <p class="section-title">Decision</p>
            <div class="mt-2 flex items-center gap-2">
              <app-status-badge
                size="xs"
                [type]="statusTone(approval().status)"
                [label]="approval().status"
              />
              <span class="type-caption">
                by {{ personName(approval().decided_by) }}
                @if (approval().decided_at) {
                  · {{ time(approval().decided_at!) }}
                }
              </span>
            </div>
            @if (approval().decision_reason) {
              <p class="mt-2 text-sm">{{ approval().decision_reason }}</p>
            }
          </section>
        }
      }

      @if (approval().status === 'pending' && !loading() && !error()) {
        <div class="sticky bottom-0 -mx-4 mt-6 border-t border-base-300 bg-base-100 px-4 py-3">
          @if (denying()) {
            <form (submit)="$event.preventDefault(); deny()" class="flex flex-col gap-2">
              <app-form-field label="Why is this request being denied?" [required]="true">
                <textarea
                  class="textarea textarea-bordered min-h-20 w-full"
                  [formControl]="decisionReason"
                  placeholder="Give the requester a useful reason"
                ></textarea>
              </app-form-field>
              <div class="flex justify-end gap-2">
                <button appButton variant="ghost" type="button" (click)="denying.set(false)">
                  Back
                </button>
                <button
                  appButton
                  variant="error"
                  type="submit"
                  [loading]="busy()"
                  [disabled]="decisionReason.value.trim().length === 0"
                >
                  Deny and notify
                </button>
              </div>
            </form>
          } @else {
            <p class="type-caption mb-2">The requester will be notified of your decision.</p>
            <div class="flex justify-end gap-2">
              <button appButton variant="error" [disabled]="busy()" (click)="denying.set(true)">
                Deny
              </button>
              <button appButton [loading]="busy()" (click)="approve()">Approve request</button>
            </div>
          }
        </div>
      }
    </app-drawer>
  `,
})
export class ApprovalReviewDrawerComponent {
  private readonly approvals = inject(ApprovalsService);
  private readonly pos = inject(PosService);

  readonly approval = input.required<Approval>();
  readonly closed = output<void>();
  readonly decided = output<ApprovalDecisionResult>();

  protected readonly order = signal<OrderWithCustomer | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly refunds = signal<Refund[]>([]);
  protected readonly people = signal<Map<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly denying = signal(false);
  protected readonly decisionReason = new FormControl('', { nonNullable: true });
  protected readonly format = formatKes;

  private loadSequence = 0;

  protected readonly metadata = computed(() => this.approval().metadata as ApprovalMetadata);
  protected readonly refundedAmount = computed(() =>
    this.refunds().reduce((total, refund) => total + refund.amount, 0)
  );
  protected readonly refundableAmount = computed(() => {
    const settled = this.payments()
      .filter(payment => payment.status === 'settled')
      .reduce((total, payment) => total + payment.amount, 0);
    return Math.max(0, settled - this.refundedAmount());
  });
  protected readonly eligibilityWarning = computed(() => {
    const sale = this.order();
    if (!sale) return null;
    if (
      ['order_reversal', 'sale_refund'].includes(this.approval().type) &&
      sale.status !== 'completed'
    ) {
      return `This sale is now ${sale.status.replace('_', ' ')}.`;
    }
    if (
      this.approval().type === 'sale_refund' &&
      (this.metadata().amount ?? 0) > this.refundableAmount()
    ) {
      return 'The requested refund now exceeds the refundable balance.';
    }
    if (this.approval().type === 'payment_reversal') {
      const payment = this.payments().find(item => item.id === this.metadata().payment_id);
      if (!payment) return 'The payment being reviewed could not be found.';
      if (payment.status !== 'settled') return `The payment is now ${payment.status}.`;
    }
    return null;
  });

  constructor() {
    effect(() => void this.load(this.approval()));
  }

  protected drawerTitle(): string {
    return `${this.typeLabel(this.approval().type)} request`;
  }

  protected requestSummary(): string {
    const meta = this.metadata();
    switch (this.approval().type) {
      case 'order_reversal':
        return 'Void this sale';
      case 'sale_refund':
        return `Refund ${formatKes(meta.amount ?? 0)} via ${meta.method_code ?? 'selected method'}`;
      case 'payment_reversal':
        return 'Reverse the highlighted payment';
      case 'below_wholesale':
        return 'Approve below-wholesale pricing';
      case 'external_account_payment':
        return 'Approve direct account payment';
      case 'overdraft':
        return 'Approve customer credit above the limit';
      default:
        return this.typeLabel(this.approval().type);
    }
  }

  protected typeLabel(type: string): string {
    return type.replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
  }

  protected customerName(): string {
    const customer = this.order()?.customers;
    return customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ')
      : 'Walk-in';
  }

  protected personName(userId: string | null): string {
    if (!userId) return 'Unknown user';
    return this.people().get(userId) ?? `User …${userId.slice(-4)}`;
  }

  protected isAffectedLine(variantId: string): boolean {
    return (this.metadata().lines ?? []).some(line => line.variant_id === variantId);
  }

  protected requestedPrice(variantId: string): number | null {
    return this.metadata().lines?.find(line => line.variant_id === variantId)?.custom_price ?? null;
  }

  protected statusTone(status: Approval['status']): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'denied' || status === 'expired') return 'error';
    return 'neutral';
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }

  protected async approve(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const approval = this.approval();
      const status = await this.approvals.approve(approval.id);
      this.decided.emit({ approval, action: 'approve', status });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Approval failed');
    } finally {
      this.busy.set(false);
    }
  }

  protected retry(): void {
    void this.load(this.approval());
  }

  protected async deny(): Promise<void> {
    const reason = this.decisionReason.value.trim();
    if (!reason) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const approval = this.approval();
      await this.approvals.deny(approval.id, reason);
      this.decided.emit({ approval, action: 'deny', status: 'denied' });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Denial failed');
    } finally {
      this.busy.set(false);
    }
  }

  private async load(approval: Approval): Promise<void> {
    const sequence = ++this.loadSequence;
    const orderId =
      (approval.metadata as ApprovalMetadata).order_id ??
      (approval.subject_type === 'order' ? approval.subject_id : null);
    this.loading.set(true);
    this.error.set(null);
    this.order.set(null);
    this.lines.set([]);
    this.payments.set([]);
    this.refunds.set([]);
    this.decisionReason.setValue('');
    this.denying.set(false);
    try {
      if (!orderId) throw new Error('This request does not identify a linked sale.');
      const [order, lines, payments, refunds, people] = await Promise.all([
        this.pos.getOrder(orderId),
        this.pos.orderLines(orderId),
        this.pos.orderPayments(orderId),
        this.pos.orderRefunds(orderId),
        this.approvals
          .staffNames([approval.requested_by, approval.decided_by])
          .catch(() => new Map<string, string>()),
      ]);
      if (sequence !== this.loadSequence) return;
      this.order.set(order);
      this.lines.set(lines);
      this.payments.set(payments);
      this.refunds.set(refunds);
      this.people.set(people);
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      this.error.set(error instanceof Error ? error.message : 'Failed to load linked sale');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
}

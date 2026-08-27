import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { formatKes } from '../core/money';
import {
  CustomerWithCredit,
  OrderLineWithProduct,
  OrderWithCustomer,
  Payment,
  PosService,
  Refund,
} from '../pos/pos.service';
import { ButtonComponent } from '../shared/ui/button.component';
import { DrawerComponent } from '../shared/ui/drawer.component';
import { FormFieldComponent } from '../shared/ui/form-field.component';
import { IconComponent } from '../shared/ui/icon.component';
import { StatusBadgeComponent } from '../shared/ui/status-badge.component';
import { ApprovalCustomerContextComponent } from './approval-customer-context.component';
import { ApprovalOrderContextComponent } from './approval-order-context.component';
import { Approval, ApprovalsService } from './approvals.service';

export type ApprovalDecisionResult = {
  approval: Approval;
  action: 'approve' | 'deny';
  status: Approval['status'];
};

type ApprovalMetadata = {
  order_id?: string;
  customer_id?: string;
  receipt_id?: string;
  reason?: string;
  amount?: number;
  method_code?: string;
  reference?: string;
  allocation_preview?: {
    applied_amount?: number;
    downpayment_amount?: number;
    allocations?: Array<{ order_code: string; amount: number }>;
  };
};

@Component({
  selector: 'app-approval-review-drawer',
  imports: [
    ReactiveFormsModule,
    DrawerComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    StatusBadgeComponent,
    ApprovalOrderContextComponent,
    ApprovalCustomerContextComponent,
  ],
  template: `
    <app-drawer
      [open]="true"
      (closed)="closed.emit()"
      [title]="drawerTitle()"
      [subtitle]="linkedSubtitle()"
    >
      <app-status-badge
        drawerActions
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
          <span class="text-sm">Loading current details…</span>
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
      } @else {
        @if (order(); as sale) {
          <app-approval-order-context
            [approval]="approval()"
            [order]="sale"
            [lines]="lines()"
            [payments]="payments()"
            [refunds]="refunds()"
          />
        } @else if (approval().subject_type === 'customer_receipt') {
          <section class="mt-4 rounded-box border border-base-300 p-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="section-title">Customer receipt</p>
                <p class="type-caption">Allocation is recalculated when approved.</p>
              </div>
              <p class="font-bold tabular-nums">{{ money(metadata().amount ?? 0) }}</p>
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div class="rounded-field bg-base-200 p-2">
                <dt class="type-caption">Method</dt>
                <dd class="font-semibold capitalize">{{ metadata().method_code ?? '—' }}</dd>
              </div>
              <div class="rounded-field bg-base-200 p-2">
                <dt class="type-caption">Reference</dt>
                <dd class="truncate font-semibold">{{ metadata().reference || 'Not supplied' }}</dd>
              </div>
              @if (metadata().allocation_preview; as preview) {
                <div class="rounded-field bg-info/5 p-2">
                  <dt class="type-caption">Invoices in current preview</dt>
                  <dd class="font-semibold">{{ money(preview.applied_amount ?? 0) }}</dd>
                </div>
                <div class="rounded-field bg-info/5 p-2">
                  <dt class="type-caption">Downpayment in current preview</dt>
                  <dd class="font-semibold">{{ money(preview.downpayment_amount ?? 0) }}</dd>
                </div>
              }
            </dl>
            @if (approval().type === 'customer_receipt_reversal') {
              <div role="alert" class="alert alert-warning mt-3 text-sm">
                <app-icon name="heroExclamationTriangle" />
                <span
                  >The whole receipt will be reversed. This is blocked if its downpayment has been
                  used or refunded.</span
                >
              </div>
            } @else {
              <p class="type-caption mt-3">
                Newer invoice or payment activity can change the final invoice/downpayment split
                without changing the amount received.
              </p>
            }
          </section>
        } @else if (customer(); as linkedCustomer) {
          <app-approval-customer-context [approval]="approval()" [customer]="linkedCustomer" />
        }

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
  protected readonly customer = signal<CustomerWithCredit | null>(null);
  protected readonly lines = signal<OrderLineWithProduct[]>([]);
  protected readonly payments = signal<Payment[]>([]);
  protected readonly refunds = signal<Refund[]>([]);
  protected readonly people = signal<Map<string, string>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly denying = signal(false);
  protected readonly decisionReason = new FormControl('', { nonNullable: true });
  protected readonly metadata = computed(() => this.approval().metadata as ApprovalMetadata);
  private loadSequence = 0;

  constructor() {
    effect(() => void this.load(this.approval()));
  }

  protected drawerTitle(): string {
    return `${this.typeLabel(this.approval().type)} request`;
  }
  protected linkedSubtitle(): string {
    if (this.order()) return `${this.order()!.code} · ${this.orderCustomerName()}`;
    if (this.customer()) return this.customerName(this.customer()!);
    return this.approval().subject_type === 'customer'
      ? 'Loading linked customer…'
      : 'Loading linked sale…';
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
      case 'customer_receipt_reversal':
        return `Reverse the full ${formatKes(meta.amount ?? 0)} customer receipt`;
      case 'below_wholesale':
        return 'Approve below-wholesale pricing';
      case 'external_account_payment':
        return 'Approve direct account payment';
      case 'overdraft':
        return 'Approve customer credit above the limit';
      case 'customer_credit':
        return 'Approve a customer credit-policy change';
      default:
        return this.typeLabel(this.approval().type);
    }
  }
  protected typeLabel(type: string): string {
    return type.replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());
  }
  protected personName(userId: string | null): string {
    return userId ? (this.people().get(userId) ?? `User …${userId.slice(-4)}`) : 'Unknown user';
  }
  protected statusTone(status: Approval['status']): 'success' | 'warning' | 'error' | 'neutral' {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'denied' || status === 'expired') return 'error';
    return 'neutral';
  }
  protected time(iso: string): string {
    return new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso)
    );
  }
  protected money(amount: number): string {
    return formatKes(amount);
  }
  protected retry(): void {
    void this.load(this.approval());
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
    const customerId =
      approval.subject_type === 'customer'
        ? approval.subject_id
        : approval.subject_type === 'customer_receipt'
          ? ((approval.metadata as ApprovalMetadata).customer_id ?? null)
          : null;
    this.loading.set(true);
    this.error.set(null);
    this.order.set(null);
    this.customer.set(null);
    this.lines.set([]);
    this.payments.set([]);
    this.refunds.set([]);
    this.decisionReason.setValue('');
    this.denying.set(false);
    try {
      const peoplePromise = this.approvals
        .staffNames([approval.requested_by, approval.decided_by])
        .catch(() => new Map<string, string>());
      if (customerId) {
        const [customer, people] = await Promise.all([
          this.pos.customerWithCredit(customerId),
          peoplePromise,
        ]);
        if (!customer) throw new Error('Linked customer could not be found.');
        if (sequence !== this.loadSequence) return;
        this.customer.set(customer);
        this.people.set(people);
      } else if (orderId) {
        const [order, lines, payments, refunds, people] = await Promise.all([
          this.pos.getOrder(orderId),
          this.pos.orderLines(orderId),
          this.pos.orderPayments(orderId),
          this.pos.orderRefunds(orderId),
          peoplePromise,
        ]);
        if (sequence !== this.loadSequence) return;
        this.order.set(order);
        this.lines.set(lines);
        this.payments.set(payments);
        this.refunds.set(refunds);
        this.people.set(people);
      } else throw new Error('This request does not identify a linked record.');
    } catch (error) {
      if (sequence === this.loadSequence)
        this.error.set(error instanceof Error ? error.message : 'Failed to load linked record');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
  private orderCustomerName(): string {
    const customer = this.order()?.customers;
    return customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ')
      : 'Walk-in';
  }
  private customerName(customer: CustomerWithCredit): string {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }
}

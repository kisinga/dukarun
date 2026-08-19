import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { LocationContextService } from '../../core/location-context.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import {
  SearchableFilterComponent,
  type SearchableFilterOption,
} from '../../shared/ui/searchable-filter.component';

type Inbound = {
  id: string;
  provider_receipt: string;
  occurred_at: string | null;
  amount: number;
  payer_phone: string | null;
  payer_name: string | null;
  account_reference: string | null;
  source: string;
  verification_status: string;
  classification: string | null;
  allocation_status: string;
  provider_status: string;
  queue_reason: string;
  intent_id: string | null;
  review_reason: string | null;
  late_review_id: string | null;
  allowed_actions: string[];
};
type ProviderEventReview = {
  id: string;
  provider_account_name: string;
  event_type: string;
  provider_event_key: string;
  error: string | null;
  result_code: string | null;
  processing_attempts: number;
  received_at: string;
  collection_id: string | null;
  allowed_actions: string[];
};
type PendingOrder = { id: string; code: string; total: number };
type CustomerOption = { id: string; first_name: string; last_name: string | null };
type Reversible = {
  collection_id: string;
  provider_receipt: string;
  amount: number;
  occurred_at: string | null;
  allocation_id: string;
  order_code: string | null;
  customer_receipt_id: string | null;
};

@Component({
  selector: 'app-mpesa-inbound',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    SearchableFilterComponent,
  ],
  template: `
    @if (error()) {
      <div class="alert alert-error mb-4 text-sm" role="alert">{{ error() }}</div>
    }
    @if (message()) {
      <div class="alert alert-success mb-4 text-sm" role="status">{{ message() }}</div>
    }
    <section class="mb-5 rounded-box border border-base-300 bg-base-100">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3"
      >
        <div>
          <h2 class="font-semibold">Unmatched M-PESA payments</h2>
          <p class="type-caption">Direct Till payments received through C2B.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge" [class.badge-warning]="rows().length > 0">{{ rows().length }}</span>
          <button
            appButton
            variant="outline"
            size="sm"
            [iconOnly]="true"
            type="button"
            [loading]="loading()"
            title="Refresh M-PESA payments"
            aria-label="Refresh M-PESA payments"
            (click)="load()"
          >
            <app-icon name="heroArrowPath" />
          </button>
        </div>
      </div>
      @if (loading() && !rows().length) {
        <div class="space-y-3 p-4">
          <div class="skeleton h-16 w-full"></div>
          <div class="skeleton h-16 w-full"></div>
        </div>
      } @else {
        <div class="divide-y divide-base-300">
          @for (row of rows(); track row.id) {
            <article class="p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-mono font-semibold">{{ row.provider_receipt }}</p>
                  <p class="type-caption">
                    {{ row.payer_name || row.payer_phone || 'Payer unavailable' }} ·
                    {{ row.occurred_at ? (row.occurred_at | date: 'medium') : 'Time unavailable' }}
                    · {{ row.source }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold"><app-money [amount]="row.amount" /></p>
                  <span
                    class="badge badge-sm"
                    [class.badge-warning]="row.queue_reason !== 'unallocated'"
                    >{{ row.queue_reason.replaceAll('_', ' ') }}</span
                  >
                </div>
              </div>
              @if (row.queue_reason === 'late_posting_review') {
                <p class="mt-3 text-sm text-warning">
                  This payment belongs to a locked accounting date. It can only be posted into the
                  current period after approval.
                </p>
                @if (selected()?.id === row.id) {
                  <div class="mt-3 grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-2">
                    <app-form-field label="Review notes">
                      <input class="input input-bordered input-sm" [formControl]="notes" />
                    </app-form-field>
                    <div class="flex flex-wrap items-end gap-2">
                      @if (row.allowed_actions.includes('approve_late')) {
                        <button
                          appButton
                          size="sm"
                          [loading]="busy()"
                          (click)="reviewLate(row, true)"
                        >
                          Approve current-period posting
                        </button>
                      }
                      @if (row.allowed_actions.includes('reject_late')) {
                        <button
                          appButton
                          variant="outline"
                          size="sm"
                          [loading]="busy()"
                          (click)="reviewLate(row, false)"
                        >
                          Reject
                        </button>
                      }
                      <button appButton variant="ghost" size="sm" (click)="selected.set(null)">
                        Cancel
                      </button>
                    </div>
                  </div>
                } @else if (row.allowed_actions.length) {
                  <button appButton variant="outline" size="sm" class="mt-3" (click)="select(row)">
                    Review late posting
                  </button>
                } @else {
                  <p class="type-caption mt-2">An approvals manager must decide this posting.</p>
                }
              } @else if (row.queue_reason === 'posting_failure') {
                <button
                  appButton
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  [loading]="busy()"
                  (click)="retryPosting(row)"
                >
                  Retry accounting post
                </button>
              } @else if (row.queue_reason === 'manual_review') {
                <p class="mt-3 text-sm text-warning">
                  Payment evidence conflicts with the current request. Review it before allocation.
                </p>
              } @else if (row.queue_reason === 'reversal_pending') {
                <p class="mt-3 text-sm text-warning">
                  Provider reversal recorded. Accounting approval is still pending.
                </p>
              } @else if (selected()?.id === row.id) {
                <div class="mt-3 grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-2">
                  <app-form-field label="Apply as">
                    <select class="select select-bordered select-sm" [formControl]="targetKind">
                      <option value="order">Pending sale</option>
                      <option value="customer">Customer account</option>
                    </select>
                  </app-form-field>
                  @if (targetKind.value === 'order') {
                    <app-form-field label="Pending sale"
                      ><select class="select select-bordered select-sm" [formControl]="orderId">
                        <option value="">Select exact match</option>
                        @for (order of matchingOrders(row.amount); track order.id) {
                          <option [value]="order.id">
                            {{ order.code }} · KES {{ order.total }}
                          </option>
                        }
                      </select></app-form-field
                    >
                  } @else {
                    <app-form-field label="Customer"
                      ><app-searchable-filter
                        ariaLabel="Select customer account"
                        placeholder="Select customer"
                        searchPlaceholder="Search customers…"
                        controlSize="sm"
                        [options]="customerOptions()"
                        [value]="customerId.value"
                        (valueChange)="customerId.setValue($event)"
                    /></app-form-field>
                  }
                  <app-form-field label="Notes"
                    ><input class="input input-bordered input-sm" [formControl]="notes"
                  /></app-form-field>
                  <app-form-field label="Or classify as"
                    ><select
                      class="select select-bordered select-sm"
                      [formControl]="classification"
                    >
                      <option value="non_business">Non-business</option>
                      <option value="test">Test payment</option>
                      <option value="refunded">Already refunded</option>
                    </select></app-form-field
                  >
                  <div class="flex flex-wrap items-end gap-2">
                    <button appButton size="sm" [loading]="busy()" (click)="match(row)">
                      Allocate</button
                    ><button
                      appButton
                      variant="outline"
                      size="sm"
                      [loading]="busy()"
                      (click)="classify(row)"
                    >
                      Classify</button
                    ><button
                      appButton
                      variant="ghost"
                      size="sm"
                      [disabled]="busy()"
                      (click)="selected.set(null)"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              } @else {
                <button appButton variant="outline" size="sm" class="mt-3" (click)="select(row)">
                  Reconcile
                </button>
              }
            </article>
          } @empty {
            <p class="p-5 text-sm text-base-content/60">No unmatched M-PESA payments.</p>
          }
        </div>
      }
    </section>
    <section class="mb-5 rounded-box border border-base-300 bg-base-100">
      <div class="border-b border-base-300 px-4 py-3">
        <h2 class="font-semibold">Provider event reviews</h2>
        <p class="type-caption">
          Resolve callback correlation or processing failures without editing payment evidence.
        </p>
      </div>
      <div class="divide-y divide-base-300">
        @for (event of providerEvents(); track event.id) {
          <article class="p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-mono font-semibold">{{ event.provider_event_key }}</p>
                <p class="type-caption">
                  {{ event.provider_account_name }} · {{ event.event_type.replaceAll('_', ' ') }} ·
                  {{ event.received_at | date: 'medium' }}
                </p>
                <p class="mt-1 text-sm text-warning">
                  {{
                    (event.error || event.result_code || 'Manual review required').replaceAll(
                      '_',
                      ' '
                    )
                  }}
                </p>
              </div>
              <span class="badge badge-warning badge-sm">
                {{ event.processing_attempts }} attempt{{
                  event.processing_attempts === 1 ? '' : 's'
                }}
              </span>
            </div>
            @if (selectedProviderEvent()?.id === event.id) {
              <div class="mt-3 grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-2">
                <app-form-field label="Resolution notes">
                  <input
                    class="input input-bordered input-sm"
                    [formControl]="providerReviewNotes"
                  />
                </app-form-field>
                <div class="flex flex-wrap items-end gap-2">
                  @if (event.allowed_actions.includes('retry')) {
                    <button
                      appButton
                      size="sm"
                      [loading]="busy()"
                      (click)="reviewProviderEvent(event, 'retry')"
                    >
                      Accept correlation and retry
                    </button>
                  }
                  @if (event.allowed_actions.includes('dismiss_no_money')) {
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      [loading]="busy()"
                      (click)="reviewProviderEvent(event, 'dismiss_no_money')"
                    >
                      Dismiss; no money received
                    </button>
                  }
                  @if (event.allowed_actions.includes('acknowledge')) {
                    <button
                      appButton
                      size="sm"
                      [loading]="busy()"
                      (click)="reviewProviderEvent(event, 'acknowledge')"
                    >
                      Acknowledge evidence
                    </button>
                  }
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    (click)="selectedProviderEvent.set(null)"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            } @else {
              <button
                appButton
                variant="outline"
                size="sm"
                class="mt-3"
                (click)="selectProviderEvent(event)"
              >
                Resolve event
              </button>
            }
          </article>
        } @empty {
          <p class="p-5 text-sm text-base-content/60">No provider events need review.</p>
        }
      </div>
    </section>
    <section class="mb-5 rounded-box border border-base-300 bg-base-100">
      <div class="border-b border-base-300 px-4 py-3">
        <h2 class="font-semibold">Record Safaricom reversals</h2>
        <p class="type-caption">Use only after Safaricom has reversed the payment.</p>
      </div>
      <div class="divide-y divide-base-300">
        @for (row of reversible(); track row.collection_id) {
          <article class="p-4">
            <div class="flex justify-between gap-3">
              <div>
                <p class="font-mono font-semibold">{{ row.provider_receipt }}</p>
                <p class="type-caption">{{ row.order_code || 'Customer account receipt' }}</p>
              </div>
              <app-money [amount]="row.amount" />
            </div>
            @if (reversing()?.collection_id === row.collection_id) {
              <div class="mt-3 grid gap-3 rounded-box bg-base-200/60 p-3 sm:grid-cols-3">
                <app-form-field label="Safaricom reversal receipt"
                  ><input class="input input-bordered input-sm" [formControl]="reversalReference"
                /></app-form-field>
                <app-form-field label="Reversal date"
                  ><input
                    type="date"
                    class="input input-bordered input-sm"
                    [formControl]="reversalDate"
                /></app-form-field>
                <app-form-field label="Reason"
                  ><input class="input input-bordered input-sm" [formControl]="reversalReason"
                /></app-form-field>
                <div class="flex flex-wrap items-end gap-2">
                  <button appButton size="sm" [loading]="busy()" (click)="recordReversal(row)">
                    Record and reverse accounting</button
                  ><button
                    appButton
                    variant="ghost"
                    size="sm"
                    [disabled]="busy()"
                    (click)="reversing.set(null)"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            } @else {
              <button
                appButton
                variant="outline"
                size="sm"
                class="mt-3"
                (click)="reversing.set(row)"
              >
                Record reversal
              </button>
            }
          </article>
        } @empty {
          <p class="p-5 text-sm text-base-content/60">No posted M-PESA collections.</p>
        }
      </div>
    </section>
  `,
})
export class MpesaInboundComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly locations = inject(LocationContextService);
  protected readonly rows = signal<Inbound[]>([]);
  protected readonly orders = signal<PendingOrder[]>([]);
  protected readonly customers = signal<CustomerOption[]>([]);
  protected readonly customerOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.customers().map(customer => ({
      value: customer.id,
      label: `${customer.first_name} ${customer.last_name ?? ''}`.trim(),
    }))
  );
  protected readonly selected = signal<Inbound | null>(null);
  protected readonly providerEvents = signal<ProviderEventReview[]>([]);
  protected readonly selectedProviderEvent = signal<ProviderEventReview | null>(null);
  protected readonly reversible = signal<Reversible[]>([]);
  protected readonly reversing = signal<Reversible | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly targetKind = new FormControl<'order' | 'customer'>('order', {
    nonNullable: true,
  });
  protected readonly orderId = new FormControl('', { nonNullable: true });
  protected readonly customerId = new FormControl('', { nonNullable: true });
  protected readonly notes = new FormControl('', { nonNullable: true });
  protected readonly providerReviewNotes = new FormControl('', { nonNullable: true });
  protected readonly classification = new FormControl<'non_business' | 'test' | 'refunded'>(
    'non_business',
    { nonNullable: true }
  );
  protected readonly reversalReference = new FormControl('', { nonNullable: true });
  protected readonly reversalDate = new FormControl(new Date().toISOString().slice(0, 10), {
    nonNullable: true,
  });
  protected readonly reversalReason = new FormControl('', { nonNullable: true });
  async ngOnInit(): Promise<void> {
    await this.load();
  }
  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const [transactions, orders, customers, reversible, providerEvents] = await Promise.all([
      this.supabase.client.rpc('list_unallocated_mpesa_collections', {
        p_limit: 100,
        p_before: undefined,
      }),
      this.supabase.client
        .from('orders')
        .select('id,code,total')
        .in('status', ['draft', 'pending_payment'])
        .order('created_at', { ascending: false })
        .limit(100),
      this.supabase.client
        .from('customers')
        .select('id,first_name,last_name')
        .is('deleted_at', null)
        .eq('is_supplier', false)
        .order('first_name')
        .limit(500),
      this.supabase.client.rpc('list_reversible_mpesa_collections', { p_limit: 50 }),
      this.supabase.client.rpc('list_mpesa_provider_event_reviews', { p_limit: 50 }),
    ]);
    const failure =
      transactions.error ??
      orders.error ??
      customers.error ??
      reversible.error ??
      providerEvents.error;
    if (failure) {
      this.error.set(failure.message);
      this.loading.set(false);
      return;
    }
    this.rows.set((transactions.data ?? []) as Inbound[]);
    this.orders.set((orders.data ?? []) as PendingOrder[]);
    this.customers.set((customers.data ?? []) as CustomerOption[]);
    this.reversible.set((reversible.data ?? []) as Reversible[]);
    this.providerEvents.set((providerEvents.data ?? []) as ProviderEventReview[]);
    this.loading.set(false);
  }
  protected select(row: Inbound): void {
    this.selected.set(row);
    this.orderId.setValue('');
    this.customerId.setValue('');
    this.notes.setValue('');
  }
  protected matchingOrders(amount: number): PendingOrder[] {
    return this.orders().filter(order => order.total === amount);
  }
  protected async reviewLate(row: Inbound, approve: boolean): Promise<void> {
    if (!row.late_review_id) return;
    if (!approve && !this.notes.value.trim()) {
      this.error.set('Enter a reason before rejecting a late posting.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('review_mpesa_late_posting', {
      p_review_id: row.late_review_id,
      p_approve: approve,
      p_notes: this.notes.value.trim() || undefined,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.message.set(
      approve
        ? `${row.provider_receipt} posted in the current period.`
        : `${row.provider_receipt} returned to reconciliation.`
    );
    this.selected.set(null);
    await this.load();
  }
  protected selectProviderEvent(event: ProviderEventReview): void {
    this.selectedProviderEvent.set(event);
    this.providerReviewNotes.setValue('');
  }
  protected async reviewProviderEvent(
    event: ProviderEventReview,
    action: 'retry' | 'dismiss_no_money' | 'acknowledge'
  ): Promise<void> {
    if (!this.providerReviewNotes.value.trim()) {
      this.error.set('Enter resolution notes.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('review_mpesa_provider_event', {
      p_event_id: event.id,
      p_action: action,
      p_notes: this.providerReviewNotes.value.trim(),
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.message.set(
      action === 'retry'
        ? 'Provider event queued for retry.'
        : action === 'acknowledge'
          ? 'Provider evidence acknowledged.'
          : 'Provider event dismissed with no money evidence.'
    );
    this.selectedProviderEvent.set(null);
    await this.load();
  }
  protected async match(row: Inbound): Promise<void> {
    if (
      (this.targetKind.value === 'order' && !this.orderId.value) ||
      (this.targetKind.value === 'customer' && !this.customerId.value)
    ) {
      this.error.set('Select a sale or customer.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const { data, error } = await this.supabase.client.rpc('allocate_mpesa_collection', {
      p_collection_id: row.id,
      p_order_id: this.targetKind.value === 'order' ? this.orderId.value : undefined,
      p_customer_id: this.targetKind.value === 'customer' ? this.customerId.value : undefined,
      p_location_id:
        this.targetKind.value === 'customer' ? this.locations.requireActiveId() : undefined,
      p_notes: this.notes.value || undefined,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    const result = data as { status?: string } | null;
    this.message.set(
      result?.status === 'late_review'
        ? `${row.provider_receipt} reserved and sent for late-posting approval.`
        : `${row.provider_receipt} allocated.`
    );
    this.selected.set(null);
    await this.load();
  }
  protected async classify(row: Inbound): Promise<void> {
    if (!this.notes.value.trim()) {
      this.error.set('Enter a reason before classifying a payment.');
      return;
    }
    this.busy.set(true);
    const { error } = await this.supabase.client.rpc('classify_mpesa_collection', {
      p_collection_id: row.id,
      p_classification: this.classification.value,
      p_notes: this.notes.value,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.message.set(
      `${row.provider_receipt} classified as ${this.classification.value.replaceAll('_', ' ')}.`
    );
    this.selected.set(null);
    await this.load();
  }
  protected async retryPosting(row: Inbound): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const { error } = await this.supabase.client.rpc('retry_mpesa_collection_posting', {
      p_collection_id: row.id,
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.message.set(`Accounting retry queued for ${row.provider_receipt}.`);
    await this.load();
  }
  protected async recordReversal(row: Reversible): Promise<void> {
    if (
      !this.reversalReference.value.trim() ||
      !this.reversalReason.value.trim() ||
      !this.reversalDate.value
    ) {
      this.error.set('Enter the Safaricom receipt, date and reason.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    const { data, error } = await this.supabase.client.rpc('request_mpesa_reversal', {
      p_collection_id: row.collection_id,
      p_provider_reference: this.reversalReference.value.trim(),
      p_provider_reversed_at: new Date(this.reversalDate.value).toISOString(),
      p_reason: this.reversalReason.value.trim(),
    });
    this.busy.set(false);
    if (error) {
      this.error.set(error.message);
      return;
    }
    const result = data as { status?: string } | null;
    this.message.set(
      result?.status === 'approval_required'
        ? 'Accounting reversal sent for approval.'
        : 'Reversal recorded.'
    );
    this.reversing.set(null);
    this.reversalReference.setValue('');
    this.reversalReason.setValue('');
    await this.load();
  }
}

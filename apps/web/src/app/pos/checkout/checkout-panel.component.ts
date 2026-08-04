import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseKes } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import type { PaymentInput } from '../pos.service';

/** An enabled tender method as shown in the checkout panel. */
export interface PaymentMethodOption {
  code: string;
  name: string;
  isCashierControlled: boolean;
}

interface Tender {
  /** Method code from the configured payment methods. */
  method: string;
  /** User-typed KES amount (parsed to shillings on confirm). */
  amountText: string;
  reference: string;
}

/**
 * Shared checkout panel: payment method tabs, 2-way split tender, M-Pesa
 * reference, and cash change calculation. Tenders only — credit is handled
 * by the callers. Used by Sell (complete/convert) and the cashier queue (settle).
 */
@Component({
  selector: 'app-checkout-panel',
  imports: [FormsModule, ButtonComponent, FormFieldComponent, IconComponent, MoneyComponent],
  template: `
    <dialog
      class="modal modal-open"
      aria-labelledby="checkout-heading"
      (cancel)="$event.preventDefault(); cancelled.emit()"
    >
      <div
        class="modal-box flex flex-col overflow-hidden border border-base-300/60 bg-base-100 p-0 md:w-full md:max-w-xl"
      >
        <header
          class="flex items-center justify-between gap-3 border-b border-base-300/60 px-4 py-3 md:px-6"
        >
          <h2 id="checkout-heading" class="type-title truncate">{{ heading() }}</h2>
          <div class="flex shrink-0 items-baseline gap-2">
            <span class="type-caption">Due</span>
            <span class="font-semibold tabular-nums"><app-money [amount]="total()" /></span>
          </div>
          <button
            appButton
            variant="ghost"
            size="md"
            [iconOnly]="true"
            type="button"
            aria-label="Close payment"
            (click)="cancelled.emit()"
          >
            <app-icon name="heroXMark" size="lg" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto p-3 md:p-6">
          <section aria-labelledby="payment-method-heading">
            <p id="payment-method-heading" class="type-heading mb-2">Payment method</p>
            <div class="rounded-box bg-base-200 p-1">
              <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Payment method">
                @for (method of methods(); track method.code) {
                  <button
                    appButton
                    [variant]="!isSplit() && singleMethod() === method.code ? 'soft' : 'ghost'"
                    size="md"
                    type="button"
                    role="tab"
                    class="flex-1 whitespace-nowrap"
                    [attr.aria-selected]="!isSplit() && singleMethod() === method.code"
                    (click)="setMode(method.code)"
                  >
                    {{ method.name }}
                  </button>
                }
              </div>
            </div>
          </section>

          @if (directMethod(); as direct) {
            <div class="alert alert-warning mt-3 py-2" role="alert">
              <app-icon name="heroExclamationTriangle" />
              <span
                >Paid directly to {{ direct.name }} — this bypasses the till. Confirm the money has
                arrived.</span
              >
            </div>
          }

          <div class="mt-3 flex flex-col gap-3 md:mt-4 md:gap-4">
            @if (isSplit()) {
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="type-heading">Split payment</p>
                  <p class="type-caption mt-1">Divide the total between two payment methods.</p>
                </div>
                <button appButton variant="ghost" size="sm" type="button" (click)="collapseSplit()">
                  Use one method
                </button>
              </div>

              <div class="rounded-box bg-base-200 p-3 md:p-4">
                <div class="mb-2 flex items-center justify-between gap-3">
                  <span class="type-heading">{{ methodLabel(tenders()[0].method) }}</span>
                  <span class="type-heading text-right">{{
                    methodLabel(tenders()[1].method)
                  }}</span>
                </div>
                <input
                  type="range"
                  class="range range-primary range-sm w-full"
                  min="0"
                  [max]="total()"
                  step="1"
                  [ngModel]="splitFirstAmount()"
                  (ngModelChange)="setSplitFirstAmount($event)"
                  aria-label="Allocate the total between the two payment methods"
                />
                <div class="mt-3 grid grid-cols-3 gap-2">
                  <button
                    appButton
                    variant="outline"
                    size="sm"
                    type="button"
                    (click)="setSplitRatio(0.25)"
                  >
                    25 / 75
                  </button>
                  <button
                    appButton
                    variant="outline"
                    size="sm"
                    type="button"
                    (click)="setSplitRatio(0.5)"
                  >
                    Equal
                  </button>
                  <button
                    appButton
                    variant="outline"
                    size="sm"
                    type="button"
                    (click)="setSplitRatio(0.75)"
                  >
                    75 / 25
                  </button>
                </div>
              </div>
            }

            @if (singleMethod() === 'cash') {
              <div>
                <p class="type-heading">Cash received</p>
                <p class="type-caption mt-1">Choose a common amount or enter it below.</p>
                <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  @for (amount of cashSuggestions(); track amount) {
                    <button
                      appButton
                      [variant]="paidAmount() === amount ? 'soft' : 'outline'"
                      size="md"
                      type="button"
                      class="w-full"
                      [attr.aria-pressed]="paidAmount() === amount"
                      (click)="useCashAmount(amount)"
                    >
                      @if (amount === total()) {
                        Exact
                      } @else {
                        <app-money [amount]="amount" />
                      }
                    </button>
                  }
                </div>
              </div>
            }

            <div class="grid gap-3" [class.sm:grid-cols-2]="isSplit()">
              @for (tender of tenders(); track $index) {
                <div
                  class="min-w-0"
                  [class.rounded-box]="isSplit()"
                  [class.bg-base-200]="isSplit()"
                  [class.p-4]="isSplit()"
                >
                  @if (isSplit()) {
                    <p class="type-heading mb-2">Payment {{ $index + 1 }}</p>
                  }
                  <div
                    class="grid items-start gap-3"
                    [class.sm:grid-cols-2]="!isSplit() && tender.method !== 'cash'"
                  >
                    @if (isSplit()) {
                      <app-form-field label="Method">
                        <select
                          class="select select-bordered min-h-11 w-full"
                          [ngModel]="tender.method"
                          (ngModelChange)="patchTender($index, { method: $event })"
                        >
                          @for (method of methods(); track method.code) {
                            <option
                              [value]="method.code"
                              [disabled]="methodUsedElsewhere(method.code, $index)"
                            >
                              {{ method.name }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                    }
                    <app-form-field
                      [label]="
                        !isSplit() && tender.method === 'cash'
                          ? 'Amount received (KES)'
                          : 'Amount (KES)'
                      "
                    >
                      <input
                        type="text"
                        inputmode="numeric"
                        class="input input-bordered min-h-11 w-full font-semibold tabular-nums"
                        autocomplete="off"
                        [ngModel]="tender.amountText"
                        (ngModelChange)="patchTenderAmount($index, $event)"
                        (focus)="selectAmount($event)"
                      />
                    </app-form-field>
                    @if (tender.method !== 'cash') {
                      <app-form-field label="Reference" hint="Optional transaction code.">
                        <input
                          type="text"
                          class="input input-bordered min-h-11 w-full uppercase"
                          placeholder="e.g. QGH7X2K1"
                          [ngModel]="tender.reference"
                          (ngModelChange)="patchTender($index, { reference: $event })"
                        />
                      </app-form-field>
                    }
                  </div>
                </div>
              }
            </div>

            <div
              class="rounded-box border border-base-300/60 bg-base-200/50 px-3 py-2"
              aria-live="polite"
            >
              <div class="flex items-center justify-between gap-2 text-sm">
                <span>
                  {{ isSplit() ? 'Allocated' : singleMethod() === 'cash' ? 'Received' : 'Paid' }}
                  <strong
                    class="tabular-nums"
                    [class.text-error]="
                      paidAmount() < total() || (isSplit() && paidAmount() > total())
                    "
                    [class.text-success]="
                      (paidAmount() === total() && !hasInvalidTender()) ||
                      (!isSplit() && paidAmount() > total())
                    "
                  >
                    <app-money [amount]="paidAmount()" />
                  </strong>
                </span>
                @if (changeAmount() > 0) {
                  <span class="tabular-nums">
                    Change
                    <strong class="text-success"><app-money [amount]="changeAmount()" /></strong>
                  </span>
                } @else if (remainingAmount() > 0) {
                  <span class="tabular-nums">
                    Remaining
                    <strong class="text-error"><app-money [amount]="remainingAmount()" /></strong>
                  </span>
                } @else if (overpaidAmount() > 0) {
                  <span class="tabular-nums">
                    Over by
                    <strong class="text-error"><app-money [amount]="overpaidAmount()" /></strong>
                  </span>
                } @else if (hasInvalidTender()) {
                  <span class="badge badge-warning badge-sm">Enter both amounts</span>
                } @else {
                  <span class="badge badge-success badge-sm gap-1">
                    <app-icon name="heroCheckCircle" size="sm" />
                    Ready
                  </span>
                }
              </div>
              @if (isSplit()) {
                <progress
                  class="progress progress-primary mt-2 w-full"
                  [value]="allocatedProgressAmount()"
                  [max]="total()"
                  aria-label="Payment allocation progress"
                ></progress>
              }
            </div>

            @if (!isSplit() && methods().length > 1) {
              <button
                appButton
                variant="outline"
                size="md"
                type="button"
                class="w-full sm:w-auto"
                (click)="startSplit()"
              >
                <app-icon name="heroPlus" />
                Split payment
              </button>
            }
          </div>

          @if (error()) {
            <div class="alert alert-error mt-3 py-3" role="alert">
              <app-icon name="heroExclamationTriangle" />
              <span>{{ error() }}</span>
            </div>
          }
        </div>

        <footer
          class="mt-auto border-t border-base-300/60 bg-base-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6"
        >
          <div class="flex gap-2">
            <button
              appButton
              variant="ghost"
              size="md"
              type="button"
              class="min-w-24"
              [disabled]="busy()"
              (click)="cancelled.emit()"
            >
              Cancel
            </button>
            <button
              appButton
              size="md"
              type="button"
              class="flex-1"
              [class.ring-2]="armed()"
              [class.ring-warning]="armed()"
              [loading]="busy()"
              [disabled]="!canConfirm()"
              (click)="confirm()"
            >
              {{
                needsApproval()
                  ? 'Request approval'
                  : armed()
                    ? 'Tap again to confirm'
                    : 'Complete sale'
              }}
            </button>
          </div>
          @if (needsApproval()) {
            <p class="type-caption mt-2 text-center">
              Requires approval from someone with finance access.
            </p>
          }
        </footer>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="button" aria-label="Close payment" (click)="cancelled.emit()">close</button>
      </form>
    </dialog>
  `,
})
export class CheckoutPanelComponent {
  /** Order total in shillings. */
  readonly total = input.required<number>();
  /** Enabled tender methods (code, display name, till-control flag). */
  readonly methods = input.required<PaymentMethodOption[]>();
  /** Whether the user may confirm tenders paid to direct (non-till) accounts. */
  readonly canUseDirectAccounts = input(false);
  readonly heading = input('Checkout');
  readonly busy = input(false);

  readonly confirmed = output<PaymentInput[]>();
  /** Emitted instead of `confirmed` when a direct-account tender needs approval. */
  readonly approvalRequested = output<PaymentInput[]>();
  readonly cancelled = output<void>();

  protected readonly tenders = signal<Tender[]>([]);
  protected readonly error = signal<string | null>(null);
  /** Two-tap arm for direct-account tenders when the user has finance access. */
  protected readonly armed = signal(false);
  protected readonly isSplit = computed(() => this.tenders().length > 1);
  protected readonly singleMethod = computed(() =>
    this.isSplit() ? null : (this.tenders()[0]?.method ?? null)
  );

  /** First tender method that pays a direct (non-cashier-controlled) account. */
  protected readonly directMethod = computed(
    () =>
      this.tenders()
        .map(tender => this.optionFor(tender.method))
        .find(option => option && !option.isCashierControlled) ?? null
  );
  protected readonly needsApproval = computed(
    () => this.directMethod() !== null && !this.canUseDirectAccounts()
  );

  private initialized = false;

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(): void {
    if (this.initialized) this.reset();
  }

  private reset(): void {
    this.initialized = true;
    const first = this.methods()[0]?.code ?? 'cash';
    this.tenders.set([{ method: first, amountText: this.amountText(this.total()), reference: '' }]);
    this.error.set(null);
    this.armed.set(false);
  }

  protected setMode(code: string): void {
    this.armed.set(false);
    this.tenders.set([
      {
        method: code,
        amountText: this.amountText(this.total()),
        reference: '',
      },
    ]);
  }

  protected patchTender(index: number, changes: Partial<Tender>): void {
    this.armed.set(false);
    this.tenders.update(ts => ts.map((t, i) => (i === index ? { ...t, ...changes } : t)));
  }

  protected patchTenderAmount(index: number, amountText: string): void {
    this.armed.set(false);
    const amount = parseKes(amountText);
    const ts = this.tenders();

    if (ts.length !== 2 || amount === null || amount < 0 || amount > this.total()) {
      this.patchTender(index, { amountText });
      return;
    }

    this.tenders.set(
      ts.map((tender, tenderIndex) => ({
        ...tender,
        amountText: tenderIndex === index ? amountText : this.amountText(this.total() - amount),
      }))
    );
  }

  /** Start a 2-way split: mpesa + cash when available, else the first two methods. */
  protected startSplit(): void {
    const codes = this.methods().map(method => method.code);
    const first = codes.includes('mpesa') ? 'mpesa' : codes[0];
    const second =
      (first !== 'cash' && codes.includes('cash') ? 'cash' : null) ??
      codes.find(code => code !== first);
    if (!first || !second) return;

    const half = Math.floor(this.total() / 2);
    this.armed.set(false);
    this.tenders.set([
      {
        method: first,
        amountText: this.amountText(this.total() - half),
        reference: '',
      },
      { method: second, amountText: this.amountText(half), reference: '' },
    ]);
  }

  protected collapseSplit(): void {
    const first = this.tenders()[0];
    if (first) this.useSingleTender(first);
  }

  protected readonly splitFirstAmount = computed(
    () => parseKes(this.tenders()[0]?.amountText ?? '') ?? 0
  );

  protected setSplitFirstAmount(value: number | string): void {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    const clamped = Math.min(Math.max(Math.round(amount), 0), this.total());
    this.setTwoWaySplit(clamped);
  }

  protected setSplitRatio(firstShare: number): void {
    this.setTwoWaySplit(Math.round(this.total() * firstShare));
  }

  protected methodUsedElsewhere(code: string, index: number): boolean {
    return this.tenders().some(
      (tender, tenderIndex) => tenderIndex !== index && tender.method === code
    );
  }

  protected paidAmount = computed(() =>
    this.tenders().reduce((sum, t) => sum + (parseKes(t.amountText) ?? 0), 0)
  );
  protected readonly remainingAmount = computed(() =>
    Math.max(this.total() - this.paidAmount(), 0)
  );
  protected readonly overpaidAmount = computed(() => Math.max(this.paidAmount() - this.total(), 0));
  protected readonly allocatedProgressAmount = computed(() =>
    Math.min(this.paidAmount(), this.total())
  );
  protected readonly hasInvalidTender = computed(() =>
    this.tenders().some(tender => (parseKes(tender.amountText) ?? 0) <= 0)
  );

  protected readonly cashSuggestions = computed(() => {
    const total = this.total();
    const roundUp = (unit: number) => Math.ceil(total / unit) * unit;
    const kenyanNotes = [5_000, 10_000, 20_000, 50_000, 100_000];

    return [
      ...new Set([
        total,
        roundUp(5_000),
        roundUp(10_000),
        ...kenyanNotes.filter(note => note >= total),
        roundUp(50_000),
        roundUp(100_000),
      ]),
    ]
      .filter(amount => amount >= total)
      .sort((a, b) => a - b)
      .slice(0, 4);
  });

  protected useCashAmount(amount: number): void {
    this.patchTender(0, { amountText: this.amountText(amount) });
  }

  protected selectAmount(event: FocusEvent): void {
    (event.target as HTMLInputElement).select();
  }

  /** Cash change when a single cash tender covers (or exceeds) the total. */
  protected changeAmount = computed(() => {
    const ts = this.tenders();
    if (ts.length !== 1 || ts[0].method !== 'cash') return 0;
    const tendered = parseKes(ts[0].amountText);
    if (tendered === null || tendered <= this.total()) return 0;
    return tendered - this.total();
  });

  protected canConfirm = computed(() => {
    const ts = this.tenders();
    if (ts.length === 0) return false;
    if (this.hasInvalidTender()) return false;
    // A single cash tender may exceed the total (change given); anything else
    // must sum to the total exactly (the backend enforces payment_mismatch).
    if (ts.length === 1 && ts[0].method === 'cash') return this.paidAmount() >= this.total();
    return this.paidAmount() === this.total();
  });

  protected methodLabel(code: string): string {
    return this.optionFor(code)?.name ?? code;
  }

  private optionFor(code: string): PaymentMethodOption | undefined {
    return this.methods().find(method => method.code === code);
  }

  private amountText(amount: number): string {
    return String(amount);
  }

  private setTwoWaySplit(firstAmount: number): void {
    const ts = this.tenders();
    if (ts.length !== 2) return;
    this.armed.set(false);
    this.tenders.set([
      { ...ts[0], amountText: this.amountText(firstAmount) },
      { ...ts[1], amountText: this.amountText(this.total() - firstAmount) },
    ]);
  }

  private useSingleTender(tender: Tender): void {
    this.armed.set(false);
    this.tenders.set([
      { ...tender, amountText: this.amountText(this.total()), reference: tender.reference },
    ]);
  }

  /** Build the PaymentInput payload, or null (with `error` set) when invalid. */
  private buildPayments(): PaymentInput[] | null {
    const ts = this.tenders();
    // Single cash tender with overpayment: send the exact total; change is
    // handed back physically and is not part of the payment record.
    if (ts.length === 1 && ts[0].method === 'cash' && this.paidAmount() > this.total()) {
      return [{ method: 'cash', amount: this.total() }];
    }
    const payments: PaymentInput[] = [];
    for (const t of ts) {
      const amount = parseKes(t.amountText);
      if (amount === null || amount <= 0) {
        this.error.set('Enter a valid amount for every payment row');
        return null;
      }
      payments.push({
        method: t.method,
        amount,
        ...(t.reference.trim() ? { reference: t.reference.trim() } : {}),
      });
    }
    return payments;
  }

  protected confirm(): void {
    this.error.set(null);
    if (this.directMethod() !== null) {
      if (this.needsApproval()) {
        const payments = this.buildPayments();
        if (payments) this.approvalRequested.emit(payments);
        return;
      }
      if (!this.armed()) {
        this.armed.set(true);
        return;
      }
    }
    const payments = this.buildPayments();
    if (payments) this.confirmed.emit(payments);
  }
}

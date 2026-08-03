import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseKesToCents } from '../../core/money';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import type { PaymentInput } from '../pos.service';

interface Tender {
  method: 'cash' | 'mpesa' | 'bank';
  /** User-typed KES amount (parsed to cents on confirm). */
  amountText: string;
  reference: string;
}

/**
 * Shared checkout panel: payment method tabs, split-tender rows, M-Pesa
 * reference, cash change calculation, and a credit mode (emits []).
 * Used by Sell (complete/convert) and the cashier queue (settle).
 */
@Component({
  selector: 'app-checkout-panel',
  imports: [FormsModule, ButtonComponent, FormFieldComponent, IconComponent, MoneyComponent],
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 md:p-4">
      <div
        class="flex h-full max-h-dvh w-full max-w-full flex-col overflow-hidden rounded-none border border-base-300/60 bg-base-100 shadow-overlay md:h-auto md:max-h-[90vh] md:w-full md:max-w-xl md:rounded-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-heading"
      >
        <header
          class="flex items-start justify-between gap-4 border-b border-base-300/60 p-4 md:px-6 md:py-5"
        >
          <div class="min-w-0">
            <h2 id="checkout-heading" class="type-title truncate">{{ heading() }}</h2>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="type-caption">Amount due</span>
              <span class="type-hero"><app-money [cents]="total()" /></span>
            </div>
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

        <div class="flex-1 overflow-y-auto p-4 md:p-6">
          <p class="type-heading mb-2">Payment method</p>
          <div
            class="grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="tablist"
            aria-label="Payment method"
          >
            @for (method of methods(); track method) {
              <button
                appButton
                [variant]="!isSplit() && mode() === method ? 'soft' : 'outline'"
                size="md"
                type="button"
                role="tab"
                [attr.aria-selected]="!isSplit() && mode() === method"
                (click)="setMode(method)"
              >
                {{ methodLabel(method) }}
              </button>
            }
            <button
              appButton
              [variant]="mode() === 'credit' ? 'soft' : 'outline'"
              size="md"
              type="button"
              role="tab"
              [disabled]="!creditAllowed()"
              [attr.aria-selected]="mode() === 'credit'"
              [attr.title]="
                creditAllowed() ? null : 'Customer approval or available credit is required'
              "
              (click)="setMode('credit')"
            >
              Credit
            </button>
          </div>

          @if (mode() === 'credit') {
            <div class="mt-4 rounded-box bg-info/10 p-4">
              <p class="font-semibold">Charge the full amount to this customer</p>
              <p class="mt-1 type-body text-base-content/70">
                This sale will be recorded as money the customer owes.
              </p>
            </div>
          } @else {
            <div class="mt-5 flex flex-col gap-4">
              @if (isSplit()) {
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="type-heading">Split payment</p>
                    <p class="type-caption mt-1">
                      Divide the total between {{ tenders().length }} payment methods.
                    </p>
                  </div>
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    (click)="collapseSplit()"
                  >
                    Use one method
                  </button>
                </div>

                @if (tenders().length === 2) {
                  <div class="rounded-box bg-base-200 p-4">
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
                      [ngModel]="splitFirstCents()"
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
              }

              @if (mode() === 'cash' && tenders().length === 1) {
                <div>
                  <p class="type-heading mb-2">Cash received</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    @for (amount of cashSuggestions(); track amount) {
                      <button
                        appButton
                        [variant]="paidCents() === amount ? 'soft' : 'outline'"
                        size="md"
                        type="button"
                        (click)="useCashAmount(amount)"
                      >
                        @if (amount === total()) {
                          Exact
                        } @else {
                          <app-money [cents]="amount" />
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
                      <div class="mb-3 flex items-center justify-between gap-3">
                        <span class="type-heading">Payment {{ $index + 1 }}</span>
                        <button
                          appButton
                          variant="ghost"
                          size="sm"
                          type="button"
                          class="text-base-content/60 hover:text-error"
                          (click)="removeTender($index)"
                        >
                          <app-icon name="heroXMark" />
                          Remove
                        </button>
                      </div>
                    }
                    <div class="grid items-start gap-3" [class.sm:grid-cols-2]="!isSplit()">
                      @if (isSplit()) {
                        <app-form-field label="Method">
                          <select
                            class="select select-bordered min-h-11 w-full"
                            [ngModel]="tender.method"
                            (ngModelChange)="patchTender($index, { method: $event })"
                          >
                            @for (method of methods(); track method) {
                              <option
                                [value]="method"
                                [disabled]="methodUsedElsewhere(method, $index)"
                              >
                                {{ methodLabel(method) }}
                              </option>
                            }
                          </select>
                        </app-form-field>
                      }
                      <app-form-field label="Amount (KES)">
                        <input
                          type="text"
                          inputmode="numeric"
                          class="input input-bordered min-h-11 w-full"
                          [ngModel]="tender.amountText"
                          (ngModelChange)="patchTenderAmount($index, $event)"
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

              @if (isSplit() || tenders().length < methods().length) {
                <div class="flex flex-wrap gap-2">
                  @if (isSplit() && tenders().length > 2) {
                    <button
                      appButton
                      variant="outline"
                      size="sm"
                      type="button"
                      (click)="splitEvenly()"
                    >
                      Split evenly
                    </button>
                  }
                  @if (tenders().length < methods().length) {
                    <button appButton variant="ghost" size="md" type="button" (click)="addTender()">
                      <app-icon name="heroPlus" />
                      {{ isSplit() ? 'Add payment method' : 'Split payment' }}
                    </button>
                  }
                </div>
              }

              <div class="rounded-box bg-base-200 px-4 py-3" aria-live="polite">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="type-caption">{{ isSplit() ? 'Allocated' : 'Paid' }}</p>
                    <p
                      class="font-semibold"
                      [class.text-error]="
                        paidCents() < total() || (isSplit() && paidCents() > total())
                      "
                      [class.text-success]="
                        (paidCents() === total() && !hasInvalidTender()) ||
                        (!isSplit() && paidCents() > total())
                      "
                    >
                      <app-money [cents]="paidCents()" />
                    </p>
                  </div>
                  @if (changeCents() > 0) {
                    <div class="text-right">
                      <p class="type-caption">Change to give</p>
                      <p class="text-lg font-bold text-success">
                        <app-money [cents]="changeCents()" />
                      </p>
                    </div>
                  } @else if (remainingCents() > 0) {
                    <div class="text-right">
                      <p class="type-caption">Remaining</p>
                      <p class="font-semibold text-error">
                        <app-money [cents]="remainingCents()" />
                      </p>
                    </div>
                  } @else if (overpaidCents() > 0) {
                    <div class="text-right">
                      <p class="type-caption">Over by</p>
                      <p class="font-semibold text-error">
                        <app-money [cents]="overpaidCents()" />
                      </p>
                    </div>
                  } @else if (hasInvalidTender()) {
                    <span class="badge badge-warning">Enter both amounts</span>
                  } @else {
                    <span class="badge badge-success gap-1">
                      <app-icon name="heroCheckCircle" size="sm" />
                      Ready
                    </span>
                  }
                </div>
                @if (isSplit()) {
                  <progress
                    class="progress progress-primary mt-3 w-full"
                    [value]="allocatedProgressCents()"
                    [max]="total()"
                    aria-label="Payment allocation progress"
                  ></progress>
                }
              </div>
            </div>
          }

          @if (error()) {
            <div class="alert alert-error mt-3 py-3" role="alert">
              <app-icon name="heroExclamationTriangle" />
              <span>{{ error() }}</span>
            </div>
          }
        </div>

        <footer class="flex gap-2 border-t border-base-300/60 bg-base-100 p-4 md:px-6">
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
            [loading]="busy()"
            [disabled]="!canConfirm()"
            (click)="confirm()"
          >
            {{ mode() === 'credit' ? 'Charge customer' : 'Complete sale' }}
          </button>
        </footer>
      </div>
    </div>
  `,
})
export class CheckoutPanelComponent {
  /** Order total in cents. */
  readonly total = input.required<number>();
  /** Whether the credit tab is selectable (requires a real customer). */
  readonly creditAllowed = input(false);
  /** Enabled non-credit method codes from payment_methods. */
  readonly methods = input<string[]>(['cash', 'mpesa', 'bank']);
  readonly heading = input('Checkout');
  readonly busy = input(false);

  readonly confirmed = output<PaymentInput[]>();
  readonly cancelled = output<void>();

  protected readonly mode = signal<string>('cash');
  protected readonly tenders = signal<Tender[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly isSplit = computed(() => this.tenders().length > 1);

  private initialized = false;

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(): void {
    if (this.initialized) this.reset();
  }

  private reset(): void {
    this.initialized = true;
    const first = (this.methods()[0] ?? 'cash') as Tender['method'];
    this.mode.set(first);
    this.tenders.set([{ method: first, amountText: this.amountText(this.total()), reference: '' }]);
    this.error.set(null);
  }

  protected setMode(mode: string): void {
    if (mode === 'credit' && !this.creditAllowed()) return;
    this.mode.set(mode);
    if (mode !== 'credit') {
      this.tenders.set([
        {
          method: mode as Tender['method'],
          amountText: this.amountText(this.total()),
          reference: '',
        },
      ]);
    }
  }

  protected patchTender(index: number, changes: Partial<Tender>): void {
    this.tenders.update(ts => ts.map((t, i) => (i === index ? { ...t, ...changes } : t)));
  }

  protected patchTenderAmount(index: number, amountText: string): void {
    const amount = parseKesToCents(amountText);
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

  protected addTender(): void {
    const current = this.tenders();
    const used = new Set<string>(current.map(t => t.method));
    const nextMethod = this.methods().find(method => !used.has(method));
    if (!nextMethod) return;

    const remaining = this.total() - this.paidCents();
    const next = [
      ...current,
      {
        method: nextMethod as Tender['method'],
        amountText: this.amountText(Math.max(remaining, 0)),
        reference: '',
      },
    ];

    this.tenders.set(remaining > 0 ? next : this.evenlyAllocated(next));
  }

  protected removeTender(index: number): void {
    const current = this.tenders();
    const next = current.filter((_, tenderIndex) => tenderIndex !== index);
    if (next.length === 0) return;

    if (next.length === 1) {
      this.useSingleTender(next[0]);
      return;
    }

    this.tenders.set(this.evenlyAllocated(next));
  }

  protected collapseSplit(): void {
    const first = this.tenders()[0];
    if (first) this.useSingleTender(first);
  }

  protected splitEvenly(): void {
    this.tenders.update(ts => this.evenlyAllocated(ts));
  }

  protected readonly splitFirstCents = computed(
    () => parseKesToCents(this.tenders()[0]?.amountText ?? '') ?? 0
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

  protected methodUsedElsewhere(method: string, index: number): boolean {
    return this.tenders().some(
      (tender, tenderIndex) => tenderIndex !== index && tender.method === method
    );
  }

  protected paidCents = computed(() =>
    this.tenders().reduce((sum, t) => sum + (parseKesToCents(t.amountText) ?? 0), 0)
  );
  protected readonly remainingCents = computed(() => Math.max(this.total() - this.paidCents(), 0));
  protected readonly overpaidCents = computed(() => Math.max(this.paidCents() - this.total(), 0));
  protected readonly allocatedProgressCents = computed(() =>
    Math.min(this.paidCents(), this.total())
  );
  protected readonly hasInvalidTender = computed(() =>
    this.tenders().some(tender => (parseKesToCents(tender.amountText) ?? 0) <= 0)
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
      .sort((a, b) => a - b);
  });

  protected useCashAmount(amount: number): void {
    this.patchTender(0, { amountText: this.amountText(amount) });
  }

  /** Cash change when a single cash tender covers (or exceeds) the total. */
  protected changeCents = computed(() => {
    const ts = this.tenders();
    if (ts.length !== 1 || ts[0].method !== 'cash') return 0;
    const tendered = parseKesToCents(ts[0].amountText);
    if (tendered === null || tendered <= this.total()) return 0;
    return tendered - this.total();
  });

  protected canConfirm = computed(() => {
    if (this.mode() === 'credit') return this.creditAllowed();
    const ts = this.tenders();
    if (ts.length === 0) return false;
    if (this.hasInvalidTender()) return false;
    // A single cash tender may exceed the total (change given); anything else
    // must sum to the total exactly (the backend enforces payment_mismatch).
    if (ts.length === 1 && ts[0].method === 'cash') return this.paidCents() >= this.total();
    return this.paidCents() === this.total();
  });

  protected methodLabel(code: string): string {
    return code === 'mpesa' ? 'M-Pesa' : code.charAt(0).toUpperCase() + code.slice(1);
  }

  private amountText(cents: number): string {
    const kes = cents / 100;
    return Number.isInteger(kes) ? String(kes) : kes.toFixed(2);
  }

  private setTwoWaySplit(firstAmount: number): void {
    const ts = this.tenders();
    if (ts.length !== 2) return;
    this.tenders.set([
      { ...ts[0], amountText: this.amountText(firstAmount) },
      { ...ts[1], amountText: this.amountText(this.total() - firstAmount) },
    ]);
  }

  private evenlyAllocated(tenders: Tender[]): Tender[] {
    if (tenders.length === 0) return [];
    const baseAmount = Math.floor(this.total() / tenders.length);
    const remainder = this.total() - baseAmount * tenders.length;
    return tenders.map((tender, index) => ({
      ...tender,
      amountText: this.amountText(baseAmount + (index < remainder ? 1 : 0)),
    }));
  }

  private useSingleTender(tender: Tender): void {
    this.mode.set(tender.method);
    this.tenders.set([
      { ...tender, amountText: this.amountText(this.total()), reference: tender.reference },
    ]);
  }

  protected confirm(): void {
    this.error.set(null);
    if (this.mode() === 'credit') {
      this.confirmed.emit([]);
      return;
    }
    const ts = this.tenders();
    // Single cash tender with overpayment: send the exact total; change is
    // handed back physically and is not part of the payment record.
    if (ts.length === 1 && ts[0].method === 'cash' && this.paidCents() > this.total()) {
      this.confirmed.emit([{ method: 'cash', amount: this.total() }]);
      return;
    }
    const payments: PaymentInput[] = [];
    for (const t of ts) {
      const amount = parseKesToCents(t.amountText);
      if (amount === null || amount <= 0) {
        this.error.set('Enter a valid amount for every payment row');
        return;
      }
      payments.push({
        method: t.method,
        amount,
        ...(t.reference.trim() ? { reference: t.reference.trim() } : {}),
      });
    }
    this.confirmed.emit(payments);
  }
}

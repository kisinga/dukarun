import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon } from '@ng-icons/core';
import { formatKes, parseKesToCents } from '../../core/money';
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
  imports: [FormsModule, NgIcon],
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 md:p-4">
      <div
        class="card h-full max-h-dvh w-full max-w-full overflow-y-auto rounded-none bg-base-100 shadow-overlay md:h-auto md:max-h-[90vh] md:w-full md:max-w-md md:rounded-box"
      >
        <div class="card-body">
          <div class="flex items-center justify-between">
            <h2 class="type-title">{{ title() }}</h2>
            <button type="button" class="btn btn-ghost btn-sm" (click)="cancelled.emit()">
              <ng-icon name="heroXMark" />
            </button>
          </div>
          <p class="type-hero mt-1">{{ fmt(total()) }}</p>

          <div role="tablist" class="tabs tabs-boxed mt-2">
            @for (m of methods(); track m) {
              <a role="tab" class="tab" [class.tab-active]="mode() === m" (click)="setMode(m)">{{
                methodLabel(m)
              }}</a>
            }
            <a
              role="tab"
              class="tab"
              [class.tab-active]="mode() === 'credit'"
              [class.tab-disabled]="!creditAllowed()"
              (click)="setMode('credit')"
              >Credit</a
            >
          </div>

          @if (mode() === 'credit') {
            <p class="mt-4 text-sm text-base-content/70">
              The full amount goes on the customer's tab (accounts receivable).
            </p>
          } @else {
            <div class="mt-4 flex flex-col gap-3">
              @for (tender of tenders(); track $index) {
                <div class="flex items-end gap-2">
                  <label class="form-control w-28">
                    <span class="label-text">Method</span>
                    <select
                      class="select select-bordered select-sm"
                      [ngModel]="tender.method"
                      (ngModelChange)="patchTender($index, { method: $event })"
                    >
                      @for (m of methods(); track m) {
                        <option [value]="m">{{ methodLabel(m) }}</option>
                      }
                    </select>
                  </label>
                  <label class="form-control flex-1">
                    <span class="label-text">Amount (KES)</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      class="input input-bordered input-sm"
                      [ngModel]="tender.amountText"
                      (ngModelChange)="patchTender($index, { amountText: $event })"
                    />
                  </label>
                  @if (tender.method !== 'cash') {
                    <label class="form-control flex-1">
                      <span class="label-text">Reference</span>
                      <input
                        type="text"
                        class="input input-bordered input-sm"
                        placeholder="e.g. QGH7X2K1"
                        [ngModel]="tender.reference"
                        (ngModelChange)="patchTender($index, { reference: $event })"
                      />
                    </label>
                  }
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    [disabled]="tenders().length === 1"
                    (click)="removeTender($index)"
                  >
                    <ng-icon name="heroXMark" />
                  </button>
                </div>
              }
              <button type="button" class="btn btn-ghost btn-sm self-start" (click)="addTender()">
                <ng-icon name="heroPlus" /> Split payment
              </button>

              <div class="text-sm tabular-nums">
                <span [class.text-error]="paidCents() !== total()">
                  Paid {{ fmt(paidCents()) }} of {{ fmt(total()) }}
                </span>
                @if (changeCents() > 0) {
                  <span class="ml-2 font-semibold text-success">
                    Change: {{ fmt(changeCents()) }}
                  </span>
                }
              </div>
            </div>
          }

          @if (error()) {
            <p class="mt-2 text-sm text-error">{{ error() }}</p>
          }

          <div class="card-actions mt-4 justify-end">
            <button type="button" class="btn btn-ghost min-h-11" (click)="cancelled.emit()">
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-primary min-h-11"
              [disabled]="!canConfirm() || busy()"
              (click)="confirm()"
            >
              {{ busy() ? 'Processing…' : 'Confirm' }}
            </button>
          </div>
        </div>
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
  readonly title = input('Checkout');
  readonly busy = input(false);

  readonly confirmed = output<PaymentInput[]>();
  readonly cancelled = output<void>();

  protected readonly fmt = formatKes;
  protected readonly mode = signal<string>('cash');
  protected readonly tenders = signal<Tender[]>([]);
  protected readonly error = signal<string | null>(null);

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
    this.tenders.set([
      { method: first, amountText: (this.total() / 100).toFixed(2), reference: '' },
    ]);
    this.error.set(null);
  }

  protected setMode(mode: string): void {
    if (mode === 'credit' && !this.creditAllowed()) return;
    this.mode.set(mode);
    if (mode !== 'credit') {
      this.tenders.set([
        {
          method: mode as Tender['method'],
          amountText: (this.total() / 100).toFixed(2),
          reference: '',
        },
      ]);
    }
  }

  protected patchTender(index: number, changes: Partial<Tender>): void {
    this.tenders.update(ts => ts.map((t, i) => (i === index ? { ...t, ...changes } : t)));
  }

  protected addTender(): void {
    const remaining = Math.max(this.total() - this.paidCents(), 0);
    const used: Set<string> = new Set(this.tenders().map(t => t.method));
    const next = (this.methods().find(m => !used.has(m)) ?? 'cash') as Tender['method'];
    this.tenders.update(ts => [
      ...ts,
      { method: next, amountText: (remaining / 100).toFixed(2), reference: '' },
    ]);
  }

  protected removeTender(index: number): void {
    this.tenders.update(ts => ts.filter((_, i) => i !== index));
  }

  protected paidCents = computed(() =>
    this.tenders().reduce((sum, t) => sum + (parseKesToCents(t.amountText) ?? 0), 0)
  );

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
    if (ts.some(t => parseKesToCents(t.amountText) === null)) return false;
    // A single cash tender may exceed the total (change given); anything else
    // must sum to the total exactly (the backend enforces payment_mismatch).
    if (ts.length === 1 && ts[0].method === 'cash') return this.paidCents() >= this.total();
    return this.paidCents() === this.total();
  });

  protected methodLabel(code: string): string {
    return code === 'mpesa' ? 'M-Pesa' : code.charAt(0).toUpperCase() + code.slice(1);
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

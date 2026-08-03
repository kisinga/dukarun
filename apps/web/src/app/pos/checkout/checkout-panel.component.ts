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
        class="card flex h-full max-h-dvh w-full max-w-full flex-col overflow-hidden rounded-none bg-base-100 shadow-overlay md:h-auto md:max-h-[90vh] md:w-full md:max-w-lg md:rounded-box"
      >
        <header class="flex items-start justify-between gap-3 border-b border-base-300/60 p-4">
          <div>
            <h2 class="type-title">{{ title() }}</h2>
            <p class="type-caption mt-1">Amount due</p>
            <p class="type-hero mt-0.5"><app-money [cents]="total()" /></p>
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

        <div class="flex-1 overflow-y-auto p-4">
          <p class="type-caption mb-2">Payment method</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
            @for (method of methods(); track method) {
              <button
                appButton
                [variant]="mode() === method ? 'soft' : 'outline'"
                size="md"
                type="button"
                role="tab"
                [attr.aria-selected]="mode() === method"
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
              [attr.title]="creditAllowed() ? null : 'Select a customer before using credit'"
              (click)="setMode('credit')"
            >
              Credit
            </button>
          </div>

          @if (mode() === 'credit') {
            <div class="mt-4 rounded-box bg-info/10 p-4 text-sm">
              <p class="font-semibold">Charge the full amount to this customer</p>
              <p class="mt-1 text-base-content/70">
                This sale will be recorded as money the customer owes.
              </p>
            </div>
          } @else {
            <div class="mt-4 flex flex-col gap-3">
              @if (mode() === 'cash' && tenders().length === 1) {
                <div>
                  <p class="type-caption mb-2">Cash received</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

              @for (tender of tenders(); track $index) {
                <div class="rounded-box border border-base-300/70 p-3">
                  <div class="grid items-end gap-3 sm:grid-cols-2">
                    @if (tenders().length > 1) {
                      <app-form-field label="Method">
                        <select
                          class="select select-bordered min-h-11 w-full"
                          [ngModel]="tender.method"
                          (ngModelChange)="patchTender($index, { method: $event })"
                        >
                          @for (method of methods(); track method) {
                            <option [value]="method">{{ methodLabel(method) }}</option>
                          }
                        </select>
                      </app-form-field>
                    }
                    <app-form-field label="Amount (KES)">
                      <input
                        type="text"
                        inputmode="decimal"
                        class="input input-bordered min-h-11 w-full"
                        [ngModel]="tender.amountText"
                        (ngModelChange)="patchTender($index, { amountText: $event })"
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
                  @if (tenders().length > 1) {
                    <button
                      appButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      class="mt-2 text-base-content/60 hover:text-error"
                      (click)="removeTender($index)"
                    >
                      <app-icon name="heroXMark" />
                      Remove payment
                    </button>
                  }
                </div>
              }

              @if (methods().length > 1) {
                <button
                  appButton
                  variant="ghost"
                  size="md"
                  type="button"
                  class="self-start"
                  (click)="addTender()"
                >
                  <app-icon name="heroPlus" />
                  Split payment
                </button>
              }

              <div
                class="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-200 p-3"
              >
                <div>
                  <p class="type-caption">Paid</p>
                  <p
                    class="font-semibold"
                    [class.text-error]="paidCents() < total()"
                    [class.text-success]="paidCents() >= total()"
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
                } @else if (paidCents() < total()) {
                  <div class="text-right">
                    <p class="type-caption">Remaining</p>
                    <p class="font-semibold text-error">
                      <app-money [cents]="total() - paidCents()" />
                    </p>
                  </div>
                } @else {
                  <span class="badge badge-success">Ready</span>
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

        <footer class="flex gap-2 border-t border-base-300/60 bg-base-100 p-4">
          <button
            appButton
            variant="ghost"
            size="md"
            type="button"
            class="flex-1"
            [disabled]="busy()"
            (click)="cancelled.emit()"
          >
            Cancel
          </button>
          <button
            appButton
            size="md"
            type="button"
            class="flex-[2]"
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
  readonly title = input('Checkout');
  readonly busy = input(false);

  readonly confirmed = output<PaymentInput[]>();
  readonly cancelled = output<void>();

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

  protected addTender(): void {
    const remaining = Math.max(this.total() - this.paidCents(), 0);
    const used: Set<string> = new Set(this.tenders().map(t => t.method));
    const next = (this.methods().find(m => !used.has(m)) ?? 'cash') as Tender['method'];
    this.tenders.update(ts => [
      ...ts,
      { method: next, amountText: this.amountText(remaining), reference: '' },
    ]);
  }

  protected removeTender(index: number): void {
    this.tenders.update(ts => ts.filter((_, i) => i !== index));
  }

  protected paidCents = computed(() =>
    this.tenders().reduce((sum, t) => sum + (parseKesToCents(t.amountText) ?? 0), 0)
  );

  protected readonly cashSuggestions = computed(() => {
    const total = this.total();
    const roundUp = (unit: number) => Math.ceil(total / unit) * unit;
    return [...new Set([total, roundUp(5_000), roundUp(10_000), roundUp(50_000), roundUp(100_000)])]
      .filter(amount => amount >= total)
      .slice(0, 4);
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
    if (ts.some(t => parseKesToCents(t.amountText) === null)) return false;
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

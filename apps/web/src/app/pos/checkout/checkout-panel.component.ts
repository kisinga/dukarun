import { Component, computed, input, output, signal, type SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { parseKes } from '../../core/money';
import { isStatementMatch } from '../../core/payment-methods';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import type { PaymentInput, SaleSettlementInput } from '../pos.service';

/** An enabled tender method as shown in the checkout panel. */
export interface PaymentMethodOption {
  code: string;
  name: string;
  isCashierControlled: boolean;
  /**
   * blind_count | transaction_verification | statement_match. May be absent in
   * cached snapshots from before the RPC exposed it — callers fall back to code.
   */
  reconciliationType?: string | null;
  defaultAccountCode?: string;
  accounts?: PaymentAccountOption[];
}

export interface PaymentAccountOption {
  code: string;
  name: string;
  isDefault?: boolean;
}

interface Tender {
  /** Method code from the configured payment methods. */
  method: string;
  /** User-typed KES amount (parsed to shillings on confirm). */
  amountText: string;
  reference: string;
  accountCode: string;
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
        class="modal-box modal-box-task border border-base-300/60 bg-base-100 p-0 md:w-full md:max-w-xl"
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

        <div class="modal-body p-3 md:p-6">
          @if (customerDepositAvailable() > 0 || allowCredit()) {
            <section class="mb-4 rounded-box border border-base-300/60 bg-base-200/50 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="type-heading">Use existing balance</p>
                  <p class="type-caption mt-1">Nothing is applied until you confirm this sale.</p>
                </div>
                @if (customerDepositAvailable() > 0) {
                  <span class="badge badge-info badge-sm">
                    Held: <app-money [amount]="customerDepositAvailable()" />
                  </span>
                }
              </div>
              <div class="mt-3 grid gap-3 sm:grid-cols-2">
                @if (customerDepositAvailable() > 0) {
                  <app-form-field
                    label="Use customer deposit (KES)"
                    hint="Money held for customer"
                    [error]="depositInputInvalid() ? 'Enter a valid amount' : null"
                  >
                    <input
                      class="input input-bordered min-h-11 w-full"
                      type="text"
                      inputmode="numeric"
                      [ngModel]="depositText()"
                      (ngModelChange)="setDepositText($event)"
                    />
                  </app-form-field>
                }
                @if (allowCredit()) {
                  <app-form-field
                    label="Customer owes us (KES)"
                    hint="Residual sale credit"
                    [error]="creditInputInvalid() ? 'Enter a valid amount' : null"
                  >
                    <input
                      class="input input-bordered min-h-11 w-full"
                      type="text"
                      inputmode="numeric"
                      [ngModel]="creditText()"
                      (ngModelChange)="setCreditText($event)"
                    />
                  </app-form-field>
                }
              </div>
              @if (customerDepositAvailable() > 0) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="mt-2"
                  (click)="useSuggestedDeposit()"
                >
                  Use suggested <app-money [amount]="suggestedDeposit()" />
                </button>
              }
            </section>
          }
          <section aria-labelledby="payment-method-heading">
            <p id="payment-method-heading" class="type-heading mb-2">Payment method</p>
            <div class="rounded-box bg-base-200 p-1">
              <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Payment method">
                @for (method of orderedMethods(); track method.code) {
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

          @if (hasMpesa() && mpesaStkEnabled()) {
            <div class="mt-3 rounded-box border border-primary/20 bg-primary/5 p-3 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span>{{
                  manualMpesa() ? 'Manual M-PESA confirmation' : 'Dukarun will send an STK prompt.'
                }}</span>
                @if (mpesaManualFallback()) {
                  <label class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      class="toggle toggle-sm"
                      [ngModel]="manualMpesa()"
                      (ngModelChange)="setManualMpesa($event)"
                    />
                    Manual fallback
                  </label>
                }
              </div>
            </div>
          }

          @if (usesStk() && usesHeldFunds()) {
            <div class="alert alert-warning mt-3 py-2 text-sm">
              STK cannot be combined with customer deposit or credit.
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
                  [max]="tenderDue()"
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
                      @if (amount === tenderDue()) {
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
                          (ngModelChange)="changeTenderMethod($index, $event)"
                        >
                          @for (method of orderedMethods(); track method.code) {
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
                    @if (showAccountPicker(tender)) {
                      <app-form-field
                        [label]="tender.method === 'mpesa' ? 'M-PESA account' : 'Bank account'"
                        hint="The location default is preselected."
                      >
                        <select
                          class="select select-bordered min-h-11 w-full"
                          [ngModel]="tender.accountCode"
                          (ngModelChange)="patchTender($index, { accountCode: $event })"
                        >
                          @for (account of accountOptions(tender.method); track account.code) {
                            <option [value]="account.code">
                              {{ account.name }}{{ account.isDefault ? ' · Default' : '' }}
                            </option>
                          }
                        </select>
                      </app-form-field>
                    } @else if (accountLabel(tender); as label) {
                      <div
                        class="flex min-h-11 items-center rounded-field bg-base-200/60 px-3 text-sm"
                      >
                        <span class="type-caption mr-2">Paid into</span>
                        <span class="truncate font-medium">{{ label }}</span>
                      </div>
                    }
                    @if (tender.method === 'mpesa' && usesStk()) {
                      <app-form-field
                        label="Payer phone"
                        hint="The customer may use a different M-PESA phone."
                      >
                        <input
                          type="tel"
                          inputmode="tel"
                          autocomplete="tel"
                          class="input input-bordered min-h-11 w-full"
                          placeholder="07xx xxx xxx"
                          [ngModel]="mpesaPhone()"
                          (ngModelChange)="mpesaPhone.set($event)"
                        />
                      </app-form-field>
                    } @else if (tender.method !== 'cash') {
                      <app-form-field
                        [label]="
                          requiresReference(optionFor(tender.method))
                            ? 'Transaction ID'
                            : 'Reference'
                        "
                        [required]="requiresReference(optionFor(tender.method))"
                        [hint]="
                          tender.method === 'mpesa' && manualMpesa()
                            ? 'Enter the M-PESA receipt code from the customer message.'
                            : requiresReference(optionFor(tender.method))
                              ? 'Statement-matched payment — the bank reference is required.'
                              : 'Optional transaction code.'
                        "
                        [error]="bankReferenceError($index)"
                      >
                        <input
                          type="text"
                          class="input input-bordered min-h-11 w-full uppercase"
                          placeholder="e.g. QGH7X2K1"
                          [ngModel]="tender.reference"
                          (ngModelChange)="patchTender($index, { reference: $event })"
                          (blur)="markReferenceTouched($index)"
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
                      paidAmount() < tenderDue() || (isSplit() && paidAmount() > tenderDue())
                    "
                    [class.text-success]="
                      (paidAmount() === tenderDue() && !hasInvalidTender()) ||
                      (!isSplit() && paidAmount() > tenderDue())
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
                  [max]="tenderDue()"
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
                    : usesStk()
                      ? 'Send STK prompt'
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
  /** Unapplied subledger balance; zero hides deposit controls. */
  readonly customerDepositAvailable = input(0);
  /** Identified, approved customer may leave an explicit residual in AR. */
  readonly allowCredit = input(false);
  readonly heading = input('Checkout');
  readonly busy = input(false);
  readonly mpesaStkEnabled = input(false);
  readonly mpesaManualFallback = input(false);
  readonly defaultPayerPhone = input('');

  readonly confirmed = output<PaymentInput[]>();
  readonly settlementConfirmed = output<SaleSettlementInput>();
  /** Emitted instead of `confirmed` when a direct-account tender needs approval. */
  readonly approvalRequested = output<PaymentInput[]>();
  readonly cancelled = output<void>();

  protected readonly tenders = signal<Tender[]>([]);
  protected readonly error = signal<string | null>(null);
  /** Two-tap arm for direct-account tenders when the user has finance access. */
  protected readonly armed = signal(false);
  /** Reference fields the cashier has focused and left — drives bank validation text. */
  protected readonly referenceTouched = signal<Set<number>>(new Set());
  protected readonly depositText = signal('0');
  protected readonly creditText = signal('0');
  protected readonly mpesaPhone = signal('');
  protected readonly manualMpesa = signal(false);
  protected readonly depositAmount = computed(() => parseKes(this.depositText()) ?? 0);
  protected readonly creditAmount = computed(() => parseKes(this.creditText()) ?? 0);
  protected readonly depositInputInvalid = computed(() => parseKes(this.depositText()) === null);
  protected readonly creditInputInvalid = computed(() => parseKes(this.creditText()) === null);
  protected readonly usesHeldFunds = computed(
    () => this.depositAmount() > 0 || this.creditAmount() > 0
  );
  protected readonly tenderDue = computed(() =>
    Math.max(this.total() - this.depositAmount() - this.creditAmount(), 0)
  );
  protected readonly suggestedDeposit = computed(() =>
    Math.min(this.customerDepositAvailable(), this.total())
  );
  protected readonly isSplit = computed(() => this.tenders().length > 1);
  protected readonly singleMethod = computed(() =>
    this.isSplit() ? null : (this.tenders()[0]?.method ?? null)
  );
  protected readonly hasMpesa = computed(() =>
    this.tenders().some(tender => tender.method === 'mpesa')
  );
  protected readonly usesStk = computed(
    () => this.hasMpesa() && this.mpesaStkEnabled() && !this.manualMpesa()
  );
  protected readonly invalidStkMix = computed(
    () =>
      this.hasMpesa() &&
      this.isSplit() &&
      this.tenders().some(tender => !['mpesa', 'cash'].includes(tender.method))
  );

  /**
   * Everyday tenders first, statement-matched (bank) last: they are the rarest
   * rail at the counter, so the tab order and default skip them (RPC order is
   * kept otherwise). Cached snapshots without reconciliation_type fall back to
   * the bank code.
   */
  protected readonly orderedMethods = computed(() =>
    [...this.methods()].sort(
      (a, b) => Number(this.requiresReference(a)) - Number(this.requiresReference(b))
    )
  );

  /** First tender method that pays a direct (non-cashier-controlled) account. */
  protected readonly directMethod = computed(
    () =>
      this.tenders()
        .map(tender => this.optionFor(tender.method))
        .find(
          option =>
            option && !option.isCashierControlled && !(option.code === 'mpesa' && this.usesStk())
        ) ?? null
  );
  protected readonly needsApproval = computed(
    () => this.directMethod() !== null && !this.canUseDirectAccounts()
  );

  private initialized = false;

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only a new total or method list warrants a reset — a `busy` toggle from
    // the parent mid-submit must not wipe entered amounts.
    if (this.initialized && (changes['total'] || changes['methods'])) this.reset();
  }

  private reset(): void {
    this.initialized = true;
    this.depositText.set('0');
    this.creditText.set('0');
    this.mpesaPhone.set(this.defaultPayerPhone());
    this.manualMpesa.set(false);
    this.tenders.set([
      {
        method: this.defaultMethodCode(),
        amountText: this.amountText(this.tenderDue()),
        reference: '',
        accountCode: this.defaultAccountCode(this.defaultMethodCode()),
      },
    ]);
    this.error.set(null);
    this.armed.set(false);
    this.referenceTouched.set(new Set());
  }

  /** Cash when configured, else the first non-statement-matched method. */
  private defaultMethodCode(): string {
    const methods = this.orderedMethods();
    if (methods.some(method => method.code === 'cash')) return 'cash';
    return (
      methods.find(method => !this.requiresReference(method))?.code ?? methods[0]?.code ?? 'cash'
    );
  }

  /** Statement-matched methods (bank) need their transaction ID before confirming. */
  protected requiresReference(method: PaymentMethodOption | undefined): boolean {
    if (!method) return false;
    if (method.code === 'mpesa' && this.manualMpesa()) return true;
    return isStatementMatch(method.reconciliationType, method.code);
  }

  protected markReferenceTouched(index: number): void {
    this.referenceTouched.update(set => new Set(set).add(index));
  }

  protected accountOptions(methodCode: string): PaymentAccountOption[] {
    return this.optionFor(methodCode)?.accounts ?? [];
  }

  protected showAccountPicker(tender: Tender): boolean {
    return (
      this.accountOptions(tender.method).length > 1 &&
      !(tender.method === 'mpesa' && this.usesStk())
    );
  }

  protected accountLabel(tender: Tender): string | null {
    if (!['bank', 'mpesa'].includes(tender.method)) return null;
    return (
      this.accountOptions(tender.method).find(account => account.code === tender.accountCode)
        ?.name ?? null
    );
  }

  protected changeTenderMethod(index: number, method: string): void {
    this.patchTender(index, {
      method,
      accountCode: this.defaultAccountCode(method),
      reference: '',
    });
  }

  protected setManualMpesa(manual: boolean): void {
    this.manualMpesa.set(manual);
    if (!manual) {
      this.tenders.update(tenders =>
        tenders.map(tender =>
          tender.method === 'mpesa'
            ? { ...tender, accountCode: this.defaultAccountCode('mpesa') }
            : tender
        )
      );
    }
  }

  private defaultAccountCode(methodCode: string): string {
    const method = this.optionFor(methodCode);
    return (
      method?.defaultAccountCode ??
      method?.accounts?.find(account => account.isDefault)?.code ??
      method?.accounts?.[0]?.code ??
      ''
    );
  }

  /** Inline validation text once a bank reference field was touched and left empty. */
  protected bankReferenceError(index: number): string | null {
    const tender = this.tenders()[index];
    if (!tender || !this.requiresReference(this.optionFor(tender.method))) return null;
    if (tender.reference.trim().length > 0) return null;
    return this.referenceTouched().has(index)
      ? tender.method === 'mpesa' && this.manualMpesa()
        ? 'Enter the M-PESA receipt code'
        : 'Enter the bank transaction ID'
      : null;
  }

  protected setMode(code: string): void {
    this.armed.set(false);
    this.referenceTouched.set(new Set());
    this.tenders.set([
      {
        method: code,
        amountText: this.amountText(this.tenderDue()),
        reference: '',
        accountCode: this.defaultAccountCode(code),
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

    if (ts.length !== 2 || amount === null || amount < 0 || amount > this.tenderDue()) {
      this.patchTender(index, { amountText });
      return;
    }

    this.tenders.set(
      ts.map((tender, tenderIndex) => ({
        ...tender,
        amountText: tenderIndex === index ? amountText : this.amountText(this.tenderDue() - amount),
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

    const half = Math.floor(this.tenderDue() / 2);
    this.armed.set(false);
    this.tenders.set([
      {
        method: first,
        amountText: this.amountText(this.tenderDue() - half),
        reference: '',
        accountCode: this.defaultAccountCode(first),
      },
      {
        method: second,
        amountText: this.amountText(half),
        reference: '',
        accountCode: this.defaultAccountCode(second),
      },
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
    const clamped = Math.min(Math.max(Math.round(amount), 0), this.tenderDue());
    this.setTwoWaySplit(clamped);
  }

  protected setSplitRatio(firstShare: number): void {
    this.setTwoWaySplit(Math.round(this.tenderDue() * firstShare));
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
    Math.max(this.tenderDue() - this.paidAmount(), 0)
  );
  protected readonly overpaidAmount = computed(() =>
    Math.max(this.paidAmount() - this.tenderDue(), 0)
  );
  protected readonly allocatedProgressAmount = computed(() =>
    Math.min(this.paidAmount(), this.tenderDue())
  );
  protected readonly hasInvalidTender = computed(
    () =>
      this.tenderDue() > 0 && this.tenders().some(tender => (parseKes(tender.amountText) ?? 0) <= 0)
  );

  protected readonly cashSuggestions = computed(() => {
    const total = this.tenderDue();
    const roundUp = (unit: number) => Math.ceil(total / unit) * unit;
    const kenyanNotes = [50, 100, 200, 500, 1_000];

    return [
      ...new Set([
        total,
        roundUp(50),
        roundUp(100),
        ...kenyanNotes.filter(note => note >= total),
        roundUp(500),
        roundUp(1_000),
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
    if (tendered === null || tendered <= this.tenderDue()) return 0;
    return tendered - this.tenderDue();
  });

  protected canConfirm = computed(() => {
    const ts = this.tenders();
    if (this.depositInputInvalid() || this.creditInputInvalid()) return false;
    if (this.depositAmount() < 0 || this.depositAmount() > this.customerDepositAvailable())
      return false;
    if (this.creditAmount() < 0 || (!this.allowCredit() && this.creditAmount() > 0)) return false;
    if (this.depositAmount() + this.creditAmount() > this.total()) return false;
    if (this.usesStk() && this.usesHeldFunds()) return false;
    if (this.invalidStkMix()) return false;
    if (this.usesStk() && !/^(?:\+?254|0)[17]\d{8}$/.test(this.mpesaPhone().replace(/[\s-]/g, '')))
      return false;
    if (this.tenderDue() === 0) return true;
    if (ts.length === 0) return false;
    if (this.hasInvalidTender()) return false;
    // Statement-matched (bank) tenders need their transaction ID before confirming.
    if (ts.some(t => this.requiresReference(this.optionFor(t.method)) && !t.reference.trim()))
      return false;
    if (
      this.manualMpesa() &&
      ts.some(t => t.method === 'mpesa' && !/^[A-Z0-9]{8,12}$/i.test(t.reference.trim()))
    )
      return false;
    // A single cash tender may exceed the total (change given); anything else
    // must sum to the total exactly (the backend enforces payment_mismatch).
    if (ts.length === 1 && ts[0].method === 'cash') return this.paidAmount() >= this.tenderDue();
    return this.paidAmount() === this.tenderDue();
  });

  protected methodLabel(code: string): string {
    return this.optionFor(code)?.name ?? code;
  }

  protected optionFor(code: string): PaymentMethodOption | undefined {
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
      { ...ts[1], amountText: this.amountText(this.tenderDue() - firstAmount) },
    ]);
  }

  private useSingleTender(tender: Tender): void {
    this.armed.set(false);
    this.tenders.set([
      { ...tender, amountText: this.amountText(this.tenderDue()), reference: tender.reference },
    ]);
  }

  /** Build the PaymentInput payload, or null (with `error` set) when invalid. */
  private buildPayments(): PaymentInput[] | null {
    const ts = this.tenders();
    if (this.tenderDue() === 0) return [];
    // Single cash tender with overpayment: send the exact total; change is
    // handed back physically and is not part of the payment record.
    if (ts.length === 1 && ts[0].method === 'cash' && this.paidAmount() > this.tenderDue()) {
      return [{ method: 'cash', amount: this.tenderDue() }];
    }
    const payments: PaymentInput[] = [];
    for (const t of ts) {
      const amount = parseKes(t.amountText);
      if (amount === null || amount <= 0) {
        this.error.set('Enter a valid amount for every payment row');
        return null;
      }
      if (this.requiresReference(this.optionFor(t.method)) && t.reference.trim().length === 0) {
        this.error.set(
          t.method === 'mpesa' ? 'Enter the M-PESA receipt code' : 'Enter the bank transaction ID'
        );
        return null;
      }
      if (
        t.method === 'mpesa' &&
        this.manualMpesa() &&
        !/^[A-Z0-9]{8,12}$/i.test(t.reference.trim())
      ) {
        this.error.set('Enter a valid M-PESA receipt code');
        return null;
      }
      payments.push({
        method: t.method,
        amount,
        ...(['bank', 'mpesa'].includes(t.method) && t.accountCode
          ? { account_code: t.accountCode }
          : {}),
        ...(t.reference.trim() ? { reference: t.reference.trim() } : {}),
        ...(t.method === 'mpesa' && this.usesStk() ? { phone: this.mpesaPhone().trim() } : {}),
      });
    }
    return payments;
  }

  protected confirm(): void {
    this.error.set(null);
    if (this.depositInputInvalid() || this.creditInputInvalid()) {
      this.error.set('Enter valid deposit and credit amounts');
      return;
    }
    if (this.directMethod() !== null) {
      if (this.needsApproval()) {
        const payments = this.buildPayments();
        if (!payments) return;
        if (this.usesHeldFunds()) {
          this.settlementConfirmed.emit({
            payments,
            depositAmount: this.depositAmount(),
            creditAmount: this.creditAmount(),
          });
        } else {
          this.approvalRequested.emit(payments);
        }
        return;
      }
      if (!this.armed()) {
        this.armed.set(true);
        return;
      }
    }
    const payments = this.buildPayments();
    if (!payments) return;
    if (this.usesHeldFunds()) {
      this.settlementConfirmed.emit({
        payments,
        depositAmount: this.depositAmount(),
        creditAmount: this.creditAmount(),
      });
    } else {
      this.confirmed.emit(payments);
    }
  }

  protected setDepositText(value: string): void {
    this.depositText.set(value);
    this.resetTenderForSettlement();
  }

  protected setCreditText(value: string): void {
    this.creditText.set(value);
    this.resetTenderForSettlement();
  }

  protected useSuggestedDeposit(): void {
    this.depositText.set(String(this.suggestedDeposit()));
    this.resetTenderForSettlement();
  }

  private resetTenderForSettlement(): void {
    const due = this.tenderDue();
    this.armed.set(false);
    this.error.set(null);
    this.tenders.set(
      due === 0
        ? []
        : [
            {
              method: this.defaultMethodCode(),
              amountText: this.amountText(due),
              reference: '',
              accountCode: this.defaultAccountCode(this.defaultMethodCode()),
            },
          ]
    );
  }
}

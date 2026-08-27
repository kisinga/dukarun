import { Injectable, inject, signal, computed } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CashierSessionService } from '../core/cashier-session.service';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PermissionsService } from '../core/permissions.service';
import {
  LedgerAccount,
  MoneyService,
  PurchaseExpense,
  PurchaseLine,
  PurchasePayment,
} from '../money/money.service';
import { PosService, Variant, variantLabel } from '../pos/pos.service';
import { PrintService } from '../shared/print/print.service';
import { ReceiptDataService } from '../shared/print/receipt-data.service';
import type { BadgeType } from '../shared/ui/status-badge.component';
import type { PurchaseRow } from './purchase-history.store';

export type PurchaseDetailChangeKind = 'payment' | 'advance' | 'reversal';

export interface PurchaseDetailChangedResult {
  purchaseId: string;
  supplierId: string;
  kind: PurchaseDetailChangeKind;
  close: boolean;
  message: string;
  refreshWarning?: string;
}

/**
 * Component-scoped owner for one posted purchase aggregate.
 *
 * The history route owns list state and URL composition. This store owns detail reads and every
 * command that changes the posted purchase. Command results explicitly separate a committed
 * transaction from a failed read-model refresh so callers never invite an unsafe retry.
 */
@Injectable()
export class PurchaseDetailStore {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly print = inject(PrintService);
  readonly permissions = inject(PermissionsService);
  readonly cashierSession = inject(CashierSessionService);

  private readonly purchaseState = signal<PurchaseRow | null>(null);
  readonly purchase = this.purchaseState.asReadonly();
  private readonly linesState = signal<PurchaseLine[]>([]);
  readonly lines = this.linesState.asReadonly();
  private readonly expensesState = signal<PurchaseExpense[]>([]);
  readonly expenses = this.expensesState.asReadonly();
  private readonly paymentsState = signal<PurchasePayment[]>([]);
  readonly payments = this.paymentsState.asReadonly();
  private readonly variantsState = signal<Map<string, Variant>>(new Map());
  private readonly supplierAdvanceState = signal(0);
  readonly supplierAdvance = this.supplierAdvanceState.asReadonly();
  private readonly accountsState = signal<LedgerAccount[]>([]);
  readonly accounts = this.accountsState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
  private readonly accountsErrorState = signal<string | null>(null);
  readonly accountsError = this.accountsErrorState.asReadonly();
  private readonly printerEnabledState = signal(false);
  readonly printerEnabled = this.printerEnabledState.asReadonly();
  private readonly paymentOpenState = signal(false);
  readonly paymentOpen = this.paymentOpenState.asReadonly();
  private readonly reversingState = signal(false);
  readonly reversing = this.reversingState.asReadonly();

  readonly paymentAmount = new FormControl('', { nonNullable: true });
  readonly paymentAccount = new FormControl('', { nonNullable: true });
  readonly reversalReason = new FormControl('', { nonNullable: true });
  readonly accountSelectionError = computed(() =>
    this.accounts().length > 0 || this.loading()
      ? null
      : (this.accountsError() ?? 'No payment accounts are configured.')
  );

  private detailRequest = 0;
  private paymentAttempt: { fingerprint: string; clientRef: string } | null = null;
  private advanceAttempt: { fingerprint: string; clientRef: string } | null = null;

  async open(purchase: PurchaseRow): Promise<void> {
    const request = ++this.detailRequest;
    this.purchaseState.set(purchase);
    this.clearDetail();
    this.loadingState.set(true);
    this.errorState.set(null);

    const [detail, accounts, printerEnabled] = await Promise.allSettled([
      this.loadDetail(purchase),
      this.money.transactableAccounts(),
      this.receiptData.printerEnabled(),
    ]);
    if (!this.isCurrent(request, purchase.id)) return;

    if (detail.status === 'fulfilled') {
      this.linesState.set(detail.value.lines);
      this.expensesState.set(detail.value.expenses);
      this.paymentsState.set(detail.value.payments);
      this.supplierAdvanceState.set(detail.value.advance);
      this.variantsState.set(detail.value.variants);
    } else {
      this.errorState.set(this.message(detail.reason, 'Failed to load purchase details'));
    }
    if (accounts.status === 'fulfilled') {
      this.accountsState.set(accounts.value);
      this.accountsErrorState.set(null);
      if (!this.paymentAccount.value && accounts.value.length > 0) {
        this.paymentAccount.setValue(accounts.value[0].code);
      }
    } else {
      this.accountsErrorState.set(this.message(accounts.reason, 'Failed to load payment accounts'));
    }
    this.printerEnabledState.set(
      printerEnabled.status === 'fulfilled' ? printerEnabled.value : false
    );
    this.loadingState.set(false);
  }

  close(): void {
    this.detailRequest++;
    this.purchaseState.set(null);
    this.clearDetail();
    this.loadingState.set(false);
    this.busyState.set(false);
    this.reversingState.set(false);
  }

  startPayment(): void {
    const purchase = this.purchase();
    if (!purchase) return;
    this.paymentAmount.setValue(formatKesInput(Math.max(0, purchase.total_cost - purchase.paid)));
    this.paymentOpenState.set(true);
  }

  closePayment(): void {
    this.paymentOpenState.set(false);
  }

  async payPurchase(): Promise<PurchaseDetailChangedResult | null> {
    const purchase = this.purchase();
    const amount = parseKes(this.paymentAmount.value);
    if (!purchase || amount === null || amount <= 0) {
      this.errorState.set('Enter a valid payment amount');
      return null;
    }
    const fingerprint = [purchase.supplier_id, purchase.id, amount, this.paymentAccount.value].join(
      ':'
    );
    if (this.paymentAttempt?.fingerprint !== fingerprint) {
      this.paymentAttempt = { fingerprint, clientRef: crypto.randomUUID() };
    }

    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await this.cashierSession.assertOpen('paying a supplier');
      await this.money.payPurchase(
        purchase.supplier_id,
        purchase.id,
        amount,
        this.paymentAccount.value,
        this.paymentAttempt.clientRef
      );
      this.paymentAttempt = null;
      this.paymentOpenState.set(false);
      const message = 'Purchase payment recorded';
      this.noticeState.set(message);
      const refreshWarning = await this.refreshAfterCommit(purchase);
      return this.result(purchase, 'payment', false, message, refreshWarning);
    } catch (error) {
      this.errorState.set(this.message(error, 'Payment failed'));
      return null;
    } finally {
      this.busyState.set(false);
    }
  }

  async applyAdvance(): Promise<PurchaseDetailChangedResult | null> {
    const purchase = this.purchase();
    if (!purchase) return null;
    const amount = Math.min(this.supplierAdvance(), purchase.total_cost - purchase.paid);
    if (amount <= 0) return null;
    const fingerprint = `${purchase.id}:${amount}`;
    if (this.advanceAttempt?.fingerprint !== fingerprint) {
      this.advanceAttempt = { fingerprint, clientRef: crypto.randomUUID() };
    }

    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await this.money.applySupplierAdvance(purchase.id, amount, this.advanceAttempt.clientRef);
      this.advanceAttempt = null;
      const message = `${formatKes(amount)} supplier advance applied`;
      this.noticeState.set(message);
      const refreshWarning = await this.refreshAfterCommit(purchase);
      return this.result(purchase, 'advance', false, message, refreshWarning);
    } catch (error) {
      this.errorState.set(this.message(error, 'Could not apply supplier advance'));
      return null;
    } finally {
      this.busyState.set(false);
    }
  }

  async reversePurchase(): Promise<PurchaseDetailChangedResult | null> {
    const purchase = this.purchase();
    const reason = this.reversalReason.value.trim();
    if (!purchase || !reason) {
      this.errorState.set('Explain why this purchase is being reversed');
      return null;
    }
    this.busyState.set(true);
    this.reversingState.set(true);
    this.errorState.set(null);
    try {
      await this.cashierSession.assertOpen('reversing a purchase');
      await this.money.reverseCreditPurchase(purchase.id, reason);
      return this.result(
        purchase,
        'reversal',
        true,
        'Purchase reversed. Stock, supplier balance, and ledger were restored.'
      );
    } catch (error) {
      const message = this.message(error, 'Purchase could not be reversed');
      this.errorState.set(
        message.includes('purchase_stock_already_moved')
          ? 'This purchase cannot be reversed because some stock was sold, adjusted, or moved.'
          : message.includes('purchase_has_payments')
            ? 'Reverse this purchase’s supplier payments first.'
            : message.includes('purchase_has_separate_expenses')
              ? 'Finance must reverse this purchase’s separately paid expenses first.'
              : message
      );
      return null;
    } finally {
      this.reversingState.set(false);
      this.busyState.set(false);
    }
  }

  async printPurchase(): Promise<void> {
    const purchase = this.purchase();
    if (!purchase) return;
    try {
      const [data, company] = await Promise.all([
        this.receiptData.buildPurchaseData(purchase.id),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printPurchase(
        data,
        company.name,
        company.logoUrl,
        undefined,
        company.address
      );
    } catch (error) {
      this.errorState.set(this.message(error, 'Print failed'));
    }
  }

  setNotice(message: string): void {
    this.noticeState.set(message);
  }

  setError(message: string): void {
    this.errorState.set(message);
  }

  statusType(purchase: PurchaseRow): BadgeType {
    return purchase.paid >= purchase.total_cost ? 'success' : 'warning';
  }

  statusLabel(purchase: PurchaseRow): string {
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    if (!this.permissions.has('ViewFinancials')) return purchase.paid > 0 ? 'Part-paid' : 'We owe';
    const due = formatKes(purchase.total_cost - purchase.paid);
    return purchase.paid > 0 ? `Part-paid · we owe ${due}` : `We owe ${due}`;
  }

  settlementLabel(purchase: PurchaseRow): string {
    if (purchase.paid >= purchase.total_cost) return 'Paid';
    return purchase.paid > 0 ? 'Part paid' : 'Unpaid';
  }

  variant(variantId: string): Variant | null {
    return this.variantsState().get(variantId) ?? null;
  }

  lineLabel(variantId: string): string {
    const variant = this.variant(variantId);
    return variant ? variantLabel(variant) : 'Item';
  }

  date(value: string): string {
    return new Date(value).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
    });
  }

  private async loadDetail(purchase: PurchaseRow): Promise<{
    lines: PurchaseLine[];
    expenses: PurchaseExpense[];
    payments: PurchasePayment[];
    advance: number;
    variants: Map<string, Variant>;
  }> {
    const [lines, expenses, payments, advance] = await Promise.all([
      this.money.purchaseLines(purchase.id),
      this.money.purchaseExpenses(purchase.id),
      this.money.purchasePayments(purchase.id),
      this.money.supplierAdvanceAvailable(purchase.supplier_id),
    ]);
    const variants = await this.pos.variantsByIds([...new Set(lines.map(line => line.variant_id))]);
    return {
      lines,
      expenses,
      payments,
      advance,
      variants: new Map(
        variants.flatMap(variant => (variant.variant_id ? [[variant.variant_id, variant]] : []))
      ),
    };
  }

  /** A committed command stays successful even when a derived read model cannot refresh. */
  private async refreshAfterCommit(purchase: PurchaseRow): Promise<string | undefined> {
    const request = this.detailRequest;
    const results = await Promise.allSettled([
      this.money.purchasePayments(purchase.id),
      this.money.purchaseById(purchase.id),
      this.money.supplierAdvanceAvailable(purchase.supplier_id),
    ]);
    if (!this.isCurrent(request, purchase.id)) return undefined;

    if (results[0].status === 'fulfilled') this.paymentsState.set(results[0].value);
    if (results[1].status === 'fulfilled' && results[1].value?.id === purchase.id) {
      this.purchaseState.set(results[1].value as PurchaseRow);
    }
    if (results[2].status === 'fulfilled') this.supplierAdvanceState.set(results[2].value);
    const purchaseRefreshMissing =
      results[1].status === 'fulfilled' && results[1].value?.id !== purchase.id;
    if (purchaseRefreshMissing || results.some(result => result.status === 'rejected')) {
      const warning =
        'The transaction was recorded, but the latest purchase details could not be refreshed.';
      this.errorState.set(warning);
      return warning;
    }
    return undefined;
  }

  private result(
    purchase: PurchaseRow,
    kind: PurchaseDetailChangeKind,
    close: boolean,
    message: string,
    refreshWarning?: string
  ): PurchaseDetailChangedResult {
    return {
      purchaseId: purchase.id,
      supplierId: purchase.supplier_id,
      kind,
      close,
      message,
      ...(refreshWarning ? { refreshWarning } : {}),
    };
  }

  private isCurrent(request: number, purchaseId: string): boolean {
    return request === this.detailRequest && this.purchase()?.id === purchaseId;
  }

  private clearDetail(): void {
    this.linesState.set([]);
    this.expensesState.set([]);
    this.paymentsState.set([]);
    this.variantsState.set(new Map());
    this.supplierAdvanceState.set(0);
    this.accountsState.set([]);
    this.accountsErrorState.set(null);
    this.paymentOpenState.set(false);
    this.paymentAmount.setValue('');
    this.paymentAccount.setValue('');
    this.reversalReason.setValue('');
    this.noticeState.set(null);
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl } from '@angular/forms';
import { CashierSessionService } from '../core/cashier-session.service';
import { LocationContextService } from '../core/location-context.service';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import {
  LedgerAccount,
  MoneyService,
  PrepaymentActivityRow,
  PurchaseHistoryRow,
  SupplierAccountStatus,
  SupplierPayment,
} from '../money/money.service';
import { PosService, SupplierStockRow } from '../pos/pos.service';
import type { SupplierWithAp } from './supplier.types';

/**
 * Component-scoped owner for one supplier AP account.
 *
 * Supplier payments, advances and reversals intentionally share this owner because they update the
 * same payable read models. A committed mutation is never reported as failed only because a later
 * refresh failed; callers receive `true` once the transaction itself has committed.
 */
@Injectable()
export class SupplierAccountStore {
  private readonly money = inject(MoneyService);
  private readonly pos = inject(PosService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationsContext = inject(LocationContextService);
  readonly permissions = inject(PermissionsService);
  readonly cashierSession = inject(CashierSessionService);

  private readonly supplierIdState = signal<string | null>(null);
  readonly supplierId = this.supplierIdState.asReadonly();
  readonly supplier = computed<SupplierWithAp | null>(() => {
    const id = this.supplierId();
    return id ? (this.parties.suppliers().find(row => row.id === id) ?? null) : null;
  });

  private readonly accountsState = signal<LedgerAccount[]>([]);
  readonly accounts = this.accountsState.asReadonly();
  private readonly accountErrorState = signal<string | null>(null);
  readonly accountError = this.accountErrorState.asReadonly();
  private readonly purchasesState = signal<PurchaseHistoryRow[]>([]);
  readonly purchases = this.purchasesState.asReadonly();
  private readonly paymentsState = signal<SupplierPayment[]>([]);
  readonly payments = this.paymentsState.asReadonly();
  private readonly accountStatusState = signal<SupplierAccountStatus | null>(null);
  readonly accountStatus = this.accountStatusState.asReadonly();
  private readonly advanceState = signal(0);
  readonly advance = this.advanceState.asReadonly();
  private readonly advanceActivityState = signal<PrepaymentActivityRow[]>([]);
  readonly advanceActivity = this.advanceActivityState.asReadonly();
  private readonly stockState = signal<SupplierStockRow[]>([]);
  readonly stock = this.stockState.asReadonly();
  private readonly loadingState = signal(false);
  readonly loading = this.loadingState.asReadonly();
  private readonly accountLoadingState = signal(false);
  readonly accountLoading = this.accountLoadingState.asReadonly();
  private readonly stockLoadingState = signal(false);
  readonly stockLoading = this.stockLoadingState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();

  readonly payAmount = new FormControl('', { nonNullable: true });
  readonly payAccount = new FormControl('', { nonNullable: true });
  private readonly reversingPaymentIdState = signal<string | null>(null);
  readonly reversingPaymentId = this.reversingPaymentIdState.asReadonly();
  readonly paymentReversalReason = new FormControl('', { nonNullable: true });
  readonly advanceAmount = new FormControl('', { nonNullable: true });
  readonly advanceAccount = new FormControl('', { nonNullable: true });
  readonly advanceReference = new FormControl('', { nonNullable: true });
  readonly advanceReturnAmount = new FormControl('', { nonNullable: true });
  readonly advanceReturnAccount = new FormControl('', { nonNullable: true });
  readonly advanceReturnReason = new FormControl('', { nonNullable: true });
  readonly advanceReturnReference = new FormControl('', { nonNullable: true });
  readonly creditLimit = new FormControl('0', { nonNullable: true });
  readonly termsDays = new FormControl(0, { nonNullable: true });

  readonly stockValue = computed(() =>
    this.stock().reduce((sum, row) => sum + (row.stock_value ?? 0), 0)
  );
  readonly paymentSummary = computed(() => {
    const total = this.purchases().reduce((sum, purchase) => sum + purchase.total_cost, 0);
    const paid = this.purchases().reduce(
      (sum, purchase) => sum + Math.min(purchase.paid, purchase.total_cost),
      0
    );
    return { total, paid, outstanding: Math.max(0, total - paid) };
  });
  readonly accountSelectionError = computed(() =>
    this.accounts().length > 0 || this.loading()
      ? null
      : (this.accountError() ?? 'No payment accounts are configured.')
  );

  private loadRequest = 0;
  private stockRequest = 0;
  private paymentAttempt: { fingerprint: string; clientRef: string } | null = null;
  private advanceClientRef: string | null = null;
  private advanceReturnClientRef: string | null = null;
  private advanceApplicationAttempt: { purchaseId: string; clientRef: string } | null = null;

  constructor() {
    let previousLocation = this.locationsContext.activeId();
    effect(() => {
      const locationId = this.locationsContext.activeId();
      if (locationId === previousLocation) return;
      previousLocation = locationId;
      const supplierId = this.supplierId();
      untracked(() => {
        this.stockState.set([]);
        if (supplierId && locationId) void this.loadStock(supplierId, locationId);
      });
    });
  }

  async open(supplierId: string): Promise<void> {
    const request = ++this.loadRequest;
    this.supplierIdState.set(supplierId);
    this.resetForms();
    this.clearMessages();
    this.loadingState.set(true);
    const supplier = this.supplier();
    if (supplier) {
      this.creditLimit.setValue(formatKesInput(supplier.supplier_credit_limit));
      this.termsDays.setValue(supplier.supplier_credit_terms_days ?? 0);
    }

    const accountRequired =
      this.permissions.has('ViewFinancials') ||
      this.permissions.has('ManageSupplierCreditPurchases');
    const [accounts, purchases, account, advance] = await Promise.allSettled([
      this.money.transactableAccounts(),
      this.money.purchasesPage({
        page: 1,
        pageSize: 10,
        supplierId,
        allLocations: true,
        sortBy: 'purchase_date',
        sortDirection: 'desc',
      }),
      accountRequired ? this.loadAccountData(supplierId) : Promise.resolve(null),
      accountRequired ? this.loadAdvanceData(supplierId) : Promise.resolve(null),
    ]);
    const locationId = this.locationsContext.activeId();
    if (locationId) void this.loadStock(supplierId, locationId);
    if (request !== this.loadRequest || this.supplierId() !== supplierId) return;

    const errors: string[] = [];
    if (accounts.status === 'fulfilled') {
      this.accountsState.set(accounts.value);
      this.accountErrorState.set(null);
      this.seedAccounts(accounts.value);
    } else {
      this.accountErrorState.set(this.message(accounts.reason, 'Failed to load payment accounts'));
    }
    if (purchases.status === 'fulfilled') this.purchasesState.set(purchases.value.rows);
    else errors.push(this.message(purchases.reason, 'Could not load supplier purchases'));
    if (account.status === 'rejected') {
      errors.push(this.message(account.reason, 'Could not load supplier account checks'));
    }
    if (advance.status === 'rejected') {
      errors.push(this.message(advance.reason, 'Could not load supplier advance'));
    }
    this.errorState.set(errors.length > 0 ? errors.join('. ') : null);
    this.loadingState.set(false);
  }

  close(): void {
    this.loadRequest++;
    this.stockRequest++;
    this.supplierIdState.set(null);
    this.purchasesState.set([]);
    this.paymentsState.set([]);
    this.accountStatusState.set(null);
    this.advanceState.set(0);
    this.advanceActivityState.set([]);
    this.stockState.set([]);
    this.loadingState.set(false);
    this.accountLoadingState.set(false);
    this.stockLoadingState.set(false);
    this.resetForms();
    this.clearMessages();
  }

  async refresh(): Promise<void> {
    const supplierId = this.supplierId();
    if (supplierId) await this.open(supplierId);
  }

  async paySupplier(): Promise<boolean> {
    const supplier = this.supplier();
    const amount = parseKes(this.payAmount.value);
    if (!supplier || amount === null || amount <= 0) {
      this.errorState.set('Enter a valid amount');
      return false;
    }
    try {
      await this.cashierSession.assertOpen('paying a supplier');
      this.busyState.set(true);
      this.clearMessages();
      const fingerprint = [supplier.id, amount, this.payAccount.value].join(':');
      if (this.paymentAttempt?.fingerprint !== fingerprint) {
        this.paymentAttempt = { fingerprint, clientRef: crypto.randomUUID() };
      }
      await this.money.paySupplier(
        supplier.id,
        amount,
        this.payAccount.value,
        this.paymentAttempt.clientRef
      );
      this.paymentAttempt = null;
      this.payAmount.setValue('');
      this.noticeState.set(`${formatKes(amount)} payment recorded for ${this.name(supplier)}.`);
      await this.refreshAfterCommit(supplier.id);
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Payment failed'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  startPaymentReversal(paymentId: string): void {
    this.reversingPaymentIdState.set(paymentId);
    this.paymentReversalReason.setValue('');
  }

  cancelPaymentReversal(): void {
    this.reversingPaymentIdState.set(null);
    this.paymentReversalReason.setValue('');
  }

  async reversePayment(payment: SupplierPayment): Promise<boolean> {
    const supplierId = this.supplierId();
    const reason = this.paymentReversalReason.value.trim();
    if (!supplierId || !reason) {
      this.errorState.set('Explain why this supplier payment is being reversed');
      return false;
    }
    try {
      await this.cashierSession.assertOpen('reversing a supplier payment');
      this.busyState.set(true);
      this.clearMessages();
      await this.money.reverseSupplierPayment(payment.id, reason);
      this.cancelPaymentReversal();
      this.noticeState.set(
        'Supplier payment reversed. The payable and source account were restored.'
      );
      await this.refreshAfterCommit(supplierId);
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Supplier payment could not be reversed'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  async recordAdvance(): Promise<boolean> {
    const supplierId = this.supplierId();
    const amount = parseKes(this.advanceAmount.value);
    if (!supplierId || amount === null || amount <= 0) {
      this.errorState.set('Enter a valid advance amount');
      return false;
    }
    try {
      await this.cashierSession.assertOpen('paying a supplier advance');
      this.busyState.set(true);
      this.clearMessages();
      await this.money.recordSupplierAdvance({
        supplierId,
        amount,
        accountCode: this.advanceAccount.value,
        reference: this.advanceReference.value.trim() || undefined,
        clientRef: (this.advanceClientRef ??= crypto.randomUUID()),
      });
      this.advanceClientRef = null;
      this.advanceAmount.setValue('');
      this.advanceReference.setValue('');
      this.noticeState.set('Supplier advance recorded');
      await this.refreshAfterCommit(supplierId);
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Could not record advance'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  async recordAdvanceReturn(): Promise<boolean> {
    const supplierId = this.supplierId();
    const amount = parseKes(this.advanceReturnAmount.value);
    const reason = this.advanceReturnReason.value.trim();
    if (!supplierId || amount === null || amount <= 0 || amount > this.advance()) {
      this.errorState.set('Enter an amount within the available supplier advance');
      return false;
    }
    if (!reason) {
      this.errorState.set('Enter a return reason');
      return false;
    }
    try {
      await this.cashierSession.assertOpen('recording a supplier advance return');
      this.busyState.set(true);
      this.clearMessages();
      await this.money.recordSupplierAdvanceReturn({
        supplierId,
        amount,
        accountCode: this.advanceReturnAccount.value,
        reason,
        reference: this.advanceReturnReference.value.trim() || undefined,
        clientRef: (this.advanceReturnClientRef ??= crypto.randomUUID()),
      });
      this.advanceReturnClientRef = null;
      this.advanceReturnAmount.setValue('');
      this.advanceReturnReason.setValue('');
      this.advanceReturnReference.setValue('');
      this.noticeState.set('Supplier advance return recorded');
      await this.refreshAfterCommit(supplierId);
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Could not record advance return'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  async applyAdvanceToPurchase(purchase: PurchaseHistoryRow): Promise<boolean> {
    const amount = Math.min(this.advance(), purchase.total_cost - purchase.paid);
    if (amount <= 0) return false;
    if (this.advanceApplicationAttempt?.purchaseId !== purchase.id) {
      this.advanceApplicationAttempt = { purchaseId: purchase.id, clientRef: crypto.randomUUID() };
    }
    this.busyState.set(true);
    this.clearMessages();
    try {
      await this.money.applySupplierAdvance(
        purchase.id,
        amount,
        this.advanceApplicationAttempt.clientRef
      );
      this.advanceApplicationAttempt = null;
      this.noticeState.set(`${formatKes(amount)} supplier advance applied`);
      await this.refreshAfterCommit(purchase.supplier_id);
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Could not apply supplier advance'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  async saveCreditTerms(): Promise<boolean> {
    const supplier = this.supplier();
    const limit = parseKes(this.creditLimit.value);
    if (!supplier || limit === null) {
      this.errorState.set('Enter a valid supplier credit limit');
      return false;
    }
    this.busyState.set(true);
    this.clearMessages();
    try {
      await this.money.updateSupplierCredit(supplier.id, limit, this.termsDays.value);
      this.noticeState.set(`Credit terms saved for ${this.name(supplier)}`);
      await this.refreshPartyCache();
      return true;
    } catch (error) {
      this.errorState.set(this.message(error, 'Save failed'));
      return false;
    } finally {
      this.busyState.set(false);
    }
  }

  netPosition(): string {
    const supplier = this.supplier();
    if (!supplier || !this.permissions.has('ViewFinancials')) return 'Financials hidden';
    const net = supplier.ap_balance - this.advance();
    if (net > 0) return `Net: we owe ${formatKes(net)}`;
    if (net < 0) return `Net: ${formatKes(-net)} remains with supplier`;
    return 'Net position settled';
  }

  private async loadAccountData(supplierId: string): Promise<void> {
    if (this.supplierId() !== supplierId) return;
    this.accountLoadingState.set(true);
    try {
      const [status, payments] = await Promise.all([
        this.money.supplierAccountStatus(supplierId),
        this.permissions.has('ViewFinancials')
          ? this.money.supplierPayments(supplierId)
          : Promise.resolve([]),
      ]);
      if (this.supplierId() !== supplierId) return;
      this.accountStatusState.set(status);
      this.paymentsState.set(payments);
    } finally {
      if (this.supplierId() === supplierId) this.accountLoadingState.set(false);
    }
  }

  private async loadAdvanceData(supplierId: string): Promise<void> {
    const [balance, activity] = await Promise.all([
      this.money.supplierAdvanceAvailable(supplierId),
      this.permissions.has('ViewFinancials')
        ? this.money.supplierAdvanceActivity(supplierId)
        : Promise.resolve([]),
    ]);
    if (this.supplierId() !== supplierId) return;
    this.advanceState.set(balance);
    this.advanceActivityState.set(activity);
  }

  private async loadStock(supplierId: string, locationId: string): Promise<void> {
    const request = ++this.stockRequest;
    this.stockLoadingState.set(true);
    try {
      const stock = await this.pos.supplierStockByVariant(supplierId, locationId);
      if (
        request === this.stockRequest &&
        this.supplierId() === supplierId &&
        this.locationsContext.activeId() === locationId
      ) {
        this.stockState.set(stock);
      }
    } catch (error) {
      if (request === this.stockRequest) {
        this.errorState.set(this.message(error, 'Could not load supplier-sourced stock'));
      }
    } finally {
      if (request === this.stockRequest) this.stockLoadingState.set(false);
    }
  }

  private async refreshAfterCommit(supplierId: string): Promise<void> {
    const results = await Promise.allSettled([
      this.refreshPartyCache(),
      this.money.purchasesPage({
        page: 1,
        pageSize: 10,
        supplierId,
        allLocations: true,
        sortBy: 'purchase_date',
        sortDirection: 'desc',
      }),
      this.loadAccountData(supplierId),
      this.loadAdvanceData(supplierId),
    ]);
    if (results[1].status === 'fulfilled' && this.supplierId() === supplierId) {
      this.purchasesState.set(results[1].value.rows);
    }
    if (this.supplierId() === supplierId && results.some(result => result.status === 'rejected')) {
      this.errorState.set(
        'The transaction was recorded, but the latest supplier details could not be refreshed.'
      );
    }
  }

  private async refreshPartyCache(): Promise<void> {
    this.parties.invalidate();
    await this.parties.ensureLoaded();
  }

  private seedAccounts(accounts: LedgerAccount[]): void {
    const first = accounts[0]?.code ?? '';
    for (const control of [this.payAccount, this.advanceAccount, this.advanceReturnAccount]) {
      if (!control.value && first) control.setValue(first);
    }
  }

  private resetForms(): void {
    this.payAmount.setValue('');
    this.paymentAttempt = null;
    this.cancelPaymentReversal();
    this.advanceAmount.setValue('');
    this.advanceReference.setValue('');
    this.advanceReturnAmount.setValue('');
    this.advanceReturnReason.setValue('');
    this.advanceReturnReference.setValue('');
    this.advanceClientRef = null;
    this.advanceReturnClientRef = null;
    this.advanceApplicationAttempt = null;
  }

  private clearMessages(): void {
    this.errorState.set(null);
    this.noticeState.set(null);
  }

  private name(supplier: SupplierWithAp): string {
    return [supplier.first_name, supplier.last_name].filter(Boolean).join(' ');
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}

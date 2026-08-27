import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import type {
  PurchasePriceBasis,
  PurchaseTaxContext,
  PurchaseTaxEstimate,
} from '@dukarun/tax-types';
import { FormControl } from '@angular/forms';
import { CatalogSearchService } from '../core/catalog-search.service';
import { CashierSessionService } from '../core/cashier-session.service';
import { CompanyPreferencesService } from '../core/company-preferences.service';
import { formatKes, formatKesInput, parseKes } from '../core/money';
import { PartyCacheService } from '../core/party-cache.service';
import { PermissionsService } from '../core/permissions.service';
import { LocationContextService } from '../core/location-context.service';
import { runIndependentLoads } from '../core/independent-load';
import {
  type LedgerAccount,
  MoneyService,
  type PurchaseDraft,
  type PurchaseExpenseInput,
  type PurchaseLineInput,
  type SupplierVariantPerformance,
} from '../money/money.service';
import { PosService, type SupplierStockRow, type Variant, variantLabel } from '../pos/pos.service';
import type { SearchableFilterOption } from '../shared/ui/searchable-filter.component';
import type {
  PurchaseLineDetailField,
  PurchaseLineForm,
  PurchaseLinePriceContext,
} from './purchase-line-row.component';
import { resolveLinkedSupplier } from './purchase-editor-link';
import type {
  PurchasePaymentMode,
  PurchasePaymentReviewState,
} from './purchase-payment-review.component';
import {
  buildPurchaseExpenseInputs,
  buildPurchaseLineInputs,
  purchaseExpenseTaxBreakdown,
  purchaseLineEnteredAmount,
  purchaseLineTaxBreakdown,
  purchasePaymentProjection,
  purchaseTaxBreakdown,
} from './purchase-editor.calculations';
import type {
  PurchaseExpenseIntent,
  PurchaseExpensesViewModel,
} from './purchase-expenses-panel.component';
import type {
  PurchaseVatPanelIntent,
  PurchaseVatPanelViewModel,
} from './purchase-vat-panel.component';
import { LEARNING_EVENT_NAMES } from '../learning/learning-content';
import { LearningPlatformService } from '../learning/learning-platform.service';

export type ExpenseSettlement = '' | 'supplier_bill' | 'separate';

export interface ExpenseForm {
  key: number;
  category: string;
  customCategory: string;
  memo: string;
  amount: string;
  settlement: ExpenseSettlement;
  accountCode: string;
  noteExpanded: boolean;
  error: string | null;
  grossAmountOverride?: number;
}

export interface PurchaseFinalizeResult {
  purchaseId: string;
}

export interface PurchaseEditorInit {
  draftId?: string | null;
  supplierId?: string | null;
}

type PurchaseEditorUiIntent =
  | { kind: 'focus'; selector: string }
  | { kind: 'focus-line'; lineKey: number }
  | { kind: 'focus-invalid-row' }
  | { kind: 'scroll-top' };

export type PurchaseEditorUiRequest = PurchaseEditorUiIntent & { id: number };

/**
 * Route-scoped owner of the purchase draft aggregate.
 *
 * Client references live for the lifetime of this store and survive draft restoration, so retries
 * cannot duplicate accounting or stock effects. Confirmation always persists the canonical
 * workspace draft before finalization; the page only handles navigation after a successful result.
 */
@Injectable()
export class PurchaseEditorStore implements OnDestroy {
  private readonly money = inject(MoneyService);
  private readonly catalog = inject(CatalogSearchService);
  private readonly pos = inject(PosService);
  private readonly parties = inject(PartyCacheService);
  private readonly locationContext = inject(LocationContextService);
  private readonly learning = inject(LearningPlatformService);
  readonly perms = inject(PermissionsService);
  readonly cashierSession = inject(CashierSessionService);
  readonly preferences = inject(CompanyPreferencesService);

  readonly suppliers = computed(() =>
    this.parties.suppliers().filter(item => item.supplier_active)
  );
  readonly supplierOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.suppliers().map(item => {
      const contact = [item.phone, item.email].filter(Boolean).join(' · ');
      return {
        value: item.id,
        label: this.supplierName(item),
        ...(contact ? { description: contact } : {}),
      };
    })
  );
  readonly locations = this.locationContext.locations;
  private readonly accountsState = signal<LedgerAccount[]>([]);
  readonly accounts = this.accountsState.asReadonly();
  readonly accountOptions = computed<readonly SearchableFilterOption[]>(() =>
    this.accounts().map(item => ({
      value: item.code,
      label: item.name,
      description: item.code,
      searchText: `${item.code} ${item.name}`,
    }))
  );
  private readonly variantsState = signal<Variant[]>([]);
  readonly variants = this.variantsState.asReadonly();
  private readonly performanceState = signal<SupplierVariantPerformance[]>([]);
  readonly performance = this.performanceState.asReadonly();
  private readonly supplierStockState = signal<SupplierStockRow[]>([]);
  readonly supplierStock = this.supplierStockState.asReadonly();
  private readonly supplierStockLoadingState = signal(false);
  readonly supplierStockLoading = this.supplierStockLoadingState.asReadonly();
  private readonly supplierStockErrorState = signal<string | null>(null);
  readonly supplierStockError = this.supplierStockErrorState.asReadonly();
  private readonly linesState = signal<PurchaseLineForm[]>([]);
  readonly lines = this.linesState.asReadonly();
  private readonly expensesState = signal<ExpenseForm[]>([]);
  readonly expenses = this.expensesState.asReadonly();
  private readonly searchResultsState = signal<Variant[]>([]);
  readonly searchResults = this.searchResultsState.asReadonly();
  private readonly productQueryState = signal('');
  readonly productQuery = this.productQueryState.asReadonly();
  private readonly stageState = signal<'build' | 'review'>('build');
  readonly stage = this.stageState.asReadonly();
  private readonly invoiceDetailsExpandedState = signal(false);
  readonly invoiceDetailsExpanded = this.invoiceDetailsExpandedState.asReadonly();
  private readonly loadingState = signal(true);
  readonly loading = this.loadingState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly savingDraftState = signal(false);
  readonly savingDraft = this.savingDraftState.asReadonly();
  private readonly dirtyState = signal(false);
  readonly dirty = this.dirtyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  private readonly accountsErrorState = signal<string | null>(null);
  readonly accountsError = this.accountsErrorState.asReadonly();
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
  private readonly draftIdState = signal<string | null>(null);
  readonly draftId = this.draftIdState.asReadonly();
  private readonly taxEstimateState = signal<PurchaseTaxEstimate | null>(null);
  readonly taxEstimate = this.taxEstimateState.asReadonly();
  private readonly taxEstimateLoadingState = signal(false);
  readonly taxEstimateLoading = this.taxEstimateLoadingState.asReadonly();
  private readonly taxEstimateErrorState = signal<string | null>(null);
  readonly taxEstimateError = this.taxEstimateErrorState.asReadonly();
  private readonly taxContextState = signal<PurchaseTaxContext | null>(null);
  readonly taxContext = this.taxContextState.asReadonly();
  private readonly taxContextLoadingState = signal(false);
  readonly taxContextLoading = this.taxContextLoadingState.asReadonly();
  private readonly taxContextErrorState = signal<string | null>(null);
  readonly taxContextError = this.taxContextErrorState.asReadonly();
  private readonly priceEntryBasisState = signal<PurchasePriceBasis>('inclusive');
  readonly priceEntryBasis = this.priceEntryBasisState.asReadonly();
  private readonly supplierPinSavingState = signal(false);
  readonly supplierPinSaving = this.supplierPinSavingState.asReadonly();
  private readonly supplierPinSavedState = signal(true);
  readonly supplierPinSaved = this.supplierPinSavedState.asReadonly();
  readonly label = variantLabel;

  readonly supplier = new FormControl('', { nonNullable: true });
  readonly location = new FormControl('', { nonNullable: true });
  readonly reference = new FormControl('', { nonNullable: true });
  readonly notes = new FormControl('', { nonNullable: true });
  readonly purchaseDate = new FormControl(this.today(), { nonNullable: true });
  readonly claimInputVat = new FormControl(false, { nonNullable: true });
  readonly supplierTaxPin = new FormControl('', { nonNullable: true });
  readonly taxInvoiceDate = new FormControl(this.today(), { nonNullable: true });
  readonly paymentMode = new FormControl<PurchasePaymentMode>('paid', {
    nonNullable: true,
  });
  readonly partialAmount = new FormControl('', { nonNullable: true });
  readonly advanceAmount = new FormControl('0', { nonNullable: true });
  private readonly supplierAdvanceAvailableState = signal(0);
  private readonly uiRequestState = signal<PurchaseEditorUiRequest | null>(null);
  readonly uiRequest = this.uiRequestState.asReadonly();
  private nextUiRequestId = 0;
  readonly supplierAdvanceAvailable = this.supplierAdvanceAvailableState.asReadonly();
  readonly account = new FormControl('', { nonNullable: true });
  private nextKey = 1;
  private searchRequest = 0;
  private taxEstimateRequest = 0;
  private taxContextRequest = 0;
  private supplierAdvanceRequest = 0;
  private supplierStockRequest = 0;
  private readonly performanceLoadedKeys = new Set<string>();
  private readonly performanceLoads = new Map<string, Promise<void>>();
  private taxContextTimer: ReturnType<typeof setTimeout> | null = null;
  private taxInvoiceDateTouched = false;
  private purchaseClientRef: string = crypto.randomUUID();
  private advanceAwareDraft = false;
  private exitAllowed = false;

  readonly lineTaxBreakdowns = computed(() => {
    const context = this.taxContext();
    const basis = this.priceEntryBasis();
    return new Map(
      this.lines().map(line => {
        const rule = context?.lines.find(item => item.variant_id === line.variantId);
        return [line.key, purchaseLineTaxBreakdown(line, rule?.tax_rate_bps ?? 0, basis)] as const;
      })
    );
  });
  readonly expenseTaxBreakdowns = computed(() => {
    const context = this.taxContext();
    const basis = this.priceEntryBasis();
    return new Map(
      this.expenses().map(
        expense => [expense.key, purchaseExpenseTaxBreakdown(expense, context, basis)] as const
      )
    );
  });
  readonly enteredGoodsSubtotal = computed(() =>
    this.lines().reduce((sum, line) => sum + purchaseLineEnteredAmount(line), 0)
  );
  readonly enteredSupplierExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) => sum + (item.settlement === 'supplier_bill' ? (parseKes(item.amount) ?? 0) : 0),
      0
    )
  );
  readonly goodsSubtotal = computed(() =>
    [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.gross, 0)
  );
  readonly supplierExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) =>
        sum +
        (item.settlement === 'supplier_bill'
          ? (this.expenseTaxBreakdowns().get(item.key)?.gross ?? 0)
          : 0),
      0
    )
  );
  readonly invoiceNetTotal = computed(
    () =>
      [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.net, 0) +
      this.expenses().reduce(
        (sum, item) =>
          sum +
          (item.settlement === 'supplier_bill'
            ? (this.expenseTaxBreakdowns().get(item.key)?.net ?? 0)
            : 0),
        0
      )
  );
  readonly invoiceTaxTotal = computed(
    () =>
      [...this.lineTaxBreakdowns().values()].reduce((sum, item) => sum + item.tax, 0) +
      this.expenses().reduce(
        (sum, item) =>
          sum +
          (item.settlement === 'supplier_bill'
            ? (this.expenseTaxBreakdowns().get(item.key)?.tax ?? 0)
            : 0),
        0
      )
  );
  readonly separateExpenseTotal = computed(() =>
    this.expenses().reduce(
      (sum, item) => sum + (item.settlement === 'separate' ? (parseKes(item.amount) ?? 0) : 0),
      0
    )
  );
  readonly invoiceTotal = computed(() => this.goodsSubtotal() + this.supplierExpenseTotal());
  readonly suggestedAdvance = computed(() =>
    Math.min(this.supplierAdvanceAvailable(), this.invoiceTotal())
  );
  readonly vatPanelViewModel = computed<PurchaseVatPanelViewModel>(() => ({
    visible:
      this.taxContextLoading() ||
      !!this.taxContext()?.tax_configured ||
      !!this.taxContextError() ||
      this.claimInputVat.value ||
      this.priceEntryBasis() === 'exclusive',
    contextLoading: this.taxContextLoading(),
    context: this.taxContext(),
    contextError: this.taxContextError(),
    claimInputVat: this.claimInputVat.value,
    priceEntryBasis: this.priceEntryBasis(),
    supplierPinError: this.supplierPinError(),
    supplierPinSaving: this.supplierPinSaving(),
    supplierPinSaved: this.supplierPinSaved(),
    hasLines: this.lines().length > 0,
    invoiceTotal: this.invoiceTotal(),
    invoiceNetTotal: this.invoiceNetTotal(),
    invoiceTaxTotal: this.invoiceTaxTotal(),
  }));
  readonly expensesViewModel = computed<PurchaseExpensesViewModel>(() => ({
    expenses: this.expenses(),
    accountOptions: this.accountOptions(),
    accountsError: this.accountsError(),
    canCreateTransfer: this.perms.has('CreateInterAccountTransfer'),
    priceEntryBasis: this.priceEntryBasis(),
  }));
  /**
   * Typed boundary for the review-stage child component.
   *
   * Keep this as a purchase-specific view model, not a generic "summary" shape.
   * It lets the template compose naturally while the editor remains the owner of
   * purchase validation, draft persistence, and final accounting/inventory writes.
   */
  readonly paymentReviewState = computed<PurchasePaymentReviewState>(() => ({
    priceEntryBasis: this.priceEntryBasis(),
    claimInputVat: this.claimInputVat.value,
    taxEstimate: this.taxEstimate(),
    enteredGoodsSubtotal: this.enteredGoodsSubtotal(),
    goodsSubtotal: this.goodsSubtotal(),
    supplierExpenseTotal: this.supplierExpenseTotal(),
    enteredSupplierExpenseTotal: this.enteredSupplierExpenseTotal(),
    invoiceTaxTotal: this.invoiceTaxTotal(),
    invoiceTotal: this.invoiceTotal(),
    invoiceNetTotal: this.invoiceNetTotal(),
    separateExpenseTotal: this.separateExpenseTotal(),
    supplierAdvanceAvailable: this.supplierAdvanceAvailable(),
    canManageSupplierCreditPurchases: this.perms.has('ManageSupplierCreditPurchases'),
    accountOptions: this.accountOptions(),
    accountsError: this.accountsError(),
    requiresSession: this.requiresSession(),
    canTakePayment: this.cashierSession.canTakePayment(),
    creditExceeded: this.creditExceeded(),
    partialPaymentError: this.partialPaymentError(),
    advanceAmountError: this.advanceAmountError(),
    suggestedAdvance: this.suggestedAdvance(),
    initialPayment: this.initialPayment(),
    advanceUsed: this.advanceUsed(),
    cashLeavingNow: this.cashLeavingNow(),
    balanceDue: this.balanceDue(),
    selectedSupplier: this.selectedSupplier(),
    projectedSupplierBalance: this.projectedSupplierBalance(),
    canViewFinancials: this.perms.has('ViewFinancials'),
    busy: this.busy(),
    savingDraft: this.savingDraft(),
    canConfirm: this.canConfirm(),
    draftId: this.draftId(),
  }));
  readonly supplierStockValue = computed(() =>
    this.supplierStock().reduce((sum, row) => sum + (row.stock_value ?? 0), 0)
  );
  projectedSupplierBalance(): number {
    return (this.selectedSupplier()?.ap_balance ?? 0) + this.balanceDue();
  }
  projectedCreditAvailable(): number | null {
    const selected = this.selectedSupplier();
    if (!selected || selected.supplier_credit_limit <= 0) return null;
    return Math.max(0, selected.supplier_credit_limit - this.projectedSupplierBalance());
  }
  receivingLocationName(): string {
    return this.locations().find(item => item.id === this.location.value)?.name ?? 'this location';
  }

  async initialize(request: PurchaseEditorInit): Promise<void> {
    const requestedDraft = request.draftId;
    const requestedSupplier = request.supplierId;
    let draftToRestore: PurchaseDraft | undefined;
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load suppliers',
        run: () => this.parties.ensureLoaded(),
      },
      {
        fallback: 'Failed to load payment accounts',
        run: async () => {
          const accounts = await this.money.transactableAccounts();
          this.accountsState.set(accounts);
          this.accountsErrorState.set(null);
          this.account.setValue(accounts[0]?.code ?? '');
        },
        onError: message => this.accountsErrorState.set(message),
      },
      {
        fallback: 'Failed to load the product catalogue',
        run: async () =>
          this.variantsState.set(
            (await this.catalog.activeCatalog()).filter(item => item.kind !== 'service')
          ),
      },
      {
        fallback: 'Failed to load purchase drafts',
        run: async () => {
          const drafts = await this.money.purchaseDrafts();
          if (requestedDraft) draftToRestore = drafts.find(item => item.id === requestedDraft);
        },
      },
    ]);
    this.location.setValue(this.locationContext.activeId() ?? this.locations()[0]?.id ?? '');
    if (requestedDraft) {
      if (draftToRestore) this.restoreDraft(draftToRestore);
      else errors.push('Purchase draft was not found');
    } else if (requestedSupplier) {
      const linkedSupplier = resolveLinkedSupplier(requestedSupplier, this.parties.suppliers());
      if (linkedSupplier.supplierId) this.applySupplierSelection(linkedSupplier.supplierId, false);
      else errors.push(linkedSupplier.error ?? 'The linked supplier is unavailable');
    }
    this.syncSupplierPin();
    await this.refreshTaxContext();
    this.errorState.set(errors.length > 0 ? errors.join('. ') : null);
    this.dirtyState.set(false);
    this.loadingState.set(false);
  }

  canExitWithoutConfirmation(): boolean {
    return this.exitAllowed || !this.dirty();
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && !this.exitAllowed) event.preventDefault();
  }
  allowExit(): void {
    this.exitAllowed = true;
  }
  markDirty(): void {
    this.dirtyState.set(true);
    this.noticeState.set(null);
  }
  toggleInvoiceDetails(): void {
    this.invoiceDetailsExpandedState.update(value => !value);
  }
  editPurchase(): void {
    this.stageState.set('build');
  }
  setClaimInputVat(claim: boolean): void {
    this.claimInputVat.setValue(claim);
    if (claim) {
      if (!this.taxInvoiceDateTouched) this.taxInvoiceDate.setValue(this.purchaseDate.value);
      this.syncSupplierPin();
    } else {
      this.taxEstimateRequest++;
      this.taxEstimateState.set(null);
      this.taxEstimateErrorState.set(null);
      this.taxEstimateLoadingState.set(false);
    }
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  onPurchaseDateChange(): void {
    if (this.claimInputVat.value && !this.taxInvoiceDateTouched) {
      this.taxInvoiceDate.setValue(this.purchaseDate.value);
    }
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  onTaxInvoiceDateChange(): void {
    this.taxInvoiceDateTouched = true;
    this.clearGrossOverrides();
    this.scheduleTaxContext();
    this.markDirty();
  }
  onSupplierPinInput(): void {
    const savedPin = this.selectedSupplier()?.tax_registration_number?.trim() ?? '';
    this.supplierPinSavedState.set(this.supplierTaxPin.value.trim() === savedPin && !!savedPin);
    this.markDirty();
  }
  supplierPinError(): string | null {
    if (!this.claimInputVat.value) return null;
    if (!this.supplier.value) return 'Choose a supplier first';
    if (!this.supplierTaxPin.value.trim()) return 'Enter the supplier tax PIN';
    if (!this.supplierPinSaved()) return 'Save this PIN to the supplier before claiming VAT';
    return null;
  }
  async saveSupplierPin(): Promise<void> {
    const supplierId = this.supplier.value;
    const pin = this.supplierTaxPin.value.trim();
    if (!supplierId || !pin) return;
    this.supplierPinSavingState.set(true);
    this.errorState.set(null);
    try {
      await this.money.updateSupplierTaxRegistration(supplierId, pin);
      this.parties.suppliers.update(items =>
        items.map(item =>
          item.id === supplierId ? { ...item, tax_registration_number: pin } : item
        )
      );
      this.supplierPinSavedState.set(true);
      this.noticeState.set('Supplier tax PIN saved');
    } catch (error) {
      this.supplierPinSavedState.set(false);
      this.errorState.set(
        error instanceof Error ? error.message : 'Supplier tax PIN could not be saved'
      );
    } finally {
      this.supplierPinSavingState.set(false);
    }
  }
  selectedSupplier() {
    return this.suppliers().find(item => item.id === this.supplier.value);
  }
  private syncSupplierPin(): void {
    const pin = this.selectedSupplier()?.tax_registration_number?.trim() ?? '';
    this.supplierTaxPin.setValue(pin);
    this.supplierPinSavedState.set(!!pin);
  }
  private taxDate(): string {
    return this.claimInputVat.value ? this.taxInvoiceDate.value : this.purchaseDate.value;
  }
  private clearGrossOverrides(): void {
    this.linesState.update(lines =>
      lines.map(line => ({ ...line, grossAmountOverride: undefined }))
    );
    this.expensesState.update(expenses =>
      expenses.map(expense => ({ ...expense, grossAmountOverride: undefined }))
    );
  }
  private scheduleTaxContext(): void {
    if (this.taxContextTimer) clearTimeout(this.taxContextTimer);
    this.taxContextTimer = setTimeout(() => {
      this.taxContextTimer = null;
      void this.refreshTaxContext();
    }, 120);
  }
  private async refreshTaxContext(): Promise<boolean> {
    if (this.taxContextTimer) {
      clearTimeout(this.taxContextTimer);
      this.taxContextTimer = null;
    }
    const taxDate = this.taxDate();
    if (!taxDate) return false;
    const request = ++this.taxContextRequest;
    this.taxContextLoadingState.set(true);
    this.taxContextErrorState.set(null);
    try {
      const context = await this.money.purchaseTaxContext({
        variantIds: [...new Set(this.lines().map(line => line.variantId))],
        taxDate,
      });
      if (request !== this.taxContextRequest) return false;
      this.taxContextState.set(context);
      this.convertPendingDefaultCosts(context);
      return true;
    } catch (error) {
      if (request !== this.taxContextRequest) return false;
      this.taxContextState.set(null);
      this.taxContextErrorState.set(
        error instanceof Error ? error.message : 'Purchase VAT rates could not be loaded'
      );
      return false;
    } finally {
      if (request === this.taxContextRequest) this.taxContextLoadingState.set(false);
    }
  }
  setPriceEntryBasis(basis: PurchasePriceBasis): void {
    if (basis === this.priceEntryBasis()) return;
    const context = this.taxContext();
    if (basis === 'exclusive' && !context?.tax_configured) {
      this.taxContextErrorState.set(
        'Configure a supported tax jurisdiction for this purchase date before entering prices without VAT.'
      );
      return;
    }
    this.clearGrossOverrides();
    this.linesState.update(lines =>
      lines.map(line => ({ ...line, defaultCostNeedsConversion: false }))
    );
    this.priceEntryBasisState.set(basis);
    this.taxContextErrorState.set(null);
    this.markDirty();
  }
  private convertPendingDefaultCosts(context: PurchaseTaxContext): void {
    if (this.priceEntryBasis() !== 'exclusive') return;
    this.linesState.update(lines =>
      lines.map(line => {
        if (!line.defaultCostNeedsConversion) return line;
        const rate =
          context.lines.find(item => item.variant_id === line.variantId)?.tax_rate_bps ?? 0;
        const enteredAmount = purchaseLineEnteredAmount(line);
        const net = purchaseTaxBreakdown(enteredAmount, rate, 'inclusive').net;
        return {
          ...line,
          unitCost: formatKesInput(line.quantity > 0 ? net / line.quantity : 0),
          lineTotal: formatKesInput(net),
          valueSource: 'total',
          defaultCostNeedsConversion: false,
          grossAmountOverride: enteredAmount,
        };
      })
    );
  }
  private canEstimateVat(): boolean {
    if (!this.taxInvoiceDate.value || this.lines().length === 0) return false;
    if (
      this.lines().some(
        line =>
          line.quantity <= 0 ||
          (parseKes(line.unitCost) ?? 0) <= 0 ||
          (parseKes(line.lineTotal) ?? 0) <= 0
      )
    )
      return false;
    return !this.expenses().some(
      expense => (parseKes(expense.amount) ?? 0) <= 0 || !expense.settlement
    );
  }
  private async refreshVatEstimate(): Promise<boolean> {
    if (!this.claimInputVat.value) return true;
    if (!this.canEstimateVat()) {
      this.taxEstimateState.set(null);
      this.taxEstimateErrorState.set(null);
      return false;
    }
    const request = ++this.taxEstimateRequest;
    this.taxEstimateLoadingState.set(true);
    this.taxEstimateErrorState.set(null);
    try {
      const estimate = await this.money.estimatePurchaseInputVat({
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        taxInvoiceDate: this.taxInvoiceDate.value,
      });
      if (request !== this.taxEstimateRequest) return false;
      this.taxEstimateState.set(estimate);
      if (!estimate.vat_registered) {
        this.taxEstimateErrorState.set(
          'Input VAT cannot be claimed because the shop was not VAT-registered on this invoice date.'
        );
        return false;
      }
      return true;
    } catch (error) {
      if (request !== this.taxEstimateRequest) return false;
      this.taxEstimateState.set(null);
      this.taxEstimateErrorState.set(
        error instanceof Error ? error.message : 'VAT could not be calculated'
      );
      return false;
    } finally {
      if (request === this.taxEstimateRequest) this.taxEstimateLoadingState.set(false);
    }
  }
  purchaseInfoSummary(): string {
    const [year, month, day] = this.purchaseDate.value.split('-').map(Number);
    const date =
      year && month && day
        ? new Intl.DateTimeFormat('en-KE', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date(year, month - 1, day))
        : this.purchaseDate.value;
    const note = this.notes.value.trim();
    return `${date}${note ? ` · ${note}` : ' · No notes'}`;
  }
  supplierName(item: { first_name: string; last_name: string | null }): string {
    return [item.first_name, item.last_name].filter(Boolean).join(' ');
  }
  lineVariant(line: PurchaseLineForm): Variant | undefined {
    return this.variants().find(item => item.variant_id === line.variantId);
  }
  lineLabel(line: PurchaseLineForm): string {
    const variant = this.lineVariant(line);
    return variant ? this.label(variant) : 'Unknown item';
  }
  linePriceContext(line: PurchaseLineForm): PurchaseLinePriceContext {
    const variant = this.lineVariant(line);
    const currentCost = parseKes(line.unitCost);
    const supplierInsight = this.performance().find(
      item => item.variant_id === line.variantId && item.supplier_id === this.supplier.value
    );
    const supplierCost = supplierInsight?.last_unit_cost ?? null;
    const wholesale = parseKes(line.wholesalePrice) ?? variant?.wholesale_price ?? 0;
    const retail = parseKes(line.retailPrice) ?? variant?.price ?? 0;
    return {
      supplierCost,
      supplierComparison: this.supplierPriceComparison(currentCost, supplierCost),
      purchaseCount: Number(supplierInsight?.purchase_count ?? 0),
      wholesaleMargin: this.marginContext(currentCost, wholesale),
      retailMargin: this.marginContext(currentCost, retail),
      warning: this.linePriceWarning(currentCost, wholesale, retail, supplierCost),
      catalogPriceChanged:
        !!variant &&
        (wholesale !== (variant.wholesale_price ?? 0) || retail !== (variant.price ?? 0)),
    };
  }

  private supplierPriceComparison(current: number | null, previous: number | null): string {
    if (previous === null || current === null || current <= 0) return 'Last recorded cost';
    const difference = current - previous;
    if (difference === 0) return 'Same as last price';
    return `${formatKes(Math.abs(difference))} ${difference > 0 ? 'higher' : 'lower'} than last`;
  }

  private marginContext(
    cost: number | null,
    sellingPrice: number
  ): PurchaseLinePriceContext['retailMargin'] {
    if (cost === null || cost <= 0 || sellingPrice <= 0)
      return { label: 'No price', type: 'neutral' };
    const margin = ((sellingPrice - cost) / sellingPrice) * 100;
    return {
      label: `${margin >= 0 ? '+' : ''}${margin.toFixed(1)}% margin`,
      type: margin < 0 ? 'error' : margin < 15 ? 'warning' : 'success',
    };
  }

  private linePriceWarning(
    cost: number | null,
    wholesale: number,
    retail: number,
    previous: number | null
  ): string | null {
    if (cost === null || cost <= 0) return null;
    if (retail > 0 && cost > retail)
      return `Unit cost is ${formatKes(cost - retail)} above the current retail price.`;
    if (wholesale > 0 && cost > wholesale)
      return `Unit cost is ${formatKes(cost - wholesale)} above the current wholesale price.`;
    if (previous && cost > previous)
      return `This supplier's unit cost is ${formatKes(cost - previous)} above their last price.`;
    return null;
  }

  async searchProducts(value: string): Promise<void> {
    this.productQueryState.set(value);
    const request = ++this.searchRequest;
    if (!value.trim()) {
      this.searchResultsState.set([]);
      return;
    }
    const result = await this.catalog.search(value, 20);
    if (request === this.searchRequest)
      this.searchResultsState.set(result.variants.filter(item => item.kind !== 'service'));
  }
  addFirstSearchResult(): void {
    const first = this.searchResults()[0];
    if (first) this.addVariant(first);
  }
  addVariant(variant: Variant): void {
    const supplierId = this.supplier.value;
    const supplierCost = this.performance().find(
      item => item.variant_id === variant.variant_id && item.supplier_id === supplierId
    )?.last_unit_cost;
    const cost = supplierCost ?? variant.wholesale_price ?? 0;
    const initialCost = cost > 0 ? formatKesInput(cost) : '';
    const key = this.nextKey++;
    this.linesState.update(items => [
      ...items,
      {
        key,
        variantId: variant.variant_id!,
        quantity: 1,
        unitCost: initialCost,
        lineTotal: initialCost,
        valueSource: 'unit',
        batchNumber: '',
        expiryDate: '',
        wholesalePrice: formatKesInput(variant.wholesale_price ?? 0),
        retailPrice: formatKesInput(variant.price ?? 0),
        expanded: false,
        error: null,
        defaultCostNeedsConversion: this.priceEntryBasis() === 'exclusive' && cost > 0,
      },
    ]);
    this.productQueryState.set('');
    this.searchResultsState.set([]);
    this.scheduleTaxContext();
    this.markDirty();
    if (
      supplierId &&
      variant.variant_id &&
      supplierCost === undefined &&
      !this.performanceLoadedKeys.has(`${supplierId}:${variant.variant_id}`)
    ) {
      void this.enrichAddedVariantCost(key, variant.variant_id, supplierId, initialCost);
    }
    this.requestUi({ kind: 'focus-line', lineKey: key });
  }
  private async enrichAddedVariantCost(
    lineKey: number,
    variantId: string,
    supplierId: string,
    initialCost: string
  ): Promise<void> {
    await this.loadSelectedSupplierPerformance([variantId]);
    if (this.supplier.value !== supplierId) return;
    const supplierCost = this.performance().find(
      item => item.variant_id === variantId && item.supplier_id === supplierId
    )?.last_unit_cost;
    if (supplierCost === undefined || supplierCost === null) return;
    const updatedCost = formatKesInput(supplierCost);
    let updated = false;
    this.linesState.update(items =>
      items.map(line => {
        if (
          line.key !== lineKey ||
          line.valueSource !== 'unit' ||
          line.unitCost !== initialCost ||
          line.lineTotal !== initialCost
        ) {
          return line;
        }
        updated = true;
        return {
          ...line,
          unitCost: updatedCost,
          lineTotal: updatedCost,
          defaultCostNeedsConversion: this.priceEntryBasis() === 'exclusive' && supplierCost > 0,
        };
      })
    );
    if (updated) this.scheduleTaxContext();
  }
  removeLine(index: number): void {
    this.linesState.update(items => items.filter((_, itemIndex) => itemIndex !== index));
    this.scheduleTaxContext();
    this.markDirty();
  }
  setLineExpanded(line: PurchaseLineForm, expanded: boolean): void {
    line.expanded = expanded;
    this.linesState.update(items => [...items]);
  }
  updateLineDetail(line: PurchaseLineForm, field: PurchaseLineDetailField, value: string): void {
    line[field] = value;
    this.linesState.update(items => [...items]);
    this.markDirty();
  }
  quantityChanged(line: PurchaseLineForm, value: number | string): void {
    line.quantity = Math.max(0, Number(value) || 0);
    if (line.valueSource === 'unit') this.syncTotal(line);
    else this.syncUnit(line);
    line.grossAmountOverride = undefined;
    this.linesState.update(items => [...items]);
    this.markDirty();
  }
  unitCostChanged(line: PurchaseLineForm, value: string): void {
    line.unitCost = value;
    line.valueSource = 'unit';
    line.defaultCostNeedsConversion = false;
    line.grossAmountOverride = undefined;
    this.syncTotal(line);
    this.linesState.update(items => [...items]);
    this.markDirty();
  }
  lineTotalChanged(line: PurchaseLineForm, value: string): void {
    line.lineTotal = value;
    line.valueSource = 'total';
    line.defaultCostNeedsConversion = false;
    line.grossAmountOverride = undefined;
    this.syncUnit(line);
    this.linesState.update(items => [...items]);
    this.markDirty();
  }
  private syncTotal(line: PurchaseLineForm): void {
    const unit = parseKes(line.unitCost);
    line.lineTotal = unit === null ? '' : formatKesInput(line.quantity * unit);
  }
  private syncUnit(line: PurchaseLineForm): void {
    const total = parseKes(line.lineTotal);
    line.unitCost =
      total === null || line.quantity <= 0 ? '' : formatKesInput(total / line.quantity);
  }
  addExpense(): void {
    this.expensesState.update(items => [
      ...items,
      {
        key: this.nextKey++,
        category: 'transport',
        customCategory: '',
        memo: '',
        amount: '',
        settlement: '',
        accountCode: this.account.value || this.accounts()[0]?.code || '',
        noteExpanded: false,
        error: null,
      },
    ]);
    this.markDirty();
  }
  handleExpenseIntent(intent: PurchaseExpenseIntent): void {
    if (intent.type === 'add') {
      this.addExpense();
      return;
    }
    if (intent.type === 'remove') {
      this.expensesState.update(items => items.filter(item => item.key !== intent.key));
      this.markDirty();
      return;
    }
    if (intent.type === 'show-note') {
      this.expensesState.update(items =>
        items.map(item => (item.key === intent.key ? { ...item, noteExpanded: true } : item))
      );
      return;
    }
    if (intent.type === 'set-settlement') {
      this.setExpenseSettlement(intent.key, intent.settlement);
      return;
    }
    this.expensesState.update(items =>
      items.map(item => {
        if (item.key !== intent.key) return item;
        return {
          ...item,
          [intent.field]: intent.value,
          ...(intent.field === 'amount' ? { grossAmountOverride: undefined } : {}),
        };
      })
    );
    this.markDirty();
  }

  handleVatIntent(intent: PurchaseVatPanelIntent): void {
    if (intent.type === 'set-price-basis') this.setPriceEntryBasis(intent.basis);
    else if (intent.type === 'set-claim') this.setClaimInputVat(intent.claim);
    else if (intent.type === 'supplier-pin-input') this.onSupplierPinInput();
    else if (intent.type === 'save-supplier-pin') void this.saveSupplierPin();
    else this.onTaxInvoiceDateChange();
  }

  private setExpenseSettlement(key: number, settlement: ExpenseSettlement): void {
    const expense = this.expenses().find(item => item.key === key);
    if (!expense) return;
    if (expense.settlement === settlement) return;
    const amount = parseKes(expense.amount);
    let nextAmount = expense.amount;
    let grossAmountOverride: number | undefined;
    if (this.priceEntryBasis() === 'exclusive' && amount !== null && amount > 0) {
      const previousGross = this.expenseTaxBreakdowns().get(expense.key)?.gross ?? amount;
      if (settlement === 'supplier_bill') {
        const rate = this.taxContext()?.supplier_expense.tax_rate_bps ?? 0;
        const net = purchaseTaxBreakdown(previousGross, rate, 'inclusive').net;
        nextAmount = formatKesInput(net);
        grossAmountOverride = previousGross;
      } else {
        nextAmount = formatKesInput(previousGross);
      }
    }
    this.expensesState.update(items =>
      items.map(item =>
        item.key === key ? { ...item, settlement, amount: nextAmount, grossAmountOverride } : item
      )
    );
    this.markDirty();
  }

  async goToReview(): Promise<void> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return;
    if (!this.validateBuild() || !this.validateTaxEvidence()) return;
    if (this.claimInputVat.value && !(await this.refreshVatEstimate())) return;
    this.errorState.set(null);
    this.stageState.set('review');
    this.requestUi({ kind: 'scroll-top' });
  }
  setPaymentMode(mode: PurchasePaymentMode): void {
    this.paymentMode.setValue(mode);
    if (mode !== 'partial') this.partialAmount.setValue('');
    this.markDirty();
  }
  onSupplierChange(supplierId: string): void {
    this.applySupplierSelection(supplierId, true);
  }
  onReceivingLocationChange(): void {
    this.markDirty();
    void this.loadSupplierStock(this.supplier.value);
  }
  private applySupplierSelection(supplierId: string, dirty: boolean): void {
    ++this.supplierAdvanceRequest;
    ++this.supplierStockRequest;
    this.supplier.setValue(supplierId);
    this.syncSupplierPin();
    this.advanceAmount.setValue('0');
    this.supplierAdvanceAvailableState.set(0);
    this.performanceState.set([]);
    this.performanceLoadedKeys.clear();
    this.supplierStockState.set([]);
    this.supplierStockLoadingState.set(false);
    this.supplierStockErrorState.set(null);
    if (dirty) this.markDirty();
    if (supplierId) {
      void this.loadSupplierContext(supplierId);
      void this.loadSelectedSupplierPerformance();
    }
  }
  private async loadSupplierContext(supplierId: string): Promise<void> {
    await Promise.allSettled([
      this.loadSupplierAdvance(supplierId),
      this.loadSupplierStock(supplierId),
    ]);
  }
  private async loadSupplierAdvance(supplierId: string): Promise<void> {
    const request = ++this.supplierAdvanceRequest;
    try {
      const advance = await this.money.supplierAdvanceAvailable(supplierId);
      if (request === this.supplierAdvanceRequest && this.supplier.value === supplierId) {
        this.supplierAdvanceAvailableState.set(advance);
      }
    } catch {
      // Advance context is decision support; purchase entry remains available without it.
    }
  }
  private async loadSupplierStock(supplierId: string): Promise<void> {
    const locationId = this.location.value;
    if (!supplierId || !locationId) {
      ++this.supplierStockRequest;
      this.supplierStockState.set([]);
      this.supplierStockLoadingState.set(false);
      this.supplierStockErrorState.set(null);
      return;
    }
    const request = ++this.supplierStockRequest;
    this.supplierStockLoadingState.set(true);
    this.supplierStockErrorState.set(null);
    try {
      const rows = await this.pos.supplierStockByVariant(supplierId, locationId);
      if (
        request === this.supplierStockRequest &&
        this.supplier.value === supplierId &&
        this.location.value === locationId
      ) {
        this.supplierStockState.set(rows);
      }
    } catch {
      if (
        request === this.supplierStockRequest &&
        this.supplier.value === supplierId &&
        this.location.value === locationId
      ) {
        this.supplierStockState.set([]);
        this.supplierStockErrorState.set('Supplier stock is unavailable');
      }
    } finally {
      if (request === this.supplierStockRequest) this.supplierStockLoadingState.set(false);
    }
  }
  private async loadSelectedSupplierPerformance(variantIds?: string[]): Promise<void> {
    const supplierId = this.supplier.value;
    const ids = [
      ...new Set(
        (variantIds ?? this.lines().map(line => line.variantId)).filter(id => id.length > 0)
      ),
    ];
    if (!supplierId || ids.length === 0) return;
    const pending = new Set<Promise<void>>();
    for (const id of ids) {
      const load = this.performanceLoads.get(`${supplierId}:${id}`);
      if (load) pending.add(load);
    }
    const missing = ids.filter(
      id =>
        !this.performanceLoadedKeys.has(`${supplierId}:${id}`) &&
        !this.performanceLoads.has(`${supplierId}:${id}`)
    );
    if (missing.length > 0) {
      const missingSet = new Set(missing);
      let load!: Promise<void>;
      load = this.money
        .supplierVariantPerformance(supplierId, missing)
        .then(rows => {
          if (this.supplier.value !== supplierId) return;
          for (const id of missing) this.performanceLoadedKeys.add(`${supplierId}:${id}`);
          this.performanceState.update(current => [
            ...current.filter(
              row =>
                row.supplier_id !== supplierId ||
                row.variant_id === null ||
                !missingSet.has(row.variant_id)
            ),
            ...rows,
          ]);
        })
        .catch(() => {
          // Price history is decision support; purchase entry remains available without it.
        })
        .finally(() => {
          for (const id of missing) {
            const key = `${supplierId}:${id}`;
            if (this.performanceLoads.get(key) === load) this.performanceLoads.delete(key);
          }
        });
      for (const id of missing) this.performanceLoads.set(`${supplierId}:${id}`, load);
      pending.add(load);
    }
    await Promise.all(pending);
  }
  advanceUsed(): number {
    return parseKes(this.advanceAmount.value) ?? 0;
  }
  advanceAmountError(): string | null {
    const amount = parseKes(this.advanceAmount.value);
    if (amount === null || amount < 0) return 'Enter zero or a positive amount';
    if (amount > this.supplierAdvanceAvailable()) return 'Amount exceeds the available advance';
    if (amount > this.invoiceTotal()) return 'Amount exceeds the supplier invoice';
    return null;
  }
  useSuggestedAdvance(): void {
    this.advanceAmount.setValue(formatKesInput(this.suggestedAdvance()));
    this.markDirty();
  }
  initialPayment(): number {
    return this.paymentProjection().initialPayment;
  }
  balanceDue(): number {
    return this.paymentProjection().balanceDue;
  }
  cashLeavingNow(): number {
    return this.paymentProjection().cashLeavingNow;
  }
  requiresSession(): boolean {
    return this.cashLeavingNow() > 0;
  }
  partialPaymentError(): string | null {
    const amount = parseKes(this.partialAmount.value);
    if (this.paymentMode.value !== 'partial') return null;
    if (amount === null || amount <= 0) return 'Enter an amount greater than zero';
    if (amount + this.advanceUsed() >= this.invoiceTotal())
      return 'Use Paid now when the invoice is fully settled';
    return null;
  }
  creditExceeded(): boolean {
    const item = this.suppliers().find(value => value.id === this.supplier.value);
    return (
      !!item &&
      item.supplier_credit_limit > 0 &&
      item.ap_balance + this.balanceDue() > item.supplier_credit_limit
    );
  }
  canConfirm(): boolean {
    return (
      !this.busy() &&
      (this.priceEntryBasis() !== 'exclusive' ||
        (!!this.taxContext()?.tax_configured &&
          !this.taxContextLoading() &&
          !this.taxContextError())) &&
      (!this.claimInputVat.value ||
        (!!this.taxEstimate() && !this.taxEstimateError() && !this.taxEstimateLoading())) &&
      !this.advanceAmountError() &&
      !this.partialPaymentError() &&
      !this.creditExceeded() &&
      (!this.requiresSession() || this.cashierSession.canTakePayment())
    );
  }

  async saveDraft(): Promise<string | null> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return null;
    if (!this.validateBuild()) return null;
    this.savingDraftState.set(true);
    this.errorState.set(null);
    try {
      const id = await this.money.savePurchaseWorkspaceDraft({
        draftId: this.draftId() ?? undefined,
        supplierId: this.supplier.value,
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        reference: this.reference.value.trim() || undefined,
        notes: this.notes.value.trim() || undefined,
        purchaseDate: this.purchaseDate.value,
        stockLocationId: this.location.value,
        paymentAmount: this.initialPayment(),
        paymentMode: this.paymentMode.value,
        advanceAmount: this.advanceUsed(),
        accountCode: this.account.value || undefined,
        clientRef: this.purchaseClientRef,
        claimInputVat: this.claimInputVat.value,
        taxInvoiceDate: this.claimInputVat.value ? this.taxInvoiceDate.value : undefined,
      });
      this.advanceAwareDraft = this.advanceUsed() > 0;
      this.draftIdState.set(id);
      this.dirtyState.set(false);
      this.noticeState.set('Purchase draft saved');
      return id;
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Draft save failed');
      return null;
    } finally {
      this.savingDraftState.set(false);
    }
  }

  async confirmPurchase(): Promise<PurchaseFinalizeResult | null> {
    if (this.priceEntryBasis() === 'exclusive' && !(await this.refreshTaxContext())) return null;
    if (!this.validateBuild() || !this.validateTaxEvidence()) return null;
    if (this.claimInputVat.value && !(await this.refreshVatEstimate())) return null;
    if (!this.canConfirm()) return null;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      if (this.requiresSession()) await this.cashierSession.assertOpen('recording this purchase');
      const draftId = await this.money.savePurchaseWorkspaceDraft({
        draftId: this.draftId() ?? undefined,
        supplierId: this.supplier.value,
        lines: this.parsedLines(),
        expenses: this.parsedExpenses(),
        reference: this.reference.value.trim() || undefined,
        notes: this.notes.value.trim() || undefined,
        purchaseDate: this.purchaseDate.value,
        stockLocationId: this.location.value,
        paymentMode: this.paymentMode.value,
        paymentAmount: this.initialPayment(),
        advanceAmount: this.advanceUsed(),
        accountCode: this.account.value || undefined,
        clientRef: this.purchaseClientRef,
        claimInputVat: this.claimInputVat.value,
        taxInvoiceDate: this.claimInputVat.value ? this.taxInvoiceDate.value : undefined,
      });
      this.draftIdState.set(draftId);
      const purchaseId = await this.money.finalizePurchaseDraft(draftId);
      if (this.paymentMode.value === 'later') {
        void this.learning.track(LEARNING_EVENT_NAMES.creditPurchasePosted);
      }
      this.exitAllowed = true;
      this.dirtyState.set(false);
      return { purchaseId };
    } catch (error) {
      this.errorState.set(
        error instanceof Error ? error.message : 'Purchase could not be recorded'
      );
      return null;
    } finally {
      this.busyState.set(false);
    }
  }

  private validateBuild(): boolean {
    this.errorState.set(null);
    let valid = true;
    if (!this.supplier.value) {
      this.errorState.set('Choose a supplier');
      this.focusControl('[data-supplier-picker] button');
      return false;
    }
    if (!this.location.value) {
      this.errorState.set('Choose a receiving location');
      this.focusControl('[data-location-picker]');
      return false;
    }
    if (this.priceEntryBasis() === 'exclusive') {
      const context = this.taxContext();
      const missingLineRate = this.lines().some(
        line => !context?.lines.some(item => item.variant_id === line.variantId)
      );
      if (
        this.taxContextLoading() ||
        !context?.tax_configured ||
        missingLineRate ||
        this.lines().some(line => line.defaultCostNeedsConversion)
      ) {
        this.errorState.set(
          this.taxContextError() ||
            'Wait for the applicable VAT rates before reviewing this purchase'
        );
        return false;
      }
    }
    if (this.lines().length === 0) {
      this.errorState.set('Add at least one item');
      return false;
    }
    for (const line of this.lines()) {
      line.error = null;
      const unit = parseKes(line.unitCost);
      const total = parseKes(line.lineTotal);
      if (line.quantity <= 0 || unit === null || unit <= 0 || total === null || total <= 0) {
        line.error = 'Enter a valid quantity, unit cost, and line total';
        valid = false;
      }
      const wholesale = parseKes(line.wholesalePrice);
      const retail = parseKes(line.retailPrice);
      if (wholesale === null || retail === null || retail < wholesale) {
        line.error = 'Retail price must not be lower than wholesale';
        valid = false;
      }
    }
    for (const expense of this.expenses()) {
      expense.error = null;
      const amount = parseKes(expense.amount);
      if (amount === null || amount <= 0) {
        expense.error = 'Enter an amount greater than zero';
        valid = false;
      } else if (!expense.settlement) {
        expense.error = 'Choose how this expense was paid';
        valid = false;
      } else if (expense.category === 'other' && !expense.customCategory.trim()) {
        expense.error = 'Name this expense';
        valid = false;
      } else if (expense.settlement === 'separate' && !expense.accountCode) {
        expense.error = 'Choose the account used';
        valid = false;
      }
    }
    this.linesState.update(items => [...items]);
    this.expensesState.update(items => [...items]);
    if (!valid) {
      this.errorState.set('Review the highlighted purchase details');
      this.requestUi({ kind: 'focus-invalid-row' });
    }
    return valid;
  }

  private validateTaxEvidence(): boolean {
    if (!this.claimInputVat.value) return true;
    if (!this.reference.value.trim()) {
      this.errorState.set('Enter the VAT invoice number in Invoice / reference');
      this.focusControl('input[placeholder="Required for input VAT"]');
      return false;
    }
    if (!this.taxInvoiceDate.value) {
      this.errorState.set('Enter the supplier tax invoice date');
      this.focusControl('[data-tax-invoice-date]');
      return false;
    }
    const pinError = this.supplierPinError();
    if (pinError) {
      this.errorState.set(pinError);
      this.focusControl('[data-supplier-tax-pin]');
      return false;
    }
    return true;
  }

  private focusControl(selector: string): void {
    this.requestUi({ kind: 'focus', selector });
  }

  private requestUi(request: PurchaseEditorUiIntent): void {
    this.uiRequestState.set({ ...request, id: ++this.nextUiRequestId });
  }

  private parsedLines(): PurchaseLineInput[] {
    return buildPurchaseLineInputs({
      lines: this.lines(),
      breakdowns: this.lineTaxBreakdowns(),
      basis: this.priceEntryBasis(),
      variants: new Map(
        this.variants().flatMap(variant =>
          variant.variant_id ? ([[variant.variant_id, variant]] as const) : []
        )
      ),
      includeExpiry: this.preferences.batchExpiryEnabled(),
      canAdjustPrices: this.perms.has('ManageStockAdjustments'),
    });
  }
  private parsedExpenses(): PurchaseExpenseInput[] {
    return buildPurchaseExpenseInputs({
      expenses: this.expenses(),
      breakdowns: this.expenseTaxBreakdowns(),
      basis: this.priceEntryBasis(),
    });
  }

  private paymentProjection() {
    return purchasePaymentProjection({
      invoiceTotal: this.invoiceTotal(),
      separateExpenseTotal: this.separateExpenseTotal(),
      advanceAmount: this.advanceUsed(),
      paymentMode: this.paymentMode.value,
      partialAmount: parseKes(this.partialAmount.value) ?? 0,
    });
  }

  private restoreDraft(draft: PurchaseDraft | undefined): void {
    if (!draft) {
      this.errorState.set('Purchase draft was not found');
      return;
    }
    this.draftIdState.set(draft.id);
    this.purchaseClientRef =
      (draft as unknown as { client_ref?: string | null }).client_ref ?? crypto.randomUUID();
    this.supplier.setValue(draft.supplier_id);
    const restoredAdvance = Number(
      (draft as unknown as { advance_amount?: number }).advance_amount ?? 0
    );
    this.advanceAwareDraft = restoredAdvance > 0 || !!draft.client_ref;
    this.advanceAmount.setValue(formatKesInput(restoredAdvance));
    this.reference.setValue(draft.reference ?? '');
    this.notes.setValue(draft.notes ?? '');
    this.purchaseDate.setValue(draft.purchase_date);
    this.claimInputVat.setValue(draft.claim_input_vat);
    this.priceEntryBasisState.set(
      draft.price_entry_basis === 'exclusive' ? 'exclusive' : 'inclusive'
    );
    this.taxInvoiceDate.setValue(draft.tax_invoice_date ?? draft.purchase_date);
    this.taxInvoiceDateTouched = draft.tax_invoice_date !== null;
    this.location.setValue(draft.stock_location_id ?? this.location.value);
    this.paymentMode.setValue((draft.payment_mode as PurchasePaymentMode | null) ?? 'paid');
    this.partialAmount.setValue(
      draft.payment_mode === 'partial' ? formatKesInput(draft.payment_amount ?? 0) : ''
    );
    this.account.setValue(draft.account_code ?? this.account.value);
    const rawLines = Array.isArray(draft.lines)
      ? (draft.lines as unknown as Record<string, unknown>[])
      : [];
    this.linesState.set(
      rawLines.map(item => {
        const exclusive = this.priceEntryBasis() === 'exclusive';
        const unitCost = exclusive ? item['entered_unit_cost'] : item['unit_cost'];
        const lineTotal = exclusive ? item['entered_line_total'] : item['line_total'];
        const valueSource = exclusive ? item['entered_value_source'] : item['value_source'];
        return {
          key: this.nextKey++,
          variantId: String(item['variant_id'] ?? ''),
          quantity: Number(item['quantity'] ?? 1),
          unitCost: formatKesInput(Number(unitCost ?? item['unit_cost'] ?? 0)),
          lineTotal: formatKesInput(
            Number(
              lineTotal ??
                item['line_total'] ??
                Number(item['quantity'] ?? 1) * Number(unitCost ?? item['unit_cost'] ?? 0)
            )
          ),
          valueSource: valueSource === 'total' ? 'total' : 'unit',
          batchNumber: String(item['batch_number'] ?? ''),
          expiryDate: String(item['expiry_date'] ?? ''),
          wholesalePrice: formatKesInput(
            Number(
              item['new_wholesale_price'] ??
                this.variants().find(v => v.variant_id === item['variant_id'])?.wholesale_price ??
                0
            )
          ),
          retailPrice: formatKesInput(
            Number(
              item['new_retail_price'] ??
                this.variants().find(v => v.variant_id === item['variant_id'])?.price ??
                0
            )
          ),
          expanded: false,
          error: null,
          defaultCostNeedsConversion: false,
          grossAmountOverride:
            exclusive && item['line_total'] !== undefined ? Number(item['line_total']) : undefined,
        };
      })
    );
    const rawExpenses = Array.isArray(draft.expenses)
      ? (draft.expenses as unknown as Record<string, unknown>[])
      : [];
    this.expensesState.set(
      rawExpenses.map(item => {
        const category = String(item['category'] ?? 'other');
        const preset = ['transport', 'loading', 'packaging', 'duty'].includes(category);
        return {
          key: this.nextKey++,
          category: preset ? category : 'other',
          customCategory: String(item['custom_label'] ?? (preset ? '' : category)),
          memo: String(item['memo'] ?? ''),
          amount: formatKesInput(
            Number(
              this.priceEntryBasis() === 'exclusive'
                ? (item['entered_amount'] ?? item['amount'] ?? 0)
                : (item['amount'] ?? 0)
            )
          ),
          settlement: String(item['settlement'] ?? '') as ExpenseSettlement,
          accountCode: String(item['account_code'] ?? this.account.value),
          noteExpanded: Boolean(String(item['memo'] ?? '').trim()),
          error: null,
          grossAmountOverride:
            this.priceEntryBasis() === 'exclusive' && item['settlement'] === 'supplier_bill'
              ? Number(item['amount'] ?? 0)
              : undefined,
        };
      })
    );
    void this.loadSupplierContext(draft.supplier_id);
    void this.loadSelectedSupplierPerformance();
  }
  private today(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  }

  ngOnDestroy(): void {
    if (this.taxContextTimer) clearTimeout(this.taxContextTimer);
    this.searchRequest++;
    this.taxEstimateRequest++;
    this.taxContextRequest++;
    this.supplierAdvanceRequest++;
    this.supplierStockRequest++;
  }
}

import { Injectable, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { parseKes } from '../../core/money';
import { CashierSessionService } from '../../core/cashier-session.service';
import { LocationContextService } from '../../core/location-context.service';
import { MpesaCheckoutCoordinator } from '../../core/mpesa-checkout-coordinator.service';
import { MpesaService } from '../../core/mpesa.service';
import { PermissionsService } from '../../core/permissions.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { PrintService } from '../../shared/print/print.service';
import {
  type CheckoutMode,
  type FulfillmentCheckoutDraft,
} from '../../fulfillment/fulfillment-checkout-fields.component';
import {
  FulfillmentService,
  type FulfillmentSettings,
} from '../../fulfillment/fulfillment.service';
import { CartService, MAX_SALE_LINES, type CartLine } from '../cart.service';
import type { PaymentMethodOption } from '../checkout/checkout-panel.component';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import {
  type Customer,
  type CustomerWithCredit,
  type PaymentInput,
  type SaleSettlementInput,
  PosRpcError,
  PosService,
  variantLabel,
} from '../pos.service';
import { SellCatalogStore } from './sell-catalog.store';
import type { SellCartIntent, SellCartViewModel } from './sell-cart-panel.component';
import type { SellCheckoutWorkspaceViewModel } from './sell-checkout-workspace.component';
import type { SellCustomerIntent, SellCustomerViewModel } from './sell-customer-context.component';
import type { DraftFlag, SaleSuccessMessage } from './sell.types';
import {
  resolveSaleAttempt,
  salePayloadFingerprint,
  type SaleAttemptState,
} from './sell-workflow-idempotency';
import { LEARNING_EVENT_NAMES } from '../../learning/learning-content';
import { LearningPlatformService } from '../../learning/learning-platform.service';

export interface SellWorkflowInit {
  draftId?: string | null;
  customerId?: string | null;
}

/**
 * Page-scoped transaction coordinator for Sell.
 *
 * CartService owns cart mutations and SellCatalogStore owns catalog loading. This store owns the
 * customer/payment/fulfillment transaction workflow and its idempotency keys. Fulfillment commands
 * receive an immutable snapshot from the view; this layer never reaches through a ViewChild.
 */
@Injectable()
export class SellWorkflowStore implements OnDestroy {
  readonly cart = inject(CartService);
  readonly connectivity = inject(ConnectivityService);
  readonly sync = inject(SyncService);
  readonly print = inject(PrintService);
  readonly perms = inject(PermissionsService);
  readonly cashierSession = inject(CashierSessionService);
  private readonly receiptData = inject(ReceiptDataService);
  private readonly pos = inject(PosService);
  readonly catalog = inject(SellCatalogStore);
  readonly mpesa = inject(MpesaService);
  private readonly mpesaCheckout = inject(MpesaCheckoutCoordinator);
  private readonly locations = inject(LocationContextService);
  private readonly fulfillment = inject(FulfillmentService);
  private readonly learning = inject(LearningPlatformService);

  readonly cartItemCount = computed(() =>
    this.cart.lines().reduce((total, line) => total + line.quantity, 0)
  );
  readonly canOverridePrices = computed(() => this.perms.has('OverridePrice'));

  readonly customerSearch = new FormControl('', { nonNullable: true });
  private readonly customerResultsState = signal<CustomerWithCredit[]>([]);
  readonly customerResults = this.customerResultsState.asReadonly();
  private readonly customerSearchExhaustiveState = signal(true);
  readonly customerSearchExhaustive = this.customerSearchExhaustiveState.asReadonly();
  private readonly customerSearchHasMoreState = signal(false);
  readonly customerSearchHasMore = this.customerSearchHasMoreState.asReadonly();
  private readonly selectedCustomerState = signal<CustomerWithCredit | null>(null);
  readonly selectedCustomer = this.selectedCustomerState.asReadonly();
  private readonly customerDropdownOpenState = signal(false);
  readonly customerDropdownOpen = this.customerDropdownOpenState.asReadonly();
  private readonly fulfillmentSettingsState = signal<FulfillmentSettings | null>(null);
  readonly fulfillmentSettings = this.fulfillmentSettingsState.asReadonly();
  private readonly fulfillmentModeState = signal<CheckoutMode>('counter');
  readonly fulfillmentMode = this.fulfillmentModeState.asReadonly();
  private readonly activeFulfillmentDraftState = signal<FulfillmentCheckoutDraft | null>(null);
  readonly activeFulfillmentDraft = this.activeFulfillmentDraftState.asReadonly();
  private readonly fulfillmentResetVersionState = signal(0);
  readonly fulfillmentResetVersion = this.fulfillmentResetVersionState.asReadonly();
  readonly checkoutCustomer = computed(() => {
    const customer = this.selectedCustomer();
    return customer
      ? {
          id: customer.id,
          name: this.customerName(customer),
          phone: customer.phone,
          delivery_address: customer.delivery_address,
        }
      : null;
  });
  private autoDeliveryFeeVariantId: string | null = null;

  private readonly overrideForState = signal<string | null>(null);
  readonly overrideFor = this.overrideForState.asReadonly();
  readonly overridePrice = new FormControl('', { nonNullable: true });
  readonly overrideReason = new FormControl('', { nonNullable: true });
  private readonly priceFloorFeedbackState = signal<{
    variantId: string;
    label: string;
    floor: number;
    wholesale: boolean;
  } | null>(null);
  readonly priceFloorFeedback = this.priceFloorFeedbackState.asReadonly();

  private readonly checkoutOpenState = signal(false);
  readonly checkoutOpen = this.checkoutOpenState.asReadonly();
  private readonly mpesaSplitReadyState = signal<{
    intentId: string;
    orderId: string;
    cashPayments: PaymentInput[];
    cashAmount: number;
  } | null>(null);
  readonly mpesaSplitReady = this.mpesaSplitReadyState.asReadonly();
  private readonly customerDepositBalanceState = signal(0);
  readonly customerDepositBalance = this.customerDepositBalanceState.asReadonly();
  private readonly clearCartArmedState = signal(false);
  readonly clearCartArmed = this.clearCartArmedState.asReadonly();
  private readonly creditConfirmOpenState = signal(false);
  readonly creditConfirmOpen = this.creditConfirmOpenState.asReadonly();
  readonly creditApprovalReason = new FormControl('', { nonNullable: true });
  private readonly methodsState = signal<PaymentMethodOption[]>([]);
  readonly methods = this.methodsState.asReadonly();
  private readonly busyState = signal(false);
  readonly busy = this.busyState.asReadonly();
  private readonly errorState = signal<string | null>(null);
  readonly error = this.errorState.asReadonly();
  readonly displayError = computed(() => this.error() ?? this.catalog.error());
  private readonly noticeState = signal<string | null>(null);
  readonly notice = this.noticeState.asReadonly();
  /**
   * Load-time warnings for a proforma being edited: price drift since it was
   * saved, overrides this user cannot keep, stock shortfalls, dropped lines.
   * Shown only while a proforma is loaded (cart.draftId set).
   */
  private readonly draftFlagsState = signal<DraftFlag[]>([]);
  readonly draftFlags = this.draftFlagsState.asReadonly();
  private readonly draftFlagsDismissedState = signal(false);
  readonly draftFlagsDismissed = this.draftFlagsDismissedState.asReadonly();
  private readonly successState = signal<SaleSuccessMessage | null>(null);
  readonly success = this.successState.asReadonly();
  private readonly printerEnabledState = signal(false);
  readonly printerEnabled = this.printerEnabledState.asReadonly();
  readonly creditAllowed = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer || (!customer.is_credit_approved && this.automaticCreditAmount() > 0))
      return false;
    return (
      !this.creditExceedsLimit() || this.perms.actionMode('sale.credit_over_limit') !== 'blocked'
    );
  });
  readonly automaticDownpayment = computed(() =>
    Math.min(this.customerDepositBalance(), this.cart.total())
  );
  readonly automaticCreditAmount = computed(() =>
    Math.max(this.cart.total() - this.automaticDownpayment(), 0)
  );
  readonly creditExceedsLimit = computed(() => {
    const customer = this.selectedCustomer();
    return (
      !!customer &&
      customer.credit_limit > 0 &&
      customer.ar_balance + this.automaticCreditAmount() > customer.credit_limit
    );
  });
  readonly creditApprovalRequired = computed(
    () => this.creditExceedsLimit() && this.perms.actionMode('sale.credit_over_limit') === 'request'
  );
  /** Backend-derived tender methods; walk-ins may only use till-controlled accounts. */
  readonly panelMethods = computed<PaymentMethodOption[]>(() => {
    const methods = this.methods();
    return this.cart.customerId() ? methods : methods.filter(m => m.isCashierControlled);
  });
  readonly canUseDirectAccounts = computed(() => this.perms.has('ViewFinancials'));
  readonly mixedCreditAllowed = computed(() => !!this.selectedCustomer()?.is_credit_approved);
  private readonly approvalSentState = signal(false);
  readonly approvalSent = this.approvalSentState.asReadonly();
  readonly cartViewModel = computed<SellCartViewModel>(() => ({
    lines: this.cart.lines().map(line => ({ line, label: this.cart.lineLabel(line) })),
    busy: this.busy(),
    clearArmed: this.clearCartArmed(),
    canOverridePrices: this.canOverridePrices(),
    floorRejectedVariantId: this.priceFloorFeedback()?.variantId ?? null,
    overrideFor: this.overrideFor(),
  }));
  readonly customerViewModel = computed<SellCustomerViewModel>(() => ({
    selected: this.selectedCustomer(),
    results: this.customerResults(),
    dropdownOpen: this.customerDropdownOpen(),
    searchExhaustive: this.customerSearchExhaustive(),
    searchHasMore: this.customerSearchHasMore(),
    depositBalance: this.customerDepositBalance(),
  }));
  readonly checkoutWorkspaceViewModel = computed<SellCheckoutWorkspaceViewModel>(() => ({
    customer: this.customerViewModel(),
    checkoutCustomer: this.checkoutCustomer(),
    fulfillmentSettings: this.fulfillmentSettings(),
    fulfillmentMode: this.fulfillmentMode(),
    total: this.cart.total(),
    itemCount: this.cartItemCount(),
    empty: this.cart.isEmpty(),
    busy: this.busy(),
    canTakePayment: this.cashierSession.canTakePayment(),
    canSettleOrder: this.perms.has('SettleOrder'),
    creditAllowed: this.creditAllowed(),
    cashierFlowEnabled: this.cashierSession.cashierFlowEnabled(),
  }));
  private approvalSentTimer: ReturnType<typeof setTimeout> | null = null;
  private saleAttempt: SaleAttemptState | null = null;
  private customerSearchSeq = 0;
  private matchedCustomerRequest = 0;
  private customerDepositRequest = 0;
  private fulfillmentSettingsRequest = 0;
  private priceFloorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debouncedCustomerSearch = toSignal(
    this.customerSearch.valueChanges.pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: undefined }
  );

  constructor() {
    effect(() => {
      const query = this.debouncedCustomerSearch();
      if (query === undefined) return;
      untracked(() => void this.onCustomerSearch(query));
    });
    let fulfillmentLocationId: string | null = null;
    effect(() => {
      const locationId = this.locations.activeId();
      if (!locationId || locationId === fulfillmentLocationId) return;
      const locationChanged = fulfillmentLocationId !== null;
      fulfillmentLocationId = locationId;
      untracked(() => {
        if (locationChanged) {
          if (this.autoDeliveryFeeVariantId) this.cart.removeLine(this.autoDeliveryFeeVariantId);
          this.resetFulfillmentCheckout();
        }
        this.fulfillmentSettingsState.set(null);
        void this.loadFulfillmentSettings();
      });
    });
  }

  async initialize(request: SellWorkflowInit): Promise<void> {
    void this.sync.paymentMethods().then(methods => this.methodsState.set(methods));
    void this.receiptData.printerEnabled().then(enabled => this.printerEnabledState.set(enabled));
    void this.mpesa.refreshAvailability();
    const draftId = request.draftId;
    if (draftId) await this.loadDraft(draftId);
    const routedCustomerId = request.customerId;
    const customerId = routedCustomerId ?? this.cart.customerId();
    if (customerId) {
      try {
        const customer = await this.pos.customerWithCredit(customerId);
        if (!customer) throw new Error('Customer not found');
        this.selectedCustomerState.set(customer);
        if (routedCustomerId) {
          this.cart.setCustomer(customer.id, this.customerName(customer));
        }
        await this.refreshCustomerDeposit(customerId);
      } catch {
        this.selectedCustomerState.set(null);
        this.customerDepositBalanceState.set(0);
        if (routedCustomerId) this.cart.setCustomer(null, 'Walk-in');
      }
    }
  }

  stepQty(variantId: string, direction: 1 | -1): void {
    const line = this.cart.lines().find(l => l.variant.variant_id === variantId);
    if (!line) return;
    this.cart.setQuantity(
      variantId,
      line.quantity + direction * this.cart.quantityStep(line.variant)
    );
  }

  onQtyInput(variantId: string, value: number | string): void {
    const quantity = Number(value);
    if (Number.isFinite(quantity)) this.cart.setQuantity(variantId, quantity);
  }

  /**
   * Adjust by a stable ~3% of the base unit price, rounded to whole KES.
   * A fixed step makes up/down reversible and avoids the decimal drift in the old POS.
   */
  adjustPrice(line: CartLine, direction: 1 | -1): void {
    if (!this.canOverridePrices()) return;
    const baseWhole = line.unitPrice;
    const currentWhole = line.customPrice ?? line.unitPrice;
    const step = Math.max(1, Math.round(line.unitPrice * 0.03));
    const wholesaleFloor = this.wholesaleFloor(line);
    if (direction < 0 && currentWhole <= wholesaleFloor) {
      this.rejectBelowWholesale(line, wholesaleFloor);
      return;
    }
    const next = Math.max(wholesaleFloor, currentWhole + direction * step);

    if (next === currentWhole) return;
    this.clearPriceFloorFeedback();
    const customPrice = next === line.unitPrice ? null : next;
    const verb = direction > 0 ? 'increased' : 'reduced';
    this.cart.setCustomPrice(
      line.variant.variant_id!,
      customPrice,
      customPrice === null ? '' : `Quick price ${verb} by KES ${step}`
    );

    // When a whole-KES base is reached, remove the override entirely.
    if (next === baseWhole && baseWhole === line.unitPrice) {
      this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    }
  }

  startOverride(line: CartLine): void {
    if (!this.canOverridePrices()) return;
    const effectivePrice = line.customPrice ?? line.unitPrice;
    this.overrideForState.set(line.variant.variant_id!);
    this.overridePrice.setValue(String(effectivePrice));
    this.overrideReason.setValue(line.overrideReason);
  }

  applyOverride(): void {
    if (!this.canOverridePrices()) return;
    const variantId = this.overrideFor();
    if (!variantId) return;
    const enteredAmount = parseKes(this.overridePrice.value);
    if (enteredAmount === null || enteredAmount <= 0) {
      this.errorState.set('Enter a valid price greater than zero');
      return;
    }

    const line = this.cart.lines().find(item => item.variant.variant_id === variantId);
    if (!line) return;
    const wholesaleFloor = this.wholesaleFloor(line);
    if (enteredAmount < wholesaleFloor) {
      this.rejectBelowWholesale(line, wholesaleFloor);
      return;
    }

    const customPrice = enteredAmount === line.unitPrice ? null : enteredAmount;
    this.clearPriceFloorFeedback();
    this.cart.setCustomPrice(
      variantId,
      customPrice,
      customPrice === null ? '' : this.overrideReason.value.trim() || 'Manual price adjustment'
    );
    this.overrideForState.set(null);
    this.errorState.set(null);
  }

  resetPrice(line: CartLine): void {
    this.clearPriceFloorFeedback();
    this.cart.setCustomPrice(line.variant.variant_id!, null, '');
    if (this.overrideFor() === line.variant.variant_id) this.overrideForState.set(null);
  }

  private wholesaleFloor(line: CartLine): number {
    return Math.max(1, line.variant.wholesale_price ?? 0);
  }

  private rejectBelowWholesale(line: CartLine, floor: number): void {
    this.clearPriceFloorFeedback();
    this.priceFloorFeedbackState.set({
      variantId: line.variant.variant_id!,
      label: this.cart.lineLabel(line),
      floor,
      wholesale: (line.variant.wholesale_price ?? 0) > 0,
    });
    this.priceFloorTimer = setTimeout(() => this.priceFloorFeedbackState.set(null), 3000);
  }

  private clearPriceFloorFeedback(): void {
    if (this.priceFloorTimer) {
      clearTimeout(this.priceFloorTimer);
      this.priceFloorTimer = null;
    }
    this.priceFloorFeedbackState.set(null);
  }

  onCustomerFocus(): void {
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResultsState.set([]);
    this.customerDropdownOpenState.set(true);
  }

  onCustomerBlur(): void {
    this.customerDropdownOpenState.set(false);
    // No selection made: the field reverts to the Walk-in placeholder.
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResultsState.set([]);
  }

  clearCustomer(): void {
    this.selectCustomer(null);
  }

  async onCustomerSearch(query: string): Promise<void> {
    const q = query.trim();
    const seq = ++this.customerSearchSeq;
    if (q.length < 2) {
      this.customerResultsState.set([]);
      this.customerSearchExhaustiveState.set(true);
      this.customerSearchHasMoreState.set(false);
      return;
    }
    try {
      const result = await this.pos.searchCustomers(q);
      if (seq !== this.customerSearchSeq) return;
      this.customerResultsState.set(result.items);
      this.customerSearchExhaustiveState.set(result.exhaustive);
      this.customerSearchHasMoreState.set(result.hasMore);
      this.customerDropdownOpenState.set(true);
    } catch (err) {
      if (seq !== this.customerSearchSeq) return;
      this.errorState.set(err instanceof Error ? err.message : 'Customer search failed');
    }
  }

  selectCustomer(customer: CustomerWithCredit | null): void {
    ++this.matchedCustomerRequest;
    ++this.customerDepositRequest;
    this.selectedCustomerState.set(customer);
    this.cart.setCustomer(customer?.id ?? null, customer ? this.customerName(customer) : 'Walk-in');
    this.customerDropdownOpenState.set(false);
    this.customerSearch.setValue('', { emitEvent: false });
    this.customerResultsState.set([]);
    if (customer) void this.refreshCustomerDeposit(customer.id);
    else this.customerDepositBalanceState.set(0);
  }

  handleCustomerIntent(intent: SellCustomerIntent): void {
    if (intent.type === 'focus') this.onCustomerFocus();
    else if (intent.type === 'blur') this.onCustomerBlur();
    else if (intent.type === 'clear') this.clearCustomer();
    else this.selectCustomer(intent.customer);
  }

  handleCartIntent(intent: SellCartIntent): void {
    if (intent.type === 'arm-clear') this.armClearCart();
    else if (intent.type === 'cancel-clear') this.cancelClearCart();
    else if (intent.type === 'clear') this.clearCart();
    else if (intent.type === 'remove') this.cart.removeLine(intent.variantId);
    else if (intent.type === 'quantity-step') this.stepQty(intent.variantId, intent.direction);
    else if (intent.type === 'quantity-change') this.onQtyInput(intent.variantId, intent.quantity);
    else if (intent.type === 'price-step') this.adjustPrice(intent.line, intent.direction);
    else if (intent.type === 'price-edit') this.startOverride(intent.line);
    else if (intent.type === 'price-reset') this.resetPrice(intent.line);
    else if (intent.type === 'close-price-editor') this.closePriceOverride();
    else this.applyOverride();
  }

  customerCreditAvailable(customer: CustomerWithCredit): number {
    return Math.max(0, customer.credit_limit - customer.ar_balance);
  }

  customerName(customer: Customer): string {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }

  private async loadFulfillmentSettings(): Promise<void> {
    const locationId = this.locations.activeId();
    if (!locationId) return;
    const request = ++this.fulfillmentSettingsRequest;
    try {
      const settings = await this.fulfillment.settings(locationId);
      if (request !== this.fulfillmentSettingsRequest || this.locations.activeId() !== locationId)
        return;
      this.fulfillmentSettingsState.set(settings);
    } catch {
      if (request !== this.fulfillmentSettingsRequest || this.locations.activeId() !== locationId)
        return;
      this.fulfillmentSettingsState.set(null);
    }
  }

  async fulfillmentModeChanged(mode: CheckoutMode): Promise<void> {
    this.fulfillmentModeState.set(mode);
    this.errorState.set(null);
    if (mode === 'delivery') {
      await this.ensureDeliveryFee();
      return;
    }
    if (this.autoDeliveryFeeVariantId) {
      this.cart.removeLine(this.autoDeliveryFeeVariantId);
      this.autoDeliveryFeeVariantId = null;
    }
  }

  async selectMatchedCustomer(customerId: string): Promise<void> {
    const request = ++this.matchedCustomerRequest;
    try {
      const customer = await this.pos.customerWithCredit(customerId);
      if (request !== this.matchedCustomerRequest) return;
      if (!customer) throw new Error('Customer not found');
      this.selectCustomer(customer);
    } catch (error) {
      if (request !== this.matchedCustomerRequest) return;
      this.errorState.set(error instanceof Error ? error.message : 'Could not select customer');
    }
  }

  private async ensureDeliveryFee(): Promise<boolean> {
    if (this.fulfillmentMode() !== 'delivery') return true;
    const locationId = this.locations.activeId();
    const variantId = this.fulfillmentSettings()?.default_delivery_fee_variant_id;
    if (!variantId) {
      this.errorState.set(
        'Set a delivery fee product in fulfillment settings before taking delivery orders.'
      );
      return false;
    }
    if (this.cart.lines().some(line => line.variant.variant_id === variantId)) return true;
    try {
      const variant = await this.pos.variantById(variantId);
      if (this.fulfillmentMode() !== 'delivery' || this.locations.activeId() !== locationId) {
        return false;
      }
      if (!variant || !variant.variant_active || !variant.product_active) {
        throw new Error('The configured delivery fee product is unavailable.');
      }
      if (!this.cart.addVariant(variant)) throw new Error('The sale has too many lines.');
      this.autoDeliveryFeeVariantId = variantId;
      return true;
    } catch (error) {
      this.errorState.set(
        error instanceof Error ? error.message : 'Could not add the delivery fee'
      );
      return false;
    }
  }

  async openCheckout(fulfillmentDraft: FulfillmentCheckoutDraft | null): Promise<void> {
    if (!this.perms.has('SettleOrder')) return;
    this.errorState.set(null);
    if (!(await this.ensureDeliveryFee())) return;
    if (this.fulfillmentMode() !== 'counter' && !fulfillmentDraft) return;
    this.activeFulfillmentDraftState.set(fulfillmentDraft);
    if (fulfillmentDraft?.fulfillment.collection_kind === 'cod') {
      await this.placeCodOrder(fulfillmentDraft);
      return;
    }
    try {
      await this.cashierSession.assertOpen('taking payment');
      const customerId = this.cart.customerId();
      if (customerId) await this.refreshCustomerDeposit(customerId);
      this.checkoutOpenState.set(true);
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Open a cashier session first');
    }
  }

  private currentFulfillmentDraft(): FulfillmentCheckoutDraft | null {
    return this.fulfillmentMode() === 'counter' ? null : this.activeFulfillmentDraft();
  }

  private async placeCodOrder(draft: FulfillmentCheckoutDraft): Promise<void> {
    if (!this.connectivity.online()) {
      this.errorState.set('COD orders require an internet connection.');
      return;
    }
    this.busyState.set(true);
    this.errorState.set(null);
    this.noticeState.set(null);
    const lines = this.cart.toSaleLines();
    const fingerprint = salePayloadFingerprint({ lines, draft, kind: 'cod' });
    this.saleAttempt = resolveSaleAttempt(this.saleAttempt, fingerprint, () => crypto.randomUUID());
    try {
      const result = await this.fulfillment.checkout({
        locationId: this.locations.requireActiveId(),
        customer: draft.customer,
        lines,
        payments: [],
        fulfillment: draft.fulfillment,
        clientRef: this.saleAttempt.clientRef,
        draftId: this.cart.draftId() ?? undefined,
      });
      this.checkoutOpenState.set(false);
      this.cart.clear();
      this.saleAttempt = null;
      this.selectedCustomerState.set(null);
      this.customerDepositBalanceState.set(0);
      this.resetFulfillmentCheckout();
      this.successState.set({
        text: result.pin ? `COD order placed · delivery PIN ${result.pin}` : 'COD order placed',
        tone: 'success',
        orderId: result.order_id,
      });
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'COD order could not be placed');
    } finally {
      this.busyState.set(false);
    }
  }

  completeSaleWithSettlement(settlement: SaleSettlementInput): void {
    void this.completeSale(settlement.payments, undefined, settlement);
  }

  async completeSale(
    payments: PaymentInput[],
    approvalReason?: string,
    settlement?: SaleSettlementInput
  ): Promise<void> {
    this.errorState.set(null);
    this.noticeState.set(null);
    this.successState.set(null);
    try {
      await this.cashierSession.assertOpen('completing a sale');
    } catch (err) {
      this.checkoutOpenState.set(false);
      this.errorState.set(err instanceof Error ? err.message : 'Open a cashier session first');
      return;
    }
    this.busyState.set(true);
    const customerId = this.cart.customerId();
    const lines = this.cart.toSaleLines();
    const fulfillmentDraft = this.currentFulfillmentDraft();
    if (this.fulfillmentMode() !== 'counter' && !fulfillmentDraft) {
      this.busyState.set(false);
      return;
    }
    // Retain one key across ambiguous retries, but rotate it when the sale
    // payload changes so an edited cart cannot replay an earlier completion.
    const fingerprint = salePayloadFingerprint({
      customerId,
      lines,
      payments,
      settlement,
      fulfillmentDraft,
      approvalReason,
    });
    this.saleAttempt = resolveSaleAttempt(this.saleAttempt, fingerprint, () => crypto.randomUUID());
    const clientRef = this.saleAttempt.clientRef;
    if (!this.connectivity.online()) {
      if (
        payments.some(payment => payment.method === 'mpesa') &&
        (this.mpesa.availability().active || this.mpesa.availability().manualFallback)
      ) {
        this.errorState.set('Integrated M-PESA payment requires an internet connection.');
        this.checkoutOpenState.set(false);
        this.busyState.set(false);
        return;
      }
      if (settlement) {
        this.errorState.set('Customer deposits and mixed credit require an online connection.');
        this.checkoutOpenState.set(false);
        this.busyState.set(false);
        return;
      }
      try {
        await this.queueSale(customerId, lines, payments, clientRef, fulfillmentDraft);
        this.saleAttempt = null;
      } catch (err) {
        this.errorState.set(err instanceof Error ? err.message : 'Could not safely queue the sale');
      } finally {
        this.busyState.set(false);
      }
      return;
    }
    const mpesaPayment = payments.find(
      payment =>
        payment.method === 'mpesa' &&
        (payment.phone || (this.mpesa.availability().manualFallback && payment.reference))
    );
    if (mpesaPayment && !settlement) {
      try {
        await this.completeMpesaSale(
          mpesaPayment,
          payments,
          customerId,
          lines,
          clientRef,
          fulfillmentDraft
        );
      } catch (err) {
        this.errorState.set(
          err instanceof Error ? err.message : 'M-PESA payment could not be completed'
        );
      } finally {
        this.busyState.set(false);
      }
      return;
    }
    try {
      // Completing from a loaded proforma: pass the draft id so the backend
      // retires it in the same transaction as the sale — no separate delete
      // call that could be lost. Offline-queued sales carry the draft id in
      // the outbox entry and use the same mechanism on replay.
      const completedDraftId = this.cart.draftId() ?? undefined;
      let result;
      const post = async (draftId?: string) => {
        if (fulfillmentDraft) {
          const checkout = await this.fulfillment.checkout({
            locationId: this.locations.requireActiveId(),
            customer: fulfillmentDraft.customer,
            lines,
            payments,
            fulfillment: fulfillmentDraft.fulfillment,
            clientRef,
            draftId,
            approvalReason,
          });
          return {
            status: checkout.status,
            orderId: checkout.order_id,
            approvalId: undefined,
            pin: checkout.pin,
          };
        }
        return settlement
          ? this.pos.postSaleWithPrepayment(customerId!, lines, settlement, clientRef, draftId)
          : this.pos.postSale(
              customerId,
              lines,
              payments,
              false,
              clientRef,
              undefined,
              draftId,
              approvalReason
            );
      };
      try {
        result = await post(completedDraftId);
      } catch (err) {
        // The loaded proforma expired or was retired on another device: drop
        // the link and retry once as a plain sale. The same client_ref keeps
        // the retry idempotent if the first attempt somehow committed.
        if (
          !completedDraftId ||
          !(err instanceof PosRpcError) ||
          !err.message.startsWith('draft_not_found')
        ) {
          throw err;
        }
        this.cart.draftId.set(null);
        result = await post();
      }
      this.checkoutOpenState.set(false);
      this.cart.clear();
      this.saleAttempt = null;
      this.selectedCustomerState.set(null);
      this.customerDepositBalanceState.set(0);
      this.resetFulfillmentCheckout();
      if (result.status === 'approval_required') {
        this.showApprovalSent();
      } else {
        if (
          !settlement &&
          payments.length > 0 &&
          payments.every(payment => payment.method === 'cash')
        ) {
          void this.learning.track(LEARNING_EVENT_NAMES.cashSaleCompleted);
        }
        const handoffPin = 'pin' in result ? result.pin : null;
        this.successState.set({
          text: handoffPin ? `Sale completed · handoff PIN ${handoffPin}` : 'Sale completed',
          tone: 'success',
          orderId: result.orderId,
        });
      }
    } catch (err) {
      if (!(err instanceof PosRpcError) && !settlement) {
        try {
          await this.queueSale(customerId, lines, payments, clientRef, fulfillmentDraft);
          this.saleAttempt = null;
        } catch (queueError) {
          this.errorState.set(
            queueError instanceof Error ? queueError.message : 'Could not safely queue the sale'
          );
        }
      } else {
        this.errorState.set(err instanceof Error ? err.message : 'Sale could not be completed');
        this.checkoutOpenState.set(false);
      }
    } finally {
      this.busyState.set(false);
    }
  }

  private async completeMpesaSale(
    mpesaPayment: PaymentInput,
    payments: PaymentInput[],
    customerId: string | null,
    lines: ReturnType<CartService['toSaleLines']>,
    clientRef: string,
    fulfillmentDraft: FulfillmentCheckoutDraft | null
  ): Promise<void> {
    const cashPayments = payments
      .filter(payment => payment !== mpesaPayment)
      .map(({ phone: _phone, ...payment }) => payment);
    this.checkoutOpenState.set(false);
    this.noticeState.set(
      mpesaPayment.phone
        ? 'STK prompt sent. Waiting for M-PESA confirmation.'
        : 'Checking the M-PESA receipt.'
    );
    const outcome = await this.mpesaCheckout.run(
      retry =>
        fulfillmentDraft
          ? this.fulfillment.prepareMpesaCheckout({
              locationId: this.locations.requireActiveId(),
              customer: fulfillmentDraft.customer,
              lines,
              fulfillment: fulfillmentDraft.fulfillment,
              mpesaAmount: mpesaPayment.amount,
              cashAmount: cashPayments.reduce((sum, payment) => sum + payment.amount, 0),
              clientRef,
              draftId: this.cart.draftId() ?? undefined,
              retry,
              ...(mpesaPayment.phone
                ? { phone: mpesaPayment.phone }
                : { receipt: mpesaPayment.reference! }),
            })
          : this.mpesa.initiateSale({
              locationId: this.locations.requireActiveId(),
              customerId,
              lines,
              mpesaAmount: mpesaPayment.amount,
              cashAmount: cashPayments.reduce((sum, payment) => sum + payment.amount, 0),
              clientRef,
              draftId: this.cart.draftId() ?? undefined,
              retry,
              ...(mpesaPayment.phone
                ? { phone: mpesaPayment.phone }
                : { receipt: mpesaPayment.reference! }),
            }),
      this.saleAttempt?.mpesaRetryAllowed ?? false
    );
    if (outcome.kind === 'completed') {
      this.finishMpesaSale(outcome.subjectId);
      return;
    }
    if (outcome.kind === 'awaiting_cash') {
      this.mpesaSplitReadyState.set({
        intentId: outcome.intentId,
        orderId: outcome.subjectId,
        cashPayments,
        cashAmount: outcome.cashAmount,
      });
      this.noticeState.set('M-PESA received. Confirm the cash side to finish the sale.');
      return;
    }
    if (outcome.kind === 'manual_review') {
      this.finishMpesaSale(outcome.subjectId, true);
      this.errorState.set(outcome.message);
      return;
    }
    if (outcome.kind === 'failed' && outcome.retryAllowed && this.saleAttempt) {
      this.saleAttempt.mpesaRetryAllowed = true;
    }
    throw new Error(outcome.message);
  }

  async confirmMpesaSplitCash(): Promise<void> {
    const split = this.mpesaSplitReady();
    if (!split) return;
    this.busyState.set(true);
    this.errorState.set(null);
    try {
      await this.mpesaCheckout.finalizeCash(split.intentId);
      this.mpesaSplitReadyState.set(null);
      this.finishMpesaSale(split.orderId);
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Could not finish split payment');
    } finally {
      this.busyState.set(false);
    }
  }

  keepMpesaSplitPending(): void {
    const split = this.mpesaSplitReady();
    if (!split) return;
    this.mpesaSplitReadyState.set(null);
    this.finishMpesaSale(split.orderId, true);
    this.noticeState.set('M-PESA is recorded. The cash balance remains in pending sales.');
  }

  private finishMpesaSale(orderId: string, warning = false): void {
    this.checkoutOpenState.set(false);
    this.cart.clear();
    this.saleAttempt = null;
    this.selectedCustomerState.set(null);
    this.customerDepositBalanceState.set(0);
    this.resetFulfillmentCheckout();
    this.successState.set({
      text: warning ? 'Payment received — review needed' : 'Sale completed',
      tone: warning ? 'warning' : 'success',
      orderId,
    });
  }

  private async refreshCustomerDeposit(customerId: string): Promise<void> {
    const request = ++this.customerDepositRequest;
    if (!this.connectivity.online()) {
      this.customerDepositBalanceState.set(0);
      return;
    }
    try {
      const balance = await this.pos.customerDepositAvailable(customerId);
      if (request !== this.customerDepositRequest || this.selectedCustomer()?.id !== customerId)
        return;
      this.customerDepositBalanceState.set(balance);
    } catch {
      if (request !== this.customerDepositRequest || this.selectedCustomer()?.id !== customerId)
        return;
      this.customerDepositBalanceState.set(0);
    }
  }

  confirmCreditSale(): void {
    const reason = this.creditApprovalReason.value.trim();
    if (this.creditApprovalRequired() && !reason) return;
    this.creditConfirmOpenState.set(false);
    void this.completeCreditSale(reason || undefined);
    this.creditApprovalReason.setValue('');
  }

  async openCreditConfirmation(fulfillmentDraft: FulfillmentCheckoutDraft | null): Promise<void> {
    if (!this.creditAllowed() || !(await this.ensureDeliveryFee())) return;
    if (this.fulfillmentMode() !== 'counter' && !fulfillmentDraft) return;
    if (fulfillmentDraft?.fulfillment.collection_kind === 'cod') return;
    this.activeFulfillmentDraftState.set(fulfillmentDraft);
    this.creditConfirmOpenState.set(true);
  }

  private async completeCreditSale(approvalReason?: string): Promise<void> {
    const customerId = this.cart.customerId();
    if (!customerId) return;
    this.errorState.set(null);
    this.noticeState.set(null);
    this.successState.set(null);
    if (!this.connectivity.online()) {
      this.errorState.set('Credit sales require an online balance check.');
      return;
    }
    try {
      await this.cashierSession.assertOpen('completing a credit sale');
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'Open a cashier session first');
      return;
    }
    if (!(await this.ensureDeliveryFee())) return;
    const fulfillmentDraft = this.currentFulfillmentDraft();
    if (this.fulfillmentMode() !== 'counter' && !fulfillmentDraft) return;
    const lines = this.cart.toSaleLines();
    const fingerprint = salePayloadFingerprint({
      customerId,
      lines,
      fulfillmentDraft,
      kind: 'automatic-credit',
      approvalReason,
    });
    this.saleAttempt = resolveSaleAttempt(this.saleAttempt, fingerprint, () => crypto.randomUUID());
    this.busyState.set(true);
    try {
      const result = fulfillmentDraft
        ? await this.fulfillment.creditCheckout({
            locationId: this.locations.requireActiveId(),
            customerId,
            customer: fulfillmentDraft.customer,
            lines,
            fulfillment: fulfillmentDraft.fulfillment,
            clientRef: this.saleAttempt.clientRef,
            draftId: this.cart.draftId() ?? undefined,
            approvalReason,
          })
        : await this.pos.postCreditSale(
            customerId,
            lines,
            this.saleAttempt.clientRef,
            this.cart.draftId() ?? undefined,
            approvalReason
          );
      this.cart.clear();
      this.saleAttempt = null;
      this.selectedCustomerState.set(null);
      this.customerDepositBalanceState.set(0);
      this.resetFulfillmentCheckout();
      if (result.status === 'approval_required') {
        this.showApprovalSent();
      } else {
        void this.learning.track(LEARNING_EVENT_NAMES.creditSaleCompleted);
        const split = result.downpaymentApplied
          ? ` · ${result.downpaymentApplied.toLocaleString('en-KE')} downpayment applied`
          : '';
        const pin = 'pin' in result && result.pin ? ` · handoff PIN ${result.pin}` : '';
        this.successState.set({
          text: `Sale completed${split}${pin}`,
          tone: 'success',
          orderId: result.orderId,
        });
      }
    } catch (error) {
      this.errorState.set(
        error instanceof Error ? error.message : 'Credit sale could not complete'
      );
    } finally {
      this.busyState.set(false);
    }
  }

  /** Timed toast for approval-held orders (mirrors the price-floor toast). */
  private showApprovalSent(): void {
    if (this.approvalSentTimer) clearTimeout(this.approvalSentTimer);
    this.approvalSentState.set(true);
    this.approvalSentTimer = setTimeout(() => this.approvalSentState.set(false), 5000);
  }

  private async queueSale(
    customerId: string | null,
    lines: ReturnType<CartService['toSaleLines']>,
    payments: PaymentInput[],
    clientRef: string,
    fulfillmentDraft: FulfillmentCheckoutDraft | null
  ): Promise<void> {
    if (fulfillmentDraft && !fulfillmentDraft.fulfillment.phone?.trim()) {
      throw new Error('Offline pickup requires a recipient phone so the tracking PIN is not lost.');
    }
    await this.sync.enqueue(
      {
        customer_id: customerId,
        lines,
        payments,
        draft_id: this.cart.draftId(),
        ...(fulfillmentDraft
          ? {
              checkout_customer: fulfillmentDraft.customer,
              fulfillment: fulfillmentDraft.fulfillment,
            }
          : {}),
      },
      clientRef
    );
    this.checkoutOpenState.set(false);
    this.cart.clear();
    this.selectedCustomerState.set(null);
    this.resetFulfillmentCheckout();
    this.successState.set({ text: 'Sale queued — will sync when online', tone: 'warning' });
  }

  private resetFulfillmentCheckout(): void {
    this.autoDeliveryFeeVariantId = null;
    this.fulfillmentModeState.set('counter');
    this.activeFulfillmentDraftState.set(null);
    this.fulfillmentResetVersionState.update(version => version + 1);
  }

  newSale(): void {
    this.successState.set(null);
    this.errorState.set(null);
    this.catalog.clearError();
    this.noticeState.set(null);
  }

  dismissNotice(): void {
    this.noticeState.set(null);
  }

  dismissDraftWarnings(): void {
    this.draftFlagsDismissedState.set(true);
  }

  armClearCart(): void {
    this.clearCartArmedState.set(true);
  }

  cancelClearCart(): void {
    this.clearCartArmedState.set(false);
  }

  closePriceOverride(): void {
    this.overrideForState.set(null);
  }

  closeCheckout(): void {
    this.checkoutOpenState.set(false);
  }

  closeCreditConfirmation(): void {
    this.creditConfirmOpenState.set(false);
  }

  dismissError(): void {
    this.errorState.set(null);
    this.catalog.clearError();
  }

  async printReceipt(orderId: string): Promise<void> {
    this.busyState.set(true);
    try {
      const [{ order, meta }, company] = await Promise.all([
        this.receiptData.buildReceiptData(orderId),
        this.receiptData.companyPrintInfo(),
      ]);
      await this.print.printOrder(order, company.name, company.logoUrl, meta, company.address);
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Print failed');
    } finally {
      this.busyState.set(false);
    }
  }

  async sendToCashier(): Promise<void> {
    if (this.fulfillmentMode() !== 'counter') return;
    if (!this.cashierSession.cashierFlowEnabled()) {
      this.errorState.set('Cashier workflow is off. Take payment here to complete the sale.');
      return;
    }
    this.busyState.set(true);
    this.errorState.set(null);
    this.noticeState.set(null);
    const customerId = this.cart.customerId();
    const lines = this.cart.toSaleLines();
    // Retain one command identity after an ambiguous failure. Cart or customer
    // edits rotate it before the next attempt, so changed sales cannot replay.
    const fingerprint = salePayloadFingerprint({ kind: 'cashier-handoff', customerId, lines });
    this.saleAttempt = resolveSaleAttempt(this.saleAttempt, fingerprint, () => crypto.randomUUID());
    try {
      await this.pos.postSale(customerId, lines, [], true, this.saleAttempt.clientRef);
      this.cart.clear();
      this.saleAttempt = null;
      this.selectedCustomerState.set(null);
      this.noticeState.set('Sent to the cashier queue');
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Failed to send sale to cashier');
    } finally {
      this.busyState.set(false);
    }
  }

  async saveProforma(): Promise<void> {
    if (this.fulfillmentMode() !== 'counter') return;
    this.busyState.set(true);
    this.errorState.set(null);
    this.noticeState.set(null);
    try {
      const id = await this.pos.saveDraft(
        this.cart.customerId(),
        this.cart.toSaleLines(),
        this.cart.draftId()
      );
      this.cart.draftId.set(id);
      this.noticeState.set('Proforma saved');
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busyState.set(false);
    }
  }

  clearCart(): void {
    this.cart.clear();
    this.resetFulfillmentCheckout();
    this.clearCartArmedState.set(false);
    this.selectedCustomerState.set(null);
    this.overrideForState.set(null);
    this.errorState.set(null);
    this.noticeState.set(null);
  }

  private async loadDraft(orderId: string): Promise<void> {
    this.draftFlagsState.set([]);
    this.draftFlagsDismissedState.set(false);
    try {
      const order = await this.pos.getOrder(orderId);
      if (order.status !== 'draft') {
        this.errorState.set(`Order ${order.code} is not a proforma (status: ${order.status})`);
        return;
      }
      const lines = await this.pos.orderLines(orderId);
      if (lines.length > MAX_SALE_LINES) {
        this.errorState.set(
          `${order.code} contains ${lines.length} lines. Orders are now limited to ${MAX_SALE_LINES}; split it before checkout.`
        );
        return;
      }
      // Location-resolved stock so the shortfall flags match what the server
      // will enforce at completion.
      const variants = await this.pos.variantsByIdsWithStock(lines.map(line => line.variant_id));
      const byId = new Map(variants.map(variant => [variant.variant_id, variant]));
      const flags: DraftFlag[] = [];
      let unavailable = 0;
      this.cart.clear();
      for (const savedLine of lines) {
        const variant = byId.get(savedLine.variant_id);
        if (!variant) {
          unavailable++;
          continue;
        }
        const label = variantLabel(variant);
        const was = Number(savedLine.unit_price);
        const now = variant.price ?? 0;
        const override = savedLine.custom_price;
        // The server rejects a custom_price that differs from the CURRENT list
        // price when the user lacks OverridePrice — flag it now, not at checkout.
        const blocked = override !== null && override !== now && !this.canOverridePrices();
        if (blocked) {
          flags.push({
            kind: 'override-blocked',
            label,
            was,
            now,
            overridePrice: override ?? 0,
            available: 0,
            needed: 0,
            count: 0,
          });
        } else if (was !== now && override !== null) {
          flags.push({
            kind: 'override',
            label,
            was,
            now,
            overridePrice: override,
            available: 0,
            needed: 0,
            count: 0,
          });
        } else if (was !== now) {
          flags.push({
            kind: 'price',
            label,
            was,
            now,
            overridePrice: 0,
            available: 0,
            needed: 0,
            count: 0,
          });
        }
        const needed = Number(savedLine.quantity);
        const available = Number(variant.stock ?? 0);
        if (variant.track_inventory && available < needed) {
          flags.push({
            kind: 'stock',
            label,
            was: 0,
            now: 0,
            overridePrice: 0,
            available,
            needed,
            count: 0,
          });
        }
        this.cart.addVariant(variant);
        this.cart.setQuantity(variant.variant_id!, needed);
        if (override !== null) {
          this.cart.setCustomPrice(
            variant.variant_id!,
            override,
            savedLine.price_override_reason ?? ''
          );
        }
      }
      if (unavailable > 0) {
        flags.push({
          kind: 'unavailable',
          label: '',
          was: 0,
          now: 0,
          overridePrice: 0,
          available: 0,
          needed: 0,
          count: unavailable,
        });
      }
      this.draftFlagsState.set(flags);
      if (order.customer_id && order.customers) {
        this.cart.setCustomer(
          order.customer_id,
          [order.customers.first_name, order.customers.last_name].filter(Boolean).join(' ')
        );
      }
      this.cart.draftId.set(orderId);
    } catch (err) {
      this.errorState.set(err instanceof Error ? err.message : 'Failed to load proforma');
    }
  }

  ngOnDestroy(): void {
    if (this.approvalSentTimer) clearTimeout(this.approvalSentTimer);
    if (this.priceFloorTimer) clearTimeout(this.priceFloorTimer);
  }
}

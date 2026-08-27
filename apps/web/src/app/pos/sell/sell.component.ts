import { Component, OnInit, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { parseKes } from '../../core/money';
import { PermissionsService } from '../../core/permissions.service';
import { CashierSessionService } from '../../core/cashier-session.service';
import { CartService, MAX_SALE_LINES, type CartLine } from '../cart.service';
import {
  CheckoutPanelComponent,
  type PaymentMethodOption,
} from '../checkout/checkout-panel.component';
import { ConnectivityService } from '../offline/connectivity.service';
import { SyncService } from '../offline/sync.service';
import { ButtonComponent } from '../../shared/ui/button.component';
import { FormFieldComponent } from '../../shared/ui/form-field.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent } from '../../shared/ui/money.component';
import { PageLayoutComponent } from '../../shared/ui/page-layout.component';
import { PrintService } from '../../shared/print/print.service';
import { ReceiptDataService } from '../../shared/print/receipt-data.service';
import { MyPendingSalesComponent } from './my-pending-sales.component';
import { SessionRequiredNoticeComponent } from '../../shared/ui/session-required-notice.component';
import { PageActionsComponent } from '../../shared/ui/page-actions.component';
import { MpesaService } from '../../core/mpesa.service';
import { MpesaCheckoutCoordinator } from '../../core/mpesa-checkout-coordinator.service';
import { LocationContextService } from '../../core/location-context.service';
import type { FulfillmentCheckoutDraft } from '../../fulfillment/fulfillment-checkout-fields.component';
import {
  FulfillmentService,
  type FulfillmentSettings,
} from '../../fulfillment/fulfillment.service';
import {
  Customer,
  CustomerWithCredit,
  PaymentInput,
  SaleSettlementInput,
  PosRpcError,
  PosService,
  variantLabel,
} from '../pos.service';
import { SellStatusMessagesComponent } from './sell-status-messages.component';
import { SellCatalogPanelComponent } from './sell-catalog-panel.component';
import { SellCatalogStore } from './sell-catalog.store';
import { SellCartPanelComponent } from './sell-cart-panel.component';
import {
  SellCheckoutWorkspaceComponent,
  type SellCheckoutWorkspaceIntent,
} from './sell-checkout-workspace.component';
import type { DraftFlag, SaleSuccessMessage } from './sell.types';
import { SellWorkflowStore } from './sell-workflow.store';

@Component({
  selector: 'app-sell',
  providers: [SellCatalogStore, SellWorkflowStore],
  imports: [
    ReactiveFormsModule,
    CheckoutPanelComponent,
    ButtonComponent,
    FormFieldComponent,
    IconComponent,
    MoneyComponent,
    PageLayoutComponent,
    MyPendingSalesComponent,
    SessionRequiredNoticeComponent,
    PageActionsComponent,
    SellStatusMessagesComponent,
    SellCatalogPanelComponent,
    SellCartPanelComponent,
    SellCheckoutWorkspaceComponent,
  ],
  template: `
    <app-page
      title="Sell"
      subtitle="Find an item, adjust it, and take payment without leaving the counter."
      [workspace]="true"
    >
      <app-page-actions actions>
        @if (cart.draftId()) {
          <span utilityAction class="badge badge-info">Editing proforma</span>
        }
        @if (sync.usingCachedCatalog()) {
          <span utilityAction class="badge badge-warning">{{ sync.catalogStatusLabel() }}</span>
        }
        @if (sync.usingCachedCatalog() && connectivity.online()) {
          <button
            overflowAction
            appButton
            variant="ghost"
            size="sm"
            [loading]="catalog.catalogRefreshing()"
            (click)="catalog.refreshCatalog()"
          >
            Refresh catalog
          </button>
        }
        @if (cashierSession.usingCachedState()) {
          <span overflowAction class="badge badge-warning">{{
            cashierSession.cachedStatusLabel()
          }}</span>
        }
        @if (cashierSession.configurationLoaded() && !cashierSession.cashierFlowEnabled()) {
          <span
            overflowAction
            class="badge badge-info cursor-help"
            title="Take payment here to complete the sale; the cashier queue is not used."
          >
            Direct checkout
          </span>
        }
        @if (cashierSession.cashierFlowEnabled()) {
          <app-my-pending-sales overflowAction />
        }
      </app-page-actions>

      @if (cashierSession.cashControlEnabled() && !cashierSession.isOpen()) {
        <app-session-required-notice action="taking payment or completing a sale" />
      }

      <div class="pb-24 lg:pb-24 xl:pb-0">
        <app-sell-status-messages
          [success]="success()"
          [error]="displayError()"
          [notice]="notice()"
          [draftId]="cart.draftId()"
          [draftFlags]="draftFlags()"
          [draftFlagsDismissed]="draftFlagsDismissed()"
          [printerEnabled]="printerEnabled()"
          [busy]="busy()"
          [printFormat]="print.format()"
          [printTemplates]="print.getAvailableTemplates()"
          (printFormatChange)="print.setFormat($event)"
          (printReceipt)="printReceipt($event)"
          (newSale)="newSale()"
          (dismissError)="dismissError()"
          (dismissNotice)="workflow.dismissNotice()"
          (dismissDraftWarnings)="workflow.dismissDraftWarnings()"
        />

        <div
          class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)] xl:items-stretch"
        >
          <app-sell-catalog-panel
            [itemCount]="cartItemCount()"
            [wedgeBlocked]="checkoutOpen() || creditConfirmOpen() || mpesaSplitReady() !== null"
          />

          <app-sell-cart-panel
            [viewModel]="workflow.cartViewModel()"
            [overridePrice]="workflow.overridePrice"
            [overrideReason]="workflow.overrideReason"
            (intent)="workflow.handleCartIntent($event)"
          />

          <app-sell-checkout-workspace
            [viewModel]="workflow.checkoutWorkspaceViewModel()"
            [customerSearch]="workflow.customerSearch"
            (intent)="handleCheckoutWorkspaceIntent($event)"
          />
        </div>
      </div>

      @if (checkoutOpen() && cashierSession.canTakePayment() && perms.has('SettleOrder')) {
        <app-checkout-panel
          [total]="cart.total()"
          [methods]="panelMethods()"
          [canUseDirectAccounts]="canUseDirectAccounts()"
          [customerDepositAvailable]="
            fulfillmentMode() === 'counter' ? customerDepositBalance() : 0
          "
          [allowCredit]="fulfillmentMode() === 'counter' && mixedCreditAllowed()"
          [mpesaStkEnabled]="mpesa.availability().active"
          [mpesaManualFallback]="mpesa.availability().manualFallback"
          [defaultPayerPhone]="fulfillmentPayerPhone()"
          [busy]="busy()"
          heading="Take payment"
          (confirmed)="completeSale($event)"
          (approvalRequested)="completeSale($event)"
          (settlementConfirmed)="completeSaleWithSettlement($event)"
          (cancelled)="workflow.closeCheckout()"
        />
      }
      @if (mpesaSplitReady(); as split) {
        <dialog class="modal modal-open" aria-labelledby="mpesa-cash-heading">
          <div class="modal-box modal-box-scroll">
            <h2 id="mpesa-cash-heading" class="type-title">M-PESA received</h2>
            <p class="mt-2 text-sm">Confirm the remaining cash only after you have it in hand.</p>
            <div class="mt-4 rounded-box bg-base-200 p-3">
              <span class="type-caption">Cash due</span>
              <p class="text-xl font-semibold"><app-money [amount]="split.cashAmount" /></p>
            </div>
            <div class="modal-action">
              <button
                appButton
                variant="ghost"
                [disabled]="busy()"
                (click)="keepMpesaSplitPending()"
              >
                Keep pending
              </button>
              <button appButton [loading]="busy()" (click)="confirmMpesaSplitCash()">
                Confirm cash received
              </button>
            </div>
          </div>
        </dialog>
      }
      @if (creditConfirmOpen()) {
        <dialog
          class="modal modal-bottom modal-open md:modal-middle"
          aria-labelledby="credit-confirm-heading"
          (cancel)="$event.preventDefault(); workflow.closeCreditConfirmation()"
        >
          <div
            class="modal-box modal-box-compact modal-box-task border border-base-300/60 bg-base-100 p-0"
          >
            <header class="flex items-start gap-3 border-b border-base-300/70 px-4 py-3">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <app-icon name="heroCreditCard" size="lg" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 id="credit-confirm-heading" class="type-title">Confirm credit sale</h2>
                <p class="type-caption mt-0.5">
                  Available downpayment is applied first. Only the remainder becomes credit.
                </p>
              </div>
              <button
                appButton
                type="button"
                variant="ghost"
                [iconOnly]="true"
                aria-label="Close credit confirmation"
                [disabled]="busy()"
                (click)="workflow.closeCreditConfirmation()"
              >
                <app-icon name="heroXMark" />
              </button>
            </header>

            <div class="modal-body px-4 py-4">
              @if (selectedCustomer(); as customer) {
                <div
                  class="flex items-center justify-between gap-4 border-b border-base-300/70 pb-3"
                >
                  <div class="min-w-0">
                    <p class="type-caption">Customer</p>
                    <p class="truncate font-semibold">{{ customerName(customer) }}</p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="type-caption">Amount due</p>
                    <p class="type-title tabular-nums"><app-money [amount]="cart.total()" /></p>
                  </div>
                </div>

                @if (customer.credit_limit > 0) {
                  <dl class="mt-3 grid grid-cols-2 gap-3 rounded-field bg-base-200/70 p-3 text-sm">
                    <div>
                      <dt class="type-caption">Balance after sale</dt>
                      <dd
                        class="mt-0.5 font-semibold tabular-nums"
                        [class.text-warning]="creditExceedsLimit()"
                      >
                        <app-money [amount]="customer.ar_balance + automaticCreditAmount()" />
                      </dd>
                    </div>
                    <div class="text-right">
                      <dt class="type-caption">Credit limit</dt>
                      <dd class="mt-0.5 font-semibold tabular-nums">
                        <app-money [amount]="customer.credit_limit" />
                      </dd>
                    </div>
                  </dl>
                }

                <dl
                  class="mt-3 grid grid-cols-2 gap-3 rounded-field border border-info/25 bg-info/5 p-3 text-sm"
                >
                  <div>
                    <dt class="type-caption">Downpayment applied</dt>
                    <dd class="mt-0.5 font-semibold tabular-nums text-info">
                      <app-money [amount]="automaticDownpayment()" />
                    </dd>
                  </div>
                  <div class="text-right">
                    <dt class="type-caption">Added to amount due</dt>
                    <dd class="mt-0.5 font-semibold tabular-nums">
                      <app-money [amount]="automaticCreditAmount()" />
                    </dd>
                  </div>
                </dl>

                @if (creditApprovalRequired()) {
                  <div role="status" class="alert alert-warning mt-3 text-sm">
                    <app-icon name="heroExclamationTriangle" />
                    <span
                      >This exceeds the credit limit. The sale will wait for approval and stock will
                      not change yet.</span
                    >
                  </div>
                  <app-form-field
                    class="mt-3 block"
                    label="Reason for the exception"
                    [required]="true"
                  >
                    <textarea
                      class="textarea textarea-bordered min-h-20 w-full"
                      [formControl]="creditApprovalReason"
                      placeholder="Why should this customer exceed their limit?"
                    ></textarea>
                  </app-form-field>
                }
              }
            </div>

            <footer
              class="grid grid-cols-2 gap-2 border-t border-base-300/70 bg-base-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <button
                appButton
                variant="outline"
                size="md"
                class="w-full"
                type="button"
                [disabled]="busy()"
                (click)="workflow.closeCreditConfirmation()"
              >
                Cancel
              </button>
              <button
                appButton
                size="md"
                class="w-full"
                type="button"
                [loading]="busy()"
                [disabled]="
                  creditApprovalRequired() && creditApprovalReason.value.trim().length === 0
                "
                (click)="confirmCreditSale()"
              >
                @if (creditApprovalRequired()) {
                  Request approval
                } @else {
                  Confirm sale
                }
              </button>
            </footer>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button type="button" aria-label="Cancel" (click)="workflow.closeCreditConfirmation()">
              close
            </button>
          </form>
        </dialog>
      }
      @if (approvalSent()) {
        <div class="toast toast-bottom toast-end z-50" aria-live="polite">
          <div class="alert alert-warning max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Sent for approval</p>
              <p class="text-sm">Order held pending settlement.</p>
            </div>
          </div>
        </div>
      }
      @if (priceFloorFeedback(); as feedback) {
        <div class="toast toast-bottom toast-end z-50" aria-live="assertive">
          <div class="alert alert-error max-w-sm shadow-overlay">
            <app-icon name="heroExclamationTriangle" />
            <div>
              <p class="font-semibold">Price not changed</p>
              <p class="text-sm">
                Minimum allowed for {{ feedback.label }} is <app-money [amount]="feedback.floor" />.
                @if (feedback.wholesale) {
                  This is the wholesale floor.
                }
              </p>
            </div>
          </div>
        </div>
      }
    </app-page>
  `,
})
export class SellComponent implements OnInit {
  protected readonly workflow = inject(SellWorkflowStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly cart = this.workflow.cart;
  protected readonly connectivity = this.workflow.connectivity;
  protected readonly sync = this.workflow.sync;
  protected readonly print = this.workflow.print;
  protected readonly perms = this.workflow.perms;
  protected readonly cashierSession = this.workflow.cashierSession;
  protected readonly catalog = this.workflow.catalog;
  protected readonly mpesa = this.workflow.mpesa;

  protected readonly cartItemCount = this.workflow.cartItemCount;
  protected readonly canOverridePrices = this.workflow.canOverridePrices;
  protected readonly customerSearch = this.workflow.customerSearch;
  protected readonly customerResults = this.workflow.customerResults;
  protected readonly customerSearchExhaustive = this.workflow.customerSearchExhaustive;
  protected readonly customerSearchHasMore = this.workflow.customerSearchHasMore;
  protected readonly selectedCustomer = this.workflow.selectedCustomer;
  protected readonly customerDropdownOpen = this.workflow.customerDropdownOpen;
  protected readonly fulfillmentSettings = this.workflow.fulfillmentSettings;
  protected readonly fulfillmentMode = this.workflow.fulfillmentMode;
  protected readonly checkoutCustomer = this.workflow.checkoutCustomer;
  protected readonly overrideFor = this.workflow.overrideFor;
  protected readonly overridePrice = this.workflow.overridePrice;
  protected readonly overrideReason = this.workflow.overrideReason;
  protected readonly priceFloorFeedback = this.workflow.priceFloorFeedback;
  protected readonly checkoutOpen = this.workflow.checkoutOpen;
  protected readonly mpesaSplitReady = this.workflow.mpesaSplitReady;
  protected readonly customerDepositBalance = this.workflow.customerDepositBalance;
  protected readonly clearCartArmed = this.workflow.clearCartArmed;
  protected readonly creditConfirmOpen = this.workflow.creditConfirmOpen;
  protected readonly creditApprovalReason = this.workflow.creditApprovalReason;
  protected readonly busy = this.workflow.busy;
  protected readonly displayError = this.workflow.displayError;
  protected readonly notice = this.workflow.notice;
  protected readonly draftFlags = this.workflow.draftFlags;
  protected readonly draftFlagsDismissed = this.workflow.draftFlagsDismissed;
  protected readonly success = this.workflow.success;
  protected readonly printerEnabled = this.workflow.printerEnabled;
  protected readonly automaticDownpayment = this.workflow.automaticDownpayment;
  protected readonly automaticCreditAmount = this.workflow.automaticCreditAmount;
  protected readonly creditExceedsLimit = this.workflow.creditExceedsLimit;
  protected readonly creditApprovalRequired = this.workflow.creditApprovalRequired;
  protected readonly panelMethods = this.workflow.panelMethods;
  protected readonly canUseDirectAccounts = this.workflow.canUseDirectAccounts;
  protected readonly mixedCreditAllowed = this.workflow.mixedCreditAllowed;
  protected readonly approvalSent = this.workflow.approvalSent;

  protected readonly checkoutWorkspace = viewChild(SellCheckoutWorkspaceComponent);
  protected readonly isCodCheckout = computed(
    () => this.checkoutWorkspace()?.isCodCheckout() ?? false
  );
  protected readonly fulfillmentPayerPhone = computed(
    () => this.checkoutWorkspace()?.payerPhone() || this.selectedCustomer()?.phone || ''
  );
  protected readonly creditAllowed = computed(
    () => this.workflow.creditAllowed() && !this.isCodCheckout()
  );

  constructor() {
    let handledResetVersion = 0;
    effect(() => {
      const resetVersion = this.workflow.fulfillmentResetVersion();
      if (resetVersion === handledResetVersion) return;
      handledResetVersion = resetVersion;
      untracked(() => queueMicrotask(() => this.checkoutWorkspace()?.resetFulfillment()));
    });
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    await this.workflow.initialize({
      draftId: params.get('draft'),
      customerId: params.get('customer'),
    });
  }

  protected stepQty(variantId: string, direction: 1 | -1): void {
    this.workflow.stepQty(variantId, direction);
  }

  protected onQtyInput(variantId: string, value: number | string): void {
    this.workflow.onQtyInput(variantId, value);
  }

  protected adjustPrice(line: CartLine, direction: 1 | -1): void {
    this.workflow.adjustPrice(line, direction);
  }

  protected startOverride(line: CartLine): void {
    this.workflow.startOverride(line);
  }

  protected applyOverride(): void {
    this.workflow.applyOverride();
  }

  protected resetPrice(line: CartLine): void {
    this.workflow.resetPrice(line);
  }

  protected clearCart(): void {
    this.workflow.clearCart();
  }

  protected onCustomerFocus(): void {
    this.workflow.onCustomerFocus();
  }

  protected onCustomerBlur(): void {
    this.workflow.onCustomerBlur();
  }

  protected clearCustomer(): void {
    this.workflow.clearCustomer();
  }

  protected selectCustomer(customer: CustomerWithCredit): void {
    this.workflow.selectCustomer(customer);
  }

  protected customerCreditAvailable(customer: CustomerWithCredit): number {
    return this.workflow.customerCreditAvailable(customer);
  }

  protected customerName(customer: Customer): string {
    return this.workflow.customerName(customer);
  }

  protected handleCheckoutWorkspaceIntent(intent: SellCheckoutWorkspaceIntent): void {
    if (intent.type === 'customer') this.workflow.handleCustomerIntent(intent.intent);
    else if (intent.type === 'mode-changed') void this.workflow.fulfillmentModeChanged(intent.mode);
    else if (intent.type === 'customer-selected')
      void this.workflow.selectMatchedCustomer(intent.customerId);
    else if (intent.type === 'checkout')
      void this.workflow.openCheckout(this.fulfillmentSnapshot());
    else if (intent.type === 'credit')
      void this.workflow.openCreditConfirmation(this.fulfillmentSnapshot());
    else if (intent.type === 'send-to-cashier') void this.workflow.sendToCashier();
    else void this.workflow.saveProforma();
  }

  protected completeSaleWithSettlement(settlement: SaleSettlementInput): void {
    this.workflow.completeSaleWithSettlement(settlement);
  }

  protected async completeSale(payments: PaymentInput[], approvalReason?: string): Promise<void> {
    await this.workflow.completeSale(payments, approvalReason);
  }

  protected async confirmMpesaSplitCash(): Promise<void> {
    await this.workflow.confirmMpesaSplitCash();
  }

  protected keepMpesaSplitPending(): void {
    this.workflow.keepMpesaSplitPending();
  }

  protected confirmCreditSale(): void {
    this.workflow.confirmCreditSale();
  }

  protected async printReceipt(orderId: string): Promise<void> {
    await this.workflow.printReceipt(orderId);
  }

  protected newSale(): void {
    this.workflow.newSale();
  }

  protected dismissError(): void {
    this.workflow.dismissError();
  }

  protected async sendToCashier(): Promise<void> {
    await this.workflow.sendToCashier();
  }

  protected async saveProforma(): Promise<void> {
    await this.workflow.saveProforma();
  }

  private fulfillmentSnapshot(): FulfillmentCheckoutDraft | null {
    return this.checkoutWorkspace()?.buildFulfillmentSnapshot() ?? null;
  }
}

import { Component, HostListener, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../shared/ui/button.component';
import { IconComponent } from '../shared/ui/icon.component';
import { MoneyComponent } from '../shared/ui/money.component';
import { PageLayoutComponent } from '../shared/ui/page-layout.component';
import { PurchaseExpensesPanelComponent } from './purchase-expenses-panel.component';
import { PurchaseLineRowComponent } from './purchase-line-row.component';
import { PurchasePaymentReviewComponent } from './purchase-payment-review.component';
import { PurchaseEditorStore, type PurchaseEditorUiRequest } from './purchase-editor.store';
import { PurchaseSupplierHeaderComponent } from './purchase-supplier-header.component';
import { PurchaseVatPanelComponent } from './purchase-vat-panel.component';

@Component({
  selector: 'app-purchase-editor',
  providers: [PurchaseEditorStore],
  imports: [
    RouterLink,
    PageLayoutComponent,
    ButtonComponent,
    IconComponent,
    MoneyComponent,
    PurchaseExpensesPanelComponent,
    PurchaseLineRowComponent,
    PurchasePaymentReviewComponent,
    PurchaseSupplierHeaderComponent,
    PurchaseVatPanelComponent,
  ],
  template: `
    <app-page
      [title]="
        store.stage() === 'review'
          ? 'Review purchase'
          : store.draftId()
            ? 'Continue purchase'
            : 'Record purchase'
      "
      [subtitle]="
        store.stage() === 'review'
          ? 'Confirm the invoice and choose how it is paid.'
          : 'Match the supplier invoice and receive stock.'
      "
      backLink="/purchases"
      [wide]="true"
    >
      @if (store.loading()) {
        <div class="flex min-h-64 items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      } @else {
        @if (store.error()) {
          <div class="alert alert-error mb-4 text-sm" role="alert">
            <app-icon name="heroExclamationTriangle" />
            <span>{{ store.error() }}</span>
          </div>
        }
        @if (store.notice()) {
          <div class="alert alert-success mb-4 text-sm" role="status">
            <app-icon name="heroCheckCircle" />
            <span>{{ store.notice() }}</span>
          </div>
        }

        @if (store.stage() === 'build') {
          <div class="grid items-start gap-4 lg:grid-cols-12">
            <div class="min-w-0 space-y-4 lg:col-span-9">
              <app-purchase-supplier-header
                [supplierOptions]="store.supplierOptions()"
                [locations]="store.locations()"
                [supplierControl]="store.supplier"
                [locationControl]="store.location"
                [referenceControl]="store.reference"
                [purchaseDateControl]="store.purchaseDate"
                [notesControl]="store.notes"
                [claimInputVat]="store.claimInputVat.value"
                [invoiceDetailsExpanded]="store.invoiceDetailsExpanded()"
                [purchaseInfoSummary]="store.purchaseInfoSummary()"
                [selectedSupplier]="store.selectedSupplier()"
                [supplierName]="store.supplierName"
                [canViewFinancials]="store.perms.has('ViewFinancials')"
                [projectedSupplierBalance]="store.projectedSupplierBalance()"
                [projectedCreditAvailable]="store.projectedCreditAvailable()"
                [supplierAdvanceAvailable]="store.supplierAdvanceAvailable()"
                [supplierStockLoading]="store.supplierStockLoading()"
                [supplierStockError]="store.supplierStockError()"
                [supplierStock]="store.supplierStock()"
                [supplierStockValue]="store.supplierStockValue()"
                [receivingLocationName]="store.receivingLocationName()"
                (supplierChange)="store.onSupplierChange($event)"
                (receivingLocationChange)="store.onReceivingLocationChange()"
                (referenceInput)="store.markDirty()"
                (purchaseInfoToggle)="store.toggleInvoiceDetails()"
                (purchaseDateChange)="store.onPurchaseDateChange()"
                (notesInput)="store.markDirty()"
              />

              <app-purchase-vat-panel
                [viewModel]="store.vatPanelViewModel()"
                [supplierTaxPin]="store.supplierTaxPin"
                [taxInvoiceDate]="store.taxInvoiceDate"
                (intent)="store.handleVatIntent($event)"
              />

              <section class="card overflow-visible bg-base-100">
                <div class="card-body gap-4 p-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <h2 class="section-title">Items</h2>
                    @if (store.lines().length > 0) {
                      <span class="badge badge-ghost">{{ store.lines().length }}</span>
                    }
                  </div>
                  <div class="sticky top-16 z-30 bg-base-100 py-1">
                    <div class="relative">
                      <span
                        class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50"
                      >
                        <app-icon name="heroMagnifyingGlass" />
                      </span>
                      <input
                        type="search"
                        class="input input-bordered h-12 w-full pl-9"
                        placeholder="Scan barcode or search product, manufacturer, or SKU…"
                        [value]="store.productQuery()"
                        (input)="store.searchProducts($any($event.target).value)"
                        (keydown.enter)="$event.preventDefault(); store.addFirstSearchResult()"
                      />
                      @if (store.productQuery().trim()) {
                        <div
                          class="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-overlay"
                        >
                          @for (variant of store.searchResults(); track variant.variant_id) {
                            <button
                              type="button"
                              class="flex min-h-12 w-full items-center justify-between gap-3 rounded-field px-3 py-2 text-left hover:bg-base-200"
                              (click)="store.addVariant(variant)"
                            >
                              <span class="min-w-0">
                                <span class="block truncate text-sm font-medium">{{
                                  store.label(variant)
                                }}</span>
                                <span class="type-caption block truncate"
                                  >{{ variant.manufacturer_name || 'Manufacturer not set' }} ·
                                  {{ variant.sku
                                  }}{{ variant.barcode ? ' · ' + variant.barcode : '' }}</span
                                >
                              </span>
                              <span class="type-caption shrink-0"
                                >{{ variant.stock ?? 0 }} in stock</span
                              >
                            </button>
                          } @empty {
                            <p class="p-3 text-sm text-base-content/60">
                              No matching stock products.
                            </p>
                          }
                        </div>
                      }
                    </div>
                  </div>

                  @if (store.lines().length === 0) {
                    <div class="rounded-box border border-dashed border-base-300 p-4 text-center">
                      <p class="type-caption">Search or scan the first item to begin.</p>
                    </div>
                  }

                  @if (store.lines().length > 0) {
                    <div class="divide-y divide-base-300 border-y border-base-300">
                      <div
                        class="hidden grid-cols-[minmax(14rem,1fr)_7rem_10rem_10rem_3rem] items-center gap-3 border-b border-base-300 bg-base-200/30 px-3 py-2 xl:grid"
                        aria-hidden="true"
                      >
                        <span class="type-caption">Item</span>
                        <span class="type-caption text-right">Quantity</span>
                        <span class="type-caption text-right">{{
                          store.priceEntryBasis() === 'exclusive'
                            ? 'Unit cost before VAT'
                            : 'Unit cost'
                        }}</span>
                        <span class="type-caption text-right">{{
                          store.priceEntryBasis() === 'exclusive'
                            ? 'Line total before VAT'
                            : 'Line total'
                        }}</span>
                        <span class="sr-only">Actions</span>
                      </div>
                      @for (line of store.lines(); track line.key; let index = $index) {
                        <app-purchase-line-row
                          [line]="line"
                          [variant]="store.lineVariant(line)"
                          [label]="store.lineLabel(line)"
                          [priceContext]="store.linePriceContext(line)"
                          [priceBasis]="store.priceEntryBasis()"
                          [canEditPrices]="store.perms.has('ManageStockAdjustments')"
                          [trackExpiry]="store.preferences.batchExpiryEnabled()"
                          (quantityChange)="store.quantityChanged(line, $event)"
                          (unitCostChange)="store.unitCostChanged(line, $event)"
                          (lineTotalChange)="store.lineTotalChanged(line, $event)"
                          (detailChange)="store.updateLineDetail(line, $event.field, $event.value)"
                          (expandedChange)="store.setLineExpanded(line, $event)"
                          (remove)="store.removeLine(index)"
                        />
                      }
                    </div>
                  }

                  <app-purchase-expenses-panel
                    [viewModel]="store.expensesViewModel()"
                    [showWhenEmpty]="store.lines().length > 0"
                    (intent)="store.handleExpenseIntent($event)"
                  />
                </div>
              </section>
            </div>

            <aside class="card bg-base-100 lg:sticky lg:top-20 lg:col-span-3">
              <div class="card-body gap-3 p-4">
                <h2 class="section-title">Purchase summary</h2>
                <div class="flex justify-between text-sm">
                  <span>Items</span><strong>{{ store.lines().length }}</strong>
                </div>
                <div class="flex justify-between text-sm">
                  <span>{{
                    store.priceEntryBasis() === 'exclusive' ? 'Goods before VAT' : 'Goods'
                  }}</span
                  ><app-money
                    [amount]="
                      store.priceEntryBasis() === 'exclusive'
                        ? store.enteredGoodsSubtotal()
                        : store.goodsSubtotal()
                    "
                  />
                </div>
                @if (store.supplierExpenseTotal() > 0) {
                  <div class="flex justify-between text-sm">
                    <span>{{
                      store.priceEntryBasis() === 'exclusive'
                        ? 'Additional costs before VAT'
                        : 'Additional costs'
                    }}</span
                    ><app-money
                      [amount]="
                        store.priceEntryBasis() === 'exclusive'
                          ? store.enteredSupplierExpenseTotal()
                          : store.supplierExpenseTotal()
                      "
                    />
                  </div>
                }
                @if (store.priceEntryBasis() === 'exclusive') {
                  <div class="flex justify-between text-sm">
                    <span>VAT on supplier invoice</span
                    ><app-money [amount]="store.invoiceTaxTotal()" />
                  </div>
                }
                <div class="flex justify-between border-t border-base-300 pt-3">
                  <strong>Invoice total</strong
                  ><strong><app-money [amount]="store.invoiceTotal()" /></strong>
                </div>
                @if (store.claimInputVat.value && store.invoiceTaxTotal() > 0) {
                  <div class="flex justify-between text-sm">
                    <span>Net cost</span><app-money [amount]="store.invoiceNetTotal()" />
                  </div>
                  <div class="flex justify-between text-sm text-success">
                    <span>Input VAT</span><app-money [amount]="store.invoiceTaxTotal()" />
                  </div>
                } @else if (
                  store.priceEntryBasis() === 'exclusive' && store.invoiceTaxTotal() > 0
                ) {
                  <p class="type-caption">VAT will be included in inventory and expense cost.</p>
                }
                @if (store.separateExpenseTotal() > 0) {
                  <div class="flex justify-between text-sm">
                    <span>Paid separately</span
                    ><app-money [amount]="store.separateExpenseTotal()" />
                  </div>
                }
                <button
                  appButton
                  type="button"
                  class="mt-2 w-full"
                  (click)="store.goToReview()"
                  [disabled]="store.lines().length === 0"
                >
                  Review purchase
                </button>
                <button
                  appButton
                  variant="outline"
                  type="button"
                  class="w-full"
                  [loading]="store.savingDraft()"
                  (click)="saveDraft()"
                >
                  Save draft
                </button>
                <a appButton variant="ghost" routerLink="/purchases" (click)="store.allowExit()"
                  >Cancel</a
                >
              </div>
            </aside>
          </div>
        } @else {
          <app-purchase-payment-review
            [state]="store.paymentReviewState()"
            [paymentModeControl]="store.paymentMode"
            [partialAmountControl]="store.partialAmount"
            [advanceAmountControl]="store.advanceAmount"
            [accountControl]="store.account"
            (editPurchase)="store.editPurchase()"
            (paymentModeChange)="store.setPaymentMode($event)"
            (markDirty)="store.markDirty()"
            (useSuggestedAdvance)="store.useSuggestedAdvance()"
            (confirmPurchase)="confirmPurchase()"
            (saveDraft)="saveDraft()"
          />
        }

        @if (store.stage() === 'build') {
          <div
            class="fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
          >
            <div class="mx-auto flex max-w-lg items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="type-caption">{{ store.lines().length }} item(s)</p>
                <p class="font-semibold"><app-money [amount]="store.invoiceTotal()" /></p>
              </div>
              <button
                appButton
                type="button"
                (click)="store.goToReview()"
                [disabled]="store.lines().length === 0"
              >
                Review
              </button>
            </div>
          </div>
        }
      }
    </app-page>
  `,
})
export class PurchaseEditorComponent implements OnInit, OnDestroy {
  protected readonly store = inject(PurchaseEditorStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private uiRequestTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const request = this.store.uiRequest();
      if (!request) return;
      this.scheduleUiRequest(request);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.store.initialize({
      draftId: this.route.snapshot.paramMap.get('id'),
      supplierId: this.route.snapshot.queryParamMap.get('supplier'),
    });
  }

  ngOnDestroy(): void {
    if (this.uiRequestTimer) clearTimeout(this.uiRequestTimer);
  }

  canDeactivate(): boolean {
    return (
      this.store.canExitWithoutConfirmation() || window.confirm('Discard unsaved purchase changes?')
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    this.store.beforeUnload(event);
  }

  protected async saveDraft(): Promise<void> {
    const draftId = await this.store.saveDraft();
    if (draftId) {
      await this.router.navigate(['/purchases/drafts', draftId], { replaceUrl: true });
    }
  }

  protected async confirmPurchase(): Promise<void> {
    const result = await this.store.confirmPurchase();
    if (result) {
      await this.router.navigate(['/purchases'], {
        state: { purchaseRecorded: true, purchaseId: result.purchaseId },
      });
    }
  }

  /** Rendering concerns stay in the page adapter; the draft store only requests intent. */
  private scheduleUiRequest(request: PurchaseEditorUiRequest): void {
    if (this.uiRequestTimer) clearTimeout(this.uiRequestTimer);
    this.uiRequestTimer = setTimeout(() => {
      this.uiRequestTimer = null;
      if (request.kind === 'scroll-top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (request.kind === 'focus') {
        document.querySelector<HTMLElement>(request.selector)?.focus();
        return;
      }
      if (request.kind === 'focus-line') {
        const quantity = document.querySelector<HTMLElement>(
          `[data-line-key="${request.lineKey}"] [data-quantity]`
        );
        quantity?.scrollIntoView({ block: 'center' });
        quantity?.focus({ preventScroll: true });
        return;
      }
      const message = document.querySelector<HTMLElement>(
        '[data-line-key] .text-error, [data-expense-key] .text-error'
      );
      const row = message?.closest<HTMLElement>('[data-line-key], [data-expense-key]');
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row?.querySelector<HTMLElement>('input, select, button')?.focus();
    });
  }
}

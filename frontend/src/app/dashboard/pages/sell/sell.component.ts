import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { GET_PRODUCTS } from '../../../core/graphql/operations.graphql';
import { ApolloService } from '../../../core/services/apollo.service';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';
import { CashierSessionService } from '../../../core/services/cashier-session/cashier-session.service';
import { CompanyService } from '../../../core/services/company.service';
import { CurrencyService } from '../../../core/services/currency.service';
import { CustomerService } from '../../../core/services/customer.service';
import { OrderService } from '../../../core/services/order.service';
import { OrdersService } from '../../../core/services/orders.service';
import { PrintPreferencesService } from '../../../core/services/print-preferences.service';
import { PrintService } from '../../../core/services/print.service';
import {
  ProductSearchResult,
  ProductSearchService,
  ProductVariant,
} from '../../../core/services/product/product-search.service';
import { StockLocationService } from '../../../core/services/stock-location.service';
import { ProductLabelComponent } from '../shared/components/product-label.component';
import { CartComponent, CartItem } from './components/cart.component';
import { CheckoutFabComponent } from './components/checkout-fab.component';
import { CheckoutModalComponent } from './components/checkout-modal.component';
import { Customer } from './components/customer-selector.component';
import { ProductConfirmModalComponent } from './components/product-confirm-modal.component';
import { ProductScannerComponent } from './components/product-scanner.component';
import { SearchViewComponent } from './components/search-view.component';

type CheckoutType = 'credit' | 'cashier' | 'cash' | null;
type PaymentMethodCode = string;

/**
 * Main POS sell page - orchestrates child components
 *
 * DETECTION FLOW:
 * 1. Product detected (barcode or ML) → handleProductDetected()
 * 2. Shows confirmation modal with variant selection
 * 3. User selects variant/quantity → handleVariantSelected()
 * 4. Item added to cart with visual feedback (FAB pulse)
 * 5. User proceeds to checkout via cart modal
 *
 * STATE MANAGEMENT:
 * - Search: searchResults, isSearching
 * - Scanner: isScannerActive, canStartScanner
 * - Detection: detectedProduct, showConfirmModal
 * - Cart: cartItems, cartTotal, showCartModal, cartItemAdded
 * - Checkout: checkoutType, isProcessingCheckout, selectedCustomer
 */
@Component({
  selector: 'app-sell',
  imports: [
    CommonModule,
    RouterModule,
    ProductLabelComponent,
    ProductScannerComponent,
    SearchViewComponent,
    ProductConfirmModalComponent,
    CartComponent,
    CheckoutFabComponent,
    CheckoutModalComponent,
  ],
  templateUrl: './sell.component.html',
  styleUrl: './sell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellComponent implements OnInit, OnDestroy {
  private readonly productSearchService = inject(ProductSearchService);
  private readonly companyService = inject(CompanyService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly orderService = inject(OrderService);
  private readonly ordersService = inject(OrdersService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly customerService = inject(CustomerService);
  protected readonly cashierSessionService = inject(CashierSessionService);
  private readonly apolloService = inject(ApolloService);
  private readonly currencyService = inject(CurrencyService);
  private readonly printService = inject(PrintService);
  private readonly printPreferences = inject(PrintPreferencesService);

  // Configuration
  readonly channelId = computed(() => this.companyService.activeCompanyId() || 'T_1');
  readonly cashierFlowEnabled = computed(() => this.stockLocationService.cashierFlowEnabled());
  readonly enablePrinter = computed(() => this.companyService.enablePrinter());

  // Search state
  readonly searchTerm = signal<string>('');
  readonly searchResults = signal<ProductSearchResult[]>([]);
  readonly isSearching = signal<boolean>(false);

  // Scanner state - simple flags for UI
  readonly isScannerActive = signal<boolean>(false);
  readonly canStartScanner = signal<boolean>(false);

  // View computed
  readonly isManualSearchActive = computed(() => this.searchTerm().length > 0);
  readonly shouldShowCamera = computed(() => !this.isManualSearchActive());

  // Scanner component reference (to call methods)
  scannerComponent?: ProductScannerComponent;

  // Product confirmation
  readonly detectedProduct = signal<ProductSearchResult | null>(null);
  readonly showConfirmModal = signal<boolean>(false);

  // Notifications
  readonly notificationMessage = signal<string | null>(null);
  readonly notificationType = signal<'success' | 'warning' | 'error'>('success');

  // Clear cart confirmation
  readonly showClearCartConfirm = signal<boolean>(false);
  readonly cartItemAdded = signal<boolean>(false); // Visual feedback flag

  // Cart state
  readonly cartItems = signal<CartItem[]>([]);
  readonly cartSubtotal = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.subtotal, 0),
  );
  readonly cartTax = computed(() => this.cartSubtotal() * 0.0);
  readonly cartTotal = computed(() => this.cartSubtotal() + this.cartTax());
  readonly canOverridePrices = computed(() => this.authService.hasOverridePricePermission());
  readonly cartItemCount = computed(() =>
    this.cartItems().reduce((sum, item) => sum + item.quantity, 0),
  );

  // Checkout state
  readonly showCheckoutModal = signal<boolean>(false);
  readonly checkoutType = signal<CheckoutType>(null);
  readonly isProcessingCheckout = signal<boolean>(false);
  readonly checkoutError = signal<string | null>(null);
  readonly successTrigger = signal<{ amount: number; method: string } | null>(null);

  // Customer state (for credit sales)
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly customerSearchResults = signal<Customer[]>([]);
  readonly isSearchingCustomers = signal<boolean>(false);

  // Customer state (for cash sales - optional)
  readonly selectedCustomerForCash = signal<Customer | null>(null);
  readonly customerSearchResultsForCash = signal<Customer[]>([]);
  readonly isSearchingCustomersForCash = signal<boolean>(false);

  // Payment method state (for cash sales)
  readonly selectedPaymentMethod = signal<PaymentMethodCode | null>(null);

  // Product list state (for quick selection)
  readonly recentProducts = signal<ProductSearchResult[]>([]);
  readonly isLoadingProducts = signal<boolean>(false);
  readonly isQuickSelectExpanded = signal<boolean>(false); // Default collapsed
  readonly isMobile = signal<boolean>(false);
  private resizeListener?: () => void;

  // Computed: Always expanded on desktop, use signal on mobile
  readonly shouldExpandQuickSelect = computed(() => {
    return !this.isMobile() || this.isQuickSelectExpanded();
  });

  async ngOnInit(): Promise<void> {
    this.checkMobile();
    this.resizeListener = () => this.checkMobile();
    window.addEventListener('resize', this.resizeListener);

    this.cartService.loadCartFromCache();
    this.cartItems.set(this.cartService.cartItems());

    const companyId = this.companyService.activeCompanyId();
    if (companyId) {
      const channelId = parseInt(companyId, 10);
      if (!isNaN(channelId)) {
        this.cashierSessionService.getCurrentSession(channelId).subscribe();
      }
    }

    await this.loadRecentProducts();
  }

  ngOnDestroy(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }
  }

  checkMobile(): void {
    this.isMobile.set(window.innerWidth < 768);
    // Auto-expand on desktop
    if (!this.isMobile()) {
      this.isQuickSelectExpanded.set(true);
    }
  }

  // Load recent products for quick selection
  async loadRecentProducts(): Promise<void> {
    this.isLoadingProducts.set(true);
    try {
      const client = this.apolloService.getClient();
      const result = await client.query<{
        products: {
          items: any[];
        };
      }>({
        query: GET_PRODUCTS,
        variables: {
          options: {
            take: 10,
            skip: 0,
          },
        },
        fetchPolicy: 'network-only',
      });

      const products = (result.data?.products?.items || []).map((product: any) => ({
        id: product.id,
        name: product.name,
        featuredAsset: product.featuredAsset
          ? { preview: product.featuredAsset.preview }
          : undefined,
        facetValues: (product.facetValues || []).map((fv: any) => ({
          name: fv.name,
          facetCode: fv.facet?.code,
          facet: fv.facet ? { code: fv.facet.code } : undefined,
        })),
        variants: product.variants.map((v: any) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          priceWithTax: v.priceWithTax?.value || v.priceWithTax || 0,
          stockLevel: v.stockOnHand > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
          productId: product.id,
          productName: product.name,
          trackInventory: v.trackInventory,
          customFields: v.customFields
            ? {
                wholesalePrice: v.customFields.wholesalePrice,
                allowFractionalQuantity: v.customFields.allowFractionalQuantity,
              }
            : undefined,
          featuredAsset: product.featuredAsset
            ? { preview: product.featuredAsset.preview }
            : undefined,
        })),
      }));

      this.recentProducts.set(products);
    } catch (error) {
      console.error('Failed to load recent products:', error);
      this.recentProducts.set([]);
    } finally {
      this.isLoadingProducts.set(false);
    }
  }

  // Product Search Handlers
  async handleSearchTermChange(term: string): Promise<void> {
    this.searchTerm.set(term);

    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.isSearching.set(true);
    try {
      const results = await this.productSearchService.searchProducts(trimmed);
      this.searchResults.set(results);
    } catch (error) {
      console.error('Search failed:', error);
      this.searchResults.set([]);
    } finally {
      this.isSearching.set(false);
    }
  }

  handleClearSearch(): void {
    this.searchTerm.set('');
    this.searchResults.set([]);
    // Camera will auto-mount via shouldShowCamera() computed
    // Restart scanner if it's ready but not currently scanning
    // This handles the case where user stopped scanner and wants to restart via camera button
    if (this.scannerComponent && !this.isScannerActive() && this.canStartScanner()) {
      this.scannerComponent.startScanner().catch((err) => {
        console.warn('[SellComponent] Failed to restart scanner:', err);
        // Non-fatal - scanner might not be ready yet, will retry on next interaction
      });
    }
  }

  handleProductSelected(product: ProductSearchResult): void {
    this.detectedProduct.set(product);
    this.showConfirmModal.set(true);
    this.handleClearSearch(); // Return to camera view
  }

  handleQuickAddProduct(product: ProductSearchResult): void {
    if (!product.variants || product.variants.length === 0) {
      this.showNotification('Product has no variants', 'error');
      return;
    }

    // Single variant: direct add to cart
    if (product.variants.length === 1) {
      const variant = product.variants[0];
      const facetValues = product.facetValues?.map((fv) => ({
        name: fv.name,
        facetCode: fv.facetCode,
        facet: fv.facetCode ? { code: fv.facetCode } : undefined,
      }));
      this.addToCart(variant, 1, { facetValues });
      this.showNotification(`${product.name} added to cart`, 'success');
    } else {
      // Multiple variants: show modal for selection
      this.handleProductSelected(product);
    }
  }

  formatPrice(priceInCents: number): string {
    return this.currencyService.format(priceInCents, true);
  }

  toggleQuickSelect(): void {
    this.isQuickSelectExpanded.set(!this.isQuickSelectExpanded());
  }

  // Scanner Handlers
  handleScannerReady(scanner: ProductScannerComponent): void {
    this.scannerComponent = scanner;
    this.canStartScanner.set(true);
  }

  handleScanningStateChange(isScanning: boolean): void {
    this.isScannerActive.set(isScanning);
  }

  handleScannerToggle(): void {
    this.scannerComponent?.toggleScanner();
  }

  handleProductDetected(product: ProductSearchResult): void {
    try {
      console.log('[SellComponent] handleProductDetected called with product:', product.name);
      this.detectedProduct.set(product);
      this.showConfirmModal.set(true);
      console.log(
        '[SellComponent] Modal state set - showConfirmModal:',
        this.showConfirmModal(),
        'detectedProduct:',
        this.detectedProduct(),
      );
    } catch (error) {
      console.error('[SellComponent] Error in handleProductDetected:', error);
      // Show error notification
      this.showNotification('Failed to process scanned product', 'error');
    }
  }

  // Product Confirmation Handlers
  handleVariantSelected(data: {
    variant: ProductVariant;
    quantity: number;
    priceOverride?: { variantId: string; customLinePrice?: number; reason?: string };
    facetValues?: { name: string; facetCode?: string; facet?: { code: string } }[];
  }): void {
    this.addToCart(data.variant, data.quantity, {
      priceOverride: data.priceOverride,
      facetValues: data.facetValues,
    });
  }

  handleConfirmModalClose(): void {
    console.log('[SellComponent] Modal closed, resetting state');
    this.showConfirmModal.set(false);
    this.detectedProduct.set(null);
    // Scanner should be ready to start again - the scanner component will handle restart
    // when user wants to scan again (via autoStartOnMobile or manual start)
  }

  // Notifications
  private showNotification(
    message: string,
    type: 'success' | 'warning' | 'error' = 'success',
    duration = 3000,
  ): void {
    this.notificationMessage.set(message);
    this.notificationType.set(type);
    setTimeout(() => this.notificationMessage.set(null), duration);
  }

  // Cart Management
  private addToCart(
    variant: ProductVariant,
    quantity: number,
    options?: {
      priceOverride?: { variantId: string; customLinePrice?: number; reason?: string };
      facetValues?: { name: string; facetCode?: string; facet?: { code: string } }[];
    },
  ): void {
    // Use CartService for persistence
    this.cartService.addItemLocal(variant, quantity, options?.facetValues);

    // Update local state
    const items = this.cartService.cartItems();
    this.cartItems.set(items);

    // Apply price override if provided
    if (options?.priceOverride?.customLinePrice) {
      const item = items.find((i) => i.variant.id === variant.id);
      if (item) {
        item.customLinePrice = options.priceOverride!.customLinePrice;
        item.priceOverrideReason = options.priceOverride!.reason;
        item.subtotal = options.priceOverride!.customLinePrice; // Already in cents
        this.cartItems.set([...items]);
      }
    }

    this.showConfirmModal.set(false);
    this.detectedProduct.set(null);

    // Visual feedback: pulse the cart FAB
    this.cartItemAdded.set(true);
    setTimeout(() => this.cartItemAdded.set(false), 600);
  }

  handleCartQuantityChange(data: { variantId: string; quantity: number }): void {
    // Use CartService for persistence
    this.cartService.updateItemQuantityLocal(data.variantId, data.quantity);

    // Update local state
    this.cartItems.set(this.cartService.cartItems());
  }

  handleCartItemRemove(variantId: string): void {
    // Use CartService for persistence
    this.cartService.removeItemLocal(variantId);

    // Update local state
    this.cartItems.set(this.cartService.cartItems());
  }

  handleClearCart(): void {
    this.showClearCartConfirm.set(true);
  }

  handleConfirmClearCart(): void {
    // Use CartService for persistence
    this.cartService.clearCart();

    // Update local state
    this.cartItems.set(this.cartService.cartItems());
    this.showClearCartConfirm.set(false);
    this.showNotification('Cart cleared', 'success');
  }

  handleCancelClearCart(): void {
    this.showClearCartConfirm.set(false);
  }

  handlePriceOverrideChange(data: {
    variantId: string;
    customLinePrice?: number;
    reason?: string;
  }): void {
    const items = this.cartItems();
    const item = items.find((i) => i.variant.id === data.variantId);

    if (item) {
      if (data.customLinePrice && data.customLinePrice > 0) {
        item.customLinePrice = data.customLinePrice;
        item.priceOverrideReason = data.reason;
        item.subtotal = data.customLinePrice; // Already in cents
      } else {
        item.customLinePrice = undefined;
        item.priceOverrideReason = undefined;
        item.subtotal = item.quantity * item.variant.priceWithTax; // Already in cents
      }

      this.cartItems.set([...items]);
    }
  }

  handleProceedToCheckout(): void {
    this.checkoutType.set(null); // Show payment selection, don't pre-select
    this.showCheckoutModal.set(true);
  }

  // Checkout Handlers
  handleCheckoutCredit(): void {
    this.checkoutType.set('credit');
    this.showCheckoutModal.set(true);
    this.resetCheckoutState();
  }

  handleCheckoutCashier(): void {
    this.checkoutType.set('cashier');
    this.showCheckoutModal.set(true);
    this.resetCheckoutState();
  }

  handleCheckoutCash(): void {
    this.checkoutType.set('cash');
    this.showCheckoutModal.set(true);
    this.resetCheckoutState();
  }

  handleCheckoutModalClose(): void {
    this.showCheckoutModal.set(false);
    this.checkoutType.set(null);
    this.resetCheckoutState();
  }

  private resetCheckoutState(): void {
    this.checkoutError.set(null);
    this.selectedCustomer.set(null);
    this.selectedCustomerForCash.set(null);
    this.selectedPaymentMethod.set(null);
    this.customerSearchResults.set([]);
    this.customerSearchResultsForCash.set([]);
  }

  // Customer Handlers (Credit Sales)
  async handleCustomerSearch(term: string): Promise<void> {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.customerSearchResults.set([]);
      return;
    }

    this.isSearchingCustomers.set(true);
    this.checkoutError.set(null);
    try {
      const results = await this.customerService.searchCreditCustomers(trimmed);
      this.customerSearchResults.set(results);
      if (results.length === 0) {
        this.checkoutError.set('No approved credit customers found.');
      }
    } catch (error) {
      console.error('Customer search failed:', error);
      this.customerSearchResults.set([]);
      this.checkoutError.set('Customer search failed. Please try again.');
    } finally {
      this.isSearchingCustomers.set(false);
    }
  }

  async handleCustomerSelect(customer: Customer | null): Promise<void> {
    this.checkoutError.set(null);
    this.customerSearchResults.set([]);

    if (!customer) {
      this.selectedCustomer.set(null);
      return;
    }

    try {
      const { summary, error } = await this.customerService.validateCustomerCredit(
        customer.id,
        this.cartTotal(), // Pass cents
        customer,
      );
      this.selectedCustomer.set(summary);
      if (error) {
        this.checkoutError.set(error);
      }
    } catch (error) {
      console.error('Failed to validate customer credit:', error);
      this.checkoutError.set('Unable to validate customer credit. Please try again.');
      this.selectedCustomer.set(null);
    }
  }

  async handleCustomerCreate(data: { name: string; phone: string; email?: string }): Promise<void> {
    this.isProcessingCheckout.set(true);
    this.checkoutError.set(null);
    try {
      const customerId = await this.customerService.quickCreateCustomer(data);
      if (!customerId) {
        this.checkoutError.set('Failed to create customer. Please try again.');
        return;
      }

      const summary = await this.customerService.getCreditSummary(customerId, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        isCreditApproved: false,
        creditLimit: 0,
        outstandingAmount: 0,
        availableCredit: 0,
      });

      this.selectedCustomer.set(summary);
      this.checkoutError.set('Customer created. Await credit approval before completing the sale.');
    } catch (error) {
      console.error('Failed to create customer:', error);
      this.checkoutError.set('Failed to create customer. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  // Payment Method Handler (Cash Sales)
  handlePaymentMethodSelect(method: PaymentMethodCode): void {
    this.selectedPaymentMethod.set(method);
  }

  // Customer Handlers (Cash Sales - Optional)
  async handleCustomerSearchForCash(term: string): Promise<void> {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.customerSearchResultsForCash.set([]);
      return;
    }

    this.isSearchingCustomersForCash.set(true);
    this.checkoutError.set(null);
    try {
      // Search all customers (not just credit-approved) for cash sales
      const results = await this.customerService.searchCustomers(trimmed);
      this.customerSearchResultsForCash.set(
        results.map((c) => ({
          id: c.id,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer',
          phone: c.phoneNumber,
          email: c.emailAddress,
          isCreditApproved: c.customFields?.isCreditApproved ?? false,
          creditLimit: c.customFields?.creditLimit ?? 0,
          outstandingAmount: c.outstandingAmount ?? 0,
          availableCredit: 0, // Not relevant for cash sales
        })),
      );
    } catch (error) {
      console.error('Customer search failed:', error);
      this.customerSearchResultsForCash.set([]);
      this.checkoutError.set('Customer search failed. Please try again.');
    } finally {
      this.isSearchingCustomersForCash.set(false);
    }
  }

  handleCustomerSelectForCash(customer: Customer | null): void {
    this.checkoutError.set(null);
    this.customerSearchResultsForCash.set([]);
    this.selectedCustomerForCash.set(customer);
  }

  async handleCustomerCreateForCash(data: {
    name: string;
    phone: string;
    email?: string;
  }): Promise<void> {
    this.isProcessingCheckout.set(true);
    this.checkoutError.set(null);
    try {
      const customerId = await this.customerService.quickCreateCustomer(data);
      if (!customerId) {
        this.checkoutError.set('Failed to create customer. Please try again.');
        return;
      }

      // Get the created customer and select it
      const customer = await this.customerService.getCustomerById(customerId);
      if (customer) {
        this.selectedCustomerForCash.set({
          id: customer.id,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer',
          phone: customer.phoneNumber,
          email: customer.emailAddress,
          isCreditApproved: false,
          creditLimit: 0,
          outstandingAmount: 0,
          availableCredit: 0,
        });
      }
    } catch (error) {
      console.error('Failed to create customer:', error);
      this.checkoutError.set('Failed to create customer. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  // Complete Checkout Flows
  /**
   * Send to Cashier - Creates order with cash payment and approval metadata
   */
  async handleCompleteCashier(): Promise<void> {
    this.isProcessingCheckout.set(true);
    this.checkoutError.set(null);

    try {
      const order = await this.orderService.createOrder({
        cartItems: this.cartItems().map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
          customLinePrice: item.customLinePrice,
          priceOverrideReason: item.priceOverrideReason,
        })),
        paymentMethodCode: 'cash-payment',
        isCashierFlow: true,
        metadata: {
          requiresCashierApproval: true,
        },
      });

      console.log('✅ Order sent to cashier:', order.code);

      // Show success animation first, then close modal after delay
      this.showNotification(`Order ${order.code} sent to cashier`, 'success');

      // Delay closing modal to allow success animation to display (3 seconds - optimized timing)
      setTimeout(() => {
        // Clear cart using CartService for persistence
        this.cartService.clearCart();
        this.cartItems.set([]);
        this.showCheckoutModal.set(false);
      }, 3000);
    } catch (error) {
      console.error('❌ Cashier submission failed:', error);
      this.checkoutError.set('Failed to send to cashier. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  async handleCompleteCredit(): Promise<void> {
    await this.processCreditSale(false);
  }

  async handleCompleteCreditAndPrint(): Promise<void> {
    await this.processCreditSale(true);
  }

  private async processCreditSale(shouldPrint: boolean): Promise<void> {
    if (!this.selectedCustomer()) {
      this.checkoutError.set('Please select or create a customer');
      return;
    }

    const selected = this.selectedCustomer();
    if (!selected) {
      this.checkoutError.set('Please select or create a customer');
      return;
    }

    this.isProcessingCheckout.set(true);
    this.checkoutError.set(null);

    let validatedCustomer = selected;
    try {
      const validation = await this.customerService.validateCustomerCredit(
        selected.id,
        this.cartTotal(), // Pass cents
        selected,
      );
      validatedCustomer = validation.summary;
      this.selectedCustomer.set(validation.summary);

      if (validation.error) {
        this.checkoutError.set(validation.error);
        this.isProcessingCheckout.set(false);
        return;
      }
    } catch (error) {
      console.error('Credit validation failed:', error);
      this.checkoutError.set('Failed to validate credit before checkout.');
      this.isProcessingCheckout.set(false);
      return;
    }

    const customerName = validatedCustomer.name;

    try {
      const order = await this.orderService.createOrder({
        cartItems: this.cartItems().map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
          customLinePrice: item.customLinePrice,
          priceOverrideReason: item.priceOverrideReason,
        })),
        paymentMethodCode: 'credit-payment',
        customerId: validatedCustomer.id,
        isCreditSale: true,
        metadata: {
          creditSale: true,
          customerId: validatedCustomer.id,
          customerName,
        },
      });

      console.log('✅ Credit sale created:', order.code);

      // Refresh credit summary to show updated outstanding amount
      try {
        const updatedSummary = await this.customerService.getCreditSummary(validatedCustomer.id);
        this.selectedCustomer.set(updatedSummary);
        console.log('✅ Credit summary refreshed:', updatedSummary);
      } catch (error) {
        console.warn('⚠️ Failed to refresh credit summary:', error);
        // Continue even if refresh fails - order is still created
      }

      // Trigger success animation
      this.successTrigger.set({ amount: this.cartTotal(), method: 'Credit Sale' });

      // Show success animation first, then close modal after delay
      this.showNotification(
        `Credit sale created for ${customerName} - Order ${order.code}`,
        'success',
      );

      // Handle printing if requested
      if (shouldPrint) {
        try {
          // Fetch full order data for printing
          const fullOrder = await this.ordersService.fetchOrderById(order.id);
          if (fullOrder) {
            await this.printService.printOrder(
              fullOrder,
              this.printPreferences.getDefaultTemplateId(),
            );
          } else {
            this.showNotification('Order created but printing failed', 'warning');
          }
        } catch (printError) {
          console.error('Failed to print order:', printError);
          this.showNotification('Order created but printing failed', 'warning');
        }
      }

      // Delay closing modal to allow success animation to display (2 seconds)
      // Start timeout AFTER print completes (if printing) to ensure user can interact with print dialog
      setTimeout(() => {
        // Clear cart using CartService for persistence
        this.cartService.clearCart();
        this.cartItems.set([]);
        this.showCheckoutModal.set(false);
        this.successTrigger.set(null); // Reset trigger
      }, 2000);

      // Don't clear selected customer - keep it visible so user can see updated credit amounts
    } catch (error) {
      console.error('Credit sale failed:', error);
      this.checkoutError.set('Failed to create credit sale. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  async handleCompleteCash(): Promise<void> {
    await this.processCashSale(false);
  }

  async handleCompleteCashAndPrint(): Promise<void> {
    await this.processCashSale(true);
  }

  private async processCashSale(shouldPrint: boolean): Promise<void> {
    if (!this.selectedPaymentMethod()) {
      this.checkoutError.set('Please select a payment method');
      return;
    }

    this.isProcessingCheckout.set(true);
    this.checkoutError.set(null);

    const selectedCustomer = this.selectedCustomerForCash();

    try {
      const order = await this.orderService.createOrder({
        cartItems: this.cartItems().map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
          customLinePrice: item.customLinePrice,
          priceOverrideReason: item.priceOverrideReason,
        })),
        paymentMethodCode: this.selectedPaymentMethod()!,
        customerId: selectedCustomer?.id, // Include customer ID if selected
        metadata: {
          paymentMethod: this.selectedPaymentMethod(),
          ...(selectedCustomer && {
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
          }),
        },
      });

      console.log('✅ Order created:', order.code);

      // Trigger success animation
      // We don't have easy access to payment method name here, so just use the code
      const methodName = this.selectedPaymentMethod() || 'Cash';
      this.successTrigger.set({ amount: this.cartTotal(), method: methodName });

      // Show success animation first, then close modal after delay
      const customerMsg = selectedCustomer ? ` for ${selectedCustomer.name}` : '';
      this.showNotification(`Order ${order.code} created${customerMsg}`, 'success');

      // Handle printing if requested
      if (shouldPrint) {
        try {
          // Fetch full order data for printing
          const fullOrder = await this.ordersService.fetchOrderById(order.id);
          if (fullOrder) {
            await this.printService.printOrder(
              fullOrder,
              this.printPreferences.getDefaultTemplateId(),
            );
          } else {
            this.showNotification('Order created but printing failed', 'warning');
          }
        } catch (printError) {
          console.error('Failed to print order:', printError);
          this.showNotification('Order created but printing failed', 'warning');
        }
      }

      // Delay closing modal to allow success animation to display (2 seconds)
      // Start timeout AFTER print completes (if printing) to ensure user can interact with print dialog
      setTimeout(() => {
        // Clear cart using CartService for persistence
        this.cartService.clearCart();
        this.cartItems.set([]);
        this.showCheckoutModal.set(false);
        this.successTrigger.set(null); // Reset trigger
      }, 2000);
    } catch (error) {
      console.error('❌ Cash sale failed:', error);
      this.checkoutError.set('Failed to complete sale. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }
}

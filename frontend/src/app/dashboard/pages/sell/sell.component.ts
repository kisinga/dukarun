import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';
import { CustomerService } from '../../../core/services/customer.service';
import { CompanyService } from '../../../core/services/company.service';
import { OrderService } from '../../../core/services/order.service';
import {
  ProductSearchResult,
  ProductSearchService,
  ProductVariant,
} from '../../../core/services/product/product-search.service';
import { StockLocationService } from '../../../core/services/stock-location.service';
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
export class SellComponent implements OnInit {
  private readonly productSearchService = inject(ProductSearchService);
  private readonly companyService = inject(CompanyService);
  private readonly stockLocationService = inject(StockLocationService);
  private readonly orderService = inject(OrderService);
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly customerService = inject(CustomerService);

  // Configuration
  readonly channelId = computed(() => this.companyService.activeCompanyId() || 'T_1');
  readonly cashierFlowEnabled = this.stockLocationService.cashierFlowEnabled;

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

  async ngOnInit(): Promise<void> {
    // Load cart from cache on initialization
    this.cartService.loadCartFromCache();

    // Sync with cart service state
    this.cartItems.set(this.cartService.cartItems());
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
  }

  handleProductSelected(product: ProductSearchResult): void {
    this.detectedProduct.set(product);
    this.showConfirmModal.set(true);
    this.handleClearSearch(); // Return to camera view
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
    this.detectedProduct.set(product);
    this.showConfirmModal.set(true);
  }

  // Product Confirmation Handlers
  handleVariantSelected(data: {
    variant: ProductVariant;
    quantity: number;
    priceOverride?: { variantId: string; customLinePrice?: number; reason?: string };
  }): void {
    this.addToCart(data.variant, data.quantity, data.priceOverride);
  }

  handleConfirmModalClose(): void {
    this.showConfirmModal.set(false);
    this.detectedProduct.set(null);
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
    priceOverride?: { variantId: string; customLinePrice?: number; reason?: string },
  ): void {
    // Use CartService for persistence
    this.cartService.addItemLocal(variant, quantity);

    // Update local state
    const items = this.cartService.cartItems();
    this.cartItems.set(items);

    // Apply price override if provided
    if (priceOverride?.customLinePrice) {
      const item = items.find((i) => i.variant.id === variant.id);
      if (item) {
        item.customLinePrice = priceOverride.customLinePrice;
        item.priceOverrideReason = priceOverride.reason;
        item.subtotal = priceOverride.customLinePrice; // Already in cents
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
        this.cartTotal(),
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

      // Clear cart using CartService for persistence
      this.cartService.clearCart();
      this.cartItems.set([]);
      this.showCheckoutModal.set(false);
      this.showNotification(`Order ${order.code} sent to cashier`, 'success');
    } catch (error) {
      console.error('❌ Cashier submission failed:', error);
      this.checkoutError.set('Failed to send to cashier. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  async handleCompleteCredit(): Promise<void> {
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
        this.cartTotal(),
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

      // Clear cart using CartService for persistence
      this.cartService.clearCart();
      this.cartItems.set([]);
      this.showCheckoutModal.set(false);
      this.showNotification(
        `Credit sale created for ${customerName} - Order ${order.code}`,
        'success',
      );

      // Don't clear selected customer - keep it visible so user can see updated credit amounts
    } catch (error) {
      console.error('Credit sale failed:', error);
      this.checkoutError.set('Failed to create credit sale. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }

  async handleCompleteCash(): Promise<void> {
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

      // Clear cart using CartService for persistence
      this.cartService.clearCart();
      this.cartItems.set([]);
      this.showCheckoutModal.set(false);
      const customerMsg = selectedCustomer ? ` for ${selectedCustomer.name}` : '';
      this.showNotification(`Sale completed${customerMsg}! Order ${order.code}`, 'success');
    } catch (error) {
      console.error('❌ Cash sale failed:', error);
      this.checkoutError.set('Failed to complete sale. Please try again.');
    } finally {
      this.isProcessingCheckout.set(false);
    }
  }
}

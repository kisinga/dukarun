import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CustomerService } from '../../../../core/services/customer.service';
import { OrderService } from '../../../../core/services/order.service';
import { OrdersService } from '../../../../core/services/orders.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CustomerPaymentService } from '../../../../core/services/customer/customer-payment.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PaymentMethodService } from '../../../../core/services/payment-method.service';
import { OrderDetailHeaderComponent } from './components/order-detail-header.component';
import { OrderCustomerInfoComponent } from './components/order-customer-info.component';
import { OrderAddressComponent } from './components/order-address.component';
import { OrderItemsTableComponent } from './components/order-items-table.component';
import { OrderTotalsComponent } from './components/order-totals.component';
import { OrderPaymentInfoComponent } from './components/order-payment-info.component';
import { OrderFulfillmentInfoComponent } from './components/order-fulfillment-info.component';
import { PrintControlsComponent } from '../../../../core/components/print-controls/print-controls.component';
import { PayOrderModalComponent, PayOrderModalData } from '../components/pay-order-modal.component';

/**
 * Order Detail Component (Container)
 *
 * Orchestrates data fetching and composes presentational components.
 * Works in multiple contexts:
 * - Full-page mode: Standalone page with navigation
 * - Modal mode: Embedded in modal dialog
 * - Print mode: Optimized for printing
 *
 * Usage:
 * - As page: <app-order-detail></app-order-detail> (uses route params)
 * - As modal: <app-order-detail [orderId]="id" [modalMode]="true" (closed)="handleClose()"></app-order-detail>
 */
@Component({
  selector: 'app-order-detail',
  imports: [
    CommonModule,
    RouterModule,
    OrderDetailHeaderComponent,
    OrderCustomerInfoComponent,
    OrderAddressComponent,
    OrderItemsTableComponent,
    OrderTotalsComponent,
    OrderPaymentInfoComponent,
    OrderFulfillmentInfoComponent,
    PrintControlsComponent,
    PayOrderModalComponent,
  ],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent implements OnInit, AfterViewInit {
  private readonly ordersService = inject(OrdersService);
  private readonly orderService = inject(OrderService);
  private readonly customerService = inject(CustomerService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentService = inject(CustomerPaymentService);
  private readonly paymentMethodService = inject(PaymentMethodService);
  readonly currencyService = inject(CurrencyService);

  // Inputs for composable usage
  readonly orderId = input<string | null>(null);
  readonly modalMode = input<boolean>(false);
  readonly showHeader = input<boolean>(true);
  readonly showPrintControls = input<boolean>(true);

  // Outputs
  readonly closed = output<void>();

  // State
  readonly order = this.ordersService.currentOrder;
  readonly isLoading = this.ordersService.isLoading;
  readonly error = this.ordersService.error;
  readonly isPrintMode = signal(false);
  readonly modalId = signal<string>(
    `order-detail-modal-${Math.random().toString(36).substring(2, 9)}`,
  );
  private readonly modalElement = viewChild<ElementRef<HTMLDialogElement>>('modalDialog');

  // Draft order (proforma) - can print as proforma and complete to sale
  readonly isDraftOrder = computed(() => this.order()?.state === 'Draft');

  // Computed values for child components - allow print for all (Draft = proforma, others = receipt/invoice)
  readonly canPrint = computed(() => !!this.order());

  readonly subtotal = computed(() => {
    const order = this.order();
    if (!order) return 0;
    return order.total;
  });

  readonly tax = computed(() => {
    const order = this.order();
    if (!order) return 0;
    return order.totalWithTax - order.total;
  });

  readonly total = computed(() => {
    const order = this.order();
    if (!order) return 0;
    return order.totalWithTax;
  });

  readonly customerName = computed(() => {
    const order = this.order();
    if (!order?.customer) return 'Walk-in Customer';
    const firstName = order.customer.firstName || '';
    const lastName = order.customer.lastName || '';
    return `${firstName} ${lastName}`.trim() || 'Walk-in Customer';
  });

  readonly isWalkInCustomer = computed(() => {
    const order = this.order();
    if (!order?.customer) return true;
    const email = order.customer.emailAddress?.toLowerCase() || '';
    const firstName = order.customer.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  });

  readonly hasShipping = computed(() => {
    const order = this.order();
    if (!order?.fulfillments || order.fulfillments.length === 0) return false;
    return !this.isWalkInCustomer();
  });

  readonly isCreditOrder = computed(() => {
    const order = this.order();
    if (!order?.payments) return false;
    return order.payments.some(
      (p: { metadata?: { paymentType?: string } }) => p.metadata?.paymentType === 'credit',
    );
  });

  readonly isUnpaidCreditOrder = computed(() => {
    const order = this.order();
    if (!order || !this.isCreditOrder()) return false;

    const settledPayments = (order.payments || [])
      .filter((p: { state: string }) => p.state === 'Settled')
      .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

    const orderTotal = order.totalWithTax || order.total;
    return settledPayments < orderTotal;
  });

  readonly outstandingAmount = computed(() => {
    const order = this.order();
    if (!order) return 0;

    const settledPayments = (order.payments || [])
      .filter((p: { state: string }) => p.state === 'Settled')
      .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

    const orderTotal = order.totalWithTax || order.total;
    return Math.max(0, orderTotal - settledPayments); // Keep in cents for consistency
  });

  readonly orderReversedAt = computed(() => {
    const order = this.order();
    return (
      (order as { customFields?: { reversedAt?: string | null } } | undefined)?.customFields
        ?.reversedAt ?? null
    );
  });

  readonly showPayOrderButton = computed(() => {
    return this.isCreditOrder() && this.isUnpaidCreditOrder();
  });

  readonly canVoid = computed(() => {
    const order = this.order();
    if (!order) return false;
    const state = order.state;
    const reversedAt = (order as { customFields?: { reversedAt?: string | null } }).customFields
      ?.reversedAt;
    return state !== 'Draft' && state !== 'Cancelled' && reversedAt == null;
  });

  // Convert route query params to signal
  private readonly queryParams = toSignal(this.route.queryParams, { initialValue: {} });
  private readonly routeParams = toSignal(this.route.paramMap);

  constructor() {
    // Watch for orderId input changes (modal mode)
    effect(() => {
      const inputOrderId = this.orderId();
      if (inputOrderId) {
        this.ordersService.fetchOrderById(inputOrderId);
      }
    });

    // Check for print mode from query params (page mode only)
    effect(() => {
      if (this.modalMode()) return;
      const params = this.queryParams();
      const printParam = (params as Record<string, any>)['print'];
      this.isPrintMode.set(printParam === 'true' || printParam === true);
    });

    // Handle modal open/close (modal mode only)
    effect(() => {
      if (!this.modalMode()) return;
      const inputOrderId = this.orderId();
      const modal = this.modalElement()?.nativeElement;

      if (inputOrderId && modal) {
        // Use setTimeout to ensure modal is rendered
        setTimeout(() => {
          if (modal && !modal.open) {
            modal.showModal();
          }
        }, 0);
      } else if (!inputOrderId && modal) {
        modal.close();
      }
    });

    // Open Record Payment modal when data is set
    effect(() => {
      const data = this.payOrderModalData();
      const modal = this.payOrderModal();
      if (data && modal) {
        setTimeout(() => void modal.show(), 0);
      }
    });
  }

  ngOnInit(): void {
    // In page mode, get orderId from route
    if (!this.modalMode()) {
      const routeOrderId = this.routeParams()?.get('id');
      if (routeOrderId) {
        this.ordersService.fetchOrderById(routeOrderId);
      }
    }
    this.loadPaymentMethodsForDraft();
  }

  goBack(): void {
    if (this.modalMode()) {
      this.close();
    } else {
      this.router.navigate(['/dashboard/orders']);
    }
  }

  ngAfterViewInit(): void {
    // Ensure modal opens if orderId is already set
    if (this.modalMode() && this.orderId()) {
      const modal = this.modalElement()?.nativeElement;
      if (modal) {
        setTimeout(() => {
          if (modal && !modal.open) {
            modal.showModal();
          }
        }, 0);
      }
    }
  }

  close(): void {
    if (this.modalMode()) {
      const modal = this.modalElement()?.nativeElement;
      if (modal) {
        modal.close();
      }
      this.closed.emit();
    }
  }

  clearError(): void {
    this.ordersService.clearError();
  }

  readonly payOrderModalData = signal<PayOrderModalData | null>(null);
  private readonly payOrderModal = viewChild(PayOrderModalComponent);
  readonly isProcessingPayment = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paymentSuccess = signal<string | null>(null);

  // Draft → Sale: payment methods and completion
  readonly paymentMethods = signal<{ id: string; code: string; name: string }[]>([]);
  readonly selectedCompletePaymentCode = signal<string | null>(null);
  readonly isCompletingDraft = signal(false);
  readonly completeDraftError = signal<string | null>(null);
  readonly isDeletingDraft = signal(false);
  readonly isVoiding = signal(false);

  private async loadPaymentMethodsForDraft(): Promise<void> {
    try {
      const methods = await this.paymentMethodService.getPaymentMethods();
      this.paymentMethods.set(
        methods.filter((m) => m.enabled).map((m) => ({ id: m.id, code: m.code, name: m.name })),
      );
    } catch {
      this.paymentMethods.set([]);
    }
  }

  async handleCompleteDraftToSale(): Promise<void> {
    const order = this.order();
    const code = this.selectedCompletePaymentCode();
    if (!order || !code) return;

    this.isCompletingDraft.set(true);
    this.completeDraftError.set(null);

    try {
      await this.orderService.completeDraftToSale(order.id, code);
      this.paymentSuccess.set('Order completed. Payment recorded.');
      await this.ordersService.fetchOrderById(order.id);
      setTimeout(() => this.paymentSuccess.set(null), 3000);
    } catch (error: any) {
      this.completeDraftError.set(error?.message || 'Failed to complete order');
    } finally {
      this.isCompletingDraft.set(false);
    }
  }

  async handleDeleteDraft(): Promise<void> {
    const order = this.order();
    if (!order || !this.isDraftOrder()) return;
    if (!confirm('Delete this draft order? This cannot be undone.')) return;

    this.isDeletingDraft.set(true);
    try {
      await this.orderService.deleteDraftOrder(order.id);
      this.toastService.show('Draft deleted', 'The draft order has been deleted.', 'success');
      this.router.navigate(['/dashboard/orders']);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete draft order';
      this.toastService.show('Delete failed', message, 'error');
    } finally {
      this.isDeletingDraft.set(false);
    }
  }

  async handlePayOrder(): Promise<void> {
    const order = this.order();
    if (!order || !this.isUnpaidCreditOrder() || !order.customer) return;

    this.isProcessingPayment.set(true);
    const customerName =
      `${order.customer.firstName ?? ''} ${order.customer.lastName ?? ''}`.trim() || 'Customer';
    const status = await this.ordersService.getOrderPaymentStatus(order.id);
    const outstanding =
      status != null && status.amountOwing >= 0 ? status.amountOwing : this.outstandingAmount();
    this.payOrderModalData.set({
      customerId: order.customer.id,
      customerName,
      outstandingAmount: outstanding,
      totalAmount: order.totalWithTax ?? order.total ?? 0,
      orderId: order.id,
      orderCode: order.code ?? '',
    });
    this.isProcessingPayment.set(false);
  }

  async onPayOrderRecorded(): Promise<void> {
    const order = this.order();
    this.payOrderModalData.set(null);
    this.isProcessingPayment.set(false);
    this.paymentError.set(null);
    if (order) {
      await this.ordersService.fetchOrderById(order.id);
      this.paymentSuccess.set('Payment recorded.');
      setTimeout(() => this.paymentSuccess.set(null), 3000);
    }
    this.customerService
      .fetchCustomers({ take: 100, skip: 0 }, { fetchPolicy: 'network-only' })
      .catch(() => {});
  }

  onPayOrderModalCancelled(): void {
    this.payOrderModalData.set(null);
    this.isProcessingPayment.set(false);
  }

  async handleVoidOrder(): Promise<void> {
    const order = this.order();
    if (!order || !this.canVoid()) return;
    if (
      !confirm(
        'Void this order? Stock will be restored, ledger reversed, payments cancelled, and order marked as Cancelled.',
      )
    ) {
      return;
    }
    this.isVoiding.set(true);
    this.ordersService.clearError();
    try {
      await this.orderService.voidOrder(order.id);
      this.toastService.show('Order voided', 'The order has been voided successfully.', 'success');
      await this.ordersService.fetchOrderById(order.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to void order';
      this.toastService.show('Void failed', message, 'error');
    } finally {
      this.isVoiding.set(false);
    }
  }
}

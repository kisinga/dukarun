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
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { OrdersService } from '../../../../core/services/orders.service';
import { PrintService } from '../../../../core/services/print.service';
import { CustomerPaymentService } from '../../../../core/services/customer/customer-payment.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { OrderDetailHeaderComponent } from './components/order-detail-header.component';
import { OrderCustomerInfoComponent } from './components/order-customer-info.component';
import { OrderAddressComponent } from './components/order-address.component';
import { OrderItemsTableComponent } from './components/order-items-table.component';
import { OrderTotalsComponent } from './components/order-totals.component';
import { OrderPaymentInfoComponent } from './components/order-payment-info.component';
import { OrderFulfillmentInfoComponent } from './components/order-fulfillment-info.component';

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
    OrderDetailHeaderComponent,
    OrderCustomerInfoComponent,
    OrderAddressComponent,
    OrderItemsTableComponent,
    OrderTotalsComponent,
    OrderPaymentInfoComponent,
    OrderFulfillmentInfoComponent,
  ],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent implements OnInit, AfterViewInit {
  private readonly ordersService = inject(OrdersService);
  private readonly printService = inject(PrintService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentService = inject(CustomerPaymentService);
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
  readonly selectedTemplate = signal<string>('receipt-52mm');
  readonly isPrintMode = signal(false);
  readonly modalId = signal<string>(
    `order-detail-modal-${Math.random().toString(36).substring(2, 9)}`,
  );
  private readonly modalElement = viewChild<ElementRef<HTMLDialogElement>>('modalDialog');

  // Available templates
  readonly templates = this.printService.getAvailableTemplates();

  // Computed values for child components
  readonly canPrint = computed(() => {
    const order = this.order();
    if (!order) return false;
    return order.state !== 'Draft';
  });

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

  readonly showPayOrderButton = computed(() => {
    return this.isCreditOrder() && this.isUnpaidCreditOrder();
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

    // Auto-print if in print mode (page mode only)
    effect(() => {
      if (this.modalMode()) return;
      const order = this.order();
      const isPrint = this.isPrintMode();
      if (order && isPrint) {
        setTimeout(() => {
          this.handlePrint();
        }, 500);
      }
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
  }

  ngOnInit(): void {
    // In page mode, get orderId from route
    if (!this.modalMode()) {
      const routeOrderId = this.routeParams()?.get('id');
      if (routeOrderId) {
        this.ordersService.fetchOrderById(routeOrderId);
      }
    }
  }

  async handlePrint(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const templateId = this.selectedTemplate();
    await this.printService.printOrder(order as any, templateId);
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

  readonly isProcessingPayment = signal(false);
  readonly paymentError = signal<string | null>(null);
  readonly paymentSuccess = signal<string | null>(null);

  async handlePayOrder(): Promise<void> {
    const order = this.order();
    if (!order || !this.isUnpaidCreditOrder()) return;

    this.isProcessingPayment.set(true);
    this.paymentError.set(null);
    this.paymentSuccess.set(null);

    try {
      const result = await this.paymentService.paySingleOrder(
        order.id,
        this.outstandingAmount() / 100, // Convert cents to shillings for backend
      );

      if (result) {
        this.paymentSuccess.set(
          `Payment recorded: ${result.totalAllocated > 0 ? this.currencyService.format(result.totalAllocated * 100) : 'Payment recorded'}`,
        );
        // Refresh order data
        await this.ordersService.fetchOrderById(order.id);
        // Clear success message after 3 seconds
        setTimeout(() => this.paymentSuccess.set(null), 3000);
      } else {
        this.paymentError.set('Failed to process payment. Please try again.');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      this.paymentError.set(error.message || 'Failed to process payment');
    } finally {
      this.isProcessingPayment.set(false);
    }
  }
}

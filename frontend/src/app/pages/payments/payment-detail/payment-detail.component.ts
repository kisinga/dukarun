import { CommonModule } from '@angular/common';
import { NgIcon } from '@ng-icons/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HoverPreviewHostComponent } from '../../../shared/components/dashboard/hover-preview-host/hover-preview-host.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyService } from '../../../shared/services/currency.service';
import { PaymentsService } from '@dukarun/payments';
import { toDisplayDate } from '../../../shared/utils/date.util';
import { PaymentStateBadgeComponent } from '../components/payment-state-badge.component';
import { PageHeaderComponent } from '../../../shared/components/dashboard/page-header.component';

/**
 * Payment Detail Component
 *
 * Shows payment details with order context
 */
@Component({
  selector: 'app-payment-detail',
  imports: [
    CommonModule,
    RouterLink,
    HoverPreviewHostComponent,
    PaymentStateBadgeComponent,
    PageHeaderComponent,
    NgIcon,
  ],
  templateUrl: './payment-detail.component.html',
  styleUrl: './payment-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentDetailComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly currencyService = inject(CurrencyService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // State
  readonly payment = this.paymentsService.currentPayment;
  readonly order = this.paymentsService.currentOrder;
  readonly isLoading = this.paymentsService.isLoading;
  readonly error = this.paymentsService.error;

  // Convert route params to signal
  private readonly routeParams = toSignal(this.route.paramMap);

  // Computed values
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

  readonly hasRefunds = computed(() => {
    const payment = this.payment();
    const order = this.order();
    if (!payment || !order) return false;
    const paymentData = order.payments?.find((p: any) => p.id === payment.id);
    return paymentData?.refunds && paymentData.refunds.length > 0;
  });

  readonly refunds = computed(() => {
    const payment = this.payment();
    const order = this.order();
    if (!payment || !order) return [];
    const paymentData = order.payments?.find((p: any) => p.id === payment.id);
    return paymentData?.refunds || [];
  });

  ngOnInit(): void {
    const paymentId = this.routeParams()?.get('id');
    if (paymentId) {
      this.paymentsService.fetchPaymentById(paymentId);
    }
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount, false);
  }

  formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    return toDisplayDate(dateString, 'medium');
  }

  goBack(): void {
    this.router.navigate(['/dashboard/payments']);
  }

  goToOrder(): void {
    const order = this.order();
    if (order) {
      this.router.navigate(['/dashboard/orders', order.id]);
    }
  }

  clearError(): void {
    this.paymentsService.clearError();
  }

  formatMetadata(metadata: any): string {
    return JSON.stringify(metadata, null, 2);
  }
}

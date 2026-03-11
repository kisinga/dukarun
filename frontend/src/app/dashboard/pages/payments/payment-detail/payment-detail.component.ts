import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CurrencyService } from '../../../../core/services/currency.service';
import { PaymentsService } from '../../../../core/services/payments.service';
import { PaymentStateBadgeComponent } from '../components/payment-state-badge.component';

/**
 * Payment Detail Component
 *
 * Shows payment details with order context
 */
@Component({
  selector: 'app-payment-detail',
  imports: [CommonModule, RouterLink, PaymentStateBadgeComponent],
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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

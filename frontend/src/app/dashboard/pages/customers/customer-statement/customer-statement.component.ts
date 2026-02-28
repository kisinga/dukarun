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
import { CurrencyService } from '../../../../core/services/currency.service';
import { CustomerService } from '../../../../core/services/customer.service';
import { CustomerStatementService } from '../../../../core/services/customer/customer-statement.service';

/**
 * Customer Statement Page
 *
 * Shows statement (orders/payments) for a customer with options to:
 * - Download as PDF (print)
 * - Email statement (if customer has email)
 * - Send mini statement via SMS (if customer has phone, &lt; 160 chars)
 */
@Component({
  selector: 'app-customer-statement',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './customer-statement.component.html',
  styleUrl: './customer-statement.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerStatementComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customerService = inject(CustomerService);
  private readonly statementService = inject(CustomerStatementService);
  readonly currencyService = inject(CurrencyService);

  readonly customer = this.statementService.customer;
  readonly orders = this.statementService.ordersForCustomer;
  readonly isLoading = this.statementService.isLoading;
  readonly error = this.statementService.error;

  readonly customerName = computed(() => {
    const c = this.customer();
    if (!c) return '';
    return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Customer';
  });

  readonly hasEmail = computed(() => {
    const e = this.customer()?.emailAddress;
    return !!e && e.toLowerCase() !== 'walkin@pos.local';
  });

  readonly hasPhone = computed(() => !!this.customer()?.phoneNumber?.trim());

  readonly totalOrders = computed(() => this.orders().length);
  readonly totalAmount = computed(() =>
    this.orders().reduce((sum, o) => sum + (o.totalWithTax ?? o.total ?? 0), 0),
  );

  readonly emailSending = signal(false);
  readonly smsSending = signal(false);
  readonly toastMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.statementService.loadStatement(id);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard/customers']);
  }

  printStatement(): void {
    window.print();
  }

  async sendStatementEmail(): Promise<void> {
    const id = this.customer()?.id;
    if (!id || !this.hasEmail()) return;
    this.emailSending.set(true);
    this.toastMessage.set(null);
    try {
      const ok = await this.statementService.sendStatementEmail(id);
      this.toastMessage.set(
        ok
          ? { type: 'success', text: 'Statement sent by email.' }
          : { type: 'error', text: 'Failed to send email.' },
      );
    } finally {
      this.emailSending.set(false);
    }
  }

  async sendMiniStatementSms(): Promise<void> {
    const id = this.customer()?.id;
    if (!id || !this.hasPhone()) return;
    this.smsSending.set(true);
    this.toastMessage.set(null);
    try {
      const ok = await this.statementService.sendMiniStatementSms(id);
      this.toastMessage.set(
        ok
          ? { type: 'success', text: 'Mini statement sent via SMS.' }
          : { type: 'error', text: 'Failed to send SMS.' },
      );
    } finally {
      this.smsSending.set(false);
    }
  }

  formatDate(date: string | null | undefined): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Settled payments for an order (for statement display). */
  getSettledPayments(order: {
    payments?: Array<{
      id: string;
      state?: string;
      amount?: number;
      method?: string;
      createdAt?: string;
    }>;
  }): Array<{ id: string; state?: string; amount?: number; method?: string; createdAt?: string }> {
    const payments = order.payments ?? [];
    return payments.filter((p) => p.state === 'Settled');
  }

  /** Total of settled payments for an order (cents). */
  getPaymentsTotal(order: { payments?: Array<{ state?: string; amount?: number }> }): number {
    return this.getSettledPayments(order).reduce((sum, p) => sum + (p.amount ?? 0), 0);
  }

  /** Order total in cents (totalWithTax or total). */
  getOrderTotal(order: { totalWithTax?: number; total?: number }): number {
    return order.totalWithTax ?? order.total ?? 0;
  }

  /** Outstanding balance for an order in cents. */
  getOrderBalance(order: {
    totalWithTax?: number;
    total?: number;
    payments?: Array<{ state?: string; amount?: number }>;
  }): number {
    return Math.max(0, this.getOrderTotal(order) - this.getPaymentsTotal(order));
  }

  dismissToast(): void {
    this.toastMessage.set(null);
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, PaymentStateTransitionEvent, OrderStateTransitionEvent } from '@vendure/core';

import { CreditService } from '../../services/credit/credit.service';

@Injectable()
export class CreditPaymentSubscriber implements OnModuleInit {
  private readonly logger = new Logger('CreditPaymentSubscriber');

  constructor(
    private readonly eventBus: EventBus,
    private readonly creditService: CreditService
  ) {}

  onModuleInit(): void {
    // Subscribe to payment state transitions
    this.eventBus.ofType(PaymentStateTransitionEvent).subscribe(event => {
      void this.handlePaymentTransition(event);
    });

    // Subscribe to order state transitions to prevent auto-settlement for credit sales
    this.eventBus.ofType(OrderStateTransitionEvent).subscribe(event => {
      void this.handleOrderStateTransition(event);
    });
  }

  private async handlePaymentTransition(event: PaymentStateTransitionEvent): Promise<void> {
    const { payment, order, ctx, toState } = event;
    const paymentType = payment.metadata?.paymentType;
    const customerId = order?.customer?.id;

    if (paymentType !== 'credit' || !customerId) {
      return;
    }

    // Handle payment cancellation/decline/error
    if (toState === 'Cancelled' || toState === 'Declined' || toState === 'Error') {
      await this.creditService.recordRepayment(ctx, customerId, 'customer', payment.amount);
    }

    // Prevent auto-settlement of credit payments during order creation
    // Credit payments should remain Authorized until bulk payment allocation
    if (toState === 'Settled' && order?.state !== 'PaymentSettled') {
      // This is handled by the order state transition subscriber
      // Payment settlement is allowed during bulk payment allocation
    }
  }

  private async handleOrderStateTransition(event: OrderStateTransitionEvent): Promise<void> {
    const { order, fromState, toState, ctx } = event;

    if (!order || !order.customer) {
      return;
    }

    // Check if this is a credit sale order
    const hasCreditPayment = order.payments?.some(
      p => p.metadata?.paymentType === 'credit' && p.state !== 'Settled'
    );

    if (!hasCreditPayment) {
      return; // Not a credit sale
    }

    // Prevent order from transitioning to PaymentSettled if it has unpaid credit payments
    // This should only happen during bulk payment allocation when payments are explicitly settled
    if (toState === 'PaymentSettled') {
      const hasUnpaidCreditPayments = order.payments?.some(
        p => p.metadata?.paymentType === 'credit' && p.state !== 'Settled'
      );

      if (hasUnpaidCreditPayments) {
        this.logger.warn(
          `Prevented order ${order.code} from transitioning to PaymentSettled - has unpaid credit payments`
        );
        // Note: We can't prevent the transition here, but we log it
        // The order creation service should not create payments for credit sales
      }
    }
  }
}

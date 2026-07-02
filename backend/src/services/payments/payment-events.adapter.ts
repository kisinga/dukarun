import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { EventBus, PaymentState, PaymentStateTransitionEvent, RequestContext } from '@vendure/core';
import { FinancialService } from '../financial/financial.service';

/**
 * PaymentEventsAdapter - Safety Net
 *
 * This adapter serves as a safety net to catch any payments that weren't posted
 * synchronously in the transaction. In normal operation, FinancialService.recordPayment()
 * should be called synchronously, making this adapter unnecessary.
 *
 * This is kept for backward compatibility and as a failsafe.
 */
@Injectable()
export class PaymentEventsAdapter implements OnModuleInit {
  private readonly logger = new Logger('PaymentEventsAdapter');
  constructor(
    private readonly eventBus: EventBus,
    @Optional() private readonly financialService?: FinancialService
  ) {}

  onModuleInit(): any {
    this.eventBus.ofType(PaymentStateTransitionEvent).subscribe(async event => {
      try {
        const ctx = event.ctx as RequestContext;
        const payment = event.payment;
        const order = event.order;
        const toState = event.toState as PaymentState;

        if (toState === 'Settled' && this.financialService) {
          // This safety net only backstops CASH-SALE postings (Debit cash / Credit Sales).
          // Allocation payments are never cash sales: a credit repayment or a cashier
          // settlement posts a PaymentAllocation entry (Debit cash / Credit AR) synchronously
          // in the same transaction that settles the payment. Re-posting them here as a cash sale
          // would double-count cash AND book phantom revenue, because the ledger's idempotency key is
          // (sourceType, sourceId) and the 'PaymentAllocation' entry never collides with the 'Payment'
          // entry this path writes for the same payment id. Skip them — they are already posted.
          const paymentType = payment.metadata?.paymentType;
          if (paymentType === 'credit' || paymentType === 'cashier-settlement') {
            this.logger.debug(
              `Skipping safety-net posting for allocation payment ${payment.id} (type: ${paymentType}): ` +
                `posted synchronously as CreditSale/PaymentAllocation, not a cash sale.`
            );
            return;
          }

          // Safety net: Post payment if not already posted synchronously
          // This should rarely be needed if FinancialService.recordPayment() is called in transactions
          try {
            await this.financialService.recordPayment(ctx, payment, order);
            this.logger.debug(`Posted payment ${payment.id} via event adapter (safety net)`);
          } catch (error) {
            // If posting fails due to idempotency (already posted), that's fine
            if (error instanceof Error && error.message.includes('already exists')) {
              this.logger.debug(`Payment ${payment.id} already posted synchronously`);
            } else {
              throw error;
            }
          }
        }
        // Refunds are represented by Refund entities in Vendure; handle via a dedicated adapter later.
      } catch (e) {
        this.logger.error(`Posting for payment event failed: ${(e as Error).message}`);
      }
    });
  }
}

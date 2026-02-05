import {
  CreatePaymentResult,
  LanguageCode,
  PaymentMethodHandler,
  SettlePaymentResult,
  UserInputError,
} from '@vendure/core';
import { PAYMENT_METHOD_CODES } from './payment-method-codes.constants';
import { CreditService } from '../credit/credit.service';

/**
 * Payment amount contract (single source of truth):
 * - If metadata.allocatedAmount is present and valid (number, > 0, <= order.total), use it (enables partial payments).
 * - Otherwise use order.total.
 * - We do NOT use the amount parameter passed by Vendure to createPayment; callers must set metadata.allocatedAmount when they want a specific amount.
 * - Validation of allocatedAmount vs outstanding is done by the caller (e.g. paySingleOrder, allocation loop) before calling addManualPaymentToOrder.
 */

/**
 * Cash Payment Handler
 *
 * Immediately settles payment as cash transactions are instant.
 * No external API integration required.
 */
export const cashPaymentHandler = new PaymentMethodHandler({
  code: PAYMENT_METHOD_CODES.CASH,
  description: [
    {
      languageCode: LanguageCode.en,
      value: 'Cash Payment - Immediate settlement',
    },
  ],
  args: {},

  createPayment: async (ctx, order, _amount, args, metadata): Promise<CreatePaymentResult> => {
    const orderTotal = order.total ?? 0;
    const amount =
      typeof metadata?.allocatedAmount === 'number' &&
      metadata.allocatedAmount > 0 &&
      metadata.allocatedAmount <= orderTotal
        ? metadata.allocatedAmount
        : orderTotal;
    const result = {
      amount,
      state: 'Settled' as const,
      transactionId: `CASH-${Date.now()}`,
      metadata: {
        paymentType: 'cash',
        userId: ctx.activeUserId?.toString(), // Store user ID in metadata for later tracking
        ...(metadata || {}),
      },
    };

    // Note: Payment custom fields will be updated by VendureEventAuditSubscriber
    // when PaymentStateTransitionEvent fires, using userId from metadata

    return result;
  },

  settlePayment: async (): Promise<SettlePaymentResult> => {
    // Already settled in createPayment
    return { success: true };
  },
});

/**
 * M-Pesa Payment Handler
 *
 * Currently a stub that immediately settles payments.
 * Future enhancement: Integrate with M-Pesa STK Push API for real-time payment processing.
 *
 * TODO: Implement M-Pesa API integration
 * - Trigger STK Push to customer's phone
 * - Wait for callback confirmation
 * - Update payment state based on API response
 */
export const mpesaPaymentHandler = new PaymentMethodHandler({
  code: PAYMENT_METHOD_CODES.MPESA,
  description: [
    {
      languageCode: LanguageCode.en,
      value: 'M-Pesa Payment - Mobile money (stub for future API integration)',
    },
  ],
  args: {},

  createPayment: async (ctx, order, _amount, args, metadata): Promise<CreatePaymentResult> => {
    const orderTotal = order.total ?? 0;
    const amount =
      typeof metadata?.allocatedAmount === 'number' &&
      metadata.allocatedAmount > 0 &&
      metadata.allocatedAmount <= orderTotal
        ? metadata.allocatedAmount
        : orderTotal;
    // TODO: Future - Trigger STK Push, await callback
    // For now, mark as settled immediately
    const result = {
      amount,
      state: 'Settled' as const,
      transactionId: `MPESA-${Date.now()}`,
      metadata: {
        paymentType: 'mpesa',
        phoneNumber: metadata?.phoneNumber || null, // Capture for future API integration
        userId: ctx.activeUserId?.toString(), // Store user ID in metadata for later tracking
        ...(metadata || {}),
      },
    };

    // Note: Payment custom fields will be updated by VendureEventAuditSubscriber
    // when PaymentStateTransitionEvent fires, using userId from metadata

    return result;
  },

  settlePayment: async (): Promise<SettlePaymentResult> => {
    // Already settled (future: handle async confirmation)
    return { success: true };
  },
});

/**
 * Factory for Credit Payment Handler
 *
 * We construct this handler with an injected CreditService to avoid
 * global service-locator state and to fail fast if the plugin wiring
 * is incorrect.
 */
export function createCreditPaymentHandler(creditService: CreditService): PaymentMethodHandler {
  return new PaymentMethodHandler({
    code: PAYMENT_METHOD_CODES.CREDIT,
    description: [
      {
        languageCode: LanguageCode.en,
        value: 'Customer credit payment',
      },
    ],
    args: {},
    createPayment: async (ctx, order, _amount, args, metadata): Promise<CreatePaymentResult> => {
      const customerId = order.customer?.id;

      if (!customerId) {
        throw new UserInputError('Credit payments require an associated customer.');
      }

      // Get credit summary via injected service
      const summary = await creditService.getCreditSummary(ctx, customerId);

      if (!summary.isCreditApproved) {
        throw new UserInputError('Customer is not approved for credit purchases.');
      }

      const orderTotal = order.total ?? 0;
      const amount =
        typeof metadata?.allocatedAmount === 'number' &&
        metadata.allocatedAmount > 0 &&
        metadata.allocatedAmount <= orderTotal
          ? metadata.allocatedAmount
          : orderTotal;

      if (summary.availableCredit < amount) {
        // Both availableCredit and amount are in cents
        throw new UserInputError('Customer credit limit exceeded.');
      }

      const result: CreatePaymentResult = {
        amount,
        state: 'Authorized' as const,
        transactionId: `CREDIT-${Date.now()}`,
        metadata: {
          paymentType: 'credit',
          customerId,
          creditLimit: summary.creditLimit,
          outstandingAmount: summary.outstandingAmount,
          userId: ctx.activeUserId?.toString(),
          ...(metadata || {}),
        },
      };

      // Note: Payment custom fields will be updated by VendureEventAuditSubscriber
      // when PaymentStateTransitionEvent fires, using userId from metadata

      return result;
    },
    settlePayment: async (): Promise<SettlePaymentResult> => {
      // Credit payment is already authorized in createPayment
      // Settlement just confirms the authorization
      return { success: true };
    },
  });
}

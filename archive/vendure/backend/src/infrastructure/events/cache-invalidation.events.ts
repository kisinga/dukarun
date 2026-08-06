import { RequestContext, VendureEvent } from '@vendure/core';

/**
 * Emitted when a channel's payment methods change (create/update).
 * Used by the cache-sync SSE layer to notify the frontend to invalidate payment_methods cache.
 */
export class PaymentMethodChangedEvent extends VendureEvent {
  constructor(
    public readonly ctx: RequestContext,
    public readonly action: 'created' | 'updated',
    public readonly paymentMethodId: string
  ) {
    super();
  }
}

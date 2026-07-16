export interface OrderPaymentSummaryInput {
  state: string;
  total?: number | null;
  totalWithTax?: number | null;
  payments?: Array<{ state: string; amount?: number | null }> | null;
  customFields?: { reversedAt?: string | null } | null;
}

export function getOrderTotal(order: OrderPaymentSummaryInput): number {
  return order.totalWithTax || order.total || 0;
}

export function getOrderSettledAmount(order: OrderPaymentSummaryInput): number {
  return (order.payments ?? [])
    .filter((payment) => payment.state === 'Settled')
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
}

export function isOrderVoidedOrReversed(order: OrderPaymentSummaryInput): boolean {
  return order.state === 'Cancelled' || order.customFields?.reversedAt != null;
}

export function getOrderAmountOwing(order: OrderPaymentSummaryInput): number {
  if (order.state === 'Draft' || isOrderVoidedOrReversed(order)) {
    return 0;
  }

  return Math.max(0, getOrderTotal(order) - getOrderSettledAmount(order));
}

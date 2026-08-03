/**
 * Payment Clusterer Utility
 *
 * Clusters payments into Cash Sales vs Credit/Outstanding invoices
 * Simple, focused utility for payment method categorization
 */

export interface PaymentData {
  totalWithTax: number;
  payments?: Array<{
    id: string;
    amount: number;
    method: string;
    state: string;
  }>;
}

export interface PaymentClusterResult {
  cashTotal: number;
  creditTotal: number;
}

/**
 * Cash payment method identifiers
 * These represent immediate payment methods (not credit)
 */
const CASH_METHODS = [
  'cash',
  'mpesa',
  'mobile_money',
  'mobile-money',
  'bank_transfer',
  'bank-transfer',
];

/**
 * Cluster payments into cash sales vs credit/outstanding
 *
 * Logic:
 * - If order has no payments or unpaid balance → Credit
 * - If order is fully paid with cash methods → Cash Sales
 * - Otherwise → Credit/Outstanding
 *
 * NOTE: Vendure payment states include: 'Created', 'Authorized', 'Settled', 'Cancelled'
 * We consider 'Settled' and 'Authorized' as valid paid states.
 */
export function clusterPayments(orders: PaymentData[]): PaymentClusterResult {
  let cashTotalCents = 0;
  let creditTotalCents = 0;

  orders.forEach((order) => {
    const orderTotalCents = order.totalWithTax || 0;
    const payments = order.payments || [];

    // No payments means credit/unpaid
    if (payments.length === 0) {
      creditTotalCents += orderTotalCents;
      return;
    }

    // Calculate total paid amount from settled/authorized payments
    const validPayments = payments.filter((p) => {
      const state = p.state?.toLowerCase() || '';
      return state === 'settled' || state === 'authorized';
    });

    const totalPaidCents = validPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Check if fully paid and if any payment method is a cash method
    const hasCashMethod = validPayments.some((p) => {
      const method = p.method?.toLowerCase() || '';
      return CASH_METHODS.some((cashMethod) => method.includes(cashMethod));
    });

    // If fully paid with cash methods, it's cash; otherwise credit/outstanding
    if (hasCashMethod && totalPaidCents >= orderTotalCents) {
      cashTotalCents += orderTotalCents;
    } else {
      // Partially paid or paid with non-cash method (credit)
      creditTotalCents += orderTotalCents;
    }
  });

  // Convert from cents to currency units
  return {
    cashTotal: cashTotalCents / 100,
    creditTotal: creditTotalCents / 100,
  };
}

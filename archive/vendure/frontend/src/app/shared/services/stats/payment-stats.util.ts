/**
 * Payment Stats Utility
 *
 * Pure functions for calculating payment statistics from payment data.
 */

export interface PaymentStats {
  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
}

export interface Payment {
  id: string;
  state: string;
  amount?: number;
  createdAt: string;
}

/**
 * Calculate payment stats from an array of payments
 * Pure function - no side effects
 *
 * @param payments - Array of payments (typically last X items from page or filtered data)
 * @returns PaymentStats object with calculated metrics
 */
export function calculatePaymentStats(payments: Payment[]): PaymentStats {
  const totalPayments = payments.length;
  const successfulPayments = payments.filter((p) => p.state === 'Settled').length;
  const pendingPayments = payments.filter((p) => p.state === 'Authorized').length;
  const failedPayments = payments.filter(
    (p) => p.state === 'Declined' || p.state === 'Cancelled',
  ).length;

  return { totalPayments, successfulPayments, pendingPayments, failedPayments };
}

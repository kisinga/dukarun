/**
 * Order states that can carry an outstanding AR balance.
 *
 * These states are used both for payment eligibility and for ledger-divergence
 * scanning so the two views stay in sync.
 */
export const AR_OWING_ORDER_STATES: string[] = [
  'ArrangingPayment',
  'PaymentAuthorized',
  'PaymentSettled',
  'Fulfilled',
  'PartiallyFulfilled',
  'Shipped',
  'Delivered',
];

/**
 * Order states in which a payment or settlement is allowed.
 *
 * PaymentSettled is excluded because the order should already be paid; if the
 * ledger disagrees, the rebuild mutation should be used instead of taking more
 * money.
 */
export const PAYABLE_ORDER_STATES: string[] = [
  'ArrangingPayment',
  'Fulfilled',
  'PartiallyFulfilled',
  'Shipped',
  'Delivered',
];

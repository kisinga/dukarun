export interface SaleAttemptState {
  fingerprint: string;
  clientRef: string;
  mpesaRetryAllowed: boolean;
}

export function salePayloadFingerprint(payload: unknown): string {
  return JSON.stringify(payload);
}

/**
 * Ambiguous retries keep one backend idempotency key while the effective command is unchanged.
 * Any cart, tender, customer, or fulfillment edit rotates the key before the next attempt.
 */
export function resolveSaleAttempt(
  current: SaleAttemptState | null,
  fingerprint: string,
  createClientRef: () => string
): SaleAttemptState {
  return current?.fingerprint === fingerprint
    ? current
    : { fingerprint, clientRef: createClientRef(), mpesaRetryAllowed: false };
}

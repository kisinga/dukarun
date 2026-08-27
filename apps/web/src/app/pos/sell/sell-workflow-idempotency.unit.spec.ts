import { describe, expect, it, vi } from 'vitest';
import { resolveSaleAttempt, salePayloadFingerprint } from './sell-workflow-idempotency';

describe('Sell workflow idempotency', () => {
  it('reuses the client reference while the effective payload is unchanged', () => {
    const createRef = vi.fn(() => 'ref-1');
    const fingerprint = salePayloadFingerprint({ customerId: 'customer-1', lines: [{ qty: 2 }] });
    const first = resolveSaleAttempt(null, fingerprint, createRef);
    first.mpesaRetryAllowed = true;

    expect(resolveSaleAttempt(first, fingerprint, createRef)).toBe(first);
    expect(createRef).toHaveBeenCalledOnce();
    expect(first.mpesaRetryAllowed).toBe(true);
  });

  it('rotates the client reference when any effective payload input changes', () => {
    let sequence = 0;
    const createRef = () => `ref-${++sequence}`;
    const first = resolveSaleAttempt(
      null,
      salePayloadFingerprint({ lines: [{ qty: 1 }], fulfillment: null }),
      createRef
    );
    const changed = resolveSaleAttempt(
      first,
      salePayloadFingerprint({ lines: [{ qty: 2 }], fulfillment: null }),
      createRef
    );

    expect(changed.clientRef).toBe('ref-2');
    expect(changed.mpesaRetryAllowed).toBe(false);
  });
});

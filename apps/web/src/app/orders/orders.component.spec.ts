import { signal, WritableSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { OrdersComponent } from './orders.component';

// Exercise the real presentation methods without unrelated router/network setup.
type Harness = {
  orderDues: WritableSignal<Map<string, number>>;
  creditPaid: WritableSignal<Map<string, number>>;
  creditBadge(order: unknown): { type: string; label: string };
  noPaymentsMessage(order: unknown): string;
  canSendReceipt(order: unknown): boolean;
};
const order = { id: 'order-1', status: 'completed', is_credit_sale: true, total: 1000 };
function setup(due?: number, paid = 1000): Harness {
  const component = Object.create(OrdersComponent.prototype) as Harness;
  component.orderDues = signal(new Map(due === undefined ? [] : [[order.id, due]]));
  component.creditPaid = signal(new Map([[order.id, paid]]));
  return component;
}

describe('Orders ledger balances', () => {
  it('treats a ledger-cleared invoice as settled without claiming full payment', () => {
    const component = setup(0, 600);
    expect(component.creditBadge(order).type).toBe('success');
    expect(component.noPaymentsMessage(order)).toBe('Credit sale — no outstanding balance.');
    expect(component.canSendReceipt(order)).toBe(true);
  });

  it('keeps a corrected debt outstanding even when payments equal the invoice total', () => {
    const component = setup(500);
    expect(component.creditBadge(order).type).toBe('warning');
    expect(component.noPaymentsMessage(order)).toContain('still outstanding');
    expect(component.canSendReceipt(order)).toBe(false);
  });

  it('does not turn missing balance data into a settled invoice or receipt', () => {
    const component = setup();
    expect(component.creditBadge(order).type).toBe('neutral');
    expect(component.noPaymentsMessage(order)).toContain('balance unavailable');
    expect(component.canSendReceipt(order)).toBe(false);
    expect(setup(0).canSendReceipt({ ...order, status: 'pending_payment' })).toBe(false);
  });
});

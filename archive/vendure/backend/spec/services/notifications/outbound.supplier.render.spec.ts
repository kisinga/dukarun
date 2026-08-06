import { renderOutbound } from '../../../src/services/notifications/outbound.render';

describe('Outbound supplier renderers', () => {
  it('renders the 3-day internal AP reminder', () => {
    const rendered = renderOutbound('supplier_ap_3_days', {
      supplierName: 'Acme Supplies',
      outstandingAmount: 250000,
      referenceNumber: 'PO-123',
      dueDate: '2026-07-12T00:00:00.000Z',
    });

    expect(rendered.inAppTitle).toBe('Supplier AP Reminder');
    expect(rendered.inAppMessage).toContain('Acme Supplies');
    expect(rendered.inAppMessage).toContain('3 days overdue');
    expect(rendered.inAppMessage).toContain('PO-123');
    expect(rendered.inAppMessage).toContain('KES 2,500.00');
  });

  it('renders the 10-day internal AP reminder with email', () => {
    const rendered = renderOutbound('supplier_ap_10_days', {
      supplierName: 'Acme Supplies',
      outstandingAmount: 500000,
    });

    expect(rendered.inAppTitle).toBe('Supplier AP Reminder');
    expect(rendered.inAppMessage).toContain('10 days overdue');
    expect(rendered.inAppMessage).toContain('KES 5,000.00');
    expect(rendered.emailSubject).toBe('AP payment urgent: 10 days overdue');
    expect(rendered.emailBody).toContain('Acme Supplies');
  });

  it('renders the supplier limit warning alert', () => {
    const rendered = renderOutbound('supplier_limit_warning', {
      supplierName: 'Acme Supplies',
      outstandingAmount: 800000,
      creditLimit: 1000000,
      utilizationPercent: 80,
    });

    expect(rendered.inAppTitle).toBe('Supplier Credit Limit Warning');
    expect(rendered.inAppMessage).toContain('Acme Supplies');
    expect(rendered.inAppMessage).toContain('80%');
  });

  it('renders the supplier limit near alert', () => {
    const rendered = renderOutbound('supplier_limit_near', {
      supplierName: 'Acme Supplies',
      outstandingAmount: 900000,
      creditLimit: 1000000,
      utilizationPercent: 90,
    });

    expect(rendered.inAppTitle).toBe('Supplier Credit Limit Almost Reached');
    expect(rendered.inAppMessage).toContain('Acme Supplies');
    expect(rendered.inAppMessage).toContain('90%');
  });

  it('renders the supplier credit purchase blocked alert', () => {
    const rendered = renderOutbound('supplier_credit_purchase_blocked', {
      supplierName: 'Acme Supplies',
      reason: 'limit_exceeded',
    });

    expect(rendered.inAppTitle).toBe('Supplier Credit Purchase Blocked');
    expect(rendered.inAppMessage).toContain('Acme Supplies');
    expect(rendered.inAppMessage).toContain('supplier credit limit exceeded');
  });

  it('renders the blocked alert without a supplier name', () => {
    const rendered = renderOutbound('supplier_credit_purchase_blocked', {
      reason: 'not_approved_or_frozen',
    });

    expect(rendered.inAppTitle).toBe('Supplier Credit Purchase Blocked');
    expect(rendered.inAppMessage).toContain('A supplier credit purchase was blocked');
    expect(rendered.inAppMessage).toContain('supplier credit not approved or paused');
  });
});

import { describe, expect, it } from 'vitest';
import { renderCustomerStatement } from './customer-statement.renderer';

describe('renderCustomerStatement', () => {
  it('renders a chronological ledger with derived opening and closing balances', () => {
    const rendered = renderCustomerStatement({
      company: { name: 'Duka Shop', address: 'Nairobi', logoUrl: null },
      customerName: 'Amina Hassan',
      currency: 'KES',
      generatedAt: '2026-08-13T12:00:00Z',
      rows: [
        {
          id: 'newer',
          date: '2026-08-13T10:00:00Z',
          reference: 'PAY-1',
          description: 'Payment received',
          debit: 0,
          credit: 400,
          balance: 600,
        },
        {
          id: 'older',
          date: '2026-08-12T10:00:00Z',
          reference: 'SALE-1',
          description: 'Credit sale',
          debit: 1_000,
          credit: 0,
          balance: 1_000,
        },
      ],
    });

    expect(rendered.html.indexOf('SALE-1')).toBeLessThan(rendered.html.indexOf('PAY-1'));
    expect(rendered.html).toContain('Opening balance');
    expect(rendered.html).toContain('KES 0');
    expect(rendered.html).toContain('Amount due');
    expect(rendered.html).toContain('KES 600');
    expect(rendered.styles).toMatch(/thead\s*\{\s*display: table-header-group/);
    expect(rendered.styles).toMatch(/size: A4 portrait/);
  });

  it('labels customer credit and escapes business-provided text', () => {
    const rendered = renderCustomerStatement({
      company: { name: '<Duka & Co>', address: null, logoUrl: 'javascript:alert(1)' },
      customerName: 'Amina <script>alert(1)</script>',
      currency: 'KES',
      generatedAt: '2026-08-13T12:00:00Z',
      rows: [
        {
          id: 'receipt',
          date: '2026-08-13T10:00:00Z',
          reference: '<MPESA>',
          description: 'Payment & deposit',
          debit: 0,
          credit: 450,
          balance: -450,
        },
      ],
    });

    expect(rendered.html).toContain('Credit available');
    expect(rendered.html).toContain('KES 450');
    expect(rendered.html).toContain('&lt;Duka &amp; Co&gt;');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('javascript:alert');
  });

  it('rejects an empty statement', () => {
    expect(() =>
      renderCustomerStatement({
        company: { name: 'Duka Shop', address: null, logoUrl: null },
        customerName: 'Amina',
        currency: 'KES',
        generatedAt: '2026-08-13T12:00:00Z',
        rows: [],
      })
    ).toThrow('at least one activity row');
  });
});

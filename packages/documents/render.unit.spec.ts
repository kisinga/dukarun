import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_TYPES,
  defaultDesign,
  readDesign,
  renderDocument,
  sampleDocument,
  statementContent,
  externalDocumentContent,
} from './index';

describe('document layouts', () => {
  for (const kind of DOCUMENT_TYPES)
    it(`${kind} preserves information in each layout`, () => {
      const content = sampleDocument(kind, {
        name: 'Amina Shop',
        address: 'Nairobi',
        email: 'hello@example.test',
      });
      const versions = ['classic', 'compact', 'modern'].map(layout =>
        renderDocument(content, {
          ...defaultDesign(kind),
          layout: layout as 'classic' | 'compact' | 'modern',
        })
      );
      for (const version of versions) {
        expect(version.html).toContain('Amina Shop');
        expect(version.html).toContain('SAMPLE — NOT A TRANSACTION');
        expect(version.html).toContain('hello@example.test');
        expect(version.styles).toContain('table-header-group');
      }
      const body = (html: string) => html.replace(/document (classic|compact|modern)/, 'document');
      expect(body(versions[0].html)).toBe(body(versions[1].html));
      expect(body(versions[1].html)).toBe(body(versions[2].html));
      expect(versions[0].html).not.toBe(versions[1].html);
      expect(versions[1].html).not.toBe(versions[2].html);
    });
  it('uses Classic for old payloads and omits missing optional identity', () => {
    expect(readDesign('receipt', null)).toEqual(defaultDesign('receipt'));
    expect(readDesign('invoice', { version: 8 })).toEqual(defaultDesign('invoice'));
    const output = renderDocument(sampleDocument('invoice', { name: 'Plain shop' }));
    expect(output.html).not.toContain('<img');
    expect(output.html).not.toContain('undefined');
    expect(output.html).not.toContain('null');
  });
  it('escapes every shop-controlled field and rejects unsafe logo URLs', () => {
    const content = sampleDocument('receipt', {
      name: '<script>bad</script>',
      logoUrl: 'javascript:alert(1)',
      address: '<img onerror="bad">',
    });
    const design = defaultDesign('receipt');
    design.message = '</style><script>bad</script>';
    design.custom = { label: '<b>Label</b>', value: '" onerror="bad', display: 'text' };
    const output = renderDocument(content, design);
    expect(output.html).not.toContain('<script>');
    expect(output.html).not.toContain('<img');
    expect(output.html).not.toContain('javascript:');
    expect(output.html).toContain('&lt;script&gt;');
    expect(output.html).toContain('&lt;b&gt;Label&lt;/b&gt;');
  });
  it('keeps prepared QR output inside four modules of quiet space', () => {
    const design = defaultDesign('receipt');
    design.custom = {
      label: 'Website',
      value: 'https://example.test',
      display: 'both',
      qr: { size: 21, bits: '1' + '0'.repeat(440) },
    };
    const output = renderDocument(
      sampleDocument('receipt', { name: 'Shop' }),
      design,
      'receipt-52mm'
    );
    expect(output.html).toContain('viewBox="0 0 29 29"');
    expect(output.html).toContain('M4 4h1v1h-1z');
    expect(output.html).toContain('https://example.test');
    delete design.custom.qr;
    expect(() => renderDocument(sampleDocument('receipt', { name: 'Shop' }), design)).toThrow(
      'Prepare the QR code'
    );
  });
  it('preserves authoritative invoice values and tax classifications', () => {
    const content = externalDocumentContent(
      {
        document_type: 'invoice',
        document_number: 'INV1',
        party_name: 'Buyer',
        issue_date: '2026-09-01',
        valid_until: null,
        total: 116,
        paid: 10,
        balance: 106,
        status: 'partial',
        notes: null,
        payments: [{ method: 'M-Pesa', amount: 10, reference: 'ABC123', date: '2026-09-01' }],
        lines: [{ description: 'Item', quantity: 1, unit_price: 116, line_total: 116 }],
        show_vat_breakdown: true,
        vat_registered: true,
        net_total: 100,
        tax_total: 16,
        tax_breakdown: [
          {
            code: 'VAT',
            classification: 'standard',
            rate_bps: 1600,
            gross: 116,
            net: 100,
            tax: 16,
          },
        ],
      },
      { name: 'Shop' }
    );
    expect(content.title).toBe('VAT Invoice');
    expect(content.totals).toContainEqual({ label: 'VAT 16%', value: 'KES 16' });
    expect(content.totals).toContainEqual({ label: 'Balance', value: 'KES 106' });
    expect(content.sections[1].title).toBe('Payments');
    expect(content.sections[1].rows[0]).toEqual(['M-Pesa', 'ABC123', '1 Sept 2026', 'KES 10']);
  });
  it('orders tied-date statement entries deterministically and labels customer credit', () => {
    const content = statementContent({
      company: { name: 'Shop' },
      customerName: 'Buyer',
      currency: 'KES',
      generatedAt: '2026-09-01',
      rows: [
        {
          id: 'b',
          date: '2026-09-01',
          reference: 'PAY',
          description: 'Paid',
          debit: 0,
          credit: 300,
          balance: -200,
        },
        {
          id: 'a',
          date: '2026-09-01',
          reference: 'SALE',
          description: 'Sale',
          debit: 100,
          credit: 0,
          balance: 100,
        },
      ],
    });
    expect(content.sections[0].rows[0][1]).toBe('SALE');
    expect(content.totals.at(-1)).toEqual({
      label: 'Credit available',
      value: 'KES 200',
      prominent: true,
    });
  });
});

describe('designer preview and VAT presentation', () => {
  it('accepts optional VAT overrides without resetting saved layouts', () => {
    const design = { ...defaultDesign('invoice'), showVatBreakdown: false, message: 'Keep me' };
    expect(readDesign('invoice', design)).toEqual(design);
    expect(readDesign('invoice', { ...design, showVatBreakdown: 'false' })).toEqual(
      defaultDesign('invoice')
    );
  });
  it('allows a pending QR only in a sample preview, never in printed output', () => {
    const design = defaultDesign('receipt');
    design.custom = { label: 'Website', value: 'https://example.test', display: 'both' };
    const sample = sampleDocument('receipt', { name: 'Shop' });
    expect(renderDocument(sample, design, 'a4', { preview: true }).html).toContain(
      'Preparing QR code'
    );
    expect(() => renderDocument(sample, design)).toThrow('Prepare the QR code');
    expect(() =>
      renderDocument({ ...sample, sample: false }, design, 'a4', { preview: true })
    ).toThrow('Prepare the QR code');
  });
  it('uses configured sample tax and keeps the inclusive total unchanged', () => {
    const options = { registered: true, showBreakdown: true, rateBps: 800 };
    const sample = sampleDocument('receipt', { name: 'Shop' }, options);
    expect(sample.totals.map(t => t.label)).toEqual(['Net amount', 'VAT 8%', 'Total']);
    expect(sample.totals.at(-1)?.value).toBe('KES 500');
    expect(
      sampleDocument('receipt', { name: 'Shop' }, { ...options, registered: false }).totals
    ).toHaveLength(1);
    expect(
      sampleDocument('statement', { name: 'Shop' }, options).totals.some(t =>
        t.label.startsWith('VAT')
      )
    ).toBe(false);
  });
  it('resolves public document overrides ahead of the inherited print setting', () => {
    const input = {
      document_type: 'invoice' as const,
      document_number: 'INV1',
      party_name: 'Buyer',
      issue_date: '2026-09-01',
      valid_until: null,
      total: 116,
      paid: 116,
      balance: 0,
      status: 'paid',
      notes: null,
      lines: [],
      show_vat_breakdown: false,
      vat_registered: true,
      net_total: 100,
      tax_total: 16,
      document_design: { ...defaultDesign('invoice'), showVatBreakdown: true },
    };
    expect(
      externalDocumentContent(input, { name: 'Shop', taxNumber: 'PIN' }).totals
    ).toContainEqual({ label: 'VAT', value: 'KES 16' });
    const hidden = externalDocumentContent(
      {
        ...input,
        show_vat_breakdown: true,
        document_design: { ...input.document_design, showVatBreakdown: false },
      },
      { name: 'Shop', taxNumber: 'PIN' }
    );
    expect(hidden.totals.some(t => t.label === 'VAT')).toBe(false);
    expect(hidden.identity.taxNumber).toBeNull();
  });
});

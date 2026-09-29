import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderDocumentPdf } from './pdf';
import { defaultDesign, type DocumentLayout } from './config';
import { documentDate, externalDocumentContent } from './adapters';
import { renderDocument } from './render';
const font = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./fonts/${name}.ttf`, import.meta.url)));
const assets = {
  regular: font('NotoSans-Regular'),
  bold: font('NotoSans-Bold'),
  serif: font('NotoSerif-Regular'),
};
const snapshot = {
  document_type: 'invoice' as const,
  document_number: 'SALE-001',
  party_name: 'Émilie Wanjirũ',
  issue_date: '2026-09-29T22:30:00Z',
  business_timezone: 'Africa/Nairobi',
  valid_until: null,
  total: 1160,
  paid: 160,
  balance: 1000,
  status: 'Partially paid',
  notes: 'Original issue',
  lines: [
    {
      description: 'Long item with selectable text',
      quantity: 2,
      unit_price: 580,
      line_total: 1160,
    },
  ],
  vat_registered: true,
  show_vat_breakdown: true,
  tax_document_number: 'VAT-ORIGINAL',
  net_total: 1000,
  tax_total: 160,
};
describe('A4 server PDF', () => {
  it.each(['classic', 'compact', 'modern'] as DocumentLayout[])(
    'renders saved %s layout on A4',
    async layout => {
      const design = { ...defaultDesign('invoice'), layout };
      const content = externalDocumentContent(snapshot, {
        name: 'Amina Shop',
        taxNumber: 'HISTORICAL-PIN',
      });
      const bytes = await renderDocumentPdf(content, design, assets);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
      expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89);
      expect(pdf.getTitle()).toBe('VAT Invoice VAT-ORIGINAL');
      expect(renderDocument(content, design).html).toContain('VAT-ORIGINAL');
      expect(bytes.length).toBeLessThan(100_000);
    }
  );
  it('paginates large tables within bounded resources', async () => {
    const content = externalDocumentContent(
      {
        ...snapshot,
        lines: Array.from({ length: 150 }, (_, i) => ({
          ...snapshot.lines[0]!,
          description: `Item ${i}: ${'long name '.repeat(12)}`,
        })),
      },
      { name: 'Shop' }
    );
    const pdf = await PDFDocument.load(
      await renderDocumentPdf(content, defaultDesign('invoice'), assets)
    );
    expect(pdf.getPageCount()).toBeGreaterThan(4);
    expect(pdf.getPageCount()).toBeLessThan(40);
  });
  it('rejects sample output and missing QR preparation', async () => {
    const content = externalDocumentContent(snapshot, { name: 'Shop' });
    await expect(renderDocumentPdf({ ...content, sample: true }, null, assets)).rejects.toThrow(
      'sample_document_rejected'
    );
    const design = defaultDesign('invoice');
    design.custom = { label: 'QR', value: 'https://example.test', display: 'qr' };
    await expect(renderDocumentPdf(content, design, assets)).rejects.toThrow(
      'document_qr_not_prepared'
    );
    design.custom.qr = { size: 21, bits: 'invalid' };
    await expect(renderDocumentPdf(content, design, assets)).rejects.toThrow(
      'document_qr_not_prepared'
    );
  });
  it('uses shared historical VAT presentation and explicit business dates', () => {
    const content = externalDocumentContent(
      { ...snapshot, document_design: { ...defaultDesign('invoice'), showVatBreakdown: false } },
      { name: 'Shop', taxNumber: 'PIN' }
    );
    expect(content.identity.taxNumber).toBeNull();
    expect(content.title).toBeUndefined();
    expect(content.reference).toBe('VAT-ORIGINAL');
    expect(content.totals.map(t => t.label)).toEqual(['Total', 'Paid', 'Balance']);
    expect(documentDate('2026-09-29T22:30:00Z', 'Africa/Nairobi')).toBe(documentDate('2026-09-30'));
    expect(documentDate('2026-09-29', 'America/Los_Angeles')).toBe(
      documentDate('2026-09-29', 'Asia/Tokyo')
    );
  });
});

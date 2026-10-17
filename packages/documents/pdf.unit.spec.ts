import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
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
    'honors company name visibility in %s PDFs without removing contact details or the logo',
    async layout => {
      const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
      const drawImage = vi.spyOn(PDFPage.prototype, 'drawImage');
      try {
        const content = externalDocumentContent(snapshot, {
          name: 'Amina Shop',
          address: 'Nairobi',
          email: 'hello@example.test',
        });
        const brandedAssets = {
          ...assets,
          logo: {
            type: 'png' as const,
            bytes: new Uint8Array(
              Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
                'base64'
              )
            ),
          },
        };
        for (const showCompanyName of [undefined, true, false]) {
          drawText.mockClear();
          drawImage.mockClear();
          const design = { ...defaultDesign('invoice'), layout, showCompanyName };
          const pdf = await PDFDocument.load(
            await renderDocumentPdf(content, design, brandedAssets)
          );
          const text = drawText.mock.calls.map(([value]) => value);
          expect(text.includes('Amina Shop')).toBe(showCompanyName !== false);
          expect(text).toContain('Nairobi');
          expect(text).toContain('hello@example.test');
          expect(drawImage).toHaveBeenCalledOnce();
          expect(pdf.getAuthor()).toBe('Amina Shop');
          expect(pdf.getPageCount()).toBe(1);
        }
      } finally {
        drawText.mockRestore();
        drawImage.mockRestore();
      }
    }
  );
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

describe('mobile PDF documents', () => {
  it.each(['receipt-52mm', 'receipt-80mm'] as const)(
    'uses a single readable mobile layout for %s',
    async paper => {
      const content = externalDocumentContent(snapshot, { name: 'Amina Shop', address: 'Nairobi' });
      const calls = vi.spyOn(PDFPage.prototype, 'drawText');
      try {
        const pdf = await PDFDocument.load(
          await renderDocumentPdf(content, defaultDesign('invoice'), assets, paper)
        );
        expect(pdf.getPage(0).getWidth()).toBeCloseTo((80 * 72) / 25.4);
        expect(pdf.getPage(0).getHeight()).toBeLessThan(841.89);
        expect(pdf.getPageCount()).toBe(1);
        const values = calls.mock.calls.map(([value]) => value);
        expect(values).toContain('Qty: 2');
        expect(values).toContain('Unit: KES 580');
        expect(values).toContain('Total: KES 1,160');
        expect(values).toContain('Original issue');
        expect(values).toContain('KES 1,000');
      } finally {
        calls.mockRestore();
      }
    }
  );
  it.each(['classic', 'compact', 'modern'] as DocumentLayout[])(
    'wraps large values, contact details and names within the %s mobile page',
    async layout => {
      const content = externalDocumentContent(
        {
          ...snapshot,
          party_name: 'A very long customer name '.repeat(6),
          lines: [
            {
              ...snapshot.lines[0]!,
              description: 'A long name without truncating product details '.repeat(6),
            },
          ],
          total: 1234567890.12,
          balance: 1234567890.12,
          store_url: 'https://example.test/shop/mobile',
        },
        {
          name: 'A very long company name '.repeat(4),
          website: 'https://example.test/' + 'long'.repeat(20),
        }
      );
      const calls = vi.spyOn(PDFPage.prototype, 'drawText');
      try {
        const pdf = await PDFDocument.load(
          await renderDocumentPdf(
            content,
            { ...defaultDesign('invoice'), layout },
            assets,
            'receipt-80mm'
          )
        );
        expect(pdf.getPageCount()).toBeGreaterThan(0);
        for (const [value, options] of calls.mock.calls) {
          expect(options!.x!).toBeGreaterThanOrEqual(11.9);
          expect(
            options!.x! + options!.font!.widthOfTextAtSize(value, options!.size!)
          ).toBeLessThanOrEqual((80 * 72) / 25.4 - 11.9);
          expect(options!.y!).toBeGreaterThanOrEqual(0);
        }
        expect(pdf.getPages().every(page => page.getHeight() <= 841.89)).toBe(true);
      } finally {
        calls.mockRestore();
      }
    }
  );
  it('paginates long mobile receipts with all items and a complete final summary', async () => {
    const content = externalDocumentContent(
      {
        ...snapshot,
        lines: Array.from({ length: 120 }, (_, i) => ({
          ...snapshot.lines[0]!,
          description: `Item ${i} with full details`,
        })),
      },
      { name: 'Shop' }
    );
    const calls = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      const pdf = await PDFDocument.load(
        await renderDocumentPdf(content, defaultDesign('invoice'), assets, 'receipt-80mm')
      );
      expect(pdf.getPageCount()).toBeGreaterThan(5);
      expect(pdf.getPageCount()).toBeLessThan(40);
      expect(calls.mock.calls.map(([value]) => value)).toContain('Item 119 with full details');
      expect(calls.mock.calls.map(([value]) => value)).toContain('Balance');
    } finally {
      calls.mockRestore();
    }
  });
});

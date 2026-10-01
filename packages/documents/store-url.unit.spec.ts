import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { externalDocumentContent, type ExternalDocumentInput } from './adapters';
import { renderDocument } from './render';
import { renderDocumentPdf } from './pdf';
import { defaultDesign, type DocumentLayout } from './config';

const snapshot: ExternalDocumentInput = {
  document_type: 'receipt',
  document_number: 'SALE-001',
  party_name: 'Amina',
  issue_date: '2026-10-01',
  valid_until: null,
  total: 116,
  paid: 116,
  balance: 0,
  status: 'Paid',
  notes: null,
  lines: [{ description: 'Item', quantity: 1, unit_price: 116, line_total: 116 }],
};
describe('Issued public shop URL', () => {
  it.each(['classic', 'compact', 'modern'] as DocumentLayout[])(
    'makes the %s PDF shop link clickable',
    async layout => {
      const url = 'https://shop.example/mama-mboga-stores';
      const content = externalDocumentContent({ ...snapshot, store_url: url }, { name: 'Shop' });
      const font = (name: string) =>
        new Uint8Array(readFileSync(new URL(`./fonts/${name}.ttf`, import.meta.url)));
      const bytes = await renderDocumentPdf(
        content,
        { ...defaultDesign('receipt'), layout },
        {
          regular: font('NotoSans-Regular'),
          bold: font('NotoSans-Bold'),
          serif: font('NotoSerif-Regular'),
        }
      );
      const pdf = await PDFDocument.load(bytes);
      const links = pdf.getPages().flatMap(page => page.node.Annots()?.asArray() ?? []);
      expect(links.length).toBeGreaterThan(0);
      for (const ref of links) {
        const annotation = pdf.context.lookup(ref, PDFDict);
        expect(annotation.lookup(PDFName.of('Subtype'), PDFName).asString()).toBe('/Link');
        expect(
          annotation
            .lookup(PDFName.of('A'), PDFDict)
            .lookup(PDFName.of('URI'), PDFString)
            .decodeText()
        ).toBe(url);
      }
    }
  );

  it('keeps the issued shop URL in the shared PDF and webpage content alongside the business website', () => {
    const content = externalDocumentContent(
      { ...snapshot, store_url: 'https://shop.example/amina' },
      { name: 'Amina Shop', website: 'https://amina.example' }
    );
    expect(content.storeUrl).toBe('https://shop.example/amina');
    for (const paper of ['a4', 'receipt-80mm', 'receipt-52mm'] as const) {
      const { html } = renderDocument(content, undefined, paper);
      expect(html).toContain('href="https://shop.example/amina"');
      expect(html).toContain('https://amina.example');
    }
    expect(content.totals).toContainEqual({ label: 'Total', value: 'KES 116', prominent: true });
  });

  it.each([undefined, null, '', 'javascript:alert(1)'])(
    'preserves older and unavailable-store snapshots (%s)',
    store_url => {
      const content = externalDocumentContent({ ...snapshot, store_url }, { name: 'Shop' });
      expect(renderDocument(content).html).not.toContain('Shop online');
    }
  );
});

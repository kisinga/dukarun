import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { defaultDesign, renderDocument } from '@dukarun/documents';
import {
  MAX_OPEN_ESC_HTML_BYTES,
  openEscCalibration,
  openEscHtml,
  openEscIntent,
} from './open-esc';

describe('Open ESC receipt protocol', () => {
  it('round trips UTF-8 receipts through the real gzip/base64 intent protocol', async () => {
    const pages = ['<p>Café · KES 12,345.00 · M-Pesa</p>', '<p>Second receipt</p>'];
    const url = await openEscIntent(pages);
    const encoded = url.match(/;S\.content=([^;]+);/)![1];
    const decoded = gunzipSync(Buffer.from(decodeURIComponent(encoded), 'base64')).toString('utf8');
    expect(JSON.parse(decoded)).toEqual(pages);
    expect(url).toContain('package=com.farminos.print;');
    expect(url).toContain('scheme=print-intent;');
    expect(decodeURIComponent(url.match(/;S\.browser_fallback_url=([^;]+);/)![1])).toBe(
      'https://play.google.com/store/apps/details?id=com.farminos.print'
    );
  });

  it('rejects oversized documents before attempting a handoff', async () => {
    await expect(openEscIntent(['x'.repeat(MAX_OPEN_ESC_HTML_BYTES)])).rejects.toThrow('too large');
    let seed = 23;
    const content = Array.from({ length: 240_000 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return String.fromCharCode(32 + ((seed >>> 16) % 90));
    }).join('');
    await expect(openEscIntent([content])).rejects.toThrow('too large');
  });

  it('preserves long receipts without page lengths or fixed receipt widths', () => {
    const source = openEscCalibration();
    const html = openEscHtml(source);
    expect(html).toContain('Line 40');
    expect(html).toContain('END');
    expect(html).not.toContain('@page');
    expect(html).not.toMatch(/\d(?:mm|pt)\b/);
    expect(html).toContain('width:100%');
    expect(source.styles).toContain('width:52mm');
  });

  it.each(['receipt-52mm', 'receipt-80mm'] as const)(
    'keeps saved designs, amounts and QR geometry in %s output',
    paper => {
      const design = defaultDesign('receipt');
      design.message = 'Karibu tena';
      design.custom = {
        label: 'Pay',
        value: '123456',
        display: 'qr',
        qr: { size: 21, bits: '1'.repeat(21 * 21) },
      };
      const source = renderDocument(
        {
          kind: 'receipt',
          identity: { name: 'A & B' },
          reference: 'SALE-1',
          metadata: [],
          sections: [],
          totals: [{ label: 'Total', value: 'KES 12,345.00' }],
        },
        design,
        paper
      );
      const html = openEscHtml(source);
      expect(html).toContain('A &amp; B');
      expect(html).toContain('KES 12,345.00');
      expect(html).toContain('Karibu tena');
      expect(html).toContain('viewBox="0 0 29 29"');
      expect(html).toContain('shape-rendering="crispEdges"');
      expect(html).not.toMatch(/(?:width|height)="[\d.]+mm"/);
    }
  );
  it.each([384, 399, 400, 576])(
    'aligns QR modules to whole printer dots at %s dots wide',
    width => {
      const design = defaultDesign('receipt');
      for (const size of [21, 29, 101]) {
        design.custom = {
          label: 'Scan',
          value: 'https://example.test',
          display: 'qr',
          qr: { size, bits: '1'.repeat(size * size) },
        };
        const source = renderDocument(
          {
            kind: 'receipt',
            identity: { name: 'Shop' },
            reference: 'SALE',
            metadata: [],
            sections: [],
            totals: [],
          },
          design,
          'receipt-80mm'
        );
        source.print = { kind: 'thermal-document', widthMm: 80, rasterWidthDots: width };
        const svg = /<svg[^>]*class="document-qr"[^>]*>/.exec(openEscHtml(source))![0];
        const viewport = Number(/width="([\d.]+)vw"/.exec(svg)![1]);
        const dots = (viewport * width) / 100;
        const module = dots / (size + 8);
        expect(module).toBeCloseTo(Math.round(module), 5);
        expect(module).toBeGreaterThanOrEqual(3);
        expect(dots).toBeLessThan(width * 0.95);
      }
    }
  );
});

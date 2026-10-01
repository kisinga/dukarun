import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import upng from '@pdf-lib/upng';
import { PDFDocument } from 'pdf-lib';
execFileSync(process.execPath, ['scripts/build-document-edge.mjs']);
const { renderSnapshotPdf, preparePdfLogo } =
  await import('../../supabase/functions/_shared/generated/documents.mjs');
const snapshot = {
  pdf_renderer_version: 1,
  document_type: 'receipt',
  document_number: 'ARTIFACT-1',
  party_name: 'Émilie Wanjirũ',
  issue_date: '2026-09-29',
  valid_until: null,
  total: 1000,
  paid: 1000,
  balance: 0,
  status: 'Paid',
  notes: null,
  lines: [{ description: 'Tea', quantity: 1, unit_price: 1000, line_total: 1000 }],
};
test('deployed artifact embeds its dependencies and fonts and always emits A4', async () => {
  const bytes = await renderSnapshotPdf(snapshot, { name: 'Shop' });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  await assert.rejects(
    renderSnapshotPdf({ ...snapshot, pdf_renderer_version: 99 }, { name: 'Shop' }),
    /unsupported_renderer_version/
  );
});
for (const layout of ['classic', 'compact', 'modern']) {
  test(`renders ${layout} PDFs when Edge runtime math constants are truncated`, async () => {
    // Isolate the production v1.71.2 Math values from the test runner. Import the
    // actual bundle afterward so dependency initialization sees the same values.
    const bytes = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import { readFileSync } from 'node:fs';
          process.on('uncaughtException', error => {
            console.error(error.stack);
            process.exit(1);
          });
          globalThis.Math = Object.create(Math, Object.fromEntries(
            Object.entries({ E: 2, LN2: 0, LN10: 2, LOG2E: 1, LOG10E: 0 })
              .map(([key, value]) => [key, { value }])
          ));
          const { renderSnapshotPdf } = await import(process.argv[1]);
          const snapshot = JSON.parse(readFileSync(0, 'utf8'));
          const bytes = await renderSnapshotPdf(snapshot, { name: 'Test electricals' });
          process.stdout.write(bytes);
        `,
        new URL('../../supabase/functions/_shared/generated/documents.mjs', import.meta.url).href,
      ],
      {
        input: JSON.stringify({
          ...snapshot,
          document_design: {
            version: 1,
            layout,
            message: 'Thank you for your business!',
            custom: { label: '', value: '', display: 'text' },
          },
        }),
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 595.28, height: 841.89 });
    assert.equal(pdf.getTitle(), 'Receipt ARTIFACT-1');
    assert.ok(bytes.length < 100_000, 'font subsets must remain compact');
  });
}
test('SVG and WebP branding decode to real PNG pixels without remote assets', async () => {
  const svg = await preparePdfLogo(
    new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>'
    )
  );
  assert.equal(svg.type, 'png');
  const webp = await preparePdfLogo(
    new Uint8Array(
      Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
    )
  );
  const png = upng.default.decode(webp.bytes.buffer);
  assert.equal(png.width, 1);
  assert.equal(png.height, 1);
  assert.equal(
    new Uint8Array(upng.default.toRGBA8(png)[0])[3],
    255,
    'WebP must not silently render transparent'
  );
  await assert.rejects(
    preparePdfLogo(
      new TextEncoder().encode('<svg><image href="https://example.test/private"/></svg>')
    ),
    /unsupported_svg_logo/
  );
});

test('existing SVG logos retain shadow filters and embedded raster images in PDFs', async () => {
  const raster = upng.default.encode([new Uint8Array([255, 0, 0, 255]).buffer], 1, 1, 0);
  const href = `data:image/png;base64,${Buffer.from(raster).toString('base64')}`;
  const logo = await preparePdfLogo(
    new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><defs><filter id="shadow"><feGaussianBlur stdDeviation="1"/></filter></defs><rect x="3" y="3" width="14" height="14" fill="blue" filter="url(#shadow)"/><image x="20" y="20" width="20" height="20" href="${href}"/></svg>`
    )
  );
  const png = upng.default.decode(logo.bytes.buffer);
  const pixels = new Uint8Array(upng.default.toRGBA8(png)[0]);
  const rgba = (x, y) => [...pixels.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
  assert.deepEqual(rgba(30, 30), [255, 0, 0, 255], 'embedded raster must remain visible');
  assert.equal(rgba(10, 10)[2], 255, 'filtered vector must remain visible');
  assert.ok(rgba(3, 3)[3] > 0 && rgba(3, 3)[3] < 255, 'blurred edge must be preserved');
  const bytes = await renderSnapshotPdf(snapshot, { name: 'Branded shop' }, logo);
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test('SVG decoding rejects oversized embedded images and encoded remote references', async () => {
  const png = Buffer.from(upng.default.encode([new Uint8Array([255, 0, 0, 255]).buffer], 1, 1, 0));
  png.writeUInt32BE(20_000, 16);
  png.writeUInt32BE(20_000, 20);
  await assert.rejects(
    preparePdfLogo(
      new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${png.toString('base64')}"/></svg>`
      )
    ),
    /logo_pixel_limit/
  );
  for (const href of [
    'https://example.test/a.png',
    'file:///tmp/logo.png',
    '&#104;ttps://example.test/a.png',
  ]) {
    await assert.rejects(
      preparePdfLogo(
        new TextEncoder().encode(
          `<svg xmlns="http://www.w3.org/2000/svg"><image href="${href}"/></svg>`
        )
      ),
      /unsupported_svg_logo/
    );
  }
});

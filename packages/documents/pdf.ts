/** Server-only entry point. Do not export this from the browser document entry point. */
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { DOCUMENT_LABELS, readDesign, validQr, type DocumentDesign } from './config';
import { safeImageUrl, type DocumentContent } from './render';
import { MAX_LOGO_BYTES } from './svg-logo';

export const PDF_RENDERER_VERSION = 1;
export interface PdfAssets {
  regular: Uint8Array;
  bold: Uint8Array;
  serif: Uint8Array;
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' };
}
const A4 = [595.28, 841.89] as const;
const MARGIN = 42;
const WIDTH = A4[0] - MARGIN * 2;
const INK = rgb(0.125, 0.141, 0.165);
const MUTED = rgb(0.36, 0.38, 0.4);
const RULE = rgb(0.86, 0.88, 0.9);

/** Draws presentation strings from the same content model as HTML; no financial arithmetic. */
export async function renderDocumentPdf(
  content: DocumentContent,
  value: DocumentDesign | null | undefined,
  assets: PdfAssets
): Promise<Uint8Array> {
  if (content.sample) throw new Error('sample_document_rejected');
  const suppliedCustom = value?.custom;
  if (
    suppliedCustom?.value?.trim() &&
    ['qr', 'both'].includes(suppliedCustom.display) &&
    (!suppliedCustom.qr || !validQr(suppliedCustom.qr))
  )
    throw new Error('document_qr_not_prepared');
  if (
    content.sections.reduce((n, s) => n + s.rows.length, 0) > 1000 ||
    JSON.stringify(content).length > 250_000
  )
    throw new Error('document_too_large');
  const design = readDesign(content.kind, value);
  const custom = design.custom;
  const hasQr = !!custom.value.trim() && custom.display !== 'text';
  if (hasQr && (!custom.qr || !validQr(custom.qr))) throw new Error('document_qr_not_prepared');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, bold, serif] = await Promise.all([
    doc.embedFont(assets.regular, { subset: true }),
    doc.embedFont(assets.bold, { subset: true }),
    doc.embedFont(assets.serif, { subset: true }),
  ]);
  const title = content.title ?? DOCUMENT_LABELS[content.kind];
  doc.setTitle(`${title} ${content.reference}`);
  doc.setAuthor(content.identity.name);
  doc.setProducer(`Dukarun document renderer ${PDF_RENDERER_VERSION}`);
  // Stable metadata: regeneration must not imply a new issue date.
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const compact = design.layout === 'compact';
  const modern = design.layout === 'modern';
  const size = compact ? 8.5 : 9.5;
  const line = size * 1.55;
  const padding = compact ? 5 : 10;
  let page: PDFPage;
  let y = 0;
  const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function text(s: string, x: number, top: number, font = regular, fontSize = size, color = INK) {
    page.drawText(clean(s), { x, y: A4[1] - top - fontSize, font, size: fontSize, color });
  }
  function rule(top: number, x = MARGIN, width = WIDTH, color = RULE, thickness = 0.6) {
    page.drawLine({
      start: { x, y: A4[1] - top },
      end: { x: x + width, y: A4[1] - top },
      color,
      thickness,
    });
  }
  function newPage() {
    if (doc.getPageCount() >= 40) throw new Error('document_page_limit');
    page = doc.addPage([...A4]);
    y = MARGIN;
    if (doc.getPageCount() > 1) {
      text(`${title} · ${content.reference}`, MARGIN, y, bold, 8);
      y += 23;
    }
  }
  function ensure(height: number) {
    if (y + height > A4[1] - 60) newPage();
  }
  function wrap(value: string, width: number, font = regular, fontSize = size): string[] {
    const lines: string[] = [];
    for (const paragraph of clean(value).split('\n')) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= width) {
          current = candidate;
          continue;
        }
        if (current) lines.push(current);
        current = '';
        for (const char of word) {
          if (current && font.widthOfTextAtSize(current + char, fontSize) > width) {
            lines.push(current);
            current = '';
          }
          current += char;
        }
      }
      lines.push(current);
    }
    return lines;
  }
  function block(
    value: string,
    x: number,
    top: number,
    width: number,
    font = regular,
    fontSize = size
  ): number {
    const lines = wrap(value, width, font, fontSize);
    for (const [i, s] of lines.entries()) text(s, x, top + i * fontSize * 1.55, font, fontSize);
    return lines.length * fontSize * 1.55;
  }
  newPage();
  if (modern) {
    rule(y, MARGIN, WIDTH, INK, 3);
    y += 18;
  }
  let identityX = MARGIN;
  let logoHeight = 0;
  if (assets.logo) {
    if (assets.logo.bytes.length > MAX_LOGO_BYTES) throw new Error('logo_too_large');
    if (assets.logo.type === 'png') {
      const view = new DataView(
        assets.logo.bytes.buffer,
        assets.logo.bytes.byteOffset,
        assets.logo.bytes.byteLength
      );
      if (view.byteLength < 24 || view.getUint32(16) * view.getUint32(20) > 2_000_000)
        throw new Error('logo_pixel_limit');
    }
    const logo = await (assets.logo.type === 'png'
      ? doc.embedPng(assets.logo.bytes)
      : doc.embedJpg(assets.logo.bytes));
    const scale = Math.min(68 / logo.width, 60 / logo.height);
    logoHeight = logo.height * scale;
    page.drawImage(logo, {
      x: MARGIN,
      y: A4[1] - y - logoHeight,
      width: logo.width * scale,
      height: logoHeight,
    });
    identityX += 80;
  }
  const identityWidth = WIDTH * 0.59 - (identityX - MARGIN) - 12;
  let identityHeight =
    block(
      content.identity.name,
      identityX,
      y,
      identityWidth,
      design.layout === 'classic' ? serif : bold,
      compact ? 16 : 21
    ) + 7;
  for (const s of [
    content.identity.address,
    content.identity.email,
    content.identity.phone,
    content.identity.website,
    content.identity.taxNumber ? `Tax PIN: ${content.identity.taxNumber}` : null,
  ]) {
    if (s)
      identityHeight += block(s, identityX, y + identityHeight, identityWidth, regular, 8.5) + 2;
  }
  const titleX = MARGIN + WIDTH * 0.63;
  let titleHeight = block(title, titleX, y, WIDTH * 0.37, bold, compact ? 18 : 24) + 10;
  text('DOCUMENT NO.', titleX, y + titleHeight, regular, 6.5, MUTED);
  titleHeight += 13;
  titleHeight += block(content.reference, titleX, y + titleHeight, WIDTH * 0.37);
  y += Math.max(identityHeight, titleHeight, logoHeight) + (compact ? 12 : 24);
  rule(y, MARGIN, WIDTH, INK);
  y += compact ? 12 : 20;
  const metadata = content.metadata.filter(m => m.value);
  for (let i = 0; i < metadata.length; i += 3) {
    let height = 0;
    for (let c = 0; c < 3; c++) {
      const item = metadata[i + c];
      if (!item) continue;
      const x = MARGIN + (c * WIDTH) / 3;
      text(item.label.toUpperCase(), x, y, regular, 7, MUTED);
      height = Math.max(height, 15 + block(item.value, x, y + 15, WIDTH / 3 - 20));
    }
    y += height + 16;
  }
  for (const section of content.sections) {
    if (!section.columns.length || section.columns.length > 8)
      throw new Error('invalid_document_columns');
    ensure(65);
    if (section.title) {
      y += block(section.title, MARGIN, y, WIDTH, bold) + 10;
    }
    const n = section.columns.length;
    const ratios =
      n === 4 && section.columns.filter(c => c.numeric).length === 3
        ? [0.46, 0.1, 0.22, 0.22]
        : (Array(n).fill(1 / n) as number[]);
    const widths = ratios.map(r => r * WIDTH);
    const header = () => {
      const height = 25;
      page.drawRectangle({
        x: MARGIN,
        y: A4[1] - y - height,
        width: WIDTH,
        height,
        color: modern ? INK : rgb(0.95, 0.96, 0.97),
      });
      let x = MARGIN;
      section.columns.forEach((c, i) => {
        const w = bold.widthOfTextAtSize(c.label.toUpperCase(), 7);
        text(
          c.label.toUpperCase(),
          c.numeric ? x + widths[i]! - w - 8 : x + 8,
          y + 7,
          bold,
          7,
          modern ? rgb(1, 1, 1) : INK
        );
        x += widths[i]!;
      });
      y += height;
    };
    header();
    for (const row of section.rows) {
      const cells = section.columns.map((_, i) => wrap(row[i] ?? '', widths[i]! - 16));
      const count = Math.max(1, ...cells.map(c => c.length));
      let offset = 0;
      while (offset < count) {
        let available = Math.floor((A4[1] - 60 - y - padding * 2) / line);
        if (available < 1) {
          newPage();
          header();
          available = Math.floor((A4[1] - 60 - y - padding * 2) / line);
        }
        // Keep ordinary rows together, but split exceptionally long rows across pages.
        if (offset === 0 && count > available && count * line + padding * 2 < A4[1] - 150) {
          newPage();
          header();
          available = Math.floor((A4[1] - 60 - y - padding * 2) / line);
        }
        const take = Math.min(count - offset, available);
        let x = MARGIN;
        cells.forEach((cell, c) => {
          cell.slice(offset, offset + take).forEach((s, i) => {
            text(
              s,
              section.columns[c]!.numeric
                ? x + widths[c]! - 8 - regular.widthOfTextAtSize(s, size)
                : x + 8,
              y + padding + i * line
            );
          });
          x += widths[c]!;
        });
        y += take * line + padding * 2;
        rule(y);
        offset += take;
      }
    }
    y += 20;
  }
  // Keep the ordinary summary together; oversized notes flow before the totals.
  const totalMetrics = content.totals.map(total => {
    const fs = total.prominent ? 13 : size;
    const font = total.prominent ? bold : regular;
    const values = wrap(total.value, WIDTH * 0.25, font, fs);
    const labels = wrap(total.label, WIDTH * 0.2, font, fs);
    return {
      total,
      fs,
      font,
      values,
      labels,
      height: Math.max(values.length, labels.length) * fs * 1.55 + 15,
    };
  });
  const totalHeight = totalMetrics.reduce((sum, t) => sum + t.height, 0);
  const notes = content.notes ? wrap(`Notes\n${content.notes}`, WIDTH * 0.43) : [];
  const summaryHeight = Math.max(notes.length * line, totalHeight);
  const together = summaryHeight < A4[1] - 170;
  if (together) ensure(summaryHeight);
  const summaryPage = page;
  const summaryY = y;
  if (together) {
    notes.forEach((s, i) => text(s, MARGIN, summaryY + i * line));
  } else if (content.notes) {
    for (const s of wrap(`Notes\n${content.notes}`, WIDTH)) {
      ensure(line);
      text(s, MARGIN, y);
      y += line;
    }
    y += 16;
  }
  const totalX = MARGIN + WIDTH * 0.52;
  for (const { total, fs, font, values, labels, height } of totalMetrics) {
    ensure(height);
    if (total.prominent) rule(y, totalX, WIDTH * 0.48, INK, modern ? 2 : 0.8);
    labels.forEach((s, i) => text(s, totalX, y + 7 + i * fs * 1.55, font, fs));
    values.forEach((s, i) =>
      text(s, MARGIN + WIDTH - font.widthOfTextAtSize(s, fs), y + 7 + i * fs * 1.55, font, fs)
    );
    y += height;
  }
  if (together && page === summaryPage) y = Math.max(y, summaryY + notes.length * line);
  y += 25;
  const messageLines = design.message ? wrap(design.message, WIDTH * 0.57) : [];
  const customLines =
    custom.value.trim() && custom.display !== 'qr' ? wrap(custom.value, WIDTH * 0.34) : [];
  const footerHeight =
    Math.max(
      messageLines.length * line,
      (custom.label ? 18 : 0) + (hasQr ? 108 : 0) + customLines.length * line
    ) + 20;
  ensure(Math.min(footerHeight, 600));
  rule(y);
  y += 16;
  const footerPage = page;
  const footerY = y;
  for (const s of messageLines) {
    ensure(line);
    text(s, MARGIN, y);
    y += line;
  }
  const messageEndPage = page;
  const messageEnd = y;
  if (page === footerPage) y = footerY;
  if (custom.value.trim()) {
    const x = MARGIN + WIDTH * 0.66;
    ensure((hasQr ? 110 : 0) + 20);
    if (custom.label) {
      text(custom.label, x, y, bold, 8);
      y += 18;
    }
    if (hasQr && custom.qr) {
      const qr = custom.qr;
      const module = 100 / (qr.size + 8);
      for (let row = 0; row < qr.size; row++)
        for (let col = 0; col < qr.size; col++) {
          if (qr.bits[row * qr.size + col] === '1')
            page.drawRectangle({
              x: x + (col + 4) * module,
              y: A4[1] - y - (row + 5) * module,
              width: module,
              height: module,
              color: rgb(0, 0, 0),
            });
        }
      y += 108;
    }
    for (const s of customLines) {
      ensure(line);
      text(s, x, y);
      y += line;
    }
  }
  const storeUrl = safeImageUrl(content.storeUrl);
  if (storeUrl) {
    if (page === messageEndPage) y = Math.max(y, messageEnd);
    y += 14;
    const urlLines = wrap(storeUrl, WIDTH, regular, 8.5);
    ensure(16 + urlLines.length * 13);
    text('Shop online', MARGIN, y, bold, 8);
    y += 16;
    for (const s of urlLines) {
      ensure(13);
      text(s, MARGIN, y, regular, 8.5);
      const width = regular.widthOfTextAtSize(s, 8.5);
      rule(y + 10, MARGIN, width, MUTED, 0.4);
      page.node.addAnnot(
        doc.context.register(
          doc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [MARGIN, A4[1] - y - 13, MARGIN + width, A4[1] - y + 2],
            Border: [0, 0, 0],
            A: { Type: 'Action', S: 'URI', URI: PDFString.of(storeUrl) },
          })
        )
      );
      y += 13;
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    text('Powered by Dukarun', MARGIN, A4[1] - 35, regular, 7, MUTED);
    text(`${i + 1} / ${pages.length}`, A4[0] - 70, A4[1] - 35, regular, 7, MUTED);
  });
  const bytes = await doc.save();
  if (bytes.length > 5_000_000) throw new Error('pdf_too_large');
  return bytes;
}

/** Server-only mobile PDF layout. */
import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { DOCUMENT_LABELS, type DocumentDesign } from './config';
import { safeImageUrl, type DocumentContent } from './render';
import type { PdfAssets } from './pdf';
import { MAX_LOGO_BYTES } from './svg-logo';
const MOBILE_PDF_RENDERER_VERSION = 2;
const WIDTH = (80 * 72) / 25.4;
const HEIGHT = 841.89;
const MARGIN = 12;
const USABLE = WIDTH - MARGIN * 2;
const SIZE = 10.5;
const LINE = SIZE * 1.45;
const INK = rgb(0.12, 0.13, 0.15);
const MUTED = rgb(0.35, 0.37, 0.39);
type Paint = (page: PDFPage, height: number) => void;
interface MobilePage {
  paint: Paint[];
  used: number;
}

export async function renderMobilePdf(
  content: DocumentContent,
  design: DocumentDesign,
  assets: PdfAssets
): Promise<Uint8Array> {
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
  doc.setProducer(`Dukarun document renderer ${MOBILE_PDF_RENDERER_VERSION}`);
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  const pages: MobilePage[] = [];
  let current: MobilePage;
  let y = MARGIN;
  const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  function wrap(value: string, width = USABLE, font: PDFFont = regular, size = SIZE): string[] {
    const lines: string[] = [];
    for (const paragraph of clean(value).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) {
          line = line ? `${line} ${word}` : word;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const char of word) {
          if (line && font.widthOfTextAtSize(line + char, size) > width) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function text(value: string, x: number, top: number, font = regular, size = SIZE, muted = false) {
    current.paint.push((page, height) =>
      page.drawText(clean(value), {
        x,
        y: height - top - size,
        font,
        size,
        color: muted ? MUTED : INK,
      })
    );
  }
  function newPage() {
    if (pages.length >= 40) throw new Error('document_page_limit');
    if (current) current.used = y;
    current = { paint: [], used: 0 };
    pages.push(current);
    y = MARGIN;
    if (pages.length > 1) {
      for (const line of wrap(`${title} · ${content.reference}`, USABLE, bold, 8.5).slice(0, 3)) {
        text(line, MARGIN, y, bold, 8.5);
        y += 13;
      }
      y += 5;
    }
  }
  function ensure(height: number) {
    if (y + height > HEIGHT - 30) newPage();
  }
  function block(value: string, font = regular, size = SIZE, muted = false) {
    for (const line of wrap(value, USABLE, font, size)) {
      ensure(size * 1.45);
      text(line, MARGIN, y, font, size, muted);
      y += size * 1.45;
    }
  }
  function rule() {
    ensure(9);
    const top = y;
    current.paint.push((page, height) =>
      page.drawLine({
        start: { x: MARGIN, y: height - top },
        end: { x: WIDTH - MARGIN, y: height - top },
        thickness: 0.6,
        color: INK,
      })
    );
    y += 9;
  }
  newPage();
  if (assets.logo) {
    if (assets.logo.bytes.length > MAX_LOGO_BYTES) throw new Error('logo_too_large');
    const logo = await (assets.logo.type === 'png'
      ? doc.embedPng(assets.logo.bytes)
      : doc.embedJpg(assets.logo.bytes));
    if (logo.width * logo.height > 2_000_000) throw new Error('logo_pixel_limit');
    const scale = Math.min(100 / logo.width, 45 / logo.height);
    const w = logo.width * scale,
      h = logo.height * scale,
      top = y;
    current.paint.push((page, height) =>
      page.drawImage(logo, { x: MARGIN, y: height - top - h, width: w, height: h })
    );
    y += h + 8;
  }
  if (design.showCompanyName !== false)
    block(content.identity.name, design.layout === 'classic' ? serif : bold, 15);
  for (const value of [
    content.identity.address,
    content.identity.email,
    content.identity.phone,
    content.identity.website,
    content.identity.taxNumber ? `Tax PIN: ${content.identity.taxNumber}` : null,
  ])
    if (value) block(value, regular, 9.5);
  y += 8;
  block(title, bold, 15);
  block(content.reference, bold);
  y += 8;
  rule();
  for (const item of content.metadata.filter(item => item.value)) {
    ensure(LINE * 2);
    block(item.label, bold, 9);
    block(item.value);
    y += 5;
  }
  for (const section of content.sections) {
    if (!section.columns.length || section.columns.length > 8)
      throw new Error('invalid_document_columns');
    if (section.title) {
      ensure(45);
      rule();
      block(section.title, bold);
      y += 5;
    }
    for (const row of section.rows) {
      // A stacked row retains every column without squeezing an A4 table onto a phone.
      const lines = [
        row[0] ?? '',
        ...section.columns
          .slice(1)
          .map((column, index) => `${column.label}: ${row[index + 1] ?? ''}`),
      ];
      const height = lines.reduce((sum, line) => sum + wrap(line).length * LINE, 0) + 10;
      if (height < HEIGHT - 110) ensure(height);
      lines.forEach((line, index) => block(line, index === 0 ? bold : regular));
      y += 7;
    }
  }
  if (content.notes) {
    y += 5;
    block('Notes', bold);
    block(content.notes);
    y += 8;
  }
  const totals = content.totals.map(total => {
    const fs = total.prominent ? 12 : SIZE;
    const font = total.prominent ? bold : regular;
    const label = wrap(total.label, USABLE * 0.43, font, fs);
    const value = wrap(total.value, USABLE * 0.53, font, fs);
    return { label, value, font, fs, height: Math.max(label.length, value.length) * fs * 1.45 + 8 };
  });
  const totalHeight = totals.reduce((sum, total) => sum + total.height, 9);
  if (totalHeight < HEIGHT - 110) ensure(totalHeight);
  rule();
  for (const total of totals) {
    ensure(total.height);
    total.label.forEach((line, index) =>
      text(line, MARGIN, y + index * total.fs * 1.45, total.font, total.fs)
    );
    total.value.forEach((line, index) =>
      text(
        line,
        WIDTH - MARGIN - total.font.widthOfTextAtSize(line, total.fs),
        y + index * total.fs * 1.45,
        total.font,
        total.fs
      )
    );
    y += total.height;
  }
  y += 8;
  if (design.message) {
    rule();
    block(design.message);
    y += 8;
  }
  const custom = design.custom;
  if (custom.value.trim()) {
    if (custom.label) block(custom.label, bold);
    if (custom.display !== 'text' && custom.qr) {
      ensure(115);
      const qr = custom.qr,
        module = 104 / (qr.size + 8),
        top = y,
        x = (WIDTH - 104) / 2;
      current.paint.push((page, height) => {
        for (let row = 0; row < qr.size; row++)
          for (let col = 0; col < qr.size; col++)
            if (qr.bits[row * qr.size + col] === '1')
              page.drawRectangle({
                x: x + (col + 4) * module,
                y: height - top - (row + 5) * module,
                width: module,
                height: module,
                color: rgb(0, 0, 0),
              });
      });
      y += 112;
    }
    if (custom.display !== 'qr') block(custom.value);
  }
  const storeUrl = safeImageUrl(content.storeUrl);
  if (storeUrl) {
    y += 8;
    block('Shop online', bold, 9);
    for (const line of wrap(storeUrl, USABLE, regular, 9)) {
      ensure(14);
      const top = y,
        width = regular.widthOfTextAtSize(line, 9);
      text(line, MARGIN, top, regular, 9);
      current.paint.push((page, height) =>
        page.node.addAnnot(
          doc.context.register(
            doc.context.obj({
              Type: 'Annot',
              Subtype: 'Link',
              Rect: [MARGIN, height - top - 13, MARGIN + width, height - top + 2],
              Border: [0, 0, 0],
              A: { Type: 'Action', S: 'URI', URI: PDFString.of(storeUrl) },
            })
          )
        )
      );
      y += 14;
    }
  }
  current!.used = y;
  pages.forEach((plan, index) => {
    const height = Math.max(100, Math.min(HEIGHT, plan.used + 30));
    const page = doc.addPage([WIDTH, height]);
    for (const paint of plan.paint) paint(page, height);
    page.drawText('Powered by Dukarun', { x: MARGIN, y: 12, size: 7, font: regular, color: MUTED });
    const count = `${index + 1} / ${pages.length}`;
    page.drawText(count, {
      x: WIDTH - MARGIN - regular.widthOfTextAtSize(count, 7),
      y: 12,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });
  const bytes = await doc.save();
  if (bytes.length > 5_000_000) throw new Error('pdf_too_large');
  return bytes;
}

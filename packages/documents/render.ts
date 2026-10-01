import {
  DOCUMENT_LABELS,
  readDesign,
  validQr,
  type DocumentDesign,
  type DocumentKind,
  type PaperFormat,
  type PreparedQr,
} from './config';

export interface DocumentIdentity {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  taxNumber?: string | null;
}
export interface DocumentColumn {
  label: string;
  numeric?: boolean;
}
export interface DocumentSection {
  title?: string;
  columns: readonly DocumentColumn[];
  rows: readonly (readonly string[])[];
}
/** Adapters supply already calculated amounts and eligibility; the renderer only presents them. */
export interface DocumentContent {
  kind: DocumentKind;
  identity: DocumentIdentity;
  title?: string;
  reference: string;
  metadata: readonly { label: string; value: string }[];
  sections: readonly DocumentSection[];
  totals: readonly { label: string; value: string; prominent?: boolean }[];
  notes?: string | null;
  /** Optional public shop link saved with an issued document. */
  storeUrl?: string | null;
  sample?: boolean;
}
export interface RenderedDocument {
  title: string;
  html: string;
  styles: string;
}
export function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
export function safeImageUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function qrBlock(qr: PreparedQr): string {
  if (!validQr(qr))
    throw new Error('The saved QR code is invalid. Open the document designer and save it again.');
  // Four modules of quiet space, three whole dots/module on a 203 dpi printer.
  const extent = qr.size + 8;
  const paths: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.bits[y * qr.size + x] === '1') paths.push(`M${x + 4} ${y + 4}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="document-qr" role="img" aria-label="QR code" viewBox="0 0 ${extent} ${extent}" width="${(extent * 3 * 25.4) / 203}mm" height="${(extent * 3 * 25.4) / 203}mm" shape-rendering="crispEdges"><rect width="${extent}" height="${extent}" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
}
export function renderDocument(
  data: DocumentContent,
  value?: DocumentDesign | null,
  paper: PaperFormat = 'a4',
  options: { preview?: boolean; qrPending?: boolean; qrError?: boolean } = {}
): RenderedDocument {
  const design = readDesign(data.kind, value);
  const e = escapeText;
  const logo = safeImageUrl(data.identity.logoUrl);
  const custom = design.custom;
  const hasQr = custom.value.trim() && custom.display !== 'text';
  const preview = options.preview === true && data.sample === true;
  if (hasQr && !custom.qr && !preview)
    throw new Error(
      'Prepare the QR code before printing. Open the document designer and save it again.'
    );
  const title = data.title ?? DOCUMENT_LABELS[data.kind];
  const storeUrl = safeImageUrl(data.storeUrl);
  const html = `<main class="print-template document ${design.layout} ${paper === 'a4' ? 'sheet' : 'thermal'}">
    ${data.sample ? '<p class="sample">SAMPLE — NOT A TRANSACTION</p>' : ''}
    <header class="document-header" data-preview-section="identity">
      ${logo ? `<img class="document-logo" src="${e(logo)}" alt=""/>` : ''}
      <div class="identity"><h1>${e(data.identity.name)}</h1>${[
        data.identity.address,
        data.identity.email,
        data.identity.phone,
        data.identity.website,
      ]
        .filter(Boolean)
        .map(v => `<p>${e(v!)}</p>`)
        .join('')}
      ${data.identity.taxNumber ? `<p>Tax PIN: ${e(data.identity.taxNumber)}</p>` : ''}</div>
      <div class="document-title"><h2>${e(title)}</h2><p><span class="reference-label">Document no.</span>${e(data.reference)}</p></div>
    </header>
    <dl class="metadata">${data.metadata
      .filter(m => m.value)
      .map(m => `<div><dt>${e(m.label)}</dt><dd>${e(m.value)}</dd></div>`)
      .join('')}</dl>
    ${data.sections.map(section => `<section>${section.title ? `<h3>${e(section.title)}</h3>` : ''}<table data-columns="${section.columns.length}" data-numeric-columns="${section.columns.filter(c => c.numeric).length}"><thead><tr>${section.columns.map(c => `<th${c.numeric ? ' class="number"' : ''}>${e(c.label)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${section.columns.map((col, i) => `<td${col.numeric ? ' class="number"' : ''}>${e(row[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('')}
    <div class="document-summary"><dl class="totals" data-preview-section="totals">${data.totals.map(t => `<div${t.prominent ? ' class="grand-total"' : ''}><dt>${e(t.label)}</dt><dd>${e(t.value)}</dd></div>`).join('')}</dl>
    ${data.notes ? `<section class="document-note"><h3>Notes</h3><p>${e(data.notes)}</p></section>` : ''}</div>
    <footer>${design.message.trim() || preview ? `<p class="document-message" data-preview-section="message">${e(design.message)}</p>` : ''}
    ${custom.value.trim() || preview ? `<div class="custom-field" data-preview-section="custom">${custom.value.trim() && custom.label.trim() ? `<strong>${e(custom.label)}</strong>` : ''}${hasQr ? (custom.qr && !(preview && options.qrPending) ? qrBlock(custom.qr) : `<p class="qr-pending" role="status">${preview && options.qrError ? 'QR code unavailable' : 'Preparing QR code…'}</p>`) : ''}${custom.display !== 'qr' ? `<p>${e(custom.value)}</p>` : ''}</div>` : ''}
    ${storeUrl ? `<p class="document-store">Shop online<br/><a href="${e(storeUrl)}" target="_blank" rel="noopener noreferrer">${e(storeUrl)}</a></p>` : ''}
    <p class="powered">Powered by Dukarun</p></footer>
  </main>`;
  const width = paper === 'receipt-52mm' ? '52mm' : paper === 'receipt-80mm' ? '80mm' : '182mm';
  const styles = `
    @page { size: ${paper === 'a4' ? 'A4 portrait' : `${width} 297mm`}; margin: ${paper === 'a4' ? '14mm' : '0'}; }
    * { box-sizing: border-box; } html, body { margin:0; padding:0; background:#fff; color:#111; }
    .document { width:${width}; max-width:none; margin:0 auto; font:10pt/1.4 Arial,sans-serif; overflow-wrap:anywhere; }
    .document p, .document h1, .document h2, .document h3, .document dl { margin:0; }
    .document h1 { font-size:17pt; line-height:1.2; } .document h2 { font-size:13pt; } .document h3 { font-size:10pt; margin:4mm 0 2mm; }
    .document-header { display:flex; align-items:flex-start; gap:4mm; padding:0 0 5mm; border-bottom:0.5mm solid #111; }
    .identity { flex:1; min-width:0; white-space:pre-line; } .document-title { text-align:right; max-width:42%; }
    .reference-label { display:none; }
    .document-logo { max-width:24mm; max-height:18mm; object-fit:contain; }
    .metadata { display:flex; flex-wrap:wrap; gap:3mm 8mm; padding:4mm 0; } .metadata dt { font-size:8pt; } .metadata dd { margin:0; font-weight:bold; }
    .document table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .document th, .document td { text-align:left; vertical-align:top; padding:2.5mm 1mm; border-bottom:0.2mm solid #bbb; }
    .document th { font-size:8pt; border-bottom:0.4mm solid #111; } .document th:first-child { width:38%; }
    .document .number { text-align:right; font-variant-numeric:tabular-nums; }
    .totals { padding-top:4mm; margin-left:auto!important; max-width:85mm; } .totals div { display:flex; justify-content:space-between; gap:4mm; padding:1mm 0; }
    .totals dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; } .grand-total { font-weight:bold; font-size:12pt; border-top:0.4mm solid #111; }
    .document-note, .document-message { white-space:pre-wrap; } footer { margin-top:6mm; border-top:0.2mm solid #aaa; padding-top:3mm; }
    .custom-field { margin-top:3mm; text-align:center; } .document-qr { display:block; margin:2mm auto; max-width:100%; } .powered { font-size:8pt; margin-top:4mm!important; text-align:center; }
    .document-store { grid-column:1 / -1; font-size:8pt; overflow-wrap:anywhere; break-inside:avoid; } .document-store a { color:inherit; text-decoration:underline; }
    .sample { border:0.4mm dashed #111; text-align:center; font-weight:bold; padding:2mm; margin-bottom:4mm!important; }
    .compact { font-size:9pt; line-height:1.25; } .compact .document-header { padding-bottom:2mm; } .compact .metadata { padding:2mm 0; gap:1mm 5mm; }
    .compact th,.compact td { padding:1mm; } .compact h1 { font-size:14pt; } .compact footer { margin-top:3mm; } .compact .document-logo { max-width:16mm; max-height:12mm; }
    .modern .document-header { border-top:1mm solid #111; border-bottom:0; padding-top:4mm; } .modern .document-title { border-left:0.5mm solid #111; padding-left:4mm; }
    .modern thead { background:#eee; } .modern .grand-total { border:0.5mm solid #111; padding:3mm; margin-top:2mm; } .modern .metadata { border-bottom:0.2mm solid #bbb; margin-bottom:3mm!important; }
    .thermal { padding:3mm 2mm; font-size:9pt; } .thermal .document-header { display:block; text-align:center; } .thermal h1 { font-size:13pt; } .thermal h2 { font-size:11pt; }
    .thermal .document-title { max-width:none; text-align:center; margin-top:3mm; } .thermal .document-logo { margin:0 auto 2mm; }
    .thermal .metadata { display:block; } .thermal .metadata div { display:flex; justify-content:space-between; gap:2mm; } .thermal .metadata dd { text-align:right; }
    .thermal th:first-child { width:40%; } .thermal th,.thermal td { padding:1.5mm 0.5mm; font-size:8pt; }
    .thermal.compact { padding:2mm; font-size:8pt; } .thermal.compact th,.thermal.compact td { padding:0.7mm 0.5mm; }
    .thermal.modern .document-title { border-left:0; border-bottom:0.5mm solid #111; padding:2mm 0; }
    thead { display: table-header-group; } tr, .custom-field, .document-header, .totals { break-inside:avoid; page-break-inside:avoid; } footer { break-inside:auto; }
    .document table[data-columns="6"] th { width:15%; }
    .document table[data-columns="6"] th:first-child { width:14%; }
    .document table[data-columns="6"] th:nth-child(2) { width:16%; }
    .document table[data-columns="6"] th:nth-child(3) { width:25%; }
    /* A4 has its own hierarchy and composition; thermal rules above stay independent. */
    .sheet { font-size:10pt; line-height:1.5; color:#20242a; }
    .sheet .sample { width:fit-content; margin:0 0 7mm auto!important; padding:1mm 0; font-size:6.5pt; font-weight:400; letter-spacing:1px; color:#666; border:0; border-bottom:0.2mm solid #ccc; }
    .sheet .document-header { gap:6mm; align-items:flex-start; padding-bottom:8mm; border-bottom:0.4mm solid #222; }
    .sheet .identity { padding-top:0; }
    .sheet .identity h1 { font-size:21pt; letter-spacing:-0.5px; margin-bottom:3mm; }
    .sheet .identity p { font-size:9pt; color:#555; line-height:1.6; }
    .sheet .document-logo { max-width:27mm; max-height:23mm; }
    .sheet .document-title { flex:0 1 68mm; max-width:42%; text-align:right; }
    .sheet .document-title h2 { font-size:24pt; font-weight:600; letter-spacing:-0.8px; line-height:1.15; margin-bottom:4mm; }
    .sheet .document-title p { font-size:10pt; font-variant-numeric:tabular-nums; color:#333; }
    .sheet .reference-label { display:block; margin-bottom:0.8mm; font-size:6.5pt; text-transform:uppercase; letter-spacing:1px; color:#666; }
    .sheet .metadata { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5mm 8mm; padding:6mm 0 8mm; }
    .sheet .metadata dt { text-transform:uppercase; letter-spacing:0.9px; font-size:7pt; color:#666; margin-bottom:1mm; }
    .sheet .metadata dd { white-space:pre-line; font-size:9.5pt; font-weight:500; line-height:1.5; }
    .sheet table { font-size:10pt; }
    .sheet th { padding:2.5mm 3mm; background:#f4f5f6; border-bottom:0.2mm solid #c8cdd2; font-size:7pt; text-transform:uppercase; letter-spacing:0.7px; font-weight:600; }
    .sheet td { padding:4mm 3mm; border-bottom:0.2mm solid #e1e4e7; font-size:9.5pt; line-height:1.55; }
    .sheet td:first-child { font-weight:500; }
    .sheet td.number { white-space:normal; }
    .sheet table[data-columns="3"] th:first-child { width:62%; }
    .sheet table[data-columns="3"] th:nth-child(2) { width:12%; }
    .sheet table[data-columns="4"] th { width:25%; }
    .sheet table[data-columns="4"][data-numeric-columns="3"] th:first-child { width:46%; }
    .sheet table[data-columns="4"][data-numeric-columns="3"] th:nth-child(2) { width:10%; }
    .sheet table[data-columns="4"][data-numeric-columns="3"] th:nth-child(3) { width:22%; }
    .sheet table[data-columns="4"][data-numeric-columns="3"] th:nth-child(4) { width:22%; }
    .sheet .document-summary { display:grid; grid-template-columns:minmax(0,1fr) 76mm; align-items:start; gap:12mm; margin-top:6mm; }
    .sheet .totals { grid-column:2; grid-row:1; width:100%; max-width:none; padding:0; margin:0!important; font-size:10pt; }
    .sheet .totals div { padding:2mm 0; font-size:9pt; }
    .sheet .totals dd { font-weight:500; }
    .sheet .totals .grand-total { margin-top:3mm; padding:3mm 0; border-top:0.4mm solid #222; font-size:15pt; letter-spacing:-0.3px; }
    .sheet .totals .grand-total dd { font-weight:700; }
    .sheet .document-note { padding-top:2mm; grid-column:1; grid-row:1; font-size:9pt; color:#444; }
    .sheet .document-note h3 { margin:0 0 2mm; color:#222; font-size:8pt; text-transform:uppercase; letter-spacing:0.7px; }
    .sheet footer { display:grid; grid-template-columns:minmax(0,1fr) 62mm; gap:5mm 10mm; align-items:start; margin-top:12mm; padding-top:6mm; border-top:0.2mm solid #ccc; }
    .sheet .document-message { grid-column:1; font-size:9pt; line-height:1.6; }
    .sheet .custom-field { grid-column:2; margin:0; text-align:right; font-size:8pt; color:#444; }
    .sheet .custom-field strong { display:block; font-size:7pt; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:2mm; color:#222; }
    .sheet .document-qr { margin:0 0 2mm auto; max-width:36mm; height:auto; }
    .sheet .powered { grid-column:1 / -1; margin-top:3mm!important; padding-top:3mm; border-top:0; text-align:left; color:#777; font-size:7pt; }
    .sheet.classic th { background:transparent; border-top:0.3mm solid #222; border-bottom:0.3mm solid #222; }
    .sheet.classic .identity h1 { font-family:Georgia,serif; font-weight:700; letter-spacing:-0.5px; }
    .sheet.compact { font-size:9pt; }
    .sheet.compact .document-header { padding-bottom:5mm; }
    .sheet.compact .identity h1 { font-size:19pt; }
    .sheet.compact .document-title h2 { font-size:21pt; }
    .sheet.compact .metadata { padding:5mm 0; gap:3mm 6mm; }
    .sheet.compact th, .sheet.compact td { padding:2mm; font-size:8.5pt; }
    .sheet.compact .document-summary { margin-top:4mm; }
    .sheet.compact .totals .grand-total { font-size:13pt; }
    .sheet.compact footer { margin-top:8mm; }
    .sheet.modern .document-header { border-top:1mm solid #1f2933; border-bottom:0; padding-top:7mm; padding-bottom:5mm; }
    .sheet.modern .identity h1 { font-size:21pt; }
    .sheet.modern .document-title { border:0; padding:0; }
    .sheet.modern .document-title h2 { font-size:26pt; color:#1f2933; }
    .sheet.modern .metadata { margin-bottom:5mm!important; border-bottom:0; padding:5mm; background:#f4f5f6; }
    .sheet.modern th { background:#1f2933; color:#fff; border:0; }
    .sheet.modern .totals .grand-total { border:0; background:#1f2933; color:#fff; padding:3.5mm; }
    @media screen { .document { zoom:var(--document-preview-scale,1); } }
    @media print { .document { max-width:none; print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
  `;
  return { title: `${data.identity.name} — ${title} — ${data.reference}`, html, styles };
}
export function documentHtml(document: RenderedDocument): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeText(document.title)}</title><style>${document.styles}</style></head><body>${document.html}</body></html>`;
}

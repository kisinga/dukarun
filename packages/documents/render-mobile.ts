import { renderDocument, type DocumentContent, type RenderedDocument } from './render';
import type { DocumentDesign } from './config';
/** Mobile documents use one readable width for both merchant receipt preferences. */
export function renderMobileDocument(
  content: DocumentContent,
  design?: DocumentDesign | null
): RenderedDocument {
  const rendered = renderDocument(content, design, 'receipt-80mm');
  return {
    ...rendered,
    styles:
      rendered.styles +
      `
    .document.thermal { width:80mm; padding:4.233mm; font:10.5pt/1.45 Arial,sans-serif; }
    .document.thermal h1,.document.thermal h2 { font-size:15pt; }
    .document table,.document tbody { display:block; }
    .document thead { display:none; }
    .document tr { display:block; border-bottom:0.2mm solid #ddd; padding:2mm 0; break-inside:avoid; }
    .document td { display:block; width:auto; border:0; padding:.5mm 0; font-size:10.5pt; text-align:left; }
    .document td:first-child { font-weight:bold; }
    .document td:not(:first-child)::before { content:attr(data-label) ': '; font-weight:bold; }
    .document .totals .grand-total { font-size:12pt; }
  `,
  };
}

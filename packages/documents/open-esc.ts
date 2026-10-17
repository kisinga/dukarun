import { escapeText, type PrintJob, type RenderedDocument } from './render';

export type DevicePrintMethod = 'system' | 'open-esc';
export const OPEN_ESC_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.farminos.print';
export const MAX_OPEN_ESC_HTML_BYTES = 512 * 1024;
export const MAX_OPEN_ESC_INTENT_LENGTH = 128 * 1024;

/** Open ESC screenshots a WebView, so use screen styles and a continuous, full-width layout. */
export function openEscHtml(rendered: RenderedDocument): string {
  const width = rendered.print?.kind === 'thermal-document' ? rendered.print.widthMm : 0;
  if (!width || width > 100) throw new Error('Choose a receipt paper size for Open ESC.');
  // Viewport units keep physical proportions independent of the phone's pixel density.
  // The bitmap width is controlled by Open ESC's printer settings, not by CSS millimetres.
  const relative = (value: number, unit: string) =>
    `${Number(((value * (unit === 'pt' ? 25.4 / 72 : 1) * 100) / width).toFixed(5))}vw`;
  const styles = rendered.styles
    .replace(/@page\s*\{[^}]*\}/g, '')
    .replace(/(-?[\d.]+)(mm|pt)\b/g, (_, value, unit) => relative(Number(value), unit));
  // Align QR modules to the configured driver bitmap instead of a fractional fit.
  const rasterWidth =
    rendered.print?.kind === 'thermal-document' ? rendered.print.rasterWidthDots : undefined;
  const sourceHtml = rendered.html.replace(/<svg\b[^>]*\bclass="document-qr"[^>]*>/g, tag => {
    const extent = Number(/viewBox="0 0 ([\d.]+)/.exec(tag)?.[1]);
    const dots =
      rasterWidth && extent
        ? Math.max(1, Math.min(4, Math.floor((rasterWidth * 0.94) / extent)))
        : 0;
    return tag.replace(
      /\b(width|height)="([\d.]+)mm"/g,
      (_, attribute, value) =>
        `${attribute}="${dots ? `${((extent * dots) / rasterWidth!) * 100}vw` : `${(Number(value) * 4) / 3}mm`}"`
    );
  });
  const html = sourceHtml.replace(
    /\b(width|height)="([\d.]+)mm"/g,
    (_, attribute, value) => `${attribute}="${relative(Number(value), 'mm')}"`
  );
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
    <title>${escapeText(rendered.title)}</title><style>
    ${styles}
    html,body { width:100%; margin:0; padding:0; background:#fff; color:#000; -webkit-text-size-adjust:100%; }
    .document.thermal,.document.thermal.compact { width:100%; max-width:100%; margin:0; padding:1.5vw; zoom:1; box-shadow:none; color:#000; }
    .document img { height:auto; }
    .document .document-qr { height:auto; }
    .document a { color:#000; }
    .document .totals dt { flex-shrink:0; }
    /* Receipt rows use the full width for names, followed by quantity and amount. */
    .document table[data-columns="3"],.document table[data-columns="3"] thead,.document table[data-columns="3"] tbody { display:block; }
    .document table[data-columns="3"] tr { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,3fr); border-bottom:0.2vw solid #aaa; }
    .document table[data-columns="3"] th,.document table[data-columns="3"] td { width:auto; border:0; }
    .document table[data-columns="3"] th:first-child { display:none; }
    .document table[data-columns="3"] td:first-child { grid-column:1 / -1; }
    .document table[data-columns="3"] .number:nth-child(2) { text-align:left; }
    </style></head><body>${html}</body></html>`;
}

/** UTF-8 JSON -> gzip -> base64 is Open ESC's documented print-intent protocol. */
export async function openEscIntent(pages: readonly string[]): Promise<string> {
  const payload = JSON.stringify(pages);
  if (new TextEncoder().encode(payload).byteLength > MAX_OPEN_ESC_HTML_BYTES)
    throw new OpenEscSizeError(
      'This print job is too large for Open ESC. Use a smaller batch or system printing.'
    );
  if (typeof CompressionStream === 'undefined')
    throw new Error('Open this page in an updated Android Chrome, or use system printing.');
  const compressed = await new Response(
    new Response(payload).body!.pipeThrough(new CompressionStream('gzip'))
  ).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const url = `intent://#Intent;scheme=print-intent;package=com.farminos.print;action=android.intent.action.VIEW;S.content=${encodeURIComponent(btoa(binary))};S.browser_fallback_url=${encodeURIComponent(OPEN_ESC_STORE_URL)};end`;
  if (url.length > MAX_OPEN_ESC_INTENT_LENGTH)
    throw new OpenEscSizeError(
      'This print job is too large for Open ESC. Use a smaller batch or system printing.'
    );
  return url;
}

export function openEscCalibration(): RenderedDocument {
  return {
    title: 'Printer calibration',
    print: { kind: 'thermal-document', widthMm: 52 },
    styles:
      '.document { width:52mm; font:9pt/1.4 Arial,sans-serif; } .document p { margin:0; } h1 { font-size:13pt; } .edge { display:flex; justify-content:space-between; border:0.25mm solid #000; }',
    html: `<main class="document thermal"><h1>Printer test</h1>
      <p>Both LEFT and RIGHT must be visible. Check text size and the final END line.</p>
      <div class="edge"><b>LEFT</b><b>RIGHT</b></div>
      <p>KES 12,345.00 · Café · M-Pesa</p>
      ${Array.from({ length: 40 }, (_, i) => `<p>Line ${i + 1} — Long receipt test</p>`).join('')}
      <div class="edge"><b>END</b><b>40 lines</b></div></main>`,
  };
}

export class OpenEscSizeError extends Error {}

export function openEscSupported(userAgent = globalThis.navigator?.userAgent ?? ''): boolean {
  return /Android/i.test(userAgent) && /Chrome|Chromium|EdgA|SamsungBrowser/i.test(userAgent);
}

/** Labels keep their own geometry and never receive receipt CSS. */
export function openEscLabelHtml(rendered: RenderedDocument): string {
  const media = rendered.print;
  if (media?.kind !== 'roll-label' || media.widthMm <= 0 || media.heightMm <= 0)
    throw new Error('Choose a roll label layout for Open ESC.');
  const widthMm =
    media.rasterWidthDots && media.dpi ? (media.rasterWidthDots * 25.4) / media.dpi : media.widthMm;
  const relative = (source: string) =>
    source.replace(
      /(-?[\d.]+)(mm|pt)\b/g,
      (_, value, unit) =>
        `${Number(((Number(value) * (unit === 'pt' ? 25.4 / 72 : 1) * 100) / widthMm).toFixed(5))}vw`
    );
  const styles = relative(rendered.styles.replace(/@page\s*\{[^}]*\}/g, ''));
  const html = rendered.html.replace(
    /style="([^"]*)"/g,
    (_, style) => `style="${relative(style)}"`
  );
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeText(rendered.title)}</title><style>
    * { box-sizing:border-box; margin:0; padding:0; }
    ${styles}
    html,body,.label-sheet { width:100%; margin:0; padding:0; background:white; color:black; -webkit-text-size-adjust:100%; }
    .barcode-label { width:100%; max-width:100%; height:${(media.heightMm * 100) / widthMm}vw; }
  </style></head><body>${html}</body></html>`;
}

export function openEscPages(job: PrintJob): string[] {
  return (job.pages ?? [job]).map(page =>
    page.print?.kind === 'roll-label' ? openEscLabelHtml(page) : openEscHtml(page)
  );
}

export interface ThermalPrintProfile {
  widthCm: number;
  dpi: number;
}
export const THERMAL_PROFILE_KEY = 'dukarun-print-profile';
export function readThermalPrintProfile(): ThermalPrintProfile {
  try {
    const profile = JSON.parse(
      globalThis.localStorage?.getItem(THERMAL_PROFILE_KEY) ?? 'null'
    ) as ThermalPrintProfile | null;
    if (
      profile &&
      Number.isFinite(profile.widthCm) &&
      profile.widthCm >= 2 &&
      profile.widthCm <= 12 &&
      Number.isInteger(profile.dpi) &&
      profile.dpi >= 100 &&
      profile.dpi <= 600
    )
      return profile;
  } catch {
    /* Use the initial Open ESC configuration until the device is calibrated. */
  }
  return { widthCm: 5, dpi: 203 };
}
export function thermalRasterWidth(
  profile: ThermalPrintProfile = readThermalPrintProfile()
): number {
  return Math.floor((profile.widthCm / 2.54) * profile.dpi);
}

/** Browser-only print transport. Server PDF rendering never imports this module. */
import { documentHtml, type PrintJob, type RenderedDocument } from './render';
import { validateSvgLogo } from './svg-logo';
import {
  openEscIntent,
  openEscPages,
  thermalRasterWidth,
  readThermalPrintProfile,
  type ThermalPrintProfile,
} from './open-esc';
export interface PreparedBrowserPrint {
  job: PrintJob;
  intentUrl: string;
}
const logoCache = new Map<string, { value: Promise<string>; expires: number }>();

export async function prepareOpenEsc(
  job: PrintJob,
  profile: ThermalPrintProfile = readThermalPrintProfile()
): Promise<PreparedBrowserPrint> {
  const pages = await Promise.all(
    (job.pages ?? [job]).map(async page => {
      const parsed = new DOMParser().parseFromString(page.html, 'text/html');
      await Promise.all(Array.from(parsed.images, image => embedLogo(image)));
      const print =
        page.print?.kind === 'thermal-document'
          ? { ...page.print, rasterWidthDots: thermalRasterWidth(profile) }
          : page.print;
      return { ...page, print, html: parsed.body.innerHTML };
    })
  );
  return { job, intentUrl: await openEscIntent(openEscPages({ ...job, pages })) };
}

/** Call directly from a user gesture. A handoff is not a print-completion acknowledgement. */
export function launchOpenEsc(prepared: PreparedBrowserPrint): void {
  window.location.assign(prepared.intentUrl);
}

let systemBusy = false;
export async function printWithSystem(job: RenderedDocument): Promise<void> {
  if (systemBusy) throw new Error('Another document is already being prepared for printing.');
  systemBusy = true;
  try {
    let frame = document.getElementById('print-frame') as HTMLIFrameElement | null;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'print-frame';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      Object.assign(frame.style, {
        position: 'absolute',
        width: '0',
        height: '0',
        border: 'none',
        left: '-9999px',
      });
      document.body.appendChild(frame);
    }
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('The printer is unavailable. Try again.');
    doc.open();
    doc.write(
      documentHtml({
        ...job,
        styles: `*{margin:0;padding:0;box-sizing:border-box} body{font-family:Arial,sans-serif} ${job.styles}
      @media print {html,body{margin:0;padding:0;background:white;color:black} thead{display:table-header-group} tfoot{display:table-footer-group} tr,img{break-inside:avoid;page-break-inside:avoid}.no-print{display:none!important}.print-only{display:block!important}}
    `,
      })
    );
    doc.close();
    await Promise.race([
      Promise.all([
        doc.fonts?.ready,
        ...Array.from(doc.images)
          .filter(img => !img.complete)
          .map(
            img =>
              new Promise<void>(resolve => {
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              })
          ),
      ]),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    await new Promise<void>(resolve => win.setTimeout(resolve, 0));
    win.focus();
    win.print();
  } finally {
    systemBusy = false;
  }
}

/** Embed a small monochrome PNG so Open ESC needs no network access or authentication. */
async function embedLogo(image: HTMLImageElement): Promise<void> {
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image.getAttribute('src') ?? ''))
    return;
  const url = new URL(image.getAttribute('src') ?? '', window.location.origin);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported receipt image.');
  const saved = logoCache.get(url.href);
  if (saved && saved.expires > Date.now()) {
    image.src = await saved.value;
    return;
  }
  let objectUrl: string | undefined;
  try {
    const response = await fetch(url.href, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Logo unavailable');
    const blob = await response.blob();
    if (blob.size > 2 * 1024 * 1024) throw new Error('Logo too large');
    if (blob.type.includes('svg')) validateSvgLogo(await blob.text());
    objectUrl = URL.createObjectURL(blob);
    const bitmap = new Image();
    bitmap.src = objectUrl;
    await bitmap.decode();
    if (
      !bitmap.naturalWidth ||
      !bitmap.naturalHeight ||
      bitmap.naturalWidth * bitmap.naturalHeight > 4_000_000
    )
      throw new Error('Logo dimensions too large');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 384 / bitmap.naturalWidth, 192 / bitmap.naturalHeight);
    canvas.width = Math.max(1, Math.round(bitmap.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(bitmap.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation unavailable');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const white =
        pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114 >= 180
          ? 255
          : 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = white;
    }
    context.putImageData(pixels, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    if (logoCache.size >= 8) logoCache.delete(logoCache.keys().next().value!);
    logoCache.set(url.href, { value: Promise.resolve(dataUrl), expires: Date.now() + 60_000 });
    image.setAttribute('src', dataUrl);
    image.removeAttribute('srcset');
  } catch {
    throw new Error('Could not prepare the receipt logo. Retry, or use system printing.');
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Existing full-page reports retain their print stylesheet and system dialog. */
export function printCurrentPage(): void {
  window.print();
}

import { Injectable, signal } from '@angular/core';
import {
  A4PurchaseTemplate,
  A4Template,
  OrderData,
  PrintMeta,
  PrintTemplate,
  PurchaseData,
  Receipt52mmTemplate,
  Receipt80mmTemplate,
} from './print-templates';

export type PrintFormat = 'receipt-52mm' | 'receipt-80mm' | 'a4';

const FORMAT_KEY = 'dukarun-print-format';

/**
 * Print Service — renders via the ported templates and prints through a
 * hidden iframe (no new tab). Receipt format (52mm/80mm/A4) persists to
 * localStorage for the pilot; a company-level setting could come later.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly templates = new Map<PrintFormat, PrintTemplate>([
    ['receipt-52mm', new Receipt52mmTemplate()],
    ['receipt-80mm', new Receipt80mmTemplate()],
    ['a4', new A4Template()],
  ]);

  private readonly a4PurchaseTemplate = new A4PurchaseTemplate();
  private preparingDocument = false;

  readonly format = signal<PrintFormat>(this.loadFormat());

  getAvailableTemplates(): Array<{ id: PrintFormat; name: string; width: string }> {
    return Array.from(this.templates.entries()).map(([id, template]) => ({
      id,
      name: template.name,
      width: template.width,
    }));
  }

  setFormat(format: PrintFormat): void {
    this.format.set(format);
    try {
      localStorage.setItem(FORMAT_KEY, format);
    } catch {
      // private mode — choice just won't persist
    }
  }

  /** Print an order-shaped document (receipt / proforma / cashier-slip). */
  async printOrder(
    order: OrderData,
    companyName: string | null,
    companyLogo: string | null,
    printMeta?: PrintMeta,
    companyAddress?: string | null,
    templateId?: PrintFormat
  ): Promise<void> {
    const documentType = printMeta?.documentType ?? 'receipt';
    if (documentType === 'receipt' && order.state !== 'Fulfilled') {
      throw new Error('Receipt unavailable — complete payment before printing.');
    }
    const template = this.templates.get(templateId ?? this.format());
    if (!template) return;
    const html = template.render(order, companyLogo, companyName, printMeta, companyAddress);
    await this.printDocument(`Print Order ${order.code}`, html, template.getStyles());
  }

  /** Print a purchase order (A4-only by design). */
  async printPurchase(
    purchase: PurchaseData,
    companyName: string | null,
    companyLogo: string | null,
    printMeta?: PrintMeta,
    companyAddress?: string | null
  ): Promise<void> {
    const html = this.a4PurchaseTemplate.render(
      purchase,
      companyLogo,
      companyName,
      {
        ...printMeta,
        documentType: 'purchase-order',
      },
      companyAddress
    );
    const ref = purchase.referenceNumber ?? purchase.id;
    await this.printDocument(`Purchase Order ${ref}`, html, this.a4PurchaseTemplate.getStyles());
  }

  /**
   * Render without printing (used by tests and previews).
   */
  renderOrder(
    order: OrderData,
    companyName: string | null,
    companyLogo: string | null,
    printMeta?: PrintMeta,
    templateId?: PrintFormat,
    companyAddress?: string | null
  ): string {
    const template = this.templates.get(templateId ?? this.format())!;
    return template.render(order, companyLogo, companyName, printMeta, companyAddress);
  }

  /** Shared hidden-iframe print orchestration for receipts, documents, and labels. */
  async printDocument(title: string, html: string, styles: string): Promise<void> {
    if (this.preparingDocument) {
      throw new Error('Another document is already being prepared for printing.');
    }
    this.preparingDocument = true;

    try {
      await this.prepareAndPrintDocument(title, html, styles);
    } finally {
      this.preparingDocument = false;
    }
  }

  private async prepareAndPrintDocument(
    title: string,
    html: string,
    styles: string
  ): Promise<void> {
    let printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-frame';
      printFrame.setAttribute('aria-hidden', 'true');
      printFrame.tabIndex = -1;
      printFrame.style.position = 'absolute';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      printFrame.style.left = '-9999px';
      document.body.appendChild(printFrame);
    }

    const iframeDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!iframeDoc) throw new Error('Failed to access iframe document');

    iframeDoc.open();
    iframeDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${this.escapeText(title)}</title>
                    <meta charset="utf-8">
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        body {
                            font-family: Arial, sans-serif;
                        }
                        ${styles}
                        @media print {
                            html,
                            body {
                                margin: 0;
                                padding: 0;
                                background: #fff;
                                color: #000;
                            }
                            .print-template {
                                print-color-adjust: exact;
                                -webkit-print-color-adjust: exact;
                            }
                            thead {
                                display: table-header-group;
                            }
                            tfoot {
                                display: table-footer-group;
                            }
                            tr,
                            img {
                                break-inside: avoid;
                                page-break-inside: avoid;
                            }
                            .no-print {
                                display: none !important;
                            }
                            .print-only {
                                display: block !important;
                            }
                        }
                        @media screen {
                            .print-template {
                                margin: 20px auto;
                                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                            }
                        }
                    </style>
                </head>
                <body>
                    ${html}
                </body>
                </html>
            `);
    iframeDoc.close();

    const printWindow = printFrame.contentWindow;
    if (!printWindow) throw new Error('Failed to access iframe window');

    await this.waitForDocument(printWindow);
    await this.waitForAssets(printWindow.document);
    await new Promise<void>(resolve => printWindow.setTimeout(resolve, 0));
    printWindow.focus();
    printWindow.print();
  }

  private async waitForDocument(printWindow: Window): Promise<void> {
    if (printWindow.document.readyState === 'complete') return;
    await this.withTimeout(
      new Promise<void>(resolve => {
        printWindow.addEventListener('load', () => resolve(), { once: true });
      }),
      2_000
    );
  }

  private async waitForAssets(printDocument: Document): Promise<void> {
    const imagePromises = Array.from(printDocument.images)
      .filter(image => !image.complete)
      .map(
        image =>
          new Promise<void>(resolve => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          })
      );
    const fontsPromise = printDocument.fonts?.ready.then(() => undefined).catch(() => undefined);
    await this.withTimeout(
      Promise.all([fontsPromise ?? Promise.resolve(), ...imagePromises]).then(() => undefined),
      3_000
    );
  }

  private withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
    return new Promise<void>(resolve => {
      const timeout = setTimeout(resolve, timeoutMs);
      void task.then(
        () => {
          clearTimeout(timeout);
          resolve();
        },
        () => {
          clearTimeout(timeout);
          resolve();
        }
      );
    });
  }

  private escapeText(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private loadFormat(): PrintFormat {
    try {
      const saved = localStorage.getItem(FORMAT_KEY);
      if (saved === 'receipt-52mm' || saved === 'receipt-80mm' || saved === 'a4') return saved;
    } catch {
      // fall through to default
    }
    return 'receipt-52mm';
  }
}

import {
  escapeText,
  renderDocument,
  type DocumentIdentity,
  type PaperFormat,
} from '@dukarun/documents';
import { ReceiptDataService } from './receipt-data.service';
import { orderDocumentContent, purchaseDocumentContent } from './document-adapters';
import { Injectable, inject, signal } from '@angular/core';
import type { OrderData, PrintMeta, PurchaseData } from './print-data';

export type PrintFormat = PaperFormat;

const FORMAT_KEY = 'dukarun-print-format';

/**
 * Renders saved document designs and prints through the existing hidden iframe.
 * The device's paper preference remains separate from company document designs.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly receiptData = inject(ReceiptDataService);
  private preparingDocument = false;

  readonly format = signal<PrintFormat>(this.loadFormat());

  getAvailableTemplates(): Array<{ id: PrintFormat; name: string; width: string }> {
    return [
      { id: 'receipt-52mm', name: '52mm Receipt', width: '52mm' },
      { id: 'receipt-80mm', name: '80mm Receipt', width: '80mm' },
      { id: 'a4', name: 'A4 Invoice', width: '210mm' },
    ];
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
    const company = await this.receiptData.companyPrintInfo();
    const identity: DocumentIdentity = {
      ...company,
      name: companyName || company.name,
      logoUrl: companyLogo,
      address: companyAddress ?? company.address,
    };
    const rendered = renderDocument(
      orderDocumentContent(
        order,
        identity,
        {
          ...printMeta,
          showVatBreakdown:
            company.documentDesigns?.[documentType]?.showVatBreakdown ??
            printMeta?.showVatBreakdown ??
            company.showVatBreakdown,
        },
        templateId ?? this.format()
      ),
      company.documentDesigns?.[documentType],
      templateId ?? this.format()
    );
    await this.printDocument(rendered.title, rendered.html, rendered.styles);
  }

  /** Print a purchase order (A4-only by design). */
  async printPurchase(
    purchase: PurchaseData,
    companyName: string | null,
    companyLogo: string | null,
    printMeta?: PrintMeta,
    companyAddress?: string | null
  ): Promise<void> {
    const company = await this.receiptData.companyPrintInfo();
    const rendered = renderDocument(
      purchaseDocumentContent(
        purchase,
        {
          ...company,
          name: companyName || company.name,
          logoUrl: companyLogo,
          address: companyAddress ?? company.address,
        },
        printMeta
      ),
      company.documentDesigns?.['purchase-order']
    );
    await this.printDocument(rendered.title, rendered.html, rendered.styles);
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
                    <title>${escapeText(title)}</title>
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

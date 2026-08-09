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
  printDocument(title: string, html: string, styles: string): Promise<void> {
    let printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-frame';
      printFrame.style.position = 'absolute';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      printFrame.style.left = '-9999px';
      document.body.appendChild(printFrame);
    }

    return new Promise<void>((resolve, reject) => {
      let printed = false;
      const doPrint = () => {
        if (printed) return;
        printed = true;
        try {
          const win = printFrame.contentWindow;
          if (win) {
            win.focus();
            win.print();
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      const iframeDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (!iframeDoc) {
        reject(new Error('Failed to access iframe document'));
        return;
      }

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
                            body {
                                margin: 0;
                                padding: 0;
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
      if (!printWindow) {
        reject(new Error('Failed to access iframe window'));
        return;
      }

      printWindow.onload = () => setTimeout(doPrint, 250);
      setTimeout(() => {
        if (!printed && printWindow.document.readyState === 'complete') {
          doPrint();
        }
      }, 500);
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

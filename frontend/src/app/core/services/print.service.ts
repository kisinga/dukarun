import { Injectable, inject } from '@angular/core';
import { CompanyService } from './company.service';
import {
  PrintTemplate,
  PrintMeta,
  OrderData,
  Receipt52mmTemplate,
  Receipt80mmTemplate,
  A4Template,
} from './print-templates';

/**
 * Print Service
 *
 * Handles printing of orders using different templates.
 * Composable and extensible - new templates can be registered.
 */
@Injectable({
  providedIn: 'root',
})
export class PrintService {
  private readonly companyService = inject(CompanyService);

  // Available templates
  private readonly templates = new Map<string, PrintTemplate>([
    ['receipt-52mm', new Receipt52mmTemplate()],
    ['receipt-80mm', new Receipt80mmTemplate()],
    ['a4', new A4Template()],
  ]);

  /**
   * Get all available templates
   */
  getAvailableTemplates(): Array<{ id: string; name: string; width: string }> {
    return Array.from(this.templates.entries()).map(([id, template]) => ({
      id,
      name: template.name,
      width: template.width,
    }));
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): PrintTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Register a new template
   */
  registerTemplate(id: string, template: PrintTemplate): void {
    this.templates.set(id, template);
  }

  /**
   * Print an order using the specified template
   * Platform-agnostic: uses hidden iframe instead of opening new tab
   * @param order - Order data to print
   * @param templateId - Template ID to use (default: 'receipt-52mm')
   * @param printMeta - Optional contextual metadata (payment method name, served by, etc.)
   */
  async printOrder(
    order: OrderData,
    templateId: string = 'receipt-52mm',
    printMeta?: PrintMeta,
  ): Promise<void> {
    const template = this.getTemplate(templateId);
    if (!template) {
      console.error(`Template ${templateId} not found`);
      return;
    }

    // Get company branding for print
    const companyLogo = this.companyService.companyLogoAsset()?.preview || null;
    const companyName = this.companyService.activeCompany()?.code ?? 'Your Company';

    // Render the order
    const html = template.render(order, companyLogo, companyName, printMeta);
    const styles = template.getStyles();

    // Create or reuse hidden iframe for printing
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

      // Write the HTML and styles
      iframeDoc.open();
      iframeDoc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Print Order ${order.code}</title>
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

      // Wait for content to load, then print
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
}

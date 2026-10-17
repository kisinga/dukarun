import {
  renderDocument,
  type DocumentIdentity,
  type PaperFormat,
  type RenderedDocument,
  type PrintJob,
} from '@dukarun/documents';
import { ReceiptDataService } from './receipt-data.service';
import { orderDocumentContent, purchaseDocumentContent } from './document-adapters';
import { Injectable, inject, signal } from '@angular/core';
import type { OrderData, PrintMeta, PurchaseData } from './print-data';
import { OpenEscPrintService } from './open-esc-print.service';
import { printWithSystem } from '../../../../../../packages/documents/browser-print';

export type PrintFormat = PaperFormat;

const FORMAT_KEY = 'dukarun-print-format';

/**
 * Renders saved document designs and prints through the existing hidden iframe.
 * The device's paper preference remains separate from company document designs.
 */
@Injectable({ providedIn: 'root' })
export class PrintService {
  private readonly receiptData = inject(ReceiptDataService);
  private readonly openEsc = inject(OpenEscPrintService);

  readonly format = signal<PrintFormat>(this.loadFormat());

  getAvailableTemplates(): Array<{ id: PrintFormat; name: string; width: string }> {
    return [
      { id: 'receipt-52mm', name: '52mm Receipt', width: '52mm' },
      { id: 'receipt-80mm', name: '80mm Receipt', width: '80mm' },
      { id: 'a4', name: 'A4', width: 'A4' },
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
  async renderOrder(
    order: OrderData,
    companyName: string | null,
    companyLogo: string | null,
    printMeta?: PrintMeta,
    companyAddress?: string | null,
    templateId?: PrintFormat
  ): Promise<RenderedDocument> {
    const documentType = printMeta?.documentType ?? 'receipt';
    if (
      documentType === 'receipt' &&
      (order.state !== 'Fulfilled' || (order.openBalance ?? 0) > 0)
    ) {
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
    return rendered;
  }

  async printOrder(...args: Parameters<PrintService['renderOrder']>): Promise<void> {
    const rendered = await this.renderOrder(...args);
    await this.printDocument(rendered.title, rendered.html, rendered.styles, rendered.print);
  }

  async prepareOrder(
    orderId: string,
    kind: 'sale' | 'receipt' | 'proforma' | 'cashier-slip' = 'sale'
  ): Promise<RenderedDocument> {
    const [{ order, meta }, company] = await Promise.all([
      kind === 'proforma'
        ? this.receiptData.buildProformaData(orderId)
        : kind === 'cashier-slip'
          ? this.receiptData.buildCashierSlipData(orderId)
          : kind === 'receipt'
            ? this.receiptData.buildReceiptData(orderId)
            : this.receiptData.buildSaleDocumentData(orderId),
      this.receiptData.companyPrintInfo(),
    ]);
    return this.renderOrder(order, company.name, company.logoUrl, meta, company.address);
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
    await this.printRendered(rendered);
  }

  /** Legacy custom sheets stay on the system path unless explicit geometry is supplied. */
  async printDocument(
    title: string,
    html: string,
    styles: string,
    print?: RenderedDocument['print']
  ): Promise<void> {
    await this.printRendered({
      title,
      html,
      styles,
      print: print ?? { kind: 'sheet', widthMm: 210, heightMm: 297 },
    });
  }

  async printRendered(job: PrintJob): Promise<void> {
    if (
      this.openEsc.method() === 'open-esc' &&
      this.openEsc.supported &&
      job.print &&
      job.print.kind !== 'sheet'
    )
      throw new Error('The document is still preparing. Use its Print button when ready.');
    await this.systemPrint(job);
  }

  systemPrint(job: RenderedDocument): Promise<void> {
    return printWithSystem(job);
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

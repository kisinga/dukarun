import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/supabase.service';
import { PosService, variantLabel } from '../../pos/pos.service';
import type { OrderData, PrintMeta, PurchaseData } from './print-templates';

export interface CompanyPrintInfo {
  name: string;
  code: string;
  /** Full public URL: kept as-is when logo_path is absolute, resolved from the company-logos bucket otherwise. */
  logoUrl: string | null;
  address: string | null;
  printerEnabled: boolean;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  bank: 'Bank Transfer',
  credit: 'Credit',
};

/** Maps backend order status to the legacy Vendure states the templates label. */
function toLegacyState(status: string): string {
  switch (status) {
    case 'completed':
      return 'Fulfilled'; // renders "Paid"
    case 'draft':
      return 'Draft';
    case 'pending_payment':
      return 'ArrangingPayment'; // renders "Unpaid"
    default:
      return status;
  }
}

/**
 * Builds the OrderData/PurchaseData/PrintMeta the print templates expect,
 * from supabase-js queries (labels resolved via variant_catalog).
 */
@Injectable({ providedIn: 'root' })
export class ReceiptDataService {
  private readonly supabase = inject(SupabaseService);
  private readonly pos = inject(PosService);

  private get db() {
    return this.supabase.client;
  }

  private settings: CompanyPrintInfo | null = null;

  /** Company branding + printer flag (cached per app run). */
  async companyPrintInfo(): Promise<CompanyPrintInfo> {
    if (this.settings) return this.settings;
    const { data, error } = await this.db
      .from('companies')
      .select('name, code, address, logo_path, enable_printer')
      .limit(1)
      .single();
    if (error) throw error;
    const logoPath = data.logo_path;
    this.settings = {
      name: data.name,
      code: data.code,
      logoUrl: logoPath
        ? logoPath.startsWith('http')
          ? logoPath
          : this.db.storage.from('company-logos').getPublicUrl(logoPath).data.publicUrl
        : null,
      address: data.address,
      printerEnabled: data.enable_printer,
    };
    return this.settings;
  }

  /** Drop the cached settings so the next print reflects new branding (logo/name/address). */
  invalidateCompanyInfo(): void {
    this.settings = null;
  }

  async printerEnabled(): Promise<boolean> {
    try {
      return (await this.companyPrintInfo()).printerEnabled;
    } catch {
      return false;
    }
  }

  /** A receipt is proof of a finalized sale, so incomplete and voided orders are rejected. */
  async buildReceiptData(orderId: string): Promise<{ order: OrderData; meta: PrintMeta }> {
    return this.buildOrderDocumentData(orderId, 'receipt');
  }

  /** Proformas remain printable, but only as explicitly labeled draft documents. */
  async buildProformaData(orderId: string): Promise<{ order: OrderData; meta: PrintMeta }> {
    return this.buildOrderDocumentData(orderId, 'proforma');
  }

  /** Order + lines (labeled via variant_catalog) + payments + customer → OrderData. */
  private async buildOrderDocumentData(
    orderId: string,
    documentType: 'receipt' | 'proforma'
  ): Promise<{ order: OrderData; meta: PrintMeta }> {
    const [order, lines, payments] = await Promise.all([
      this.pos.getOrder(orderId),
      this.pos.orderLines(orderId),
      this.pos.orderPayments(orderId),
    ]);
    if (documentType === 'receipt' && order.status !== 'completed') {
      throw new Error('Receipt unavailable — complete payment before printing.');
    }
    if (documentType === 'proforma' && order.status !== 'draft') {
      throw new Error('This order is no longer a draft, so its proforma cannot be printed.');
    }
    const variants = await this.pos.variantsByIds(lines.map(l => l.variant_id));
    const byId = new Map(variants.map(v => [v.variant_id, v]));

    const orderData: OrderData = {
      id: order.id,
      code: order.code,
      state: toLegacyState(order.status),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      expiresAt: order.expires_at,
      orderPlacedAt: order.created_at,
      total: order.total,
      totalWithTax: order.total, // prices are tax-inclusive; no split (as the old app)
      currencyCode: 'KES',
      customer: order.customers
        ? {
            id: order.customer_id!,
            firstName: order.customers.first_name,
            lastName: order.customers.last_name ?? '',
          }
        : null,
      lines: lines.map(l => {
        const v = byId.get(l.variant_id);
        return {
          id: l.id,
          quantity: Number(l.quantity),
          linePrice: l.line_total,
          linePriceWithTax: l.line_total,
          productVariant: {
            id: l.variant_id,
            name: v?.variant_name ?? l.label,
            product:
              v?.product_id && v.product_name
                ? {
                    id: v.product_id,
                    name: v.product_name,
                    ...(v.manufacturer_name ? { manufacturerName: v.manufacturer_name } : {}),
                  }
                : undefined,
          },
        };
      }),
      payments: payments.map(p => ({
        id: p.id,
        state: 'Settled',
        amount: p.amount,
        method: p.method_code,
        createdAt: p.created_at,
        metadata: p.reference ? { reference: p.reference } : undefined,
      })),
    };

    const meta: PrintMeta = {
      documentType,
      paymentMethodName:
        payments.length > 0
          ? [...new Set(payments.map(p => METHOD_LABELS[p.method_code] ?? p.method_code))].join(
              ' + '
            )
          : order.is_credit_sale
            ? 'Credit'
            : 'N/A',
    };
    return { order: orderData, meta };
  }

  /** Cashier session + drawer counts → a synthetic OrderData for the cashier-slip doc type. */
  async buildCashierSlipData(sessionId: string): Promise<{ order: OrderData; meta: PrintMeta }> {
    const { data: session, error: e1 } = await this.db
      .from('cashier_sessions')
      .select('*, cash_drawer_counts(*)')
      .eq('id', sessionId)
      .single();
    if (e1) throw e1;

    const counts = (session.cash_drawer_counts ?? []) as {
      id: string;
      count_type: string;
      declared_cash: number;
      expected_cash: number;
      variance: number;
    }[];

    const lines: OrderData['lines'] = [];
    for (const c of counts) {
      lines.push({
        id: c.id,
        quantity: 1,
        linePrice: c.declared_cash,
        linePriceWithTax: c.declared_cash,
        productVariant: {
          id: c.id,
          name: `${c.count_type === 'opening' ? 'Opening' : 'Closing'} float (declared)`,
        },
      });
      if (c.variance !== 0) {
        lines.push({
          id: `${c.id}-variance`,
          quantity: 1,
          linePrice: c.variance,
          linePriceWithTax: c.variance,
          productVariant: {
            id: `${c.id}-variance`,
            name: `${c.count_type === 'opening' ? 'Opening' : 'Closing'} variance`,
          },
        });
      }
    }

    const order: OrderData = {
      id: session.id,
      code: `TILL-${session.id.slice(0, 8).toUpperCase()}`,
      state: session.status === 'open' ? 'Draft' : 'Fulfilled',
      createdAt: session.opened_at,
      updatedAt: session.closed_at ?? session.opened_at,
      orderPlacedAt: session.closed_at ?? session.opened_at,
      total: session.closing_declared ?? lines.reduce((sum, l) => sum + l.linePriceWithTax, 0),
      totalWithTax:
        session.closing_declared ?? lines.reduce((sum, l) => sum + l.linePriceWithTax, 0),
      currencyCode: 'KES',
      customer: null,
      lines,
      payments: [],
    };
    return { order, meta: { documentType: 'cashier-slip' } };
  }

  /** Purchase + supplier + stock-in movements (the purchase's lines) → PurchaseData. */
  async buildPurchaseData(purchaseId: string): Promise<PurchaseData> {
    const { data: purchase, error: e1 } = await this.db
      .from('purchases')
      .select('*, customers(first_name, last_name, email)')
      .eq('id', purchaseId)
      .single();
    if (e1) throw e1;

    // record_purchase logs one movement per line (source_type 'InventoryPurchase').
    const { data: movements, error: e2 } = await this.db
      .from('inventory_movements')
      .select('*')
      .eq('source_type', 'InventoryPurchase')
      .eq('source_id', purchaseId);
    if (e2) throw e2;

    const variants = await this.pos.variantsByIds((movements ?? []).map(m => m.variant_id));
    const byId = new Map(variants.map(v => [v.variant_id, v]));

    const { data: payments } = await this.db
      .from('purchase_payments')
      .select('amount')
      .eq('purchase_id', purchaseId);
    const paid = (payments ?? []).reduce((sum, p) => sum + p.amount, 0);
    const paymentStatus = paid >= purchase.total_cost ? 'paid' : paid > 0 ? 'partial' : 'pending';

    return {
      id: purchase.id,
      supplierId: purchase.supplier_id,
      purchaseDate: purchase.created_at,
      referenceNumber: purchase.reference,
      totalCost: purchase.total_cost,
      paymentStatus,
      status: 'confirmed',
      supplier: purchase.customers
        ? {
            id: purchase.supplier_id,
            firstName: purchase.customers.first_name,
            lastName: purchase.customers.last_name ?? undefined,
            emailAddress: purchase.customers.email ?? undefined,
          }
        : null,
      lines: (movements ?? []).map(m => {
        const v = byId.get(m.variant_id);
        return {
          id: m.id,
          variantId: m.variant_id,
          quantity: Number(m.quantity),
          unitCost: m.unit_cost ?? 0,
          totalCost: m.total_cost ?? Math.round(Number(m.quantity) * (m.unit_cost ?? 0)),
          variant: v
            ? {
                id: v.variant_id!,
                name: v.variant_name ?? variantLabel(v),
                product:
                  v.product_id && v.product_name
                    ? {
                        id: v.product_id,
                        name: v.product_name,
                        ...(v.manufacturer_name ? { manufacturerName: v.manufacturer_name } : {}),
                      }
                    : undefined,
              }
            : undefined,
        };
      }),
    };
  }
}

/**
 * Print Template System
 *
 * Composable and extensible print template architecture.
 * Each template defines its own rendering logic and styles.
 */

export interface OrderData {
  id: string;
  code: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  orderPlacedAt?: string | null;
  total: number;
  totalWithTax: number;
  currencyCode: string;
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    emailAddress?: string | null;
    phoneNumber?: string | null;
  } | null;
  lines: Array<{
    id: string;
    quantity: number;
    linePrice: number;
    linePriceWithTax: number;
    productVariant: {
      id: string;
      name: string;
      sku: string;
    };
  }>;
  payments?: Array<{
    id: string;
    state: string;
    amount: number;
    method: string;
    createdAt: string;
    metadata?: any;
  }>;
  fulfillments?: Array<{
    id: string;
    state: string;
    method: string;
    trackingCode?: string | null;
    createdAt: string;
  }>;
  billingAddress?: {
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country: string;
    phoneNumber?: string | null;
  } | null;
  shippingAddress?: {
    fullName?: string | null;
    streetLine1: string;
    streetLine2?: string | null;
    city?: string | null;
    postalCode?: string | null;
    province?: string | null;
    country: string;
    phoneNumber?: string | null;
  } | null;
}

/**
 * Abstract base class for print templates
 */
export abstract class PrintTemplate {
  abstract name: string;
  abstract width: string;

  /**
   * Render the order data into HTML
   */
  abstract render(order: OrderData, companyLogo?: string | null): string;

  /**
   * Get CSS styles for this template
   */
  abstract getStyles(): string;

  /**
   * Format currency amount
   */
  protected formatCurrency(amount: number, currencyCode: string = 'KES'): string {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
    }).format(amount / 100); // Convert from cents
  }

  /**
   * Format date
   */
  protected formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Get customer display name
   */
  protected getCustomerName(order: OrderData): string {
    if (!order.customer) {
      return 'Walk-in Customer';
    }
    const firstName = order.customer.firstName || '';
    const lastName = order.customer.lastName || '';
    return `${firstName} ${lastName}`.trim() || 'Walk-in Customer';
  }

  /**
   * Check if customer is walk-in
   */
  protected isWalkInCustomer(order: OrderData): boolean {
    if (!order.customer) return true;
    const email = order.customer.emailAddress?.toLowerCase() || '';
    const firstName = order.customer.firstName?.toLowerCase() || '';
    return email === 'walkin@pos.local' || firstName === 'walk-in';
  }
}

/**
 * 52mm Receipt Template
 * Compact format for thermal receipt printers
 */
export class Receipt52mmTemplate extends PrintTemplate {
  name = '52mm Receipt';
  width = '52mm';

  render(order: OrderData, companyLogo?: string | null): string {
    const customerName = this.getCustomerName(order);
    const isWalkIn = this.isWalkInCustomer(order);
    const date = order.orderPlacedAt
      ? this.formatDate(order.orderPlacedAt)
      : this.formatDate(order.createdAt);
    const subtotal = order.total;
    const tax = order.totalWithTax - order.total;
    const total = order.totalWithTax;
    const paymentMethod = order.payments?.[0]?.method || 'N/A';

    let html = `
            <div class="print-template receipt-52mm">
                <div class="receipt-header">
                    ${companyLogo ? `<img src="${companyLogo}" alt="Logo" class="company-logo" />` : ''}
                    <h1 class="company-name">Your Company</h1>
                    <p class="receipt-meta">
                        <span>Order: ${order.code}</span><br>
                        <span>Date: ${date}</span>
                    </p>
                </div>
                ${!isWalkIn ? `<div class="customer-info"><strong>Customer:</strong> ${customerName}</div>` : ''}
                <div class="items-section">
                    <table class="items-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Price</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

    order.lines.forEach((line) => {
      const itemName = line.productVariant.name;
      const quantity = line.quantity;
      const price = this.formatCurrency(line.linePriceWithTax, order.currencyCode);
      html += `
                            <tr>
                                <td>${itemName}</td>
                                <td class="text-right">${quantity}</td>
                                <td class="text-right">${price}</td>
                            </tr>
            `;
    });

    html += `
                        </tbody>
                    </table>
                </div>
                <div class="totals-section">
                    <div class="total-row">
                        <span>Subtotal:</span>
                        <span>${this.formatCurrency(subtotal, order.currencyCode)}</span>
                    </div>
                    ${
                      tax > 0
                        ? `
                    <div class="total-row">
                        <span>Tax:</span>
                        <span>${this.formatCurrency(tax, order.currencyCode)}</span>
                    </div>
                    `
                        : ''
                    }
                    <div class="total-row total-row-final">
                        <span><strong>Total:</strong></span>
                        <span><strong>${this.formatCurrency(total, order.currencyCode)}</strong></span>
                    </div>
                </div>
                <div class="payment-section">
                    <p><strong>Payment:</strong> ${paymentMethod}</p>
                </div>
                <div class="receipt-footer">
                    <p>Thank you for your business!</p>
                </div>
            </div>
        `;

    return html;
  }

  getStyles(): string {
    return `
            /* Request receipt roll size; driver support varies. 297mm is a typical roll length. */
            @page { size: 52mm 297mm; margin: 0; }
            @media print {
                .print-template.receipt-52mm {
                    width: 52mm;
                    max-width: 52mm;
                    margin: 0 auto;
                    padding: 8mm 4mm;
                    font-size: 10px;
                    line-height: 1.4;
                }
                .receipt-52mm .company-logo {
                    max-width: 100%;
                    max-height: 40mm;
                    width: auto;
                    height: auto;
                    object-fit: contain;
                    margin-bottom: 8px;
                    display: block;
                    margin-left: auto;
                    margin-right: auto;
                }
                .receipt-52mm .company-name {
                    font-size: 14px;
                    font-weight: bold;
                    margin: 8px 0;
                    text-align: center;
                }
                .receipt-52mm .receipt-meta {
                    font-size: 9px;
                    text-align: center;
                    margin-bottom: 12px;
                }
                .receipt-52mm .customer-info {
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px dashed #000;
                }
                .receipt-52mm .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 12px;
                }
                .receipt-52mm .items-table th,
                .receipt-52mm .items-table td {
                    padding: 4px 2px;
                    text-align: left;
                    font-size: 9px;
                }
                .receipt-52mm .items-table th {
                    border-bottom: 1px solid #000;
                    font-weight: bold;
                }
                .receipt-52mm .items-table .text-right {
                    text-align: right;
                }
                .receipt-52mm .totals-section {
                    margin-top: 12px;
                    padding-top: 8px;
                    border-top: 1px dashed #000;
                }
                .receipt-52mm .total-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                    font-size: 9px;
                }
                .receipt-52mm .total-row-final {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid #000;
                    font-size: 11px;
                }
                .receipt-52mm .payment-section {
                    margin-top: 12px;
                    padding-top: 8px;
                    border-top: 1px dashed #000;
                    font-size: 9px;
                }
                .receipt-52mm .receipt-footer {
                    margin-top: 16px;
                    text-align: center;
                    font-size: 9px;
                }
            }
        `;
  }
}

/**
 * A4 Invoice Template
 * Full-size professional invoice format
 */
export class A4Template extends PrintTemplate {
  name = 'A4 Invoice';
  width = '210mm';

  render(order: OrderData, companyLogo?: string | null): string {
    const customerName = this.getCustomerName(order);
    const isWalkIn = this.isWalkInCustomer(order);
    const date = order.orderPlacedAt
      ? this.formatDate(order.orderPlacedAt)
      : this.formatDate(order.createdAt);
    const subtotal = order.total;
    const tax = order.totalWithTax - order.total;
    const total = order.totalWithTax;
    const paymentMethod = order.payments?.[0]?.method || 'N/A';
    const hasFulfillment = order.fulfillments && order.fulfillments.length > 0;
    const hasShipping = order.shippingAddress && !isWalkIn;

    let html = `
            <div class="print-template a4-invoice">
                <div class="invoice-header">
                    <div class="company-info">
                        ${companyLogo ? `<img src="${companyLogo}" alt="Logo" class="company-logo" />` : ''}
                        <h1 class="company-name">Your Company</h1>
                        <p class="company-address">Your Company Address</p>
                    </div>
                    <div class="invoice-meta">
                        <h2>INVOICE</h2>
                        <p><strong>Order #:</strong> ${order.code}</p>
                        <p><strong>Date:</strong> ${date}</p>
                        <p><strong>Status:</strong> ${this.getStatusLabel(order.state)}</p>
                    </div>
                </div>
                <div class="invoice-body">
                    <div class="customer-section">
                        <h3>Bill To:</h3>
                        <p><strong>${customerName}</strong></p>
                        ${order.customer?.emailAddress ? `<p>${order.customer.emailAddress}</p>` : ''}
                        ${
                          order.billingAddress
                            ? `
                            <p>${order.billingAddress.streetLine1}</p>
                            ${order.billingAddress.streetLine2 ? `<p>${order.billingAddress.streetLine2}</p>` : ''}
                            <p>${order.billingAddress.city || ''} ${order.billingAddress.postalCode || ''}</p>
                            <p>${order.billingAddress.country}</p>
                        `
                            : ''
                        }
                    </div>
                    ${
                      hasShipping
                        ? `
                    <div class="shipping-section hidden-print">
                        <h3>Ship To:</h3>
                        <p><strong>${order.shippingAddress?.fullName || customerName}</strong></p>
                        ${
                          order.shippingAddress
                            ? `
                            <p>${order.shippingAddress.streetLine1}</p>
                            ${order.shippingAddress.streetLine2 ? `<p>${order.shippingAddress.streetLine2}</p>` : ''}
                            <p>${order.shippingAddress.city || ''} ${order.shippingAddress.postalCode || ''}</p>
                            <p>${order.shippingAddress.country}</p>
                        `
                            : ''
                        }
                    </div>
                    `
                        : ''
                    }
                    <div class="items-section">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>SKU</th>
                                    <th class="text-right">Quantity</th>
                                    <th class="text-right">Unit Price</th>
                                    <th class="text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

    order.lines.forEach((line) => {
      const itemName = line.productVariant.name;
      const sku = line.productVariant.sku;
      const quantity = line.quantity;
      const unitPrice = line.linePriceWithTax / line.quantity;
      const lineTotal = line.linePriceWithTax;
      html += `
                                <tr>
                                    <td>${itemName}</td>
                                    <td>${sku}</td>
                                    <td class="text-right">${quantity}</td>
                                    <td class="text-right">${this.formatCurrency(unitPrice, order.currencyCode)}</td>
                                    <td class="text-right">${this.formatCurrency(lineTotal, order.currencyCode)}</td>
                                </tr>
            `;
    });

    html += `
                            </tbody>
                        </table>
                    </div>
                    <div class="totals-section">
                        <div class="totals-table">
                            <div class="total-row">
                                <span>Subtotal:</span>
                                <span>${this.formatCurrency(subtotal, order.currencyCode)}</span>
                            </div>
                            ${
                              tax > 0
                                ? `
                            <div class="total-row">
                                <span>Tax:</span>
                                <span>${this.formatCurrency(tax, order.currencyCode)}</span>
                            </div>
                            `
                                : ''
                            }
                            <div class="total-row total-row-final">
                                <span><strong>Total:</strong></span>
                                <span><strong>${this.formatCurrency(total, order.currencyCode)}</strong></span>
                            </div>
                        </div>
                    </div>
                    <div class="payment-section">
                        <h3>Payment Information</h3>
                        <p><strong>Method:</strong> ${paymentMethod}</p>
                        <p><strong>Status:</strong> ${this.getPaymentStatus(order.payments?.[0]?.state || '')}</p>
                    </div>
                    ${
                      hasFulfillment
                        ? `
                    <div class="fulfillment-section hidden-print">
                        <h3>Fulfillment Information</h3>
                        ${order.fulfillments
                          ?.map(
                            (f) => `
                            <p><strong>Method:</strong> ${f.method}</p>
                            ${f.trackingCode ? `<p><strong>Tracking:</strong> ${f.trackingCode}</p>` : ''}
                            <p><strong>Status:</strong> ${f.state}</p>
                        `,
                          )
                          .join('')}
                    </div>
                    `
                        : ''
                    }
                </div>
                <div class="invoice-footer">
                    <p>Thank you for your business!</p>
                </div>
            </div>
        `;

    return html;
  }

  getStyles(): string {
    return `
            @page { size: 210mm 297mm; margin: 0; }
            @media print {
                .print-template.a4-invoice {
                    width: 210mm;
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 20mm;
                    font-size: 12px;
                    line-height: 1.6;
                }
                .a4-invoice .company-logo {
                    max-width: 80mm;
                    max-height: 40mm;
                    width: auto;
                    height: auto;
                    object-fit: contain;
                    margin-bottom: 12px;
                    display: block;
                }
                .a4-invoice .invoice-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #000;
                }
                .a4-invoice .company-name {
                    font-size: 24px;
                    font-weight: bold;
                    margin: 8px 0;
                }
                .a4-invoice .invoice-meta h2 {
                    font-size: 28px;
                    margin: 0 0 12px 0;
                }
                .a4-invoice .invoice-body {
                    margin-top: 30px;
                }
                .a4-invoice .customer-section,
                .a4-invoice .shipping-section {
                    margin-bottom: 30px;
                }
                .a4-invoice .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                }
                .a4-invoice .items-table th,
                .a4-invoice .items-table td {
                    padding: 8px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }
                .a4-invoice .items-table th {
                    background-color: #f5f5f5;
                    font-weight: bold;
                }
                .a4-invoice .items-table .text-right {
                    text-align: right;
                }
                .a4-invoice .totals-section {
                    margin-top: 30px;
                }
                .a4-invoice .totals-table {
                    width: 300px;
                    margin-left: auto;
                }
                .a4-invoice .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #ddd;
                }
                .a4-invoice .total-row-final {
                    border-top: 2px solid #000;
                    border-bottom: none;
                    margin-top: 8px;
                    padding-top: 12px;
                    font-size: 16px;
                }
                .a4-invoice .payment-section,
                .a4-invoice .fulfillment-section {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                }
                .a4-invoice .invoice-footer {
                    margin-top: 50px;
                    text-align: center;
                    padding-top: 20px;
                    border-top: 1px solid #ddd;
                }
            }
        `;
  }

  private getStatusLabel(state: string): string {
    const statusMap: Record<string, string> = {
      Draft: 'Draft',
      ArrangingPayment: 'Unpaid',
      PaymentSettled: 'Paid',
      Fulfilled: 'Paid',
    };
    return statusMap[state] || state;
  }

  private getPaymentStatus(state: string): string {
    const statusMap: Record<string, string> = {
      Created: 'Created',
      Authorized: 'Authorized',
      Settled: 'Settled',
      Declined: 'Declined',
    };
    return statusMap[state] || state;
  }
}

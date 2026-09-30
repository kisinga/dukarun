import { describe, expect, it } from 'vitest';
import { renderDocument, type PaperFormat } from '@dukarun/documents';
import { orderDocumentContent, purchaseDocumentContent } from './document-adapters';
import type { OrderData, PurchaseData } from './print-data';

const order: OrderData = {
  id: 'sale',
  code: 'SALE-1',
  state: 'Fulfilled',
  createdAt: '2026-09-01T10:30:00Z',
  updatedAt: '2026-09-01T10:30:00Z',
  total: 500,
  totalWithTax: 500,
  currencyCode: 'KES',
  customer: {
    id: 'buyer',
    firstName: 'Amina',
    lastName: 'Ali',
    emailAddress: 'buyer@example.test',
  },
  billingAddress: { streetLine1: 'Market Road', city: 'Nairobi', country: 'Kenya' },
  lines: [
    {
      id: 'line',
      quantity: 2,
      linePrice: 500,
      linePriceWithTax: 500,
      productVariant: {
        id: 'item',
        name: 'Large',
        product: { id: 'product', name: 'Tea', manufacturerName: 'Acme' },
      },
    },
  ],
};

describe('Existing internal document details', () => {
  it.each<PaperFormat>(['receipt-52mm', 'receipt-80mm', 'a4'])(
    'prints staff attribution and the Dukarun signature on %s',
    paper => {
      const content = orderDocumentContent(
        order,
        { name: 'Shop' },
        { documentType: 'receipt', paymentMethodName: 'Cash', servedBy: 'Amina' },
        paper
      );
      const { html } = renderDocument(content, undefined, paper);
      expect(html).toContain('<dt>Served by</dt><dd>Amina</dd>');
      expect(html).toContain('Powered by Dukarun');
    }
  );

  it('retains A4 unit prices, customer details and timestamps while thermal keeps three columns', () => {
    const meta = { paymentMethodName: 'M-Pesa', servedBy: 'Musa' };
    const sheet = orderDocumentContent(order, { name: 'Shop' }, meta, 'a4');
    expect(sheet.sections[0].rows[0]).toEqual(['Tea – Large · Acme', '2', 'KES 250', 'KES 500']);
    expect(sheet.metadata).toContainEqual({ label: 'Customer email', value: 'buyer@example.test' });
    expect(sheet.metadata).toContainEqual({
      label: 'Billing address',
      value: 'Market Road, Nairobi, Kenya',
    });
    expect(sheet.metadata).toContainEqual({ label: 'Status', value: 'Paid' });
    expect(sheet.metadata.find(row => row.label === 'Date')?.value).toMatch(/\d{1,2}:30/);
    const thermal = orderDocumentContent(order, { name: 'Shop' }, meta, 'receipt-52mm');
    expect(thermal.sections[0].rows[0]).toEqual(['Tea – Large · Acme', '2', 'KES 500']);
    expect(thermal.metadata).toContainEqual({ label: 'Payment', value: 'M-Pesa' });
    expect(thermal.metadata).toContainEqual({ label: 'Served by', value: 'Musa' });
  });

  it('keeps supplier email, fractional unit cost and the existing purchase payment method', () => {
    const purchase: PurchaseData = {
      id: 'purchase',
      supplierId: 'supplier',
      purchaseDate: '2026-09-01',
      totalCost: 2.5,
      paymentStatus: 'paid',
      status: 'confirmed',
      supplier: { id: 'supplier', emailAddress: 'supplier@example.test' },
      lines: [{ id: 'line', variantId: 'tea', quantity: 2, unitCost: 1.25, totalCost: 2.5 }],
    };
    const content = purchaseDocumentContent(
      purchase,
      { name: 'Shop' },
      { paymentMethodName: 'Bank' }
    );
    expect(content.metadata).toContainEqual({ label: 'Supplier', value: 'supplier@example.test' });
    expect(content.metadata).toContainEqual({ label: 'Payment', value: 'Bank' });
    expect(content.sections[0].rows[0]).toEqual(['tea', '2', 'KES 1.25', 'KES 2.5']);
    expect(
      purchaseDocumentContent({ ...purchase, status: 'draft' }, { name: 'Shop' }).metadata.find(
        row => row.label === 'Payment'
      )?.value
    ).toBe('');
  });
});

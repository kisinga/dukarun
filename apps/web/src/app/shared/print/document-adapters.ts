import {
  documentDate,
  documentMoney,
  type DocumentContent,
  type DocumentIdentity,
  type PaperFormat,
} from '@dukarun/documents';
import type { OrderData, PrintMeta, PurchaseData } from './print-data';
function documentTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
function itemName(variant: OrderData['lines'][number]['productVariant']): string {
  const product = variant.product;
  const name =
    product?.name && product.name !== variant.name
      ? `${product.name} – ${variant.name}`
      : variant.name;
  return product?.manufacturerName ? `${name} · ${product.manufacturerName}` : name;
}
export function orderDocumentContent(
  order: OrderData,
  identity: DocumentIdentity,
  meta?: PrintMeta,
  paper: PaperFormat = 'a4'
): DocumentContent {
  const kind = meta?.documentType ?? 'receipt';
  const money = (value: number) => documentMoney(value, order.currencyCode);
  const vat = meta?.showVatBreakdown && meta.vatRegistered;
  const totals: DocumentContent['totals'][number][] = [];
  if (vat) {
    totals.push({
      label: 'Net amount',
      value: money(order.netTotal ?? order.totalWithTax - (order.taxTotal ?? 0)),
    });
    for (const tax of order.taxBreakdown ?? [])
      totals.push({
        label:
          tax.classification === 'zero_rated'
            ? 'Zero-rated VAT'
            : tax.classification === 'exempt'
              ? 'VAT exempt'
              : `VAT ${tax.rateBps / 100}%`,
        value: money(['standard', 'special'].includes(tax.classification) ? tax.tax : tax.gross),
      });
    if (!order.taxBreakdown?.length)
      totals.push({ label: 'VAT', value: money(order.taxTotal ?? 0) });
  }
  totals.push({ label: 'Total', value: money(order.totalWithTax), prominent: true });
  const showPayment = kind !== 'proforma' && kind !== 'cashier-slip';
  const sheet = paper === 'a4';
  const status: Record<string, string> = {
    Draft: 'Draft',
    ArrangingPayment: 'Unpaid',
    PaymentSettled: 'Paid',
    Fulfilled: 'Paid',
  };
  return {
    kind,
    identity: {
      ...identity,
      taxNumber: meta?.showVatBreakdown ? meta.taxRegistrationNumber : null,
    },
    title: vat && ['receipt', 'invoice'].includes(kind) ? 'VAT Invoice' : undefined,
    reference: order.code,
    metadata: [
      { label: 'Date', value: documentTimestamp(order.orderPlacedAt ?? order.createdAt) },
      {
        label: 'Customer',
        value: order.customer
          ? `${order.customer.firstName} ${order.customer.lastName}`.trim()
          : '',
      },
      { label: 'Customer email', value: sheet ? (order.customer?.emailAddress ?? '') : '' },
      {
        label: 'Billing address',
        value:
          sheet && order.billingAddress
            ? [
                order.billingAddress.streetLine1,
                order.billingAddress.streetLine2,
                order.billingAddress.city,
                order.billingAddress.postalCode,
                order.billingAddress.country,
              ]
                .filter(Boolean)
                .join(', ')
            : '',
      },
      {
        label: 'VAT document',
        value: meta?.showVatBreakdown ? (order.taxDocumentNumber ?? '') : '',
      },
      {
        label: 'Valid until',
        value: kind === 'proforma' && order.expiresAt ? documentTimestamp(order.expiresAt) : '',
      },
      { label: 'Payment', value: showPayment ? (meta?.paymentMethodName ?? 'N/A') : '' },
      { label: 'Served by', value: showPayment ? (meta?.servedBy ?? '') : '' },
      {
        label: 'Status',
        value:
          kind === 'cashier-slip' && !order.code.startsWith('TILL-')
            ? 'PAY AT CASHIER'
            : sheet
              ? (status[order.state] ?? order.state)
              : '',
      },
    ],
    sections: [
      {
        columns: [
          { label: 'Item' },
          { label: 'Qty', numeric: true },
          ...(sheet ? [{ label: 'Unit price', numeric: true }] : []),
          { label: 'Amount', numeric: true },
        ],
        rows: order.lines.map(l => [
          itemName(l.productVariant),
          String(l.quantity),
          ...(sheet ? [money(l.quantity ? l.linePriceWithTax / l.quantity : 0)] : []),
          money(l.linePriceWithTax),
        ]),
      },
    ],
    totals,
  };
}
export function purchaseDocumentContent(
  purchase: PurchaseData,
  identity: DocumentIdentity,
  meta?: PrintMeta
): DocumentContent {
  const sections: DocumentContent['sections'][number][] = [
    {
      columns: [
        { label: 'Item' },
        { label: 'Qty', numeric: true },
        { label: 'Unit cost', numeric: true },
        { label: 'Total', numeric: true },
      ],
      rows: purchase.lines.map(l => [
        l.variant ? itemName(l.variant) : l.variantId,
        String(l.quantity),
        documentMoney(l.unitCost),
        documentMoney(l.totalCost),
      ]),
    },
  ];
  if (purchase.expenses?.length)
    sections.push({
      title: 'Supplier-billed expenses',
      columns: [{ label: 'Expense' }, { label: 'Memo' }, { label: 'Amount', numeric: true }],
      rows: purchase.expenses.map(e => [
        e.custom_label || e.category,
        e.memo ?? '',
        documentMoney(e.amount),
      ]),
    });
  return {
    kind: 'purchase-order',
    identity,
    reference: purchase.referenceNumber ?? purchase.id,
    metadata: [
      { label: 'Date', value: documentDate(purchase.purchaseDate) },
      {
        label: 'Supplier',
        value:
          `${purchase.supplier?.firstName ?? ''} ${purchase.supplier?.lastName ?? ''}`.trim() ||
          purchase.supplier?.emailAddress ||
          'Unknown Supplier',
      },
      { label: 'Supplier email', value: purchase.supplier?.emailAddress ?? '' },
      {
        label: 'Payment',
        value:
          purchase.status === 'confirmed' && purchase.paymentStatus !== 'pending'
            ? (meta?.paymentMethodName ?? 'N/A')
            : '',
      },
      { label: 'Payment status', value: purchase.paymentStatus },
      { label: 'Status', value: purchase.status },
    ],
    sections,
    totals: [{ label: 'Total', value: documentMoney(purchase.totalCost), prominent: true }],
    notes: purchase.notes,
  };
}

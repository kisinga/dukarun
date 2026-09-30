import type { DocumentContent, DocumentIdentity } from './render';
import type { DocumentDesign, DocumentKind, PaperFormat } from './config';

export const documentMoney = (amount: number, currency = 'KES'): string =>
  `${currency} ${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(amount)}`;
export function documentDate(value: string, timeZone = 'Africa/Nairobi'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        // Calendar dates are already local dates; only instants require conversion.
        timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : timeZone,
      });
}
export interface StatementRow {
  id: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}
export interface StatementInput {
  company: DocumentIdentity;
  customerName: string;
  currency: string;
  generatedAt: string;
  rows: readonly StatementRow[];
}
/** Ledger arithmetic remains in the adapter, outside the layout renderer. */
export function statementContent(data: StatementInput): DocumentContent {
  if (!data.rows.length) throw new Error('A statement requires at least one activity row.');
  const rows = [...data.rows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id.localeCompare(b.id)
  );
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const money = (n: number) => documentMoney(n, data.currency);
  return {
    kind: 'statement',
    identity: data.company,
    reference: data.customerName,
    metadata: [
      { label: 'Customer', value: data.customerName },
      { label: 'Generated', value: documentDate(data.generatedAt) },
      { label: 'Period', value: `${documentDate(first.date)} – ${documentDate(last.date)}` },
      { label: 'Currency', value: data.currency },
    ],
    sections: [
      {
        columns: [
          { label: 'Date' },
          { label: 'Reference' },
          { label: 'Description' },
          { label: 'Debit', numeric: true },
          { label: 'Credit', numeric: true },
          { label: 'Balance', numeric: true },
        ],
        rows: rows.map(r => [
          documentDate(r.date),
          r.reference,
          r.description,
          money(r.debit),
          money(r.credit),
          money(r.balance),
        ]),
      },
    ],
    totals: [
      { label: 'Opening balance', value: money(first.balance - first.debit + first.credit) },
      { label: 'Total charged', value: money(rows.reduce((sum, r) => sum + r.debit, 0)) },
      { label: 'Total paid', value: money(rows.reduce((sum, r) => sum + r.credit, 0)) },
      {
        label:
          last.balance > 0
            ? 'Amount due'
            : last.balance < 0
              ? 'Credit available'
              : 'Closing balance',
        value: money(Math.abs(last.balance)),
        prominent: true,
      },
    ],
  };
}
export interface ExternalDocumentInput {
  business_timezone?: string;
  document_design?: DocumentDesign | null;
  document_type: 'receipt' | 'invoice' | 'proforma' | 'purchase_order';
  document_number: string;
  party_name: string;
  issue_date: string;
  valid_until: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  notes: string | null;
  lines: Array<{ description: string; quantity: number; unit_price: number; line_total: number }>;
  payments?: Array<{ method: string; amount: number; reference: string | null; date: string }>;
  show_vat_breakdown?: boolean;
  vat_registered?: boolean;
  tax_document_number?: string | null;
  net_total?: number;
  tax_total?: number;
  tax_breakdown?: Array<{
    code: string;
    classification: string;
    rate_bps: number;
    gross: number;
    net: number;
    tax: number;
  }>;
}
export function externalDocumentContent(
  data: ExternalDocumentInput,
  identity: DocumentIdentity
): DocumentContent {
  const kind: DocumentKind =
    data.document_type === 'purchase_order' ? 'purchase-order' : data.document_type;
  const showVat = data.document_design?.showVatBreakdown ?? data.show_vat_breakdown;
  const vat = showVat && data.vat_registered;
  const totals: DocumentContent['totals'][number][] = [];
  if (vat) {
    totals.push({ label: 'Net amount', value: documentMoney(data.net_total ?? data.total) });
    for (const tax of data.tax_breakdown ?? [])
      totals.push({
        label:
          tax.classification === 'zero_rated'
            ? 'Zero-rated VAT'
            : tax.classification === 'exempt'
              ? 'VAT exempt'
              : `VAT ${tax.rate_bps / 100}%`,
        value: documentMoney(
          ['standard', 'special'].includes(tax.classification) ? tax.tax : tax.gross
        ),
      });
    if (!data.tax_breakdown?.length)
      totals.push({ label: 'VAT', value: documentMoney(data.tax_total ?? 0) });
  }
  totals.push({ label: 'Total', value: documentMoney(data.total), prominent: true });
  if (kind === 'receipt' || kind === 'invoice')
    totals.push(
      { label: 'Paid', value: documentMoney(data.paid) },
      { label: 'Balance', value: documentMoney(data.balance) }
    );
  return {
    kind,
    identity: { ...identity, taxNumber: showVat ? identity.taxNumber : null },
    title: vat && (kind === 'invoice' || kind === 'receipt') ? 'VAT Invoice' : undefined,
    reference: data.tax_document_number || data.document_number,
    metadata: [
      { label: 'Date', value: documentDate(data.issue_date, data.business_timezone) },
      { label: kind === 'purchase-order' ? 'Supplier' : 'Customer', value: data.party_name },
      { label: 'Status', value: data.status },
      {
        label: kind === 'proforma' ? 'Valid until' : 'Due',
        value: data.valid_until ? documentDate(data.valid_until, data.business_timezone) : '',
      },
    ],
    sections: [
      {
        columns: [
          { label: 'Item' },
          { label: 'Qty', numeric: true },
          { label: 'Unit', numeric: true },
          { label: 'Total', numeric: true },
        ],
        rows: data.lines.map(l => [
          l.description,
          String(l.quantity),
          documentMoney(l.unit_price),
          documentMoney(l.line_total),
        ]),
      },
      ...(data.payments?.length
        ? [
            {
              title: 'Payments',
              columns: [
                { label: 'Method' },
                { label: 'Reference' },
                { label: 'Date' },
                { label: 'Amount', numeric: true },
              ],
              rows: data.payments.map(p => [
                p.method,
                p.reference ?? '',
                documentDate(p.date, data.business_timezone),
                documentMoney(p.amount),
              ]),
            },
          ]
        : []),
    ],
    totals,
    notes: data.notes,
  };
}

export interface SampleTaxOptions {
  registered: boolean;
  showBreakdown: boolean;
  rateBps: number;
  classification?: string;
}
export function sampleDocument(
  kind: DocumentKind,
  identity: DocumentIdentity,
  tax?: SampleTaxOptions,
  paper: PaperFormat = 'receipt-52mm'
): DocumentContent {
  if (kind === 'statement')
    return {
      ...statementContent({
        company: identity,
        customerName: 'Sample customer',
        currency: 'KES',
        generatedAt: '2026-09-01T12:00:00Z',
        rows: [
          {
            id: 'sample-sale',
            date: '2026-09-01',
            reference: 'SAMPLE-001',
            description: 'Sample purchase',
            debit: 500,
            credit: 0,
            balance: 500,
          },
          {
            id: 'sample-payment',
            date: '2026-09-02',
            reference: 'SAMPLE-PAY',
            description: 'Sample payment',
            debit: 0,
            credit: 200,
            balance: 300,
          },
        ],
      }),
      sample: true,
    };
  const totals: DocumentContent['totals'][number][] = [];
  if (tax?.registered && tax.showBreakdown && kind !== 'purchase-order') {
    const taxable = !['exempt', 'zero_rated'].includes(tax.classification ?? 'standard');
    const rate = taxable ? Math.max(0, tax.rateBps) : 0;
    const net = [400, 100].reduce(
      (sum, gross) => sum + Math.round((gross * 10000) / (10000 + rate)),
      0
    );
    totals.push(
      { label: 'Net amount', value: documentMoney(net) },
      {
        label:
          tax.classification === 'exempt'
            ? 'VAT exempt'
            : tax.classification === 'zero_rated'
              ? 'Zero-rated VAT'
              : `VAT ${rate / 100}%`,
        value: documentMoney(taxable ? 500 - net : 500),
      }
    );
  }
  totals.push({ label: 'Total', value: 'KES 500', prominent: true });
  return {
    kind,
    identity,
    reference: 'SAMPLE-001',
    title:
      tax?.registered && tax.showBreakdown && ['receipt', 'invoice'].includes(kind)
        ? 'VAT Invoice'
        : undefined,
    sample: true,
    metadata: [
      { label: 'Date', value: '1 Sep 2026' },
      {
        label: kind === 'purchase-order' ? 'Supplier' : 'Customer',
        value: kind === 'purchase-order' ? 'Sample supplier' : 'Sample customer',
      },
      {
        label: 'Status',
        value:
          kind === 'proforma' ? 'Draft' : kind === 'cashier-slip' ? 'Pay at cashier' : 'Sample',
      },
    ],
    sections: [
      {
        columns: [
          { label: 'Item' },
          { label: 'Qty', numeric: true },
          ...(paper === 'a4' ? [{ label: 'Unit price', numeric: true }] : []),
          { label: 'Amount', numeric: true },
        ],
        rows: [
          ['Sample item', '2', ...(paper === 'a4' ? ['KES 200'] : []), 'KES 400'],
          ['Another sample item', '1', ...(paper === 'a4' ? ['KES 100'] : []), 'KES 100'],
        ],
      },
    ],
    totals,
  };
}

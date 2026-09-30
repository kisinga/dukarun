export const DOCUMENT_TYPES = [
  'receipt',
  'invoice',
  'proforma',
  'purchase-order',
  'statement',
  'cashier-slip',
] as const;
export type DocumentKind = (typeof DOCUMENT_TYPES)[number];
export type DocumentLayout = 'classic' | 'compact' | 'modern';
export type PaperFormat = 'receipt-52mm' | 'receipt-80mm' | 'a4';
/** Prepared by the existing merchant encoder; public viewers need no encoder dependency. */
export interface PreparedQr {
  size: number;
  bits: string;
}
export interface DocumentDesign {
  version: 1;
  layout: DocumentLayout;
  message: string;
  /** Omitted designs inherit the existing company print preference. */
  showVatBreakdown?: boolean;
  custom: { label: string; value: string; display: 'text' | 'qr' | 'both'; qr?: PreparedQr };
}
export type DocumentDesigns = Partial<Record<DocumentKind, DocumentDesign>>;
export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  receipt: 'Receipt',
  invoice: 'Invoice',
  proforma: 'Proforma invoice',
  'purchase-order': 'Purchase order',
  statement: 'Customer statement',
  'cashier-slip': 'Cashier slip',
};
export function defaultDesign(kind: DocumentKind): DocumentDesign {
  return {
    version: 1,
    layout: 'classic',
    message: kind === 'receipt' ? 'Thank you for your business!' : '',
    custom: { label: '', value: '', display: 'text' },
  };
}
/** Unknown/older payloads retain compatible defaults; configuration is never executable HTML. */
export function readDesign(kind: DocumentKind, value: unknown): DocumentDesign {
  if (!value || typeof value !== 'object') return defaultDesign(kind);
  const candidate = value as DocumentDesign;
  return validateDesign(candidate) ? structuredClone(candidate) : defaultDesign(kind);
}
export function validateDesign(value: DocumentDesign): boolean {
  return (
    value.version === 1 &&
    ['classic', 'compact', 'modern'].includes(value.layout) &&
    typeof value.message === 'string' &&
    value.message.length <= 1000 &&
    (value.showVatBreakdown === undefined || typeof value.showVatBreakdown === 'boolean') &&
    !!value.custom &&
    typeof value.custom.label === 'string' &&
    value.custom.label.length <= 60 &&
    typeof value.custom.value === 'string' &&
    value.custom.value.length <= 300 &&
    ['text', 'qr', 'both'].includes(value.custom.display) &&
    (value.custom.qr === undefined || validQr(value.custom.qr))
  );
}
export function validQr(qr: PreparedQr): boolean {
  return (
    !!qr &&
    Number.isInteger(qr.size) &&
    qr.size >= 21 &&
    qr.size <= 101 &&
    (qr.size - 21) % 4 === 0 &&
    typeof qr.bits === 'string' &&
    qr.bits.length === qr.size * qr.size &&
    /^[01]+$/.test(qr.bits)
  );
}
export interface ShopSetupState {
  auto_offer?: boolean;
  offered?: boolean;
  deferred?: boolean;
  identity_reviewed?: boolean;
  address_deferred?: boolean;
  documents_reviewed?: boolean;
}
export function suggestShopAddress(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55)
      .replace(/-$/, '') || 'my-shop'
  );
}
export function shopWebUrl(origin: string, slug: string | null | undefined): string {
  return slug ? `${origin.replace(/\/$/, '')}/${encodeURIComponent(slug)}` : '';
}

export interface StorefrontCartLine {
  shopSlug: string;
  productId: string;
  variantId: string;
  packId?: string | null;
  unitName?: string;
  stockUnit?: string;
  unitsPerUnit?: number;
  productName: string;
  variantName: string;
  price: number;
  quantity: number;
  imagePath: string | null;
  productUrl: string;
}

export interface StorefrontCartShop {
  slug: string;
  name: string;
  whatsappNumber: string | null;
}

export function formatCartKes(amount: number): string {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

export function storefrontCartLineLabel(
  line: Pick<
    StorefrontCartLine,
    'productName' | 'variantName' | 'unitName' | 'unitsPerUnit' | 'stockUnit'
  >
): string {
  const label =
    !line.variantName || line.variantName === 'Default'
      ? line.productName
      : `${line.productName} · ${line.variantName}`;
  return (line.unitsPerUnit ?? 1) > 1
    ? `${label} · ${line.unitName} (${line.unitsPerUnit} ${line.stockUnit || 'item'})`
    : label;
}

export function sanitizeCartQuantity(quantity: number): number {
  return Math.max(1, Math.min(999, Math.round(quantity)));
}

export function storefrontCartTotal(lines: readonly StorefrontCartLine[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.price * line.quantity), 0);
}

export function storefrontCartCount(lines: readonly StorefrontCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function buildStorefrontCartMessage(
  shopName: string,
  lines: readonly StorefrontCartLine[],
  shopUrl: string
): string {
  const summary = lines
    .map((line, index) => {
      const total = Math.round(line.price * line.quantity);
      return `${index + 1}. ${storefrontCartLineLabel(line)}\n   Qty: ${line.quantity}\n   Price: ${formatCartKes(line.price)} each\n   Subtotal: ${formatCartKes(total)}`;
    })
    .join('\n\n');
  return [
    `Hello ${shopName}! I'd like to place this order:`,
    '',
    summary,
    '',
    `*Estimated total:* ${formatCartKes(storefrontCartTotal(lines))}`,
    '',
    `Shop: ${shopUrl}`,
  ].join('\n');
}

export function buildStorefrontProductMessage(
  shopName: string,
  itemLabel: string,
  unitLabel: string,
  quantity: number,
  unitPrice: number,
  productUrl: string
): string {
  return [
    `Hello ${shopName}! I'd like to order:`,
    '',
    `*Item:* ${itemLabel}`,
    `*Unit:* ${unitLabel}`,
    `*Quantity:* ${quantity}`,
    `*Price each:* ${formatCartKes(unitPrice)}`,
    `*Estimated total:* ${formatCartKes(quantity * unitPrice)}`,
    '',
    `Product: ${productUrl}`,
  ].join('\n');
}

export function storefrontLineId(line: Pick<StorefrontCartLine, 'variantId' | 'packId'>): string {
  return line.packId ? `${line.variantId}:${line.packId}` : line.variantId;
}

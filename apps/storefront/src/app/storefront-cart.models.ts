export interface StorefrontCartLine {
  shopSlug: string;
  productId: string;
  variantId: string;
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
  line: Pick<StorefrontCartLine, 'productName' | 'variantName'>
): string {
  return !line.variantName || line.variantName === 'Default'
    ? line.productName
    : `${line.productName} · ${line.variantName}`;
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
      return `${index + 1}. ${storefrontCartLineLabel(line)}\n   Qty: ${line.quantity}\n   Price: ${formatCartKes(line.price)} each\n   Line: ${formatCartKes(total)}`;
    })
    .join('\n\n');
  return [
    `Hello ${shopName}! I'd like to order:`,
    '',
    summary,
    '',
    `Estimated total: ${formatCartKes(storefrontCartTotal(lines))}`,
    '',
    `Catalogue: ${shopUrl}`,
  ].join('\n');
}

/**
 * Build a WhatsApp click-to-chat link. wa.me expects the number as digits only (no "+" or spaces).
 */
export function buildWhatsAppLink(phoneE164: string, message: string): string {
  const digits = (phoneE164 || '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Prefilled enquiry message for a product, including a link back to the product page. */
export function productEnquiryMessage(
  storeName: string,
  productName: string,
  price: string,
  url: string
): string {
  const lines = [
    `Hello ${storeName}, I'd like to order:`,
    '',
    price ? `${productName} — ${price}` : productName,
    url,
  ];
  return lines.join('\n');
}

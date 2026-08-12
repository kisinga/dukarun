export const DUKARUN_WHATSAPP_NUMBER = '254788922222';
export const DUKARUN_WHATSAPP_DISPLAY = '+254 788 922 222';

export function dukarunWhatsAppUrl(
  message = 'Hello Dukarun, I would like to learn more about Dukarun.'
): string {
  return `https://wa.me/${DUKARUN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

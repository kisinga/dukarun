import type { PlatformSalesperson } from '../../core/platform.service';

/** Build the permanent, attributable registration URL shown to a salesperson. */
export function salesInvitationUrl(appPublicUrl: string, invitationCode: string): string {
  const baseUrl = appPublicUrl.replace(/\/+$/, '');
  return `${baseUrl}/register?sales_code=${encodeURIComponent(invitationCode)}`;
}

export function salesInvitationMessage(
  person: Pick<PlatformSalesperson, 'name' | 'invitation_code'>,
  invitationUrl: string
): string {
  return [
    `Hi ${person.name},`,
    '',
    'Here is your Dukarun salesperson invitation.',
    `Invitation code: *${person.invitation_code}*`,
    '',
    `Register here: ${invitationUrl}`,
  ].join('\n');
}

/**
 * WhatsApp accepts digits only. Kenyan local numbers are expanded so the
 * optional phone captured by the admin opens the intended conversation.
 */
export function whatsappPhoneNumber(phone: string | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

export function salesInvitationWhatsAppUrl(
  person: Pick<PlatformSalesperson, 'name' | 'phone' | 'invitation_code'>,
  invitationUrl: string
): string {
  const phone = whatsappPhoneNumber(person.phone);
  const message = salesInvitationMessage(person, invitationUrl);
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(message)}`;
}

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
    `Hi ${person.name} 👋`,
    '',
    'Your Dukarun referral kit is ready.',
    '',
    'Share or forward this message to a new customer. When they sign up using your link or code, the registration will be tracked to you.',
    '',
    `Your sales code: *${person.invitation_code}*`,
    'Customer signup link:',
    invitationUrl,
    '',
    "The attached QR opens the same signup link. You don't need to register or log in—this is for customers you refer.",
    '',
    'Go bring the next biashara online 🚀',
  ].join('\n');
}

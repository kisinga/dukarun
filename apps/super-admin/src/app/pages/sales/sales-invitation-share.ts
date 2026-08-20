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

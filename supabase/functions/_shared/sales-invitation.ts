export interface SalesInvitationDetails {
  name: string;
  invitation_code: string;
}

export function platformSalesInvitationUrl(appPublicUrl: string, invitationCode: string): string {
  return `${appPublicUrl.replace(/\/+$/, '')}/register?sales_code=${encodeURIComponent(invitationCode)}`;
}

export function platformSalesInvitationCaption(
  person: SalesInvitationDetails,
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

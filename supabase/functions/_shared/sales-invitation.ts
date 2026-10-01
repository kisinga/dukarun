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
    'Dukarun',
    '',
    `Hi ${person.name} 👋`,
    '',
    'Your Dukarun referral kit is ready.',
    '',
    'Share the signup link or QR code below with a new customer. When they sign up using your link or code, their registration will be attributed to you.',
    '',
    `Your sales code: *${person.invitation_code}*`,
    'Customer signup link:',
    invitationUrl,
    '',
    "The attached QR code opens the same signup link. You don't need to register or log in to use this referral kit.",
  ].join('\n');
}

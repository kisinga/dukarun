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

export type InvitationDeliveryStatus =
  'queued' | 'whatsapp_sent' | 'sms_fallback_sent' | 'failed' | 'not_queued';
export type InvitationDeliveryError =
  | 'quota_exhausted'
  | 'provider_not_configured'
  | 'provider_rejected'
  | 'max_attempts_exceeded'
  | 'template_unavailable'
  | 'delivery_failed';

export interface InvitationDeliveryView {
  status?: 'pending' | 'expired';
  expires_at?: string;
  delivery_status: InvitationDeliveryStatus;
  delivery_channel: 'sms' | 'whatsapp' | null;
  delivery_error?: InvitationDeliveryError | null;
  can_resend_at: string | null;
}

export function isInvitationExpired(invitation: InvitationDeliveryView, now = Date.now()): boolean {
  return (
    invitation.status === 'expired' ||
    Boolean(invitation.expires_at && Date.parse(invitation.expires_at) <= now)
  );
}

export function invitationDeliveryLabel(invitation: InvitationDeliveryView): string {
  if (isInvitationExpired(invitation)) return 'Expired';
  switch (invitation.delivery_status) {
    case 'whatsapp_sent':
      return 'WhatsApp sent';
    case 'sms_fallback_sent':
      return 'SMS fallback sent';
    case 'queued':
      return invitation.delivery_channel === 'sms' ? 'SMS queued' : 'WhatsApp queued';
    case 'failed':
      return 'Delivery failed';
    default:
      return 'Message not queued';
  }
}

export function invitationDeliveryTone(
  invitation: InvitationDeliveryView
): 'success' | 'warning' | 'error' | 'neutral' {
  if (isInvitationExpired(invitation)) return 'neutral';
  if (
    invitation.delivery_status === 'whatsapp_sent' ||
    invitation.delivery_status === 'sms_fallback_sent'
  ) {
    return 'success';
  }
  if (invitation.delivery_status === 'queued') return 'warning';
  if (invitation.delivery_status === 'failed') return 'error';
  return 'neutral';
}

export function invitationDeliveryHint(invitation: InvitationDeliveryView): string {
  if (isInvitationExpired(invitation)) return 'Resend to renew access for another 7 days.';
  if (invitation.delivery_error) return invitationQueueFailureMessage(invitation.delivery_error);
  switch (invitation.delivery_status) {
    case 'sms_fallback_sent':
      return 'WhatsApp failed, so Dukarun used SMS.';
    case 'failed':
    case 'not_queued':
      return 'The invitation remains valid; resend after resolving messaging access.';
    case 'queued':
      return 'Delivery may take a moment.';
    default:
      return 'The phone owner can sign in to join.';
  }
}

export function invitationQueueFailureMessage(
  error: InvitationDeliveryError | string | null | undefined
): string {
  switch (error) {
    case 'quota_exhausted':
      return 'Messaging quota reached. Wait for renewal or upgrade, then resend.';
    case 'provider_not_configured':
      return 'Messaging is not configured. Contact support, then resend.';
    case 'provider_rejected':
      return 'The provider rejected this number. Confirm it, then resend.';
    case 'max_attempts_exceeded':
      return 'Delivery retries were exhausted. Confirm the number, then resend.';
    case 'template_unavailable':
      return 'The invitation message is unavailable. Contact support before resending.';
    default:
      return 'Delivery failed. Confirm messaging access and the phone number, then resend.';
  }
}

export function canResendInvitation(invitation: InvitationDeliveryView, now: number): boolean {
  return !invitation.can_resend_at || Date.parse(invitation.can_resend_at) <= now;
}

export function invitationResendTitle(invitation: InvitationDeliveryView, now: number): string {
  if (canResendInvitation(invitation, now)) {
    return 'Send a new invitation message and extend expiry';
  }
  const remaining = Math.max(
    1,
    Math.ceil((Date.parse(invitation.can_resend_at ?? '') - now) / 60_000)
  );
  return `Resend available in ${remaining} minute${remaining === 1 ? '' : 's'}`;
}

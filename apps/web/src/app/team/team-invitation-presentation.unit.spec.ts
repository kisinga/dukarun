import { describe, expect, it } from 'vitest';
import {
  canResendInvitation,
  invitationDeliveryHint,
  invitationDeliveryLabel,
  invitationDeliveryTone,
  invitationQueueFailureMessage,
  invitationResendTitle,
  isInvitationExpired,
  type InvitationDeliveryView,
} from './team-invitation-presentation';

function invitation(
  status: InvitationDeliveryView['delivery_status'],
  channel: InvitationDeliveryView['delivery_channel'] = 'whatsapp',
  canResendAt: string | null = null
): InvitationDeliveryView {
  return { delivery_status: status, delivery_channel: channel, can_resend_at: canResendAt };
}

describe('team invitation presentation', () => {
  it('distinguishes provider success, fallback, and recoverable failure', () => {
    expect(invitationDeliveryLabel(invitation('whatsapp_sent'))).toBe('WhatsApp sent');
    expect(invitationDeliveryLabel(invitation('sms_fallback_sent', 'sms'))).toBe(
      'SMS fallback sent'
    );
    expect(invitationDeliveryTone(invitation('failed'))).toBe('error');
    expect(invitationDeliveryHint(invitation('not_queued'))).toContain('invitation remains valid');
  });

  it('labels the channel currently queued', () => {
    expect(invitationDeliveryLabel(invitation('queued', 'whatsapp'))).toBe('WhatsApp queued');
    expect(invitationDeliveryLabel(invitation('queued', 'sms'))).toBe('SMS queued');
  });

  it('enforces and explains the five-minute resend cooldown', () => {
    const now = Date.parse('2026-08-18T10:00:00Z');
    const waiting = invitation('failed', 'whatsapp', '2026-08-18T10:02:01Z');
    expect(canResendInvitation(waiting, now)).toBe(false);
    expect(invitationResendTitle(waiting, now)).toBe('Resend available in 3 minutes');
    expect(canResendInvitation(waiting, Date.parse('2026-08-18T10:02:01Z'))).toBe(true);
  });

  it('keeps expired invitations visible as renewable actions', () => {
    const expired = {
      ...invitation('whatsapp_sent'),
      status: 'expired' as const,
      expires_at: '2026-08-17T10:00:00Z',
    };
    expect(isInvitationExpired(expired, Date.parse('2026-08-18T10:00:00Z'))).toBe(true);
    expect(invitationDeliveryLabel(expired)).toBe('Expired');
    expect(invitationDeliveryHint(expired)).toContain('renew access');
  });

  it('turns safe delivery codes into useful recovery guidance', () => {
    expect(invitationQueueFailureMessage('quota_exhausted')).toContain('quota reached');
    expect(invitationQueueFailureMessage('provider_rejected')).toContain('Confirm it');
    expect(invitationQueueFailureMessage('provider_not_configured')).toContain('Contact support');
  });
});

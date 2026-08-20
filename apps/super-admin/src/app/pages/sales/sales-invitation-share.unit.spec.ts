import { describe, expect, it } from 'vitest';
import {
  salesInvitationMessage,
  salesInvitationUrl,
  salesInvitationWhatsAppUrl,
  whatsappPhoneNumber,
} from './sales-invitation-share';

const person = {
  name: 'Amina N.',
  phone: '0712 345 678',
  invitation_code: 'AMINA+7',
};

describe('sales invitation sharing', () => {
  it('builds a registration URL without duplicate slashes and escapes the code', () => {
    expect(salesInvitationUrl('https://app.dukarun.com/', person.invitation_code)).toBe(
      'https://app.dukarun.com/register?sales_code=AMINA%2B7'
    );
  });

  it('includes both the visible code and registration link in the message', () => {
    const url = salesInvitationUrl('https://app.dukarun.com', person.invitation_code);
    const message = salesInvitationMessage(person, url);

    expect(message).toContain('Invitation code: *AMINA+7*');
    expect(message).toContain(`Register here: ${url}`);
  });

  it('normalizes Kenyan local phone numbers for a direct WhatsApp chat', () => {
    expect(whatsappPhoneNumber('0712 345 678')).toBe('254712345678');
    expect(whatsappPhoneNumber('+254 712 345 678')).toBe('254712345678');
    expect(whatsappPhoneNumber(null)).toBeNull();
  });

  it('creates an encoded WhatsApp deep link addressed to the salesperson', () => {
    const url = salesInvitationUrl('https://app.dukarun.com', person.invitation_code);
    const whatsAppUrl = new URL(salesInvitationWhatsAppUrl(person, url));

    expect(whatsAppUrl.hostname).toBe('wa.me');
    expect(whatsAppUrl.pathname).toBe('/254712345678');
    expect(whatsAppUrl.searchParams.get('text')).toBe(salesInvitationMessage(person, url));
  });
});

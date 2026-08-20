import { describe, expect, it } from 'vitest';
import { salesInvitationMessage, salesInvitationUrl } from './sales-invitation-share';

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

    expect(message).toContain('Your sales code: *AMINA+7*');
    expect(message).toContain(`Customer signup link:\n${url}`);
    expect(message).toContain("You don't need to register or log in");
    expect(message).not.toContain('Register here');
  });
});

import { EmailEventListener } from '@vendure/email-plugin';
import { OtpEmailEvent } from '../../infrastructure/events/otp-email.event';
import { isSentinelEmail } from '../../utils/email.utils';

export const otpEmailHandler = new EmailEventListener('otp-verification')
  .on(OtpEmailEvent)
  .filter(event => !isSentinelEmail(event.email))
  .setRecipient(event => event.email)
  .setFrom('{{ fromAddress }}')
  .setSubject('Your Verification Code')
  .setTemplateVars(event => ({
    otp: event.otp,
    year: new Date().getFullYear(),
    expiryMinutes: 5,
  }));

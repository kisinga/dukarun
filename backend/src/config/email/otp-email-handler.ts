import { EmailEventListener } from '@vendure/email-plugin';
import { OtpEmailEvent } from '../../events/otp-email.event';

export const otpEmailHandler = new EmailEventListener('otp-verification')
  .on(OtpEmailEvent)
  .setRecipient(event => event.email)
  .setFrom('{{ fromAddress }}')
  .setSubject('Your Verification Code')
  .setTemplateVars(event => ({
    otp: event.otp,
    year: new Date().getFullYear(),
    expiryMinutes: 5,
  }));

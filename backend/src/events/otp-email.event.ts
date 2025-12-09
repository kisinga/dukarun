import { VendureEvent, RequestContext } from '@vendure/core';

/**
 * Event fired when an OTP email needs to be sent
 */
export class OtpEmailEvent extends VendureEvent {
  constructor(
    public ctx: RequestContext,
    public email: string,
    public otp: string
  ) {
    super();
  }
}

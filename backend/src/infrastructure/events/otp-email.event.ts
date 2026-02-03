import { VendureEvent, RequestContext } from '@vendure/core';

/**
 * Event fired when an OTP email needs to be sent.
 * Part of the communication/delivery flow; published by CommunicationService.
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

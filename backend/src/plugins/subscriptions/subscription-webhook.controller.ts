import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { Logger } from '@nestjs/common';
import { PaystackService } from '../../services/payments/paystack.service';
import { SubscriptionService } from '../../services/subscriptions/subscription.service';

@Controller('webhooks/paystack')
export class SubscriptionWebhookController {
  private readonly logger = new Logger(SubscriptionWebhookController.name);

  constructor(
    private paystackService: PaystackService,
    private subscriptionService: SubscriptionService
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any
  ): Promise<{ status: string }> {
    try {
      // Verify webhook signature
      const rawBody = req.rawBody || JSON.stringify(body);
      const isValid = this.paystackService.verifyWebhookSignature(rawBody, signature);

      if (!isValid) {
        this.logger.warn('Invalid webhook signature');
        return { status: 'invalid_signature' };
      }

      const event = body.event;
      const data = body.data;

      this.logger.log(`Received Paystack webhook: ${event}`);

      // Handle different webhook events
      switch (event) {
        case 'charge.success':
          await this.handleChargeSuccess(data);
          break;

        case 'subscription.create':
          await this.handleSubscriptionCreate(data);
          break;

        case 'subscription.disable':
          await this.handleSubscriptionDisable(data);
          break;

        case 'subscription.not_renew':
          await this.handleSubscriptionNotRenew(data);
          break;

        case 'subscription.expiring_cards':
          this.logger.warn('Subscription expiring cards notification', data);
          break;

        default:
          this.logger.log(`Unhandled webhook event: ${event}`);
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error(
        `Webhook processing error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Still return 200 to Paystack to prevent retries
      return { status: 'error' };
    }
  }

  private async handleChargeSuccess(data: any): Promise<void> {
    try {
      const metadata = data.metadata || {};
      const channelId = metadata.channelId;
      const type = metadata.type;

      // Only process subscription payments
      if (type !== 'subscription' || !channelId) {
        this.logger.log(`Skipping non-subscription charge: ${data.reference}`);
        return;
      }

      const ctx = RequestContext.empty();

      // Verify transaction with Paystack
      const verification = await this.paystackService.verifyTransaction(data.reference);
      if (verification.data.status !== 'success') {
        this.logger.warn(`Charge verification failed for ${data.reference}`);
        return;
      }

      // Process successful payment using tier/billing cycle tied to this reference
      await this.subscriptionService.processSuccessfulPayment(ctx, channelId, {
        reference: data.reference,
        amount: verification.data.amount,
        customerCode: verification.data.customer?.customer_code || metadata.customerCode,
        subscriptionCode: metadata.subscriptionCode,
        tierId: metadata.tierId,
        billingCycle: metadata.billingCycle,
      });

      this.logger.log(`Successfully processed payment for channel ${channelId}`);
    } catch (error) {
      this.logger.error(
        `Error handling charge.success: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private async handleSubscriptionCreate(data: any): Promise<void> {
    try {
      const metadata = data.metadata || {};
      const channelId = metadata.channelId;

      if (!channelId) {
        this.logger.warn('Subscription created without channelId in metadata');
        return;
      }

      const ctx = RequestContext.empty();

      // Update channel with subscription code
      // Note: This assumes the channel was already updated during payment processing
      // This is mainly for future subscription renewals
      this.logger.log(`Subscription created for channel ${channelId}: ${data.subscription_code}`);
    } catch (error) {
      this.logger.error(
        `Error handling subscription.create: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private async handleSubscriptionDisable(data: any): Promise<void> {
    try {
      const metadata = data.metadata || {};
      const channelId = metadata.channelId;

      if (!channelId) {
        this.logger.warn('Subscription disabled without channelId in metadata');
        return;
      }

      const ctx = RequestContext.empty();

      // Mark subscription as cancelled
      // The subscription will remain active until expiration date
      this.logger.log(`Subscription disabled for channel ${channelId}`);

      // Optionally, you could update the channel status here
      // For now, we'll let it expire naturally
    } catch (error) {
      this.logger.error(
        `Error handling subscription.disable: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  private async handleSubscriptionNotRenew(data: any): Promise<void> {
    try {
      const metadata = data.metadata || {};
      const channelId = metadata.channelId;

      if (!channelId) {
        this.logger.warn('Subscription not renewing without channelId in metadata');
        return;
      }

      this.logger.log(`Subscription will not renew for channel ${channelId}`);

      // The subscription will expire at the end of the current billing period
      // This is handled by the subscription status check
    } catch (error) {
      this.logger.error(
        `Error handling subscription.not_renew: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }
}

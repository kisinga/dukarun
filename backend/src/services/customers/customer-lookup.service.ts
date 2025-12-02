import { Injectable, Logger } from '@nestjs/common';
import { Customer, RequestContext, TransactionalConnection } from '@vendure/core';
import { formatPhoneNumber } from '../../utils/phone.utils';

/**
 * Customer Lookup Service
 *
 * Provides methods to find customers by phone number.
 * Used to prevent duplicate customer creation.
 */
@Injectable()
export class CustomerLookupService {
  private readonly logger = new Logger(CustomerLookupService.name);

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Find a customer by phone number
   *
   * Normalizes the phone number before lookup to ensure consistency.
   * Phone numbers are normalized to format: 07XXXXXXXX
   *
   * @param ctx - Request context
   * @param phoneNumber - Phone number in any format (will be normalized)
   * @returns Customer if found, null otherwise
   */
  async findCustomerByPhone(ctx: RequestContext, phoneNumber: string): Promise<Customer | null> {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return null;
    }

    try {
      // Normalize phone number to ensure consistent lookup
      const normalizedPhone = formatPhoneNumber(phoneNumber);

      const customerRepo = this.connection.getRepository(ctx, Customer);

      const customer = await customerRepo.findOne({
        where: { phoneNumber: normalizedPhone },
      });

      if (customer) {
        this.logger.debug(`Found customer ${customer.id} with phone number ${normalizedPhone}`);
      }

      return customer || null;
    } catch (error) {
      // If phone number format is invalid, log and return null
      this.logger.warn(
        `Invalid phone number format for lookup: ${phoneNumber}`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }

  /**
   * Find a customer by phone number or email
   *
   * First tries to find by phone number, then falls back to email if provided.
   *
   * @param ctx - Request context
   * @param phoneNumber - Phone number (optional)
   * @param emailAddress - Email address (optional)
   * @returns Customer if found, null otherwise
   */
  async findCustomerByPhoneOrEmail(
    ctx: RequestContext,
    phoneNumber?: string,
    emailAddress?: string
  ): Promise<Customer | null> {
    // Try phone number first (more reliable identifier)
    if (phoneNumber) {
      const byPhone = await this.findCustomerByPhone(ctx, phoneNumber);
      if (byPhone) {
        return byPhone;
      }
    }

    // Fall back to email if phone not found
    if (emailAddress) {
      const customerRepo = this.connection.getRepository(ctx, Customer);
      const byEmail = await customerRepo.findOne({
        where: { emailAddress },
      });

      if (byEmail) {
        this.logger.debug(`Found customer ${byEmail.id} with email ${emailAddress}`);
        return byEmail;
      }
    }

    return null;
  }
}

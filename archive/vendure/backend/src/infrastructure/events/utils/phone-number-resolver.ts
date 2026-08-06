import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, User, UserService, Customer, CustomerService } from '@vendure/core';
import { formatPhoneNumber, validatePhoneNumber } from '../../../utils/phone.utils';

/**
 * Phone Number Resolver
 *
 * Centralized utility for resolving phone numbers from event data.
 * Provides a single source of truth for phone number resolution logic.
 *
 * Resolution order:
 * 1. Explicit phone number in data.phoneNumber (highest priority)
 * 2. User entity if targetUserId is set
 * 3. Customer entity if targetCustomerId is set
 *
 * Returns null if no phone number can be resolved.
 */
@Injectable()
export class PhoneNumberResolver {
  private readonly logger = new Logger(PhoneNumberResolver.name);

  constructor(
    private readonly userService: UserService,
    private readonly customerService: CustomerService
  ) {}

  /**
   * Resolve phone number from event data
   *
   * @param ctx Request context
   * @param data Event data with optional phone number or target user/customer IDs
   * @returns Phone number or null if not resolvable
   */
  async resolvePhoneNumber(
    ctx: RequestContext,
    data: {
      phoneNumber?: string;
      targetUserId?: string;
      targetCustomerId?: string;
    }
  ): Promise<string | null> {
    // 1. Check for explicit phone number in data (highest priority)
    if (data?.phoneNumber) {
      const phoneNumber = data.phoneNumber;
      if (validatePhoneNumber(phoneNumber)) {
        return formatPhoneNumber(phoneNumber);
      } else {
        this.logger.warn(`Invalid phone number in event data: ${phoneNumber}`);
        return null;
      }
    }

    // 2. Try to get phone number from User entity if targetUserId is set
    if (data?.targetUserId) {
      try {
        const user = await this.userService.getUserById(ctx, data.targetUserId);
        if (user?.identifier) {
          // User.identifier is the phone number for Vendure users
          if (validatePhoneNumber(user.identifier)) {
            return user.identifier;
          } else {
            this.logger.warn(
              `Invalid phone number for user ${data.targetUserId}: ${user.identifier}`
            );
            return null;
          }
        }
      } catch (error) {
        // User not found or error fetching - continue to next resolution method
      }
    }

    // 3. Try to get phone number from Customer entity if targetCustomerId is set
    if (data?.targetCustomerId) {
      try {
        const customer = await this.customerService.findOne(ctx, data.targetCustomerId);
        if (customer?.phoneNumber) {
          if (validatePhoneNumber(customer.phoneNumber)) {
            return customer.phoneNumber;
          } else {
            this.logger.warn(
              `Invalid phone number for customer ${data.targetCustomerId}: ${customer.phoneNumber}`
            );
            return null;
          }
        }
      } catch (error) {
        // Customer not found or error fetching - return null
      }
    }

    // No phone number could be resolved
    return null;
  }

  /**
   * Check if event data has required identifiers to potentially resolve a phone number
   *
   * This is a lightweight check that doesn't require database queries.
   *
   * @param data Event data
   * @returns true if data has identifiers that could resolve to a phone number
   */
  canResolve(data: {
    phoneNumber?: string;
    targetUserId?: string;
    targetCustomerId?: string;
  }): boolean {
    return !!(data?.phoneNumber || data?.targetUserId || data?.targetCustomerId);
  }
}

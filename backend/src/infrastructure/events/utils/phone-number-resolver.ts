import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, User, UserService, Customer, CustomerService } from '@vendure/core';
import { ChannelEvent } from '../types/channel-event.interface';
import { validatePhoneNumber } from '../../../utils/phone.utils';

/**
 * Phone Number Resolver
 *
 * Centralized utility for resolving phone numbers from ChannelEvent.
 * Provides a single source of truth for phone number resolution logic.
 *
 * Resolution order:
 * 1. Explicit phone number in event.data.phoneNumber (highest priority)
 * 2. User entity if event.targetUserId is set
 * 3. Customer entity if event.targetCustomerId is set
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
   * Resolve phone number from event
   *
   * @param ctx Request context
   * @param event Channel event
   * @returns Phone number or null if not resolvable
   */
  async resolvePhoneNumber(ctx: RequestContext, event: ChannelEvent): Promise<string | null> {
    // 1. Check for explicit phone number in event data (highest priority)
    if (event.data?.phoneNumber) {
      const phoneNumber = event.data.phoneNumber;
      if (validatePhoneNumber(phoneNumber)) {
        return phoneNumber;
      } else {
        this.logger.warn(
          `Invalid phone number in event data for event ${event.type}: ${phoneNumber}`
        );
        return null;
      }
    }

    // 2. Try to get phone number from User entity if targetUserId is set
    if (event.targetUserId) {
      try {
        const user = await this.userService.getUserById(ctx, event.targetUserId);
        if (user?.identifier) {
          // User.identifier is the phone number for Vendure users
          if (validatePhoneNumber(user.identifier)) {
            return user.identifier;
          } else {
            this.logger.warn(
              `Invalid phone number for user ${event.targetUserId}: ${user.identifier}`
            );
            return null;
          }
        }
      } catch (error) {
        // User not found or error fetching - continue to next resolution method
      }
    }

    // 3. Try to get phone number from Customer entity if targetCustomerId is set
    if (event.targetCustomerId) {
      try {
        const customer = await this.customerService.findOne(ctx, event.targetCustomerId);
        if (customer?.phoneNumber) {
          if (validatePhoneNumber(customer.phoneNumber)) {
            return customer.phoneNumber;
          } else {
            this.logger.warn(
              `Invalid phone number for customer ${event.targetCustomerId}: ${customer.phoneNumber}`
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
   * Check if event has required identifiers to potentially resolve a phone number
   *
   * This is a lightweight check that doesn't require database queries.
   * Use this in canHandle() methods to determine if resolution is possible.
   *
   * @param event Channel event
   * @returns true if event has identifiers that could resolve to a phone number
   */
  canResolve(event: ChannelEvent): boolean {
    return !!(event.data?.phoneNumber || event.targetUserId || event.targetCustomerId);
  }
}

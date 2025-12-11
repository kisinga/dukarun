import { Injectable, Logger } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  Customer,
  CustomerService,
  Permission,
  RequestContext,
  UserInputError,
} from '@vendure/core';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { generateSentinelEmailFromPhone, getWalkInEmail } from '../../utils/email.utils';
import { CustomerLookupService } from '../../services/customers/customer-lookup.service';

/**
 * Input type for creating a customer
 */
interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber?: string;
  title?: string;
  customFields?: Record<string, any>;
}

/**
 * Customer Resolver
 *
 * Provides custom customer mutations with duplicate prevention.
 */
@Resolver()
@Injectable()
export class CustomerResolver {
  private readonly logger = new Logger(CustomerResolver.name);

  constructor(
    private readonly customerService: CustomerService,
    private readonly customerLookupService: CustomerLookupService
  ) {}

  /**
   * Create a customer with duplicate prevention by phone number.
   *
   * Checks for existing customer by phone number before creating.
   * If found, returns the existing customer instead of creating a duplicate.
   */
  @Mutation()
  @Allow(Permission.CreateCustomer)
  async createCustomerSafe(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateCustomerInput,
    @Args('isWalkIn', { nullable: true }) isWalkIn?: boolean
  ): Promise<Customer> {
    // Normalize phone number if provided
    let normalizedPhone: string | undefined;
    if (input.phoneNumber && input.phoneNumber !== '0000000000') {
      try {
        normalizedPhone = formatPhoneNumber(input.phoneNumber);
      } catch (error) {
        throw new UserInputError(
          `Invalid phone number format: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Handle Walk-in logic (Backend Control)
    if (isWalkIn) {
      this.logger.log('Creating Walk-in customer - generating sentinel email');
      input.emailAddress = getWalkInEmail();
    }
    // Handle Regular/Supplier missing email -> generate from phone
    else if ((!input.emailAddress || input.emailAddress.trim() === '') && normalizedPhone) {
      this.logger.log(`Generating sentinel email for customer with phone: ${normalizedPhone}`);
      input.emailAddress = generateSentinelEmailFromPhone(normalizedPhone, 'customer');
    }

    // Check for existing customer by phone number
    if (normalizedPhone) {
      const existingCustomer = await this.customerLookupService.findCustomerByPhone(
        ctx,
        normalizedPhone
      );

      if (existingCustomer) {
        this.logger.log(
          `Customer with phone ${normalizedPhone} already exists: ${existingCustomer.id}`
        );

        // Return existing customer
        return existingCustomer;
      }
    }

    // No existing customer found, proceed with normal creation
    // Use Vendure's built-in createCustomer which handles email uniqueness
    const result = await this.customerService.create(ctx, input);

    // Handle error result (e.g., EmailAddressConflictError)
    if ('errorCode' in result) {
      throw new UserInputError(result.message || 'Failed to create customer');
    }

    return result;
  }
}

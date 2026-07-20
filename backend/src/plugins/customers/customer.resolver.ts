import { Injectable, Logger } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
  Allow,
  Ctx,
  Customer,
  CustomerEvent,
  CustomerService,
  EventBus,
  Permission,
  RequestContext,
  TransactionalConnection,
  User,
  UserInputError,
} from '@vendure/core';
import { formatPhoneNumber } from '../../utils/phone.utils';
import { generateSentinelEmailFromPhone, getWalkInEmail } from '../../utils/email.utils';
import { CustomerCreationService } from '../../services/customers/customer-creation.service';
import { CustomerLifecycleService } from '../../services/customers/customer-lifecycle.service';
import type { UpdateCustomerInput } from '../../services/customers/customer-lifecycle.service';
import { CustomerLookupService } from '../../services/customers/customer-lookup.service';
import { DeletionResult } from '@vendure/common/lib/generated-types';
import { IsNull } from 'typeorm';

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
    private readonly customerCreationService: CustomerCreationService,
    private readonly customerLookupService: CustomerLookupService,
    private readonly eventBus: EventBus,
    private readonly connection: TransactionalConnection
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

    // Check for existing customer by phone number (including soft-deleted)
    if (normalizedPhone) {
      const existingCustomer = await this.customerLookupService.findCustomerByPhoneIncludingDeleted(
        ctx,
        normalizedPhone
      );

      if (existingCustomer) {
        this.logger.log(
          `Customer with phone ${normalizedPhone} already exists: ${existingCustomer.id} (deletedAt: ${existingCustomer.deletedAt ?? 'none'})`
        );

        const customerRepo = this.connection.getRepository(ctx, Customer);

        // Reactivate if soft-deleted
        if (existingCustomer.deletedAt) {
          this.logger.log(`Reactivating soft-deleted customer ${existingCustomer.id}`);
          existingCustomer.deletedAt = null as any;
        }

        // Update core fields from input
        if (input.firstName) existingCustomer.firstName = input.firstName;
        if (input.lastName) existingCustomer.lastName = input.lastName;
        if (input.emailAddress && input.emailAddress.trim() !== '') {
          existingCustomer.emailAddress = input.emailAddress;
        }
        if (input.title) existingCustomer.title = input.title;

        // Merge customFields: preserve existing, overlay new
        if (input.customFields) {
          existingCustomer.customFields = {
            ...(existingCustomer.customFields || {}),
            ...input.customFields,
          };
        }

        const updatedCustomer = await customerRepo.save(existingCustomer);
        await this.eventBus.publish(
          new CustomerEvent(ctx, updatedCustomer, 'updated', {
            firstName: input.firstName,
            lastName: input.lastName,
            emailAddress: input.emailAddress,
            phoneNumber: input.phoneNumber,
            title: input.title,
            customFields: input.customFields,
          })
        );
        this.logger.log(`Updated and returned existing customer ${updatedCustomer.id}`);
        return updatedCustomer;
      }
    }

    // No existing customer found. If the phone already belongs to an existing User
    // (e.g. an admin), create a Customer record for that same user instead of a
    // duplicate User.
    if (normalizedPhone) {
      const existingUser = await this.connection.getRepository(ctx, User).findOne({
        where: { identifier: normalizedPhone, deletedAt: IsNull() },
        relations: ['roles'],
      });
      if (existingUser) {
        this.logger.log(
          `Phone ${normalizedPhone} belongs to existing user ${existingUser.id}; creating Customer record for same user`
        );
        return this.customerCreationService.create(
          ctx,
          {
            ...input,
            phoneNumber: normalizedPhone,
          },
          existingUser
        );
      }
    }

    // No existing user found, proceed with Vendure's standard creation path.
    if (normalizedPhone) {
      input.phoneNumber = normalizedPhone;
    }
    return this.customerCreationService.create(ctx, input);
  }
}

/**
 * Admin-only customer mutations. Kept in a separate resolver (registered only
 * for the admin API) because the shop schema does not define these mutations
 * or their types.
 */
@Resolver()
@Injectable()
export class CustomerAdminResolver {
  constructor(private readonly customerLifecycleService: CustomerLifecycleService) {}

  /**
   * Update a customer, protecting shared users (e.g. an admin who is also a
   * customer) from Vendure's stock behavior of rewriting the User login
   * identifier when the email changes.
   */
  @Mutation()
  @Allow(Permission.UpdateCustomer)
  async updateCustomerSafe(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateCustomerInput
  ): Promise<Customer> {
    return this.customerLifecycleService.update(ctx, input);
  }

  /**
   * Delete a customer, protecting shared users (e.g. an admin who is also a
   * customer) from Vendure's stock behavior of soft-deleting the User along
   * with the Customer.
   */
  @Mutation()
  @Allow(Permission.DeleteCustomer)
  async deleteCustomerSafe(
    @Ctx() ctx: RequestContext,
    @Args('id') id: string
  ): Promise<{ result: DeletionResult }> {
    return this.customerLifecycleService.delete(ctx, id);
  }
}

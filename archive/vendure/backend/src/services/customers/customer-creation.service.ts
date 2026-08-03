import { Injectable } from '@nestjs/common';
import {
  Channel,
  Customer,
  CustomerEvent,
  CustomerService,
  EventBus,
  RequestContext,
  RoleService,
  TransactionalConnection,
  User,
} from '@vendure/core';
import { HistoryEntryType } from '@vendure/common/lib/generated-types';
import { IsNull } from 'typeorm';
import { normalizeEmailAddress } from '@vendure/core/dist/common/utils';
import { HistoryService } from '@vendure/core/dist/service/services/history.service';
import { CustomFieldRelationService } from '@vendure/core/dist/service/helpers/custom-field-relation/custom-field-relation.service';
import { NATIVE_AUTH_STRATEGY_NAME } from '@vendure/core/dist/config/auth/native-authentication-strategy';

/**
 * Input type for creating a customer.
 * Mirrors the fields accepted by the public customer resolver.
 */
export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber?: string;
  title?: string;
  customFields?: Record<string, any>;
}

/**
 * Customer Creation Service
 *
 * Wraps Vendure's CustomerService.create with Dukarun-specific behavior:
 * - Allows a Customer record to be created for an existing User (e.g. an admin)
 *   instead of always creating a new User.
 * - Publishes the same CustomerEvent lifecycle events that Vendure emits,
 *   so subscribers (cache-sync, webhooks, etc.) stay consistent.
 *
 * This exists because Vendure's CustomerService.create always creates a new
 * User and cannot attach a Customer entity to an existing User.
 */
@Injectable()
export class CustomerCreationService {
  constructor(
    private readonly customerService: CustomerService,
    private readonly roleService: RoleService,
    private readonly eventBus: EventBus,
    private readonly connection: TransactionalConnection,
    private readonly customFieldRelationService: CustomFieldRelationService,
    private readonly historyService: HistoryService
  ) {}

  /**
   * Create a Customer. If an existing User is supplied, the Customer is linked
   * to that User; otherwise Vendure's standard creation path is used.
   */
  async create(
    ctx: RequestContext,
    input: CreateCustomerInput,
    existingUser?: User
  ): Promise<Customer> {
    if (existingUser) {
      return this.createForExistingUser(ctx, input, existingUser);
    }

    const result = await this.customerService.create(ctx, input);
    if ('errorCode' in result) {
      throw new Error(result.message || 'Failed to create customer');
    }
    return result;
  }

  /**
   * Create a Customer record linked to an existing User (e.g. an admin).
   * Ensures the User also has the customer role and emits the same `created`
   * event Vendure would emit for a new Customer.
   *
   * Mirrors the invariants enforced by Vendure's CustomerService.create:
   * - email addresses are normalized before persistence/conflict checks
   * - duplicate active customers in the same channel are rejected
   * - an existing active customer with the same email belonging to a different
   *   user is rejected
   * - an existing active customer with the same email belonging to the same user
   *   is brought into the current channel rather than duplicated.
   */
  private async createForExistingUser(
    ctx: RequestContext,
    input: CreateCustomerInput,
    user: User
  ): Promise<Customer> {
    const normalizedEmail = normalizeEmailAddress(input.emailAddress);
    const customerRepo = this.connection.getRepository(ctx, Customer);

    // Same-channel / same-email conflict check (matches CustomerService.create).
    const existingCustomerInChannel = await customerRepo
      .createQueryBuilder('customer')
      .leftJoin('customer.channels', 'channel')
      .where('channel.id = :channelId', { channelId: ctx.channelId })
      .andWhere('customer.emailAddress = :emailAddress', { emailAddress: normalizedEmail })
      .andWhere('customer.deletedAt is null')
      .getOne();

    if (existingCustomerInChannel) {
      throw new Error('Email address already exists');
    }

    // Existing active customer with the same email in any channel.
    const existingCustomer = await customerRepo.findOne({
      relations: ['channels', 'user'],
      where: {
        emailAddress: normalizedEmail,
        deletedAt: IsNull(),
      },
    });

    if (existingCustomer) {
      // Belongs to a different user: conflict.
      if (existingCustomer.user?.id !== user.id) {
        throw new Error('Email address already exists');
      }

      // Belongs to the same user: add this channel and update fields rather than
      // creating a duplicate Customer record.
      const channels = existingCustomer.channels || [];
      if (!channels.some(channel => String(channel.id) === String(ctx.channelId))) {
        channels.push(ctx.channel as Channel);
      }

      const updated = await customerRepo.save({
        ...existingCustomer,
        firstName: input.firstName,
        lastName: input.lastName,
        emailAddress: normalizedEmail,
        phoneNumber: input.phoneNumber,
        title: input.title,
        customFields: { ...(existingCustomer.customFields || {}), ...(input.customFields || {}) },
        channels,
      });

      await this.customFieldRelationService.updateRelations(ctx, Customer, input, updated);
      await this.historyService.createHistoryEntryForCustomer({
        ctx,
        customerId: updated.id,
        type: HistoryEntryType.CUSTOMER_DETAIL_UPDATED,
        data: { input },
      });

      await this.eventBus.publish(
        new CustomerEvent(ctx, updated, 'updated', {
          firstName: input.firstName,
          lastName: input.lastName,
          emailAddress: normalizedEmail,
          phoneNumber: input.phoneNumber,
          title: input.title,
          customFields: input.customFields,
        })
      );

      return updated;
    }

    const customerRole = await this.roleService.getCustomerRole(ctx);
    const hasCustomerRole = user.roles?.some(role => role.id === customerRole.id);

    if (!hasCustomerRole) {
      await this.connection
        .getRepository(ctx, User)
        .createQueryBuilder()
        .relation(User, 'roles')
        .of(user.id)
        .add(customerRole.id);
    }

    const customer = new Customer({
      firstName: input.firstName,
      lastName: input.lastName,
      emailAddress: normalizedEmail,
      phoneNumber: input.phoneNumber,
      title: input.title,
      user,
      channels: ctx.channel ? [ctx.channel as Channel] : [],
      customFields: input.customFields || {},
    });

    const savedCustomer = await customerRepo.save(customer);

    await this.customFieldRelationService.updateRelations(ctx, Customer, input, savedCustomer);
    await this.historyService.createHistoryEntryForCustomer({
      ctx,
      customerId: savedCustomer.id,
      type: HistoryEntryType.CUSTOMER_REGISTERED,
      data: { strategy: NATIVE_AUTH_STRATEGY_NAME },
    });
    if (user.verified) {
      await this.historyService.createHistoryEntryForCustomer({
        ctx,
        customerId: savedCustomer.id,
        type: HistoryEntryType.CUSTOMER_VERIFIED,
        data: { strategy: NATIVE_AUTH_STRATEGY_NAME },
      });
    }

    await this.eventBus.publish(
      new CustomerEvent(ctx, savedCustomer, 'created', {
        firstName: input.firstName,
        lastName: input.lastName,
        emailAddress: normalizedEmail,
        phoneNumber: input.phoneNumber,
        title: input.title,
        customFields: input.customFields,
      })
    );

    return savedCustomer;
  }
}

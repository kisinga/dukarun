import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Administrator,
  Customer,
  CustomerEvent,
  CustomerService,
  EventBus,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';
import { CUSTOMER_ROLE_CODE } from '@vendure/common/lib/shared-constants';
import { DeletionResult, HistoryEntryType } from '@vendure/common/lib/generated-types';
import { normalizeEmailAddress } from '@vendure/core/dist/common/utils';
import { HistoryService } from '@vendure/core/dist/service/services/history.service';
import { CustomFieldRelationService } from '@vendure/core/dist/service/helpers/custom-field-relation/custom-field-relation.service';
import { patchEntity } from '@vendure/core/dist/service/helpers/utils/patch-entity';
import { IsNull } from 'typeorm';

/**
 * Input type for updating a customer.
 * Mirrors Vendure's UpdateCustomerInput.
 */
export interface UpdateCustomerInput {
  id: string | number;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  title?: string;
  customFields?: Record<string, any>;
}

/**
 * Customer Lifecycle Service
 *
 * Shared-user-aware update/delete for customers.
 *
 * A Customer can share its User with an Administrator (see CustomerCreationService).
 * Vendure's stock CustomerService assumes the User is customer-owned, which breaks
 * for shared users in two ways:
 * - CustomerService.update rewrites the User (and native auth) identifier when the
 *   email changes, destroying the admin's phone-based login.
 * - CustomerService.softDelete soft-deletes the User, locking the admin out.
 *
 * For shared users we therefore update/delete the Customer row only and never
 * touch the User. Non-shared customers delegate to Vendure's stock behavior.
 */
@Injectable()
export class CustomerLifecycleService {
  private readonly logger = new Logger(CustomerLifecycleService.name);

  constructor(
    private readonly customerService: CustomerService,
    private readonly eventBus: EventBus,
    private readonly connection: TransactionalConnection,
    private readonly customFieldRelationService: CustomFieldRelationService,
    private readonly historyService: HistoryService
  ) {}

  async update(ctx: RequestContext, input: UpdateCustomerInput): Promise<Customer> {
    const customer = await this.loadActiveCustomer(ctx, input.id);

    if (!(await this.hasSharedUser(ctx, customer))) {
      const result = await this.customerService.update(ctx, input as any);
      if ('errorCode' in result) {
        throw new UserInputError(
          (result as { message?: string }).message || 'Failed to update customer'
        );
      }
      return result;
    }

    this.logger.log(
      `Updating customer ${customer.id} with shared user ${customer.user!.id}; leaving User identifier untouched`
    );

    const updateInput = { ...input };
    if (updateInput.emailAddress) {
      const normalizedEmail = normalizeEmailAddress(updateInput.emailAddress);
      if (normalizedEmail !== customer.emailAddress) {
        await this.assertEmailAvailableInChannel(ctx, customer.id, normalizedEmail);
        updateInput.emailAddress = normalizedEmail;
      }
    }

    const updatedCustomer = patchEntity(customer, updateInput as any);
    await this.connection.getRepository(ctx, Customer).save(updatedCustomer, { reload: false });
    await this.customFieldRelationService.updateRelations(
      ctx,
      Customer,
      updateInput,
      updatedCustomer
    );
    await this.historyService.createHistoryEntryForCustomer({
      ctx,
      customerId: updatedCustomer.id,
      type: HistoryEntryType.CUSTOMER_DETAIL_UPDATED,
      data: { input: updateInput },
    });
    await this.eventBus.publish(new CustomerEvent(ctx, updatedCustomer, 'updated', updateInput));

    return updatedCustomer;
  }

  async delete(ctx: RequestContext, id: string | number): Promise<{ result: DeletionResult }> {
    const customer = await this.loadActiveCustomer(ctx, id);

    if (!(await this.hasSharedUser(ctx, customer))) {
      return this.customerService.softDelete(ctx, id);
    }

    this.logger.log(
      `Soft-deleting customer ${customer.id} with shared user ${customer.user!.id}; keeping the User active`
    );

    await this.connection
      .getRepository(ctx, Customer)
      .update({ id: customer.id }, { deletedAt: new Date() });
    await this.eventBus.publish(new CustomerEvent(ctx, customer, 'deleted', customer.id));

    return { result: DeletionResult.DELETED };
  }

  /**
   * A customer has a shared user when its User is not customer-owned: either it
   * carries any role beyond the customer role, or an active Administrator row
   * exists for it (covers cases where role loading is constrained by context).
   * Such a User must never be modified or soft-deleted by customer lifecycle
   * operations.
   */
  private async hasSharedUser(ctx: RequestContext, customer: Customer): Promise<boolean> {
    const user = customer.user;
    if (!user) return false;
    if (user.roles?.some(role => role.code !== CUSTOMER_ROLE_CODE)) {
      return true;
    }
    const activeAdmin = await this.connection.getRepository(ctx, Administrator).findOne({
      where: { user: { id: user.id }, deletedAt: IsNull() },
    });
    return !!activeAdmin;
  }

  private async loadActiveCustomer(ctx: RequestContext, id: string | number): Promise<Customer> {
    const customer = await this.connection.getRepository(ctx, Customer).findOne({
      where: { id: id as any, deletedAt: IsNull() },
      relations: ['user', 'user.roles'],
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  /** Same-channel / same-email conflict check (matches CustomerService.update). */
  private async assertEmailAvailableInChannel(
    ctx: RequestContext,
    customerId: string | number,
    emailAddress: string
  ): Promise<void> {
    const conflict = await this.connection
      .getRepository(ctx, Customer)
      .createQueryBuilder('customer')
      .leftJoin('customer.channels', 'channel')
      .where('channel.id = :channelId', { channelId: ctx.channelId })
      .andWhere('customer.emailAddress = :emailAddress', { emailAddress })
      .andWhere('customer.id != :customerId', { customerId })
      .andWhere('customer.deletedAt is null')
      .getOne();
    if (conflict) {
      throw new UserInputError('Email address already exists');
    }
  }
}

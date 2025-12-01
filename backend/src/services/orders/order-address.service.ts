import { Injectable, Logger } from '@nestjs/common';
import {
  CountryService,
  Customer,
  EntityHydrator,
  ID,
  Order,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core';

export interface AddressInput {
  fullName: string;
  streetLine1: string;
  streetLine2: string;
  city: string;
  postalCode: string;
  countryCode: string;
  phoneNumber: string;
}

/**
 * Order Address Service
 *
 * Handles setting billing and shipping addresses for orders.
 * Separated for single responsibility and testability.
 */
@Injectable()
export class OrderAddressService {
  private readonly logger = new Logger('OrderAddressService');

  constructor(
    private readonly connection: TransactionalConnection,
    private readonly countryService: CountryService,
    private readonly entityHydrator: EntityHydrator
  ) {}

  /**
   * Set addresses for an order from customer data or defaults
   */
  async setAddresses(ctx: RequestContext, orderId: ID, customerId?: string): Promise<void> {
    const addressInput = await this.getAddressInput(ctx, customerId);
    await this.applyAddresses(ctx, orderId, addressInput);
  }

  /**
   * Get address input from customer or use defaults
   */
  private async getAddressInput(ctx: RequestContext, customerId?: string): Promise<AddressInput> {
    if (customerId) {
      const customer = await this.connection.getRepository(ctx, Customer).findOne({
        where: { id: customerId },
        relations: ['addresses'],
      });

      if (customer && customer.addresses && customer.addresses.length > 0) {
        const customerAddress = customer.addresses[0];
        return {
          fullName:
            customerAddress.fullName ||
            `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
            'Customer',
          streetLine1: customerAddress.streetLine1 || 'Store Location',
          streetLine2: customerAddress.streetLine2 || '',
          city: customerAddress.city || 'Local City',
          postalCode: customerAddress.postalCode || '00100',
          countryCode: customerAddress.country?.code || 'KE',
          phoneNumber: customerAddress.phoneNumber || customer.phoneNumber || '',
        };
      }
    }

    return this.getDefaultAddress(ctx);
  }

  /**
   * Apply addresses to order
   */
  private async applyAddresses(
    ctx: RequestContext,
    orderId: ID,
    addressInput: AddressInput
  ): Promise<void> {
    const orderRepo = this.connection.getRepository(ctx, Order);
    const order = await orderRepo.findOne({ where: { id: orderId } });
    if (!order) {
      throw new UserInputError('Order not found');
    }

    // Verify country exists (but don't include full entity in address data)
    const country = await this.countryService.findOneByCode(ctx, addressInput.countryCode);
    if (!country) {
      throw new UserInputError(`Country ${addressInput.countryCode} not found`);
    }

    // Get address entity from metadata
    const connection = this.connection.rawConnection;
    const addressMetadata = connection.entityMetadatas.find(meta => meta.tableName === 'address');

    if (!addressMetadata) {
      throw new UserInputError('Could not find address entity');
    }

    const AddressEntity = addressMetadata.target;
    const addressRepo = this.connection.getRepository(ctx, AddressEntity);

    // Create addresses - only include countryCode, not full Country entity
    // The country relation will be resolved automatically by Vendure's ORM
    const addressData = {
      fullName: addressInput.fullName,
      streetLine1: addressInput.streetLine1,
      streetLine2: addressInput.streetLine2,
      city: addressInput.city,
      postalCode: addressInput.postalCode,
      countryCode: addressInput.countryCode,
      phoneNumber: addressInput.phoneNumber,
    };

    const billingAddress = await addressRepo.save(addressRepo.create(addressData));
    const shippingAddress = await addressRepo.save(addressRepo.create(addressData));

    // Hydrate order with required relations before saving
    await this.entityHydrator.hydrate(ctx, order, {
      relations: ['lines', 'surcharges', 'shippingLines'],
    });

    // Update order
    order.billingAddress = billingAddress as any;
    order.shippingAddress = shippingAddress as any;
    await orderRepo.save(order);
  }

  /**
   * Get default address for walk-in customers
   */
  private async getDefaultAddress(ctx: RequestContext): Promise<AddressInput> {
    const countries = await this.countryService.findAll(ctx);
    const defaultCountry = countries.items.length > 0 ? countries.items[0].code : 'KE';

    return {
      fullName: 'Walk-in Customer',
      streetLine1: 'Store Location',
      streetLine2: '',
      city: 'Local City',
      postalCode: '00100',
      countryCode: defaultCountry,
      phoneNumber: '',
    };
  }
}

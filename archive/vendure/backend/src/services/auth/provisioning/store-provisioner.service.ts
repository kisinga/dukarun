import { Injectable, Logger } from '@nestjs/common';
import {
  ChangeChannelEvent,
  EventBus,
  ID,
  RequestContext,
  StockLocation,
  StockLocationService,
  TransactionalConnection,
} from '@vendure/core';
import {
  assignEntityToChannel,
  verifyEntityChannelAssignment,
} from '../../../utils/entity-relation.util';
import { RegistrationInput } from '../registration.service';
import { RegistrationAuditorService } from './registration-auditor.service';
import { RegistrationErrorService } from './registration-error.service';

/**
 * Store Provisioner Service
 *
 * Handles stock location (store/warehouse) creation and channel assignment.
 * LOB: Store = Physical location where inventory is tracked.
 */
@Injectable()
export class StoreProvisionerService {
  private readonly logger = new Logger(StoreProvisionerService.name);

  constructor(
    private readonly stockLocationService: StockLocationService,
    private readonly connection: TransactionalConnection,
    private readonly eventBus: EventBus,
    private readonly auditor: RegistrationAuditorService,
    private readonly errorService: RegistrationErrorService
  ) {}

  /**
   * Create stock location and assign to channel
   *
   * **Provisioning Strategy: Hybrid**
   * 1. Create Entity: Use StockLocationService (Standard validation & defaults)
   * 2. Assign Channel: Use Repository QueryBuilder (Bypass permission check)
   *
   * This ensures the entity is correctly initialized by Vendure, but avoids
   * the ForbiddenError caused by permission cache latency on the new channel.
   */
  async createAndAssignStore(
    ctx: RequestContext,
    registrationData: RegistrationInput,
    channelId: ID
  ): Promise<StockLocation> {
    try {
      // 1. Create stock location (Standard Service)
      // This creates the location and assigns it to the current context channel (Default Channel)
      const stockLocation = await this.createStockLocation(ctx, registrationData);

      // 2. Assign to channel using Repository Bypass
      // REASON: StockLocationService.assignStockLocationsToChannel enforces UpdateStockLocation permission
      // on the target channel. Since the channel is new, the permission cache often fails to reflect
      // the SuperAdmin's access, leading to ForbiddenError.
      // Uses generic utility for consistency (see entity-relation.util.ts)
      this.logger.log(`Assigning stock location ${stockLocation.id} to channel ${channelId}`);

      try {
        await assignEntityToChannel(
          this.connection,
          ctx,
          channelId,
          'stockLocations',
          stockLocation.id
        );

        // 3. Verify assignment succeeded
        // This ensures the assignment persisted correctly within the transaction
        const isAssigned = await verifyEntityChannelAssignment(
          this.connection,
          ctx,
          channelId,
          'stockLocations',
          stockLocation.id
        );

        if (!isAssigned) {
          throw this.errorService.createError(
            'STOCK_LOCATION_ASSIGN_FAILED',
            `Failed to assign stock location ${stockLocation.id} to channel ${channelId}. Assignment verification failed.`
          );
        }

        this.logger.log(
          `Stock location ${stockLocation.id} successfully assigned to channel ${channelId}`
        );
      } catch (error: any) {
        // If it's already our custom error, re-throw it
        if (error.code === 'STOCK_LOCATION_ASSIGN_FAILED') {
          throw error;
        }
        // Otherwise, wrap the assignment error
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to assign stock location ${stockLocation.id} to channel ${channelId}: ${errorMessage}`
        );
        throw this.errorService.createError(
          'STOCK_LOCATION_ASSIGN_FAILED',
          `Failed to assign stock location ${stockLocation.id} to channel ${channelId}: ${errorMessage}`
        );
      }

      // Publish ChangeChannelEvent (Good Citizen)
      await this.eventBus.publish(
        new ChangeChannelEvent(ctx, stockLocation, [channelId as any], 'assigned', StockLocation)
      );

      // Audit log
      await this.auditor.logEntityCreated(
        ctx,
        'StockLocation',
        stockLocation.id.toString(),
        stockLocation,
        {
          channelId,
          storeName: registrationData.storeName,
          storeAddress: registrationData.storeAddress,
        }
      );

      return stockLocation;
    } catch (error: any) {
      this.errorService.logError('StoreProvisioner', error, 'Store creation');
      throw this.errorService.wrapError(error, 'STOCK_LOCATION_CREATE_FAILED');
    }
  }

  private async createStockLocation(
    ctx: RequestContext,
    registrationData: RegistrationInput
  ): Promise<StockLocation> {
    const storeName = registrationData.storeName?.trim();

    if (!storeName) {
      throw this.errorService.createError(
        'REGISTRATION_STORE_NAME_REQUIRED',
        'Store name is required to complete registration.'
      );
    }

    const stockLocationResult = await this.stockLocationService.create(ctx, {
      name: storeName,
      description: registrationData.storeAddress.trim(),
    });

    if ('errorCode' in stockLocationResult) {
      const error = stockLocationResult as any;
      throw this.errorService.createError(
        'STOCK_LOCATION_CREATE_FAILED',
        error.message || 'Failed to create stock location'
      );
    }

    return stockLocationResult as StockLocation;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { CostingStrategy } from './interfaces/costing-strategy.interface';
import { ExpiryPolicy } from './interfaces/expiry-policy.interface';

/**
 * Inventory configuration for a channel
 */
export interface InventoryConfiguration {
  channelId: ID;
  costingStrategy: string; // 'FIFO' | 'FEFO' | 'AVERAGE' | 'CUSTOM'
  expiryPolicy: string; // 'DEFAULT' | 'STRICT' | 'RELAXED' | 'CUSTOM'
  inventoryValuationMode: 'none' | 'shadow' | 'authoritative';
  metadata?: Record<string, any>;
}

/**
 * Default inventory configuration
 */
const DEFAULT_CONFIGURATION: Omit<InventoryConfiguration, 'channelId'> = {
  costingStrategy: 'FIFO',
  expiryPolicy: 'DEFAULT',
  inventoryValuationMode: 'shadow',
  metadata: {},
};

/**
 * InventoryConfigurationService
 *
 * Manages per-channel inventory configuration.
 * Stores configuration in channel custom fields.
 */
@Injectable()
export class InventoryConfigurationService {
  private readonly logger = new Logger(InventoryConfigurationService.name);

  constructor(private readonly connection: TransactionalConnection) {}

  /**
   * Get inventory configuration for a channel
   * Returns default configuration if not set
   */
  async getConfiguration(ctx: RequestContext, channelId: ID): Promise<InventoryConfiguration> {
    // In a full implementation, this would read from channel custom fields
    // For now, return default configuration
    return {
      channelId,
      ...DEFAULT_CONFIGURATION,
    };
  }

  /**
   * Set inventory configuration for a channel
   */
  async setConfiguration(
    ctx: RequestContext,
    configuration: Partial<InventoryConfiguration>
  ): Promise<void> {
    // In a full implementation, this would write to channel custom fields
    this.logger.log(
      `Setting inventory configuration for channel ${configuration.channelId}: ` +
        `strategy=${configuration.costingStrategy}, policy=${configuration.expiryPolicy}, ` +
        `mode=${configuration.inventoryValuationMode}`
    );
  }

  /**
   * Resolve costing strategy instance for a channel
   */
  async resolveCostingStrategy(
    ctx: RequestContext,
    channelId: ID,
    strategies: Map<string, CostingStrategy>
  ): Promise<CostingStrategy> {
    const config = await this.getConfiguration(ctx, channelId);
    const strategy = strategies.get(config.costingStrategy);

    if (!strategy) {
      throw new Error(
        `Costing strategy '${config.costingStrategy}' not found for channel ${channelId}. ` +
          `Available strategies: ${Array.from(strategies.keys()).join(', ')}`
      );
    }

    return strategy;
  }

  /**
   * Resolve expiry policy instance for a channel
   */
  async resolveExpiryPolicy(
    ctx: RequestContext,
    channelId: ID,
    policies: Map<string, ExpiryPolicy>
  ): Promise<ExpiryPolicy> {
    const config = await this.getConfiguration(ctx, channelId);
    const policy = policies.get(config.expiryPolicy);

    if (!policy) {
      throw new Error(
        `Expiry policy '${config.expiryPolicy}' not found for channel ${channelId}. ` +
          `Available policies: ${Array.from(policies.keys()).join(', ')}`
      );
    }

    return policy;
  }

  /**
   * Check if inventory valuation is enabled for a channel
   */
  async isValuationEnabled(ctx: RequestContext, channelId: ID): Promise<boolean> {
    const config = await this.getConfiguration(ctx, channelId);
    return config.inventoryValuationMode !== 'none';
  }

  /**
   * Check if inventory valuation is in authoritative mode
   */
  async isAuthoritativeMode(ctx: RequestContext, channelId: ID): Promise<boolean> {
    const config = await this.getConfiguration(ctx, channelId);
    return config.inventoryValuationMode === 'authoritative';
  }
}

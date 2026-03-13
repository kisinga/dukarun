import { Inject, Optional } from '@nestjs/common';
import { Resolver, ResolveField, Parent } from '@nestjs/graphql';
import { Ctx, ProductVariant, RequestContext, StockLocationService } from '@vendure/core';
import { InventoryStore } from '../../services/inventory/interfaces/inventory-store.interface';

/**
 * Overrides the `stockOnHand` field on ProductVariant so the GraphQL layer
 * resolves from batch inventory (single source of truth) instead of the
 * Vendure stock_level table.
 *
 * Vendure's built-in ProductVariantAdminEntityResolver lives in a different
 * NestJS module (ApiModule) than our LedgerPlugin, so the provider-level
 * StockLevelService override is module-scoped and never reaches the resolver.
 * This @ResolveField decorator is registered via adminApiExtensions, which
 * NestJS/GraphQL merges into the same 'ProductVariant' object type —
 * effectively replacing the core resolver for this single field.
 */
@Resolver('ProductVariant')
export class BatchStockVariantResolver {
  constructor(
    private readonly stockLocationService: StockLocationService,
    @Optional() @Inject('InventoryStore') private readonly inventoryStore?: InventoryStore
  ) {}

  @ResolveField()
  async stockOnHand(
    @Ctx() ctx: RequestContext,
    @Parent() variant: ProductVariant
  ): Promise<number> {
    if (!this.inventoryStore || !ctx.channelId) {
      return 0;
    }

    const location = await this.stockLocationService.defaultStockLocation(ctx);
    if (!location?.id) {
      return 0;
    }

    const batches = await this.inventoryStore.getOpenBatches(ctx, {
      channelId: ctx.channelId,
      stockLocationId: location.id,
      productVariantId: variant.id,
    });

    return batches.reduce((sum, batch) => sum + batch.quantity, 0);
  }
}

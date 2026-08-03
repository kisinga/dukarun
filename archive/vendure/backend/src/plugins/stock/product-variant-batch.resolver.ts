import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, ProductVariant, RequestContext } from '@vendure/core';
import { InventoryBatch } from '../../services/inventory/entities/inventory-batch.entity';
import { InventoryStoreService } from '../../services/inventory/inventory-store.service';

@Resolver('ProductVariant')
export class ProductVariantBatchResolver {
  constructor(private readonly inventoryStoreService: InventoryStoreService) {}

  @ResolveField()
  @Allow(Permission.ReadProduct)
  async inventoryBatches(
    @Ctx() ctx: RequestContext,
    @Parent() variant: ProductVariant
  ): Promise<InventoryBatch[]> {
    if (!ctx.channelId) {
      return [];
    }
    return this.inventoryStoreService.getOpenBatches(ctx, {
      channelId: ctx.channelId,
      productVariantId: variant.id,
    });
  }
}

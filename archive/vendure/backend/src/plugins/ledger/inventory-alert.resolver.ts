import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import {
  InventoryAlertService,
  type InventoryAlertFilter,
} from '../../services/inventory/inventory-alert.service';

@Resolver()
export class InventoryAlertResolver {
  constructor(private readonly inventoryAlertService: InventoryAlertService) {}

  @Query()
  @Allow(Permission.ReadProduct)
  async inventoryAlerts(
    @Ctx() ctx: RequestContext,
    @Args('expiryThresholdDays', { nullable: true }) expiryThresholdDays?: number
  ) {
    return this.inventoryAlertService.getAlertCounts(ctx, expiryThresholdDays);
  }

  @Query()
  @Allow(Permission.ReadProduct)
  async productsByInventoryAlert(
    @Ctx() ctx: RequestContext,
    @Args('filter') filter: InventoryAlertFilter,
    @Args('options', { nullable: true }) options?: unknown
  ) {
    return this.inventoryAlertService.findAlertProducts(ctx, filter, options as any);
  }
}

import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import {
  StockValuationService,
  StockValuationType,
} from '../../services/financial/stock-valuation.service';

@Resolver()
export class StockValueStatsResolver {
  constructor(private readonly stockValuationService: StockValuationService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async stockValueStats(
    @Ctx() ctx: RequestContext,
    @Args('stockLocationId', { nullable: true }) stockLocationId?: string,
    @Args('forceRefresh', { nullable: true }) forceRefresh?: boolean
  ) {
    return this.stockValuationService.getStockValueStats(
      ctx,
      stockLocationId != null ? Number(stockLocationId) : undefined,
      forceRefresh ?? false
    );
  }

  @Query()
  @Allow(Permission.ReadOrder)
  async stockValueRanking(
    @Ctx() ctx: RequestContext,
    @Args('valuationType') valuationType: StockValuationType,
    @Args('limit', { nullable: true }) limit?: number,
    @Args('stockLocationId', { nullable: true }) stockLocationId?: string
  ) {
    return this.stockValuationService.getStockValueRanking(
      ctx,
      valuationType,
      limit ?? 20,
      stockLocationId != null ? Number(stockLocationId) : undefined
    );
  }
}

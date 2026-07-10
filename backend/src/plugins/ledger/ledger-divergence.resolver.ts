import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { LedgerDivergenceService } from '../../services/financial/ledger-divergence.service';
import { InventoryReconciliationService } from '../../services/financial/inventory-reconciliation.service';
import { ManageReconciliationPermission, ViewFinancialsPermission } from './permissions';

export interface LedgerDivergenceGraphQLSummary {
  totalDivergences: number;
  byEntityType: Array<{ entityType: string; count: number }>;
  items: Array<{
    entityType: string;
    entityId: string;
    descriptor: string;
    entityValue: number;
    ledgerValue: number;
    difference: number;
  }>;
}

@Resolver()
export class LedgerDivergenceResolver {
  constructor(
    private readonly ledgerDivergenceService: LedgerDivergenceService,
    private readonly inventoryReconciliationService: InventoryReconciliationService
  ) {}

  @Query()
  @Allow(ViewFinancialsPermission.Permission)
  async ledgerDivergences(
    @Ctx() ctx: RequestContext,
    @Args('toleranceCents', { nullable: true }) toleranceCents?: number
  ): Promise<LedgerDivergenceGraphQLSummary> {
    const summary = await this.ledgerDivergenceService.findAllDivergences(ctx, toleranceCents);
    return {
      totalDivergences: summary.totalDivergences,
      byEntityType: Object.entries(summary.byEntityType).map(([entityType, count]) => ({
        entityType,
        count,
      })),
      items: summary.items,
    };
  }

  @Mutation()
  @Allow(ManageReconciliationPermission.Permission)
  async reconcileInventory(
    @Ctx() ctx: RequestContext,
    @Args('reason') reason: string,
    @Args('stockLocationId', { nullable: true }) stockLocationId?: number
  ): Promise<{
    channelId: number;
    stockLocationId?: number;
    periodEndDate: string;
    ledgerBalance: number;
    inventoryValuation: number;
    variance: number;
  }> {
    const result = await this.inventoryReconciliationService.reconcileToModel(
      ctx,
      ctx.channelId as number,
      reason,
      stockLocationId
    );
    return {
      channelId: result.channelId,
      stockLocationId: result.stockLocationId,
      periodEndDate: result.periodEndDate,
      ledgerBalance: Number(result.ledgerBalance),
      inventoryValuation: Number(result.inventoryValuation),
      variance: Number(result.variance),
    };
  }
}

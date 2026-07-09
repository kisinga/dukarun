import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, RequestContext } from '@vendure/core';
import { LedgerDivergenceService } from '../../services/financial/ledger-divergence.service';
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
  constructor(private readonly ledgerDivergenceService: LedgerDivergenceService) {}

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
}

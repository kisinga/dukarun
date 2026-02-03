import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';
import { LedgerQueryService } from '../../services/financial/ledger-query.service';

interface PeriodStats {
  today: number;
  week: number;
  month: number;
  accounts: Array<{
    label: string;
    value: number;
    icon: string;
  }>;
}

interface DashboardStats {
  sales: PeriodStats;
  purchases: PeriodStats;
  expenses: PeriodStats;
}

@Resolver()
export class DashboardStatsResolver {
  constructor(private readonly ledgerQueryService: LedgerQueryService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async dashboardStats(
    @Ctx() ctx: RequestContext,
    @Args('startDate', { nullable: true }) startDate?: Date,
    @Args('endDate', { nullable: true }) endDate?: Date
  ): Promise<DashboardStats> {
    const channelId = ctx.channelId as number;
    const now = endDate || new Date();

    // Calculate period boundaries
    const periods = this.ledgerQueryService.calculatePeriods(now);
    const endDateStr = endDate ? endDate.toISOString().slice(0, 10) : undefined;

    // Batch fetch account metadata once for getSalesBreakdown optimization
    const accountIds = await this.ledgerQueryService.getAccountIdsForSalesBreakdown(channelId);

    // Fetch sales stats for all periods
    // Only fetch month breakdown for accounts (used in UI breakdown display)
    const [salesToday, salesWeek, salesMonth, salesBreakdownMonth] = await Promise.all([
      this.ledgerQueryService.getSalesTotal(channelId, periods.startOfToday, endDateStr),
      this.ledgerQueryService.getSalesTotal(channelId, periods.startOfWeek, endDateStr),
      this.ledgerQueryService.getSalesTotal(channelId, periods.startOfMonth, endDateStr),
      this.ledgerQueryService.getSalesBreakdown(
        channelId,
        periods.startOfMonth,
        endDateStr,
        accountIds
      ),
    ]);

    // Fetch purchase stats for all periods
    const [purchasesToday, purchasesWeek, purchasesMonth] = await Promise.all([
      this.ledgerQueryService.getPurchaseTotal(channelId, periods.startOfToday, endDateStr),
      this.ledgerQueryService.getPurchaseTotal(channelId, periods.startOfWeek, endDateStr),
      this.ledgerQueryService.getPurchaseTotal(channelId, periods.startOfMonth, endDateStr),
    ]);

    // Fetch expense stats for all periods
    const [expensesToday, expensesWeek, expensesMonth] = await Promise.all([
      this.ledgerQueryService.getExpenseTotal(channelId, periods.startOfToday, endDateStr),
      this.ledgerQueryService.getExpenseTotal(channelId, periods.startOfWeek, endDateStr),
      this.ledgerQueryService.getExpenseTotal(channelId, periods.startOfMonth, endDateStr),
    ]);

    // All values in smallest currency unit (cents) - UI layer handles display conversion
    const sales: PeriodStats = {
      today: salesToday,
      week: salesWeek,
      month: salesMonth,
      accounts: [
        {
          label: 'Cash Sales',
          value: salesBreakdownMonth.cashSales,
          icon: '💵',
        },
        {
          label: 'Credit',
          value: salesBreakdownMonth.creditSales,
          icon: '🏦',
        },
      ],
    };

    const purchases: PeriodStats = {
      today: purchasesToday,
      week: purchasesWeek,
      month: purchasesMonth,
      accounts: [
        {
          label: 'Inventory',
          value: purchasesMonth,
          icon: '📦',
        },
      ],
    };

    const expenses: PeriodStats = {
      today: expensesToday,
      week: expensesWeek,
      month: expensesMonth,
      accounts: [
        {
          label: 'Rent',
          value: 0, // Expenses account doesn't break down by type yet
          icon: '🏠',
        },
        {
          label: 'Salaries',
          value: 0,
          icon: '👥',
        },
        {
          label: 'Other',
          value: expensesMonth,
          icon: '📋',
        },
      ],
    };

    return {
      sales,
      purchases,
      expenses,
    };
  }
}

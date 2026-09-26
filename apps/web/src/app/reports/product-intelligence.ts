import type {
  DashboardProductSignals,
  DashboardRestockRisk,
  DashboardTopVariant,
} from './reports.service';
import type {
  ProductPerformanceCategory,
  ProductPerformanceResponse,
  ProductPerformanceRow,
} from '../core/product-performance.models';

export interface DashboardPerformanceLeader {
  kind: ProductPerformanceCategory;
  row: ProductPerformanceRow;
}

/** Select one leader per category, advancing past products already used above it. */
export function selectDashboardPerformanceLeaders(
  performance: ProductPerformanceResponse,
  includeMargin = true
): DashboardPerformanceLeader[] {
  const order: ProductPerformanceCategory[] = includeMargin
    ? ['trending', 'volume', 'margin', 'consistent']
    : ['trending', 'volume', 'consistent'];
  const used = new Set<string>();
  const result: DashboardPerformanceLeader[] = [];
  for (const kind of order) {
    const row = performance.leaders[kind].find(candidate => !used.has(candidate.product_id));
    if (!row) continue;
    used.add(row.product_id);
    result.push({ kind, row });
  }
  return result;
}

export type DashboardSignalCandidate =
  | { kind: 'restock'; row: DashboardRestockRisk }
  | { kind: 'margin' | 'movement'; row: DashboardTopVariant };

export function selectDashboardSignalCandidates(
  marginRows: DashboardTopVariant[],
  signals: DashboardProductSignals,
  productKey: (variantId: string) => string = variantId => variantId
): DashboardSignalCandidate[] {
  const result: DashboardSignalCandidate[] = [];
  const used = new Set<string>();
  const restock = signals.restockRisks[0];
  if (restock) {
    result.push({ kind: 'restock', row: restock });
    used.add(productKey(restock.variant_id));
  }

  const margin = marginRows[0];
  if (margin && !used.has(productKey(margin.variant_id))) {
    result.push({ kind: 'margin', row: margin });
    used.add(productKey(margin.variant_id));
  }

  const movement = signals.fastVariants[0];
  if (movement && !used.has(productKey(movement.variant_id))) {
    result.push({ kind: 'movement', row: movement });
  }
  return result;
}

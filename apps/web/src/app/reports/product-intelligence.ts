import type {
  DashboardProductSignals,
  DashboardRestockRisk,
  DashboardTopVariant,
} from './reports.service';

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

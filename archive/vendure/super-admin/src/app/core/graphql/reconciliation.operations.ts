import { gql, TypedDocumentNode } from '@apollo/client/core';

export interface LedgerDivergenceItem {
  entityType: string;
  entityId: string;
  descriptor: string;
  entityValue: number;
  ledgerValue: number;
  difference: number;
}

export interface LedgerDivergenceCount {
  entityType: string;
  count: number;
}

export interface LedgerDivergencesData {
  ledgerDivergences: {
    totalDivergences: number;
    byEntityType: LedgerDivergenceCount[];
    items: LedgerDivergenceItem[];
  };
}

export interface LedgerDivergencesVars {
  toleranceCents?: number | null;
}

export const LEDGER_DIVERGENCES: TypedDocumentNode<LedgerDivergencesData, LedgerDivergencesVars> = gql`
  query LedgerDivergences($toleranceCents: Int) {
    ledgerDivergences(toleranceCents: $toleranceCents) {
      totalDivergences
      byEntityType {
        entityType
        count
      }
      items {
        entityType
        entityId
        descriptor
        entityValue
        ledgerValue
        difference
      }
    }
  }
`;

export interface ReconcileInventoryData {
  reconcileInventory: {
    channelId: number;
    stockLocationId?: number | null;
    periodEndDate: string;
    ledgerBalance: number;
    inventoryValuation: number;
    variance: number;
  };
}

export interface ReconcileInventoryVars {
  reason: string;
  stockLocationId?: number | null;
}

export const RECONCILE_INVENTORY: TypedDocumentNode<ReconcileInventoryData, ReconcileInventoryVars> = gql`
  mutation ReconcileInventory($reason: String!, $stockLocationId: Int) {
    reconcileInventory(reason: $reason, stockLocationId: $stockLocationId) {
      channelId
      stockLocationId
      periodEndDate
      ledgerBalance
      inventoryValuation
      variance
    }
  }
`;

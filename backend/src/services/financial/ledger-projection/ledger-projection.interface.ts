import { RequestContext } from '@vendure/core';

/**
 * LedgerProjection
 *
 * Contract that defines how a specific entity type is projected onto the ledger.
 * Each implementation knows:
 *   - how to compute the entity-model view of the balance
 *   - how to fetch the ledger view of the same balance
 *   - how to compare the two within a tolerance
 *
 * The snapshot shape is domain-specific (e.g. order AR, purchase AP, inventory value).
 * This is the unit of reuse for the ledger-as-SSOT pattern.
 */
export interface LedgerProjection<TEntity, TSnapshot> {
  /** Human-readable domain name (order, purchase, inventory, etc.) */
  readonly entityType: string;

  /** Maximum allowed difference in cents before the entity is considered divergent. */
  readonly toleranceCents: number;

  /** Compute the entity-model view of the financial snapshot. */
  computeFromEntity(entity: TEntity): TSnapshot;

  /** Fetch the ledger view of the same snapshot. */
  fetchFromLedger(ctx: RequestContext, entity: TEntity): Promise<TSnapshot>;

  /**
   * Compare entity and ledger snapshots.
   * Returns the signed difference (entity - ledger) in cents.
   * The guard applies the tolerance and decides whether to fail.
   */
  compare(
    entitySnapshot: TSnapshot,
    ledgerSnapshot: TSnapshot
  ): {
    difference: number;
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, UserInputError } from '@vendure/core';
import { LedgerProjection } from './ledger-projection.interface';

export interface DivergenceResult<TEntity, TSnapshot> {
  entity: TEntity;
  entitySnapshot: TSnapshot;
  ledgerSnapshot: TSnapshot;
  difference: number;
}

/**
 * LedgerConsistencyGuard
 *
 * Reusable fail-closed guard and diagnostic runner for the ledger-as-SSOT pattern.
 * Domain-specific projections implement {@link LedgerProjection}; this guard consumes them.
 */
@Injectable()
export class LedgerConsistencyGuard {
  private readonly logger = new Logger(LedgerConsistencyGuard.name);

  /**
   * Assert that an entity's model state matches the ledger within the projection's tolerance.
   * Returns the verified ledger snapshot so callers can reuse it instead of fetching again.
   * Throws UserInputError when the entity and ledger disagree.
   */
  async assertInSync<TEntity, TSnapshot>(
    ctx: RequestContext,
    projection: LedgerProjection<TEntity, TSnapshot>,
    entity: TEntity
  ): Promise<TSnapshot> {
    const entitySnapshot = projection.computeFromEntity(entity);
    const ledgerSnapshot = await projection.fetchFromLedger(ctx, entity);
    const { difference } = projection.compare(entitySnapshot, ledgerSnapshot);

    if (Math.abs(difference) > projection.toleranceCents) {
      const descriptor = this.describeEntity(entity);
      this.logger.warn(
        `${projection.entityType} ${descriptor} is out of sync: ` +
          `entity-model=${JSON.stringify(entitySnapshot)}, ` +
          `ledger=${JSON.stringify(ledgerSnapshot)}, ` +
          `difference=${difference}`
      );
      throw new UserInputError(
        `${projection.entityType} ${descriptor} balance is out of sync with the ledger. ` +
          `Contact superadmin to reconcile.`
      );
    }

    return ledgerSnapshot;
  }

  /**
   * Find all candidate entities where the model state diverges from the ledger.
   * The caller supplies the candidate finder so the projection stays agnostic of pagination/filters.
   * `toleranceCents` overrides the projection default when provided.
   */
  async findDivergences<TEntity, TSnapshot>(
    ctx: RequestContext,
    projection: LedgerProjection<TEntity, TSnapshot>,
    findCandidates: (ctx: RequestContext) => Promise<TEntity[]>,
    toleranceCents?: number
  ): Promise<DivergenceResult<TEntity, TSnapshot>[]> {
    const candidates = await findCandidates(ctx);
    const divergences: DivergenceResult<TEntity, TSnapshot>[] = [];
    const tolerance = toleranceCents ?? projection.toleranceCents;

    for (const entity of candidates) {
      const entitySnapshot = projection.computeFromEntity(entity);
      const ledgerSnapshot = await projection.fetchFromLedger(ctx, entity);
      const { difference } = projection.compare(entitySnapshot, ledgerSnapshot);

      if (Math.abs(difference) > tolerance) {
        divergences.push({ entity, entitySnapshot, ledgerSnapshot, difference });
      }
    }

    return divergences;
  }

  private describeEntity(entity: unknown): string {
    if (entity == null) return 'unknown';
    const e = entity as Record<string, unknown>;
    if (typeof e.code === 'string') return e.code;
    if (typeof e.id === 'string' || typeof e.id === 'number') return String(e.id);
    return 'unknown';
  }
}

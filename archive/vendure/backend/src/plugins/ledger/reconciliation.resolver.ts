import { Resolver, ResolveField, Root } from '@nestjs/graphql';
import { Reconciliation } from '../../domain/recon/reconciliation.entity';

/**
 * Normalize date-only (YYYY-MM-DD) to full ISO datetime for GraphQL DateTime scalar.
 * PostgreSQL date columns return YYYY-MM-DD; DateTime expects ISO 8601.
 */
function toDateTimeString(val: string | undefined | null): string {
  if (val == null || val === '') return '';
  if (val.includes('T')) return val;
  return `${val}T00:00:00.000Z`;
}

/**
 * Field resolver for Reconciliation.
 * Converts snapshotAt (stored as date-only YYYY-MM-DD) to full ISO datetime
 * so the GraphQL DateTime scalar can serialize it.
 */
@Resolver('Reconciliation')
export class ReconciliationResolver {
  @ResolveField()
  snapshotAt(@Root() recon: Reconciliation): string {
    return toDateTimeString(recon.snapshotAt);
  }
}

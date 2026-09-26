export type IdentityCoverage = 'active' | 'may-include-historical';
export type CacheLookupSource = 'active-cache' | 'mixed' | 'historical-overlay' | 'unresolved';

export interface CacheLookupRequest {
  coverage: IdentityCoverage;
}

export interface CacheLookupSnapshot<T> {
  scope: string | null;
  revision: unknown;
  items: readonly T[];
  complete: boolean;
  stale: boolean;
}

export interface CacheLookupDiagnostics {
  requested: number;
  cacheHits: number;
  overlayHits: number;
  cacheHitRatio: number;
  enrichmentRequests: number;
  enrichmentItems: number;
  enrichmentBatchSizes: number[];
  enrichmentFailures: number;
  unresolved: number;
  durationMs: number;
}

export interface CacheLookupResult<T> {
  items: Map<string, T>;
  ordered: Array<T | null>;
  missingIds: string[];
  source: CacheLookupSource;
  stale: boolean;
  complete: boolean;
  snapshotComplete: boolean;
  scope: string | null;
  revision: unknown;
  diagnostics: CacheLookupDiagnostics;
}

export interface CacheBackedLookupOptions<T> {
  snapshot: () => CacheLookupSnapshot<T>;
  id: (item: T) => string | null | undefined;
  /** Domain-owned identity lookup for records outside the active snapshot. */
  enrichHistoricalByIds?: (ids: readonly string[]) => Promise<readonly T[]>;
  batchSize?: number;
}

type CacheLookupProgress = Omit<CacheLookupDiagnostics, 'cacheHitRatio' | 'unresolved'>;

/**
 * In-memory identity index over an existing durable cache. The durable cache is
 * always authoritative. Historical rows live only in the scoped session overlay.
 */
export class CacheBackedLookupEngine<T> {
  private readonly batchSize: number;
  private scope: string | null | undefined;
  private revision: unknown = Symbol('uninitialised');
  private generation = 0;
  private index = new Map<string, T>();
  private overlay = new Map<string, T>();
  private readonly inFlight = new Map<string, Promise<T | null>>();

  constructor(private readonly options: CacheBackedLookupOptions<T>) {
    this.batchSize = Math.min(Math.max(Math.trunc(options.batchSize ?? 100), 1), 500);
  }

  peek(ids: readonly string[]): CacheLookupResult<T> {
    const startedAt = now();
    const snapshot = this.ensureIndex();
    const requested = uniqueIds(ids);
    const items = new Map<string, T>();
    let cacheHits = 0;
    let overlayHits = 0;
    for (const id of requested) {
      const cached = this.index.get(id);
      if (cached) {
        items.set(id, cached);
        cacheHits++;
        continue;
      }
      const overlaid = this.overlay.get(id);
      if (overlaid) {
        items.set(id, overlaid);
        overlayHits++;
      }
    }
    return this.result(requested, items, snapshot, {
      requested: requested.length,
      cacheHits,
      overlayHits,
      enrichmentRequests: 0,
      enrichmentItems: 0,
      enrichmentBatchSizes: [],
      enrichmentFailures: 0,
      durationMs: now() - startedAt,
    });
  }

  async resolve(
    ids: readonly string[],
    request: CacheLookupRequest
  ): Promise<CacheLookupResult<T>> {
    const startedAt = now();
    const requested = uniqueIds(ids);
    const initial = this.peek(requested);
    const items = new Map(initial.items);
    const missingIds = requested.filter(id => !items.has(id));
    let enrichmentRequests = 0;
    let enrichmentItems = 0;
    let enrichmentFailures = 0;
    const enrichmentBatchSizes: number[] = [];

    if (
      request.coverage === 'may-include-historical' &&
      initial.scope &&
      missingIds.length > 0 &&
      this.options.enrichHistoricalByIds
    ) {
      const requestGeneration = this.generation;
      const pending: Promise<T | null>[] = [];
      for (const batch of batches(missingIds, this.batchSize)) {
        const uncaptured = batch.filter(id => !this.inFlight.has(id));
        if (uncaptured.length > 0) {
          enrichmentRequests++;
          enrichmentBatchSizes.push(uncaptured.length);
          const enrichment = this.options
            .enrichHistoricalByIds(uncaptured)
            .then(rows => {
              const byId = new Map<string, T>();
              const requestedIds = new Set(uncaptured);
              for (const row of rows) {
                const id = this.options.id(row);
                if (id && requestedIds.has(id)) byId.set(id, row);
              }
              this.ensureIndex();
              if (this.generation === requestGeneration) {
                for (const [id, row] of byId) this.overlay.set(id, row);
              }
              return this.generation === requestGeneration ? byId : new Map<string, T>();
            })
            .catch(() => {
              enrichmentFailures++;
              return new Map<string, T>();
            });
          for (const id of uncaptured) {
            const item = enrichment.then(rows => rows.get(id) ?? null);
            this.inFlight.set(id, item);
            void item.finally(() => {
              if (this.inFlight.get(id) === item) this.inFlight.delete(id);
            });
          }
        }
        for (const id of batch) pending.push(this.inFlight.get(id) ?? Promise.resolve(null));
      }
      const resolved = await Promise.all(pending);
      for (let index = 0; index < missingIds.length; index++) {
        const item = resolved[index];
        if (item) items.set(missingIds[index]!, item);
      }
      enrichmentItems = missingIds.filter(id => items.has(id)).length;

      if (this.generation !== requestGeneration) return this.peek(requested);
    }

    const snapshot = this.ensureIndex();
    return this.result(requested, items, snapshot, {
      requested: requested.length,
      cacheHits: initial.diagnostics.cacheHits,
      overlayHits: initial.diagnostics.overlayHits,
      enrichmentRequests,
      enrichmentItems,
      enrichmentBatchSizes,
      enrichmentFailures,
      durationMs: now() - startedAt,
    });
  }

  clear(): void {
    this.scope = undefined;
    this.revision = Symbol('cleared');
    this.generation++;
    this.index.clear();
    this.overlay.clear();
    this.inFlight.clear();
  }

  private ensureIndex(): CacheLookupSnapshot<T> {
    const snapshot = this.options.snapshot();
    if (snapshot.scope !== this.scope || snapshot.revision !== this.revision) {
      this.scope = snapshot.scope;
      this.revision = snapshot.revision;
      this.generation++;
      this.index = new Map(
        snapshot.items.flatMap(item => {
          const id = this.options.id(item);
          return id ? [[id, item] as const] : [];
        })
      );
      this.overlay.clear();
      this.inFlight.clear();
    }
    return snapshot;
  }

  private result(
    requested: readonly string[],
    items: Map<string, T>,
    snapshot: CacheLookupSnapshot<T>,
    diagnostics: CacheLookupProgress
  ): CacheLookupResult<T> {
    const missingIds = requested.filter(id => !items.has(id));
    const finalizedDiagnostics: CacheLookupDiagnostics = {
      ...diagnostics,
      cacheHitRatio:
        requested.length === 0
          ? 1
          : (diagnostics.cacheHits + diagnostics.overlayHits) / requested.length,
      unresolved: missingIds.length,
    };
    const historicalHits = Math.max(0, items.size - diagnostics.cacheHits);
    const source: CacheLookupSource =
      items.size === 0
        ? 'unresolved'
        : historicalHits === 0
          ? 'active-cache'
          : diagnostics.cacheHits === 0
            ? 'historical-overlay'
            : 'mixed';
    return {
      items,
      ordered: requested.map(id => items.get(id) ?? null),
      missingIds,
      source,
      stale: snapshot.stale,
      complete: missingIds.length === 0,
      snapshotComplete: snapshot.complete,
      scope: snapshot.scope,
      revision: snapshot.revision,
      diagnostics: finalizedDiagnostics,
    };
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(id => id.trim()).filter(Boolean))];
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

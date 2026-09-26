import { describe, expect, it, vi } from 'vitest';
import { CacheBackedLookupEngine, type CacheLookupSnapshot } from './cache-backed-lookup';

interface Item {
  id: string;
  label: string;
}

describe('CacheBackedLookupEngine', () => {
  function setup(initial: Item[] = []) {
    let snapshot: CacheLookupSnapshot<Item> = {
      scope: 'company:user:location',
      revision: 1,
      items: initial,
      complete: true,
      stale: false,
    };
    const enrichHistoricalByIds = vi.fn(async (ids: readonly string[]) =>
      ids.map(id => ({ id, label: `historical-${id}` }))
    );
    const engine = new CacheBackedLookupEngine<Item>({
      snapshot: () => snapshot,
      id: item => item.id,
      enrichHistoricalByIds,
      batchSize: 2,
    });
    return {
      engine,
      enrichHistoricalByIds,
      update(next: Partial<CacheLookupSnapshot<Item>>) {
        snapshot = { ...snapshot, ...next };
      },
    };
  }

  it('resolves warm active rows without historical enrichment', async () => {
    const { engine, enrichHistoricalByIds } = setup([{ id: 'a', label: 'cached-a' }]);

    const result = await engine.resolve(['a', 'a'], { coverage: 'active' });

    expect(result.ordered).toEqual([{ id: 'a', label: 'cached-a' }]);
    expect(result.source).toBe('active-cache');
    expect(enrichHistoricalByIds).not.toHaveBeenCalled();
  });

  it('never enriches an active miss', async () => {
    const { engine, enrichHistoricalByIds } = setup([]);

    const result = await engine.resolve(['missing'], { coverage: 'active' });

    expect(result.missingIds).toEqual(['missing']);
    expect(result.source).toBe('unresolved');
    expect(enrichHistoricalByIds).not.toHaveBeenCalled();
  });

  it('batches historical misses and retains them in the session overlay', async () => {
    const { engine, enrichHistoricalByIds } = setup([{ id: 'a', label: 'cached-a' }]);

    const first = await engine.resolve(['a', 'b', 'c', 'd'], {
      coverage: 'may-include-historical',
    });
    const second = await engine.resolve(['b'], { coverage: 'may-include-historical' });

    expect(enrichHistoricalByIds).toHaveBeenCalledTimes(2);
    expect(enrichHistoricalByIds.mock.calls.map(call => call[0])).toEqual([['b', 'c'], ['d']]);
    expect(first.diagnostics.enrichmentBatchSizes).toEqual([2, 1]);
    expect(first.diagnostics.cacheHitRatio).toBe(0.25);
    expect(first.diagnostics.unresolved).toBe(0);
    expect(first.source).toBe('mixed');
    expect(second.items.get('b')?.label).toBe('historical-b');
  });

  it('coalesces concurrent historical requests for the same id', async () => {
    let release!: (items: Item[]) => void;
    const enrichHistoricalByIds = vi.fn(
      () => new Promise<readonly Item[]>(resolve => (release = resolve as (items: Item[]) => void))
    );
    const engine = new CacheBackedLookupEngine<Item>({
      snapshot: () => ({
        scope: 'scope',
        revision: 1,
        items: [],
        complete: true,
        stale: false,
      }),
      id: item => item.id,
      enrichHistoricalByIds,
    });

    const first = engine.resolve(['x'], { coverage: 'may-include-historical' });
    const second = engine.resolve(['x'], { coverage: 'may-include-historical' });
    release([{ id: 'x', label: 'resolved' }]);

    expect((await first).items.get('x')?.label).toBe('resolved');
    expect((await second).items.get('x')?.label).toBe('resolved');
    expect(enrichHistoricalByIds).toHaveBeenCalledOnce();
  });

  it('invalidates indexes and overlays when scope or revision changes', async () => {
    const { engine, enrichHistoricalByIds, update } = setup([]);
    await engine.resolve(['historical'], { coverage: 'may-include-historical' });
    expect(engine.peek(['historical']).items.has('historical')).toBe(true);

    update({ revision: 2, items: [{ id: 'fresh', label: 'fresh' }] });
    expect(engine.peek(['historical']).items.has('historical')).toBe(false);
    expect(engine.peek(['fresh']).items.get('fresh')?.label).toBe('fresh');

    update({ scope: 'another-company', revision: 1, items: [] });
    expect(engine.peek(['fresh']).items.has('fresh')).toBe(false);
    expect(enrichHistoricalByIds).toHaveBeenCalledOnce();
  });

  it('discards historical results that arrive after a scope change', async () => {
    let release!: (items: Item[]) => void;
    const enrichHistoricalByIds = vi.fn(
      () => new Promise<readonly Item[]>(resolve => (release = resolve as (items: Item[]) => void))
    );
    let scope = 'first';
    const scoped = new CacheBackedLookupEngine<Item>({
      snapshot: () => ({
        scope,
        revision: 1,
        items: [],
        complete: true,
        stale: false,
      }),
      id: item => item.id,
      enrichHistoricalByIds,
    });

    const pending = scoped.resolve(['x'], { coverage: 'may-include-historical' });
    scope = 'second';
    scoped.peek([]);
    release([{ id: 'x', label: 'wrong-scope' }]);

    expect((await pending).items.has('x')).toBe(false);
    expect(scoped.peek(['x']).items.has('x')).toBe(false);
  });

  it('keeps cached results when historical enrichment fails', async () => {
    const engine = new CacheBackedLookupEngine<Item>({
      snapshot: () => ({
        scope: 'scope',
        revision: 1,
        items: [{ id: 'a', label: 'cached-a' }],
        complete: true,
        stale: false,
      }),
      id: item => item.id,
      enrichHistoricalByIds: () => Promise.reject(new Error('offline')),
    });

    const result = await engine.resolve(['a', 'missing'], {
      coverage: 'may-include-historical',
    });

    expect(result.items.get('a')?.label).toBe('cached-a');
    expect(result.missingIds).toEqual(['missing']);
    expect(result.diagnostics.enrichmentFailures).toBe(1);
  });
});

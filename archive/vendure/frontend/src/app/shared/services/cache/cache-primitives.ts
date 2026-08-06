import type { EntityRow, ICacheStorageAdapter } from './storage-adapter.interface';

const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_GETALL_LIMIT = 1000;

/**
 * Lightweight accent fold: NFD and strip combining marks so "café" matches "cafe".
 */
function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mc}/gu, '')
    .replace(/\p{Mn}/gu, '');
}

/**
 * Tokenize search term into words (order-independent match).
 */
function tokenize(term: string): string[] {
  return normalizeForSearch(term).split(/\s+/).filter(Boolean);
}

/**
 * Relevance tier: 1 = phrase starts with term, 2 = phrase contains term, 3 = all words present.
 */
function relevanceTier(searchableNorm: string, termNorm: string, words: string[]): number {
  if (searchableNorm.startsWith(termNorm)) return 1;
  if (searchableNorm.includes(termNorm)) return 2;
  if (words.length > 0 && words.every((w) => searchableNorm.includes(w))) return 3;
  return 4;
}

/**
 * Strong search: phrase match, multi-word (all words must appear), accent fold, relevance sort.
 * Implemented in cache layer; adapter only provides getAll. No extra dependencies.
 */
export async function search(
  adapter: ICacheStorageAdapter,
  store: string,
  term: string,
  options?: { limit?: number },
): Promise<unknown[]> {
  const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT;
  const termNorm = normalizeForSearch(term);
  const words = tokenize(term);
  if (termNorm.length === 0) {
    return [];
  }

  const rows = await adapter.getAll(store, DEFAULT_GETALL_LIMIT);
  const termLower = term.trim().toLowerCase();
  const matched: EntityRow[] = [];

  for (const row of rows) {
    const s = row.searchable ?? '';
    const sNorm = normalizeForSearch(s);
    const sLower = s.toLowerCase();
    const phraseMatch = sLower.includes(termLower);
    const allWordsMatch = words.length === 0 || words.every((w) => sNorm.includes(w));
    if (phraseMatch || allWordsMatch) {
      matched.push(row);
    }
  }

  matched.sort((a, b) => {
    const aNorm = normalizeForSearch(a.searchable ?? '');
    const bNorm = normalizeForSearch(b.searchable ?? '');
    const tierA = relevanceTier(aNorm, termNorm, words);
    const tierB = relevanceTier(bNorm, termNorm, words);
    if (tierA !== tierB) return tierA - tierB;
    return (a.searchable ?? '').localeCompare(b.searchable ?? '');
  });

  return matched.slice(0, limit).map((r) => r.payload);
}

/**
 * List payloads from a store with an optional limit.
 */
export async function list(
  adapter: ICacheStorageAdapter,
  store: string,
  limit?: number,
): Promise<unknown[]> {
  const rows = await adapter.getAll(store, limit);
  return rows.map((r) => r.payload);
}

/**
 * Bulk add entity rows to a store.
 */
export async function bulkAdd(
  adapter: ICacheStorageAdapter,
  store: string,
  items: EntityRow[],
): Promise<void> {
  await adapter.bulkPut(store, items);
}

/**
 * Remove one item by id (expire from cache).
 */
export async function expireItem(
  adapter: ICacheStorageAdapter,
  store: string,
  id: string,
): Promise<void> {
  await adapter.delete(store, id);
}

/**
 * Filter rows by a predicate (for filterable caches). Predicate runs in JS over cached rows.
 */
export async function filter(
  adapter: ICacheStorageAdapter,
  store: string,
  predicate: (payload: unknown) => boolean,
  limit?: number,
): Promise<unknown[]> {
  const rows = await adapter.getAll(store, limit);
  return rows.map((r) => r.payload).filter(predicate);
}

// --- KV (delegate to adapter) ---

export async function getKV<T = unknown>(
  adapter: ICacheStorageAdapter,
  scope: string,
  key: string,
): Promise<T | undefined> {
  const value = await adapter.getKV(scope, key);
  return value as T | undefined;
}

export async function setKV(
  adapter: ICacheStorageAdapter,
  scope: string,
  key: string,
  value: unknown,
): Promise<void> {
  await adapter.setKV(scope, key, value);
}

export async function removeKV(
  adapter: ICacheStorageAdapter,
  scope: string,
  key: string,
): Promise<void> {
  await adapter.removeKV(scope, key);
}

export async function clearScope(adapter: ICacheStorageAdapter, scope: string): Promise<void> {
  await adapter.clearScope(scope);
}

/**
 * Keep `.in(...)` query strings below common proxy/request-line limits.
 * RPC array parameters travel in POST bodies and do not need this treatment.
 */
export const POSTGREST_ID_BATCH_SIZE = 100;

export function postgrestIdBatches(
  ids: readonly string[],
  batchSize = POSTGREST_ID_BATCH_SIZE
): string[][] {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let start = 0; start < unique.length; start += batchSize) {
    batches.push(unique.slice(start, start + batchSize));
  }
  return batches;
}

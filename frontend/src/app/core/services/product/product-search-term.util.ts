/**
 * Parses a search term into normalized words for matching.
 * Used so that "all words must appear in (name + manufacturer)" semantics
 * are consistent between cache and server paths.
 *
 * @param term - Raw search input
 * @returns Lowercase, non-empty words (split on whitespace)
 */
export function parseSearchWords(term: string): string[] {
  return term.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

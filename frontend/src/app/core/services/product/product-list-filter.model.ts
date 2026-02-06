import type { FacetCode } from './facet.types';
import { SortOrder } from '../../graphql/generated/graphql';
import type { ProductListOptions, ProductFilterParameter } from '../../graphql/generated/graphql';

/**
 * UI filter state for product list. Used by products table (and optionally sell browse).
 * Single source of truth for "what the user selected" before building API options.
 */
export interface ProductListFilterState {
  /** Search across name, description, slug, sku */
  searchTerm?: string;
  /** Selected facet value IDs per facet code (AND across facets, OR within) */
  facetValueIds?: Partial<Record<FacetCode, string[]>>;
  /** null = no filter, true = active only, false = disabled only */
  enabled?: boolean | null;
  /** Name sort; undefined = default (no sort) */
  sort?: { name?: 'ASC' | 'DESC' };
}

export interface ProductListPagination {
  take: number;
  skip: number;
}

/**
 * Builds ProductListOptions from filter state and pagination.
 * Pure function: no services, no side effects. Reusable by products page and any future list consumer.
 */
export function buildProductListOptions(
  state: ProductListFilterState,
  pagination: ProductListPagination
): ProductListOptions {
  const conditions: ProductFilterParameter[] = [];

  const term = (state.searchTerm ?? '').trim();
  if (term.length > 0) {
    conditions.push({
      _or: [
        { name: { contains: term } },
        { description: { contains: term } },
        { slug: { contains: term } },
        { sku: { contains: term } },
      ],
    });
  }

  const facetIds = state.facetValueIds ?? {};
  for (const ids of Object.values(facetIds)) {
    if (ids && ids.length > 0) {
      conditions.push({ facetValueId: { in: ids } });
    }
  }

  if (state.enabled !== undefined && state.enabled !== null) {
    conditions.push({ enabled: { eq: state.enabled } });
  }

  const filter: ProductFilterParameter | undefined =
    conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0]! : { _and: conditions };

  const sort =
    state.sort?.name !== undefined
      ? { name: state.sort.name === 'ASC' ? SortOrder.ASC : SortOrder.DESC }
      : undefined;

  return {
    filter,
    sort,
    take: pagination.take,
    skip: pagination.skip,
  };
}

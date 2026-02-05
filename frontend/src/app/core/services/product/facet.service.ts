import { inject, Injectable } from '@angular/core';
import {
  CREATE_FACET,
  CREATE_FACET_VALUE,
  GET_FACETS_BY_CODES,
  GET_FACET_VALUES,
} from '../../graphql/operations.graphql';
import { ApolloService } from '../apollo.service';
import type { FacetValueSummary } from './facet.types';
import { FACET_CODES, FACET_DISPLAY_NAMES, type FacetCode } from './facet.types';

export interface FacetInfo {
  id: string;
  code: string;
  name: string;
}

/**
 * Facet service: get/create facets and facet values for manufacturer, category, tags.
 * Stateless; per-session cache for getFacetByCode to avoid repeated createFacet.
 */
@Injectable({
  providedIn: 'root',
})
export class FacetService {
  private readonly apollo = inject(ApolloService);
  private readonly facetCache = new Map<string, FacetInfo>();

  /**
   * Get facet by code (manufacturer, category, tags). Creates the facet if it does not exist.
   */
  async getFacetByCode(code: FacetCode): Promise<FacetInfo> {
    const cached = this.facetCache.get(code);
    if (cached) return cached;

    const client = this.apollo.getClient();
    const result = await client.query<{
      facets: { items: Array<{ id: string; code: string; name: string }> };
    }>({
      query: GET_FACETS_BY_CODES,
      variables: { codes: FACET_CODES },
    });

    const facet = result.data?.facets?.items?.find((f) => f.code === code);
    if (facet) {
      this.facetCache.set(code, facet);
      return facet;
    }

    const displayName = FACET_DISPLAY_NAMES[code];
    const createResult = await client.mutate<{
      createFacet: { id: string; code: string; name: string };
    }>({
      mutation: CREATE_FACET,
      variables: {
        input: {
          code,
          isPrivate: true,
          translations: [{ languageCode: 'en' as const, name: displayName }],
        },
      },
    });

    const created = createResult.data?.createFacet;
    if (!created) throw new Error('Failed to create facet');
    this.facetCache.set(code, created);
    return created;
  }

  /**
   * Search facet values by facet id and optional name term.
   */
  async searchFacetValues(facetId: string, term: string = ''): Promise<FacetValueSummary[]> {
    const client = this.apollo.getClient();
    const result = await client.query<{
      facetValues: { items: Array<{ id: string; name: string; code: string }> };
    }>({
      query: GET_FACET_VALUES,
      variables: { facetId, term: term || '' },
    });

    const items = result.data?.facetValues?.items ?? [];
    return items.map((v) => ({
      id: v.id,
      name: v.name,
      code: v.code,
    }));
  }

  /**
   * Create a new facet value and return its summary.
   */
  async createFacetValue(facetId: string, name: string): Promise<FacetValueSummary> {
    const code = this.slug(name);
    const client = this.apollo.getClient();
    const result = await client.mutate<{
      createFacetValue: { id: string; name: string; code: string };
    }>({
      mutation: CREATE_FACET_VALUE,
      variables: {
        input: {
          facetId,
          code,
          translations: [{ languageCode: 'en' as const, name: name.trim() }],
        },
      },
    });

    const created = result.data?.createFacetValue;
    if (!created) throw new Error('Failed to create facet value');
    return { id: created.id, name: created.name, code: created.code };
  }

  /**
   * Generate a safe slug for facet value code: lowercase, spaces to hyphen, strip invalid.
   */
  slug(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'value';
    const lower = trimmed.toLowerCase();
    const replaced = lower.replace(/\s+/g, '-');
    const safe = replaced.replace(/[^a-z0-9_-]/g, '');
    return safe || 'value';
  }
}

import { Injectable, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { parseArray, parseBoolean, parseNumber } from '../utils/deep-link.util';

/**
 * Configuration for a single query parameter
 */
export interface DeepLinkParamConfig {
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  defaultValue?: any;
  transform?: (value: string) => any;
  separator?: string; // For array type
}

/**
 * Configuration for deep link processing
 */
export interface DeepLinkConfig<T extends Record<string, any>> {
  params: Record<keyof T, DeepLinkParamConfig>;
  handler: (params: T) => Promise<void> | void;
  clearAfterProcess?: boolean;
  strategy?: 'immediate' | 'deferred' | 'manual';
}

/**
 * Deep Link Service
 *
 * Provides type-safe query parameter reading and processing.
 * Supports different param types (string, number, boolean, arrays)
 * with automatic transformation and optional cleanup.
 *
 * USAGE:
 * ```typescript
 * deepLinkService.processQueryParams(this.route, {
 *   params: {
 *     variantId: { type: 'string', required: false },
 *     quantity: { type: 'number', defaultValue: 1 }
 *   },
 *   handler: async (params) => {
 *     if (params.variantId) {
 *       await this.handleVariant(params.variantId);
 *     }
 *   },
 *   clearAfterProcess: true,
 *   strategy: 'immediate'
 * });
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class DeepLinkService {
  private readonly router = inject(Router);

  /**
   * Read and parse query parameters according to configuration
   * @param route - ActivatedRoute to read params from
   * @param config - Configuration for param types and defaults
   * @returns Parsed and typed parameter object
   */
  readQueryParams<T extends Record<string, any>>(
    route: ActivatedRoute,
    config: DeepLinkConfig<T>,
  ): T {
    const queryParams = route.snapshot.queryParams;
    const result = {} as T;

    for (const [key, paramConfig] of Object.entries(config.params)) {
      const rawValue = queryParams[key];
      const typedKey = key as keyof T;

      // Handle missing value
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        if (paramConfig.required) {
          throw new Error(`Required query parameter '${key}' is missing`);
        }
        if (paramConfig.defaultValue !== undefined) {
          result[typedKey] = paramConfig.defaultValue;
        } else {
          result[typedKey] = undefined as any;
        }
        continue;
      }

      // Apply custom transform if provided
      if (paramConfig.transform) {
        result[typedKey] = paramConfig.transform(rawValue);
        continue;
      }

      // Parse based on type
      switch (paramConfig.type) {
        case 'string':
          result[typedKey] = String(rawValue) as any;
          break;

        case 'number': {
          const parsed = parseNumber(rawValue);
          if (parsed === null && paramConfig.required) {
            throw new Error(`Query parameter '${key}' must be a valid number`);
          }
          result[typedKey] = (parsed ?? paramConfig.defaultValue ?? null) as any;
          break;
        }

        case 'boolean':
          result[typedKey] = parseBoolean(rawValue) as any;
          break;

        case 'array': {
          const separator = paramConfig.separator || ',';
          result[typedKey] = parseArray(rawValue, separator) as any;
          break;
        }

        default:
          result[typedKey] = rawValue as any;
      }
    }

    return result;
  }

  /**
   * Process query parameters with a handler function
   * Automatically handles parsing, validation, and optional cleanup
   * @param route - ActivatedRoute to read params from
   * @param config - Configuration for param types and handler
   * @returns Promise that resolves when processing is complete
   */
  async processQueryParams<T extends Record<string, any>>(
    route: ActivatedRoute,
    config: DeepLinkConfig<T>,
  ): Promise<void> {
    try {
      // Read and parse query params
      const params = this.readQueryParams(route, config);

      // Execute handler
      const handlerResult = config.handler(params);
      if (handlerResult instanceof Promise) {
        await handlerResult;
      }

      // Clear params after processing if requested
      if (config.clearAfterProcess) {
        const paramKeys = Object.keys(config.params);
        this.clearQueryParams(route, paramKeys);
      }
    } catch (error) {
      console.error('Deep link processing failed:', error);
      // Still clear params on error if requested
      if (config.clearAfterProcess) {
        const paramKeys = Object.keys(config.params);
        this.clearQueryParams(route, paramKeys);
      }
      throw error;
    }
  }

  /**
   * Clear specific query parameters from the URL
   * @param route - ActivatedRoute to get current route from
   * @param paramKeys - Array of parameter keys to clear
   */
  clearQueryParams(route: ActivatedRoute, paramKeys: string[]): void {
    const queryParams = { ...route.snapshot.queryParams };
    let hasChanges = false;

    // Remove specified params
    for (const key of paramKeys) {
      if (queryParams[key] !== undefined) {
        delete queryParams[key];
        hasChanges = true;
      }
    }

    // Update URL if there were changes
    if (hasChanges) {
      this.router.navigate([], {
        relativeTo: route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  /**
   * Watch query parameters for changes
   * Returns an observable that emits whenever query params change
   * @param route - ActivatedRoute to watch
   * @param config - Configuration for param types
   * @returns Observable that emits parsed params
   */
  watchQueryParams<T extends Record<string, any>>(
    route: ActivatedRoute,
    config: DeepLinkConfig<T>,
  ) {
    return route.queryParams.pipe(
      // Transform raw params to typed params
      // Note: This is a simplified version - full implementation would need RxJS operators
      // For now, components can use route.queryParams.subscribe() and call readQueryParams
    );
  }
}





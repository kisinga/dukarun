import type { ParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { hasRegistrationIntent } from './registration-intent';

function paramMap(values: Record<string, string>): ParamMap {
  return {
    keys: Object.keys(values),
    has: key => Object.hasOwn(values, key),
    get: key => values[key] ?? null,
    getAll: key => {
      const value = values[key];
      return value === undefined ? [] : [value];
    },
  };
}

describe('hasRegistrationIntent', () => {
  const explicitIntents: Record<string, string>[] = [
    { register: '1' },
    { blog_ref: 'launch-post' },
    { sales_code: 'AMINA7' },
  ];

  it.each(explicitIntents)('accepts explicit registration query params: %o', params => {
    expect(hasRegistrationIntent(paramMap(params))).toBe(true);
  });

  it('rejects an ordinary login request', () => {
    expect(hasRegistrationIntent(paramMap({}))).toBe(false);
  });
});

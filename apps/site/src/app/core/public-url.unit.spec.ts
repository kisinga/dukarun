import { describe, expect, it } from 'vitest';
import { appUrl } from './public-url';

describe('public app URLs', () => {
  it('builds an application URL and encodes query values', () => {
    const result = new URL(appUrl('/login', { redirect: '/money?tab=expenses' }));

    expect(result.pathname).toBe('/login');
    expect(result.searchParams.get('redirect')).toBe('/money?tab=expenses');
  });
});

import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('retains messages from Error instances and API error objects', () => {
    expect(errorMessage(new Error('Native failure'), 'Fallback')).toBe('Native failure');
    expect(errorMessage({ code: 'PGRST201', message: 'Ambiguous relationship' }, 'Fallback')).toBe(
      'Ambiguous relationship'
    );
  });

  it('uses the fallback for unsafe or empty rejection values', () => {
    expect(errorMessage(null, 'Fallback')).toBe('Fallback');
    expect(errorMessage({ message: '' }, 'Fallback')).toBe('Fallback');
  });
});

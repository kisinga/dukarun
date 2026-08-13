import { describe, expect, it, vi } from 'vitest';
import { runIndependentLoads } from './independent-load';

describe('runIndependentLoads', () => {
  it('commits successful reads when a sibling read fails', async () => {
    const commitAccounts = vi.fn();
    const reportHistoryError = vi.fn();

    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load accounts',
        run: async () => commitAccounts(['CASH_ON_HAND']),
      },
      {
        fallback: 'Failed to load history',
        run: async () => {
          throw new Error('History relationship is ambiguous');
        },
        onError: reportHistoryError,
      },
    ]);

    expect(commitAccounts).toHaveBeenCalledWith(['CASH_ON_HAND']);
    expect(reportHistoryError).toHaveBeenCalledWith('History relationship is ambiguous');
    expect(errors).toEqual(['History relationship is ambiguous']);
  });

  it('uses a task fallback for non-Error rejections', async () => {
    const reportError = vi.fn();
    const errors = await runIndependentLoads([
      {
        fallback: 'Failed to load accounts',
        run: async () => Promise.reject(null),
        onError: reportError,
      },
    ]);

    expect(reportError).toHaveBeenCalledWith('Failed to load accounts');
    expect(errors).toEqual(['Failed to load accounts']);
  });

  it('captures synchronous task failures without skipping sibling tasks', async () => {
    const commitHistory = vi.fn();

    const errors = await runIndependentLoads([
      {
        fallback: 'Failed synchronously',
        run: () => {
          throw new Error('Synchronous failure');
        },
      },
      {
        fallback: 'Failed to load history',
        run: async () => commitHistory(),
      },
    ]);

    expect(commitHistory).toHaveBeenCalledOnce();
    expect(errors).toEqual(['Synchronous failure']);
  });
});

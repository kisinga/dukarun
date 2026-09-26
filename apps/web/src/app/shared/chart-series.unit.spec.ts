import { describe, expect, it } from 'vitest';
import { bucketDatedSeries } from './chart-series';

function dailyPoints(count: number): Array<{ day: string; value: number }> {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    day: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    value: index,
  }));
}

describe('bucketDatedSeries', () => {
  it('keeps short periods daily', () => {
    const result = bucketDatedSeries(dailyPoints(30));

    expect(result.resolution).toBe('daily');
    expect(result.buckets).toHaveLength(30);
  });

  it('reduces medium periods to weekly buckets', () => {
    const result = bucketDatedSeries(dailyPoints(180));

    expect(result.resolution).toBe('weekly');
    expect(result.buckets).toHaveLength(26);
    expect(result.buckets[0].points).toHaveLength(7);
  });

  it('reduces long periods to calendar months', () => {
    const result = bucketDatedSeries(dailyPoints(365));

    expect(result.resolution).toBe('monthly');
    expect(result.buckets).toHaveLength(12);
    expect(result.buckets[0].key).toBe('2025-01');
  });
});

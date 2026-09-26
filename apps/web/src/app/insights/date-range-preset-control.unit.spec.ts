import { describe, expect, it } from 'vitest';
import { inclusiveDateRangeDays, presetDateRange } from './date-range';

describe('insights date range', () => {
  it('anchors presets to the server-authored business date', () => {
    expect(presetDateRange('2026-09-26', 30)).toEqual({
      from: '2026-08-28',
      to: '2026-09-26',
    });
    expect(presetDateRange('2026-09-26', 365)).toEqual({
      from: '2025-09-27',
      to: '2026-09-26',
    });
  });

  it('counts custom ranges inclusively across calendar boundaries', () => {
    expect(inclusiveDateRangeDays('2026-08-28', '2026-09-26')).toBe(30);
    expect(inclusiveDateRangeDays('2024-02-29', '2024-03-01')).toBe(2);
  });
});

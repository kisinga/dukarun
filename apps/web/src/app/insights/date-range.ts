import type { DateRangePreset } from './insights.models';

export interface AppliedDateRange {
  from: string;
  to: string;
}

export function presetDateRange(until: string, days: DateRangePreset): AppliedDateRange {
  const from = new Date(`${until}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: until };
}

export function inclusiveDateRangeDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

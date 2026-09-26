export type ChartResolution = 'daily' | 'weekly' | 'monthly';

export interface ChartBucket<T> {
  key: string;
  firstDay: string;
  lastDay: string;
  points: T[];
}

export interface BucketedChartSeries<T> {
  resolution: ChartResolution;
  buckets: ChartBucket<T>[];
}

/**
 * Keeps reporting charts visually stable by reducing longer daily series to a
 * useful number of marks instead of making the plot physically wider.
 */
export function bucketDatedSeries<T extends { day: string }>(
  points: readonly T[]
): BucketedChartSeries<T> {
  const source = [...points].sort((left, right) => left.day.localeCompare(right.day));

  if (source.length <= 45) {
    return {
      resolution: 'daily',
      buckets: source.map(point => ({
        key: point.day,
        firstDay: point.day,
        lastDay: point.day,
        points: [point],
      })),
    };
  }

  if (source.length <= 210) {
    const buckets: ChartBucket<T>[] = [];
    for (let index = 0; index < source.length; index += 7) {
      const group = source.slice(index, index + 7);
      buckets.push({
        key: group[0].day,
        firstDay: group[0].day,
        lastDay: group.at(-1)?.day ?? group[0].day,
        points: group,
      });
    }
    return { resolution: 'weekly', buckets };
  }

  const months = new Map<string, T[]>();
  for (const point of source) {
    const key = point.day.slice(0, 7);
    const month = months.get(key) ?? [];
    month.push(point);
    months.set(key, month);
  }
  return {
    resolution: 'monthly',
    buckets: [...months.entries()].map(([key, month]) => ({
      key,
      firstDay: month[0].day,
      lastDay: month.at(-1)?.day ?? month[0].day,
      points: month,
    })),
  };
}

export function chartResolutionLabel(resolution: ChartResolution): string {
  switch (resolution) {
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return 'Daily';
  }
}

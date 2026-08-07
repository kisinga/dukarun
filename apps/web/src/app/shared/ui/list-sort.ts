import type { ListSortDirection } from './list-search-bar.component';

export type ListSortValue = string | number | boolean | null | undefined;

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** Stable, null-last sorting shared by list/table and mobile-card views. */
export function sortList<T>(
  rows: readonly T[],
  direction: ListSortDirection,
  ...selectors: ReadonlyArray<(row: T) => ListSortValue>
): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      for (const selector of selectors) {
        const result = compareValues(selector(left.row), selector(right.row), direction);
        if (result !== 0) return result;
      }
      return left.index - right.index;
    })
    .map(item => item.row);
}

function compareValues(
  left: ListSortValue,
  right: ListSortValue,
  direction: ListSortDirection
): number {
  const leftMissing = left === null || left === undefined || left === '';
  const rightMissing = right === null || right === undefined || right === '';
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }

  let result: number;
  if (typeof left === 'number' && typeof right === 'number') {
    result = left - right;
  } else if (typeof left === 'boolean' && typeof right === 'boolean') {
    result = Number(left) - Number(right);
  } else {
    result = collator.compare(String(left), String(right));
  }
  return direction === 'asc' ? result : -result;
}

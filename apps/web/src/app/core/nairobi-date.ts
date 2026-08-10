const NAIROBI_OFFSET = '+03:00';

export function nairobiDayStart(date: string): string {
  return `${date}T00:00:00${NAIROBI_OFFSET}`;
}

export function nairobiDayEndExclusive(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const iso = next.toISOString().slice(0, 10);
  return `${iso}T00:00:00${NAIROBI_OFFSET}`;
}

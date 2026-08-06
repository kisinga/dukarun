export const QUEUE_AGING_MINUTES = 15; // neutral -> warning
export const QUEUE_STALE_MINUTES = 60; // warning -> error ("stale")
export const QUEUE_LONG_COUNT = 5; // "queue is getting long"

export type QueueAge = 'fresh' | 'aging' | 'stale';

export function waitMinutes(pendingSinceIso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(pendingSinceIso).getTime()) / 60_000));
}

export function queueAge(pendingSinceIso: string, now = Date.now()): QueueAge {
  const m = waitMinutes(pendingSinceIso, now);
  if (m >= QUEUE_STALE_MINUTES) return 'stale';
  if (m >= QUEUE_AGING_MINUTES) return 'aging';
  return 'fresh';
}

/** e.g. "Just now", "12m", "2h 5m", "1d 3h" */
export function waitLabel(pendingSinceIso: string, now = Date.now()): string {
  const minutes = waitMinutes(pendingSinceIso, now);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

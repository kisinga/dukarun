/**
 * Channel approval status enum
 *
 * UNAPPROVED: Read-only access
 * APPROVED: Full access
 * DISABLED: No access (temporary)
 * BANNED: No access (permanent)
 */
export enum ChannelStatus {
  UNAPPROVED = 'UNAPPROVED',
  APPROVED = 'APPROVED',
  DISABLED = 'DISABLED',
  BANNED = 'BANNED',
}

/**
 * TypeScript interface for Channel customFields
 *
 * This provides type safety when accessing Channel.customFields in the codebase.
 * The status field is the single source of truth for channel approval status.
 */
export interface ChannelCustomFields {
  /**
   * Channel approval status - single source of truth
   * UNAPPROVED: Read-only access
   * APPROVED: Full access
   * DISABLED: No access (temporary)
   * BANNED: No access (permanent)
   */
  status: ChannelStatus;

  /** Cached stock value stats as JSON string; internal use only */
  stockValueCache?: string | null;
}

/**
 * Parsed shape of Channel.customFields.stockValueCache (amounts in cents as strings).
 */
export interface StockValueCache {
  retail: string;
  wholesale: string;
  cost: string;
  updatedAt: string;
}

/**
 * Parse stock value cache from channel custom fields.
 * Returns null if missing or invalid JSON.
 */
export function parseStockValueCache(customFields: any): StockValueCache | null {
  const raw = customFields?.stockValueCache;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StockValueCache).retail === 'string' &&
      typeof (parsed as StockValueCache).wholesale === 'string' &&
      typeof (parsed as StockValueCache).cost === 'string' &&
      typeof (parsed as StockValueCache).updatedAt === 'string'
    ) {
      return parsed as StockValueCache;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Helper function to safely extract channel status from customFields
 * Returns UNAPPROVED as default if status is missing
 */
export function getChannelStatus(customFields: any): ChannelStatus {
  return (customFields?.status as ChannelStatus) || ChannelStatus.UNAPPROVED;
}

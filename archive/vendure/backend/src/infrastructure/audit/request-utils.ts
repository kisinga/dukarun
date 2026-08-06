import { RequestContext } from '@vendure/core';
import * as requestIp from 'request-ip';

/**
 * Extract client IP address from RequestContext.
 * Handles reverse proxy headers (X-Forwarded-For, X-Real-IP) with fallback to direct connection.
 * Returns null if request object is not available or IP cannot be determined.
 */
export function getClientIp(ctx: RequestContext): string | null {
  try {
    const req = (ctx as any).req;
    if (!req) {
      return null;
    }
    const clientIp = requestIp.getClientIp(req);
    return clientIp || null;
  } catch {
    return null;
  }
}

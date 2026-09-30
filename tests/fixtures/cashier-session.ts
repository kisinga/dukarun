import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import type {
  OfflineContext,
  OfflineSession,
} from '../../apps/web/src/app/pos/offline/offline-contract';

/** Mirror the confirmed-session RPC, including device binding and server time. */
export async function mockCashierSession(
  page: Page,
  options: {
    companyId: string;
    userId: string;
    locationId: string;
    open?: () => boolean;
    canSettle?: boolean;
  }
): Promise<void> {
  const sessionId = randomUUID();
  const contextId = randomUUID();
  const openedAt = new Date().toISOString();
  await page.route('**/rest/v1/rpc/confirm_offline_sale_context', async route => {
    const request = route.request().postDataJSON();
    expect(request.p_location_id).toBe(options.locationId);
    expect(request.p_device_key).toEqual(expect.any(String));
    expect(request.p_device_key.length).toBeGreaterThan(0);
    const now = new Date();
    const session: OfflineSession | null =
      (options.open?.() ?? true)
        ? {
            id: sessionId,
            company_id: options.companyId,
            cashier_user_id: options.userId,
            location_id: options.locationId,
            status: 'open',
            opened_at: openedAt,
            created_at: openedAt,
            closed_at: null,
            closing_declared: null,
          }
        : null;
    const context: OfflineContext | null =
      session && (options.canSettle ?? true)
        ? {
            id: contextId,
            company_id: options.companyId,
            user_id: options.userId,
            location_id: options.locationId,
            session_id: sessionId,
            device_key: request.p_device_key,
            issued_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          }
        : null;
    await route.fulfill({ json: { session, context, server_time: now.toISOString() } });
  });
}

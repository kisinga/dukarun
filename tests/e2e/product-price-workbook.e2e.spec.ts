import { expect, test, type Page } from '@playwright/test';
import { Workbook } from 'exceljs';

const companyId = '85000000-0000-4000-8000-000000000001';
const userId = '85000000-0000-4000-8000-000000000002';
const locationId = '85000000-0000-4000-8000-000000000003';
const productId = '85000000-0000-4000-8000-000000000004';
const variantId = '85000000-0000-4000-8000-000000000005';
const updatedAt = '2026-08-19T08:00:00.000Z';

function authSession() {
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: userId,
    company_id: companyId,
    user_role: 'Owner',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(
    JSON.stringify(payload)
  ).toString('base64url')}.mock-signature`;
  return {
    access_token: token,
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: payload.exp,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'owner@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: updatedAt,
    },
  };
}

async function mockPriceWorkbookFlow(page: Page) {
  const session = authSession();
  let appliedChanges: unknown = null;
  let catalogRefreshes = 0;
  let lastCatalogPriceServed = 100;
  await page.addInitScript(
    value => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify(value.session));
      localStorage.setItem(
        `dukarun:working-location:${value.companyId}:${value.userId}`,
        value.locationId
      );
    },
    { session, companyId, userId, locationId }
  );

  const company = {
    id: companyId,
    name: 'Workbook Shop',
    address: null,
    email: null,
    logo_path: null,
    public_storefront_enabled: false,
    public_slug: null,
    public_whatsapp_number: null,
    notification_category_preferences: null,
    enable_printer: false,
    proforma_validity_days: 7,
    low_stock_threshold: 5,
    cashier_flow_enabled: false,
    batch_expiry_enabled: false,
    cash_control_enabled: false,
    require_opening_count: false,
    variance_notification_threshold: 0,
    commissions_enabled: false,
    payment_reminders_enabled: false,
    payment_reminder_channel: 'whatsapp',
    payment_reminder_sms_fallback: false,
    automated_customer_notifications_enabled: false,
    automated_customer_notifications_override: null,
  };
  const variant = {
    id: variantId,
    company_id: companyId,
    product_id: productId,
    name: '250g',
    sku: 'TEA-250',
    barcode: null,
    kind: 'good',
    price: 100,
    wholesale_price: 80,
    track_inventory: true,
    allow_fractional: false,
    active: true,
    created_at: updatedAt,
    updated_at: updatedAt,
  };

  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/v1/user')) return json(session.user);
    if (path.endsWith('/rest/v1/rpc/current_company_legal_status')) {
      return json({
        required: false,
        accepted: true,
        can_accept: true,
        company_status: 'approved',
        enforcement_started: false,
      });
    }
    if (path.endsWith('/rest/v1/rpc/current_access_snapshot')) {
      return json({
        company_id: companyId,
        user_id: userId,
        permissions: ['ManageCatalog'],
        actions: {},
      });
    }
    if (path.endsWith('/rest/v1/rpc/current_entitlements')) {
      return json({
        companyId,
        status: 'active',
        tierCode: 'pro',
        tierName: 'Pro',
        features: {},
        settings: {},
        limits: {},
        usage: {
          stockLocations: 1,
          products: 1,
          ordersThisMonth: 0,
          teamMembers: 1,
          sms: { used: 0, reserved: 0, remaining: null },
          whatsapp: { used: 0, reserved: 0, remaining: null },
          periodEnd: null,
        },
      });
    }
    if (path.endsWith('/rest/v1/rpc/accessible_business_locations')) {
      return json([
        { id: locationId, code: 'MAIN', name: 'Main shop', is_default: true, is_primary: true },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/apply_catalog_price_updates')) {
      const changes = request.postDataJSON().p_changes as Array<{ new_retail_price?: number }>;
      appliedChanges = changes;
      if (changes[0]?.new_retail_price !== undefined) {
        variant.price = changes[0].new_retail_price;
      }
      return json({ updated_variants: 1, retail_changes: 1, wholesale_changes: 0 });
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) {
      catalogRefreshes++;
      lastCatalogPriceServed = variant.price;
      return json([
        {
          variant_id: variantId,
          variant_updated_at: updatedAt,
          company_id: companyId,
          product_id: productId,
          product_name: 'Tea',
          variant_name: '250g',
          kind: 'good',
          sku: 'TEA-250',
          barcode: null,
          price: variant.price,
          wholesale_price: 80,
          allow_fractional: false,
          track_inventory: true,
          variant_active: true,
          product_active: true,
          image_path: null,
          stock: 0,
          manufacturer_id: null,
          manufacturer_name: null,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/companies')) {
      return request.headers()['accept']?.includes('application/vnd.pgrst.object')
        ? json(company)
        : json([company]);
    }
    if (path.endsWith('/rest/v1/product_variants')) return json([variant]);
    if (path.endsWith('/rest/v1/stock_locations')) {
      return json([
        {
          id: locationId,
          company_id: companyId,
          code: 'MAIN',
          name: 'Main shop',
          is_default: true,
        },
      ]);
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });

  return {
    appliedChanges: () => appliedChanges,
    catalogRefreshes: () => catalogRefreshes,
    lastCatalogPriceServed: () => lastCatalogPriceServed,
  };
}

test('Settings exports, previews, and applies a price workbook', async ({ page }) => {
  const state = await mockPriceWorkbookFlow(page);
  await page.goto('http://127.0.0.1:4203/settings?tab=data');
  await expect(page.getByRole('heading', { name: 'Data import & export' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export prices' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dukarun-price-update-.*\.xlsx$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));

  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  expect(workbook.getWorksheet('_DukaRun Metadata')!.getCell('B2').value).toBe('price_update');
  workbook.getWorksheet('Price Updates')!.getCell('I2').value = 125;
  const edited = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.getByRole('button', { name: 'Import workbook' }).click();
  await page.locator('#product-import-file').setInputFiles({
    name: 'edited-prices.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: edited,
  });
  await expect(page.getByText('Retail: KES 100 → KES 125')).toBeVisible();
  const refreshesBeforeApply = state.catalogRefreshes();
  await page.getByRole('button', { name: 'Apply price changes' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Price update complete: 1 variants updated · 1 retail · 0 wholesale.'
  );
  expect(state.appliedChanges()).toEqual([
    {
      variant_id: variantId,
      expected_updated_at: updatedAt,
      new_retail_price: 125,
    },
  ]);
  await expect.poll(state.catalogRefreshes).toBeGreaterThan(refreshesBeforeApply);
  expect(state.lastCatalogPriceServed()).toBe(125);
});

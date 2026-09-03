import { expect, test, type Page } from '@playwright/test';
import { Workbook } from 'exceljs';

const companyId = '85000000-0000-4000-8000-000000000001';
const userId = '85000000-0000-4000-8000-000000000002';
const locationId = '85000000-0000-4000-8000-000000000003';
const productId = '85000000-0000-4000-8000-000000000004';
const variantId = '85000000-0000-4000-8000-000000000005';
const manufacturerId = '85000000-0000-4000-8000-000000000006';
const batchId = '85000000-0000-4000-8000-000000000007';
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
  let appliedProductChanges: unknown = null;
  let appliedBatchChanges: unknown = null;
  let catalogRefreshes = 0;
  let lastCatalogPriceServed = 100;
  let catalogStock = 10;
  let lastCatalogStockServed = 10;
  let manufacturerName = 'Acme';
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
    subscription_status: 'active',
    subscription_expires_at: '2099-12-31T23:59:59Z',
    subscription_grace_period_end: null,
    subscription_exempt_until: null,
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
        permissions: [
          'ManageCatalog',
          'ManageStockAdjustments',
          'ViewFinancials',
          'ManageCompanySettings',
        ],
        workspaces: ['dashboard', 'inventory', 'purchasing'],
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
    if (path.endsWith('/rest/v1/rpc/apply_catalog_workbook_updates')) {
      const payload = request.postDataJSON();
      const changes = payload.p_variant_changes as Array<{
        new_retail_price?: number;
        new_stock_quantity?: number;
      }>;
      appliedChanges = changes;
      appliedProductChanges = payload.p_product_changes;
      appliedBatchChanges = payload.p_batch_changes;
      if (changes[0]?.new_retail_price !== undefined) {
        variant.price = changes[0].new_retail_price;
      }
      if (changes[0]?.new_stock_quantity !== undefined) {
        catalogStock = changes[0].new_stock_quantity;
      }
      if (payload.p_product_changes?.[0]?.new_manufacturer_name) {
        manufacturerName = payload.p_product_changes[0].new_manufacturer_name;
      }
      return json({
        updated_variants: 1,
        retail_changes: 1,
        wholesale_changes: 0,
        stock_changes: 1,
        manufacturer_changes: 1,
        created: 0,
        disabled_variants: 0,
        disabled_products: 0,
        batch_changes: 1,
        batches_created: 0,
        batches_updated: 1,
      });
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_families')) {
      return json([
        {
          id: productId,
          company_id: companyId,
          name: 'Tea',
          barcode: null,
          active: true,
          manufacturer_id: manufacturerId,
          tax_category_id: null,
          image_path: null,
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) {
      catalogRefreshes++;
      lastCatalogPriceServed = variant.price;
      lastCatalogStockServed = catalogStock;
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
          stock: catalogStock,
          manufacturer_id: manufacturerId,
          manufacturer_name: manufacturerName,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/location_stock_for_variants')) {
      return json([{ variant_id: variantId, stock: catalogStock, stock_value: 500 }]);
    }
    if (path.endsWith('/rest/v1/companies')) {
      return request.headers()['accept']?.includes('application/vnd.pgrst.object')
        ? json(company)
        : json([company]);
    }
    if (path.endsWith('/rest/v1/products')) {
      return json([
        {
          id: productId,
          company_id: companyId,
          name: 'Tea',
          barcode: null,
          active: true,
          manufacturer_id: manufacturerId,
          tax_category_id: null,
          created_at: updatedAt,
          updated_at: updatedAt,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/manufacturers')) {
      return json([
        { id: manufacturerId, name: manufacturerName, active: true },
        {
          id: '85000000-0000-4000-8000-000000000008',
          name: 'New Dairy',
          active: true,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/product_variants')) return json([variant]);
    if (path.endsWith('/rest/v1/inventory_batches')) {
      return json([
        {
          id: batchId,
          variant_id: variantId,
          stock_location_id: locationId,
          batch_number: 'PO-104',
          purchased_at: '2026-08-18T08:00:00.000Z',
          created_at: '2026-08-18T08:00:00.000Z',
          quantity: 10,
          remaining: 6,
          unit_cost: 0,
          original_cost: 0,
          remaining_cost: 0,
          expiry_date: null,
        },
      ]);
    }
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
    appliedProductChanges: () => appliedProductChanges,
    appliedBatchChanges: () => appliedBatchChanges,
    catalogRefreshes: () => catalogRefreshes,
    lastCatalogPriceServed: () => lastCatalogPriceServed,
    lastCatalogStockServed: () => lastCatalogStockServed,
  };
}

test('Settings exports, previews, and applies the unified catalog workbook', async ({ page }) => {
  const state = await mockPriceWorkbookFlow(page);
  await page.goto('http://127.0.0.1:4203/settings?tab=data');
  await expect(page.getByRole('heading', { name: 'Data import & export' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download editable workbook' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dukarun-products-and-stock-MAIN-.*\.xlsx$/);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));

  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  expect(workbook.getWorksheet('_DukaRun Metadata')!.getCell('B2').value).toBe('catalog_workbook');
  const sheet = workbook.getWorksheet('Products & Stock')!;
  const headerColumn = (name: string) => {
    let column = 0;
    sheet.getRow(1).eachCell((cell, index) => {
      if (cell.text === name) column = index;
    });
    return column;
  };
  sheet.getCell(2, headerColumn('manufacturer')).value = 'New Dairy';
  sheet.getCell(2, headerColumn('new_retail_price_kes')).value = 125;
  sheet.getCell(2, headerColumn('new_stock_quantity')).value = 7;
  expect(sheet.getCell(2, headerColumn('latest_batch')).value).toMatchObject({
    text: 'PO-104 · received 2026-08-18',
    hyperlink: "#'Batches'!K2",
  });
  sheet.getCell(2, headerColumn('latest_buying_price_kes')).value = 50;
  const edited = Buffer.from(await workbook.xlsx.writeBuffer());

  await page.getByRole('button', { name: 'Upload edited workbook' }).click();
  await page.locator('#product-import-file').setInputFiles({
    name: 'edited-prices.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: edited,
  });
  await expect(page.getByText('Retail: KES 100 → KES 125')).toBeVisible();
  await expect(page.getByText('Manufacturer: Acme → New Dairy')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Batch changes' })).toBeVisible();
  const refreshesBeforeApply = state.catalogRefreshes();
  await page.getByRole('button', { name: 'Apply workbook' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Workbook applied: 0 products created · 0 variants disabled · 0 products disabled · 1 manufacturers · 1 retail · 0 wholesale · 1 stock · 0 batches created · 1 batches updated.'
  );
  expect(state.appliedChanges()).toEqual([
    {
      variant_id: variantId,
      expected_updated_at: updatedAt,
      new_retail_price: 125,
      stock_location_id: locationId,
      expected_stock_quantity: 10,
      new_stock_quantity: 7,
    },
  ]);
  expect(state.appliedProductChanges()).toEqual([
    {
      product_id: productId,
      expected_updated_at: updatedAt,
      new_manufacturer_name: 'New Dairy',
    },
  ]);
  expect(state.appliedBatchChanges()).toEqual([
    {
      action: 'update',
      batch_id: batchId,
      variant_id: variantId,
      stock_location_id: locationId,
      latest: true,
      expected_remaining: 6,
      expected_unit_cost: 0,
      expected_remaining_cost: 0,
      expected_batch_number: 'PO-104',
      expected_expiry_date: null,
      new_unit_cost: 50,
      new_batch_number: 'PO-104',
      new_expiry_date: null,
      quantity_added: 0,
    },
  ]);
  await expect.poll(state.catalogRefreshes).toBeGreaterThan(refreshesBeforeApply);
  expect(state.lastCatalogPriceServed()).toBe(125);
  expect(state.lastCatalogStockServed()).toBe(7);
});

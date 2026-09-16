import { expect, test, type Page } from '@playwright/test';
import { Workbook } from 'exceljs';
import type { WorkbookChanges } from '../../apps/web/src/app/products/product-workbook';

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
  let applied: WorkbookChanges | null = null;
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
    stock_unit: 'bag',
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
    if (path.endsWith('/rest/v1/rpc/catalog_pack_definitions')) {
      return json([
        {
          variant_id: variantId,
          stock_unit: 'bag',
          packs: [
            {
              id: '85000000-0000-4000-8000-000000000008',
              name: 'Carton',
              units_per_pack: 6,
              sale_price: 550,
              barcode: 'CARTON-TEA',
              active: true,
            },
          ],
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/product_workbook_snapshot')) {
      return json({
        company_id: companyId,
        company_name: company.name,
        exported_at: updatedAt,
        location: { id: locationId, code: 'MAIN', name: 'Main shop' },
        capabilities: { stock: true, financial: true },
        products: [
          {
            id: productId,
            name: 'Tea',
            barcode: null,
            active: true,
            manufacturer_id: manufacturerId,
            tax_category_id: null,
            updated_at: updatedAt,
          },
        ],
        variants: [variant],
        manufacturers: [
          { id: manufacturerId, name: manufacturerName, active: true, updated_at: updatedAt },
          {
            id: '85000000-0000-4000-8000-000000000008',
            name: 'New Dairy',
            active: true,
            updated_at: updatedAt,
          },
        ],
        taxes: [],
        packs: [
          {
            id: '85000000-0000-4000-8000-000000000008',
            variant_id: variantId,
            name: 'Carton',
            units_per_pack: 6,
            sale_price: 550,
            barcode: 'CARTON-TEA',
            active: true,
          },
        ],
        stock: [
          {
            variant_id: variantId,
            quantity: catalogStock,
            value: 500,
            batch: {
              id: batchId,
              remaining: 6,
              unit_cost: 0,
              remaining_cost: 0,
              batch_number: 'PO-104',
              expiry_date: null,
            },
          },
        ],
      });
    }
    if (path.endsWith('/rest/v1/rpc/apply_product_workbook')) {
      applied = request.postDataJSON().p_changes as WorkbookChanges;
      const existing = applied.products.flatMap(p => p.variants).find(v => v.id === variantId);
      if (existing) variant.price = existing.values.price;
      if (applied.stock[0]) catalogStock = applied.stock[0].new_stock_quantity;
      return json({
        products_created: applied.products.filter(p => !p.id).length,
        products_updated: applied.products.filter(p => p.id).length,
        variants_created: applied.products.flatMap(p => p.variants).filter(v => !v.id).length,
        variants_updated: existing ? 1 : 0,
        manufacturers_changed: applied.manufacturers.length,
        packs_changed: applied.products
          .flatMap(p => p.variants)
          .reduce((n, v) => n + v.packs.length, 0),
        stock_changes: applied.stock.length,
        batch_changes: applied.batches.length,
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
    applied: () => applied,
    catalogRefreshes: () => catalogRefreshes,
    lastCatalogPriceServed: () => lastCatalogPriceServed,
    lastCatalogStockServed: () => lastCatalogStockServed,
  };
}

async function downloadWorkbook(page: Page): Promise<Workbook> {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download editable workbook' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^Products-MAIN-.*\.xlsx$/);
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  const workbook = new Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  return workbook;
}
async function uploadWorkbook(page: Page, workbook: Workbook): Promise<void> {
  await page.locator('#product-import-file').setInputFiles({
    name: 'Products-edited.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  });
}

test('Settings exports, previews, and applies the three-sheet Products workbook', async ({
  page,
}) => {
  const state = await mockPriceWorkbookFlow(page);
  await page.goto('http://127.0.0.1:4203/settings?tab=data');
  await expect(page.getByRole('heading', { name: 'Data import & export' })).toBeVisible();
  const workbook = await downloadWorkbook(page);
  expect(workbook.worksheets.filter(s => s.state === 'visible').map(s => s.name)).toEqual([
    'Products',
    'Manufacturers',
    'Pack sizes',
  ]);
  const sheet = workbook.getWorksheet('Products')!;
  sheet.getCell('B6').value = 'New Dairy';
  sheet.getCell('F6').value = 125;
  sheet.getCell('L6').value = 7;
  sheet.getCell('J6').value = 50;
  await page.getByRole('button', { name: 'Upload edited workbook' }).click();
  await uploadWorkbook(page, workbook);
  await expect(
    page
      .locator('[data-workbook-change]:visible')
      .filter({ hasText: 'Retail' })
      .getByText('125', { exact: true })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply workbook' })).toBeEnabled();
  const before = state.catalogRefreshes();
  await page.getByRole('button', { name: 'Apply workbook' }).click();
  await expect(page.getByRole('status')).toContainText('Workbook applied: 0 products created');
  expect(state.applied()?.products[0].values.manufacturer_key).toBe(
    '85000000-0000-4000-8000-000000000008'
  );
  expect(state.applied()?.products[0].variants[0].values.price).toBe(125);
  expect(state.applied()?.stock[0]).toMatchObject({
    expected_stock_quantity: 10,
    new_stock_quantity: 7,
  });
  expect(state.applied()?.batches[0]).toMatchObject({
    batch_id: batchId,
    new_unit_cost: 50,
    expected_remaining_cost: 0,
  });
  await expect.poll(state.catalogRefreshes).toBeGreaterThan(before);
  expect(state.lastCatalogPriceServed()).toBe(125);
  expect(state.lastCatalogStockServed()).toBe(7);
});

test('Workbook creates products, sizes/types and packs, and blocks pack stock entry', async ({
  page,
}) => {
  const state = await mockPriceWorkbookFlow(page);
  await page.goto('http://127.0.0.1:4203/settings?tab=data');
  const workbook = await downloadWorkbook(page);
  const sheet = workbook.getWorksheet('Products')!;
  workbook.getWorksheet('Pack sizes')!.getCell('A7').value = 'Tray';
  workbook.getWorksheet('Pack sizes')!.getCell('B7').value = 30;
  for (const [i, name, count] of [
    [8, 'Large', 120],
    [10, 'Small', 60],
  ] as const) {
    sheet.getCell(i, 1).value = 'Workbook Eggs';
    sheet.getCell(i, 3).value = name;
    sheet.getCell(i, 4).value = 'Single egg';
    sheet.getCell(i, 6).value = 20;
    sheet.getCell(i, 10).value = 14;
    sheet.getCell(i, 12).value = count;
    sheet.getCell(i, 13).value = `NEW-EGGS-${name}`;
    sheet.getCell(i + 1, 1).value = 'Workbook Eggs';
    sheet.getCell(i + 1, 3).value = name;
    sheet.getCell(i + 1, 4).value = 'Tray of 30 eggs';
    sheet.getCell(i + 1, 6).value = 480;
    sheet.getCell(i + 1, 14).value = `NEW-TRAY-${name}`;
  }
  sheet.getCell('L7').value = 5;
  await page.getByRole('button', { name: 'Upload edited workbook' }).click();
  await uploadWorkbook(page, workbook);
  await expect(page.getByText(/Counted stock belongs on the Single/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply workbook' })).toBeDisabled();
  sheet.getCell('L7').value = 'XXXX';
  await uploadWorkbook(page, workbook);
  await expect(page.getByRole('button', { name: 'Apply workbook' })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply workbook' }).click();
  await expect(page.getByRole('status')).toContainText('1 products created');
  expect(state.applied()?.products).toMatchObject([
    {
      values: { name: 'Workbook Eggs' },
      variants: [
        {
          values: { name: 'Large', stock_unit: 'egg' },
          opening_quantity: 120,
          packs: [{ name: 'Tray', units_per_pack: 30 }],
        },
        {
          values: { name: 'Small', stock_unit: 'egg' },
          opening_quantity: 60,
          packs: [{ name: 'Tray', units_per_pack: 30 }],
        },
      ],
    },
  ]);
});

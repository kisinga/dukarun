import { expect, test, type Page } from '../fixtures/mocked-browser';
import { renderedTextContrast } from '../fixtures/contrast';

const companyId = '97000000-0000-4000-8000-000000000001';
const userId = '97000000-0000-4000-8000-000000000002';
const locationId = '97000000-0000-4000-8000-000000000003';
const supplierId = '97000000-0000-4000-8000-000000000004';
const productId = '97000000-0000-4000-8000-000000000005';
const variantId = '97000000-0000-4000-8000-000000000006';
const draftId = '97000000-0000-4000-8000-000000000007';
const purchaseId = '97000000-0000-4000-8000-000000000008';

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
      created_at: '2026-08-01T08:00:00Z',
    },
  };
}

async function mockPurchasing(
  page: Page,
  sellable = false,
  overridePrices = false
): Promise<{
  changePack: (price: number, active?: boolean) => void;
  commandOrder: () => string[];
  savedDraft: () => unknown;
  purchasePayment: () => unknown;
  supplierPayment: () => unknown;
}> {
  const session = authSession();
  let catalogSequence = 0;
  const commandOrder: string[] = [];
  let savedDraft: unknown = null;
  let purchasePayment: unknown = null;
  let supplierPayment: unknown = null;
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

  const supplier = {
    id: supplierId,
    company_id: companyId,
    first_name: 'Karibu',
    last_name: 'Wholesalers',
    phone: '+254700000020',
    email: null,
    delivery_address: null,
    notes: null,
    is_supplier: true,
    is_credit_approved: false,
    credit_limit: 0,
    credit_terms_days: 0,
    supplier_active: true,
    supplier_credit_limit: 100_000,
    supplier_credit_terms_days: 30,
    tax_registration_number: null,
    notifications_enabled: true,
    sms_notifications_enabled: true,
    whatsapp_notifications_enabled: true,
    deleted_at: null,
    created_at: '2026-08-01T08:00:00Z',
    updated_at: '2026-08-01T08:00:00Z',
  };
  const variant = {
    variant_id: variantId,
    variant_name: 'Default',
    product_id: productId,
    product_name: 'Breakfast tea',
    product_active: true,
    variant_active: true,
    kind: 'good',
    sku: 'TEA-1',
    barcode: null,
    price: 125,
    stock_unit: 'packet',
    packs: [
      {
        id: '97000000-0000-4000-8000-000000000009',
        name: 'Supplier crate',
        units_per_pack: 24,
        sale_price: sellable ? 2400 : null,
        barcode: sellable ? 'TEA-CRATE-24' : null,
        active: true,
      },
    ],
    wholesale_price: 100,
    allow_fractional: false,
    track_inventory: true,
    stock: sellable ? 72 : 12,
    image_path: null,
    manufacturer_id: null,
    manufacturer_name: null,
  };
  const purchase = {
    id: purchaseId,
    company_id: companyId,
    supplier_id: supplierId,
    stock_location_id: locationId,
    purchase_date: '2026-08-27',
    reference: 'SUP-INV-20',
    notes: null,
    total_cost: 1_000,
    net_total: 1_000,
    input_tax_total: 0,
    claim_input_vat: false,
    tax_invoice_number: null,
    supplier_tax_pin: null,
    status: 'posted',
    created_at: '2026-08-27T08:00:00Z',
    updated_at: '2026-08-27T08:00:00Z',
    goods_subtotal: 1_000,
    expense_total: 0,
    separate_expense_total: 0,
    all_in_total: 1_000,
    paid: 0,
    payment_status: 'unpaid',
  };

  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
      route.fulfill({
        status,
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

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
          'ViewFinancials',
          'SettleOrder',
          'ManageSupplierCreditPurchases',
          'ManageStockAdjustments',
          'CreateInterAccountTransfer',
          'ReverseOrder',
          ...(overridePrices ? ['OverridePrice'] : []),
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
    if (path.endsWith('/rest/v1/companies')) {
      const company = {
        id: companyId,
        name: 'Purchasing shop',
        cashier_flow_enabled: false,
        cash_control_enabled: false,
        require_opening_count: false,
        batch_expiry_enabled: false,
        enable_printer: false,
        subscription_status: 'active',
        subscription_expires_at: '2099-12-31T23:59:59Z',
        subscription_grace_period_end: null,
        subscription_exempt_until: null,
      };
      return request.headers()['accept']?.includes('application/vnd.pgrst.object')
        ? json(company)
        : json([company]);
    }
    if (path.endsWith('/rest/v1/customers')) return json([supplier]);
    if (path.endsWith('/rest/v1/customer_account_balances')) return json([]);
    if (path.endsWith('/rest/v1/customer_credit_aging')) return json([]);
    if (path.endsWith('/rest/v1/supplier_ap_balances')) {
      return json([{ supplier_id: supplierId, balance: 1_000 }]);
    }
    if (path.endsWith('/rest/v1/supplier_ap_aging')) {
      return json([{ supplier_id: supplierId, days_outstanding: 12, bucket: '8-30' }]);
    }
    if (path.endsWith('/rest/v1/supplier_purchase_metrics')) {
      return json([
        {
          supplier_id: supplierId,
          purchase_count: 1,
          average_order: 1_000,
          open_purchase_count: 1,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/ledger_accounts')) {
      return json([
        {
          code: 'CASH_ON_HAND',
          name: 'Cash on hand',
          type: 'asset',
          allow_manual_posting: true,
          is_active: true,
          is_parent: false,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/purchase_drafts')) return json([]);
    if (path.endsWith('/rest/v1/purchase_history')) {
      return request.headers()['accept']?.includes('application/vnd.pgrst.object')
        ? json(purchase)
        : json([purchase], 200, { 'content-range': '0-0/1' });
    }
    if (path.endsWith('/rest/v1/purchase_lines')) {
      return json([
        {
          id: 'line-1',
          purchase_id: purchaseId,
          variant_id: variantId,
          quantity: 10,
          unit_cost: 100,
          line_total: 1_000,
          batch_number: null,
          expiry_date: null,
          created_at: '2026-08-27T08:00:00Z',
        },
      ]);
    }
    if (path.endsWith('/rest/v1/purchase_expenses')) return json([]);
    if (path.endsWith('/rest/v1/purchase_payments')) return json([]);
    if (path.endsWith('/rest/v1/supplier_payments')) return json([]);
    if (path.endsWith('/rest/v1/supplier_variant_performance')) return json([]);
    if (path.endsWith('/rest/v1/variant_catalog')) return json([variant]);
    if (path.endsWith('/rest/v1/products'))
      return json([{ id: productId, company_id: companyId, name: 'Breakfast tea', active: true }]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_entities')) return json([variant]);
    if (path.endsWith('/rest/v1/rpc/search_catalog_variants')) return json([variant]);
    if (path.endsWith('/rest/v1/rpc/sync_cache_stream')) {
      const { p_stream, p_after_sequence } = request.postDataJSON();
      const head = p_stream === 'catalog' ? catalogSequence : 0;
      return json({
        stream: p_stream,
        headSequence: head,
        prunedThroughSequence: 0,
        resetRequired: false,
        nextSequence: head,
        hasMore: false,
        changes:
          head > p_after_sequence
            ? [
                {
                  sequence: head,
                  entityType: 'variant',
                  entityId: variantId,
                  operation: 'upsert',
                  locationId: null,
                  userId: null,
                  changedAt: new Date().toISOString(),
                },
              ]
            : [],
      });
    }
    if (path.endsWith('/rest/v1/rpc/catalog_pack_definitions'))
      return json([
        { variant_id: variantId, stock_unit: variant.stock_unit, packs: variant.packs },
      ]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) return json([variant]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_families')) {
      return json([
        {
          id: productId,
          company_id: companyId,
          name: 'Breakfast tea',
          active: true,
          image_path: null,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/location_stock_for_variants')) {
      return json([{ variant_id: variantId, stock: sellable ? 72 : 12, stock_value: 1_200 }]);
    }
    if (path.endsWith('/rest/v1/rpc/purchase_tax_context')) {
      return json({
        status: 'context',
        tax_configured: false,
        vat_registered: false,
        tax_profile_id: null,
        tax_point_at: '2026-08-27T00:00:00+03:00',
        lines: [],
        supplier_expense: null,
      });
    }
    if (path.endsWith('/rest/v1/rpc/supplier_advance_available')) return json(0);
    if (path.endsWith('/rest/v1/rpc/supplier_advance_activity')) return json([]);
    if (path.endsWith('/rest/v1/rpc/supplier_stock_by_variant')) return json([]);
    if (path.endsWith('/rest/v1/rpc/supplier_account_status')) {
      return json([
        { ledger_balance: 1_000, document_balance: 1_000, difference: 0, is_consistent: true },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/save_purchase_workspace_draft')) {
      commandOrder.push('save');
      savedDraft = request.postDataJSON();
      return json(draftId);
    }
    if (path.endsWith('/rest/v1/rpc/finalize_purchase_draft')) {
      commandOrder.push('finalize');
      return json(purchaseId);
    }
    if (path.endsWith('/rest/v1/rpc/post_supplier_fifo_payment')) {
      supplierPayment = request.postDataJSON();
      return json('payment-id');
    }
    if (path.endsWith('/rest/v1/rpc/post_supplier_payment')) {
      purchasePayment = request.postDataJSON();
      return json('purchase-payment-id');
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });

  return {
    changePack: (price, active = true) => {
      variant.packs[0].sale_price = price;
      variant.packs[0].active = active;
      catalogSequence++;
    },
    commandOrder: () => commandOrder,
    savedDraft: () => savedDraft,
    purchasePayment: () => purchasePayment,
    supplierPayment: () => supplierPayment,
  };
}

test('purchase confirmation saves the canonical draft before finalization', async ({ page }) => {
  const capture = await mockPurchasing(page);
  await page.goto(`http://127.0.0.1:4203/purchases/new?supplier=${supplierId}`);
  await expect(page.getByRole('heading', { name: 'Record purchase' })).toBeVisible();

  await page.getByPlaceholder(/Scan barcode or search product/).fill('Breakfast');
  await page.getByRole('button', { name: /Breakfast tea/ }).click();
  await page.getByRole('button', { name: 'Review purchase' }).click();
  await page.getByRole('button', { name: /Pay later/ }).click();
  await page.getByRole('button', { name: 'Confirm purchase' }).click();

  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.getByText('Purchase recorded successfully')).toBeVisible();
  expect(capture.commandOrder()).toEqual(['save', 'finalize']);
  expect(capture.savedDraft()).toMatchObject({
    p_supplier_id: supplierId,
    p_lines: [expect.objectContaining({ variant_id: variantId, quantity: 1 })],
    p_payment_mode: 'later',
  });
});

test('supplier account payment posts a scoped idempotent command', async ({ page }) => {
  const capture = await mockPurchasing(page);
  await page.goto(`http://127.0.0.1:4203/suppliers?supplier=${supplierId}`);
  await expect(page.getByRole('heading', { name: 'Karibu Wholesalers' })).toBeVisible();

  const paymentSection = page.getByRole('heading', { name: 'Pay this supplier' }).locator('..');
  await paymentSection.getByLabel('Amount (KES)').fill('250');
  await paymentSection.getByRole('button', { name: 'Record supplier payment' }).click();

  await expect(page.getByText('Supplier account updated')).toBeVisible();
  expect(capture.supplierPayment()).toMatchObject({
    p_supplier_id: supplierId,
    p_amount: 250,
    p_account_code: 'CASH_ON_HAND',
    p_client_ref: expect.any(String),
  });
});

test('purchase deep link composes its scoped drawer and records payment', async ({ page }) => {
  const capture = await mockPurchasing(page);
  await page.goto(`http://127.0.0.1:4203/purchases?purchase=${purchaseId}`);

  const drawer = page.getByRole('dialog', { name: 'SUP-INV-20' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Breakfast tea')).toBeVisible();
  await drawer.getByRole('button', { name: 'Record payment' }).click();
  await drawer.getByLabel('Amount (KES)').fill('400');
  await drawer.getByRole('button', { name: 'Save payment' }).click();

  await expect(drawer.getByText('Purchase payment recorded')).toBeVisible();
  expect(capture.purchasePayment()).toMatchObject({
    p_supplier_id: supplierId,
    p_purchase_id: purchaseId,
    p_amount: 400,
    p_account_code: 'CASH_ON_HAND',
    p_client_ref: expect.any(String),
  });
});

test('pack purchase keeps quantity, cost, total and Remove aligned and computes both input modes', async ({
  page,
}) => {
  const capture = await mockPurchasing(page);
  await page.goto(`http://127.0.0.1:4203/purchases/new?supplier=${supplierId}`);
  await page.getByPlaceholder(/Scan barcode or search product/).fill('Breakfast');
  await page.getByRole('button', { name: /Breakfast tea/ }).click();
  const row = page.locator('app-purchase-line-row');
  await row.getByLabel('Buying unit').selectOption('97000000-0000-4000-8000-000000000009');
  const quantity = row.getByLabel('Quantity in Supplier crate');
  const cost = row.getByLabel('Cost per Supplier crate (KES)');
  const total = row.getByLabel('Line total (KES)');
  await quantity.fill('2');
  await cost.fill('1000.25');
  await expect(total).toHaveValue('2001');
  await quantity.fill('3');
  await expect(total).toHaveValue('3001');
  await expect(row.getByText('Adds 72 packet')).toBeVisible();
  await total.fill('1000');
  await expect(cost).toHaveValue('333.33');
  await quantity.fill('4');
  await expect(total).toHaveValue('1000');
  await expect(cost).toHaveValue('250');
  // Persist the rounded decimal rate without replacing the exact supplier total.
  await quantity.fill('3');
  await expect(total).toHaveValue('1000');
  await expect(cost).toHaveValue('333.33');
  await expect(row.getByRole('button', { name: 'Remove item' })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    const qtyBox = await quantity.boundingBox();
    const removeBox = await row.getByRole('button', { name: 'Remove item' }).boundingBox();
    expect(Math.abs((qtyBox?.y ?? 0) - (removeBox?.y ?? 0))).toBeLessThan(30);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Review purchase' }).click();
  await page.getByRole('button', { name: /Pay later/ }).click();
  await page.getByRole('button', { name: 'Confirm purchase' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  expect(capture.savedDraft()).toMatchObject({
    p_lines: [
      expect.objectContaining({
        quantity: 3,
        pack_id: '97000000-0000-4000-8000-000000000009',
        units_per_unit: 24,
        unit_cost: 333.33,
        line_total: 1000,
        value_source: 'total',
      }),
    ],
  });
});

async function cachedPack(
  page: Page
): Promise<{ sale_price: number | null; active: boolean } | null> {
  return page.evaluate(
    () =>
      new Promise(resolve => {
        const request = indexedDB.open('dukarun-pos-offline');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('catalogVariants')) {
            db.close();
            resolve(null);
            return;
          }
          const rows = db.transaction('catalogVariants').objectStore('catalogVariants').getAll();
          rows.onsuccess = () => {
            resolve(rows.result[0]?.variant.packs?.[0] ?? null);
            db.close();
          };
        };
      })
  );
}

test('pack definitions persist with catalogue rows, reconcile through the journal, and sell offline', async ({
  page,
}) => {
  const state = await mockPurchasing(page, true);
  await page.goto('http://127.0.0.1:4203/pos/sell');
  await expect.poll(() => cachedPack(page)).toMatchObject({ sale_price: 2400, active: true });
  state.changePack(2300);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => cachedPack(page)).toMatchObject({ sale_price: 2300 });
  // Reload without catalogue APIs; authentication/legal checks remain independently mocked.
  await page.route(
    /\/rest\/v1\/rpc\/(catalog_.*|search_catalog_variants|location_stock_for_variants)$/,
    route => route.abort('internetdisconnected')
  );
  await page.reload();
  const search = page.getByRole('searchbox', { name: 'Search products or scan barcode' });
  await expect(search).toBeVisible();
  await page.route('http://127.0.0.1:54321/**', route => route.abort('internetdisconnected'));
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await search.fill('Breakfast');
  await page
    .getByRole('button', { name: /Breakfast tea/ })
    .first()
    .click();
  const units = page.getByRole('dialog', { name: 'Sell as' });
  await expect(units).toBeVisible();
  await units.getByRole('button', { name: /Supplier crate/ }).click();
  await expect(units).not.toBeVisible();
  const line = page.locator('app-sell-cart-line');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('2,300');
  await search.fill('TEA-CRATE-24');
  await search.press('Enter');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('4,600');
  await expect(units).not.toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1);
});

// Restore a real persisted cart so layout checks cover packs, services and populated rows.
test('populated cart stays compact and keeps editing reachable in both themes', async ({
  page,
  isMobile,
}) => {
  await mockPurchasing(page, true, true);
  if (isMobile) await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('http://127.0.0.1:4203/pos/sell');
  await expect.poll(() => cachedPack(page)).not.toBeNull();
  await expect(page.locator('#current-sale')).toContainText('Cart is empty');
  await expect(page.locator('[data-learning-anchor="sell-checkout"]:visible')).toBeDisabled();
  const sampleLines = [
    {
      name: 'Sugar — 1kg Packed',
      sku: 'SUG1',
      unit: 'packet',
      price: 200,
      packSize: 1,
      kind: 'good',
      manufacturer: 'Mumias Sugar',
    },
    {
      name: 'Fresh eggs',
      sku: 'MM-EGG',
      unit: 'Tray',
      price: 480,
      packSize: 30,
      kind: 'good',
      manufacturer: null,
    },
    {
      name: 'Delivery',
      sku: 'DEL',
      unit: 'item',
      price: 50,
      packSize: 1,
      kind: 'service',
      manufacturer: null,
    },
  ].map((sample, index) => {
    const id = `97000000-0000-4000-8000-00000000002${index}`;
    const packId = sample.packSize > 1 ? `97000000-0000-4000-8000-00000000003${index}` : null;
    return {
      id: `${id}:${packId ?? 'base'}`,
      packId,
      unitName: sample.unit,
      stockUnit: sample.packSize > 1 ? 'egg' : sample.unit,
      unitsPerUnit: sample.packSize,
      priceSource: packId ? 'pack' : 'retail',
      quantity: 1,
      unitPrice: sample.price,
      customPrice: null,
      overrideReason: '',
      variant: {
        variant_id: id,
        product_id: id,
        product_name: sample.name,
        variant_name: 'Default',
        sku: sample.sku,
        kind: sample.kind,
        price: sample.price,
        wholesale_price: 100,
        active: true,
        product_active: true,
        variant_active: true,
        allow_fractional: false,
        stock: 120,
        track_inventory: sample.kind !== 'service',
        stock_unit: sample.unit,
        manufacturer_name: sample.manufacturer,
        packs: packId
          ? [
              {
                id: packId,
                name: sample.unit,
                units_per_pack: sample.packSize,
                sale_price: sample.price,
                active: true,
              },
            ]
          : [],
      },
    };
  });
  await page.evaluate(
    async ({ lines, companyId, userId, locationId }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('dukarun-pos-offline');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('cart', 'readwrite');
          transaction.objectStore('cart').put({
            key: `${companyId}:${userId}:${locationId}`,
            company_id: companyId,
            user_id: userId,
            location_id: locationId,
            lines,
            customerId: null,
            customerName: 'Walk-in',
            draftId: null,
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
        };
      });
    },
    { lines: sampleLines, companyId, userId, locationId }
  );
  await page.reload();
  const cart = page.locator('#current-sale');
  const rows = cart.locator('app-sell-cart-line');
  await expect(rows).toHaveCount(3);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    const payment = page.locator('[data-learning-anchor="sell-checkout"]:visible');
    const count = page.locator('app-sell-catalog-panel .badge').filter({ hasText: 'in cart' });
    await expect(payment).toBeEnabled();
    const paymentGeometry = await payment.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const label = range.getBoundingClientRect();
      const button = element.getBoundingClientRect();
      return {
        height: button.height,
        labelLeft: label.left - button.left,
        labelRight: button.right - label.right,
        overflow: element.scrollWidth - element.clientWidth,
      };
    });
    expect(paymentGeometry.height).toBeGreaterThanOrEqual(44);
    expect(paymentGeometry.height).toBeLessThanOrEqual(48);
    expect(paymentGeometry.labelLeft).toBeGreaterThanOrEqual(0);
    expect(paymentGeometry.labelRight).toBeGreaterThanOrEqual(0);
    expect(paymentGeometry.overflow).toBeLessThanOrEqual(1);
    const badge = await renderedTextContrast(count);
    expect(badge.ratio).toBeGreaterThanOrEqual(4.5);
    expect(badge.background).not.toEqual([232, 93, 47]);
    // Interaction states are covered by the shared style contract; verify this integration.
    const label = await renderedTextContrast(payment);
    expect(label.fontSize).toBe(14);
    expect(label.fontWeight).toBe(600);
    expect(label.foreground).toEqual([255, 255, 255]);
    expect(label.background).toEqual([232, 93, 47]);
    await cart.scrollIntoViewIfNeeded();
    const geometry = await rows.evaluateAll(elements =>
      elements.map(element => ({
        height: element.getBoundingClientRect().height,
        overflow: element.scrollWidth - element.clientWidth,
        targets: [...element.querySelectorAll('button, input')].map(control => ({
          width: control.getBoundingClientRect().width,
          height: control.getBoundingClientRect().height,
        })),
      }))
    );
    for (const row of geometry) {
      expect(row.height).toBeLessThanOrEqual(160);
      expect(row.overflow).toBeLessThanOrEqual(1);
      for (const control of row.targets) {
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.height).toBeGreaterThanOrEqual(44);
      }
    }
    if (process.env.DESIGN_REVIEW_DIR) {
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('body *')) {
          if (
            ['fixed', 'sticky'].includes(getComputedStyle(element).position) &&
            !element.contains(document.querySelector('#current-sale')) &&
            !element.closest('#current-sale')
          )
            element.dataset.cartPreviewOverlay = '';
        }
      });
      await cart.screenshot({
        path: `${process.env.DESIGN_REVIEW_DIR}/cart-${theme}-${isMobile ? 'phone' : 'desktop'}.png`,
        // Isolated cart preview; functional checks below retain the actual payment dock.
        style: '[data-cart-preview-overlay] { visibility: hidden !important; }',
      });
    }
  }
  const sugar = rows.nth(0);
  await expect(
    sugar.getByRole('button', { name: 'Details for Sugar — 1kg Packed', exact: true })
  ).toContainText('Mumias Sugar');
  await sugar
    .getByRole('button', { name: 'Increase quantity of Sugar — 1kg Packed', exact: true })
    .click();
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('400');
  await sugar.getByRole('spinbutton').fill('3');
  await sugar.getByRole('spinbutton').press('Tab');
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('600');
  await sugar
    .getByRole('button', { name: 'Increase price of Sugar — 1kg Packed', exact: true })
    .click();
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('618');
  await sugar
    .getByRole('button', { name: 'Reduce price of Sugar — 1kg Packed', exact: true })
    .click();
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('600');
  await sugar
    .getByRole('button', { name: 'Increase price of Sugar — 1kg Packed', exact: true })
    .click();
  await sugar.getByRole('button', { name: 'Reset price', exact: true }).click();
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('600');
  await sugar.getByRole('button', { name: 'Details for Sugar — 1kg Packed', exact: true }).click();
  await expect(sugar.locator('.sale-line-details')).toContainText('Mumias Sugar');
  await sugar.getByRole('button', { name: 'Details for Sugar — 1kg Packed', exact: true }).click();
  await sugar
    .getByRole('button', { name: 'Edit price for Sugar — 1kg Packed', exact: true })
    .click();
  await cart.getByLabel('Unit price (KES)').fill('210');
  await cart.getByRole('button', { name: 'Apply price', exact: true }).click();
  await expect(sugar.locator('.sale-line-total app-money')).toHaveText('630');
  await expect(sugar).toContainText('Price adjusted');
  if (process.env.DESIGN_REVIEW_DIR) {
    if (!isMobile) await page.setViewportSize({ width: 1920, height: 1000 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await cart.screenshot({
      path: `${process.env.DESIGN_REVIEW_DIR}/cart-adjusted-${isMobile ? 'phone' : 'wide-desktop'}.png`,
      style: '[data-cart-preview-overlay] { visibility: hidden !important; }',
    });
  }

  await rows
    .nth(1)
    .getByRole('button', { name: /Change selling unit/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Change selling unit' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Change selling unit' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await rows.nth(2).getByRole('button', { name: 'Remove Delivery', exact: true }).click();
  await expect(rows).toHaveCount(2);
});

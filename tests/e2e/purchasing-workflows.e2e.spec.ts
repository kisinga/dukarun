import { expect, test, type Page } from '@playwright/test';

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

async function mockPurchasing(page: Page): Promise<{
  commandOrder: () => string[];
  savedDraft: () => unknown;
  purchasePayment: () => unknown;
  supplierPayment: () => unknown;
}> {
  const session = authSession();
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
    wholesale_price: 100,
    allow_fractional: false,
    track_inventory: true,
    stock: 12,
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
          'ManageSupplierCreditPurchases',
          'ManageStockAdjustments',
          'CreateInterAccountTransfer',
          'ReverseOrder',
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
      return json([{ variant_id: variantId, stock: 12, stock_value: 1_200 }]);
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

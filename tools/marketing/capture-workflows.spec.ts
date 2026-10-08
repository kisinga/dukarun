import { expect, test } from '../../tests/fixtures/mocked-browser';
import { mockSellWorkspace, sellVariants } from '../../tests/fixtures/sell-workspace';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_BASKET, DEMO_PRODUCTS, DEMO_SHOP } from '../../packages/marketing-demo';

// Explicit capture utility; excluded from routine end-to-end test discovery.
test('capture fictional sale, customer credit and closing workflows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const { customer } = await mockSellWorkspace(page, { fulfillment: false, credit: true });
  const products = DEMO_PRODUCTS.map((product, i) => ({
    ...sellVariants[i],
    product_name: product.name,
    price: product.price,
    stock: product.stock,
    stock_unit: product.unit,
    allow_fractional: false,
    sku: `DEMO-${product.id.toUpperCase()}`,
  }));
  for (const rpc of ['catalog_cache_page', 'catalog_cache_entities']) {
    await page.route(`**/rest/v1/rpc/${rpc}`, route => route.fulfill({ json: products }));
  }
  await page.route('**/rest/v1/rpc/catalog_cache_families', route =>
    route.fulfill({
      json: products.map(product => ({
        id: product.product_id,
        name: product.product_name,
        active: true,
      })),
    })
  );
  await page.route('**/rest/v1/rpc/location_stock_for_variants', route =>
    route.fulfill({
      json: products.map(product => ({
        variant_id: product.variant_id,
        stock: product.stock,
        stock_value: 0,
      })),
    })
  );
  await page.route('**/rest/v1/variant_catalog*', route => route.fulfill({ json: products }));
  await page.route('**/rest/v1/categories*', route =>
    route.fulfill({
      json: [
        {
          id: '97000000-0000-4000-8000-000000000004',
          name: 'Electricals',
          active: true,
          position: 0,
        },
      ],
    })
  );
  await page.route('**/rest/v1/user_profiles*', route =>
    route.fulfill({
      json: { id: '97000000-0000-4000-8000-000000000002', display_name: DEMO_SHOP.cashier },
    })
  );
  await page.route('**/rest/v1/rpc/current_access_snapshot', route =>
    route.fulfill({
      json: {
        company_id: '97000000-0000-4000-8000-000000000001',
        user_id: '97000000-0000-4000-8000-000000000002',
        permissions: ['SettleOrder', 'OverridePrice', 'ManageCustomers', 'ViewFinancials'],
        workspaces: ['sell', 'customers', 'money'],
        actions: {},
      },
    })
  );
  await page.route('**/rest/v1/companies*', route =>
    route.fulfill({
      json: {
        id: '97000000-0000-4000-8000-000000000001',
        name: DEMO_SHOP.name,
        code: 'DEMO',
        cashier_flow_enabled: true,
        cash_control_enabled: true,
        require_opening_count: true,
        variance_notification_threshold: 100,
        subscription_status: 'active',
        subscription_expires_at: '2099-01-01T00:00:00Z',
        shop_setup: { deferred: true },
      },
    })
  );
  await page.route('**/rest/v1/customer_account_balances*', route =>
    route.fulfill({
      json: [
        {
          customer_id: customer.id,
          receivable_balance: 1500,
          downpayment_balance: 0,
          net_balance: 1500,
        },
      ],
    })
  );
  await page.route('**/rest/v1/customer_credit_aging*', route =>
    route.fulfill({ json: [{ customer_id: customer.id, days_outstanding: 10, bucket: 'current' }] })
  );
  await page.route('**/rest/v1/cashier_sessions*', route => {
    const session = {
      id: '97000000-0000-4000-8000-000000000060',
      status: 'open',
      opened_at: new Date().toISOString(),
      cashier_user_id: '97000000-0000-4000-8000-000000000002',
      location_id: '97000000-0000-4000-8000-000000000003',
    };
    return route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? session : [session],
    });
  });
  await page.route('**/rest/v1/rpc/cashier_count_accounts', route =>
    route.fulfill({
      json: [{ account_code: 'CASH_ON_HAND', account_name: 'Cash', method_code: 'cash' }],
    })
  );
  await page.route('**/rest/v1/rpc/cashier_expected_balances', route =>
    route.fulfill({ json: [{ account_code: 'CASH_ON_HAND', expected_balance: 6500 }] })
  );
  const capture = async (name: string) => {
    const destination = join(tmpdir(), 'dukarun-workflows');
    mkdirSync(destination, { recursive: true });
    await page.screenshot({
      path: join(destination, `${name}.png`),
      animations: 'disabled',
    });
  };
  await page.goto('http://127.0.0.1:4203/pos/sell');
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  for (const [id, quantity] of DEMO_BASKET) {
    const product = DEMO_PRODUCTS.find(product => product.id === id)!;
    const button = page
      .locator('app-sell-catalog-panel')
      .getByRole('button', { name: new RegExp(product.name) });
    for (let n = 0; n < quantity; n++) await button.click();
  }
  await expect(page.locator('app-sell-cart-line')).toHaveCount(2);
  await expect(
    page.locator('app-sell-cart-line').filter({ hasText: 'LED bulb 9 W' })
  ).toContainText('1,000');
  await expect(
    page.locator('app-sell-cart-line').filter({ hasText: '13 A double socket' })
  ).toContainText('900');
  await capture('record-sale');
  await page.goto('http://127.0.0.1:4203/customers');
  await expect(page.getByText(DEMO_SHOP.customer).first()).toBeVisible();
  await capture('customer-credit');
  await page.getByRole('button', { name: 'Open till closing dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Close cashier session' })).toBeVisible();
  await page.locator('app-cashier-session-modal input').first().fill('6400');
  await page
    .getByRole('button', { name: /Review/ })
    .last()
    .click();
  await expect(page.getByText('Review the count before confirming.')).toBeVisible();
  await page.getByRole('button', { name: 'Show expected amounts' }).click();
  await capture('check-closing');
});

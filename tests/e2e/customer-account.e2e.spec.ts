import { expect, test, type Page } from '@playwright/test';

const companyId = '93000000-0000-4000-8000-000000000001';
const userId = '93000000-0000-4000-8000-000000000002';
const locationId = '93000000-0000-4000-8000-000000000003';
const customerId = '93000000-0000-4000-8000-000000000004';
const orderId = '93000000-0000-4000-8000-000000000005';
const productId = '93000000-0000-4000-8000-000000000006';
const variantId = '93000000-0000-4000-8000-000000000007';
const deliveryFeeProductId = '93000000-0000-4000-8000-000000000008';
const deliveryFeeVariantId = '93000000-0000-4000-8000-000000000009';
const fulfillmentId = '93000000-0000-4000-8000-000000000010';

const customer = {
  id: customerId,
  company_id: companyId,
  first_name: 'Amina',
  last_name: 'Kamau',
  phone: '+254700000001',
  email: null,
  delivery_address: 'Kilimani, Nairobi',
  notes: null,
  is_supplier: false,
  is_credit_approved: true,
  credit_limit: 1_000,
  credit_terms_days: 30,
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
  product_name: 'Account item',
  product_active: true,
  variant_active: true,
  kind: 'service',
  sku: 'ACCOUNT-ITEM',
  barcode: null,
  price: 500,
  wholesale_price: 300,
  allow_fractional: false,
  track_inventory: false,
  stock: 999,
  image_path: null,
  manufacturer_id: null,
  manufacturer_name: null,
};

const deliveryFeeVariant = {
  ...variant,
  variant_id: deliveryFeeVariantId,
  product_id: deliveryFeeProductId,
  product_name: 'Delivery',
  sku: 'DELIVERY',
  price: 50,
};

async function authenticateAccountUser(page: Page): Promise<{
  creditRequest: () => unknown;
  directSaleRequest: () => unknown;
  fulfillmentCreditRequest: () => unknown;
  customerProfileRequest: () => unknown;
}> {
  const permissions = ['ViewFinancials', 'SettleOrder', 'ManageCustomers', 'OverridePrice'];
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
  const session = {
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
  let postedCreditRequest: unknown;
  let postedDirectSaleRequest: unknown;
  let postedFulfillmentCreditRequest: unknown;
  let postedCustomerProfileRequest: unknown;
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
        permissions,
        workspaces: ['dashboard', 'customers'],
        actions: {
          'sale.credit_over_limit': 'execute',
          'customer.credit.update': 'execute',
          'payment.reverse': 'execute',
        },
      });
    }
    if (path.endsWith('/rest/v1/rpc/current_entitlements')) {
      return json({
        companyId,
        status: 'active',
        tierCode: 'standard',
        tierName: 'Standard',
        features: {
          multipleLocations: false,
          staffPerformance: false,
          commissions: false,
          storefront: false,
          paymentReminders: false,
          fulfillment: true,
        },
        settings: {},
        limits: {},
        usage: {},
      });
    }
    if (path.endsWith('/rest/v1/rpc/accessible_business_locations')) {
      return json([{ id: locationId, code: 'MAIN', name: 'Main shop', is_default: true }]);
    }
    if (path.endsWith('/rest/v1/rpc/fulfillment_settings_at_location')) {
      return json({
        company_id: companyId,
        location_id: locationId,
        enabled: true,
        feature_available: true,
        pickup_enabled: true,
        delivery_enabled: true,
        cod_enabled: false,
        default_delivery_fee_variant_id: deliveryFeeVariantId,
        pickup_sla_minutes: 30,
        delivery_sla_minutes: 60,
        notification_channel: 'whatsapp',
        sms_fallback: true,
        notify_initial: true,
        notify_ready: true,
        notify_in_transit: true,
        notify_failed: true,
        notify_fulfilled: false,
        tracking_token_ttl_days: 14,
      });
    }
    if (path.endsWith('/rest/v1/rpc/available_payment_methods')) {
      return json([
        {
          code: 'cash',
          name: 'Cash',
          is_cashier_controlled: true,
          reconciliation_type: null,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) {
      const body = request.postDataJSON() as { p_after_variant_id?: string };
      return json(body.p_after_variant_id ? [] : [variant]);
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_families')) {
      const body = request.postDataJSON() as { p_after_product_id?: string };
      return json(
        body.p_after_product_id
          ? []
          : [
              {
                id: productId,
                company_id: companyId,
                name: 'Account item',
                active: true,
                image_path: null,
              },
            ]
      );
    }
    if (path.endsWith('/rest/v1/rpc/location_stock_for_variants')) {
      return json([
        { variant_id: variantId, stock: 999, stock_value: 0 },
        { variant_id: deliveryFeeVariantId, stock: 999, stock_value: 0 },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/customer_deposit_available')) return json(300);
    if (path.endsWith('/rest/v1/rpc/customer_account_status')) {
      return json([
        {
          ledger_balance: 300,
          document_balance: 300,
          difference: 0,
          is_consistent: true,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/rpc/customer_statement')) return json([]);
    if (path.endsWith('/rest/v1/rpc/post_credit_sale_at_location')) {
      postedCreditRequest = request.postDataJSON();
      return json({
        status: 'completed',
        order_id: orderId,
        subject_id: orderId,
        resource_id: orderId,
        downpayment_applied: 300,
        credit_amount: 200,
      });
    }
    if (path.endsWith('/rest/v1/rpc/post_sale_at_location')) {
      postedDirectSaleRequest = request.postDataJSON();
      return json({ status: 'completed', order_id: orderId });
    }
    if (path.endsWith('/rest/v1/rpc/post_fulfillment_credit_sale_at_location')) {
      postedFulfillmentCreditRequest = request.postDataJSON();
      return json({
        status: 'completed',
        order_id: orderId,
        subject_id: orderId,
        resource_id: orderId,
        fulfillment_id: fulfillmentId,
        pin: '123456',
        downpayment_applied: 300,
        credit_amount: 250,
      });
    }
    if (path.endsWith('/rest/v1/rpc/save_customer_profile')) {
      postedCustomerProfileRequest = request.postDataJSON();
      const body = postedCustomerProfileRequest as {
        p_profile?: { delivery_address?: string };
      };
      if (body.p_profile?.delivery_address !== undefined)
        customer.delivery_address = body.p_profile.delivery_address;
      return json(customerId);
    }
    if (path.endsWith('/rest/v1/companies')) {
      const select = url.searchParams.get('select') ?? '';
      if (select.includes('subscription_status')) {
        return json({
          subscription_status: 'active',
          subscription_expires_at: '2099-12-31T23:59:59Z',
          subscription_grace_period_end: null,
          subscription_exempt_until: null,
        });
      }
      return json(
        select.includes('cashier_flow_enabled')
          ? [
              {
                cashier_flow_enabled: false,
                cash_control_enabled: false,
                require_opening_count: false,
                batch_expiry_enabled: false,
              },
            ]
          : [{ id: companyId, name: 'Account Shop', code: 'ACCOUNT' }]
      );
    }
    if (path.endsWith('/rest/v1/customers')) return json([customer]);
    if (path.endsWith('/rest/v1/customer_account_balances')) {
      return json([
        {
          company_id: companyId,
          customer_id: customerId,
          receivable_balance: 300,
          downpayment_balance: 300,
          net_balance: 0,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/customer_credit_aging')) {
      return json([{ customer_id: customerId, days_outstanding: 10, bucket: 'current' }]);
    }
    if (path.endsWith('/rest/v1/orders')) {
      return json([
        {
          id: orderId,
          company_id: companyId,
          customer_id: customerId,
          location_id: locationId,
          code: 'INV-OLD',
          total: 300,
          is_credit_sale: true,
          status: 'completed',
          created_at: '2026-08-01T08:00:00Z',
          customers: { first_name: 'Amina', last_name: 'Kamau' },
        },
      ]);
    }
    if (path.endsWith('/rest/v1/payments')) return json([]);
    if (path.endsWith('/rest/v1/products')) {
      return json([{ id: productId, company_id: companyId, name: 'Account item', active: true }]);
    }
    if (path.endsWith('/rest/v1/variant_catalog')) {
      return json(
        (url.searchParams.get('variant_id') ?? '').includes(deliveryFeeVariantId)
          ? [deliveryFeeVariant]
          : [variant]
      );
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });
  return {
    creditRequest: () => postedCreditRequest,
    directSaleRequest: () => postedDirectSaleRequest,
    fulfillmentCreditRequest: () => postedFulfillmentCreditRequest,
    customerProfileRequest: () => postedCustomerProfileRequest,
  };
}

test('direct checkout posts the cart and clears it only after completion', async ({ page }) => {
  const capture = await authenticateAccountUser(page);
  await page.goto('http://127.0.0.1:4203/pos/sell');

  await page
    .getByRole('button', { name: /Account item/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Take payment' }).first().click();
  const checkout = page.getByRole('dialog', { name: 'Take payment' });
  await checkout.getByRole('button', { name: 'Exact' }).click();
  await checkout.getByRole('button', { name: 'Complete sale' }).click();

  await expect(page.getByText('Sale completed')).toBeVisible();
  await expect(page.locator('#current-sale app-sell-cart-line')).toHaveCount(0);
  expect(capture.directSaleRequest()).toMatchObject({
    p_customer_id: null,
    p_lines: [expect.objectContaining({ variant_id: variantId, quantity: 1 })],
    p_payments: [expect.objectContaining({ method: 'cash', amount: 500 })],
  });
});

test('overpayment preview explains FIFO allocations and the resulting downpayment', async ({
  page,
}) => {
  await authenticateAccountUser(page);
  await page.goto(`http://127.0.0.1:4203/customers?customer=${customerId}`);
  await expect(page.getByRole('heading', { name: 'Amina Kamau' })).toBeVisible();
  await page.getByLabel('Payment received (KES)').fill('350');

  await expect(page.getByText('How this payment will be applied')).toBeVisible();
  await expect(page.getByText('INV-OLD').first()).toBeVisible();
  const remainder = page.getByText('Available after receipt').locator('..');
  await expect(remainder).toContainText('50');
  await expect(remainder).toContainText('downpayment');
});

test('credit checkout shows the projected split and confirms the server-owned result', async ({
  page,
}) => {
  const capture = await authenticateAccountUser(page);
  await page.goto('http://127.0.0.1:4203/pos/sell');

  await page
    .getByRole('button', { name: /Account item/ })
    .first()
    .click();
  await page.getByLabel('Search customers').fill('Amina');
  await page.getByRole('button', { name: /Amina Kamau/ }).click();
  await page.getByRole('button', { name: 'Sell on credit' }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Confirm credit sale' });
  const downpayment = dialog.getByText('Downpayment applied').locator('..');
  const credit = dialog.getByText('Added to amount due').locator('..');
  await expect(downpayment).toContainText('300');
  await expect(credit).toContainText('200');
  await dialog.getByRole('button', { name: 'Confirm sale' }).click();

  await expect(page.getByText(/Sale completed · 300 downpayment applied/)).toBeVisible();
  const body = capture.creditRequest() as Record<string, unknown>;
  expect(body).not.toHaveProperty('p_deposit_amount');
  expect(body).not.toHaveProperty('p_credit_amount');
});

test('opening fulfillment details does not mutate the current sale card', async ({ page }) => {
  await authenticateAccountUser(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('http://127.0.0.1:4203/pos/sell');

  await page
    .getByRole('button', { name: /Account item/ })
    .first()
    .click();
  const cartLines = page.locator('#current-sale app-sell-cart-line');
  await expect(cartLines).toHaveCount(1);

  await page
    .locator('section[aria-labelledby="order-method-heading"]')
    .getByRole('button', { name: 'Delivery', exact: true })
    .click();

  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toBeVisible();
  await expect(cartLines).toHaveCount(1);

  const sawNakedBackdrop = page.evaluate(
    () =>
      new Promise<boolean>(resolve => {
        let found = false;
        let frames = 0;
        const check = () => {
          const dialog = document.querySelector<HTMLDialogElement>(
            'dialog[aria-label="Delivery details"]'
          );
          const panel = dialog?.querySelector<HTMLElement>('.task-dialog-panel') ?? null;
          const box = panel?.getBoundingClientRect();
          if (dialog?.open && (!box || box.width === 0 || box.height === 0)) found = true;
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['open'],
          childList: true,
          subtree: true,
        });
        const tick = () => {
          check();
          frames += 1;
          if (frames >= 8) {
            observer.disconnect();
            resolve(found);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
  await page
    .getByRole('dialog', { name: 'Delivery details' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(sawNakedBackdrop).resolves.toBe(false);
  await expect(page.getByRole('dialog', { name: 'Delivery details' })).toBeHidden();
  await expect(cartLines).toHaveCount(1);
});

test('delivery credit checkout keeps a one-off address and suppresses milestone updates', async ({
  page,
}) => {
  const capture = await authenticateAccountUser(page);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('http://127.0.0.1:4203/pos/sell');

  const paymentDock = page.getByTestId('sell-payment-dock');
  await expect(paymentDock).toBeVisible();
  const dockBox = await paymentDock.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.x).toBeGreaterThanOrEqual(255);
  expect(Math.round(dockBox!.y + dockBox!.height)).toBe(720);

  await page
    .getByRole('button', { name: /Account item/ })
    .first()
    .click();
  await page.getByLabel('Search customers').fill('Amina');
  await page.getByRole('button', { name: /Amina Kamau/ }).click();
  await page
    .locator('section[aria-labelledby="order-method-heading"]')
    .getByRole('button', { name: 'Delivery', exact: true })
    .click();

  const details = page.getByRole('dialog', { name: 'Delivery details' });
  await details.getByLabel('Delivery address').fill('Westlands, Nairobi');
  await details.getByRole('checkbox', { name: /Status updates/ }).uncheck();
  await details.getByRole('checkbox', { name: /Use this address next time/ }).uncheck();
  await details.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('button', { name: 'Sell on credit' }).first().click();
  await page
    .getByRole('dialog', { name: 'Confirm credit sale' })
    .getByRole('button', { name: 'Confirm sale' })
    .click();

  await expect(page.getByText(/Sale completed/)).toBeVisible();
  const body = capture.fulfillmentCreditRequest() as {
    p_customer: Record<string, unknown>;
    p_fulfillment: Record<string, unknown>;
  };
  expect(body.p_customer).toMatchObject({
    customer_id: customerId,
    delivery_address: 'Westlands, Nairobi',
    save_delivery_address: false,
  });
  expect(body.p_fulfillment).toMatchObject({
    address: 'Westlands, Nairobi',
    transactional_message_consent: false,
  });
});

test('customer address editing uses one task and returns to refreshed detail', async ({ page }) => {
  const capture = await authenticateAccountUser(page);
  await page.goto(`http://127.0.0.1:4203/customers?customer=${customerId}`);
  await expect(page.getByText('Kilimani, Nairobi')).toBeVisible();

  await page
    .getByRole('dialog', { name: 'Amina Kamau' })
    .getByRole('button', { name: 'Edit customer' })
    .click();
  const editor = page.getByRole('dialog', { name: 'Edit Amina Kamau' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('Delivery address').fill('Riverside Drive, Nairobi');
  await editor.getByRole('button', { name: 'Save changes' }).click();

  await expect(editor).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Amina Kamau' })).toBeVisible();
  await expect(page.getByText('Riverside Drive, Nairobi')).toBeVisible();
  expect(capture.customerProfileRequest()).toMatchObject({
    p_customer_id: customerId,
    p_profile: { delivery_address: 'Riverside Drive, Nairobi' },
  });
});

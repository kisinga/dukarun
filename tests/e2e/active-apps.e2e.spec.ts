import { expect, test } from '../fixtures/mocked-browser';

async function mockSupabase(page: import('@playwright/test').Page): Promise<void> {
  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname.endsWith('/auth/v1/user')) {
      await json({ id: '00000000-0000-4000-8000-000000000002', role: 'authenticated' });
      return;
    }
    await json([]);
  });
}

async function authenticateFinancialUser(
  page: import('@playwright/test').Page,
  permissions = ['ViewFinancials', 'CreateInterAccountTransfer']
): Promise<void> {
  const companyId = '00000000-0000-4000-8000-000000000001';
  const userId = '00000000-0000-4000-8000-000000000002';
  const locationId = '00000000-0000-4000-8000-000000000003';
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
      created_at: new Date().toISOString(),
    },
  };
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
    const url = new URL(route.request().url());
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
        workspaces: [
          'dashboard',
          ...(permissions.includes('SettleOrder') ? ['sell', 'sales'] : []),
          ...(permissions.some(permission =>
            ['ManageCatalog', 'ManageStockAdjustments'].includes(permission)
          )
            ? ['inventory']
            : []),
          ...(permissions.some(permission =>
            ['ManageSupplierCreditPurchases', 'ManageStockAdjustments', 'ViewFinancials'].includes(
              permission
            )
          )
            ? ['purchasing']
            : []),
          ...(permissions.some(permission =>
            [
              'ManageCustomers',
              'ApproveCustomerCredit',
              'ManageCustomerCreditLimit',
              'OverrideCustomerBalance',
              'ViewFinancials',
            ].includes(permission)
          )
            ? ['customers']
            : []),
        ],
        actions: {
          'sale.void': 'execute',
          'sale.refund': 'execute',
          'payment.reverse': 'execute',
          'sale.credit_over_limit': 'execute',
          'customer.credit.update': 'execute',
        },
      });
    }
    if (path.endsWith('/rest/v1/rpc/current_entitlements')) {
      return json({
        companyId,
        status: 'active',
        tierCode: 'pro',
        tierName: 'Pro',
        features: {
          multipleLocations: true,
          staffPerformance: true,
          commissions: true,
          storefront: true,
          paymentReminders: true,
        },
        settings: {
          commissionsEnabled: true,
          paymentRemindersEnabled: true,
          paymentReminderChannel: 'whatsapp',
          paymentReminderSmsFallback: true,
        },
        limits: {},
        usage: {
          stockLocations: 1,
          products: 0,
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
        {
          id: locationId,
          code: 'MAIN',
          name: 'Main shop',
          is_default: true,
          is_primary: true,
        },
      ]);
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
        default_delivery_fee_variant_id: '00000000-0000-4000-8000-000000000020',
        pickup_sla_minutes: 30,
        delivery_sla_minutes: 90,
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
    if (path.endsWith('/rest/v1/product_variants')) {
      return json([
        {
          id: '00000000-0000-4000-8000-000000000020',
          name: 'Default',
          price: 150,
          products: { name: 'Local delivery' },
        },
      ]);
    }
    if (path.endsWith('/rest/v1/ledger_accounts')) {
      return json([
        {
          id: '00000000-0000-4000-8000-000000000010',
          company_id: companyId,
          code: 'CASH_ON_HAND',
          name: 'Cash on hand',
          type: 'asset',
          is_active: true,
          is_system: true,
          allow_manual_posting: true,
        },
        {
          id: '00000000-0000-4000-8000-000000000011',
          company_id: companyId,
          code: 'MPESA_CONTROL',
          name: 'M-Pesa',
          type: 'asset',
          is_active: true,
          is_system: true,
          allow_manual_posting: true,
        },
      ]);
    }
    if (path.endsWith('/rest/v1/ledger_journal_entries')) {
      return json(
        {
          code: 'PGRST201',
          message: 'Could not embed because more than one relationship was found',
        },
        300
      );
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
      if (select.includes('public_storefront_enabled')) {
        return json({
          id: companyId,
          name: 'Test shop',
          address: 'Market Road',
          email: 'owner@example.test',
          logo_path: null,
          public_storefront_enabled: false,
          public_slug: null,
          public_whatsapp_number: null,
          notification_category_preferences: null,
          enable_printer: false,
          proforma_validity_days: 14,
          low_stock_threshold: 10,
          cashier_flow_enabled: false,
          batch_expiry_enabled: false,
          cash_control_enabled: false,
          require_opening_count: false,
          variance_notification_threshold: 100,
          commissions_enabled: true,
          payment_reminders_enabled: true,
          payment_reminder_channel: 'whatsapp',
          payment_reminder_sms_fallback: true,
          automated_customer_notifications_enabled: true,
          automated_customer_notifications_override: null,
          credit_opportunity_rate_bps: 1200,
          credit_score_notifications_enabled: true,
          default_reorder_lead_days: 7,
          default_reorder_safety_days: 3,
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
          : [{ id: companyId, name: 'Test shop', code: 'TEST' }]
      );
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });
}

const apps = [
  {
    name: 'marketing site',
    url: 'http://127.0.0.1:4202/',
    heading: /every shilling, accounted for/i,
  },
  {
    name: 'operations app',
    url: 'http://127.0.0.1:4203/login',
    heading: 'Dukarun',
  },
  {
    name: 'storefront',
    url: 'http://127.0.0.1:4204/',
    heading: 'Dukarun shops',
  },
  {
    name: 'super admin',
    url: 'http://127.0.0.1:4205/login',
    heading: 'Welcome back',
  },
];

test('dashboard keeps the phone summary focused and its detail reachable', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, [
    'ViewFinancials',
    'SettleOrder',
    'ManageCatalog',
    'ManageStockAdjustments',
  ]);
  if (!isMobile) await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://127.0.0.1:4203/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  const summary = page.locator('details').filter({ hasText: 'More summary' });

  if (isMobile) {
    await expect(page.locator('app-stat-card:visible')).toHaveCount(2);
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Sales volume', { exact: true })).toBeHidden();
    await summary.locator('summary').click();
    await expect(summary.getByText('Sales volume', { exact: true })).toBeVisible();
    await expect(summary.getByText('Margin', { exact: true })).toBeVisible();
    await expect(summary.getByText('Sales to sync', { exact: true })).toBeVisible();
  } else {
    await expect(page.locator('app-stat-card:visible')).toHaveCount(5);
    await expect(summary).toBeHidden();

    const canvas = page.locator('.dashboard-main > .page');
    const performance = page.locator('section[aria-label="Sales performance"]');
    const priorities = page.locator('section[aria-labelledby="attention-heading"] > div.grid');
    const geometry = await Promise.all([
      canvas.evaluate(element => element.getBoundingClientRect().width),
      performance
        .locator(':scope > article')
        .evaluateAll(cards => cards.map(card => card.getBoundingClientRect().width)),
      priorities.evaluate(grid => ({
        width: grid.getBoundingClientRect().width,
        cards: [...grid.children].map(card => card.getBoundingClientRect().width),
      })),
    ]);

    expect(geometry[0]).toBeGreaterThanOrEqual(1279);
    expect(geometry[0]).toBeLessThanOrEqual(1281);
    expect(geometry[1]).toHaveLength(2);
    expect(Math.abs(geometry[1][0] - geometry[1][1])).toBeLessThanOrEqual(1);
    expect(geometry[2].cards).toHaveLength(2);
    expect(Math.abs(geometry[2].cards[0] - geometry[2].cards[1])).toBeLessThanOrEqual(1);
    expect(geometry[2].width - geometry[2].cards[0] - geometry[2].cards[1]).toBeLessThanOrEqual(17);
  }

  if (process.env.DESIGN_REVIEW_DIR) {
    await page.screenshot({
      path: `${process.env.DESIGN_REVIEW_DIR}/dashboard-${isMobile ? 'phone' : 'desktop'}.png`,
      fullPage: true,
    });
  }
});

test('settings keeps compact navigation and groups fulfillment in one surface', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, [
    'ManageCompanySettings',
    'ManageCommunications',
    'ManageCatalog',
  ]);
  await page.goto('http://127.0.0.1:4203/settings?tab=fulfillment');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pickup & Delivery', exact: true })).toBeVisible();
  await expect(page.getByText('Location-specific settings', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Pickup and delivery location')).toHaveValue(
    '00000000-0000-4000-8000-000000000003'
  );

  const settingsSelect = page.getByRole('combobox', { name: 'Settings section' });
  const visibleSettingsNav = page.getByRole('tablist', { name: 'Settings sections' });
  if (isMobile) {
    await expect(settingsSelect).toBeVisible();
    await expect(settingsSelect).toHaveValue('fulfillment');
    await expect(visibleSettingsNav).toBeHidden();
  } else {
    await expect(settingsSelect).toBeHidden();
    await expect(visibleSettingsNav).toBeVisible();
    await expect(page.locator('main aside nav[aria-label="Settings sections"]')).toHaveCount(0);
    await expect(
      visibleSettingsNav.getByRole('tab', { name: 'Pickup & Delivery' })
    ).toHaveAttribute('aria-selected', 'true');
  }

  const pickup = page.locator('label').filter({ hasText: 'Collect from this location.' });
  await pickup.locator('input[type="checkbox"]').uncheck();
  await expect(page.getByLabel('Ready in')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

  await page.getByRole('heading', { name: 'Customer updates' }).scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);

  if (process.env.DESIGN_REVIEW_DIR) {
    await page.screenshot({
      path: `${process.env.DESIGN_REVIEW_DIR}/settings-fulfillment-${isMobile ? 'phone' : 'desktop'}.png`,
      fullPage: true,
    });
  }
});

test('mobile section navigation stays selected and contained across both Insights levels', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Exercises phone dropdowns and the desktop breakpoint in one journey.');
  await authenticateFinancialUser(page, ['ViewFinancials', 'ManageCatalog']);
  await page.route('**/rest/v1/rpc/current_business_date', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify('2026-09-27') })
  );
  await page.goto('http://127.0.0.1:4203/insights/inventory?view=performance');

  const sections = page.getByRole('combobox', { name: 'Insights section', exact: true });
  const views = page.getByRole('combobox', { name: 'Inventory analysis view', exact: true });
  await expect(sections).toHaveValue('/insights/inventory');
  await expect(views).toHaveValue('performance');

  for (const width of [320, 390, 767]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sections).toBeVisible();
    await expect(views).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Inventory analysis view' })).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
  }

  await views.selectOption('sources');
  await expect(page).toHaveURL(/view=sources/);
  await expect(views).toHaveValue('sources');
  await page.reload();
  await expect(sections).toHaveValue('/insights/inventory');
  await expect(views).toHaveValue('sources');

  await sections.selectOption('/insights/sales');
  await expect(page.getByRole('heading', { name: 'Sales insights', exact: true })).toBeVisible();
  await expect(sections).toHaveValue('/insights/sales');
  await page.goBack();
  await expect(sections).toHaveValue('/insights/inventory');
  await expect(views).toHaveValue('sources');

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sections).toBeHidden();
  await expect(views).toBeHidden();
  await expect(
    page.getByRole('tab', { name: 'Supplier performance', exact: true })
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Stock priorities', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(views).toHaveValue('priorities');
});

for (const app of apps) {
  test(`${app.name} renders its primary route`, async ({ page }) => {
    await mockSupabase(page);
    await page.goto(app.url);
    await expect(page.getByRole('heading', { name: app.heading }).first()).toBeVisible();
  });
}

test('financial forms keep account choices when history fails', async ({ page }) => {
  await authenticateFinancialUser(page);
  await page.goto('http://127.0.0.1:4203/money/expenses');
  await expect(page.getByRole('heading', { name: 'Expenses', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Record expense' }).click();
  const expenseAccount = page.locator('#expense-form select').first();
  await expect(expenseAccount.locator('option')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Post expense' })).toBeVisible();
  await expect(page.getByText(/more than one relationship was found/)).toBeVisible();

  await page.goto('http://127.0.0.1:4203/money/transfers');
  await expect(page.getByRole('heading', { name: 'Transfers', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'New transfer' }).click();
  const transferAccounts = page.locator('#transfer-form select');
  await expect(transferAccounts).toHaveCount(2);
  await expect(transferAccounts.nth(0).locator('option')).toHaveCount(2);
  await expect(transferAccounts.nth(1).locator('option')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Post transfer' })).toBeVisible();
});

test('credit profile explains score weights and guardrails', async ({ page }) => {
  await authenticateFinancialUser(page, ['ViewFinancials']);
  await page.route('http://127.0.0.1:54321/rest/v1/rpc/party_credit_profile', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        party_id: 'supplier-1',
        side: 'supplier',
        party_name: 'Green Hills Cable Company',
        score: 6.9,
        band: 'watch',
        confidence: 'provisional',
        balance: 109081,
        credit_limit: 200000,
        available_credit: 90919,
        utilization: 0.545405,
        overdue_amount: 18488,
        oldest_due_on: '2026-09-15',
        oldest_overdue_days: 11,
        settled_documents: 0,
        history_days: 200,
        punctuality: 1,
        recommendation_code: 'pause_increases_target_down_10',
        reason_codes: ['overdue_8_30'],
        opportunity_cost: 0,
        refreshed_at: '2026-09-26T18:44:16Z',
        documents: [],
        events: [],
      }),
    })
  );

  await page.goto('http://127.0.0.1:4203/insights/credit/supplier/supplier-1');
  await expect(
    page.getByRole('heading', { name: 'Green Hills Cable Company', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'How the score works' }).click();

  const dialog = page.getByRole('dialog', { name: 'How the score works' });
  const panel = dialog.locator('.task-dialog-panel');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('img', {
      name: /Payment timeliness 45 percent, overdue exposure 30 percent/i,
    })
  ).toBeVisible();
  await expect(dialog.getByText('This profile: KES 18,488 of KES 109,081 overdue')).toBeVisible();
  await expect(dialog.getByText('Applies now')).toBeVisible();
  await expect(dialog.getByText(/Corrective adjustments can change exposure/)).toBeVisible();

  const [viewport, box] = await Promise.all([page.viewportSize(), panel.boundingBox()]);
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  if (viewport && box) {
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1);
});

test('operations navigation consolidates workspaces and preserves progressive disclosure', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, [
    'ManageStockAdjustments',
    'ManageTeam',
    'ViewStaffPerformance',
    'ManageCommissions',
    'ManageCommunications',
    'ViewAuditTrail',
  ]);
  await page.goto('http://127.0.0.1:4203/inventory/products');
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Transfers', exact: true })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Transfers', exact: true })).toHaveCount(0);

  const sidebar = page.locator('aside');
  if (isMobile) await page.getByLabel('Open menu').click();
  const inventoryLink = sidebar.getByRole('link', { name: 'Inventory', exact: true });
  await expect(inventoryLink).toBeVisible();
  await expect(inventoryLink).toHaveClass(/nav-item-active/);
  await expect(sidebar.getByRole('link', { name: 'Activity', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Team', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Products', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Audit trail', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Communications', exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole('link', { name: 'Staff Performance', exact: true })).toHaveCount(
    0
  );
  await expect(sidebar.getByRole('link', { name: 'Commissions', exact: true })).toHaveCount(0);

  await sidebar.getByRole('link', { name: 'Activity', exact: true }).click();
  await expect(page).toHaveURL(/\/activity\/messages$/);
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  if (isMobile) {
    const activitySection = page.getByRole('combobox', { name: 'Activity view' });
    await expect(activitySection).toBeVisible();
    await activitySection.selectOption('/activity/audit');
  } else {
    await page.getByRole('tab', { name: 'Audit trail', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/activity\/audit$/);
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();

  await page.goto('http://127.0.0.1:4203/communications?customer=customer-1');
  await expect(page).toHaveURL(/\/activity\/messages\?customer=customer-1$/);
  await page.goto('http://127.0.0.1:4203/stock-adjustments?variant=variant-1');
  await expect(page).toHaveURL(/\/inventory\/adjustments\?variant=variant-1$/);
  await page.goto('http://127.0.0.1:4203/team?tab=roles');
  await expect(page).toHaveURL(/\/team\/roles$/);
});

test('@critical local Supabase serves real financial form options', async ({ page, request }) => {
  const health = await request.get('http://127.0.0.1:54321/auth/v1/health');
  expect(health.ok()).toBe(true);

  await page.goto('http://127.0.0.1:4203/login');
  await page.getByRole('textbox', { name: 'Phone number' }).fill('0700 000 001');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByPlaceholder('123456').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });

  await page.goto('http://127.0.0.1:4203/money/expenses');
  await page.getByRole('button', { name: 'Record expense' }).click();
  await expect(page.locator('#expense-form select option')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Post expense' })).toBeVisible();

  await page.goto('http://127.0.0.1:4203/money/transfers');
  await page.getByRole('button', { name: 'New transfer' }).click();
  await expect(page.locator('#transfer-form select').first().locator('option')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Post transfer' })).toBeVisible();
});

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

for (const financials of [true, false]) {
  test(`dashboard leaders surface relevant measures and preserve evidence (${financials ? 'financial' : 'operational'})`, async ({
    page,
  }) => {
    await authenticateFinancialUser(page, [
      'ManageCatalog',
      'ManageStockAdjustments',
      ...(financials ? ['ViewFinancials'] : []),
    ]);
    const identities = [
      'Tea · Small pack',
      'Fresh eggs',
      'Dishwashing liquid',
      'Drinking chocolate',
    ].map((name, index) => ({
      variant_id: `98000000-0000-4000-8000-00000000000${index}`,
      product_id: `98000000-0000-4000-8000-00000000001${index}`,
      product_name: name,
      variant_name: index === 0 ? 'Small pack' : 'Default',
      manufacturer_name: 'Highland Foods',
      manufacturer_id: '98000000-0000-4000-8000-000000000099',
      kind: 'good',
      stock_unit: 'pack',
      sku: `LEADER-${index}`,
      stock: 4,
      price: 100,
      track_inventory: true,
      packs: [],
      catalogue_version: {
        product: '2026-09-29T00:00:00Z',
        variant: '2026-09-29T00:00:00Z',
        pack: null,
      },
      product_active: true,
      variant_active: true,
    }));
    const rows = identities.map((item, index) => ({
      variant_id: item.variant_id,
      location_name: 'Main shop',
      current_quantity: index === 1 ? 52 : 24,
      robust_quantity: 18,
      previous_robust_quantity: 9,
      revenue: 5000,
      margin: 2124,
      order_count: 16,
      active_days: 4,
      trend_score: 2,
      confidence: index === 1 ? 'low' : 'medium',
      outlier_detected: index === 0,
      outlier_share: 0.1,
      stock: index === 1 ? 0 : 8,
      planning_daily_demand: 2,
      days_of_cover: index === 1 ? 0 : 4,
    }));
    await page.route('**/rest/v1/rpc/catalog_cache_page', r => r.fulfill({ json: identities }));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    await page.route('**/rest/v1/rpc/dashboard_location_snapshot', r =>
      r.fulfill({
        json: {
          summary: [{ day: today, revenue: 5000, margin: 2124, orders: 16, quantity: 24 }],
          topVariants: [],
          productSignals: { restockRisks: [], fastVariants: [] },
          locations: [],
          productPerformance: {
            windowDays: 7,
            generatedAt: new Date().toISOString(),
            financialsIncluded: true,
            leaders: {
              trending: [rows[0]],
              volume: [rows[1]],
              margin: [rows[2]],
              consistent: [rows[3]],
            },
          },
        },
      })
    );
    await page.goto('http://127.0.0.1:4203/dashboard');
    const section = page.locator('section[aria-label="Sales performance"]');
    const trending = section.locator('article[aria-label="Trending now"]');
    await expect(
      trending.getByRole('link', { name: 'Tea · Small pack', exact: true })
    ).toBeVisible();
    await expect(trending).toContainText('Highland Foods');
    await expect(trending).toContainText('+100.0%');
    await expect(trending).toContainText(/medium confidence/i);
    await expect(trending).toContainText('Unusual spike adjusted');
    const volume = section.locator('article[aria-label="Volume leader"]');
    await expect(volume).toContainText('52 units sold');
    await expect(volume.getByText('Out of stock', { exact: true })).toBeVisible();
    await expect(section.locator('article[aria-label="Consistent seller"]')).toContainText(
      '4 selling days'
    );
    await expect(section.locator('article[aria-label="Margin leader"]')).toHaveCount(
      financials ? 1 : 0
    );
    await expect(section.getByRole('heading', { name: 'Sales trend', exact: true })).toHaveCount(
      financials ? 1 : 0
    );
    await expect(trending.getByText(/on hand ·/)).toBeVisible();
    const confidence = trending.getByLabel('Explain Medium demand confidence');
    await confidence.focus();
    await page.keyboard.press('Enter');
    await expect(
      trending.getByText(
        'Medium confidence: useful evidence with limited history or an adjusted spike.',
        { exact: true }
      )
    ).toBeVisible();
    await page.keyboard.press('Enter');
    const disclosure = trending.locator('summary').filter({ hasText: 'Evidence & stock' });
    await disclosure.focus();
    await page.keyboard.press('Enter');
    for (const label of [
      'Units sold',
      'Adjusted units',
      'Previous adjusted',
      'Orders / selling days',
      'On hand',
      'Planning cover',
    ]) {
      await expect(trending.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(trending.getByText('Margin', { exact: true })).toHaveCount(financials ? 1 : 0);
    await expect(trending.getByText('Net sales', { exact: true })).toHaveCount(financials ? 1 : 0);
    await page.keyboard.press('Enter');
    await expect(trending.getByText('On hand', { exact: true })).toBeHidden();
    const href = await trending.getByRole('link').getAttribute('href');
    expect(new URL(href!, 'http://127.0.0.1:4203').searchParams.get('period')).toBe('7');
    expect(new URL(href!, 'http://127.0.0.1:4203').searchParams.get('returnTo')).toBe('/dashboard');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await expect(trending.getByText('Highland Foods', { exact: true })).toBeVisible();
    }
  });
}

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
  if (isMobile)
    await page
      .getByRole('combobox', { name: 'Activity section', exact: true })
      .selectOption('/activity/audit');
  else
    await page
      .getByRole('navigation', { name: 'Activity sections' })
      .getByRole('link', { name: 'Audit trail', exact: true })
      .click();
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

const operationalListRoutes = [
  '/inventory/products',
  '/inventory/adjustments',
  '/inventory/transfers',
  '/sales',
  '/pos/proformas',
  '/purchases',
  '/customers',
  '/suppliers',
  '/pos/cashier',
  '/money/ledger',
  '/money/expenses',
  '/money/transfers',
  '/money/cashier',
  '/money/reconcile',
  '/money/periods',
  '/team/members',
  '/team/roles',
  '/team/performance',
  '/team/commissions',
  '/approvals',
  '/activity/messages',
  '/activity/audit',
  '/insights/credit',
  '/insights/inventory',
  '/insights/sales',
  '/fulfillment',
];
test('staff performance preserves useful measures on mobile and in review', async ({ page }) => {
  await authenticateFinancialUser(page, ['ViewFinancials', 'ViewStaffPerformance']);
  const staff = {
    staff_user_id: '00000000-0000-4000-8000-000000000002',
    display_name: 'Amina Wanjiku',
    role_name: 'Cashier',
    authorization_status: 'approved',
    transactions: 4,
    quantity: 12,
    gross_sales: 250,
    refunds: 30,
    voided_sales: 20,
    net_sales: 200,
    collected: 160,
    margin: 60,
    average_sale: 50,
    held_count: 2,
    held_value: 90,
  };
  await page.route('**/rest/v1/rpc/staff_sales_performance', route =>
    route.fulfill({ json: [staff] })
  );
  await page.route('**/rest/v1/rpc/staff_sales_daily', route => route.fulfill({ json: [] }));
  await page.goto('http://127.0.0.1:4203/team/performance?from=2026-09-01&to=2026-09-27');
  const record = page.locator('[data-list-record]:visible').first();
  await expect(record).toContainText('2 held');
  await expect(record.getByText('Refunds / voids:', { exact: false }).first()).toBeVisible();
  await expect(record).toContainText('unpaid');
  await expect(record).toContainText('160');
  await expect(record).toContainText('60');
  await record.getByText('Amina Wanjiku', { exact: true }).click();
  const review = page.getByRole('dialog');
  for (const label of [
    'Gross sales',
    'Margin',
    'Refunds / voids',
    'Average sale',
    'Quantity',
    'Held sales',
  ]) {
    await expect(review.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(review.getByText('Daily movement', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  staff.held_count = 0;
  staff.margin = -60;
  await page.reload();
  await expect(record).toContainText('0 held');
  await expect(record).toContainText('90');
  await expect(record.getByText('Refunds / voids:', { exact: false }).first()).toBeVisible();
  await expect(record.locator('.text-error').filter({ hasText: '60' })).toBeVisible();
  await page.getByRole('searchbox').fill('No matching staff name');
  await expect(page.getByText('No matching staff', { exact: true })).toBeVisible();
});

test('commission plans show state separately from actions and retain records on failure', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, ['ViewFinancials', 'ManageCommissions']);
  let fail = false;
  const plans = [true, false].map((active, index) => ({
    id: `00000000-0000-4000-8000-00000000001${index}`,
    name: active ? 'Standard commission' : 'Legacy commission',
    rate_bps: 200,
    effective_from: '2026-09-01',
    effective_to: null,
    active,
  }));
  await page.route('**/rest/v1/commission_plans?*', route =>
    fail
      ? route.fulfill({ status: 500, json: { message: 'Plans unavailable' } })
      : route.fulfill({ json: plans })
  );
  await page.goto('http://127.0.0.1:4203/team/commissions');
  const records = page.locator('[data-list-record]:visible');
  await expect(records).toHaveCount(2);
  await expect(records.first().getByText('Active', { exact: true })).toBeVisible();
  await expect(records.last().getByText('Inactive', { exact: true })).toBeVisible();
  if (!isMobile) {
    await page.setViewportSize({ width: 1024, height: 720 });
    const viewport = page.locator('.data-table-viewport');
    await expect(viewport.getByRole('columnheader', { name: 'State', exact: true })).toHaveCount(1);
    await expect(viewport.getByRole('columnheader', { name: 'Actions', exact: true })).toHaveCount(
      1
    );
    expect(await viewport.evaluate(e => e.scrollWidth - e.clientWidth)).toBe(0);
  }
  fail = true;
  await page.getByRole('button', { name: 'Refresh commissions', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(records).toHaveCount(2);
  await expect(page.getByText('No commission plans', { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(records).toHaveCount(2);
});

const listPermissions = [
  'ManageApprovals',
  'ManageStockAdjustments',
  'ManageCustomers',
  'ManageCatalog',
  'ManageCommunications',
  'ManageCompanySettings',
  'SettleOrder',
  'ManageSupplierCreditPurchases',
  'ViewFinancials',
  'ManageReconciliation',
  'CloseAccountingPeriod',
  'CreateInterAccountTransfer',
  'ManageTeam',
  'ViewAuditTrail',
  'ViewStaffPerformance',
  'ManageCommissions',
  'ProcessFulfillments',
  'CompleteFulfillments',
  'ManageFulfillments',
];
for (const path of operationalListRoutes) {
  test(`operational collection ${path} keeps document scrolling and reachable controls`, async ({
    page,
  }) => {
    await authenticateFinancialUser(page, listPermissions);
    await page.route('**/rest/v1/rpc/current_access_snapshot', route =>
      route.fulfill({
        json: {
          company_id: '00000000-0000-4000-8000-000000000001',
          user_id: '00000000-0000-4000-8000-000000000002',
          permissions: listPermissions,
          workspaces: [
            'dashboard',
            'sell',
            'sales',
            'inventory',
            'customers',
            'purchasing',
            'fulfillment',
          ],
          actions: {},
        },
      })
    );
    await page.route('**/rest/v1/rpc/current_entitlements', route =>
      route.fulfill({
        json: {
          companyId: '00000000-0000-4000-8000-000000000001',
          status: 'active',
          tierCode: 'pro',
          tierName: 'Pro',
          features: {
            staffPerformance: true,
            commissions: true,
            fulfillment: true,
            multipleLocations: true,
          },
          settings: { commissionsEnabled: true },
          limits: {},
          usage: {
            stockLocations: 1,
            products: 0,
            ordersThisMonth: 0,
            teamMembers: 1,
            sms: {},
            whatsapp: {},
          },
        },
      })
    );
    await page.route('**/rest/v1/rpc/current_business_date', route =>
      route.fulfill({ json: '2026-09-27' })
    );
    // Route smoke checks use an empty history; the financial-form test covers load failure.
    // WebKit cannot fulfill the helper's intentional PostgREST 300 response.
    await page.route('**/rest/v1/ledger_journal_entries?*', route =>
      route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } })
    );
    await page.route('**/rest/v1/rpc/accessible_business_locations', route =>
      route.fulfill({
        json: [
          {
            id: '00000000-0000-4000-8000-000000000003',
            code: 'MAIN',
            name: 'Main shop',
            is_default: true,
            is_primary: true,
          },
          {
            id: '00000000-0000-4000-8000-000000000004',
            code: 'SECOND',
            name: 'Second shop',
            is_default: false,
            is_primary: false,
          },
        ],
      })
    );
    await page.goto('http://127.0.0.1:4203' + path);
    await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/') + '(\\?|$)'));
    const surface = page.locator('main.list-scroll-page');
    await expect(surface).toBeVisible();
    await expect(surface.locator('h1').first()).toBeVisible();
    expect(await surface.evaluate(element => getComputedStyle(element).overflowY)).toBe('visible');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    ).toBeLessThanOrEqual(1);
    if (['/sales', '/purchases', '/activity/messages'].includes(path)) {
      const originalViewport = page.viewportSize()!;
      const toolbar = surface.locator('app-list-search-bar');
      for (const [width, textScale] of [
        [1600, 1],
        [1024, 1],
        [390, 1],
        [320, 1],
        [1280, 2],
      ]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(scale => {
          document.documentElement.style.fontSize = `${scale * 100}%`;
        }, textScale);
        await expect(async () => {
          const geometry = await toolbar.evaluate(element => {
            const controls = Array.from(
              element.querySelectorAll<HTMLElement>(
                ':is(.list-toolbar-scope, .list-quick-filters) :is(.input, .select, .counter-btn, .btn)'
              )
            ).filter(control => control.getClientRects().length);
            const fields = controls.filter(control => control.matches('input, select'));
            const search = element.querySelector('input[type="search"]')!.getBoundingClientRect();
            const summary = element.querySelector('.list-toolbar-summary')!.getBoundingClientRect();
            const sort = element.querySelector('.list-toolbar-sort')!.getBoundingClientRect();
            return {
              heights: controls.map(control => control.getBoundingClientRect().height),
              labelGaps: fields.map(control => {
                const label = control.closest('label')?.querySelector('.form-field-label');
                return label
                  ? control.getBoundingClientRect().top - label.getBoundingClientRect().bottom
                  : -1;
              }),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              overflowingElements: Array.from(document.querySelectorAll<HTMLElement>('*'))
                .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
                .slice(0, 12)
                .map(el => ({
                  tag: el.tagName,
                  classes: el.className,
                  width: el.getBoundingClientRect().width,
                })),
              searchBottom: search.bottom,
              scopeTop: element.querySelector('.list-toolbar-context')!.getBoundingClientRect().top,
              searchWidth: search.width,
              headerCenters: [search, summary, sort].map(box => box.y + box.height / 2),
              summaryBetweenControls: summary.left >= search.right && summary.right <= sort.left,
              toolbarHeight: element.getBoundingClientRect().height,
            };
          });
          expect(geometry.heights.length).toBeGreaterThanOrEqual(5);
          expect(Math.min(...geometry.heights)).toBeGreaterThanOrEqual(
            (width >= 1024 ? 36 : 44) * textScale - 1
          );
          expect(Math.max(...geometry.heights) - Math.min(...geometry.heights)).toBeLessThanOrEqual(
            1
          );
          expect(geometry.labelGaps.length).toBeGreaterThanOrEqual(3);
          for (const gap of geometry.labelGaps) expect(gap).toBeCloseTo(6 * textScale, 0);
          expect(
            geometry.overflow,
            `${path}, ${width}px, text scale ${textScale}: ${JSON.stringify(geometry)}`
          ).toBeLessThanOrEqual(1);
          expect(geometry.searchBottom).toBeLessThanOrEqual(geometry.scopeTop + 1);
          if (width === 1600 && textScale === 1) {
            expect(geometry.searchWidth).toBeLessThanOrEqual(320);
            expect(geometry.summaryBetweenControls).toBe(true);
            expect(
              Math.max(...geometry.headerCenters) - Math.min(...geometry.headerCenters)
            ).toBeLessThanOrEqual(1);
            expect(geometry.toolbarHeight).toBeLessThanOrEqual(170);
          }
        }).toPass({ timeout: 5000 });
        await expect(toolbar.locator('.stat-bar-item:visible')).toHaveCount(4);
        if (path === '/sales') await expect(toolbar.locator('app-searchable-filter')).toBeVisible();
      }
      await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
      await page.setViewportSize(originalViewport);
    }
    const search = surface.locator('app-list-search-bar').getByRole('searchbox');
    if (await search.count()) {
      await search.first().fill('unmatched record');
      await expect.poll(() => new URL(page.url()).search).toMatch(/(?:search|q)=unmatched/);
    }
    const filters = surface.getByRole('button', { name: 'Filter list', exact: true });
    if (await filters.count()) {
      await filters.first().click();
      await expect(filters.first()).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(filters.first()).toHaveAttribute('aria-expanded', 'false');
    }
  });
}

test('history date modes preserve applied scope while filters clear independently', async ({
  page,
}) => {
  await authenticateFinancialUser(page);
  const calls: URL[] = [];
  await page.route('**/rest/v1/ledger_journal_entries?*', route => {
    calls.push(new URL(route.request().url()));
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } });
  });
  await page.goto('http://127.0.0.1:4203/money/ledger?from=2026-09-01&search=rent&source=Expense');
  const control = page.locator('app-history-date-range');
  await expect(control.getByRole('combobox', { name: 'Date mode' })).toHaveValue('since');
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Filter list', exact: true })).toContainText('1');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).not.toHaveURL(/source=/);
  await expect(page).toHaveURL(/from=2026-09-01/);
  await expect(page.getByRole('searchbox')).toHaveValue('rent');
  await control.getByRole('combobox').selectOption('until');
  await expect(control.getByRole('status')).toContainText('Showing the last applied dates');
  await expect(page).toHaveURL(/from=2026-09-01/);
  await control.getByLabel('Until', { exact: true }).fill('2026-09-20');
  await control.getByLabel('Until', { exact: true }).dispatchEvent('change');
  await expect(page).toHaveURL(/to=2026-09-20/);
  await expect(page).not.toHaveURL(/from=/);
  await control.getByRole('combobox').selectOption('between');
  await control.getByLabel('From', { exact: true }).fill('2026-10-01');
  await control.getByLabel('From', { exact: true }).dispatchEvent('change');
  await expect(control.getByRole('status')).toContainText('on or before');
  await expect(page).not.toHaveURL(/from=/);
  await control.getByLabel('From', { exact: true }).fill('2020-01-01');
  await control.getByLabel('From', { exact: true }).dispatchEvent('change');
  await expect(page).toHaveURL(/from=2020-01-01/);
  await expect.poll(() => calls.at(-1)?.searchParams.getAll('posted_at').length).toBe(2);
  await control.getByRole('button', { name: 'Reset dates' }).click();
  await expect(page).not.toHaveURL(/from=|to=/);
  await expect(page.getByRole('searchbox')).toHaveValue('rent');
});

test('purchase and proforma histories restore one-ended date links', async ({ page }) => {
  await authenticateFinancialUser(page, [
    'ViewFinancials',
    'SettleOrder',
    'ManageSupplierCreditPurchases',
  ]);
  for (const route of [
    '/pos/proformas?from=2026-09-01',
    '/purchases?to=2026-09-20&q=tea&payment=unpaid',
  ]) {
    await page.goto('http://127.0.0.1:4203' + route);
    const control = page.locator('app-history-date-range');
    await expect(control.getByRole('combobox')).toHaveValue(
      route.includes('from=') ? 'since' : 'until'
    );
    if (route.includes('/purchases')) {
      await expect(page.getByRole('combobox', { name: 'Payment', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await expect(page).toHaveURL(/to=2026-09-20/);
      await expect(page).not.toHaveURL(/from=|payment=/);
      await expect(page.getByRole('searchbox')).toHaveValue('tea');
    }
  }
});

test('expense rows keep account context visible without empty disclosure space', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page);
  const entries = ['Electricity tokens', 'Packaging supplies'].map((memo, index) => ({
    id: `expense-${index}`,
    entry_date: '2026-09-27',
    posted_at: '2026-09-27T10:00:00Z',
    memo,
    source_type: 'Expense',
    ledger_journal_lines: [
      {
        id: `debit-${index}`,
        debit: 175,
        credit: 0,
        ledger_accounts: { code: 'EXPENSES', name: 'General expenses' },
      },
      {
        id: `credit-${index}`,
        debit: 0,
        credit: 175,
        ledger_accounts: { code: 'CASH_ON_HAND', name: 'Cash on hand' },
      },
    ],
  }));
  await page.route('**/rest/v1/ledger_journal_entries?*', route =>
    route.fulfill({
      json: entries,
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' },
    })
  );
  await page.goto('http://127.0.0.1:4203/money/expenses');
  const rows = page.locator('app-journal-list [data-list-record]');
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('2 matching expenses', { exact: false })).toBeVisible();
  await expect(rows.first().getByText('Paid from: Cash on hand')).toBeVisible();
  await expect(rows.first().getByText('General expenses', { exact: true })).not.toBeVisible();
  const collapsedHeight = (await rows.first().boundingBox())!.height;
  expect(collapsedHeight).toBeLessThan(isMobile ? 150 : 115);
  await rows.first().locator('summary').click();
  await expect(rows.first().getByText('General expenses', { exact: true })).toBeVisible();
  expect((await rows.first().boundingBox())!.height).toBeGreaterThan(collapsedHeight);
  await rows.first().locator('summary').click();
  await expect.poll(async () => (await rows.first().boundingBox())!.height).toBe(collapsedHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('proforma toolbar groups its controls and distinguishes an empty collection', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, ['ViewFinancials', 'SettleOrder']);
  if (!isMobile) await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('http://127.0.0.1:4203/pos/proformas');
  await expect(page.getByText('No proformas yet', { exact: true })).toBeVisible();
  const toolbar = page.locator('app-list-search-bar');
  await expect(toolbar.locator('.stat-bar-item:visible')).toHaveCount(4);
  const date = toolbar.getByRole('combobox', { name: 'Date mode' });
  const status = toolbar.getByRole('combobox', { name: 'Status', exact: true });
  const search = toolbar.getByRole('searchbox');
  if (!isMobile) {
    const boxes = await Promise.all([date, status].map(control => control.boundingBox()));
    const bottoms = boxes.map(box => box!.y + box!.height);
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
    expect((await search.boundingBox())!.y).toBeLessThan(boxes[0]!.y);
    expect((await toolbar.boundingBox())!.height).toBeLessThan(170);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await status.selectOption('expired');
  await expect(page.getByText('No matching proformas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByText('No proformas yet', { exact: true })).toBeVisible();
});

function journalHistoryEntry(index: number) {
  return {
    id: `history-${index}`,
    entry_date: '2026-09-27',
    posted_at: '2026-09-27T10:00:00Z',
    memo: `History entry ${index}`,
    source_type: 'Expense',
    ledger_journal_lines: [
      {
        id: `debit-${index}`,
        debit: 175,
        credit: 0,
        ledger_accounts: { code: 'EXPENSES', name: 'General expenses' },
      },
      {
        id: `credit-${index}`,
        debit: 0,
        credit: 175,
        ledger_accounts: { code: 'CASH_ON_HAND', name: 'Cash on hand' },
      },
    ],
  };
}

test('journal search reloads results and resets pagination after the shared debounce', async ({
  page,
}) => {
  await authenticateFinancialUser(page);
  const requests: URL[] = [];
  await page.route('**/rest/v1/ledger_journal_entries?*', route => {
    const url = new URL(route.request().url());
    requests.push(url);
    const searching = url.searchParams.get('or')?.includes('packaging');
    return route.fulfill({
      json: searching
        ? [{ ...journalHistoryEntry(60), memo: 'Packaging supplies' }]
        : Array.from({ length: 25 }, (_, i) => journalHistoryEntry(i)),
      headers: {
        'content-range': searching ? '0-0/1' : '25-49/60',
        'access-control-expose-headers': 'content-range',
      },
    });
  });
  await page.goto('http://127.0.0.1:4203/money/ledger?page=2');
  const records = page.locator('[data-list-record]:visible');
  await expect(records).toHaveCount(25);
  await page.getByRole('searchbox', { name: 'Search journal entries' }).fill('packaging');
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText('Packaging supplies');
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page).toHaveURL(/search=packaging/);
  expect(requests.at(-1)?.searchParams.get('offset')).toBe('0');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(records).toHaveCount(25);
  expect(requests.at(-1)?.searchParams.has('or')).toBe(false);
});

for (const history of ['ledger', 'expenses', 'transfers']) {
  test(`${history} pagination returns to records after URL scrolling, including revisited pages`, async ({
    page,
    isMobile,
  }) => {
    await authenticateFinancialUser(page);
    await page.route('**/rest/v1/ledger_journal_entries?*', route => {
      const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0);
      return route.fulfill({
        json: Array.from({ length: 10 }, (_, i) => journalHistoryEntry(offset + i)),
        headers: {
          'content-range': `${offset}-${offset + 9}/60`,
          'access-control-expose-headers': 'content-range',
        },
      });
    });
    await page.goto(`http://127.0.0.1:4203/money/${history}?pageSize=10`);
    // The development-only persona switcher floats over the phone pagination.
    await page.addStyleTag({ content: 'app-persona-switcher { display: none !important; }' });
    const records = page.locator('[data-list-record]:visible');
    await expect(records).toHaveCount(10);
    const area = page.locator(
      history === 'ledger'
        ? isMobile
          ? 'app-mobile-list'
          : '.data-table-records'
        : 'app-journal-list'
    );
    for (const pageNumber of [2, 1, 2]) {
      const changePage = page.getByRole('button', {
        name: pageNumber === 1 ? 'Previous page' : 'Next page',
        exact: true,
      });
      await changePage.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await changePage.click();
      await expect(records.first()).toContainText(`History entry ${(pageNumber - 1) * 10}`);
      await expect
        .poll(() => new URL(page.url()).searchParams.get('page') ?? '1')
        .toBe(String(pageNumber));
      // Observe the settled position after both router scrolling and list rendering.
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect
        .poll(() =>
          area.evaluate(element => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            const maximum = document.documentElement.scrollHeight - window.innerHeight;
            // A short page can reach the document bottom before its records reach the navbar.
            return Math.round(window.scrollY - Math.min(maximum, Math.max(0, top - 64)));
          })
        )
        .toBe(0);
    }
  });
}

test('staff invalid dates during refresh retain the valid results and release loading', async ({
  page,
}) => {
  await authenticateFinancialUser(page, ['ViewFinancials', 'ViewStaffPerformance']);
  let hold = false;
  let pending = 0;
  let release!: () => void;
  const response = new Promise<void>(resolve => {
    release = resolve;
  });
  const staff = {
    staff_user_id: '00000000-0000-4000-8000-000000000002',
    display_name: 'Amina Wanjiku',
    role_name: 'Cashier',
    authorization_status: 'approved',
    transactions: 4,
    quantity: 12,
    gross_sales: 250,
    refunds: 30,
    voided_sales: 20,
    net_sales: 200,
    collected: 160,
    margin: 60,
    average_sale: 50,
    held_count: 2,
    held_value: 90,
  };
  await page.route('**/rest/v1/rpc/staff_sales_performance', async route => {
    if (hold) {
      pending++;
      await response;
    }
    await route.fulfill({ json: [staff] });
  });
  await page.goto('http://127.0.0.1:4203/team/performance?from=2026-09-01&to=2026-09-27');
  await expect(page.locator('[data-list-record]:visible').first()).toContainText('Amina');
  hold = true;
  await page.getByRole('button', { name: 'Refresh performance' }).click();
  await expect.poll(() => pending).toBe(2);
  await page.getByLabel('From', { exact: true }).fill('2026-10-01');
  await page.getByLabel('From', { exact: true }).dispatchEvent('change');
  await expect(page.getByRole('alert')).toContainText('From date must be before');
  release();
  await expect(page.getByRole('button', { name: 'Refresh performance' })).toBeEnabled();
  await expect(page.locator('[data-list-record]:visible').first()).toContainText('Amina');
  await expect(page.getByRole('alert')).toContainText('From date must be before');
});

test('shop setup reuses identity and keeps document drafts local while learning is unavailable', async ({
  page,
  isMobile,
}) => {
  await authenticateFinancialUser(page, ['ManageCompanySettings']);
  if (isMobile) await page.setViewportSize({ width: 320, height: 720 });
  const company: Record<string, any> = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Registered shop',
    address: 'Market Road',
    email: 'hello@example.test',
    logo_path: null,
    public_slug: null,
    public_whatsapp_number: null,
    public_storefront_enabled: false,
    website_url: null,
    shop_setup: {},
    document_designs: {},
  };
  await page.route('**/rest/v1/companies*', async route => {
    if (route.request().method() === 'PATCH') {
      Object.assign(company, route.request().postDataJSON());
      return route.fulfill({ status: 204, body: '' });
    }
    if (
      new URL(route.request().url()).searchParams
        .get('select')
        ?.includes('public_storefront_enabled')
    )
      return route.fulfill({ json: company });
    return route.fallback();
  });
  await page.route('**/rest/v1/rpc/save_shop_setup', async route => {
    Object.assign(company['shop_setup'], route.request().postDataJSON().p_patch);
    await route.fulfill({ json: company['shop_setup'] });
  });
  await page.route('**/rest/v1/rpc/shop_address_availability', async route => {
    const slug = route.request().postDataJSON().p_slug;
    await route.fulfill({
      json: { available: slug !== 'taken', suggestion: slug === 'taken' ? 'taken-2' : slug },
    });
  });
  await page.route('**/rest/v1/rpc/save_document_design', async route => {
    const { p_document_type, p_design } = route.request().postDataJSON();
    company['document_designs'][p_document_type] = p_design;
    await route.fulfill({ json: p_design });
  });
  await page.goto('http://127.0.0.1:4203/shop-setup');
  await expect(page.getByLabel('Business name')).toHaveValue('Registered shop');
  await page.getByLabel('Website (optional)').fill('https://example.test');
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(page.getByLabel('Shop web address')).toHaveValue('registered-shop');
  await page.getByLabel('Shop web address').fill('taken');
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await page.getByRole('button', { name: 'Use taken-2', exact: true }).click();
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your documents are ready' })).toBeVisible();
  expect(company['public_storefront_enabled']).toBe(false);
  await page.route('**/rest/v1/rpc/company_tax_settings', route =>
    route.fulfill({
      json: {
        active_profile: {
          vat_registered: false,
          default_tax_category_id: 'standard',
          tax_registration_number: null,
        },
        categories: [{ id: 'standard', classification: 'standard', rate_bps: 1600 }],
        scheduled_profiles: [],
        show_vat_breakdown_on_prints: true,
      },
    })
  );
  await page.getByRole('link', { name: 'Customize documents', exact: true }).click();
  await expect(page).toHaveURL(/settings\/documents\?from=setup/);
  const editor = page.locator('app-document-designer');
  const preview = editor.frameLocator('iframe');
  const edit = async () => {
    if (isMobile) await editor.getByRole('tab', { name: 'Edit', exact: true }).click();
  };
  const showPreview = async () => {
    if (isMobile) await editor.getByRole('tab', { name: 'Preview', exact: true }).click();
  };
  await editor.getByRole('radio', { name: 'Modern' }).check();
  await editor.getByLabel('Receipt message').fill('Local draft message');
  await editor.getByLabel('Text or link').fill('https://example.test');
  await editor.getByRole('button', { name: 'Add a caption', exact: true }).click();
  await editor.getByLabel('Caption (optional)').fill('Website');
  await expect(preview.locator('.custom-field strong')).toHaveText('Website');
  await expect(preview.locator('.custom-field p:not(.qr-pending)')).toHaveText(
    'https://example.test'
  );
  await expect(preview.getByRole('img', { name: 'QR code' })).toHaveCount(0);
  await editor.getByRole('radio', { name: 'Text and QR', exact: true }).check();
  await showPreview();
  await expect(preview.getByText('Local draft message')).toBeVisible();
  await expect(preview.getByRole('img', { name: 'QR code' })).toBeVisible();
  await expect(preview.locator('.totals')).toContainText('VAT 16%');
  await expect(preview.locator('.document-note')).toContainText('VAT layout example only');
  const originalQr = await preview.locator('.document-qr path').getAttribute('d');
  await preview.locator('html').evaluate(el => el.setAttribute('data-persistent-preview', 'yes'));
  await edit();
  await editor.getByLabel('Text or link').fill('https://example.test/shop');
  await expect(preview.locator('.custom-field p:not(.qr-pending)')).toHaveText(
    'https://example.test/shop'
  );
  await expect(preview.locator('.document-qr path')).toHaveCount(1);
  await expect(preview.locator('.document-qr path')).not.toHaveAttribute('d', originalQr!);
  await expect(preview.locator('html')).toHaveAttribute('data-persistent-preview', 'yes');
  await expect(preview.locator('.custom-field')).toHaveAttribute('data-preview-active', '');
  await editor.getByRole('radio', { name: 'QR code', exact: true }).check();
  await expect(preview.locator('.custom-field p:not(.qr-pending)')).toHaveCount(0);
  await editor.getByRole('radio', { name: 'Text and QR', exact: true }).check();
  await editor.getByLabel('Show VAT breakdown').uncheck();
  await expect(preview.locator('.totals')).not.toContainText('VAT');
  expect(company['document_designs']['receipt']).toBeUndefined();
  await editor.getByRole('combobox', { name: 'Document', exact: true }).selectOption('invoice');
  await expect(editor.getByLabel('Show VAT breakdown')).toBeChecked();
  await editor.getByRole('combobox', { name: 'Document', exact: true }).selectOption('receipt');
  await expect(editor.getByLabel('Receipt message')).toHaveValue('Local draft message');
  await expect(editor.getByLabel('Show VAT breakdown')).not.toBeChecked();
  await showPreview();
  await preview.locator('.custom-field').scrollIntoViewIfNeeded();
  await expect(preview.getByRole('img', { name: 'QR code' })).toBeInViewport();
  await editor.getByRole('button', { name: 'Save receipt', exact: true }).click();
  await expect(editor.getByText('Receipt design saved.')).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Test print', exact: true })).toBeEnabled();
  await expect(preview.locator('html')).toHaveAttribute('data-persistent-preview', 'yes');
  if (!isMobile) {
    await expect(editor.locator('#design-preview')).toBeInViewport();
    // The sample remains visible while either the page or its document is scrolled.
    await editor.getByRole('combobox', { name: 'Paper', exact: true }).selectOption('a4');
    const previewPanel = editor.locator('#design-preview');
    for (const height of [720, 600]) {
      await page.setViewportSize({ width: 1280, height });
      for (const fraction of [0, 0.5, 1]) {
        await editor.locator('#design-controls').evaluate((el, f) => {
          el.scrollTop = el.scrollHeight * f;
        }, fraction);
        await expect
          .poll(async () => {
            const bounds = await previewPanel.boundingBox();
            return bounds !== null && bounds.y >= 56 && bounds.y + bounds.height <= height;
          })
          .toBe(true);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await editor.locator('#design-controls').evaluate(el => {
      el.scrollTop = 0;
    });
  }
  expect(company['document_designs']['receipt'].layout).toBe('modern');
  expect(company['document_designs']['receipt'].showVatBreakdown).toBe(false);
  if (process.env.DESIGN_REVIEW_DIR)
    await page.screenshot({
      path: `${process.env.DESIGN_REVIEW_DIR}/document-designer-${isMobile ? 'phone' : 'desktop'}.png`,
    });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await editor.getByRole('link', { name: 'Back to setup', exact: true }).click();
  await expect(page).toHaveURL(/shop-setup\?step=documents/);
  await page.getByRole('button', { name: 'Use these defaults and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your shop basics are ready' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Continue your first business cycle' })
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your shop basics are ready' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

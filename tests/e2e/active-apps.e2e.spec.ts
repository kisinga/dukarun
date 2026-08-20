import { expect, test } from '@playwright/test';

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

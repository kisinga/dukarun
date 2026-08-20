import { expect, test, type Locator, type Page } from '@playwright/test';

const companyId = '96000000-0000-4000-8000-000000000001';
const userId = '96000000-0000-4000-8000-000000000002';
const locationId = '96000000-0000-4000-8000-000000000003';
const campaignId = '96000000-0000-4000-8000-000000000004';

type ViewportCase = {
  name: string;
  width: number;
  height: number;
  largeText?: boolean;
};

const viewportCases: ViewportCase[] = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'reference phone', width: 390, height: 844 },
  { name: 'Pixel 7 project', width: 412, height: 839 },
  { name: 'short desktop', width: 1024, height: 600 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'large text', width: 1024, height: 600, largeText: true },
];

function session(isPlatformAdmin = false) {
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: userId,
    company_id: companyId,
    user_role: 'Owner',
    is_platform_admin: isPlatformAdmin,
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const accessToken = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(
    JSON.stringify(payload)
  ).toString('base64url')}.mock-signature`;
  return {
    access_token: accessToken,
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
      created_at: '2026-08-19T00:00:00Z',
    },
  };
}

async function installSession(
  page: Page,
  isPlatformAdmin = false
): Promise<ReturnType<typeof session>> {
  const value = session(isPlatformAdmin);
  await page.addInitScript(
    ({ storedSession, company, user, location }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify(storedSession));
      localStorage.setItem(`dukarun:working-location:${company}:${user}`, location);
    },
    { storedSession: value, company: companyId, user: userId, location: locationId }
  );
  return value;
}

async function assertTaskModalGeometry(page: Page, shell: Locator): Promise<void> {
  await expect(shell).toBeVisible();
  await expect(shell.locator('.modal-body')).toHaveCount(1);

  const viewport = page.viewportSize();
  const geometry = await shell.evaluate(element => {
    const header = element.querySelector('header');
    const footer = element
      .querySelectorAll('footer')
      .item(element.querySelectorAll('footer').length - 1);
    if (!header || !footer) return null;

    const box = (target: Element) => {
      const { x, y, width, height } = target.getBoundingClientRect();
      return { x, y, width, height };
    };

    // The modal scales in on entry. Read related boxes in one animation frame so
    // the containment checks do not compare different points in that transition.
    return { shell: box(element), header: box(header), footer: box(footer) };
  });
  expect(viewport).not.toBeNull();
  expect(geometry).not.toBeNull();
  if (!viewport || !geometry) return;

  const { shell: shellBox, header: headerBox, footer: footerBox } = geometry;

  expect(shellBox.x).toBeGreaterThanOrEqual(-1);
  expect(shellBox.y).toBeGreaterThanOrEqual(-1);
  expect(shellBox.x + shellBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(shellBox.y + shellBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(headerBox.y).toBeGreaterThanOrEqual(shellBox.y - 1);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(shellBox.y + shellBox.height + 2);

  const overflow = await shell.evaluate(element => ({
    shell: getComputedStyle(element).overflowY,
    body: getComputedStyle(element.querySelector<HTMLElement>('.modal-body')!).overflowY,
  }));
  expect(overflow.shell).toBe('hidden');
  expect(overflow.body).toBe('auto');

  const body = shell.locator('.modal-body');
  const controls = body.locator(
    'input:not([type="file"]):visible, button:visible, select:visible, textarea:visible, a:visible'
  );
  if ((await controls.count()) > 0) {
    await controls.first().scrollIntoViewIfNeeded();
    await expect(controls.first()).toBeInViewport();
    await controls.last().scrollIntoViewIfNeeded();
    await expect(controls.last()).toBeInViewport();
  }
  await expect(shell.locator('footer').last()).toBeInViewport();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
}

async function mockOperationsApp(page: Page): Promise<void> {
  const storedSession = await installSession(page);
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/v1/user')) return json(storedSession.user);
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
        permissions: ['ManageCatalog', 'ManageStockAdjustments'],
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
        { id: locationId, code: 'MAIN', name: 'Main shop', is_default: true, is_primary: true },
      ]);
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
          : [{ id: companyId, name: 'Viewport shop', code: 'VIEWPORT' }]
      );
    }
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) return json([]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_families')) return json([]);
    if (path.endsWith('/rest/v1/rpc/location_stock_for_variants')) return json([]);
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });
}

async function mockSuperAdmin(page: Page): Promise<void> {
  const storedSession = await installSession(page, true);
  const campaign = {
    id: campaignId,
    company_id: null,
    scope: 'platform',
    name: 'Viewport campaign',
    title: 'A message that remains reachable',
    body: 'Campaign body',
    channel: 'in_app',
    audience: 'all',
    audience_filter: {},
    cta_label: null,
    cta_link: null,
    status: 'draft',
    scheduled_for: null,
    started_at: null,
    completed_at: null,
    recipient_count: 0,
    sent_count: 0,
    failed_count: 0,
    created_by: userId,
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-19T00:00:00Z',
  };
  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/auth/v1/user')) return json(storedSession.user);
    if (path.endsWith('/rest/v1/message_campaigns')) return json([campaign]);
    if (path.endsWith('/rest/v1/message_templates')) return json([]);
    if (path.endsWith('/rest/v1/subscription_tiers')) return json([]);
    if (path.endsWith('/rest/v1/outbox')) return json([]);
    if (path.endsWith('/rest/v1/companies')) return json([]);
    if (path.endsWith('/rest/v1/platform_communication_settings')) {
      return json({ external_messaging_enabled: true });
    }
    if (path.endsWith('/rest/v1/rpc/platform_external_communication_metrics')) {
      return json({
        provider_accepted: 0,
        failed: 0,
        pending: 0,
        documents_opened: 0,
        link_opens: 0,
      });
    }
    if (path.endsWith('/rest/v1/rpc/platform_save_campaign_draft')) return json(campaignId);
    if (path.endsWith('/rest/v1/rpc/platform_review_campaign')) {
      return json({
        total: 4,
        eligible: 3,
        skipped: 1,
        missing_primary: 1,
        missing_phone: 0,
        sample: {
          merchant_name: 'Viewport Shop',
          tier: 'Pro',
          subscription_state: 'active',
          subscription_end_date: '2026-12-31',
        },
      });
    }
    if (path.endsWith('/rest/v1/rpc/platform_campaign_metrics')) {
      return json({
        targeted: 4,
        skipped: 1,
        queued: 3,
        provider_accepted: 2,
        failed: 0,
        read: 1,
        clicked: 1,
      });
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });
}

test('product editor keeps task chrome reachable across the viewport contract', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The explicit viewport matrix runs once in the desktop project.');
  await mockOperationsApp(page);

  for (const viewport of viewportCases) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('http://127.0.0.1:4203/inventory/products');
    if (viewport.largeText) {
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    }
    const addProduct = page.getByRole('button', { name: 'Add product' });
    await expect(addProduct).toBeVisible();
    await addProduct.click();

    const editor = page.locator('dialog.modal-open .modal-box-task');
    await assertTaskModalGeometry(page, editor);
    await editor.getByLabel('Product name').fill(`Viewport item ${viewport.name}`);
    await editor.getByRole('button', { name: /Variants/ }).click();
    await expect(editor.getByRole('heading', { name: 'Sellable variants' })).toBeVisible();
    await assertTaskModalGeometry(page, editor);
    await editor.getByRole('button', { name: 'Close product editor' }).click();
  }
});

test('super-admin campaign dialogs keep their actions inside a short viewport', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The explicit viewport matrix runs once in the desktop project.');
  await mockSuperAdmin(page);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('http://127.0.0.1:4205/communications');
  await expect(page.getByRole('heading', { name: 'Communications', exact: true })).toBeVisible();

  await page.getByLabel('Campaign name').fill('Viewport campaign');
  await page.getByLabel('Title').fill('A message that remains reachable');
  await page.getByLabel('Message').fill('A sufficiently long campaign message for preview.');
  await page.getByRole('button', { name: 'Review send' }).click();
  const review = page.locator('dialog[open] .modal-box-task');
  await expect(review.getByRole('heading', { name: 'Review campaign' })).toBeVisible();
  await assertTaskModalGeometry(page, review);
  await review.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Details' }).first().click();
  const details = page.locator('dialog[open] .modal-box-task');
  await expect(details.getByRole('heading', { name: 'Viewport campaign' })).toBeVisible();
  await assertTaskModalGeometry(page, details);
});

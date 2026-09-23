import { expect, test, type Locator, type Page } from '../fixtures/mocked-browser';
import { renderedTextContrast } from '../fixtures/contrast';

const companyId = '96000000-0000-4000-8000-000000000001';
const userId = '96000000-0000-4000-8000-000000000002';
const locationId = '96000000-0000-4000-8000-000000000003';
const campaignId = '96000000-0000-4000-8000-000000000004';
const productId = '96000000-0000-4000-8000-000000000005';
const variantId = '96000000-0000-4000-8000-000000000006';

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

async function mockOperationsApp(
  page: Page,
  options: { cashControl?: boolean; openTill?: () => boolean } = {}
): Promise<{
  createdProduct: () => unknown;
  updatedProduct: () => unknown;
}> {
  const storedSession = await installSession(page);
  let createdProduct: unknown = null;
  let updatedProduct: unknown = null;
  const product = {
    id: productId,
    company_id: companyId,
    name: 'Breakfast tea',
    barcode: null,
    active: true,
    image_path: null,
    manufacturer_id: null,
    tax_category_id: null,
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-19T00:00:00Z',
  };
  const variant = {
    variant_id: variantId,
    variant_name: 'Default',
    product_id: productId,
    product_name: product.name,
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
        permissions: [
          'ManageCatalog',
          'ManageStockAdjustments',
          ...(options.cashControl ? ['SettleOrder'] : []),
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
          ? {
              cashier_flow_enabled: false,
              cash_control_enabled: options.cashControl ?? false,
              require_opening_count: false,
              batch_expiry_enabled: false,
              variance_notification_threshold: 100,
              low_stock_threshold: 10,
            }
          : [{ id: companyId, name: 'Viewport shop', code: 'VIEWPORT' }]
      );
    }
    if (path.endsWith('/rest/v1/cashier_sessions')) {
      return json(
        options.openTill?.()
          ? {
              id: '96000000-0000-4000-8000-000000000007',
              company_id: companyId,
              location_id: locationId,
              status: 'open',
              opened_at: new Date().toISOString(),
            }
          : null
      );
    }
    if (path.endsWith('/rest/v1/products')) {
      return request.headers()['accept']?.includes('application/vnd.pgrst.object')
        ? json(product)
        : json([product]);
    }
    if (path.endsWith('/rest/v1/product_variants')) {
      return json([
        {
          id: variantId,
          company_id: companyId,
          product_id: productId,
          name: 'Default',
          sku: 'TEA-1',
          barcode: null,
          kind: 'good',
          price: 125,
          wholesale_price: 100,
          track_inventory: true,
          allow_fractional: false,
          active: true,
          created_at: '2026-08-19T00:00:00Z',
          updated_at: '2026-08-19T00:00:00Z',
        },
      ]);
    }
    if (path.endsWith('/rest/v1/product_category_links')) return json([]);
    if (path.endsWith('/rest/v1/variant_catalog')) return json([variant]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_page')) return json([variant]);
    if (path.endsWith('/rest/v1/rpc/catalog_cache_families')) return json([product]);
    if (path.endsWith('/rest/v1/rpc/location_stock_for_variants')) {
      return json([{ variant_id: variantId, stock: 12, stock_value: 1_200 }]);
    }
    if (path.endsWith('/rest/v1/rpc/save_catalog_product_units')) {
      const body = request.postDataJSON();
      if (body.p_product.product_id) updatedProduct = body;
      else createdProduct = body;
      return json(productId);
    }
    if (path.endsWith('/rest/v1/rpc/create_catalog_product_with_manufacturer')) {
      createdProduct = request.postDataJSON();
      return json(productId);
    }
    if (path.endsWith('/rest/v1/rpc/update_catalog_product_with_manufacturer')) {
      updatedProduct = request.postDataJSON();
      return json(productId);
    }
    if (path.includes('/rest/v1/rpc/')) return json([]);
    return json([]);
  });
  return {
    createdProduct: () => createdProduct,
    updatedProduct: () => updatedProduct,
  };
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
    await editor.getByRole('button', { name: /Selling & stock/ }).click();
    await expect(editor.getByRole('heading', { name: 'Sellable variants' })).toBeVisible();
    await assertTaskModalGeometry(page, editor);
    await editor.getByRole('button', { name: 'Close product editor' }).click();
  }
});

test('record and edit hierarchy stays distinct in both themes', async ({ page, isMobile }) => {
  await mockOperationsApp(page);

  for (const theme of ['light', 'dark']) {
    await page.goto(`http://127.0.0.1:4203/inventory/products?product=${productId}`);
    await page.evaluate(value => {
      localStorage.setItem('dukarun-theme', value);
      document.documentElement.setAttribute('data-theme', value);
    }, theme);
    const drawer = page.getByRole('dialog', { name: 'Breakfast tea' });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.locator('header').getByRole('button', { name: 'Edit product' })
    ).toBeVisible();
    const summary = drawer.locator('dl.surface-card');
    await expect(summary).toContainText('Stock on hand');
    expect(await summary.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(
      await drawer.evaluate(element => getComputedStyle(element).backgroundColor)
    );

    const history = drawer.getByRole('button', { name: 'Purchase history', exact: true });
    await history.focus();
    await page.keyboard.press('Enter');
    await expect(history).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer.getByText('No purchases recorded for this variant.')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(history).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer.getByText('No purchases recorded for this variant.')).toHaveCount(0);

    // Preserve the historical pairing; 3.48:1 at rest is below small-text AA.
    const primary = drawer.getByRole('link', { name: 'Adjust stock' });
    for (const hovered of [false, true]) {
      if (hovered) await primary.hover();
      const measured = await renderedTextContrast(primary);
      expect(measured.foreground).toEqual([255, 255, 255]);
      expect(measured.ratio).toBeGreaterThanOrEqual(hovered ? 4.5 : 3.47);
    }
    await page.mouse.move(0, 0);

    if (process.env.DESIGN_REVIEW_DIR) {
      await summary.scrollIntoViewIfNeeded();
      await drawer.screenshot({
        path: `${process.env.DESIGN_REVIEW_DIR}/product-${theme}-${isMobile ? 'phone' : 'desktop'}.png`,
      });
    }

    await drawer.getByRole('button', { name: 'Edit product' }).click();
    const editor = page.locator('dialog.modal-open .modal-box-task');
    const name = editor.getByLabel('Product name');
    await name.focus();
    const field = await name.evaluate(element => {
      const style = getComputedStyle(element);
      const surface = getComputedStyle(element.closest('.surface-card')!);
      return {
        background: style.backgroundColor,
        surface: surface.backgroundColor,
        border: style.borderTopWidth,
        outline: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    expect(field.background).not.toBe(field.surface);
    expect(field.border).not.toBe('0px');
    expect(field.outline).toBe('solid');
    expect(parseFloat(field.outlineWidth)).toBeGreaterThanOrEqual(2);
    await assertTaskModalGeometry(page, editor);
    if (process.env.DESIGN_REVIEW_DIR) {
      await name.scrollIntoViewIfNeeded();
      await editor.screenshot({
        path: `${process.env.DESIGN_REVIEW_DIR}/editor-${theme}-${isMobile ? 'phone' : 'desktop'}.png`,
      });
    }
    await editor.getByRole('button', { name: 'Close product editor' }).click();
  }
});

test('shared actions, navigation and metadata retain their contrast and hierarchy', async ({
  page,
}) => {
  await mockOperationsApp(page);
  await page.goto('http://127.0.0.1:4203/inventory/products');
  await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
  // Exercise both production CSS recipes, including legacy controls not yet using appButton.
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'shared-style-contract';
    fixture.className = 'dashboard-main';
    fixture.style.cssText =
      'position:fixed;inset:0;z-index:2000000;padding:16px;overflow:auto;background:var(--color-base-100)';
    for (const [name, classes] of Object.entries({
      shared: 'counter-btn counter-btn-primary counter-btn-md',
      legacy: 'btn btn-primary min-h-11',
      outline: 'btn btn-primary btn-outline min-h-11',
      soft: 'btn btn-primary btn-soft min-h-11',
      badge: 'badge badge-primary',
      'neutral-badge': 'badge badge-neutral badge-soft badge-xs',
      marker: 'brand-marker',
      'nav-active': 'nav-item nav-item-active',
      'tab-active': 'section-tab section-tab-active',
      'tab-inactive': 'section-tab',
      'bottom-active': 'bottom-nav-item bottom-nav-active',
      'bottom-inactive': 'bottom-nav-item',
      metadata: 'table-secondary',
      caption: 'type-caption',
    })) {
      const control = document.createElement('button');
      control.className = classes;
      control.textContent = name;
      fixture.append(control);
    }
    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = '<thead><tr><th>Product</th></tr></thead>';
    fixture.append(table);
    document.body.append(fixture);
  });
  const fixture = page.locator('#shared-style-contract');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    for (const state of ['default', 'hover', 'pressed', 'focus']) {
      const primaryColours = [];
      for (const name of [
        'shared',
        'legacy',
        'outline',
        'soft',
        'badge',
        'neutral-badge',
        'marker',
        'nav-active',
        'tab-active',
        'tab-inactive',
        'bottom-active',
        'bottom-inactive',
        'metadata',
        'caption',
      ]) {
        // Check supporting styles once per theme; exercise each action state below.
        if (state !== 'default' && !['shared', 'legacy', 'outline', 'soft'].includes(name)) {
          continue;
        }
        const control = fixture.getByRole('button', { name, exact: true });
        await page.mouse.move(0, 0);
        if (state === 'hover' || state === 'pressed') await control.hover();
        if (state === 'pressed') await page.mouse.down();
        if (state === 'focus') {
          await control.focus();
          await page.keyboard.press('Tab');
          await page.keyboard.press('Shift+Tab');
          await expect(control).toBeFocused();
          expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).toBe(
            'solid'
          );
        }
        const measured = await renderedTextContrast(control);
        if (name === 'shared' || name === 'legacy') {
          expect(measured.fontSize).toBe(14);
          expect(measured.fontWeight).toBe(600);
          expect(measured.foreground).toEqual([255, 255, 255]);
          // Normal white-on-brand labels are 3.48:1, not AA-compliant small text.
          expect(measured.ratio).toBeGreaterThanOrEqual(
            state === 'hover' || state === 'pressed' ? 4.5 : 3.47
          );
          if (state === 'default' || state === 'focus') {
            expect(measured.background).toEqual([232, 93, 47]);
          }
          primaryColours.push([measured.background, measured.foreground]);
          if (state === 'pressed') {
            expect(await control.evaluate(element => getComputedStyle(element).translate)).toBe(
              'none'
            );
          }
        } else {
          expect(measured.ratio, `${theme} ${name} ${state}`).toBeGreaterThanOrEqual(4.5);
        }
        if (state === 'pressed') await page.mouse.up();
      }
      expect(primaryColours[0]).toEqual(primaryColours[1]);
    }
    expect((await renderedTextContrast(fixture.locator('th'))).ratio).toBeGreaterThanOrEqual(4.5);
    const disabledColours = [];
    for (const name of ['shared', 'legacy']) {
      const control = fixture.getByRole('button', { name, exact: true });
      const height = (await control.boundingBox())!.height;
      await control.evaluate(element => ((element as HTMLButtonElement).disabled = true));
      await expect(control).toBeDisabled();
      const measured = await renderedTextContrast(control);
      expect(measured.background).not.toEqual([232, 93, 47]);
      expect(measured.ratio).toBeGreaterThanOrEqual(4.5);
      expect((await control.boundingBox())!.height).toBe(height);
      disabledColours.push([measured.background, measured.foreground]);
      await control.evaluate(element => ((element as HTMLButtonElement).disabled = false));
    }
    expect(disabledColours[0]).toEqual(disabledColours[1]);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of ['shared', 'legacy']) {
    expect(
      await fixture
        .getByRole('button', { name, exact: true })
        .evaluate(element => getComputedStyle(element).transitionDuration)
    ).toBe('0s');
  }
});

test('header actions and avatars retain the compact historical brand treatment', async ({
  page,
  isMobile,
}) => {
  let openTill = false;
  await mockOperationsApp(page, { cashControl: true, openTill: () => openTill });
  if (isMobile) await page.setViewportSize({ width: 320, height: 700 });
  for (const theme of ['light', 'dark']) {
    openTill = false;
    await page.goto('http://127.0.0.1:4203/inventory/products');
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    const till = page.getByRole('button', { name: 'Open till opening dialog' });
    await expect(till).toBeVisible();
    await expect(till).toHaveClass(/counter-btn-primary/);
    // The loading-to-primary change can restart the theme's colour transition.
    // Wait for the final treatment, not a single intermediate animation frame.
    await expect
      .poll(() => renderedTextContrast(till))
      .toMatchObject({
        fontSize: 14,
        fontWeight: 600,
        foreground: [255, 255, 255],
        background: [232, 93, 47],
      });
    const account = page.getByRole('button', { name: 'Account menu' });
    await expect(account.locator('app-entity-avatar')).toHaveAttribute('aria-hidden', 'true');
    const initial = await renderedTextContrast(account.locator('app-entity-avatar span'));
    expect(initial.fontSize).toBe(12);
    expect(initial.fontWeight).toBe(600);
    expect(initial.ratio).toBeGreaterThanOrEqual(3.47);
    expect(initial.background).toEqual([232, 93, 47]);
    expect(initial.foreground).toEqual([255, 255, 255]);
    const activeStatus = page
      .locator('app-status-badge .badge:visible')
      .filter({ hasText: /^\s*active\s*$/ })
      .first();
    await expect(activeStatus).toBeVisible();
    expect((await renderedTextContrast(activeStatus)).ratio).toBeGreaterThanOrEqual(4.5);
    const geometry = await till.evaluate(element => {
      const box = element.getBoundingClientRect();
      const bar = element.closest('.navbar')!.getBoundingClientRect();
      return { top: box.top - bar.top, bottom: bar.bottom - box.bottom, height: box.height };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeGreaterThanOrEqual(0);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeLessThanOrEqual(48);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    openTill = true;
    await page.reload();
    const closeTill = page.getByRole('button', { name: 'Open till closing dialog' });
    await expect(closeTill).toBeVisible();
    await expect(closeTill).toHaveClass(/counter-btn-secondary/);
    await expect(closeTill.locator('app-icon')).toHaveClass(/text-success/);
  }
});

test('product editor creates the coupled product and variant payload', async ({ page }) => {
  const capture = await mockOperationsApp(page);
  await page.goto('http://127.0.0.1:4203/inventory/products');
  await page.getByRole('button', { name: 'Add product' }).click();

  const editor = page.locator('dialog.modal-open .modal-box-task');
  await editor.getByLabel('Product name').fill('Breakfast tea');
  await editor.getByRole('button', { name: /Continue to|Next:/ }).click();
  await editor.getByLabel('Retail price per item (KES)').fill('125');
  await editor.getByRole('button', { name: 'Create product' }).click();

  await expect(page.getByText('Created Breakfast tea')).toBeVisible();
  expect(capture.createdProduct()).toMatchObject({
    p_product: { name: 'Breakfast tea' },
    p_variants: [expect.objectContaining({ price: 125, kind: 'good' })],
  });
});

test('product editor updates the coupled product and variant payload', async ({ page }) => {
  const capture = await mockOperationsApp(page);
  await page.goto(`http://127.0.0.1:4203/inventory/products?product=${productId}`);

  const drawer = page.getByRole('dialog', { name: 'Breakfast tea' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Edit product' }).click();
  const editor = page.locator('dialog.modal-open .modal-box-task');
  await editor.getByLabel('Product name').fill('Breakfast tea premium');
  await editor.getByRole('button', { name: /Selling & stock/ }).click();
  await editor.getByLabel('Retail price per item (KES)').fill('140');
  await editor.getByRole('button', { name: 'Save product' }).click();

  await expect(page.getByText('Updated Breakfast tea premium and 1 variant')).toBeVisible();
  expect(capture.updatedProduct()).toMatchObject({
    p_product: { product_id: productId, name: 'Breakfast tea premium' },
    p_variants: [expect.objectContaining({ variant_id: variantId, price: 140 })],
  });
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

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
  options: { cashControl?: boolean; openTill?: () => boolean; insights?: boolean } = {}
): Promise<{
  createdProduct: () => unknown;
  updatedProduct: () => unknown;
  uploadedImage: () => { path: string; contentType: string; size: number } | null;
}> {
  const storedSession = await installSession(page);
  let createdProduct: unknown = null;
  let updatedProduct: unknown = null;
  let uploadedImage: { path: string; contentType: string; size: number } | null = null;
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
          ...(options.insights ? ['ViewFinancials'] : []),
          ...(options.cashControl ? ['SettleOrder'] : []),
        ],
        workspaces: [
          'dashboard',
          'inventory',
          'purchasing',
          ...(options.insights ? ['insights'] : []),
        ],
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
    if (path.startsWith('/storage/v1/object/product-images/')) {
      const objectPath = decodeURIComponent(
        path.slice('/storage/v1/object/product-images/'.length)
      );
      const body = request.postDataBuffer();
      uploadedImage = {
        path: objectPath,
        contentType: body?.toString('latin1').match(/Content-Type: (image\/[^\r\n]+)/)?.[1] ?? '',
        size: body?.byteLength ?? 0,
      };
      return json({ Key: objectPath });
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
    uploadedImage: () => uploadedImage,
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

test('product camera and gallery stage and upload a real image', async ({ page }) => {
  const capture = await mockOperationsApp(page);
  await page.goto('http://127.0.0.1:4203/inventory/products');
  await page.getByRole('button', { name: 'Add product' }).click();

  const editor = page.locator('dialog.modal-open .modal-box-task');
  const photo = editor.locator('app-product-photo-control');
  const galleryInput = photo.locator('input[type="file"]:not([capture])');
  const cameraInput = photo.locator('input[type="file"][capture]');
  const image = 'assets/logo/v2.png';

  await galleryInput.setInputFiles(image);
  await expect(
    photo.getByText('Ready - the photo will upload when you create the product.')
  ).toBeVisible();
  await expect(photo.locator('img')).toHaveAttribute('src', /^blob:/);

  await cameraInput.setInputFiles(image);
  await expect(
    photo.getByText('Ready - the photo will upload when you create the product.')
  ).toBeVisible();
  await expect(photo.locator('img')).toHaveAttribute('src', /^blob:/);

  await editor.getByLabel('Product name').fill('Photo test product');
  await editor.getByRole('button', { name: /Continue to|Next:/ }).click();
  await editor.getByLabel('Retail price per item (KES)').fill('125');
  await editor.getByRole('button', { name: 'Create product' }).click();

  await expect(page.getByText('Created Photo test product')).toBeVisible();
  const upload = capture.uploadedImage();
  expect(upload).toMatchObject({ contentType: 'image/png' });
  expect(upload?.path).toMatch(new RegExp(`^${companyId}/[0-9a-f-]+\\.png$`));
  expect(upload?.size).toBeGreaterThan(0);
  expect(capture.createdProduct()).toMatchObject({
    p_product: { name: 'Photo test product', image_path: upload?.path },
  });
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

test('primary desktop tables use page scrolling and a native sticky header band', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Desktop table behavior is paired with mobile record lists.');
  await mockOperationsApp(page);
  await page.goto('http://127.0.0.1:4203/inventory/products');
  const viewport = page.locator('.data-table-viewport').first();
  const band = page.locator('.data-table-header-band').first();
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute('role', 'region');
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await expect(
    page.getByRole('checkbox', { name: 'Select products on this page', exact: true })
  ).toHaveCount(1);
  await viewport.locator('tbody').evaluate(body => {
    const row = body.querySelector('tr');
    if (row) for (let index = 0; index < 24; index++) body.append(row.cloneNode(true));
  });
  expect(await viewport.evaluate(element => getComputedStyle(element).maxHeight)).toBe('none');
  const tableTop = await viewport.evaluate(
    element => element.getBoundingClientRect().top + window.scrollY
  );
  await page.evaluate(top => window.scrollTo(0, top + 160), tableTop);
  await expect.poll(async () => Math.round((await band.boundingBox())!.y)).toBe(56);
  expect(await viewport.evaluate(element => element.scrollTop)).toBe(0);
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, 240);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 180);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await expect.poll(async () => Math.round((await band.boundingBox())!.y)).toBe(56);
  // Both headers describe the same native column geometry, including the selection column.
  await expect
    .poll(async () =>
      page
        .locator('app-data-table-shell')
        .first()
        .evaluate(shell => {
          const cells = (selector: string) =>
            Array.from(
              shell.querySelectorAll(selector),
              cell => cell.getBoundingClientRect().width
            );
          const header = cells('.data-table-header-band th');
          const body = cells('.data-table-semantic-header th');
          return header.length !== body.length
            ? Infinity
            : Math.max(...header.map((width, i) => Math.abs(width - body[i])));
        })
    )
    .toBeLessThan(2);
  const pinnedBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + box.width / 2, 72);
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pinnedBefore);
  // Force a wide native table, then use the keyboard to pan it. Identity and selection stay put.
  await viewport.evaluate(element => {
    (element.closest('app-data-table-shell') as HTMLElement).style.maxWidth = '600px';
    (element.querySelector('table') as HTMLElement).style.minWidth = '1100px';
  });
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => viewport.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page
        .locator('.data-table-header-viewport')
        .first()
        .evaluate(element => element.scrollLeft)
    )
    .toBeGreaterThan(0);
  const alignment = await page
    .locator('app-data-table-shell')
    .first()
    .evaluate(shell => {
      const head = Array.from(shell.querySelectorAll('.data-table-header-band th'));
      const body = Array.from(
        shell.querySelectorAll('.data-table-viewport tbody > tr:first-child > td')
      );
      return head.map((cell, index) =>
        Math.abs(cell.getBoundingClientRect().x - body[index].getBoundingClientRect().x)
      );
    });
  alignment.forEach(delta => expect(delta).toBeLessThan(2));
  // Scroll past the table into following content: the previous header must release.
  await page
    .locator('app-data-table-shell')
    .first()
    .evaluate(shell => {
      const following = document.createElement('div');
      following.style.height = '900px';
      shell.after(following);
      window.scrollTo(0, shell.getBoundingClientRect().bottom + window.scrollY - 24);
    });
  await expect.poll(async () => (await band.boundingBox())!.y).toBeLessThan(56);
  await page.emulateMedia({ media: 'print' });
  await expect(band).toBeHidden();
  await expect(viewport.locator('thead')).toHaveCSS('opacity', '1');
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

test('stock decisions preserve manufacturer, server filters, and loaded records on review return', async ({
  page,
  isMobile,
}) => {
  if (!isMobile) await page.setViewportSize({ width: 1024, height: 720 });
  await mockOperationsApp(page, { insights: true });
  const variants = Array.from({ length: 60 }, (_, index) => ({
    variant_id: `97000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    product_id: productId,
    product_name: `Tea ${String(index + 1).padStart(2, '0')}`,
    variant_name: 'Default',
    product_active: true,
    variant_active: true,
    kind: 'good',
    packs: [],
    sku: `TEA-${index + 1}`,
    price: 100,
    stock: 4,
    stock_unit: 'pieces',
    track_inventory: true,
    manufacturer_id: '97000000-0000-4000-8000-000000000999',
    manufacturer_name: 'Highland Tea & Agricultural Producers Cooperative of East Africa',
  }));
  const calls: Record<string, unknown>[] = [];
  let financialsIncluded = false;
  let slowReturn = false;
  await page.route('**/rest/v1/rpc/current_business_date', async route => {
    // A return must wait for initialization, not treat the initial empty rows as a result.
    if (slowReturn) await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: '2026-09-27' });
  });
  await page.route('**/rest/v1/rpc/catalog_cache_page', route => route.fulfill({ json: variants }));
  await page.route('**/rest/v1/rpc/product_intelligence', route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const matched = variants
      .filter(
        item =>
          !body.p_search ||
          item.product_name.toLowerCase().includes(String(body.p_search).toLowerCase())
      )
      .filter(item => !body.p_variant_id || item.variant_id === body.p_variant_id);
    const items = matched.map((item, index) => ({
      variant_id: item.variant_id,
      current_quantity: index === 0 ? 0 : 20,
      previous_quantity: index < 2 ? 0 : 10,
      current_stock: 4,
      signal: index % 3 === 0 ? 'stockout' : index % 3 === 1 ? 'reorder' : 'healthy',
      days_of_cover: 2,
      reorder_quantity: 12,
      demand_confidence: 'established',
      planning_window_days: 90,
      reason_code: 'below_target_cover',
    }));
    const attention = items.filter(item => item.signal !== 'healthy');
    const stockouts = items.filter(item => item.signal === 'stockout');
    const filtered =
      body.p_decision === 'needs_attention'
        ? attention
        : body.p_decision === 'stockout'
          ? stockouts
          : items;
    const offset = Number(body.p_offset ?? 0),
      limit = Number(body.p_limit ?? 50);
    return route.fulfill({
      json: {
        items: filtered.slice(offset, offset + limit),
        nextOffset: filtered.length > offset + limit ? offset + limit : null,
        summary: {
          trackedVariants: filtered.length,
          needsAttention: filtered.filter(item => item.signal !== 'healthy').length,
          stockouts: filtered.filter(item => item.signal === 'stockout').length,
          unitsSold: filtered.length * 20,
          stockOnHand: filtered.length * 4,
          stockValue: financialsIncluded ? filtered.length * 20_000_000 : null,
          netRevenue: financialsIncluded ? filtered.length * 200_000_000 : null,
          margin: financialsIncluded ? filtered.length * -5_000_000 : null,
        },
        decisionCounts: {
          all: items.length,
          needsAttention: attention.length,
          stockouts: stockouts.length,
        },
        financialsIncluded,
      },
    });
  });
  await page.route('**/rest/v1/rpc/product_profile', route => {
    const body = route.request().postDataJSON();
    const variant = variants.find(item => item.variant_id === body.p_variant_id)!;
    return route.fulfill({
      json: {
        variant: {
          id: variant.variant_id,
          productId,
          productName: variant.product_name,
          variantName: 'Default',
          stockUnit: 'pieces',
          manufacturerName: 'Highland Tea',
          sku: variant.sku,
        },
        attention: { signal: 'reorder', current_stock: 4, days_of_cover: 2, reorder_quantity: 12 },
        trend: [],
        positions: [],
        coverage: { from: body.p_since, to: body.p_until, days: 180, estimatedDays: 0 },
        summary: {
          averageStock: 4,
          stockoutDays: 0,
          unitsSold: 20,
          netRevenue: null,
          cogs: null,
          margin: null,
        },
      },
    });
  });
  await page.goto('http://127.0.0.1:4203/insights/inventory?period=180');
  const records = page.locator('[data-list-record]:visible');
  await expect(records).toHaveCount(50);
  await expect(records.nth(0)).toContainText('No sales in either period');
  await expect(records.nth(1)).toContainText('No previous sales');
  await expect(records.nth(2)).toContainText('+100% vs previous period');
  if (!isMobile) {
    const viewport = page.locator('.data-table-viewport');
    await expect.poll(() => viewport.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    expect(await viewport.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
    const header = page.locator('.data-table-header-band');
    await expect.poll(async () => (await header.boundingBox())!.height).toBeLessThanOrEqual(64);
    for (const cell of await header.locator('th').all()) {
      expect(await cell.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
  const summary = page.locator('app-products-insights app-stat-bar');
  for (const label of [
    'Needs attention',
    'Stockouts',
    'Matching variants',
    'Stock on hand',
    'Units sold',
  ])
    await expect(summary.getByText(label, { exact: true })).toBeVisible();
  await expect(summary.getByText('Stock at cost', { exact: true })).toHaveCount(0);
  await expect(summary.getByText('Net sales', { exact: true })).toHaveCount(0);
  await expect(summary.getByText('Margin', { exact: true })).toHaveCount(0);
  financialsIncluded = true;
  await page.reload();
  await expect(records).toHaveCount(50);
  for (const label of ['Stock at cost', 'Net sales', 'Margin']) {
    await expect(summary.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(summary.locator('.stat-bar-item:visible')).toHaveCount(8);
  await expect(
    summary.locator('.stat-bar-item').filter({ hasText: 'Margin' }).locator('.text-error')
  ).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    for (const metric of await summary.locator('.stat-bar-item:visible').all()) {
      expect(await metric.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
  await page.setViewportSize({ width: isMobile ? 390 : 1024, height: isMobile ? 844 : 720 });
  await expect(page.getByRole('button', { name: 'More summary' })).toHaveCount(0);
  await expect(records.first()).toContainText('Highland Tea');
  await expect(page.getByText(/Current planning estimates:/i)).toBeVisible();
  await page.getByRole('button', { name: /^40 Needs attention$/ }).click();
  await expect.poll(() => calls.at(-1)?.p_decision).toBe('needs_attention');
  await expect(records).toHaveCount(40);
  await page.getByRole('button', { name: /^40 Needs attention$/ }).click();
  await expect(records).toHaveCount(50);
  const search = page.getByRole('searchbox').first();
  await search.fill('Tea 55');
  await expect(records).toHaveCount(1);
  await expect.poll(() => calls.at(-1)?.p_search).toBe('Tea 55');
  await search.fill('');
  await expect(records).toHaveCount(50);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(records).toHaveCount(60);
  const target = records.filter({ hasText: 'Tea 55' });
  await target.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  await target.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tea 55', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Last 6 months' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  slowReturn = true;
  await page
    .locator('app-product-profile')
    .getByRole('link', { name: 'Inventory', exact: true })
    .click();
  await expect(page).toHaveURL(/\/insights\/inventory\?period=180$/);
  await expect(records).toHaveCount(60);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 100);
  await expect(target).toBeInViewport();
  // Browser Back follows the same return-state contract as the explicit return link.
  await target.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tea 55', exact: true })).toBeVisible();
  await page.goBack();
  await expect(records).toHaveCount(60);
  await expect(target).toBeInViewport();
});

test('collection controls, complete summaries and records fit the viewport contract', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Explicit viewport matrix runs in the desktop project.');
  await mockOperationsApp(page);
  // Exercise seven-digit values, not only the small totals in the default fixture.
  await page.route('**/rest/v1/rpc/location_stock_for_variants', route =>
    route.fulfill({ json: [{ variant_id: variantId, stock: 22_295, stock_value: 2_229_558 }] })
  );
  for (const viewport of [...viewportCases, { name: 'wide desktop', width: 1600, height: 900 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('http://127.0.0.1:4203/inventory/products');
    if (viewport.largeText)
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const search = page.getByRole('searchbox');
    await expect(search).toBeVisible();
    const record = page.locator('[data-list-record]:visible').first();
    await expect(record).toBeVisible();
    if (viewport.width >= 1024 && !viewport.largeText) {
      const title = page.getByRole('heading', { name: 'Inventory', exact: true });
      expect(await title.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      const table = page.locator('.data-table-viewport');
      await expect.poll(() => table.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      expect(await table.evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      ),
      viewport.name
    ).toBeLessThanOrEqual(1);
    const metrics = page.locator('app-products app-stat-bar .stat-bar-item');
    await expect(metrics).toHaveCount(6);
    await expect(page.locator('app-products app-stat-bar .stat-bar-item:visible')).toHaveCount(6);
    for (const metric of await metrics.all()) {
      const box = (await metric.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(await metric.evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
    }
    const toolbar = page.locator('app-products app-list-search-bar');
    const filters = [
      toolbar.getByRole('combobox', { name: 'Product status', exact: true }),
      toolbar.getByRole('combobox', { name: 'Stock status', exact: true }),
      toolbar.getByRole('combobox', { name: 'Filter products by supplier', exact: true }),
      toolbar.getByRole('combobox', { name: 'Filter products by manufacturer', exact: true }),
      toolbar.getByRole('combobox', { name: 'Filter products by category', exact: true }),
    ];
    for (const filter of filters) await expect(filter).toBeVisible();
    if (viewport.width === 1600) {
      const boxes = await Promise.all(filters.map(filter => filter.boundingBox()));
      const tops = boxes.map(box => box!.y);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      expect((await toolbar.boundingBox())!.height).toBeLessThan(230);
    }
    await filters[0].selectOption('all');
    await expect(toolbar.getByRole('button', { name: 'Remove Status: all' })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(filters[0]).toHaveValue('active');
    await filters[3].click();
    await expect(toolbar.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(filters[3]).toBeFocused();
    await record.scrollIntoViewIfNeeded();
    await expect(record).toBeInViewport();
  }
});

function creditPortfolioFixture(side: string) {
  return [0, 1].map(index => ({
    party_id: `98000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    side,
    party_name:
      side === 'supplier'
        ? ['Acme Supplies', 'Market Distributors'][index]
        : ['Jane Mwangi', 'Alex Otieno'][index],
    score: index === 0 ? 6 : 8,
    band: index === 0 ? 'watch' : 'good',
    confidence: 'high',
    balance: side === 'supplier' ? [7000, 3000][index] : [50000, 25000][index],
    overdue_amount: index === 0 ? (side === 'supplier' ? 500 : 10000) : 0,
    oldest_overdue_days: index === 0 ? 21 : 0,
    settled_documents: 12,
    history_days: 180,
    reason_codes: [index === 0 ? 'overdue_8_30' : 'maintain'],
    recommendation_code: 'maintain',
    refreshed_at: '2026-09-28T06:00:00Z',
  }));
}

function creditHealthFixture() {
  const customer = creditPortfolioFixture('customer')[0];
  const supplier = creditPortfolioFixture('supplier')[0];
  return {
    generated_at: '2026-09-28T06:00:00Z',
    metrics: {
      receivables: 240000,
      payables: 85000,
      overdue_receivables: 65000,
      severe_receivables: 20000,
      payables_due_soon: 30000,
      over_limit_parties: 1,
      top_five_concentration: 60,
    },
    aging: [
      { side: 'receivables', bucket: 'current', amount: 175000, documents: 20 },
      { side: 'receivables', bucket: '1-30', amount: 45000, documents: 5 },
      { side: 'receivables', bucket: '60+', amount: 20000, documents: 2 },
      { side: 'payables', bucket: 'current', amount: 85000, documents: 12 },
    ],
    utilization: [{ bucket: 'over_limit', parties: 1, amount: 50000 }],
    concentration: [
      { party_id: customer.party_id, party_name: customer.party_name, amount: 50000, share: 21 },
    ],
    collect_now: [
      {
        party_id: customer.party_id,
        party_name: customer.party_name,
        outstanding: 50000,
        credit_limit: 40000,
        oldest_due_date: '2026-09-07',
        days_overdue: 21,
        overdue_amount: 10000,
        reason: 'Over limit',
      },
    ],
    pay_soon: [
      {
        party_id: supplier.party_id,
        party_name: supplier.party_name,
        outstanding: 30000,
        due_amount: 30000,
        next_due_date: '2026-09-30',
        days_overdue: 0,
      },
    ],
    trend: [
      { day: '2026-09-27', receivables: 230000, payables: 80000 },
      { day: '2026-09-28', receivables: 240000, payables: 85000 },
    ],
  };
}

test('credit overview leads with aging and keeps profile filters in their own view', async ({
  page,
}) => {
  await mockOperationsApp(page, { insights: true });
  let healthRequests = 0;
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route => {
    healthRequests++;
    return route.fulfill({ json: creditHealthFixture() });
  });
  const requests: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route => {
    const filters = route.request().postDataJSON();
    requests.push(filters);
    const items = creditPortfolioFixture(filters.p_side).filter(
      profile =>
        (!filters.p_band || profile.band === filters.p_band) &&
        (!filters.p_overdue_only || profile.overdue_amount > 0) &&
        (!filters.p_search ||
          profile.party_name.toLowerCase().includes(filters.p_search.toLowerCase()))
    );
    return route.fulfill({ json: { items, nextCursor: null } });
  });
  for (const viewport of [...viewportCases, { name: 'wide desktop', width: 1600, height: 900 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const before = healthRequests;
    await page.goto('http://127.0.0.1:4203/insights/credit');
    if (viewport.largeText)
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
    const portfolio = page.locator('#credit-profiles');
    const health = page.getByRole('region', { name: 'Credit health summary' });
    const actions = page.getByRole('region', { name: 'Needs attention' });
    const analysis = page.getByRole('region', { name: 'Credit exposure insights' });
    const search = portfolio.getByRole('searchbox', { name: /^Search (customers|suppliers)$/ });
    const band = portfolio.getByRole('combobox', { name: 'Credit band', exact: true });
    const overdue = portfolio.getByRole('checkbox', { name: 'Overdue only' });
    await expect(health).toContainText('240,000');
    await expect(health).toContainText('85,000');
    await expect(health).toContainText('Owed to us');
    await expect(health).toContainText('We owe suppliers');
    await expect(actions.getByRole('heading', { name: 'Collect now' })).toBeVisible();
    await expect(actions.getByRole('heading', { name: 'Pay soon' })).toBeVisible();
    await expect(actions.getByRole('link', { name: /Jane Mwangi/ })).toHaveAttribute(
      'href',
      /customers\?customer=/
    );
    await expect(actions.getByRole('link', { name: /Acme Supplies/ })).toHaveAttribute(
      'href',
      /suppliers\?supplier=/
    );
    await expect(portfolio).toBeHidden();
    const boxes = await Promise.all(
      [health, analysis, actions].map(locator => locator.boundingBox())
    );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.y).toBeGreaterThanOrEqual(boxes[i - 1]!.y + boxes[i - 1]!.height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      ),
      viewport.name
    ).toBeLessThanOrEqual(1);
    await expect(health.locator('.credit-summary-item')).toHaveCount(4);
    for (const metric of await health.locator('.credit-summary-item').all()) {
      expect(await metric.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    for (const panel of await page
      .locator(
        'app-money-credit :is(.card, .credit-aging-row, .credit-action-row, .credit-trend-legend)'
      )
      .all()) {
      expect(
        await panel.evaluate(el => el.scrollWidth - el.clientWidth),
        `${viewport.name}: ${await panel.getAttribute('class')}`
      ).toBeLessThanOrEqual(2);
    }
    if (viewport.width === 1600) {
      expect((await health.boundingBox())!.height).toBeLessThan(150);
      expect(boxes[1]!.y).toBeLessThan(450);
    }
    await page.getByRole('button', { name: 'Find an account', exact: true }).click();
    await expect(page).toHaveURL(/view=profiles/);
    await expect(search).toBeFocused();
    await expect(search).toBeInViewport();
    await expect(page.locator('app-money-credit')).toBeHidden();
    if (viewport.width >= 1024 && !viewport.largeText) {
      const header = portfolio.locator('.data-table-header-band th');
      const cells = portfolio.locator('.data-table-viewport tbody tr').first().locator('td');
      await expect
        .poll(async () => {
          const widths = await header.evaluateAll(els =>
            els.map(el => el.getBoundingClientRect().width)
          );
          const body = await cells.evaluateAll(els =>
            els.map(el => el.getBoundingClientRect().width)
          );
          return (
            widths.length === body.length &&
            widths.every((width, index) => width > 0 && Math.abs(width - body[index]) <= 1)
          );
        })
        .toBe(true);
    }
    await expect(portfolio).toContainText('1–2 of 2 customer profiles');
    await expect(portfolio.getByRole('combobox', { name: 'Per page' })).toHaveValue('25');
    await expect(
      portfolio
        .getByRole('navigation', { name: 'Standings pagination top' })
        .getByRole('button', { name: 'Next', exact: true })
    ).toBeDisabled();
    await expect(band).toBeVisible();
    await expect(overdue).toBeVisible();
    await expect(
      portfolio.getByText('Advice never changes a limit automatically.', { exact: false })
    ).toBeVisible();
    await expect(portfolio.getByText('21 days overdue').filter({ visible: true })).toBeVisible();
    await expect(
      portfolio.getByText(/confidence · 12 settled documents/).filter({ visible: true })
    ).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      ),
      viewport.name
    ).toBeLessThanOrEqual(1);
    await band.selectOption('watch');
    await overdue.check();
    await expect
      .poll(() => requests.at(-1))
      .toMatchObject({ p_band: 'watch', p_overdue_only: true });
    await expect(portfolio).toContainText('1–1 of 1 customer profile');
    await portfolio.getByRole('link', { name: 'Back to overview', exact: true }).click();
    await expect(health).toContainText('240,000');
    await expect(actions.getByRole('link', { name: /Jane Mwangi/ })).toBeVisible();
    await page.getByRole('button', { name: 'Find an account', exact: true }).click();
    await expect(page).toHaveURL(/band=watch/);
    await expect(search).toBeFocused();
    await expect(band).toHaveValue('watch');
    await portfolio.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(band).toHaveValue('');
    await expect(overdue).not.toBeChecked();
    if (viewport.width < 768)
      await portfolio
        .getByRole('combobox', { name: 'Profile type', exact: true })
        .selectOption('supplier');
    else await portfolio.getByRole('tab', { name: 'Our supplier standing' }).click();
    await expect
      .poll(() => requests.at(-1))
      .toMatchObject({ p_side: 'supplier', p_overdue_only: false });
    await expect(portfolio).toContainText('1–2 of 2 supplier profiles');
    await search.fill('unmatched party');
    await expect(
      page.getByRole('heading', { name: 'No profiles match these filters' })
    ).toBeVisible();
    await expect(portfolio).toContainText('0 supplier profiles');
    expect(healthRequests - before).toBe(1);
  }
});

test('credit keeps profiles usable when business health fails and retries independently', async ({
  page,
}) => {
  await mockOperationsApp(page, { insights: true });
  let failHealth = true;
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    failHealth
      ? route.fulfill({ status: 500, json: { message: 'Credit health unavailable' } })
      : route.fulfill({ json: creditHealthFixture() })
  );
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route =>
    route.fulfill({
      json: { items: creditPortfolioFixture('customer'), nextCursor: null },
    })
  );
  await page.goto('http://127.0.0.1:4203/insights/credit');
  await expect(page.locator('#credit-profiles')).toContainText('1–2 of 2 customer profiles');
  await expect(page.getByRole('alert')).toContainText('Credit health unavailable');
  await page.getByRole('button', { name: 'Find an account', exact: true }).click();
  await expect(
    page.getByRole('searchbox', { name: /^Search (customers|suppliers)$/ })
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Credit view' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  failHealth = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Credit health summary' })).toContainText(
    '240,000'
  );
  await expect(page.locator('#credit-profiles')).toContainText('1–2 of 2 customer profiles');
});

test('credit shows zero exposure without blocking profile review', async ({ page }) => {
  await mockOperationsApp(page, { insights: true });
  const empty = creditHealthFixture();
  empty.metrics = {
    receivables: 0,
    payables: 0,
    overdue_receivables: 0,
    severe_receivables: 0,
    payables_due_soon: 0,
    over_limit_parties: 0,
    top_five_concentration: 0,
  };
  empty.aging = [];
  empty.utilization = [];
  empty.concentration = [];
  empty.collect_now = [];
  empty.pay_soon = [];
  empty.trend = [];
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    route.fulfill({ json: empty })
  );
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route =>
    route.fulfill({ json: { items: [], nextCursor: null } })
  );
  await page.goto('http://127.0.0.1:4203/insights/credit');
  await expect(page.getByRole('heading', { name: 'No outstanding credit' })).toBeVisible();
  await expect(page.locator('#credit-profiles')).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Credit health summary' }).locator('.credit-summary-item')
  ).toHaveCount(4);
  await expect(page.getByRole('region', { name: 'Credit exposure insights' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Find an account', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('searchbox', { name: /^Search (customers|suppliers)$/ })
  ).toBeFocused();
  await expect(
    page.getByRole('heading', { name: 'No customer credit profiles yet' })
  ).toBeVisible();
});

test('credit pagination, view switches and review returns retain pages and position', async ({
  page,
}) => {
  await mockOperationsApp(page, { insights: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  let profileRequests = 0;
  const profiles = Array.from({ length: 38 }, (_, index) => ({
    ...creditPortfolioFixture('customer')[0],
    party_id: `98000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    party_name: `Trade account ${String(index + 1).padStart(2, '0')}`,
    credit_limit: 60000,
    available_credit: 10000,
    opportunity_cost: 0,
  }));
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    route.fulfill({ json: creditHealthFixture() })
  );
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route => {
    profileRequests++;
    const { p_cursor, p_limit } = route.request().postDataJSON();
    const start = p_cursor ? profiles.findIndex(p => p.party_id === p_cursor) + 1 : 0;
    const items = profiles.slice(start, start + p_limit);
    return route.fulfill({
      json: {
        items,
        nextCursor: items.length === p_limit ? items.at(-1)!.party_id : null,
      },
    });
  });
  await page.route('**/rest/v1/rpc/party_credit_profile', route =>
    route.fulfill({
      json: profiles.find(p => p.party_id === route.request().postDataJSON().p_party_id),
    })
  );
  await page.goto('http://127.0.0.1:4203/insights/credit?view=profiles&band=watch&search=Trade');
  const portfolio = page.locator('#credit-profiles');
  const records = portfolio.locator('[data-list-record]:visible');
  const controls = portfolio.getByRole('navigation', { name: 'Standings pagination top' });
  await expect(records).toHaveCount(25);
  await expect(controls.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await expect(portfolio.locator('#credit-records')).toContainText('1–25 customer profiles');
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(records).toHaveCount(13);
  await expect(page).toHaveURL(/page=2/);
  await expect(portfolio.locator('#credit-records')).toContainText('26–38 of 38 customer profiles');
  await expect(controls.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await controls.getByRole('button', { name: 'Previous' }).click();
  await expect(records).toHaveCount(25);
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(records).toHaveCount(13);
  expect(profileRequests).toBe(2);
  await portfolio
    .getByRole('link', { name: 'Back to overview', exact: true })
    .scrollIntoViewIfNeeded();
  const savedY = await page.evaluate(() => window.scrollY);
  await portfolio.getByRole('link', { name: 'Back to overview', exact: true }).click();
  await expect(portfolio).toBeHidden();
  await page.getByRole('button', { name: '30d', exact: true }).click();
  await expect(page.getByRole('button', { name: '30d', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page
    .getByRole('navigation', { name: 'Credit view' })
    .getByRole('link', { name: 'Customer / supplier standings', exact: true })
    .click();
  await expect(records).toHaveCount(13);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(savedY - 10);
  await expect(portfolio.getByRole('searchbox')).toHaveValue('Trade');
  await expect(portfolio.getByRole('combobox', { name: 'Credit band', exact: true })).toHaveValue(
    'watch'
  );
  expect(profileRequests).toBe(2);
  const record = records.nth(8);
  await record.scrollIntoViewIfNeeded();
  await record.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade account 34', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Credit portfolio', exact: true }).click();
  await expect(records).toHaveCount(13);
  await expect(record).toBeInViewport();
  expect(profileRequests).toBe(2);
  await record.getByRole('link', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade account 34', exact: true })).toBeVisible();
  await page.goBack();
  await expect(records).toHaveCount(13);
  await expect(record).toBeInViewport();
  expect(profileRequests).toBe(2);
});

test('credit page size, filters, final pages and failed navigation keep useful records', async ({
  page,
}) => {
  await mockOperationsApp(page, { insights: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const profiles = Array.from({ length: 50 }, (_, index) => ({
    ...creditPortfolioFixture('customer')[0],
    party_id: `98000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    party_name: `Account ${String(index + 1).padStart(2, '0')}`,
    band: index < 10 ? 'watch' : 'good',
  }));
  let failNext = false;
  const requests: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    route.fulfill({ json: creditHealthFixture() })
  );
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route => {
    const filters = route.request().postDataJSON();
    requests.push(filters);
    if (failNext && filters.p_cursor)
      return route.fulfill({ status: 500, json: { message: 'Temporary profiles failure' } });
    const matching = profiles.filter(p => !filters.p_band || p.band === filters.p_band);
    const start = filters.p_cursor
      ? matching.findIndex(p => p.party_id === filters.p_cursor) + 1
      : 0;
    const items = matching.slice(start, start + filters.p_limit);
    return route.fulfill({
      json: {
        items,
        nextCursor: items.length === filters.p_limit ? items.at(-1)!.party_id : null,
      },
    });
  });
  await page.goto('http://127.0.0.1:4203/insights/credit?view=profiles');
  const portfolio = page.locator('#credit-profiles');
  const records = portfolio.locator('[data-list-record]:visible');
  const top = portfolio.getByRole('navigation', { name: 'Standings pagination top' });
  const bottom = portfolio.getByRole('navigation', { name: 'Standings pagination bottom' });
  const size = portfolio.getByRole('combobox', { name: 'Per page' });
  await expect(records).toHaveCount(25);
  await expect(size).toHaveValue('25');
  failNext = true;
  await bottom.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(portfolio.getByRole('alert')).toBeVisible();
  await expect(records).toHaveCount(25);
  await expect(records.first()).toContainText('Account 01');
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  failNext = false;
  await portfolio.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(records.first()).toContainText('Account 26');
  await expect(page).toHaveURL(/page=2/);
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(portfolio.locator('#credit-records')).toContainText('26–50 of 50 customer profiles');
  await expect(top).toBeInViewport();

  await size.selectOption('10');
  await expect(records).toHaveCount(10);
  await expect(records.first()).toContainText('Account 01');
  await expect(page).toHaveURL(/pageSize=10/);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await top.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(records.first()).toContainText('Account 11');
  await portfolio.getByRole('combobox', { name: 'Credit band', exact: true }).selectOption('watch');
  await expect(records.first()).toContainText('Account 01');
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(portfolio.locator('#credit-records')).toContainText('1–10 of 10 customer profiles');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await portfolio.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await size.selectOption('100');
  await expect(records).toHaveCount(50);
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(
    requests.every(request => Number(request.p_limit) > 0 && Number(request.p_limit) <= 100)
  ).toBe(true);

  // Shared/reloaded URLs refetch the requested page and clamp when records disappear.
  await page.goto('http://127.0.0.1:4203/insights/credit?view=profiles&pageSize=10&page=3');
  await expect(records.first()).toContainText('Account 21');
  await expect(records).toHaveCount(10);
  await page.goto('http://127.0.0.1:4203/insights/credit?view=profiles&pageSize=10&page=99');
  await expect(top).toContainText('Page 5');
  await expect(records.first()).toContainText('Account 41');
  await expect(page).toHaveURL(/page=5(?:&|$)/);
  await expect(top.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
});

test('credit pagination rejects stale filter responses', async ({ page }) => {
  await mockOperationsApp(page, { insights: true });
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    route.fulfill({ json: creditHealthFixture() })
  );
  let releaseOld!: () => void;
  const oldResponse = new Promise<void>(resolve => (releaseOld = resolve));
  let requestedOld!: () => void;
  const oldRequest = new Promise<void>(resolve => (requestedOld = resolve));
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', async route => {
    const filters = route.request().postDataJSON();
    if (filters.p_band === 'watch') {
      requestedOld();
      await oldResponse;
    }
    return route.fulfill({
      json: {
        items: creditPortfolioFixture('customer').filter(
          p => !filters.p_band || p.band === filters.p_band
        ),
        nextCursor: null,
      },
    });
  });
  await page.goto('http://127.0.0.1:4203/insights/credit?view=profiles');
  const portfolio = page.locator('#credit-profiles');
  const records = portfolio.locator('[data-list-record]:visible');
  const band = portfolio.getByRole('combobox', { name: 'Credit band', exact: true });
  await expect(records).toHaveCount(2);
  await band.selectOption('watch');
  await oldRequest;
  await expect(records).toHaveCount(2);
  await expect(portfolio.getByRole('status')).toContainText('Updating profiles');
  await band.selectOption('good');
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText('Alex Otieno');
  const response = page.waitForResponse(
    res =>
      res.url().includes('list_party_credit_profiles') &&
      res.request().postDataJSON().p_band === 'watch'
  );
  releaseOld();
  await response;
  await expect(records.first()).toContainText('Alex Otieno');
  await expect(band).toHaveValue('good');
  await expect(page).toHaveURL(/band=good/);
});

test('credit legacy filtered URLs open profiles and overview keeps healthy risk compact', async ({
  page,
}) => {
  await mockOperationsApp(page, { insights: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  const health = creditHealthFixture();
  health.metrics.over_limit_parties = 0;
  health.utilization = [{ bucket: 'under_50', parties: 37, amount: 240000 }];
  health.concentration = Array.from({ length: 5 }, (_, index) => ({
    ...health.concentration[0],
    party_id: `party-${index}`,
    party_name: `Largest account ${index + 1}`,
    share: 12,
  }));
  await page.route('**/rest/v1/rpc/credit_health_dashboard', route =>
    route.fulfill({ json: health })
  );
  await page.route('**/rest/v1/rpc/list_party_credit_profiles', route =>
    route.fulfill({ json: { items: creditPortfolioFixture('supplier'), nextCursor: null } })
  );
  await page.goto('http://127.0.0.1:4203/insights/credit?side=supplier&overdue=true');
  await expect(page.locator('#credit-profiles')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Overdue only' })).toBeChecked();
  await page
    .getByRole('navigation', { name: 'Credit view' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  const utilization = page.getByRole('region', { name: 'Limit utilization' });
  const concentration = page.getByRole('region', { name: 'Largest balances' });
  await expect(utilization).toContainText('37 accounts');
  await expect(concentration.getByRole('link')).toHaveCount(5);
  expect((await utilization.boundingBox())!.height).toBeLessThan(
    (await concentration.boundingBox())!.height - 80
  );
});

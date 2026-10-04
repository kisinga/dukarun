import { expect, test, type Page } from '../fixtures/mocked-browser';
import { mockSaleReceipt, mockSellWorkspace, sellVariants } from '../fixtures/sell-workspace';

async function assertContained(page: Page) {
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll('app-sell *')]
      .filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 8)
      .map(el => ({
        tag: el.tagName,
        class: el.className,
        right: el.getBoundingClientRect().right,
      })),
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.offenders).toEqual([]);
}

async function openSale(
  page: Page,
  width = 390,
  options: Parameters<typeof mockSellWorkspace>[1] = {}
) {
  await page.setViewportSize({ width, height: width >= 768 ? 720 : 844 });
  const fixture = await mockSellWorkspace(page, options);
  await page.goto('http://127.0.0.1:4203/pos/sell');
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await expect(page.getByRole('button', { name: /Biriyani/ }).first()).toBeVisible();
  return fixture;
}

for (const [phone, desktop] of [
  [320, 768],
  [390, 1024],
  [412, 1280],
]) {
  for (const theme of ['light', 'dark']) {
    test(`Sell catalogue contains grid, list, categories and search at ${phone}/${desktop}px in ${theme}`, async ({
      page,
      isMobile,
    }) => {
      const width = isMobile ? phone : desktop;
      await page.addInitScript(theme => localStorage.setItem('dukarun-theme', theme), theme);
      await openSale(page, width);
      await assertContained(page);
      const cards = page
        .locator('app-sell-catalog-panel .grid > button')
        .filter({ hasText: 'Biriyani' });
      await cards.click();
      await expect(page.locator('app-sell-cart-line')).toHaveCount(1);
      await assertContained(page);
      await page.getByRole('button', { name: 'List view', exact: true }).click();
      await assertContained(page);
      await page.getByRole('button', { name: 'Categories view', exact: true }).click();
      await page.getByRole('button', { name: /Meals.*products/ }).click();
      await expect(
        page.locator('app-sell-catalog-panel').getByRole('button', { name: /Biriyani/ })
      ).toBeVisible();
      await assertContained(page);
      await page.getByLabel('Search products or scan barcode', { exact: true }).fill('family');
      await expect(
        page.locator('app-sell-catalog-panel').getByRole('button', { name: /Special family/ })
      ).toBeVisible();
      await assertContained(page);
      await page.getByRole('button', { name: 'Grid view', exact: true }).click();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Grid view', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await assertContained(page);
    });
  }
}

for (const [phone, desktop] of [
  [320, 1280],
  [390, 1600],
]) {
  test(`Cart price changes preserve row and control geometry at ${phone}/${desktop}px`, async ({
    page,
    isMobile,
  }) => {
    const width = isMobile ? phone : desktop;
    await openSale(page, width);
    await page
      .locator('app-sell-catalog-panel')
      .getByRole('button', { name: /Biriyani/ })
      .click();
    const line = page.locator('app-sell-cart-line');
    const geometry = () =>
      line.evaluate(el => {
        const origin = el.getBoundingClientRect();
        const rect = (selector: string) => {
          const r = el.querySelector(selector)!.getBoundingClientRect();
          return { x: r.x - origin.x, y: r.y - origin.y, height: r.height };
        };
        return {
          row: rect('.sale-line'),
          price: rect('.sale-price-control'),
          quantity: rect('.sale-quantity'),
          remove: rect('.sale-line-remove'),
        };
      });
    await line.scrollIntoViewIfNeeded();
    const before = await geometry();
    await line.getByRole('button', { name: 'Increase price of Biriyani' }).click();
    await expect(line.locator('.sale-line-total')).toContainText('402');
    const compare = async () => {
      const after = await geometry();
      for (const key of ['row', 'price', 'quantity', 'remove'] as const) {
        for (const dimension of ['x', 'y', 'height'] as const)
          expect(Math.abs(after[key][dimension] - before[key][dimension])).toBeLessThanOrEqual(1);
      }
    };
    await compare();
    await line.getByRole('button', { name: 'Reset price', exact: true }).click();
    await compare();
    await line.getByRole('button', { name: 'Edit price for Biriyani' }).click();
    await page.getByRole('textbox', { name: 'Unit price (KES)' }).fill('415');
    await page.getByRole('button', { name: 'Apply price', exact: true }).click();
    await compare();
    await assertContained(page);
  });
}

test('Packed long-name lines retain disclosure, touch targets and exact-price editing', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1600, height: 844 });
  await mockSellWorkspace(page);
  const variant = {
    ...sellVariants[0],
    product_name: 'Breakfast tea · Premium selection',
    variant_name: 'Premium selection',
    manufacturer_name: 'Kenya Tea Packers',
    stock_unit: 'pack',
    packs: [
      {
        id: '97000000-0000-4000-8000-000000000088',
        name: 'Premium selection',
        units_per_pack: 4,
        sale_price: 225,
        barcode: null,
        active: true,
      },
    ],
  };
  await page.route('**/rest/v1/rpc/catalog_cache_page', route =>
    route.fulfill({ json: [variant] })
  );
  await page.goto('http://127.0.0.1:4203/pos/sell');
  await page.getByRole('button', { name: 'Grid view', exact: true }).click();
  await page
    .locator('app-sell-catalog-panel')
    .getByRole('button', { name: /Breakfast tea/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Sell as', exact: true })
    .getByRole('button', { name: /Premium selection.*KES 225/ })
    .click();
  const line = page.locator('app-sell-cart-line');
  const offset = await line.evaluate(el => {
    const title = el.querySelector('.sale-product-title')!.getBoundingClientRect();
    const caret = el.querySelector('.sale-details-caret')!.getBoundingClientRect();
    return Math.abs(title.top + title.height / 2 - caret.top - caret.height / 2);
  });
  expect(offset).toBeLessThanOrEqual(1);
  const heading = line.getByRole('button', { name: /Details for/ });
  await heading.focus();
  await page.keyboard.press('Enter');
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
  await expect(line.locator('.sale-line-details')).toContainText('Kenya Tea Packers');
  await page.keyboard.press('Enter');
  await expect(heading).toHaveAttribute('aria-expanded', 'false');
  await line.getByRole('button', { name: /Increase price/ }).click();
  await expect(line.getByRole('button', { name: 'Reset price', exact: true })).toBeVisible();
  const unit = await line.getByRole('button', { name: /Change selling unit/ }).boundingBox();
  expect(unit!.width).toBeGreaterThanOrEqual(44);
  expect(unit!.height).toBeGreaterThanOrEqual(44);
  await line.getByRole('button', { name: 'Reset price', exact: true }).click();
  await line.getByRole('button', { name: /Edit price/ }).click();
  const editor = page.getByRole('group', { name: 'Set exact unit price', exact: true });
  await editor.getByRole('textbox', { name: 'Unit price (KES)' }).fill('237');
  await editor.getByRole('textbox', { name: /Reason/ }).fill('Damaged packaging');
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(line.locator('.sale-line-total')).toContainText('225');
  await line.getByRole('button', { name: /Edit price/ }).click();
  await editor.getByRole('textbox', { name: 'Unit price (KES)' }).fill('237');
  await editor.getByRole('textbox', { name: /Reason/ }).fill('Damaged packaging');
  await assertContained(page);
  await editor.getByRole('button', { name: 'Apply price', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(line.locator('.sale-line-total')).toContainText('237');
  await heading.click();
  await expect(line.locator('.sale-line-details')).toContainText('Damaged packaging');
  await assertContained(page);
});

test('Delivery summary preserves save, cancel, fee and COD behavior', async ({
  page,
  isMobile,
}) => {
  const width = isMobile ? 320 : 1280;
  await openSale(page, width);
  await page
    .locator('app-sell-catalog-panel')
    .getByRole('button', { name: /Biriyani/ })
    .click();
  await page.getByRole('button', { name: 'Delivery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delivery details', exact: true });
  await dialog.locator('[data-checkout-field="recipient"]').fill('Amina Hassan');
  await dialog.locator('[data-checkout-field="phone"]').fill('0712345678');
  await dialog
    .locator('[data-checkout-field="address"]')
    .fill('Parklands, 3rd Avenue\nGate 12, first floor');
  await dialog.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('app-sell-cart-line')).toHaveCount(2);
  const summary = page.locator('app-fulfillment-checkout-method');
  await expect(summary).toContainText('Gate 12, first floor');
  await expect(summary).toContainText('Pay before delivery');
  await summary.getByRole('button', { name: 'Edit order details' }).click();
  await dialog.locator('[data-checkout-field="address"]').fill('Unsaved address');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('alertdialog', { name: 'Discard changes?' })
    .getByRole('button', { name: 'Discard', exact: true })
    .click();
  await expect(summary).toContainText('Gate 12, first floor');
  await expect(summary).not.toContainText('Unsaved address');
  await summary.getByRole('button', { name: 'Edit order details' }).click();
  await dialog.getByRole('combobox', { name: 'Payment timing' }).selectOption('cod');
  await expect(dialog.getByRole('checkbox', { name: /Save as customer/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Place COD order', exact: true }).filter({ visible: true })
  ).toBeEnabled();
  await expect(summary).toContainText('Collect on delivery');
  await expect(page.locator('app-sell-cart-line')).toHaveCount(2);
  await page.getByRole('button', { name: 'Counter', exact: true }).click();
  await expect(page.locator('app-sell-cart-line')).toHaveCount(1);
  await expect(summary).not.toContainText('Delivery details');
  await page.getByRole('button', { name: 'Pickup', exact: true }).click();
  const pickup = page.getByRole('dialog', { name: 'Pickup details', exact: true });
  await expect(pickup.locator('[data-checkout-field="address"]')).toHaveCount(0);
  await pickup.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(summary).toContainText('Pickup details');
  await assertContained(page);
});

test('Mobile dock clears the last action and follows the current sale anchor', async ({ page }) => {
  await openSale(page, 390, { fulfillment: false });
  await page
    .locator('app-sell-catalog-panel')
    .getByRole('button', { name: /Biriyani/ })
    .click();
  await page.getByRole('link', { name: /View current sale/ }).click();
  await expect(page.locator('#current-sale')).toBeInViewport();
  await expect(page.locator('#current-sale')).toBeFocused();
  expect(
    await page
      .getByRole('heading', { name: 'Current sale', exact: true })
      .evaluate(el => el.getBoundingClientRect().top)
  ).toBeGreaterThanOrEqual(64);
  await expect(page.locator('app-fulfillment-checkout-method')).not.toContainText('Order method');
  await page.getByRole('button', { name: 'Save proforma', exact: true }).scrollIntoViewIfNeeded();
  const geometry = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const action = document
      .querySelector('app-sell-checkout-workspace aside button')!
      .getBoundingClientRect();
    const dock = document
      .querySelector('[data-testid="sell-payment-dock"]')!
      .getBoundingClientRect();
    return { actionBottom: action.bottom, dockTop: dock.top };
  });
  expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.dockTop);
  await assertContained(page);
});

test('Large text, credit actions and a short viewport retain reachable checkout controls', async ({
  page,
}) => {
  await openSale(page, 390, { credit: true });
  await page
    .locator('app-sell-catalog-panel')
    .getByRole('button', { name: /Biriyani/ })
    .click();
  await page.getByLabel('Search customers', { exact: true }).fill('Amina');
  await page
    .locator('app-sell-customer-context li button')
    .filter({ hasText: 'Amina Hassan' })
    .click();
  const dock = page.getByTestId('sell-payment-dock');
  await expect(dock.getByRole('button', { name: 'Sell on credit', exact: true })).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = '20px'));
  await assertContained(page);
  await page.getByRole('button', { name: 'Delivery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delivery details', exact: true });
  await dialog.locator('[data-checkout-field="address"]').focus();
  await page.setViewportSize({ width: 390, height: 430 });
  await expect(dialog.locator('[data-checkout-field="recipient"]')).toHaveValue('Amina Hassan');
  await expect(dialog.locator('[data-checkout-field="address"]')).toHaveValue(
    'Parklands, 3rd Avenue\nGate 12, first floor'
  );
  await dialog.locator('[data-checkout-field="address"]').fill('A changed saved address');
  await dialog.getByRole('combobox', { name: 'Payment timing' }).selectOption('cod');
  const saveAddress = dialog.getByRole('checkbox', { name: /Use this address next time/ });
  await expect(saveAddress).toBeChecked();
  await expect(saveAddress).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Save details', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(dock.getByRole('button', { name: 'Sell on credit', exact: true })).toHaveCount(0);
  await expect(dock.getByRole('button', { name: 'Place COD order', exact: true })).toBeInViewport();
  await assertContained(page);
});

test('A tall delivery summary uses document flow while a compact desktop summary stays sticky on scroll', async ({
  page,
}) => {
  await openSale(page, 1600);
  const workspace = page.locator('app-sell-checkout-workspace');
  await expect(workspace).toHaveClass(/checkout-fits/);
  await expect(workspace).toHaveCSS('position', 'sticky');
  for (const name of [/Biriyani/, /Chicken pilau/, /Fresh mango juice/, /Chapati/]) {
    await page.locator('app-sell-catalog-panel').getByRole('button', { name }).click();
  }
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect
    .poll(() => workspace.evaluate(el => Math.round(el.getBoundingClientRect().top)))
    .toBe(72);
  await expect(workspace.getByLabel('Search customers', { exact: true })).toBeInViewport();
  await expect(
    workspace.getByRole('button', { name: 'Take payment', exact: true }).filter({ visible: true })
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Delivery', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delivery details', exact: true });
  await dialog.locator('[data-checkout-field="recipient"]').fill('Amina Hassan');
  await dialog.locator('[data-checkout-field="phone"]').fill('0712345678');
  await dialog
    .locator('[data-checkout-field="address"]')
    .fill('Parklands, third avenue. '.repeat(18));
  await dialog.getByRole('button', { name: 'Save details', exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 360 });
  await expect(workspace).not.toHaveClass(/checkout-fits/);
  await expect(workspace).toHaveCSS('position', 'static');
  const payment = workspace
    .getByRole('button', { name: 'Take payment', exact: true })
    .filter({ visible: true });
  await payment.scrollIntoViewIfNeeded();
  await expect(payment).toBeInViewport();
  await assertContained(page);
});

test('Manufacturer metadata shows names when available and a tooltip icon when missing', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: isMobile ? 320 : 1600, height: 720 });
  await mockSellWorkspace(page);
  await page.route('**/rest/v1/rpc/catalog_cache_page', route =>
    route.fulfill({
      json: sellVariants.map((v, i) => ({
        ...v,
        manufacturer_name: i === 0 ? 'Coastal Kitchen' : null,
      })),
    })
  );
  await page.goto('http://127.0.0.1:4203/pos/sell');
  const catalog = page.locator('app-sell-catalog-panel');
  for (const view of ['Grid view', 'List view']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await expect(catalog.getByText('Coastal Kitchen', { exact: true })).toBeVisible();
    const product = catalog.getByRole('button', { name: /Chicken pilau/ });
    const icon = product.getByRole('img', { name: 'Manufacturer not set' });
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute('title', 'Manufacturer not set');
    await expect(product).not.toContainText('Manufacturer not set');
    await product.focus();
    await expect(product).toBeFocused();
    await assertContained(page);
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('app-sell-cart-line')).toHaveCount(1);
});

for (const entry of ['sell', 'cashier']) {
  test(`Completed ${entry} payment opens the shared receipt and supports close/reopen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockSellWorkspace(page, { cashier: entry === 'cashier' });
    const { submissions } = await mockSaleReceipt(page, entry === 'cashier');
    await page.goto(`http://127.0.0.1:4203/pos/${entry}`);
    if (entry === 'sell') {
      await page.getByRole('button', { name: 'Grid view', exact: true }).click();
      await page
        .locator('app-sell-catalog-panel')
        .getByRole('button', { name: /Biriyani/ })
        .click();
      await page
        .getByRole('button', { name: 'Take payment', exact: true })
        .filter({ visible: true })
        .click();
    } else {
      await page
        .getByRole('button', { name: /Collect payment|Take payment/ })
        .filter({ visible: true })
        .first()
        .click();
    }
    await page.getByRole('button', { name: 'Complete sale', exact: true }).click();
    const receipt = page.getByRole('dialog', { name: 'Send receipt', exact: true });
    await expect(receipt).toBeVisible();
    expect(submissions).toHaveLength(1);
    await expect(receipt).toContainText('Sale completed');
    await expect(receipt.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
    await expect(
      receipt.getByRole('button', { name: 'Send PDF via WhatsApp', exact: true })
    ).toBeDisabled();
    await receipt.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(receipt).not.toBeVisible();
    await page
      .getByRole('button', {
        name: entry === 'cashier' ? 'Receipt options' : 'Print receipt',
        exact: true,
      })
      .click();
    await expect(receipt).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(receipt).not.toBeVisible();
  });
}

test('Receipt loading, correction, uncertain resend and printing retain independent actions', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: isMobile ? 390 : 1280, height: 650 });
  await mockSellWorkspace(page);
  const { order } = await mockSaleReceipt(page);
  await page.route('**/rest/v1/orders*', route =>
    route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? order : [order],
      headers: { 'content-range': '0-0/1' },
    })
  );
  const contact = {
    id: '97000000-0000-4000-8000-000000000005',
    first_name: 'Amina',
    last_name: 'Hassan',
    phone: '+254712345678',
    is_verified: false,
    customer_origin: 'receipt',
    updated_at: new Date().toISOString(),
  };
  let fail = true;
  let release!: () => void;
  const loading = new Promise<void>(resolve => (release = resolve));
  let delivery: {
    id: string;
    state: string;
    recipient: string;
    sent_at: null;
    error: null;
  } | null = null;
  await page.route('**/rest/v1/rpc/sale_document_context', async route => {
    if (fail) {
      await loading;
      return route.fulfill({ status: 503, json: { message: 'Contact details unavailable' } });
    }
    return route.fulfill({
      json: {
        order_id: order.id,
        document_number: order.code,
        total: order.total,
        paid: order.total,
        balance: 0,
        document_type: 'receipt',
        eligible: true,
        has_customer: true,
        customer: contact,
        can_correct_number: true,
        delivery,
      },
    });
  });
  let corrections = 0;
  await page.route('**/rest/v1/rpc/correct_receipt_customer_phone', route => {
    corrections++;
    contact.phone = route.request().postDataJSON().p_phone;
    return route.fulfill({ json: contact });
  });
  const sends: { request_key: string }[] = [];
  await page.route('**/functions/v1/sale-document-send', route => {
    sends.push(route.request().postDataJSON());
    delivery = {
      id: 'job-1',
      state: 'queued',
      recipient: contact.phone,
      sent_at: null,
      error: null,
    };
    return route.fulfill({ json: { outbox_id: 'job-1', state: 'queued' } });
  });
  await page.goto('http://127.0.0.1:4203/orders');
  if (isMobile) await page.getByRole('button', { name: /SALE-POLISH-1 Completed/ }).click();
  const trigger = page.getByRole('button', { name: 'Receipt or invoice', exact: true }).first();
  await trigger.click();
  const dialog = page.locator('app-sale-document-modal dialog');
  await expect(dialog).toContainText('Loading customer details');
  await expect(dialog.locator('.receipt-panel')).toHaveCSS('animation-name', 'none');
  await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
  release();
  await expect(dialog.getByRole('alert')).toContainText('Contact details unavailable');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(trigger).toBeFocused();
  fail = false;
  await trigger.click();
  await expect(dialog).toContainText('Amina Hassan');
  await dialog.getByRole('button', { name: 'Correct number', exact: true }).click();
  await dialog.getByLabel('Correct phone number').fill('0798765432');
  await dialog.getByRole('button', { name: 'Update customer number', exact: true }).click();
  await expect(dialog).toContainText('+254798765432');
  expect(corrections).toBe(1);
  await dialog.getByRole('button', { name: 'Send PDF via WhatsApp', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Queued');
  await expect(dialog.getByRole('button', { name: 'Send PDF again via WhatsApp' })).toBeDisabled();
  expect(sends).toHaveLength(1);
  delivery!.state = 'unknown';
  await expect(dialog.getByRole('status')).toContainText('Delivery outcome unknown');
  await dialog.getByRole('button', { name: 'Send PDF again via WhatsApp' }).click();
  expect(sends).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Send another PDF', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Queued');
  expect(sends).toHaveLength(2);
  expect(sends[1].request_key).not.toBe(sends[0].request_key);
  await dialog.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.frameLocator('#print-frame').locator('body')).toContainText(order.code);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(trigger).toBeFocused();
});

import { expect, test, type Page } from '../fixtures/mocked-browser';

const origin = 'http://127.0.0.1:4202';
async function complete(page: Page) {
  await page.getByLabel('Business type', { exact: true }).fill('Electricals shop');
  await page.getByLabel('Locations', { exact: true }).selectOption('1');
  await page.getByLabel('Staff besides you').selectOption('1–3');
  await page.getByLabel('What would you like to improve?').selectOption('Stock');
  await page.getByLabel('How do you keep records today?').selectOption('Notebook');
  await page.getByLabel('When would you like to start?').selectOption('Within 30 days');
  await page.getByLabel('What help might you need?').selectOption('Self-start');
}

async function captureBlogEvents(page: Page, reject = false) {
  const events: unknown[][] = [];
  await page.exposeFunction('captureBlogEvent', (event: unknown[]) => events.push(event));
  await page.evaluate(reject => {
    const debug = window as unknown as {
      ng: {
        getComponent(el: Element): { blog: { recordEvent: (...args: unknown[]) => Promise<void> } };
      };
      captureBlogEvent: (args: unknown[]) => Promise<void>;
    };
    debug.ng.getComponent(document.querySelector('app-blog-article')!).blog.recordEvent = async (
      ...args: unknown[]
    ) => {
      await debug.captureBlogEvent(args);
      if (reject) throw new Error('Analytics offline');
    };
  }, reject);
  return events;
}
for (const width of [360, 390, 768, 1440]) {
  test(`homepage to qualified WhatsApp enquiry is readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?utm_source=owner-group&utm_campaign=october`);
    const hero = page.locator('app-marketing-home');
    const evidence = page.locator('app-workflow-evidence');
    await evidence.scrollIntoViewIfNeeded();
    for (const image of await evidence.locator('img').all()) {
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await hero.getByRole('link', { name: 'Request a demo', exact: true }).first().click();
    await expect(page).toHaveURL(/contact\?intent=demo/);
    await expect(page.getByRole('radio', { name: 'Request a demo' })).toBeChecked();
    await page.getByRole('button', { name: 'Continue on WhatsApp' }).click();
    await expect(page.getByLabel('Business type', { exact: true })).toBeFocused();
    await expect(page.getByText('Enter your business type.')).toBeVisible();
    await complete(page);
    await page.getByRole('radio', { name: 'Setup quote' }).check();
    await page.getByText('Preview your WhatsApp message', { exact: true }).click();
    await expect(page.locator('form pre')).toContainText('setup and staff training quote');
    await expect(page.locator('form pre')).toContainText('Campaign source: owner-group');
    await page.evaluate(() => {
      window.open = (url?: string | URL) => {
        (window as unknown as { prepared: string }).prepared = String(url);
        return null;
      };
    });
    await page.getByRole('button', { name: 'Continue on WhatsApp' }).click();
    const url = await page.evaluate(() => (window as unknown as { prepared: string }).prepared);
    expect(new URL(url).hostname).toBe('wa.me');
    expect(new URL(url).searchParams.get('text')).toContain('Business type: Electricals shop');
    expect(page.url()).not.toContain('Electricals');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
  });
}
for (const width of [360, 1440]) {
  test(`electricals counter updates stock once and resets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?utm_source=owner-group`);
    const demo = page.locator('#how-it-works');
    const bulb = demo.getByRole('button', { name: 'Add LED bulb 9 W for KES 250', exact: true });
    const socket = demo.getByRole('button', {
      name: 'Add 13 A double socket for KES 450',
      exact: true,
    });
    await expect(bulb).toBeEnabled();
    const writes: string[] = [];
    page.on('request', request => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url());
    });
    await expect(demo).toContainText('KES 1,900');
    await socket.click();
    await expect(demo).toContainText('KES 2,350');
    await demo.getByRole('button', { name: 'Remove one 13 A double socket', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(demo).toContainText('KES 1,900');
    await demo.getByRole('button', { name: 'Record sample M-Pesa sale', exact: true }).click();
    await expect(demo.getByRole('status')).toContainText('Stock updated above');
    await expect(bulb).toContainText('27 in stock');
    await expect(bulb).toHaveAccessibleDescription('27 in stock');
    await expect(socket).toContainText('16 in stock');
    await expect(bulb).toBeDisabled();
    await expect(
      demo.getByRole('button', { name: 'Record sample M-Pesa sale', exact: true })
    ).toHaveCount(0);
    await demo.getByRole('button', { name: 'Reset sample sale', exact: true }).click();
    await expect(bulb).toContainText('31 in stock');
    await expect(socket).toContainText('18 in stock');
    await expect(demo).toContainText('KES 1,900');
    for (let i = 0; i < 27; i++) await bulb.click();
    await expect(bulb).toBeDisabled();
    await demo.getByRole('button', { name: 'Record sample M-Pesa sale', exact: true }).click();
    await expect(bulb).toContainText('0 in stock');
    expect(writes).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    await demo.getByRole('link', { name: 'Request a demo for my shop', exact: true }).click();
    const url = new URL(page.url());
    expect(url.pathname).toBe('/contact');
    expect(url.searchParams.get('intent')).toBe('demo');
    expect(url.searchParams.get('from')).toBe('/');
    expect(url.searchParams.get('utm_source')).toBe('owner-group');
  });
}
test('article to cash-up to WhatsApp preserves attribution without sending financial figures', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url() + (r.postData() ?? '')));
  const from = '/blog/how-to-reconcile-cash-mpesa-shop';
  await page.goto(
    `${origin}${from}?utm_source=whatsapp&utm_medium=owner-group&utm_campaign=cash-up`
  );
  await expect(page.locator('app-blog-article h1')).toBeVisible();
  const events = await captureBlogEvents(page);
  await page.getByRole('link', { name: 'Open the free cash-up tool', exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/daily-shop-cash-up\?/);
  const source = new URL(page.url()).searchParams;
  const blogRef = source.get('blog_ref');
  expect(source.get('from')).toBe(from);
  expect(source.get('utm_source')).toBe('whatsapp');
  expect(source.get('utm_medium')).toBe('owner-group');
  expect(source.get('utm_campaign')).toBe('cash-up');
  expect(blogRef).toMatch(/^[0-9a-f-]{36}$/);
  expect(events.find(event => event[1] === 'cta_click')?.[2]).toMatchObject({
    action: 'cash-up',
    placement: 'article_body',
    utm_source: 'whatsapp',
  });
  expect(events.find(event => event[1] === 'cta_click')?.[3]).toBe(blogRef);
  await page.locator('#cash-up-cashSales').fill('98765');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('#cash-up-actualClosingCash').fill('98765');
  await page.getByRole('button', { name: 'See closing result' }).click();
  const link = page.getByRole('link', { name: 'Request a demo for your shop', exact: true });
  const setup = page.getByRole('link', { name: 'I need setup and training', exact: true });
  for (const action of [link, setup]) {
    const href = new URL((await action.getAttribute('href'))!, origin);
    expect(href.searchParams.get('blog_ref')).toBe(blogRef);
    expect(href.searchParams.get('from')).toBe(from);
    expect(href.searchParams.get('utm_campaign')).toBe('cash-up');
    expect(href.toString()).not.toContain('98765');
  }
  await link.click();
  await expect(page).toHaveURL(/contact/);
  await complete(page);
  await page.getByText('Preview your WhatsApp message', { exact: true }).click();
  const preview = page.locator('form pre');
  await expect(preview).toContainText(`Source: ${from}`);
  await expect(preview).toContainText(`Blog reference: ${blogRef}`);
  await expect(preview).toContainText('Campaign source: whatsapp');
  await expect(preview).toContainText('Campaign medium: owner-group');
  await expect(preview).toContainText('Campaign: cash-up');
  await expect(preview).not.toContainText('98765');
  expect(requests.join('\n')).not.toContain('98765');
  expect(JSON.stringify(events)).not.toContain('98765');
});

test('qualification controls have a usable keyboard order and visible focus', async ({ page }) => {
  await page.goto(`${origin}/contact?intent=setup`);
  const business = page.getByLabel('Business type', { exact: true });
  await business.focus();
  await page.keyboard.press('Tab');
  const locations = page.getByLabel('Locations', { exact: true });
  await expect(locations).toBeFocused();
  await expect(business).toHaveAttribute('aria-invalid', 'true');
  expect(await locations.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Staff besides you')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('What would you like to improve?')).toBeFocused();
});

test('prerendered qualification cannot submit private answers before JavaScript is ready', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${origin}/contact`);
  await expect(page.getByLabel('Business type', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Locations', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue on WhatsApp' })).toBeDisabled();
  expect(
    await page
      .locator('form input:not([type="radio"]), form select')
      .evaluateAll(controls => controls.every(control => !control.hasAttribute('name')))
  ).toBe(true);
  await expect(page.getByRole('link', { name: 'hello@dukarun.com', exact: true })).toBeVisible();
  await context.close();
});
test('article demo and modified registration links preserve campaign and blog attribution', async ({
  page,
  context,
}) => {
  await page.goto(
    `${origin}/blog/how-to-track-stock-small-shop-kenya?utm_source=group&utm_campaign=stock`
  );
  const demo = page.getByRole('link', { name: 'See the sale-to-stock workflow', exact: true });
  await demo.click();
  await expect(page).toHaveURL(/contact\?intent=demo/);
  const url = new URL(page.url());
  expect(url.searchParams.get('from')).toBe('/blog/how-to-track-stock-small-shop-kenya');
  expect(url.searchParams.get('utm_source')).toBe('group');
  expect(url.searchParams.get('blog_ref')).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto(`${origin}/blog/how-to-track-stock-small-shop-kenya?utm_source=group`);
  await context.route('**/register*', route => route.fulfill({ body: 'Registration preview' }));
  const [newTab] = await Promise.all([
    context.waitForEvent('page'),
    page
      .getByRole('link', { name: 'Ready to start myself' })
      .click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await newTab.waitForLoadState();
  expect(new URL(newTab.url()).searchParams.get('blog_ref')).toMatch(/^[0-9a-f-]{36}$/);
  // The existing app redirect carries blog_ref into /login?register=1.
  // Campaign attribution is present on the site's outbound registration URL.
  expect(
    await page.getByRole('link', { name: 'Ready to start myself' }).getAttribute('href')
  ).toContain('utm_source=group');
  expect(page.url()).toContain('/blog/');
});

test('blog navigation demo actions carry a blog reference and placement', async ({ page }) => {
  await page.goto(`${origin}/blog/how-to-track-stock-small-shop-kenya`);
  await expect(page.locator('app-blog-article h1')).toBeVisible();
  const events = await captureBlogEvents(page);
  await page
    .locator('app-marketing-layout > div > header')
    .getByRole('link', { name: 'Request a demo' })
    .click();
  await expect(page).toHaveURL(/contact.*blog_ref=/);
  expect(events.find(event => event[1] === 'cta_click')?.[2]).toMatchObject({
    action: 'demo',
    placement: 'site_navigation',
  });
});

test('analytics rejection cannot block a blog enquiry or change the acquisition classification', async ({
  page,
}) => {
  await page.goto(`${origin}/blog/how-to-track-stock-small-shop-kenya?utm_source=group`);
  await expect(page.getByRole('link', { name: 'See the sale-to-stock workflow' })).toBeVisible();
  const events = await captureBlogEvents(page, true);
  await page.getByRole('link', { name: 'See the sale-to-stock workflow' }).click();
  await expect(page).toHaveURL(/contact\?intent=demo/);
  const ctas = events.filter(event => event[1] === 'cta_click');
  expect(ctas).toHaveLength(1);
  expect(ctas[0][2]).toMatchObject({
    action: 'demo',
    placement: 'article_body',
    utm_source: 'group',
  });
  expect(JSON.stringify(events)).not.toContain('businessType');
});

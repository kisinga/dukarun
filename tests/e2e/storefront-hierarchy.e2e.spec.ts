import { expect, test } from '@playwright/test';

test('storefront separates purchasing controls and keeps the basket usable', async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(
    'http://127.0.0.1:4204/fixture-shop/products/00000000-0000-0000-0000-000000000003'
  );
  await expect(page.getByRole('heading', { name: 'Fixture Sugar 1kg' })).toBeVisible();
  const purchasing = page.locator('section.storefront-surface');
  await expect(purchasing.getByRole('button', { name: 'Add to basket' })).toBeVisible();
  const layers = await purchasing.evaluate(element => ({
    content: getComputedStyle(element).backgroundColor,
    canvas: getComputedStyle(element.closest('main')!).backgroundColor,
    metadata: getComputedStyle(element.querySelector('.storefront-inset')!).backgroundColor,
  }));
  expect(layers.content).not.toBe(layers.canvas);
  expect(layers.metadata).not.toBe(layers.content);
  await purchasing.getByRole('button', { name: 'Add to basket' }).click();
  await page.getByRole('button', { name: /Basket ·/ }).click();
  const basket = page.getByRole('dialog', { name: 'Basket', exact: true });
  await expect(basket).toBeVisible();
  const order = basket.getByRole('link', { name: 'Send order on WhatsApp' });
  await expect(order).toBeInViewport();
  await basket.getByRole('button', { name: 'Increase quantity' }).click();
  await expect(basket.locator('footer strong')).toHaveText('KES 330');
  await expect(order).toHaveAttribute('href', /wa\.me/);

  const geometry = await basket.evaluate(element => {
    const controls = [...element.querySelectorAll('article button')];
    return {
      targets: controls.map(control => {
        const rect = control.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: getComputedStyle(element.querySelector('.storefront-basket-body')!).overflowY,
    };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.bodyOverflow).toBe('auto');
  for (const target of geometry.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  if (process.env.DESIGN_REVIEW_DIR) {
    await basket.locator('aside').screenshot({
      path: `${process.env.DESIGN_REVIEW_DIR}/storefront-basket-${isMobile ? 'phone' : 'desktop'}.png`,
    });
  }
  await basket.getByRole('button', { name: 'Clear basket', exact: true }).click();
  await expect(basket.getByText('Basket cleared')).toBeVisible();
  await basket.getByRole('button', { name: 'Keep browsing' }).click();
  await expect(basket).toHaveCount(0);
});

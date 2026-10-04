import { expect, test } from '../fixtures/mocked-browser';
import { mockSaleReceipt, mockSellWorkspace } from '../fixtures/sell-workspace';

test('Sales opens a visible receipt sheet with independent print and WhatsApp actions', async ({
  page,
  isMobile,
}) => {
  await mockSellWorkspace(page);
  const { order } = await mockSaleReceipt(page);
  await page.route('**/rest/v1/orders*', route =>
    route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object') ? order : [order],
      headers: { 'content-range': '0-0/1' },
    })
  );
  await page.goto('http://127.0.0.1:4203/orders');
  if (isMobile) await page.getByRole('button', { name: /SALE-POLISH-1 Completed/ }).click();
  await page.getByRole('button', { name: 'Receipt or invoice', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Send receipt', exact: true });
  await expect(dialog).toBeVisible();
  // Native [open] alone misses DaisyUI's transparent modal-box regression.
  await expect(dialog.locator('.modal-box')).toHaveCSS('opacity', '1');
  await expect(dialog.getByRole('heading', { name: 'Send receipt' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Send PDF via WhatsApp', exact: true })
  ).toBeDisabled();
  await expect(dialog.getByLabel('WhatsApp number')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

import { expect, test } from '../fixtures/mocked-browser';

test('Sales opens a visible receipt sheet with independent print and WhatsApp actions', async ({
  page,
  isMobile,
}) => {
  const company = '93600000-0000-4000-8000-000000000001';
  const user = '93600000-0000-4000-8000-000000000002';
  const location = '93600000-0000-4000-8000-000000000003';
  const orderId = '93600000-0000-4000-8000-000000000004';
  const claims = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: user,
    company_id: company,
    user_role: 'Owner',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const session = {
    access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`,
    refresh_token: 'test',
    token_type: 'bearer',
    expires_at: claims.exp,
    expires_in: 3600,
    user: {
      id: user,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'receipt@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
  await page.addInitScript(
    ({ session, company, user, location }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
      localStorage.setItem(`dukarun:working-location:${company}:${user}`, location);
    },
    { session, company, user, location }
  );
  const order = {
    id: orderId,
    company_id: company,
    location_id: location,
    code: 'SALE-PDF-1',
    status: 'completed',
    total: 1000,
    net_total: 1000,
    cogs_total: 0,
    is_credit_sale: false,
    customer_id: null,
    customers: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, headers?: Record<string, string>) =>
      route.fulfill({ json: body, headers });
    if (path.endsWith('/auth/v1/user')) return json(session.user);
    if (path.endsWith('/rpc/current_company_legal_status'))
      return json({
        required: false,
        accepted: true,
        can_accept: true,
        company_status: 'approved',
        enforcement_started: false,
      });
    if (path.endsWith('/rpc/current_access_snapshot'))
      return json({
        company_id: company,
        user_id: user,
        permissions: ['SettleOrder', 'ManageCustomers', 'ViewFinancials'],
        workspaces: ['sell', 'sales', 'dashboard', 'customers'],
        actions: { 'sale.void': 'execute', 'sale.refund': 'execute', 'payment.reverse': 'execute' },
      });
    if (path.endsWith('/rpc/current_entitlements'))
      return json({
        companyId: company,
        status: 'active',
        tierCode: 'pro',
        tierName: 'Pro',
        features: {},
        settings: {},
        limits: {},
        usage: { sms: {}, whatsapp: {} },
      });
    if (path.endsWith('/rpc/accessible_business_locations'))
      return json([
        { id: location, name: 'Main shop', code: 'MAIN', is_default: true, is_primary: true },
      ]);
    if (path.endsWith('/rpc/company_tax_settings'))
      return json({ active_profile: null, scheduled_profiles: [] });
    if (path.endsWith('/rpc/order_receivable_statuses'))
      return json([{ order_id: orderId, outstanding: 0, settled_amount: 1000 }]);
    if (path.endsWith('/rpc/sale_document_context'))
      return json({
        order_id: orderId,
        document_number: order.code,
        total: 1000,
        paid: 1000,
        balance: 0,
        document_type: 'receipt',
        eligible: true,
        has_customer: false,
        customer: null,
        can_correct_number: true,
        delivery: null,
      });
    if (path.endsWith('/companies'))
      return json({
        id: company,
        name: 'Test shop',
        code: 'SHOP',
        address: null,
        logo_path: null,
        enable_printer: false,
        show_vat_breakdown_on_prints: false,
        business_timezone: 'Africa/Nairobi',
        cashier_flow_enabled: false,
        cash_control_enabled: false,
        subscription_status: 'active',
        subscription_expires_at: '2099-01-01T00:00:00Z',
        document_designs: {},
        shop_setup: { deferred: true },
      });
    if (path.endsWith('/orders'))
      return json(request.headers()['accept']?.includes('vnd.pgrst.object') ? order : [order], {
        'content-range': '0-0/1',
      });
    if (path.endsWith('/user_profiles'))
      return json({ id: user, display_name: 'Receipt Tester', avatar_url: null });
    return json([]);
  });
  await page.goto('http://127.0.0.1:4203/orders');
  if (isMobile) await page.getByRole('button', { name: /SALE-PDF-1 Completed/ }).click();
  await page.getByRole('button', { name: 'Receipt or invoice', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sale document', exact: true });
  await expect(dialog).toBeVisible();
  // Native [open] alone misses DaisyUI's transparent modal-box regression.
  await expect(dialog.locator('.modal-box')).toHaveCSS('opacity', '1');
  await expect(dialog.getByRole('heading', { name: 'Sale document' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
  await expect(
    dialog.getByRole('button', { name: 'Send PDF via WhatsApp', exact: true })
  ).toBeDisabled();
  await expect(dialog.getByLabel('WhatsApp number')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

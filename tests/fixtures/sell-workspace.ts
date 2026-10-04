import type { Page } from '@playwright/test';
import { mockCashierSession } from './cashier-session';

const company = '97000000-0000-4000-8000-000000000001';
const user = '97000000-0000-4000-8000-000000000002';
const location = '97000000-0000-4000-8000-000000000003';
const category = '97000000-0000-4000-8000-000000000004';
export const sellVariants = [
  ['Biriyani', 390, 24],
  ['Chicken pilau', 450, 18],
  ['Fresh mango juice', 180, 32],
  ['Special family platter with vegetables and freshly prepared accompaniments', 1234567, 123456],
  ['Chapati', 50, 60],
  ['Spiced tea', 80, 0],
  ['Local delivery', 150, 0],
].map(([name, price, stock], index) => ({
  variant_id: `97000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
  product_id: `97000000-0000-4000-8000-${String(index + 30).padStart(12, '0')}`,
  variant_name: 'Default',
  product_name: name,
  price,
  stock,
  wholesale_price: null,
  product_active: true,
  variant_active: true,
  kind: index === 6 ? 'service' : 'good',
  track_inventory: index !== 6,
  allow_fractional: index === 4,
  stock_unit: 'item',
  packs: [],
  sku: `MEAL-${index}`,
  barcode: `123456789${index}`,
  image_path: null,
  manufacturer_id: null,
  manufacturer_name: null,
  catalogue_version: {
    product: '2026-10-01T00:00:00Z',
    variant: '2026-10-01T00:00:00Z',
    pack: null,
  },
}));

/** Real Sell UI with fictional local responses; no external sale or message is sent. */
export async function mockSellWorkspace(
  page: Page,
  options: { fulfillment?: boolean; credit?: boolean; cashier?: boolean } = {}
) {
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: user,
    company_id: company,
    user_role: 'Owner',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const session = {
    access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test`,
    refresh_token: 'test',
    token_type: 'bearer',
    expires_at: payload.exp,
    expires_in: 3600,
    user: {
      id: user,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'sell@example.test',
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
  const customer = {
    id: '97000000-0000-4000-8000-000000000005',
    first_name: 'Amina',
    last_name: 'Hassan',
    phone: '0712345678',
    delivery_address: 'Parklands, 3rd Avenue\nGate 12, first floor',
    is_credit_approved: !!options.credit,
    credit_limit: 10000,
    ar_balance: 0,
    is_supplier: false,
    deleted_at: null,
  };
  const requests: { path: string; body: unknown }[] = [];
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() === 'POST') requests.push({ path, body: request.postDataJSON() });
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
        permissions: [
          'SettleOrder',
          'OverridePrice',
          'ManageCustomers',
          'ManageCommunications',
          'ViewFinancials',
        ],
        workspaces: ['sell', 'sales', 'dashboard', 'customers'],
        actions: { 'sale.credit_over_limit': 'execute' },
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
    if (path.endsWith('/companies'))
      return json({
        id: company,
        name: 'Test shop',
        code: 'SHOP',
        enable_printer: false,
        cashier_flow_enabled: !!options.cashier,
        cash_control_enabled: false,
        business_timezone: 'Africa/Nairobi',
        subscription_status: 'active',
        subscription_expires_at: '2099-01-01T00:00:00Z',
        document_designs: {},
        shop_setup: { deferred: true },
      });
    if (path.endsWith('/user_profiles')) return json({ id: user, display_name: 'Sell Tester' });
    if (path.endsWith('/rpc/fulfillment_settings_at_location'))
      return json({
        company_id: company,
        location_id: location,
        enabled: options.fulfillment !== false,
        feature_available: options.fulfillment !== false,
        pickup_enabled: true,
        delivery_enabled: true,
        cod_enabled: true,
        default_delivery_fee_variant_id: sellVariants[6].variant_id,
        pickup_sla_minutes: 30,
        delivery_sla_minutes: 90,
      });
    if (path.endsWith('/rpc/catalog_cache_page')) return json(sellVariants);
    if (path.endsWith('/rpc/catalog_cache_families'))
      return json(
        sellVariants.map(v => ({ id: v.product_id, name: v.product_name, active: true }))
      );
    if (path.endsWith('/rpc/catalog_cache_entities')) return json(sellVariants);
    if (path.endsWith('/rpc/search_catalog_variants'))
      return json(
        sellVariants.filter(v =>
          String(v.product_name)
            .toLowerCase()
            .includes(String(request.postDataJSON().p_query).toLowerCase())
        )
      );
    if (path.endsWith('/rpc/location_stock_for_variants'))
      return json(
        sellVariants.map(v => ({ variant_id: v.variant_id, stock: v.stock, stock_value: 0 }))
      );
    if (path.endsWith('/variant_catalog')) {
      const id = url.searchParams.get('variant_id');
      if (id?.startsWith('in.')) return json(sellVariants.filter(v => id.includes(v.variant_id)));
      return json(
        id
          ? sellVariants.find(v => v.variant_id === id.replace('eq.', ''))
          : sellVariants.slice(0, 6)
      );
    }
    if (path.endsWith('/categories'))
      return json([{ id: category, name: 'Meals', active: true, position: 0 }]);
    if (path.endsWith('/product_categories'))
      return json(sellVariants.map(v => ({ product_id: v.product_id, category_id: category })));
    if (
      path.endsWith('/rpc/search_customers') ||
      path.endsWith('/rpc/search_customers_with_credit')
    )
      return json([customer]);
    if (path.endsWith('/customer_credit')) return json(customer);
    if (path.endsWith('/customers'))
      return json(
        request.headers()['accept']?.includes('vnd.pgrst.object') ? customer : [customer]
      );
    if (path.endsWith('/rpc/company_tax_settings'))
      return json({ active_profile: null, scheduled_profiles: [] });
    if (path.endsWith('/rpc/mpesa_availability')) return json({ active: false });
    if (path.endsWith('/rpc/lookup_receipt_contact')) return json(null);
    if (path.endsWith('/payment_methods'))
      return json([{ id: 'cash', name: 'Cash', code: 'cash', active: true }]);
    if (path.endsWith('/rpc/available_payment_methods'))
      return json([
        {
          code: 'cash',
          name: 'Cash',
          is_cashier_controlled: true,
          ledger_account_code: 'CASH_ON_HAND',
        },
      ]);
    if (path.endsWith('/rpc/available_tender_accounts'))
      return json([
        {
          account_code: 'CASH_ON_HAND',
          account_name: 'Cash on hand',
          method_code: 'cash',
          is_default: true,
        },
      ]);
    return json([]);
  });
  await mockCashierSession(page, { companyId: company, userId: user, locationId: location });
  return { customer, requests };
}

export async function mockSaleReceipt(page: Page, pending = false) {
  const order = {
    id: '97000000-0000-4000-8000-000000000099',
    code: 'SALE-POLISH-1',
    status: pending ? 'pending_payment' : 'completed',
    total: 390,
    net_total: 390,
    cogs_total: 0,
    is_credit_sale: false,
    customer_id: null,
    customers: null,
    cashier_pending_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const submissions: unknown[] = [];
  await page.route('**/rest/v1/orders*', route =>
    route.fulfill({
      json: route.request().headers()['accept']?.includes('vnd.pgrst.object')
        ? order
        : order.status === 'pending_payment'
          ? [order]
          : [],
      headers: { 'content-range': order.status === 'pending_payment' ? '0-0/1' : '0-0/0' },
    })
  );
  await page.route('**/rest/v1/rpc/post_sale_at_location', route => {
    submissions.push(route.request().postDataJSON());
    order.status = 'completed';
    return route.fulfill({ json: { status: 'completed', order_id: order.id } });
  });
  await page.route('**/rest/v1/rpc/settle_order*', route => {
    submissions.push(route.request().postDataJSON());
    order.status = 'completed';
    return route.fulfill({ json: null });
  });
  await page.route('**/rest/v1/rpc/sale_document_context', route =>
    route.fulfill({
      json: {
        order_id: order.id,
        document_number: order.code,
        total: order.total,
        paid: order.total,
        balance: 0,
        document_type: 'receipt',
        eligible: true,
        has_customer: false,
        customer: null,
        can_correct_number: true,
        delivery: null,
      },
    })
  );
  return { order, submissions };
}

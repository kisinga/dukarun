import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

function localDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  const output = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = output.split('\n').find(value => value.startsWith('DB_URL='));
  if (!line) throw new Error('Local Supabase DB_URL unavailable. Run npm run sb:start first.');
  return line.slice('DB_URL='.length).replace(/^"|"$/g, '');
}

const pool = new Pool({ connectionString: localDatabaseUrl(), max: 8 });
const userId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
const receiptCustomerId = crypto.randomUUID();
const salesCustomerId = crypto.randomUUID();
const raceCustomerId = crypto.randomUUID();
let companyId;

const claims = () =>
  JSON.stringify({
    sub: userId,
    role: 'authenticated',
    company_id: companyId,
    user_role: 'Admin',
  });

async function asUser(client, sql, params = []) {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query(`select set_config('request.jwt.claims',$1,true)`, [claims()]);
    const result = await client.query(sql, params);
    await client.query('commit');
    return result.rows[0]?.result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function receipt(client, customerId, amount, clientRef) {
  return asUser(client, `select public.post_customer_receipt(null,$1,$2,'cash',null,$3) result`, [
    customerId,
    amount,
    clientRef,
  ]);
}

async function creditSale(client, customerId, total, clientRef) {
  const lines = JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: total }]);
  return asUser(
    client,
    `select public.post_credit_sale_at_location(null,$1,$2::jsonb,$3,null,null) result`,
    [customerId, lines, clientRef]
  );
}

const clients = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));

try {
  await pool.query(
    `insert into auth.users(
       id,instance_id,aud,role,email,encrypted_password,confirmation_token,recovery_token,
       email_change,email_change_token_current,email_change_token_new,phone_change,
       phone_change_token,reauthentication_token,created_at,updated_at
     ) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,
       '','','','','','','','','',now(),now())`,
    [userId, `customer-account-concurrency-${userId}@test.local`]
  );
  const setup = clients[0];
  await setup.query('begin');
  await setup.query(`select set_config('request.jwt.claims',$1,true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  const provisioned = await setup.query(
    `select public.provision_company('Customer account concurrency','Main') company_id`
  );
  companyId = provisioned.rows[0].company_id;
  await setup.query('commit');

  await pool.query(
    `update public.companies set status='approved',cash_control_enabled=false,
       cashier_flow_enabled=false,subscription_status='active',
       subscription_started_at=now(),subscription_expires_at=now()+interval '1 year',
       billing_cycle='yearly' where id=$1`,
    [companyId]
  );
  await pool.query(
    `insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
     values($1,$4,'Receipt race',true,1000),($2,$4,'Sale race',true,1000),
       ($3,$4,'Receipt sale race',true,1000)`,
    [receiptCustomerId, salesCustomerId, raceCustomerId, companyId]
  );
  await pool.query(
    `insert into public.products(id,company_id,name) values($1,$2,'Account service')`,
    [productId, companyId]
  );
  await pool.query(
    `insert into public.product_variants(
       id,product_id,company_id,name,kind,sku,price,wholesale_price,track_inventory
     ) values($1,$2,$3,'Default','service',$4,100,50,false)`,
    [variantId, productId, companyId, `ACCOUNT-SERVICE-${variantId}`]
  );

  // Seed one KES 100 open invoice, then race two KES 60 receipts against it.
  await asUser(
    clients[0],
    `select public.post_sale_at_location(null,$1,$2::jsonb,'[]'::jsonb,false,$3,null) result`,
    [
      receiptCustomerId,
      JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 100 }]),
      `receipt-invoice-${companyId}`,
    ]
  );
  const receiptResults = await Promise.all([
    receipt(clients[0], receiptCustomerId, 60, `receipt-race-a-${companyId}`),
    receipt(clients[1], receiptCustomerId, 60, `receipt-race-b-${companyId}`),
  ]);
  const receiptApplied = receiptResults.reduce(
    (sum, result) => sum + Number(result.applied_amount),
    0
  );
  const receiptDeposit = receiptResults.reduce(
    (sum, result) => sum + Number(result.downpayment_amount),
    0
  );
  if (receiptApplied !== 100 || receiptDeposit !== 20) {
    throw new Error(
      `Competing receipt split was not serialized: ${JSON.stringify(receiptResults)}`
    );
  }

  // Two KES 100 sales compete for one KES 150 downpayment balance.
  await receipt(clients[0], salesCustomerId, 150, `sale-race-funding-${companyId}`);
  const saleResults = await Promise.all([
    creditSale(clients[0], salesCustomerId, 100, `sale-race-a-${companyId}`),
    creditSale(clients[1], salesCustomerId, 100, `sale-race-b-${companyId}`),
  ]);
  const saleDeposit = saleResults.reduce(
    (sum, result) => sum + Number(result.downpayment_applied),
    0
  );
  const saleCredit = saleResults.reduce((sum, result) => sum + Number(result.credit_amount), 0);
  if (saleDeposit !== 150 || saleCredit !== 50) {
    throw new Error(`Competing sale split was not serialized: ${JSON.stringify(saleResults)}`);
  }

  // A new receipt and sale race on the same account. Either lock order must end
  // with the receipt clearing any residual invoice and KES 10 left on account.
  await receipt(clients[0], raceCustomerId, 60, `mixed-race-funding-${companyId}`);
  await Promise.all([
    receipt(clients[2], raceCustomerId, 50, `mixed-race-receipt-${companyId}`),
    creditSale(clients[3], raceCustomerId, 100, `mixed-race-sale-${companyId}`),
  ]);
  const balance = await pool.query(
    `select receivable_balance,downpayment_balance,net_balance
     from public.customer_account_balances where company_id=$1 and customer_id=$2`,
    [companyId, raceCustomerId]
  );
  const row = balance.rows[0];
  if (
    Number(row?.receivable_balance) !== 0 ||
    Number(row?.downpayment_balance) !== 10 ||
    Number(row?.net_balance) !== -10
  ) {
    throw new Error(`Receipt-versus-sale balance is inconsistent: ${JSON.stringify(row)}`);
  }

  console.log('customer account concurrency: receipts, sales, and mixed race serialized');
} finally {
  for (const client of clients) {
    await client.query('rollback').catch(() => undefined);
  }
  if (companyId) {
    try {
      await clients[0].query('begin');
      await clients[0].query(`select set_config('app.allow_ledger_mutation','on',true)`);
      await clients[0].query(`delete from public.companies where id=$1`, [companyId]);
      await clients[0].query('commit');
    } catch {
      await clients[0].query('rollback').catch(() => undefined);
    }
  }
  await pool.query(`delete from auth.users where id=$1`, [userId]).catch(() => undefined);
  for (const client of clients) client.release();
  await pool.end();
}

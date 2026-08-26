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

const pool = new Pool({ connectionString: localDatabaseUrl(), max: 4 });
const clients = await Promise.all(Array.from({ length: 2 }, () => pool.connect()));
const userId = crypto.randomUUID();
const productId = crypto.randomUUID();
const variantId = crypto.randomUUID();
let companyId;
let locationId;

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

async function createFulfillment(client, type, collectionKind, clientRef) {
  const payments = collectionKind === 'cod' ? [] : [{ method: 'cash', amount: 500 }];
  return asUser(
    client,
    `select public.post_fulfillment_sale_at_location(
       $1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6,null,null
     ) result`,
    [
      locationId,
      JSON.stringify({
        name: `${type} recipient`,
        phone: '0712345678',
        save_as_customer: true,
      }),
      JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 500 }]),
      JSON.stringify(payments),
      JSON.stringify({
        type,
        collection_kind: collectionKind,
        recipient_name: `${type} recipient`,
        phone: '0712345678',
        address: type === 'delivery' ? 'Westlands, Nairobi' : undefined,
        transactional_message_consent: false,
      }),
      clientRef,
    ]
  );
}

function assertOneSuccess(results, expectedError) {
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(`Expected one winner and one loser: ${JSON.stringify(results)}`);
  }
  if (!String(rejected[0].reason?.message).includes(expectedError)) throw rejected[0].reason;
}

try {
  await pool.query(
    `insert into auth.users(
       id,instance_id,aud,role,email,encrypted_password,confirmation_token,recovery_token,
       email_change,email_change_token_current,email_change_token_new,phone_change,
       phone_change_token,reauthentication_token,created_at,updated_at
     ) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,
       '','','','','','','','','',now(),now())`,
    [userId, `fulfillment-concurrency-${userId}@test.local`]
  );

  await clients[0].query('begin');
  await clients[0].query(`select set_config('request.jwt.claims',$1,true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  const provisioned = await clients[0].query(
    `select public.provision_company('Fulfillment concurrency','Main') company_id`
  );
  companyId = provisioned.rows[0].company_id;
  await clients[0].query('commit');

  const setup = await pool.query(
    `update public.companies set status='approved',cash_control_enabled=false,
       cashier_flow_enabled=true,subscription_status='active',subscription_started_at=now(),
       subscription_expires_at=now()+interval '1 year',billing_cycle='yearly',
       subscription_tier_id=(select id from public.subscription_tiers where name='Standard')
     where id=$1
     returning (select id from public.stock_locations where company_id=$1 and is_default) location_id`,
    [companyId]
  );
  locationId = setup.rows[0].location_id;
  await pool.query(
    `insert into public.products(id,company_id,name) values($1,$2,'Delivery item')`,
    [productId, companyId]
  );
  await pool.query(
    `insert into public.product_variants(
       id,product_id,company_id,name,kind,sku,price,wholesale_price,track_inventory
     ) values($1,$2,$3,'Default','service',$4,500,0,false)`,
    [variantId, productId, companyId, `FULFILLMENT-RACE-${variantId}`]
  );
  await asUser(
    clients[0],
    `select public.update_fulfillment_settings($1,jsonb_build_object(
      'enabled',true,'pickup_enabled',true,'delivery_enabled',true,'cod_enabled',true,
      'default_delivery_fee_variant_id',$2::text)) result`,
    [locationId, variantId]
  );

  const pickup = await createFulfillment(
    clients[0],
    'pickup',
    'none',
    `fulfillment-claim-${companyId}`
  );
  await asUser(clients[0], `select public.start_fulfillment_preparation($1,1) result`, [
    pickup.fulfillment_id,
  ]);
  await asUser(clients[0], `select public.mark_fulfillment_ready($1,2) result`, [
    pickup.fulfillment_id,
  ]);
  const claimResults = await Promise.allSettled(
    clients.map(client =>
      asUser(client, `select public.claim_fulfillment($1,3) result`, [pickup.fulfillment_id])
    )
  );
  assertOneSuccess(claimResults, 'stale_fulfillment_version');
  const claimState = await pool.query(
    `select f.state_version,
       (select count(*)::int from public.fulfillment_events e
        where e.fulfillment_id=f.id and e.event_kind='claimed') claim_events
     from public.order_fulfillments f where f.id=$1`,
    [pickup.fulfillment_id]
  );
  if (Number(claimState.rows[0]?.state_version) !== 4 || claimState.rows[0]?.claim_events !== 1) {
    throw new Error(`Claim race was not atomic: ${JSON.stringify(claimState.rows[0])}`);
  }

  const delivery = await createFulfillment(
    clients[0],
    'delivery',
    'cod',
    `fulfillment-dispatch-${companyId}`
  );
  await asUser(clients[0], `select public.start_fulfillment_preparation($1,1) result`, [
    delivery.fulfillment_id,
  ]);
  await asUser(clients[0], `select public.mark_fulfillment_ready($1,2) result`, [
    delivery.fulfillment_id,
  ]);
  const dispatchResults = await Promise.allSettled(
    clients.map(client =>
      asUser(client, `select public.dispatch_fulfillment($1,3) result`, [delivery.fulfillment_id])
    )
  );
  assertOneSuccess(dispatchResults, 'stale_fulfillment_version');

  const collectionResults = await Promise.all(
    clients.map(client =>
      asUser(client, `select public.collect_cod_cash($1,4) result`, [delivery.fulfillment_id])
    )
  );
  const statuses = collectionResults.map(result => result.status).sort();
  if (statuses.join(',') !== 'already_collected,collected') {
    throw new Error(`COD collection was not idempotent: ${JSON.stringify(collectionResults)}`);
  }
  const codState = await pool.query(
    `select o.status,f.status,f.state_version,
       (select count(*)::int from public.payments p where p.order_id=o.id and p.status='settled') payments,
       (select coalesce(sum(p.amount),0)::bigint from public.payments p
        where p.order_id=o.id and p.status='settled') paid
     from public.order_fulfillments f join public.orders o on o.id=f.order_id where f.id=$1`,
    [delivery.fulfillment_id]
  );
  const cod = codState.rows[0];
  if (
    cod?.status !== 'in_transit' ||
    Number(cod?.state_version) !== 4 ||
    cod?.payments !== 1 ||
    Number(cod?.paid) !== 500
  ) {
    throw new Error(`Dispatch or payment race duplicated state: ${JSON.stringify(cod)}`);
  }

  console.log('fulfillment concurrency: claim, dispatch, and COD collection serialized');
} finally {
  for (const client of clients) await client.query('rollback').catch(() => undefined);
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

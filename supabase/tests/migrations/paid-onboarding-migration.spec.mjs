import { execFileSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;
const supabase = './node_modules/.bin/supabase';
const cliOptions = {
  cwd: process.cwd(),
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: 'true' },
  stdio: 'inherit',
};

function localDatabaseUrl() {
  const output = execFileSync(supabase, ['status', '-o', 'env'], {
    ...cliOptions,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const line = output.split('\n').find(value => value.startsWith('DB_URL='));
  if (!line) throw new Error('Local Supabase DB_URL unavailable. Run npm run sb:start first.');
  return line.slice('DB_URL='.length).replace(/^"|"$/g, '');
}

let databaseWasReset = false;
let pool;

try {
  execFileSync(
    supabase,
    ['db', 'reset', '--local', '--version', '20260820000001', '--no-seed', '--yes'],
    cliOptions
  );
  databaseWasReset = true;
  pool = new Pool({ connectionString: localDatabaseUrl(), max: 2 });

  const tiers = await pool.query(
    `select id,price_monthly,price_yearly from public.subscription_tiers
      where is_active and price_monthly > 0 order by price_monthly,id limit 2`
  );
  const defaultTierId = tiers.rows[0].id;
  if (!defaultTierId) throw new Error('Migration fixture requires a billable tier');
  let disabledIntroTierId = tiers.rows[1]?.id;
  if (!disabledIntroTierId) {
    const alternate = await pool.query(
      `insert into public.subscription_tiers(code,name,price_monthly,price_yearly,is_active)
       values('migration-alternate','Migration alternate',$1,$2,true)
       returning id`,
      [Number(tiers.rows[0].price_monthly) + 1, Number(tiers.rows[0].price_yearly) + 12]
    );
    disabledIntroTierId = alternate.rows[0].id;
  }

  await pool.query(
    `update public.platform_billing_settings
        set default_trial_tier_id=$1,intro_offer_enabled=false,intro_offer_tier_id=$2,
            intro_offer_paid_months=1,intro_offer_bonus_months=2
      where singleton`,
    [defaultTierId, disabledIntroTierId]
  );
  const inserted = await pool.query(
    `insert into public.companies(
       id,code,name,status,subscription_tier_id,subscription_status,
       trial_started_at,trial_ends_at,subscription_expires_at,subscription_grace_period_end
     ) values
       ('a9200000-0000-0000-0000-000000000001','MIG-FUTURE','Future trial','approved',$1,'trial',
        now()-interval '10 days',now()+interval '10 days',now()+interval '10 days',now()+interval '13 days'),
       ('a9200000-0000-0000-0000-000000000002','MIG-ELAPSED','Elapsed trial','approved',$1,'trial',
        now()-interval '20 days',now()-interval '2 days',now()-interval '2 days',now()+interval '1 day')
     returning id,trial_ends_at`,
    [defaultTierId]
  );
  const expectedExpiry = new Map(
    inserted.rows.map(row => [row.id, new Date(row.trial_ends_at).toISOString()])
  );

  await pool.end();
  pool = undefined;
  execFileSync(supabase, ['migration', 'up', '--local'], cliOptions);

  pool = new Pool({ connectionString: localDatabaseUrl(), max: 2 });
  const companies = await pool.query(
    `select id,subscription_status,subscription_expires_at,subscription_grace_period_end,
            last_payment_reference
       from public.companies
      where id in ('a9200000-0000-0000-0000-000000000001','a9200000-0000-0000-0000-000000000002')
      order by id`
  );
  const [future, elapsed] = companies.rows;
  if (
    future?.subscription_status !== 'active' ||
    new Date(future.subscription_expires_at).toISOString() !== expectedExpiry.get(future.id) ||
    future.subscription_grace_period_end !== null ||
    future.last_payment_reference !== null
  ) {
    throw new Error(`Future trial conversion mismatch: ${JSON.stringify(future)}`);
  }
  if (
    elapsed?.subscription_status !== 'expired' ||
    new Date(elapsed.subscription_expires_at).toISOString() !== expectedExpiry.get(elapsed.id) ||
    elapsed.subscription_grace_period_end !== null ||
    elapsed.last_payment_reference !== null
  ) {
    throw new Error(`Elapsed trial conversion mismatch: ${JSON.stringify(elapsed)}`);
  }

  const policy = await pool.query(
    `select new_customer_tier_id,testing_access_months from public.platform_billing_settings
      where singleton`
  );
  if (
    policy.rows[0]?.new_customer_tier_id !== defaultTierId ||
    policy.rows[0]?.testing_access_months !== 1
  ) {
    throw new Error(
      `Disabled introductory offer mapping mismatch: ${JSON.stringify(policy.rows[0])}`
    );
  }
  const removed = await pool.query(
    `select count(*)::int remaining from information_schema.columns
      where table_schema='public' and table_name='companies'
        and column_name in ('trial_started_at','trial_ends_at')`
  );
  if (removed.rows[0]?.remaining !== 0) {
    throw new Error('Trial-only company columns survived the hard migration');
  }

  console.log(
    'paid onboarding migration: future and elapsed trials converted; disabled offer maps safely'
  );
} finally {
  if (pool) await pool.end();
  if (databaseWasReset) {
    execFileSync(supabase, ['db', 'reset', '--local', '--yes'], cliOptions);
  }
}

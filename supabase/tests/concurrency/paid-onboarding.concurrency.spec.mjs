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

const pool = new Pool({ connectionString: localDatabaseUrl(), max: 12 });
const companyId = crypto.randomUUID();
const salespersonId = crypto.randomUUID();
const founderId = crypto.randomUUID();
let paymentReference;
const paidAt = new Date(Date.now() - 60_000).toISOString();
const invitationCode = `C${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
let previousSettings;
let registrationClients = [];
let registrationCompanyIds = [];
let testLegalDocumentId;

try {
  const settings = await pool.query(
    `select s.new_customer_tier_id,s.testing_access_months,
            s.sales_commissions_enabled,s.sales_commission_rate_bps,t.price_monthly
       from public.platform_billing_settings s
       join public.subscription_tiers t on t.id=s.new_customer_tier_id
      where s.singleton`
  );
  previousSettings = settings.rows[0];
  if (!previousSettings) throw new Error('Paid-onboarding settings are unavailable');

  await pool.query(
    `update public.platform_billing_settings
        set sales_commissions_enabled=true,sales_commission_rate_bps=1375
      where singleton`
  );
  await pool.query(
    `insert into public.platform_salespeople(id,name,invitation_code)
     values($1,'Concurrent salesperson',$2)`,
    [salespersonId, invitationCode]
  );
  await pool.query(
    `insert into public.companies(
       id,code,name,status,subscription_tier_id,subscription_status
     ) values($1,$2,'Concurrent paid onboarding','approved',$3,null)`,
    [companyId, `paid-onboarding-${companyId}`, previousSettings.new_customer_tier_id]
  );
  await pool.query(
    `insert into public.company_sales_attributions(
       company_id,salesperson_id,invitation_code
     ) values($1,$2,$3)`,
    [companyId, salespersonId, invitationCode]
  );

  const reservationReferences = Array.from(
    { length: 10 },
    () => `INITIAL-CONCURRENT-${crypto.randomUUID()}`
  );
  const reservations = await Promise.allSettled(
    reservationReferences.map(reference =>
      pool.query(`select public.reserve_initial_subscription_payment($1,$2,$3,$4,$5)`, [
        companyId,
        previousSettings.new_customer_tier_id,
        reference,
        previousSettings.price_monthly,
        previousSettings.testing_access_months,
      ])
    )
  );
  const successfulReservationIndexes = reservations
    .map((result, index) => (result.status === 'fulfilled' ? index : -1))
    .filter(index => index >= 0);
  if (successfulReservationIndexes.length !== 1) {
    throw new Error(`Concurrent reservation mismatch: ${JSON.stringify(reservations)}`);
  }
  paymentReference = reservationReferences[successfulReservationIndexes[0]];

  const parameters = [
    companyId,
    previousSettings.new_customer_tier_id,
    paymentReference,
    previousSettings.price_monthly,
    previousSettings.price_monthly,
    previousSettings.testing_access_months,
    paidAt,
  ];
  await Promise.all(
    Array.from({ length: 10 }, () =>
      pool.query(
        `select public.activate_initial_subscription_purchase($1,$2,$3,$4,$5,$6,$7)`,
        parameters
      )
    )
  );

  const result = await pool.query(
    `select
       (select count(*)::int from public.initial_subscription_purchases where company_id=$1) purchases,
       (select count(*)::int from public.initial_subscription_payment_attempts
          where company_id=$1 and status='succeeded') succeeded_attempts,
       (select count(*)::int from public.platform_sales_commissions where company_id=$1) commissions,
       c.subscription_status,
       c.subscription_expires_at = c.subscription_started_at
         + make_interval(months => $2::int) exact_expiry,
       (select commission_amount from public.platform_sales_commissions where company_id=$1) commission_amount
     from public.companies c where c.id=$1`,
    [companyId, previousSettings.testing_access_months]
  );
  const row = result.rows[0];
  const expectedCommission = Math.round(Number(previousSettings.price_monthly) * 0.1375);
  if (
    row?.purchases !== 1 ||
    row?.succeeded_attempts !== 1 ||
    row?.commissions !== 1 ||
    row?.subscription_status !== 'active' ||
    row?.exact_expiry !== true ||
    Number(row?.commission_amount) !== expectedCommission
  ) {
    throw new Error(`Concurrent activation mismatch: ${JSON.stringify(row)}`);
  }

  let terms = await pool.query(
    `select version,content_sha256 from public.legal_document_versions
      where document_type='terms' and publication_state='published' and effective_at<=now()
      order by effective_at desc limit 1`
  );
  if (!terms.rows[0]) {
    const contentHash = crypto.randomUUID().replaceAll('-', '').repeat(2);
    const insertedTerms = await pool.query(
      `insert into public.legal_document_versions(
         document_type,version,content_sha256,effective_at,publication_state,
         requires_company_acceptance
       ) values('terms','2099-12-31',$1,now()-interval '1 day','published',true)
       returning id,version,content_sha256`,
      [contentHash]
    );
    testLegalDocumentId = insertedTerms.rows[0].id;
    terms = insertedTerms;
  }
  await pool.query(
    `insert into auth.users(
       id,instance_id,aud,role,email,encrypted_password,confirmation_token,recovery_token,
       email_change,email_change_token_current,email_change_token_new,phone_change,
       phone_change_token,reauthentication_token,created_at,updated_at
     ) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,
       '','','','','','','','','',now(),now())`,
    [founderId, `paid-onboarding-registration-${founderId}@test.local`]
  );
  registrationClients = await Promise.all([pool.connect(), pool.connect()]);
  const register = async (client, name) => {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims',$1,true)`, [
        JSON.stringify({ sub: founderId, role: 'authenticated' }),
      ]);
      const result = await client.query(
        `select public.provision_company_registration(
          $1,'Main','KES',null,null,$2,$3,null,null,$4
        ) result`,
        [name, terms.rows[0].version, terms.rows[0].content_sha256, invitationCode]
      );
      await client.query('commit');
      return result.rows[0].result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  };
  const registrationResults = await Promise.allSettled([
    register(registrationClients[0], 'Concurrent registration A'),
    register(registrationClients[1], 'Concurrent registration B'),
  ]);
  const registrations = registrationResults
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
  registrationCompanyIds = registrations.map(result => result.company_id);
  const registrationFailure = registrationResults.find(result => result.status === 'rejected');
  if (registrationFailure) throw registrationFailure.reason;
  const attributed = registrations.filter(result => result.sales_attributed === true).length;
  if (attributed !== 1) {
    throw new Error(
      `Concurrent first-company attribution mismatch: ${JSON.stringify(registrations)}`
    );
  }

  console.log(
    'paid onboarding concurrency: one of 10 reservations; 10 callbacks; one purchase, one commission, one first-company attribution'
  );
} finally {
  for (const client of registrationClients) client.release();
  if (registrationCompanyIds.length || testLegalDocumentId) {
    await pool.query('begin');
    try {
      for (const registrationCompanyId of registrationCompanyIds) {
        await pool.query(`set local session_replication_role='replica'`);
        await pool.query(`delete from public.company_legal_acceptances where company_id=$1`, [
          registrationCompanyId,
        ]);
        await pool.query(`set local session_replication_role='origin'`);
        await pool.query(`delete from public.companies where id=$1`, [registrationCompanyId]);
      }
      if (testLegalDocumentId) {
        await pool.query(`set local session_replication_role='replica'`);
        await pool.query(`delete from public.legal_document_versions where id=$1`, [
          testLegalDocumentId,
        ]);
        await pool.query(`set local session_replication_role='origin'`);
      }
      await pool.query('commit');
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
  await pool.query(`delete from public.platform_sales_commissions where company_id=$1`, [
    companyId,
  ]);
  await pool.query(`delete from public.companies where id=$1`, [companyId]);
  await pool.query(`delete from public.platform_salespeople where id=$1`, [salespersonId]);
  await pool.query(`delete from auth.users where id=$1`, [founderId]);
  if (previousSettings) {
    await pool.query(
      `update public.platform_billing_settings
          set sales_commissions_enabled=$1,sales_commission_rate_bps=$2
        where singleton`,
      [previousSettings.sales_commissions_enabled, previousSettings.sales_commission_rate_bps]
    );
  }
  await pool.end();
}

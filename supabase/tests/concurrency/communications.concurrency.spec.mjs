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

const pool = new Pool({ connectionString: localDatabaseUrl(), max: 24 });
const companyId = crypto.randomUUID();
const customerId = crypto.randomUUID();
const linkId = crypto.randomUUID();
const campaignId = crypto.randomUUID();
const recipientIds = [crypto.randomUUID(), crypto.randomUUID()];
const token = `concurrent-${crypto.randomUUID()}`;

try {
  await pool.query(
    `insert into public.companies(id,code,name,status) values($1,$2,'Concurrency test','approved')`,
    [companyId, `concurrency-${companyId}`]
  );
  await pool.query(
    `insert into public.customers(id,company_id,first_name) values($1,$2,'Concurrency')`,
    [customerId, companyId]
  );
  await pool.query(
    `insert into public.external_document_links(
       id,company_id,party_id,document_type,subject_id,token_hash,snapshot,expires_at
     ) values($1,$2,$3,'receipt',$4,encode(extensions.digest($5,'sha256'),'hex'),'{}',now()+interval '1 hour')`,
    [linkId, companyId, customerId, crypto.randomUUID(), token]
  );

  const opens = 20;
  const openResults = await Promise.all(
    Array.from({ length: opens }, () =>
      pool.query(`select public.public_external_document($1)`, [token])
    )
  );
  if (openResults.some(result => result.rows[0].public_external_document === null)) {
    throw new Error('Concurrent valid link load returned null');
  }
  const openCount = await pool.query(
    `select open_count from public.external_document_links where id=$1`,
    [linkId]
  );
  if (openCount.rows[0]?.open_count !== opens) {
    throw new Error(
      `Concurrent link count mismatch: expected ${opens}, got ${openCount.rows[0]?.open_count}`
    );
  }

  await pool.query(
    `insert into public.message_campaigns(
       id,company_id,scope,name,audience,audience_config,channel,title,body,status,recipient_count
     ) values($1,$2,'platform','Concurrency finalization','all','{}','sms','Title','Body','sending',2)`,
    [campaignId, companyId]
  );
  await pool.query(
    `insert into public.campaign_recipients(
       id,campaign_id,company_id,user_id,recipient,rendered_body,status
     ) values($1,$3,$4,$1,'+254700000001','One','queued'),
             ($2,$3,$4,$2,'+254700000002','Two','queued')`,
    [recipientIds[0], recipientIds[1], campaignId, companyId]
  );
  await Promise.all([
    pool.query(`select public.finalize_campaign_recipient($1,'sent')`, [recipientIds[0]]),
    pool.query(`select public.finalize_campaign_recipient($1,'failed')`, [recipientIds[1]]),
  ]);
  const campaign = await pool.query(
    `select status,sent_count,failed_count from public.message_campaigns where id=$1`,
    [campaignId]
  );
  const result = campaign.rows[0];
  if (result?.status !== 'partial' || result.sent_count !== 1 || result.failed_count !== 1) {
    throw new Error(`Concurrent finalization mismatch: ${JSON.stringify(result)}`);
  }

  console.log('communications concurrency: 20 opens; campaign partial 1/1');
} finally {
  await pool.query(`delete from public.companies where id=$1`, [companyId]).catch(() => undefined);
  await pool.end();
}

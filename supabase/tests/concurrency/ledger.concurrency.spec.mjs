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

const pool = new Pool({ connectionString: localDatabaseUrl(), max: 3 });
const companyId = crypto.randomUUID();
const companyCode = `ledger-concurrency-${companyId}`;
const lines = [
  { account_code: 'EXPENSES', debit: 10 },
  { account_code: 'BALANCE_ADJUSTMENT', credit: 10 },
];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const poster = await pool.connect();
const closer = await pool.connect();
let blockedPost = null;

try {
  await pool.query(
    `insert into public.companies(id,code,name,status)
     values($1,$2,'Ledger concurrency test','approved')`,
    [companyId, companyCode]
  );
  await pool.query(
    `insert into public.ledger_accounts(company_id,code,name,type,is_system)
     values($1,'EXPENSES','Expenses','expense',true),
           ($1,'BALANCE_ADJUSTMENT','Balance adjustment','equity',true)`,
    [companyId]
  );

  // A successful post must retain the shared company lock until its transaction
  // commits, preventing the first close from overtaking the new journal.
  await poster.query('begin');
  await poster.query(
    `select public.post_journal_entry($1,'ConcurrencyTest','source-before-close',
      'Post before close',$2::jsonb,current_date)`,
    [companyId, JSON.stringify(lines)]
  );
  const lockProbe = await closer.query(
    `select pg_try_advisory_xact_lock(hashtextextended($1::text,0)) as acquired`,
    [companyId]
  );
  if (lockProbe.rows[0]?.acquired !== false) {
    throw new Error('Period close lock overtook an uncommitted journal post');
  }
  await poster.query('commit');

  // Simulate the close critical section with the same exclusive lock. A new
  // post must wait, then re-read the committed period row and fail.
  await closer.query('begin');
  await closer.query(`select pg_advisory_xact_lock(hashtextextended($1::text,0))`, [companyId]);

  let postSettled = false;
  blockedPost = poster
    .query(
      `select public.post_journal_entry($1,'ConcurrencyTest','source-after-close',
        'Post after close',$2::jsonb,current_date)`,
      [companyId, JSON.stringify(lines)]
    )
    .then(
      result => {
        postSettled = true;
        return result;
      },
      error => {
        postSettled = true;
        throw error;
      }
    );

  await delay(150);
  if (postSettled) throw new Error('Journal post did not wait for the period close lock');

  await closer.query(
    `insert into public.period_locks(company_id,lock_end_date) values($1,current_date)`,
    [companyId]
  );
  await closer.query('commit');

  try {
    await blockedPost;
    throw new Error('Journal post succeeded after the closing transaction committed');
  } catch (error) {
    if (!String(error.message).includes('period_locked:')) throw error;
  }

  console.log('ledger concurrency: post blocks close; close blocks backdated post');
} finally {
  await closer.query('rollback').catch(() => undefined);
  if (blockedPost) await blockedPost.catch(() => undefined);
  await poster.query('rollback').catch(() => undefined);
  try {
    await closer.query('begin');
    await closer.query(`select set_config('app.allow_ledger_mutation','on',true)`);
    await closer.query(`delete from public.companies where id=$1`, [companyId]);
    await closer.query('commit');
  } catch {
    await closer.query('rollback').catch(() => undefined);
  }
  poster.release();
  closer.release();
  await pool.end();
}

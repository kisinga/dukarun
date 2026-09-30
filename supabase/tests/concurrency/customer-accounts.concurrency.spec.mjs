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
    await client.query(`set local statement_timeout='10s'`);
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
  // Financial posting requires a session even when cash control is disabled.
  await asUser(clients[0], 'select testkit.ensure_open_session() result');
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

  // Refunds and collections must serialize on the invoice, without acquiring
  // customer/order locks in opposite orders. Either winner preserves all money.
  for (const mode of ['collection', 'reversal']) {
    const customerId = crypto.randomUUID();
    await pool.query(
      `insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
       values($1,$2,'Refund race',true,1000)`,
      [customerId, companyId]
    );
    const sale = await asUser(
      clients[0],
      `select public.post_sale_at_location(null,$1,$2::jsonb,'[]'::jsonb,false,$3) result`,
      [
        customerId,
        JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 100 }]),
        `refund-${mode}-${companyId}`,
      ]
    );
    const funding = await receipt(
      clients[0],
      customerId,
      40,
      `refund-funding-${mode}-${companyId}`
    );
    const results = await Promise.allSettled([
      asUser(
        clients[0],
        `select public.post_full_refund($1,'cash','Race test','write_off') result`,
        [sale.order_id]
      ),
      mode === 'collection'
        ? receipt(clients[1], customerId, 60, `refund-collection-${companyId}`)
        : asUser(
            clients[1],
            `select public.post_customer_receipt_reversal($1,'Race test') result`,
            [funding.receipt_id]
          ),
    ]);
    if (results[0].status !== 'fulfilled') throw results[0].reason;
    if (
      results[1].status === 'rejected' &&
      (mode !== 'reversal' || !results[1].reason.message.includes('refunded_order'))
    ) {
      throw results[1].reason;
    }
    const checked = await pool.query(
      `select public.order_receivable_ledger_balance_core($1) due,
         (select downpayment_balance from public.customer_account_balances
           where customer_id=$2 and company_id=$3) deposit,
         (select coalesce(sum(l.credit-l.debit),0) from public.ledger_journal_lines l
           join public.ledger_journal_entries e on e.id=l.entry_id
           join public.ledger_accounts a on a.id=l.account_id
           where l.order_id=$1 and e.source_type='Refund' and a.code='CASH_ON_HAND') payout`,
      [sale.order_id, customerId, companyId]
    );
    const actual = checked.rows[0];
    const expected = mode === 'collection' ? 100 : results[1].status === 'fulfilled' ? 0 : 40;
    if (Number(actual.due) !== 0 || Number(actual.payout) + Number(actual.deposit) !== expected) {
      throw new Error(`Refund ${mode} race diverged: ${JSON.stringify(actual)}`);
    }
    const duplicate = await asUser(
      clients[0],
      `select public.post_full_refund($1,'cash','Duplicate','write_off') result`,
      [sale.order_id]
    ).then(
      () => null,
      error => error
    );
    if (!duplicate?.message.includes('sale_already_refunded')) {
      throw new Error('Duplicate credit note was not rejected');
    }
  }

  // Force each side to win instead of relying on scheduler timing. The waiter
  // must block before taking any order/payment/application lock needed by the
  // winner; otherwise the second RPC reproduces the old lock inversion.
  for (const mode of ['allocation', 'deposit', 'payment-reversal', 'deposit-reversal']) {
    for (const winner of ['refund', 'operation']) {
      const customerId = crypto.randomUUID();
      await pool.query(
        `insert into public.customers(id,company_id,first_name,is_credit_approved,credit_limit)
         values($1,$2,'Deterministic refund race',true,1000)`,
        [customerId, companyId]
      );
      const sale = await asUser(
        clients[0],
        `select public.post_sale_at_location(null,$1,$2::jsonb,'[]'::jsonb,false,$3) result`,
        [
          customerId,
          JSON.stringify([{ variant_id: variantId, quantity: 1, unit_price: 100 }]),
          `lock-${mode}-${winner}-${companyId}`,
        ]
      );
      let paymentId;
      let applicationId;
      if (mode.startsWith('deposit')) {
        await asUser(clients[0], `select public.record_customer_deposit($1,100,'cash') result`, [
          customerId,
        ]);
        if (mode === 'deposit-reversal') {
          applicationId = await asUser(
            clients[0],
            `select public.apply_customer_deposit($1,40,$2) result`,
            [sale.order_id, `seed-${customerId}`]
          );
        }
      } else {
        paymentId = await asUser(
          clients[0],
          `select public.post_payment_allocation($1,40,'cash') result`,
          [sale.order_id]
        );
      }
      const refund = [
        `select public.post_full_refund($1,'cash','Lock order test','write_off') result`,
        [sale.order_id],
      ];
      const operation =
        mode === 'allocation'
          ? [`select public.post_payment_allocation($1,10,'cash') result`, [sale.order_id]]
          : mode === 'deposit'
            ? [
                `select public.apply_customer_deposit($1,10,$2) result`,
                [sale.order_id, `apply-${customerId}`],
              ]
            : mode === 'payment-reversal'
              ? [`select public.post_payment_reversal($1,'Lock order test') result`, [paymentId]]
              : [
                  `select public.reverse_customer_deposit_application($1,'Lock order test') result`,
                  [applicationId],
                ];
      const first = winner === 'refund' ? refund : operation;
      const second = winner === 'refund' ? operation : refund;
      const holder = clients[0];
      const waiter = clients[1];
      const holderPid = (await holder.query('select pg_backend_pid() pid')).rows[0].pid;
      const waiterPid = (await waiter.query('select pg_backend_pid() pid')).rows[0].pid;
      let pending;
      let result;
      try {
        await holder.query('begin');
        await holder.query(`set local statement_timeout='10s'`);
        await holder.query(`select set_config('request.jwt.claims',$1,true)`, [claims()]);
        // This is the actual production lock helper; only the deterministic
        // barrier needs owner privileges. Both business RPCs run authenticated.
        await holder.query('select public.lock_receivable_order_customer($1)', [sale.order_id]);
        await holder.query('set local role authenticated');
        pending = asUser(waiter, ...second).then(
          value => ({ value }),
          error => ({ error })
        );
        const deadline = Date.now() + 3000;
        while (true) {
          const blocked = await pool.query('select $1=any(pg_blocking_pids($2)) blocked', [
            holderPid,
            waiterPid,
          ]);
          if (blocked.rows[0].blocked) break;
          if (Date.now() >= deadline)
            throw new Error(`${mode}: contender never reached lock barrier`);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await holder.query(...first);
        await holder.query('commit');
        result = await pending;
      } finally {
        await holder.query('rollback');
        if (pending) await pending;
      }
      if (winner === 'operation' && result.error) throw result.error;
      if (winner === 'refund') {
        const expected = mode.endsWith('reversal') ? 'refunded_order' : 'ar_overpayment';
        if (!result.error?.message.includes(expected)) {
          throw new Error(
            `${mode}: expected ${expected}, got ${result.error?.message ?? 'success'}`
          );
        }
      }
      const checked = (
        await pool.query(
          `select public.order_receivable_ledger_balance_core($1) due,
           (select net_balance from public.customer_account_balances where customer_id=$2) net,
           (select downpayment_balance from public.customer_account_balances where customer_id=$2) deposit,
           (select coalesce(sum(l.credit-l.debit),0) from public.ledger_journal_lines l
             join public.ledger_journal_entries e on e.id=l.entry_id
             join public.ledger_accounts a on a.id=l.account_id
             where l.order_id=$1 and e.source_type='Refund' and a.code='CASH_ON_HAND') payout`,
          [sale.order_id, customerId]
        )
      ).rows[0];
      const expectedMoney = mode.startsWith('deposit')
        ? 100
        : mode === 'allocation' && winner === 'operation'
          ? 50
          : mode === 'payment-reversal' && winner === 'operation'
            ? 0
            : 40;
      if (
        Number(checked.due) !== 0 ||
        Number(checked.net) !== -Number(checked.deposit) ||
        Number(checked.payout) + Number(checked.deposit) !== expectedMoney
      ) {
        throw new Error(`${mode}/${winner}: money diverged: ${JSON.stringify(checked)}`);
      }
    }
  }

  console.log(
    'customer account concurrency: receipts, sales, refunds, allocations, deposits, and reversals serialized'
  );
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

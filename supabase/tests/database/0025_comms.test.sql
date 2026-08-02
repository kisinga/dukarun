-- Comms tests (migration 0025): notifications, outbox quiet-hours + metering,
-- credit reminder dedupe, batch messaging.
begin;
select plan(10);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@comms.local');
create temp table cm_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Comms Co') as company_id;
grant select on pg_temp.cm_company to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Tea' from cm_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price, track_inventory)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Box', 'TEA1', 10000, false from cm_company;
insert into public.customers (id, company_id, first_name, phone, is_credit_approved, credit_limit)
select 'c0000000-0000-0000-0000-0000000000aa', company_id, 'Owing Jane', '0711000000', true, 0 from cm_company;

select testkit.as_user((select company_id from cm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. In-app notification lands and is member-readable.
reset role;
select public.notify((select company_id from cm_company), 'system', 'Hello', 'Body', '/dashboard');
select testkit.as_user((select company_id from cm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select is(
  (select count(*)::int from public.notifications where company_id = (select company_id from cm_company)),
  1,
  'in-app notification created and readable'
);

-- 2. Mark read via the column-limited grant.
update public.notifications set read_at = now() where company_id = (select company_id from cm_company);

select ok(
  (select read_at is not null from public.notifications where company_id = (select company_id from cm_company)),
  'member marks notification read'
);

-- 3. SMS queued immediately (within window-agnostic channel).
reset role;
select public.queue_message((select company_id from cm_company), 'sms', '0711000000', 'test');

select is(
  (select status from public.outbox where company_id = (select company_id from cm_company) and channel = 'sms'),
  'pending',
  'sms queued pending'
);

-- 4. WhatsApp quiet-hours: scheduled_after always lands in the 08:00-19:00
--    EAT window (immediate when inside, deferred to 08:00 when outside).
reset role;
select public.queue_message((select company_id from cm_company), 'whatsapp', '254711000000', 'hi');

select ok(
  (select extract(hour from scheduled_after at time zone 'Africa/Nairobi')::int between 8 and 18
   from public.outbox
   where company_id = (select company_id from cm_company) and channel = 'whatsapp'),
  'whatsapp message scheduled within the 08:00-19:00 EAT window'
);

-- 5. SMS metering: tier with smsPerPeriod=1 blocks the second.
reset role;
update public.subscription_tiers set limits = '{"smsPerPeriod": 1}' where code = 'trial';
update public.companies set sms_used_this_period = 1,
  subscription_tier_id = (select id from public.subscription_tiers where code = 'trial')
where id = (select company_id from cm_company);

select throws_ok(
  format($$select public.queue_message('%s', 'sms', '0711000000', 'over the cap')$$, (select company_id from cm_company)),
  'P0001', 'sms_limit_reached: 1 of 1 used this period',
  'sms cap enforced at the tier limit'
);

-- restore headroom for later tests
update public.companies set sms_used_this_period = 0 where id = (select company_id from cm_company);
update public.subscription_tiers set limits = '{"smsPerPeriod": 50, "maxAdmins": 1, "maxProducts": 100, "maxStockLocations": 1, "maxOrdersPerMonth": 500}' where code = 'trial';

-- 6-8. Credit reminders: overdue customer gets notified once, deduped on rerun.
-- Create a 10-day-old credit sale (bucket 8-30).
select testkit.as_user((select company_id from cm_company), '11111111-1111-1111-1111-111111111111', 'Admin');
create temp table cm_sale as
select public.post_sale('c0000000-0000-0000-0000-0000000000aa',
  '[{"variant_id":"aa000000-0000-0000-0000-0000000000aa","quantity":1,"unit_price":10000}]', '[]') as order_id;

reset role;
update public.ledger_journal_entries set entry_date = entry_date - 10
where source_id = (select order_id::text from cm_sale) and source_type = 'CreditSale';

select public.credit_reminder_scan();

select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from cm_company) and type = 'credit_reminder'),
  1,
  'credit reminder notification created'
);

select is(
  (select count(*)::int from public.outbox
   where company_id = (select company_id from cm_company) and channel = 'sms' and status = 'pending'),
  2, -- the earlier test sms + this reminder
  'credit reminder SMS queued to the customer'
);

select public.credit_reminder_scan();

select is(
  (select count(*)::int from public.notifications
   where company_id = (select company_id from cm_company) and type = 'credit_reminder'),
  1,
  'rerun within 10 days is deduped (checkpoint)'
);

-- 9. Batch messaging to all customers.
select testkit.as_user((select company_id from cm_company), '11111111-1111-1111-1111-111111111111', 'Admin');

create temp table batch_result as
select public.queue_batch_message('whatsapp', 'Shop closed on Madaraka day') as queued;

select is(
  (select queued from batch_result),
  1,
  'batch message expanded to the one customer with a phone'
);

-- 10. Global invariant still holds after all this.
select is(
  (select sum(debit) - sum(credit) from public.ledger_journal_lines),
  0::numeric,
  'global invariant: debits = credits'
);

select * from finish();
rollback;

begin;
select plan(11);

select testkit.create_user('49494949-4949-4949-4949-494949494949', 'proforma-expiry@test.local');
select testkit.create_user('50505050-5050-5050-5050-505050505050', 'other-expiry@test.local');

create temp table expiry_companies as
select testkit.provision('49494949-4949-4949-4949-494949494949', 'Expiry Co') company_id,
       testkit.provision('50505050-5050-5050-5050-505050505050', 'Other Expiry Co') other_company_id;
grant select on pg_temp.expiry_companies to authenticated;

-- Member-side settings edits require an approved company.
update public.companies set status = 'approved'
where id = (select company_id from expiry_companies);

select testkit.as_user(
  (select company_id from expiry_companies),
  '49494949-4949-4949-4949-494949494949',
  'Admin'
);

select is(
  (select proforma_validity_days from public.companies
   where id = (select company_id from expiry_companies)),
  30,
  'proformas default to 30 days of validity'
);

create temp table expiry_product as
select public.create_catalog_product(
  'Quoted item',
  '[{"name":"Each","price":10000,"wholesale_price":8000}]'
) product_id;
grant select on pg_temp.expiry_product to authenticated;

create temp table expiry_variant as
select id variant_id from public.product_variants
where product_id = (select product_id from expiry_product);
grant select on pg_temp.expiry_variant to authenticated;

create temp table thirty_day_draft as
select public.save_draft(null, jsonb_build_array(jsonb_build_object(
  'variant_id', (select variant_id from expiry_variant),
  'quantity', 1,
  'unit_price', 10000
))) order_id;
grant select on pg_temp.thirty_day_draft to authenticated;

select is(
  (select expires_at - created_at from public.orders
   where id = (select order_id from thirty_day_draft)),
  interval '30 days',
  'new proforma receives the configured validity window'
);

select lives_ok(
  $$update public.companies set proforma_validity_days = 7
    where id = public.current_company_id()$$,
  'company members can edit proforma validity'
);

create temp table seven_day_draft as
select public.save_draft(null, jsonb_build_array(jsonb_build_object(
  'variant_id', (select variant_id from expiry_variant),
  'quantity', 1,
  'unit_price', 10000
))) order_id;
grant select on pg_temp.seven_day_draft to authenticated;

select is(
  (select expires_at - created_at from public.orders
   where id = (select order_id from seven_day_draft)),
  interval '7 days',
  'edited validity applies to newly created proformas'
);

reset role;
update public.orders
set expires_at = now() - interval '1 minute'
where id = (select order_id from thirty_day_draft);

insert into public.orders (
  company_id, code, customer_id, status, created_by, expires_at
)
select other_company_id, 'SO-OTHER-EXPIRED', null, 'draft',
       '50505050-5050-5050-5050-505050505050', now() - interval '1 minute'
from expiry_companies;

select throws_ok(
  format(
    'update public.orders set status = ''completed'' where id = %L::uuid',
    (select order_id from thirty_day_draft)
  ),
  'P0001',
  format(
    'proforma_expired: %s expired at %s',
    (select order_id from thirty_day_draft),
    (select expires_at from public.orders where id = (select order_id from thirty_day_draft))
  ),
  'an expired proforma cannot transition to a sale before a sweep'
);

select testkit.as_user(
  (select company_id from expiry_companies),
  '49494949-4949-4949-4949-494949494949',
  'Admin'
);

select is(public.expire_proformas(), 1, 'expiry sweep marks one due proforma');
select is(
  (select status from public.orders where id = (select order_id from thirty_day_draft)),
  'expired',
  'past-due unconverted proforma is marked expired'
);
select is(
  (select count(*)::integer from public.orders
   where company_id = (select company_id from expiry_companies)
     and status = 'draft'
     and expires_at > now()),
  1,
  'only active proformas remain in the actionable count'
);
select is(
  (select status from public.orders where code = 'SO-OTHER-EXPIRED'),
  null,
  'another tenant proforma is hidden by RLS'
);

select is(
  public.delete_proforma((select order_id from thirty_day_draft)),
  (select order_id from thirty_day_draft),
  'expired proformas remain deletable'
);
select is(
  (select count(*)::integer from public.orders
   where id = (select order_id from thirty_day_draft)),
  0,
  'deleted expired proforma is removed'
);

select * from finish();
rollback;

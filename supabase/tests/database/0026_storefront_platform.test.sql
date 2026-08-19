-- Storefront + platform tests (migration 0026).
begin;
select plan(23);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@sf.local');
select testkit.create_user('99999999-9999-9999-9999-999999999999', 'root@sf.local');
create temp table sf_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'SF Co') as company_id;
grant select on pg_temp.sf_company to authenticated;

reset role;
insert into public.platform_admins (user_id) values ('99999999-9999-9999-9999-999999999999');

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Tea' from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000aa', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Box', 'TEA1', 10000 from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000ac', 'a0000000-0000-0000-0000-0000000000aa', company_id, 'Case', 'TEA2', 15000 from sf_company;
insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Coffee' from sf_company;
insert into public.product_variants (id, product_id, company_id, name, sku, price)
select 'aa000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-0000000000ab', company_id, 'Bag', 'COFFEE1', 20000 from sf_company;

-- Company starts unapproved: invisible in the directory.
update public.companies
set status = 'unapproved', public_storefront_enabled = true, public_slug = 'sf-co'
where id = (select company_id from sf_company);

-- 1. Anon sees nothing while unapproved.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.public_storefronts where slug = 'sf-co'),
  0,
  'unapproved storefront hidden from anon'
);

-- 2. Approved + trial: visible with catalogue.
reset role;
update public.companies set status = 'approved' where id = (select company_id from sf_company);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select catalogue_visible from public.public_storefronts where slug = 'sf-co'),
  true,
  'approved trial storefront visible with catalogue'
);

select ok(
  (select count(*) from public.storefront_catalog_page('sf-co')) > 0,
  'paged catalog returns variants for the slug'
);

select is(
  (select total_count from public.storefront_catalog_page('sf-co', 'Tea') limit 1),
  1::bigint,
  'paged catalog searches and counts product families'
);

select is(
  (select bool_and(available) from public.storefront_product(
    'sf-co', 'a0000000-0000-0000-0000-0000000000aa'
  )),
  false,
  'public product reports tracked variants without stock as unavailable'
);

select throws_ok(
  $$select * from public.storefront_catalog_page('sf-co', null, null, 49, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'storefront page size is bounded'
);

select throws_ok(
  $$select * from public.storefront_catalog_page('sf-co', null, null, null, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'storefront page size cannot bypass bounds with null'
);

select is(
  public.storefront_page('sf-co', null, null, 1, 0) #>> '{storefront,slug}',
  'sf-co',
  'page-shaped storefront read includes shop identity'
);
select is(
  jsonb_array_length(public.storefront_page('sf-co', null, null, 1, 0) -> 'rows'),
  1,
  'page-shaped storefront read returns one bounded product family'
);
select is(
  (public.storefront_page('sf-co', null, null, 1, 0) ->> 'hasMore')::boolean,
  true,
  'storefront pagination detects a next page without an exact count'
);
select is(
  public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,product_name}',
  'Tea',
  'storefront search uses the catalog search projection'
);
select is(
  (public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,variant_count}')::integer,
  2,
  'storefront list returns one product summary with its option count'
);
select is(
  (public.storefront_page('sf-co', 'TEA1', null, 12, 0) #>> '{rows,0,max_price}')::bigint,
  15000::bigint,
  'storefront product summary retains the full variant price range'
);
select throws_ok(
  $$select public.storefront_page('sf-co', null, null, 49, 0)$$,
  'P0001', 'invalid_storefront_page_size',
  'page-shaped storefront reads remain bounded'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public'
    and indexname='products_storefront_page_idx'),
  'storefront product ordering has a supporting index'
);

-- 4. Lapsed subscription: identity stays, catalogue hides.
reset role;
update public.companies
set subscription_status = 'expired', subscription_grace_period_end = now() - interval '1 day'
where id = (select company_id from sf_company);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select catalogue_visible from public.public_storefronts where slug = 'sf-co'),
  false,
  'lapsed subscription hides the catalogue'
);

select ok(
  (select count(*) from public.public_storefronts where slug = 'sf-co') = 1,
  'lapsed storefront identity still listed'
);

-- 5. Catalog function returns nothing for lapsed.
select is(
  (select count(*)::int from public.storefront_catalog_page('sf-co')),
  0,
  'catalog empty when lapsed'
);

-- 6-8. Platform RPCs.
reset role;
select testkit.as_user((select company_id from sf_company), '99999999-9999-9999-9999-999999999999', 'Admin');
-- claims for platform admin need the flag: build manually
select set_config('request.jwt.claims', format('{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated","is_platform_admin":true}'), true);

select lives_ok(
  format($$select public.platform_set_company_status('%s', 'disabled')$$, (select company_id from sf_company)),
  'platform admin disables a company'
);

select is(
  (select status from public.companies where id = (select company_id from sf_company)),
  'disabled',
  'status updated'
);

select ok(
  (public.platform_stats() ->> 'companies_total')::int >= 1,
  'platform_stats returns counts'
);

-- 9-10. Non-platform users are rejected.
select testkit.as_user((select company_id from sf_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select throws_ok(
  format($$select public.platform_set_company_status('%s', 'approved')$$, (select company_id from sf_company)),
  'P0001', 'platform_admin_required',
  'regular admin cannot call platform RPCs'
);

select throws_ok(
  $$select public.platform_stats()$$,
  'P0001', 'platform_admin_required',
  'regular admin cannot read platform stats'
);

select * from finish();
rollback;

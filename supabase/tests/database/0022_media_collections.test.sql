-- Collections tests (migration 0022). Storage policies verified separately
-- against the API (see notes), table/RPC logic here.
begin;
select plan(7);

select testkit.create_user('11111111-1111-1111-1111-111111111111', 'admin@col.local');
select testkit.create_user('22222222-2222-2222-2222-222222222222', 'other@col.local');
create temp table col_company as
select testkit.provision('11111111-1111-1111-1111-111111111111', 'Col Co') as company_id;
grant select on pg_temp.col_company to authenticated;
create temp table col_company2 as
select testkit.provision('22222222-2222-2222-2222-222222222222', 'Other Co') as company_id2;
grant select on pg_temp.col_company2 to authenticated;

insert into public.products (id, company_id, name)
select 'a0000000-0000-0000-0000-0000000000d1', company_id, 'Tea' from col_company;

select testkit.as_user((select company_id from col_company), '11111111-1111-1111-1111-111111111111', 'Admin');

-- 1. Create with auto-slug.
create temp table col1 as
select public.upsert_collection('Herbal Teas') as id;

select is(
  (select slug from public.collections where id = (select id from col1)),
  'herbal-teas',
  'collection created with auto-slug'
);

-- 2. Update.
select public.upsert_collection('Herbal & Specialty', null, 'All herbal ranges', (select id from col1));

select is(
  (select name from public.collections where id = (select id from col1)),
  'Herbal & Specialty',
  'collection updated'
);

-- 3-4. Assign + replace product collections.
select public.set_product_collections('a0000000-0000-0000-0000-0000000000d1', array[(select id from col1)]);

select is(
  (select count(*)::int from public.product_collections where product_id = 'a0000000-0000-0000-0000-0000000000d1'),
  1,
  'product assigned to collection'
);

create temp table col2 as
select public.upsert_collection('Premium') as id;

select public.set_product_collections('a0000000-0000-0000-0000-0000000000d1', array[(select id from col2)]);

select is(
  (select collection_id from public.product_collections where product_id = 'a0000000-0000-0000-0000-0000000000d1'),
  (select id from col2),
  'assignment replaces previous collections'
);

-- 5. Cross-tenant collection can't be assigned.
select public.set_product_collections('a0000000-0000-0000-0000-0000000000d1', array[]::uuid[]);
reset role;
insert into public.collections (id, company_id, name, slug)
select 'cc000000-0000-0000-0000-0000000000d9', company_id2, 'Foreign', 'foreign' from col_company2;
select testkit.as_user((select company_id from col_company), '11111111-1111-1111-1111-111111111111', 'Admin');

select public.set_product_collections('a0000000-0000-0000-0000-0000000000d1', array['cc000000-0000-0000-0000-0000000000d9']::uuid[]);

select is(
  (select count(*)::int from public.product_collections where product_id = 'a0000000-0000-0000-0000-0000000000d1'),
  0,
  'cross-tenant collection assignment silently ignored (no leak)'
);

-- 6. RLS: other tenant cannot see collections.
select testkit.as_user((select company_id2 from col_company2), '22222222-2222-2222-2222-222222222222', 'Admin');

select is(
  (select count(*)::int from public.collections where id = (select id from col1)),
  0,
  'tenant B cannot see tenant A collections'
);

-- 7. Storage bucket exists and is public.
reset role;
select is(
  (select public from storage.buckets where id = 'product-images'),
  true,
  'product-images bucket exists and is public'
);

select * from finish();
rollback;

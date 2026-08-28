begin;
select plan(14);

select testkit.create_user('71717171-7171-4717-8717-717171717171', 'image-admin@local.test');
select testkit.create_user('72727272-7272-4727-8727-727272727272', 'image-viewer@local.test');
select testkit.create_user('73737373-7373-4737-8737-737373737373', 'image-other@local.test');

create temp table image_companies as
select
  testkit.provision('71717171-7171-4717-8717-717171717171', 'Image Company') company_id,
  testkit.provision('73737373-7373-4737-8737-737373737373', 'Other Image Company') other_company_id;
grant select on pg_temp.image_companies to authenticated;

select testkit.add_member(
  (select company_id from image_companies),
  '72727272-7272-4727-8727-727272727272',
  'Image Viewer', array['SettleOrder']
);

reset role;
insert into public.products(id, company_id, name) values
  ('71000000-0000-4000-8000-000000000001', (select company_id from image_companies), 'Local Product'),
  ('71000000-0000-4000-8000-000000000002', (select other_company_id from image_companies), 'Foreign Product');

create temp table image_paths as
select
  company_id::text || '/71111111-1111-4111-8111-111111111111.webp' first_path,
  company_id::text || '/72222222-2222-4222-8222-222222222222.jpg' second_path
from image_companies;
grant select on pg_temp.image_paths to authenticated;

select ok(
  to_regprocedure('public.set_product_image(uuid,text,text)') is not null,
  'guarded product image mutation exists'
);
select is(
  (select file_size_limit from storage.buckets where id = 'product-images'),
  5242880::bigint,
  'product images are limited to 5 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'product-images'),
  array['image/jpeg', 'image/png', 'image/webp']::text[],
  'product image MIME types are constrained'
);

select testkit.as_user(
  (select company_id from image_companies),
  '71717171-7171-4717-8717-717171717171', 'Admin'
);

select is(
  public.set_product_image(
    '71000000-0000-4000-8000-000000000001',
    (select first_path from image_paths),
    null
  ),
  null::text,
  'first image assignment returns the previous null path'
);
select is(
  (select image_path from public.products where id = '71000000-0000-4000-8000-000000000001'),
  (select first_path from image_paths),
  'first image assignment stores the path'
);
select throws_ok(
  format(
    $$select public.set_product_image('71000000-0000-4000-8000-000000000001', %L, null)$$,
    (select second_path from image_paths)
  ),
  'P0001', 'product_image_conflict',
  'a stale editor cannot replace a newer photo'
);
select is(
  (select image_path from public.products where id = '71000000-0000-4000-8000-000000000001'),
  (select first_path from image_paths),
  'a rejected stale replacement leaves the current path intact'
);
select throws_ok(
  $$select public.set_product_image(
    '71000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000000/73333333-3333-4333-8333-333333333333.webp',
    null
  )$$,
  'P0001', 'invalid_product_image_path',
  'another company path is rejected'
);
select throws_ok(
  format(
    $$select public.set_product_image('71000000-0000-4000-8000-000000000001', %L, null)$$,
    (select replace(second_path, '.jpg', '.svg') from image_paths)
  ),
  'P0001', 'invalid_product_image_path',
  'unsupported image extensions are rejected'
);
select is(
  public.set_product_image(
    '71000000-0000-4000-8000-000000000001',
    null,
    (select first_path from image_paths)
  ),
  (select first_path from image_paths),
  'removal returns the previous path'
);
select is(
  (select image_path from public.products where id = '71000000-0000-4000-8000-000000000001'),
  null::text,
  'removal stores SQL null'
);
select throws_ok(
  $$select public.set_product_image('71000000-0000-4000-8000-000000000002', null, null)$$,
  'P0001', 'product_not_found: 71000000-0000-4000-8000-000000000002',
  'foreign products are not exposed'
);

select testkit.as_user(
  (select company_id from image_companies),
  '72727272-7272-4727-8727-727272727272', 'Image Viewer'
);
select throws_ok(
  $$select public.set_product_image('71000000-0000-4000-8000-000000000001', null, null)$$,
  'P0001', 'permission_denied: ManageStockAdjustments required',
  'catalog viewers cannot mutate product images'
);

reset role;
select is(
  has_function_privilege('anon', 'public.set_product_image(uuid,text,text)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the image mutation'
);

select * from finish();
rollback;
